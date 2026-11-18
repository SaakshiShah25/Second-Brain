// Render videos to MP4 (H.264 + AAC, 1080x1350, 30fps).
//   node render.mjs            → all videos
//   node render.mjs intro web  → just those
//   node render.mjs intro --frames 3,10,14   → stills only (quick visual check, saved to .frames/)
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { writeFile, mkdir, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { startServer } from './serve.mjs';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const FPS = 30;
const FFMPEG = process.env.FFMPEG || '/opt/homebrew/bin/ffmpeg';

const args = process.argv.slice(2);
const fi = args.indexOf('--frames');
const stills = fi >= 0 ? args[fi + 1].split(',').map(Number) : null;
let names = args.filter((a, i) => !a.startsWith('--') && (fi < 0 || i !== fi + 1));
if (!names.length) names = (await readdir(ROOT + 'studio/videos')).filter(f => f.endsWith('.js')).map(f => f.replace('.js', '')).sort();

const server = await startServer(0);
const PORT = server.address().port;
const browser = await chromium.launch({ channel: 'chrome', args: ['--autoplay-policy=no-user-gesture-required', '--font-render-hinting=none'] });
const page = await browser.newPage({ viewport: { width: 1080, height: 1350 }, deviceScaleFactor: 1 });
page.on('pageerror', e => console.error('  page error:', e.message));
page.on('console', m => { if (m.type() === 'error') console.error('  console:', m.text()); });

const run = (cmd, argv, input) => new Promise((res, rej) => {
  const p = spawn(cmd, argv, { stdio: [input ? 'pipe' : 'ignore', 'ignore', 'pipe'] });
  let err = ''; p.stderr.on('data', d => { err += d; });
  p.on('close', c => (c === 0 ? res() : rej(new Error(err.slice(-1500)))));
  if (input) input(p.stdin);
});

await mkdir(ROOT + 'out', { recursive: true });
await mkdir(ROOT + '.frames', { recursive: true });

for (const name of names) {
  const t0 = Date.now();
  await page.goto(`http://localhost:${PORT}/studio/player.html?v=${name}&render=1`);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 30000 });
  await page.evaluate(() => document.fonts.ready);
  const { duration, poster } = await page.evaluate(() => ({ duration: window.__video.duration, poster: window.__video.poster }));

  if (stills) {
    for (const t of stills) {
      await page.evaluate(t => window.__video.seek(t), t);
      await page.screenshot({ path: `${ROOT}.frames/${name}-${t}.jpg`, type: 'jpeg', quality: 85 });
    }
    console.log(`${name}: stills at ${stills.join(', ')}s → .frames/`);
    continue;
  }

  // soundtrack
  const b64 = await page.evaluate(() => window.__video.renderAudio());
  const wav = `${ROOT}.frames/${name}.wav`;
  await writeFile(wav, Buffer.from(b64, 'base64'));

  // frames → ffmpeg
  const frames = Math.round(duration * FPS);
  const out = `${ROOT}out/${String(name)}.mp4`;
  await run(FFMPEG, ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-', '-i', wav,
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '19', '-pix_fmt', 'yuv420p', '-r', String(FPS),
    '-af', 'loudnorm=I=-15:TP=-1.5:LRA=11', '-ar', '48000', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', out], async stdin => {
    for (let f = 0; f < frames; f++) {
      await page.evaluate(t => window.__video.seek(t), f / FPS);
      const buf = await page.screenshot({ type: 'jpeg', quality: 93 });
      if (!stdin.write(buf)) await new Promise(r => stdin.once('drain', r));
      if (f % 150 === 0) process.stdout.write(`\r${name}: ${f}/${frames}`);
    }
    stdin.end();
  });
  await page.evaluate(t => window.__video.seek(t), poster);
  await page.screenshot({ path: `${ROOT}out/${name}.jpg`, type: 'jpeg', quality: 88 });
  console.log(`\r${name}: ${frames} frames, ${duration}s → out/${name}.mp4 (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
}

await browser.close();
server.close();
