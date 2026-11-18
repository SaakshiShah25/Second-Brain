// Render every page graphic: node render-graphics.mjs [id-filter...]
//   thumbnails → out/thumbnails/*.jpg   image posts → out/images/*.png
//   carousels  → out/carousels/*.pdf (+ one PNG per slide)   page assets → out/page-assets/*.png
import { chromium } from 'playwright-core';
import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from '../serve.mjs';
import { graphics } from './graphics/defs.js';

const OUT = fileURLToPath(new URL('./out/', import.meta.url));
const filters = process.argv.slice(2);
const list = graphics.filter(g => !filters.length || filters.some(f => g.id.includes(f)));

const server = await startServer(0);
const base = `http://localhost:${server.address().port}/page/graphics/graphics.html`;
const browser = await chromium.launch({ channel: 'chrome', args: ['--font-render-hinting=none'] });

for (const g of list) {
  const page = await browser.newPage({ viewport: { width: g.w, height: g.h }, deviceScaleFactor: g.w < 600 ? 1 : 1 });
  const isDeck = g.pages.length > 1;
  for (let i = 0; i < g.pages.length; i++) {
    await page.goto(`${base}?g=${g.id}&p=${i}`);
    await page.waitForFunction(() => window.__ready === true, null, { timeout: 60000 });
    const file = OUT + (isDeck ? `${g.out}/slide-${i + 1}.png` : g.out);
    await mkdir(dirname(file), { recursive: true });
    const jpg = file.endsWith('.jpg');
    await page.screenshot({ path: file, type: jpg ? 'jpeg' : 'png', ...(jpg ? { quality: 90 } : {}), clip: { x: 0, y: 0, width: g.w, height: g.h } });
  }
  if (isDeck) {
    await page.goto(`${base}?g=${g.id}&all=1`);
    await page.waitForFunction(() => window.__ready === true, null, { timeout: 60000 });
    await page.pdf({ path: `${OUT}${g.out}.pdf`, width: `${g.w}px`, height: `${g.h}px`, printBackground: true, pageRanges: `1-${g.pages.length}` });
  }
  await page.close();
  console.log(`${g.id} → out/${g.out}${isDeck ? ` (${g.pages.length} slides + PDF)` : ''}`);
}

await browser.close();
server.close();
