// Records interactions in the REAL MyConfía app as numbered frames (capture/takes/<take>/0001.png ...),
// plus a manifest.json with named marks, for the v2 videos to play back inside device frames.
//   node capture/takes.mjs            (all)     node capture/takes.mjs phone-capture   (one)
import { mkdir, rm, writeFile, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { launch, openApp } from './shoot.mjs';
import { demo, makeData } from './demo-data.mjs';
import { PERSONAS } from './personas.mjs';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const APP = process.env.APP_URL || 'http://localhost:5199';
const PHONE = { width: 402, height: 874 };
const LAPTOP = { width: 1440, height: 900 };
const D = '2026-11-15', TOMORROW = '2026-11-16';

// ---------- what the chat answers ----------
const CAPTURE_SAID = 'CEO meeting tomorrow 9am, prep the deck tonight. Buy a toy for Aarav, call Mom at 7, 1 kg veggies, gym at 6.';
const CAPTURE_TASKS = ['Meet the CEO', 'Prep the CEO deck', 'Buy a toy for Aarav', 'Call Mom', 'Gym'];
function captureResult(data) {
  const part = (initiative_id, initiative_name, summary, tasks, extra = {}) => ({
    interaction_id: initiative_id * 1000, note_saved: true, initiative_id, initiative_name, suggested_initiative: null, summary,
    tasks_created: tasks.map((t, i) => ({ id: 900 + initiative_id * 10 + i, owner: 'me', due_date: null, due_time: null, ...t })),
    skipped_due_dates: [], decisions: [], concerns: [], ...extra,
  });
  const parts = [
    part(1, 'Work', 'CEO meeting tomorrow at 9 AM; the deck gets prepped tonight.', [
      { description: 'Meet the CEO', due_date: TOMORROW, due_time: '09:00' }, { description: 'Prep the CEO deck', due_date: D, due_time: '20:00' }]),
    part(2, 'Family', 'A toy for Aarav, and a call to Mom this evening.', [
      { description: 'Buy a toy for Aarav' }, { description: 'Call Mom', due_date: D, due_time: '19:00' }]),
    part(3, 'Home', '', [{ description: '1 kg vegetables', list_id: 11, list_name: 'Groceries', list_emoji: '🥦' }], { interaction_id: null, note_saved: false }),
    part(4, 'Health', 'Gym at 6 this evening.', [{ description: 'Gym', due_date: D, due_time: '18:00' }]),
  ];
  data.add([
    { description: 'Gym', initiative_id: 4, due_date: D, due_time: '18:00:00' },
    { description: 'Call Mom', initiative_id: 2, due_date: D, due_time: '19:00:00' },
    { description: 'Buy a toy for Aarav', initiative_id: 2 },
    { description: 'Prep the CEO deck', initiative_id: 1, due_date: D, due_time: '20:00:00', priority: 'high' },
    { description: 'Meet the CEO', initiative_id: 1, due_date: TOMORROW, due_time: '09:00:00', priority: 'high' },
  ]);
  return { intent: 'capture', status: 'saved', parts, date_warning: null, skipped_due_dates: [], geo_address: null, maps_url: null };
}
const WEB_SAID = 'Investor update draft by Friday, remind me Thursday evening';
function webCaptureResult(data) {
  data.add([{ description: 'Investor update draft', initiative_id: 1, due_date: '2026-11-20', remind_on: '2026-11-19', remind_time: '18:00:00' }]);
  return { intent: 'capture', status: 'saved', date_warning: null, skipped_due_dates: [], geo_address: null, maps_url: null,
    parts: [{ interaction_id: null, note_saved: false, initiative_id: 1, initiative_name: 'Work', suggested_initiative: null, summary: '',
      tasks_created: [{ id: 990, description: 'Investor update draft', due_date: '2026-11-20', due_time: null, owner: 'me' }], skipped_due_dates: [], decisions: [], concerns: [] }] };
}
const VOICE_SAID = 'Pick up medicines, book the dentist for Saturday, and call Riya after lunch.';
function voiceResult(data) {
  data.add([{ description: 'Call Riya', initiative_id: 2, due_date: D, due_time: '14:00:00', remind_before: 10 }, { description: 'Book the dentist', initiative_id: 4, due_date: '2026-11-21' }, { description: 'Pick up medicines', initiative_id: 4, due_date: D }]);
  const t = (description, o = {}) => ({ id: Math.floor(Math.random() * 1e6), description, owner: 'me', due_date: null, due_time: null, ...o });
  return { intent: 'capture', status: 'saved', date_warning: null, skipped_due_dates: [], geo_address: null, maps_url: null, parts: [
    { interaction_id: null, note_saved: false, initiative_id: 4, initiative_name: 'Health', suggested_initiative: null, summary: '', tasks_created: [t('Pick up medicines', { due_date: D }), t('Book the dentist', { due_date: '2026-11-21' })], skipped_due_dates: [], decisions: [], concerns: [] },
    { interaction_id: null, note_saved: false, initiative_id: 2, initiative_name: 'Family', suggested_initiative: null, summary: '', tasks_created: [t('Call Riya', { due_date: D, due_time: '14:00' })], skipped_due_dates: [], decisions: [], concerns: [] },
  ] };
}
const ASK = 'What did I promise the design team?';
const askResult = () => ({
  intent: 'ask', status: 'answered',
  answer: 'You promised to **share the onboarding copy by Wednesday** and to **review the icon set before Friday’s demo**. You also decided to ship the warmer onboarding copy.',
  sources: [{ ref: 'n202', kind: 'note', id: 202, title: 'Design sync', date: '2026-11-12' }],
});
const chatFor = body => (body.text || '').includes('?') ? askResult() : null;

// ---------- recorder ----------
async function record(browser, name, opts, script) {
  const dir = `${HERE}takes/${name}/`;
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  const { ctx, page } = await openApp(browser, opts);
  let n = 0; const marks = {};
  const snap = async (mark) => { n++; if (mark) marks[mark] = n; await page.screenshot({ path: `${dir}${String(n).padStart(4, '0')}.png` }); };
  await script({ page, snap, wait: ms => page.waitForTimeout(ms) });
  await writeFile(dir + 'manifest.json', JSON.stringify({ frames: n, marks, width: opts.viewport.width * opts.dpr, height: opts.viewport.height * opts.dpr }, null, 1));
  await ctx.close();
  console.log(`${name}: ${n} frames`, marks);
}
async function typeFrames(page, snap, text, per = 3) {
  for (let i = 0; i < text.length; i += per) { await page.keyboard.type(text.slice(i, i + per)); await snap(); }
}

// Speak into the real recorder: tap the mic, words appear live, finish, send, the reply.
async function speak(page, snap, wait, said, { scrollUp = 0, scrollFrames = 0 } = {}) {
  await page.locator('[aria-label="Record a voice note"]').first().click(); await wait(700); await snap('recording');
  const words = said.split(' ');
  for (let i = 1; i <= words.length; i++) { await page.evaluate(t => window.__say(t), words.slice(0, i).join(' ')); await wait(80); await snap(); }
  await snap('spoken');
  await page.locator('[aria-label="Finish recording"]').first().click(); await wait(900); await snap('finished');
  await page.locator('[aria-label="Send"]').first().click(); await wait(300); await snap('sent'); await wait(600); await snap();
  await wait(1500);
  if (scrollUp) { await page.mouse.wheel(0, -scrollUp); await wait(500); }
  await snap('reply');
  for (let i = 0; i < scrollFrames; i++) { await page.mouse.wheel(0, 95); await wait(120); await snap(); }
  await wait(300); await snap('replyEnd');
}

const TAKES = {
  // Home → type a messy brain-dump → the real capture reply, sorted into spaces
  'phone-capture': theme => [{ theme, viewport: PHONE, dpr: 2, transcript: CAPTURE_SAID, data: demo(theme, { without: CAPTURE_TASKS }), chat: (b, d) => captureResult(d) }, async ({ page, snap, wait }) => {
    await page.goto(APP + '/'); await wait(2200); await snap('home');
    await speak(page, snap, wait, CAPTURE_SAID, { scrollUp: 560, scrollFrames: 6 });
  }],
  // Today: the day, then tick a to-do off
  'phone-today': theme => [{ theme, viewport: PHONE, dpr: 2 }, async ({ page, snap, wait }) => {
    await page.goto(APP + '/today'); await wait(2200); await snap('today');
    await page.locator('[aria-label="Mark done"]').nth(1).click(); await wait(120); await snap('tick'); await wait(250); await snap(); await wait(500); await snap('ticked');
    for (let i = 0; i < 5; i++) { await page.mouse.wheel(0, 120); await wait(120); await snap(); }
    await snap('scrolled');
  }],
  // Spaces, then open Work
  'phone-spaces': theme => [{ theme, viewport: PHONE, dpr: 2 }, async ({ page, snap, wait }) => {
    await page.goto(APP + '/notes'); await wait(2200); await snap('spaces');
    for (let i = 0; i < 4; i++) { await page.mouse.wheel(0, 120); await wait(120); await snap(); }
    await page.mouse.wheel(0, -2000); await wait(400); await snap('top');
    await page.getByText('Work', { exact: true }).nth(1).click().catch(() => page.getByText('Work', { exact: true }).first().click());
    await wait(900); await snap('work');
    for (let i = 0; i < 4; i++) { await page.mouse.wheel(0, 120); await wait(120); await snap(); }
  }],
  // Voice: the real recording screen with the live transcript, then the capture reply
  'phone-voice': theme => [{ theme, viewport: PHONE, dpr: 2, transcript: VOICE_SAID, chat: (b, d) => voiceResult(d) }, async ({ page, snap, wait }) => {
    await page.goto(APP + '/'); await wait(2200); await snap('home');
    await page.locator('[aria-label="Record a voice note"]').first().click(); await wait(700); await snap('recording');
    const words = VOICE_SAID.split(' ');
    for (let i = 1; i <= words.length; i++) { await page.evaluate(t => window.__say(t), words.slice(0, i).join(' ')); await wait(90); await snap(); }
    await snap('spoken'); await wait(300); await snap();
    await page.locator('[aria-label="Finish recording"]').first().click(); await wait(900); await snap('finished');
    await page.locator('[aria-label="Send"]').first().click(); await wait(300); await snap('sent'); await wait(600); await snap();
    await wait(1500); await snap('reply'); await wait(600); await snap('replyEnd');
  }],
  // Ask a question on the phone
  'phone-ask': theme => [{ theme, viewport: PHONE, dpr: 2, transcript: ASK, chat: chatFor }, async ({ page, snap, wait }) => {
    await page.goto(APP + '/'); await wait(2200); await snap('home');
    await speak(page, snap, wait, ASK);
  }],
  // Laptop: Today, type into the Today box, the new to-do appears
  'laptop-today': theme => [{ theme, viewport: LAPTOP, dpr: 1.5, transcript: WEB_SAID, chat: (b, d) => webCaptureResult(d) }, async ({ page, snap, wait }) => {
    await page.goto(APP + '/today'); await wait(2200); await snap('home');
    await speak(page, snap, wait, WEB_SAID);
  }],
  // Laptop: ask
  'laptop-ask': theme => [{ theme, viewport: LAPTOP, dpr: 1.5, transcript: ASK, chat: chatFor }, async ({ page, snap, wait }) => {
    await page.goto(APP + '/'); await wait(2200); await snap('home');
    await speak(page, snap, wait, ASK);
  }],
  'laptop-spaces': theme => [{ theme, viewport: LAPTOP, dpr: 1.5 }, async ({ page, snap, wait }) => {
    await page.goto(APP + '/notes'); await wait(2200); await snap('spaces');
  }],
  // Settings: the Claude connection + privacy sections
  'phone-settings': theme => [{ theme, viewport: PHONE, dpr: 2 }, async ({ page, snap, wait }) => {
    await page.goto(APP + '/settings'); await wait(2200); await snap('top');
    await page.getByText('Claude', { exact: false }).first().scrollIntoViewIfNeeded().catch(() => {});
    await wait(500); await snap('claude');
    await page.getByText('Privacy', { exact: true }).first().scrollIntoViewIfNeeded().catch(() => {});
    await wait(500); await snap('privacy');
  }],
};

// The real interactive view Claude shows (mcp_ui.py), fed a show_today result the way Claude does.
async function mcpToday(browser, theme) {
  const html = await readFile(HERE + 'mcp_today.html', 'utf8');
  const dir = `${HERE}takes/mcp-today-${theme}/`; await rm(dir, { recursive: true, force: true }); await mkdir(dir, { recursive: true });
  const ctx = await browser.newContext({ viewport: { width: 640, height: 560 }, deviceScaleFactor: 2, colorScheme: theme });
  const page = await ctx.newPage();
  await page.setContent(html);
  const tv = (id, description, space_id, space, o = {}) => ({ id, description, detail: null, status: 'open', priority: 'normal', due_date: D, due_time: null, repeat: null, remind_on: null, remind_time: null, remind_before: null, space_id, space, list_id: null, list: null, list_emoji: null, ...o });
  const data = { view: 'today', date: D, time: '10:12', timezone: 'Asia/Kolkata', tab: 'today',
    overdue: [], today: [tv(1, 'Prep the CEO deck', 1, 'Work', { due_time: '20:00', priority: 'high', remind_before: 60 }), tv(2, 'Gym', 4, 'Health', { due_time: '18:00' }), tv(3, 'Call Mom', 2, 'Family', { due_time: '19:00' })],
    important: [], upcoming: [tv(4, 'Send proposal to Acme', 1, 'Work', { due_date: '2026-11-20', remind_on: '2026-11-19', remind_time: '10:00' })], later: [], anytime: [],
    spaces: [{ id: 1, name: 'Work', color: '#3477c9' }, { id: 2, name: 'Family', color: '#c93b8f' }, { id: 4, name: 'Health', color: '#1f9d6b' }] };
  await page.evaluate(d => window.postMessage({ jsonrpc: '2.0', method: 'ui/notifications/tool-result', params: { structuredContent: d } }, '*'), data);
  await page.waitForTimeout(600);
  await page.screenshot({ path: dir + '0001.png', fullPage: true });
  await writeFile(dir + 'manifest.json', JSON.stringify({ frames: 1, marks: { today: 1 } }));
  await ctx.close();
  console.log(`mcp-today-${theme}: 1 frame`);
}

// persona takes: capture → reply, Today, Spaces, in the persona's own theme
for (const [pid, P] of Object.entries(PERSONAS)) {
  const data = () => makeData(P.theme, P);
  const base = { theme: P.theme, viewport: PHONE, dpr: 2, userName: P.name };
  TAKES[`persona-${pid}-capture`] = () => [{ ...base, transcript: P.said, data: data(), chat: (b, d) => { d.add(P.adds); return { intent: 'capture', status: 'saved', parts: P.parts, date_warning: null, skipped_due_dates: [], geo_address: null, maps_url: null }; } }, async ({ page, snap, wait }) => {
    await page.goto(APP + '/'); await wait(2200); await snap('home');
    await speak(page, snap, wait, P.said, { scrollUp: 560 });
  }];
  TAKES[`persona-${pid}-today`] = () => [{ ...base, data: data() }, async ({ page, snap, wait }) => {
    await page.goto(APP + '/today'); await wait(2200); await snap('today');
  }];
  TAKES[`persona-${pid}-spaces`] = () => [{ ...base, data: data() }, async ({ page, snap, wait }) => {
    await page.goto(APP + '/notes'); await wait(2200); await snap('spaces');
  }];
}

const only = process.argv[2];
const browser = await launch();
for (const [name, mk] of Object.entries(TAKES)) {
  for (const theme of name.startsWith('persona-') ? [''] : ['light', 'dark']) {
    const id = theme ? `${name}-${theme}` : name;
    if (only && !id.includes(only)) continue;
    const [opts, script] = mk(theme);
    try { await record(browser, id, opts, script); } catch (e) { console.error(id, 'FAILED', e.message.split('\n')[0]); }
  }
}
for (const theme of ['light', 'dark']) if (!only || 'mcp-today'.includes(only) || only.includes('mcp')) await mcpToday(browser, theme);
await browser.close();
// index of every take (frames + marks) for the v2 videos
{
  const { readdir } = await import('node:fs/promises');
  const index = {};
  for (const d of await readdir(HERE + 'takes')) { try { index[d] = JSON.parse(await readFile(`${HERE}takes/${d}/manifest.json`, 'utf8')); } catch {} }
  await writeFile(HERE + '../v2/studio/takes-index.js', '// generated by capture/takes.mjs\nexport const TAKE = ' + JSON.stringify(index, null, 1) + ';\n');
}
