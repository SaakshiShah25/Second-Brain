// Screenshots of the REAL MyConfía frontend (vite dev server) with staged demo data.
// No real account or backend is touched: Supabase auth and every /api call are answered here.
//   1. cd frontend && npx vite --port 5199
//   2. node capture/shoot.mjs            → capture/shots/*.png
import { chromium } from 'playwright-core';
import { mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { demo } from './demo-data.mjs';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const APP = process.env.APP_URL || 'http://localhost:5199';
const env = await readFile(new URL('../../../frontend/.env.development', import.meta.url), 'utf8');
const SUPA = env.match(/VITE_SUPABASE_URL=(\S+)/)[1].replace(/\/$/, '');
const REF = new URL(SUPA).hostname.split('.')[0];

const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const user = {
  id: '00000000-0000-4000-8000-000000000001', aud: 'authenticated', role: 'authenticated', email: 'aanya@myconfia.app',
  user_metadata: { full_name: 'Aanya', name_prompt_done: true }, app_metadata: { provider: 'email' }, created_at: '2026-10-01T00:00:00Z',
};
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: user.id, aud: 'authenticated', role: 'authenticated', email: user.email, exp: 2000000000, user_metadata: user.user_metadata })}.c2ln`;
const session = { access_token: jwt, refresh_token: 'demo', token_type: 'bearer', expires_in: 3600, expires_at: 2000000000, user };

export async function openApp(browser, { theme = 'light', viewport, dpr = 2, chat = null, data: given = null, transcript = '', userName = 'Aanya' }) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: dpr, colorScheme: theme, timezoneId: 'Asia/Kolkata', locale: 'en-IN' });
  await ctx.addInitScript(([k, v, theme]) => {
    localStorage.setItem(k, v);
    localStorage.setItem('confia.theme', theme);
    localStorage.setItem('confia.notifPromptAt', String(Date.now() + 1e12));
    // fixed clock: Saturday 15 Nov 2026, 10:12 AM IST
    const fixed = new Date('2026-11-15T10:12:00+05:30').getTime();
    const RealDate = Date;
    const offset = fixed - RealDate.now();
    class FakeDate extends RealDate { constructor(...a) { super(...(a.length ? a : [RealDate.now() + offset])); } static now() { return RealDate.now() + offset; } }
    window.Date = FakeDate;
  }, [`sb-${REF}-auth-token`, JSON.stringify({ ...session, user: { ...user, email: userName.toLowerCase() + '@myconfia.app', user_metadata: { ...user.user_metadata, full_name: userName } } }), theme]);

  await ctx.grantPermissions(['microphone']).catch(() => {});
  // stand-in for the browser's speech recognition, driven from the take script via window.__say(text)
  await ctx.addInitScript(() => {
    class FakeRec { start() { window.__rec = this; } stop() {} abort() {} addEventListener() {} }
    window.SpeechRecognition = FakeRec; window.webkitSpeechRecognition = FakeRec;
    window.__say = text => window.__rec && window.__rec.onresult && window.__rec.onresult({ resultIndex: 0, results: [Object.assign([{ transcript: text }], { isFinal: false })] });
  });
  const data = given ?? demo(theme);
  const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body), headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
  await ctx.route(`${SUPA}/**`, route => {
    const u = route.request().url();
    if (u.includes('/auth/v1/user')) return json(route, { ...user, email: userName.toLowerCase() + '@myconfia.app', user_metadata: { ...user.user_metadata, full_name: userName } });
    if (u.includes('/auth/v1/settings')) return json(route, { external: { google: true, email: true } });
    if (u.includes('/auth/v1/token')) return json(route, session);
    return json(route, {});
  });
  await ctx.route(u => !u.href.startsWith(APP) && /\/api\/|\/mcp\//.test(u.pathname), async route => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return json(route, {});
    const p = new URL(req.url()).pathname;
    if (p === '/api/chat/stream' && chat) {
      const result = chat(JSON.parse(req.postData() || '{}'), data);
      const body = `event: stage\ndata: "classifying"\n\nevent: stage\ndata: "extracting"\n\nevent: result\ndata: ${JSON.stringify(result)}\n\n`;
      await new Promise(r => setTimeout(r, 900));
      return route.fulfill({ status: 200, contentType: 'text/event-stream', body, headers: { 'access-control-allow-origin': '*' } });
    }
    if (p === '/api/transcribe') return json(route, { transcript });
    const hit = data.routes(p, req.method(), req.postData());
    return json(route, hit ?? {});
  });
  const page = await ctx.newPage();
  page.on('pageerror', e => console.error('  page error:', e.message));
  return { ctx, page };
}

export async function launch() {
  return chromium.launch({ channel: 'chrome', args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
}

// ---------- the shot list ----------
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await mkdir(HERE + 'shots', { recursive: true });
  const browser = await launch();
  const phone = { width: 402, height: 874 };
  const laptop = { width: 1440, height: 900 };
  const only = process.argv[2];
  for (const theme of ['light', 'dark']) {
    for (const [name, vp, path, dpr] of [
      ['phone-home', phone, '/', 3], ['phone-today', phone, '/today', 3], ['phone-notes', phone, '/notes', 3],
      ['laptop-home', laptop, '/', 2], ['laptop-today', laptop, '/today', 2], ['laptop-notes', laptop, '/notes', 2],
    ]) {
      if (only && !name.includes(only)) continue;
      const { ctx, page } = await openApp(browser, { theme, viewport: vp, dpr });
      await page.goto(APP + path);
      await page.waitForTimeout(2500);
      await page.screenshot({ path: `${HERE}shots/${name}-${theme}.png` });
      console.log('shot', name, theme);
      await ctx.close();
    }
  }
  await browser.close();
}
