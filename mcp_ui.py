"""
mcp_ui.py - the interactive views Claude draws for MyConfía (MCP Apps: `ui://confia/<view>` resources).

One small web app, served for every view (the data a tool returns decides which screen shows):

    today / list   to-dos by Today, Upcoming, Anytime - tick, add, open to edit
    task           one to-do: priority, due date, reminder (always before the due date), space
    spaces         every space as a card; open one for its Notes, To-dos and Lists
    capture        what a capture saved: the note, its points, decisions and the to-dos with dates
    answer         an answer from the person's notes with the notes it used

It runs in a sandboxed frame inside Claude and talks to it over postMessage (the MCP Apps bridge): it says hello with
ui/initialize, receives the tool result as ui/notifications/tool-result, and calls tools (tick a to-do, change a date)
with tools/call. It loads nothing from the internet, and builds every screen with DOM calls (never innerHTML with
the person's text), so nothing a note says can run as code.
"""

VIEWS = ["today", "spaces", "capture", "answer", "task"]


def html(view: str) -> str:
    return _PAGE.replace("__VIEW__", view)


_PAGE = r"""<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>MyConfía</title>
<style>
:root{
  --text:#1c1917;--muted:#6b645a;--faint:#a39d93;--line:#e8e3d9;--card:#ffffff;--elev:#f5f2eb;--hover:#f1ede4;
  --accent:#ea580c;--accent-ink:#ffffff;--accent-soft:#fdeadb;--danger:#dc2f35;--danger-soft:#fde8e8;--ok:#1f9d6b;
  --high:#e5484d;--normal:#d99a14;--low:#2f9e6f;--pink:#db2777;--sky:#0284c7;--shadow:0 1px 2px rgba(60,40,10,.05),0 6px 20px rgba(60,40,10,.07);
  --page:#fdfbf7;color-scheme:light;
  --font:ui-sans-serif,-apple-system,"SF Pro Text","Segoe UI",Inter,system-ui,sans-serif;
}
:root[data-theme="dark"]{
  --page:#17140f;color-scheme:dark;
  --text:#f6f2e9;--muted:#b9b2a3;--faint:#80796c;--line:#3a342b;--card:#232019;--elev:#2c2820;--hover:#332e25;
  --accent:#ff8c42;--accent-ink:#1a1209;--accent-soft:#3d2714;--danger:#ff6b6b;--danger-soft:#3f2020;--ok:#3fcf94;
  --high:#ff6b70;--normal:#f0b43a;--low:#4cc58f;--pink:#f472b6;--sky:#38bdf8;--shadow:0 1px 2px rgba(0,0,0,.3),0 6px 20px rgba(0,0,0,.3);
}
*{box-sizing:border-box}
html,body{margin:0;background:var(--page);color:var(--text);font-family:var(--font);font-size:15px;line-height:1.4;-webkit-font-smoothing:antialiased}
button,input,select,textarea{font:inherit;color:inherit}
button{cursor:pointer;border:0;background:none;padding:0}
#app{max-width:760px;margin:0 auto;padding:14px 14px 18px}
.hide{display:none!important}
.brand{display:flex;align-items:center;gap:10px;margin:0 2px 14px}
.logo{width:30px;height:30px;flex:none}
.brand h1{margin:0;font-size:1.35rem;letter-spacing:-.03em;font-weight:650}
.brand .sub{color:var(--muted);font-size:.85rem;margin-top:1px}
.grow{flex:1;min-width:0}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:7px;height:38px;padding:0 15px;border-radius:999px;border:1px solid var(--line);background:var(--card);font-weight:550;font-size:.9rem;transition:transform .08s,background .15s}
.btn:hover{background:var(--hover)}.btn:active{transform:scale(.97)}
.btn.primary{background:var(--accent);border-color:var(--accent);color:var(--accent-ink)}
.btn.primary:hover{filter:brightness(1.06)}
.btn.danger{background:var(--danger);border-color:var(--danger);color:#fff}
.btn.ghost{border-color:transparent;background:transparent;color:var(--muted)}
.btn.small{height:32px;padding:0 12px;font-size:.85rem;white-space:nowrap}
.btn:disabled{opacity:.45;cursor:default}
.icon{width:17px;height:17px;flex:none;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.seg{display:flex;gap:4px;padding:4px;border-radius:999px;background:var(--elev);margin-bottom:14px}
.seg button{flex:1;height:34px;border-radius:999px;color:var(--muted);font-weight:550;font-size:.9rem;display:flex;align-items:center;justify-content:center;gap:6px}
.seg button.on{background:var(--card);color:var(--text);box-shadow:var(--shadow)}
.seg .n{font-size:.75rem;opacity:.7}
.section{margin-bottom:16px}
.section h3{margin:0 4px 7px;font-size:.74rem;letter-spacing:.07em;text-transform:uppercase;color:var(--faint);font-weight:650}
.section h3.late{color:var(--danger)}
.section h3 .c{letter-spacing:0;text-transform:none;font-weight:500;opacity:.85}
.card{background:var(--card);border:1px solid var(--line);border-radius:18px;box-shadow:var(--shadow);overflow:hidden}
.row{display:flex;align-items:flex-start;gap:12px;padding:12px 14px;border-bottom:1px solid var(--line);animation:in .25s ease both}
.row:last-child{border-bottom:0}
.row:hover{background:var(--hover)}
@keyframes in{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}
.tick{width:23px;height:23px;border-radius:50%;border:2px solid var(--faint);flex:none;margin-top:1px;display:flex;align-items:center;justify-content:center;color:transparent;transition:all .15s}
.tick:hover{background:var(--accent-soft)}
.tick.done{background:var(--ok);border-color:var(--ok);color:#fff}
.tick .icon{width:13px;height:13px;stroke-width:3}
.t-main{flex:1;min-width:0;text-align:left}
.t-title{font-size:.97rem;word-break:break-word}
.t-title.done{text-decoration:line-through;color:var(--faint)}
.t-detail{color:var(--muted);font-size:.85rem;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px}
.chip{display:inline-flex;align-items:center;gap:5px;font-size:.76rem;padding:2px 9px;border-radius:999px;background:var(--elev);color:var(--muted);white-space:nowrap}
.chip.late{background:var(--danger-soft);color:var(--danger);font-weight:600}
.chip.bell{background:var(--accent-soft);color:var(--accent)}
.chip .icon{width:12px;height:12px}
.dot{width:8px;height:8px;border-radius:50%;display:inline-block;flex:none}
.pri{width:4px;align-self:stretch;border-radius:3px;flex:none;margin:2px 0}
.pri.high{background:var(--high)}.pri.low{background:var(--low)}.pri.normal{background:transparent}
.iconbtn{width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;color:var(--faint);flex:none}
.iconbtn:hover{background:var(--elev);color:var(--text)}
.add{display:flex;gap:8px;margin-bottom:14px}
.input{width:100%;height:42px;border-radius:14px;border:1px solid var(--line);background:var(--card);padding:0 14px;outline:none}
.input:focus{border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-soft)}
.empty{text-align:center;color:var(--muted);padding:30px 16px;border:1.5px dashed var(--line);border-radius:18px}
.empty b{display:block;color:var(--text);font-weight:600;margin-bottom:3px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:12px}
.space{padding:16px;border-radius:18px;background:var(--card);border:1px solid var(--line);box-shadow:var(--shadow);text-align:left;transition:transform .12s,border-color .15s;display:block;width:100%;animation:in .3s ease both}
.space:hover{transform:translateY(-2px);border-color:var(--accent)}
.space .bar{height:5px;border-radius:3px;margin-bottom:12px}
.space .name{font-weight:650;font-size:1.02rem;letter-spacing:-.01em}
.space .meta{display:flex;gap:12px;margin-top:8px;color:var(--muted);font-size:.82rem}
.space .meta b{color:var(--text);font-weight:650}
.note{padding:12px 14px;border-bottom:1px solid var(--line)}
.note:last-child{border-bottom:0}
.note .d{font-size:.74rem;color:var(--faint);margin-bottom:2px}
.pts{margin:6px 0 0;padding-left:18px}.pts li{margin:3px 0}
.lbl{font-weight:650;margin-top:10px}
.back{display:inline-flex;align-items:center;gap:4px;color:var(--muted);font-size:.88rem;margin:0 0 10px 2px}
.back:hover{color:var(--text)}
.partcard{padding:16px;border-left:4px solid var(--accent);background:var(--card);border-radius:6px 18px 18px 6px;border-top:1px solid var(--line);border-right:1px solid var(--line);border-bottom:1px solid var(--line);box-shadow:var(--shadow);margin-bottom:12px;animation:in .3s ease both}
.partcard .sp{font-weight:650;display:flex;align-items:center;gap:7px;margin-bottom:6px}
.banner{display:flex;align-items:center;gap:10px;padding:12px 14px;border-radius:16px;background:var(--accent-soft);color:var(--accent);font-weight:600;margin-bottom:12px}
.answer{padding:18px;font-size:1rem;line-height:1.55}
.answer p{margin:0 0 10px}.answer p:last-child{margin-bottom:0}
.answer ul,.answer ol{margin:6px 0 10px;padding-left:22px}
.answer code{background:var(--elev);padding:1px 5px;border-radius:5px;font-size:.9em}
.q{color:var(--muted);font-size:.9rem;margin:0 4px 8px}
.src{display:inline-flex;align-items:center;gap:6px;height:32px;padding:0 12px;border-radius:999px;border:1px solid var(--line);background:var(--card);font-size:.82rem;color:var(--muted);max-width:100%}
.src span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
button.src:hover{border-color:var(--accent);color:var(--text)}
.srcs{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}
.tcard{padding:18px}
.tcard h2{margin:0 0 4px;font-size:1.3rem;letter-spacing:-.02em;font-weight:650;word-break:break-word}
.block{margin-top:16px;padding:14px;border-radius:16px;background:var(--elev)}
.block h4{margin:0 0 10px;font-size:.92rem;display:flex;align-items:center;gap:8px;font-weight:650}
.chiprow{display:flex;flex-wrap:wrap;gap:8px}
.pill{height:36px;padding:0 14px;border-radius:999px;border:1px solid var(--line);background:var(--card);font-size:.87rem;font-weight:550;display:inline-flex;align-items:center;gap:6px}
.pill:hover{background:var(--hover)}
.pill.on{border-color:var(--accent);background:var(--accent-soft);color:var(--accent)}
.pill:disabled{opacity:.4;cursor:default}
.two{display:flex;flex-wrap:wrap;gap:8px}.two>*{flex:1 1 150px;min-width:0}
.radio{display:flex;align-items:center;gap:12px;width:100%;min-height:46px;padding:8px 14px;text-align:left;border-bottom:1px solid var(--line)}
.radio:last-child{border-bottom:0}
.radio:hover{background:var(--hover)}.radio:disabled{opacity:.4;cursor:default}
.radio.on{background:var(--accent-soft)}
.rd{width:20px;height:20px;border-radius:50%;border:2px solid var(--faint);flex:none;display:flex;align-items:center;justify-content:center;color:transparent}
.radio.on .rd{border-color:var(--accent);background:var(--accent);color:var(--accent-ink)}
.rd .icon{width:11px;height:11px;stroke-width:3.4}
.hint{color:var(--muted);font-size:.82rem}
.status{font-weight:600;margin:4px 0 10px;font-size:.9rem}
.status.on{color:var(--accent)}.err{color:var(--danger);font-size:.82rem;margin-top:6px}
.switch{width:44px;height:26px;border-radius:999px;background:var(--faint);position:relative;flex:none;transition:background .15s}
.switch::after{content:"";position:absolute;top:3px;left:3px;width:20px;height:20px;border-radius:50%;background:#fff;transition:transform .15s}
.switch.on{background:var(--accent)}.switch.on::after{transform:translateX(18px)}
.toast{position:fixed;left:50%;bottom:16px;transform:translateX(-50%);background:var(--text);color:var(--card);padding:10px 16px;border-radius:999px;font-size:.88rem;box-shadow:var(--shadow);z-index:50;animation:in .2s ease both;max-width:90%}
.overlay{position:fixed;inset:0;background:rgba(20,15,5,.45);display:flex;align-items:flex-end;justify-content:center;z-index:40;animation:fade .15s ease both}
@keyframes fade{from{opacity:0}to{opacity:1}}
.sheet{background:var(--card);width:100%;max-width:560px;max-height:92vh;overflow:auto;border-radius:24px 24px 0 0;padding:18px;animation:up .22s cubic-bezier(.3,.8,.3,1) both}
@keyframes up{from{transform:translateY(30px);opacity:0}to{transform:none;opacity:1}}
@media(min-width:640px){.overlay{align-items:center}.sheet{border-radius:24px}}
.center{display:flex;flex-direction:column;align-items:center;justify-content:center;padding:44px 16px;color:var(--muted);text-align:center;gap:10px}
.spin{width:26px;height:26px;border-radius:50%;border:3px solid var(--line);border-top-color:var(--accent);animation:rot .8s linear infinite}
@keyframes rot{to{transform:rotate(360deg)}}
.fade-out{opacity:.5}
</style></head>
<body data-view="__VIEW__"><div id="app"></div>
<script>
"use strict";
/* ---------- tiny DOM helpers (all text goes through textContent - nothing a note says can become markup) ---------- */
const $app = document.getElementById('app');
function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'style') el.setAttribute('style', v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid !== null && kid !== undefined && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  return el;
}
const ICONS = {
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>', bell: '<path d="M6 8a6 6 0 0112 0c0 7 3 8 3 8H3s3-1 3-8M10.3 20a2 2 0 003.4 0"/>',
  cal: '<rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M8 3v4M16 3v4M3.5 10h17"/>', pen: '<path d="M4 20h4L19 9a2.8 2.8 0 00-4-4L4 16z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>', x: '<path d="M6 6l12 12M18 6L6 18"/>', trash: '<path d="M4 7h16M9 7V4h6v3M6.5 7l1 13h9l1-13"/>',
  back: '<path d="M15 5l-7 7 7 7"/>', note: '<path d="M7 3h8l4 4v14H7zM15 3v4h4M10 12h6M10 16h6"/>', todo: '<rect x="4" y="4" width="16" height="16" rx="4"/><path d="M8.5 12.5l2.5 2.5 4.5-5"/>',
  list: '<path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01"/>', repeat: '<path d="M17 2l3 3-3 3M20 5H8a4 4 0 00-4 4M7 22l-3-3 3-3M4 19h12a4 4 0 004-4"/>',
  spark: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM18 16l.8 2.2L21 19l-2.2.8L18 22l-.8-2.2L15 19l2.2-.8z"/>',
  folder: '<path d="M3 7a2 2 0 012-2h4l2 2.5h8a2 2 0 012 2V18a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>',
};
function icon(name) { const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('class', 'icon'); s.setAttribute('viewBox', '0 0 24 24'); s.innerHTML = ICONS[name] || ''; return s; }
const LOGO = () => { const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('class', 'logo'); s.setAttribute('viewBox', '0 0 86 86'); s.innerHTML = '<path d="M62 20C54 13 43 12 34 17C21 24 16 39 23 52C30 65 46 70 59 63" stroke="currentColor" stroke-width="9" stroke-linecap="round" fill="none"/><circle cx="63" cy="60" r="9" fill="#E9A73B"/>'; return s; };

/* ---------- dates ---------- */
const pad = (n) => String(n).padStart(2, '0');
const isoOf = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const parse = (iso) => { const [y, m, d] = String(iso).split('-').map(Number); return new Date(y, m - 1, d); };
const shift = (iso, n) => { const d = parse(iso); d.setDate(d.getDate() + n); return isoOf(d); };
const todayIso = () => (state.data && state.data.date) || isoOf(new Date());
function timeLabel(t) { if (!t) return ''; const [h, m] = t.split(':').map(Number); const d = new Date(2000, 0, 1, h, m || 0); return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }); }
function dayLabel(iso) {
  if (!iso) return '';
  const t = todayIso(), d = parse(iso), diff = Math.round((d - parse(t)) / 864e5);
  const exact = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  if (diff === 0) return 'Today'; if (diff === 1) return 'Tomorrow'; if (diff === -1) return 'Yesterday';
  if (Math.abs(diff) < 7) return d.toLocaleDateString('en-GB', { weekday: 'short' }) + ' ' + exact;
  return exact + (d.getFullYear() !== parse(t).getFullYear() ? ' ' + d.getFullYear() : '');
}
const whenLabel = (t) => t.due_date ? dayLabel(t.due_date) + (t.due_time ? ', ' + timeLabel(t.due_time) : '') : '';
function minLabel(m) { if (m % 10080 === 0) return m === 10080 ? '1 week' : (m / 10080) + ' weeks'; if (m % 1440 === 0) return m === 1440 ? '1 day' : (m / 1440) + ' days'; if (m % 60 === 0) return m === 60 ? '1 hour' : (m / 60) + ' hours'; return m + ' minutes'; }
function isOverdue(t) {
  if (t.status !== 'open' || !t.due_date) return false;
  const today = todayIso(); if (t.due_date !== today) return t.due_date < today;
  const n = new Date(); return !!t.due_time && t.due_time < (pad(n.getHours()) + ':' + pad(n.getMinutes()));
}
function remindAt(t) {
  const base = (d, hm) => { const [y, m, dd] = d.split('-').map(Number); const [hh, mm] = hm.split(':').map(Number); return new Date(y, m - 1, dd, hh, mm || 0); };
  if (t.remind_before != null && t.due_date) return new Date(base(t.due_date, t.due_time || '09:00').getTime() - t.remind_before * 60000);
  if (t.remind_on) return base(t.remind_on, t.remind_time || '09:00');
  if (t.due_date && t.due_time) return base(t.due_date, t.due_time);
  return null;
}
const momentLabel = (d) => d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) + ', ' + timeLabel(pad(d.getHours()) + ':' + pad(d.getMinutes()));

/* ---------- the bridge to Claude (MCP Apps: JSON-RPC over postMessage) ---------- */
let rpcId = 1; const pending = new Map(); let connected = false;
function post(msg) { try { window.parent.postMessage(msg, '*'); } catch (e) {} }
function request(method, params) { return new Promise((res, rej) => { const id = rpcId++; pending.set(id, { res, rej }); post({ jsonrpc: '2.0', id, method, params }); setTimeout(() => { if (pending.has(id)) { pending.delete(id); rej(new Error('timeout')); } }, 60000); }); }
function notify(method, params) { post({ jsonrpc: '2.0', method, params: params || {} }); }
window.addEventListener('message', (e) => {
  const m = e.data; if (!m || m.jsonrpc !== '2.0') return;
  if (m.id !== undefined && (m.result !== undefined || m.error) && !m.method) { const p = pending.get(m.id); if (p) { pending.delete(m.id); m.error ? p.rej(new Error(m.error.message || 'error')) : p.res(m.result); } return; }
  if (m.method === 'ui/notifications/tool-result') { const r = m.params || {}; if (r.structuredContent) setData(r.structuredContent); else if (r.isError) toast(textOf(r)); }
  else if (m.method === 'ui/notifications/host-context-changed') applyContext(m.params);
  else if (m.method === 'ui/notifications/tool-input') { if (!state.data) showLoading(); }
  else if (m.method === 'ui/resource-teardown' && m.id !== undefined) post({ jsonrpc: '2.0', id: m.id, result: {} });
});
function applyContext(ctx) { if (ctx && ctx.theme) document.documentElement.dataset.theme = ctx.theme; }
const dark = window.matchMedia && matchMedia('(prefers-color-scheme: dark)');
if (dark && dark.matches) document.documentElement.dataset.theme = 'dark';
const textOf = (r) => ((r.content || []).find((c) => c.type === 'text') || {}).text || 'Something went wrong';
async function callTool(name, args) {
  try { const r = await request('tools/call', { name, arguments: args || {} }); if (r.isError) { toast(textOf(r)); return null; } return r; }
  catch (e) { toast('Could not reach MyConfía - try again.'); return null; }
}
let lastH = 0;
function reportSize() { const hgt = Math.ceil(document.documentElement.scrollHeight); if (Math.abs(hgt - lastH) > 1) { lastH = hgt; notify('ui/notifications/size-changed', { width: Math.ceil(document.documentElement.scrollWidth), height: hgt }); } }
new ResizeObserver(reportSize).observe(document.body);
(async () => {
  try { const r = await request('ui/initialize', { protocolVersion: '2026-01-26', appInfo: { name: 'MyConfia', version: '1.0.0' }, appCapabilities: {} }); connected = true; applyContext(r && r.hostContext); notify('ui/notifications/initialized'); } catch (e) {}
  setTimeout(() => { if (!state.data) showWaiting(); }, 2500);
})();

/* ---------- state ---------- */
const state = { data: null, tab: null, sheet: null, space: null, spaceTab: 'todos' };
function setData(d) { state.data = d; if (d.view === 'today') state.tab = d.tab || 'today'; render(); }
function toast(msg) { document.querySelectorAll('.toast').forEach((n) => n.remove()); const t = h('div', { class: 'toast' }, msg); document.body.append(t); setTimeout(() => t.remove(), 3200); }
function showLoading() { $app.replaceChildren(h('div', { class: 'center' }, h('div', { class: 'spin' }), 'One moment…')); }
function showWaiting() { $app.replaceChildren(h('div', { class: 'center' }, LOGO(), h('b', {}, 'MyConfía'), 'This view fills in when Claude shows it.')); }

/* ---------- shared pieces ---------- */
function header(title, sub, right) {
  return h('div', { class: 'brand' }, h('span', { style: 'color:var(--accent)' }, LOGO()), h('div', { class: 'grow' }, h('h1', {}, title), sub ? h('div', { class: 'sub' }, sub) : null), right);
}
const PRI_LABEL = { high: 'High', normal: 'Normal', low: 'Low' };
function taskRow(t, opts) {
  opts = opts || {};
  const done = t.status === 'done', late = isOverdue(t);
  const chips = [];
  if (t.due_date) chips.push(h('span', { class: 'chip' + (late ? ' late' : '') }, icon('cal'), whenLabel(t)));
  if (t.repeat) chips.push(h('span', { class: 'chip' }, icon('repeat'), t.repeat.replace('hours:', 'Every ') + (t.repeat.startsWith('hours:') ? 'h' : '')));
  const at = !done && (t.remind_before != null || t.remind_on) ? remindAt(t) : null;
  if (at) chips.push(h('span', { class: 'chip bell' }, icon('bell'), t.remind_before != null ? minLabel(t.remind_before) + ' before' : momentLabel(at)));
  if (opts.showSpace && t.space && t.space !== 'Others') chips.push(h('span', { class: 'chip' }, icon('folder'), t.space));
  if (opts.showSpace && t.list) chips.push(h('span', { class: 'chip' }, (t.list_emoji || '') + ' ' + t.list));
  const tick = h('button', { class: 'tick' + (done ? ' done' : ''), 'aria-label': done ? 'Reopen' : 'Mark done', onclick: async (ev) => { ev.stopPropagation(); await toggle(t); } }, icon('check'));
  const body = h('button', { class: 't-main', onclick: () => openEditor(t) }, h('div', { class: 't-title' + (done ? ' done' : '') }, t.description), t.detail && !done ? h('div', { class: 't-detail' }, t.detail) : null, chips.length ? h('div', { class: 'chips' }, chips) : null);
  return h('div', { class: 'row' }, h('span', { class: 'pri ' + t.priority, title: PRI_LABEL[t.priority] + ' priority' }), tick, body, h('button', { class: 'iconbtn', 'aria-label': 'Edit', onclick: () => openEditor(t) }, icon('pen')));
}
async function toggle(t) {
  const want = t.status !== 'done';
  patchTask({ ...t, status: want ? 'done' : 'open' }); // shown at once, struck through; put back if it fails
  const r = await callTool('complete_task', { task_id: t.id, done: want });
  if (!r) patchTask(t); else if (r.structuredContent && r.structuredContent.task) patchTask(r.structuredContent.task, true);
}
function eachTaskList(fn) {
  const d = state.data; if (!d) return;
  for (const k of ['overdue', 'today', 'important', 'upcoming', 'later', 'anytime', 'tasks']) if (Array.isArray(d[k])) d[k] = fn(d[k]);
  if (d.selected) { d.selected.todos = fn(d.selected.todos); d.selected.lists.forEach((l) => { l.items = fn(l.items); }); }
  if (d.task && d.view === 'task') {}
}
function patchTask(t, keepDone) {
  const d = state.data; if (!d) return;
  if (d.view === 'task' && d.task && d.task.id === t.id) d.task = t;
  eachTaskList((rows) => rows.map((r) => (r.id === t.id ? t : r)));
  render();
}
function removeTask(id) { eachTaskList((rows) => rows.filter((r) => r.id !== id)); render(); }
function addToView(t) {
  const d = state.data; if (!d) return;
  if (d.view === 'today') { (t.due_date ? (t.due_date <= todayIso() ? d.today : d.upcoming) : d.anytime).unshift(t); }
  else if (d.view === 'list') d.tasks.unshift(t);
  else if (d.selected && (d.selected.space.id || null) === (t.space_id || null) && !t.list_id) d.selected.todos.unshift(t);
  render();
}
function section(title, rows, tone, opts) {
  if (!rows || !rows.length) return null;
  return h('div', { class: 'section' }, h('h3', { class: tone || '' }, title + ' ', h('span', { class: 'c' }, '· ' + rows.length)), h('div', { class: 'card' }, rows.map((t) => taskRow(t, opts))));
}
function addBar(placeholder, onAdd) {
  const input = h('input', { class: 'input', placeholder, 'aria-label': placeholder });
  const go = async () => { const v = input.value.trim(); if (!v) return; input.disabled = true; const ok = await onAdd(v); input.disabled = false; if (ok) { input.value = ''; } input.focus(); };
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
  return h('div', { class: 'add' }, input, h('button', { class: 'btn primary', onclick: go }, icon('plus'), 'Add'));
}

/* ---------- Today / list ---------- */
function viewToday(d) {
  const isToday = d.view === 'today';
  const out = [];
  const total = isToday ? d.overdue.length + d.today.length + d.important.length : d.tasks.length;
  const dateText = new Date(parse(d.date)).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
  out.push(header(isToday ? 'Today' : (d.title || 'To-dos'), isToday ? dateText : (d.total + ' to-do' + (d.total === 1 ? '' : 's'))));
  if (isToday) {
    const tabs = [['today', 'Today', d.overdue.length + d.today.length + d.important.length], ['upcoming', 'Upcoming', d.upcoming.length + d.later.length], ['anytime', 'Anytime', d.anytime.length]];
    out.push(h('div', { class: 'seg', role: 'tablist' }, tabs.map(([id, label, n]) => h('button', { class: state.tab === id ? 'on' : '', role: 'tab', onclick: () => { state.tab = id; render(); } }, label, n ? h('span', { class: 'n' }, n) : null))));
    out.push(addBar(state.tab === 'anytime' ? 'Add a to-do' : 'Add a to-do for today', async (text) => {
      const args = { description: text }; if (state.tab !== 'anytime') args.due_date = d.date;
      const r = await callTool('add_task', args); if (!r) return false; addToView(r.structuredContent.task); return true;
    }));
    if (state.tab === 'today') {
      if (!total) out.push(h('div', { class: 'empty' }, h('b', {}, 'Nothing on your plate.'), 'Add a to-do above, or tell Claude what you need to do.'));
      out.push(section('Overdue', d.overdue, 'late', { showSpace: true }), section('Today', d.today, '', { showSpace: true }), section('High priority', d.important, '', { showSpace: true }));
    } else if (state.tab === 'upcoming') {
      if (!d.upcoming.length && !d.later.length) out.push(h('div', { class: 'empty' }, h('b', {}, 'Nothing coming up.'), 'Things with a date show up here before their day.'));
      out.push(section('Next 7 days', d.upcoming, '', { showSpace: true }), section('Later', d.later, '', { showSpace: true }));
    } else {
      if (!d.anytime.length) out.push(h('div', { class: 'empty' }, h('b', {}, 'No loose to-dos.'), 'Anything without a date lands here.'));
      out.push(section('To-dos', d.anytime, '', { showSpace: true }));
    }
  } else {
    if (!d.tasks.length) out.push(h('div', { class: 'empty' }, h('b', {}, 'Nothing matches.')));
    out.push(section(d.title || 'To-dos', d.tasks, '', { showSpace: true }));
  }
  return out;
}

/* ---------- the editor: priority, due, reminder (a reminder always comes before the due date) ---------- */
const PRE_TIMED = [10, 30, 60, 1440], PRE_ALL = [1440, 2880, 10080];
function editorBody(t0, onChange) {
  let t = t0; const root = h('div', {}); let note = '', customOpen = false, cDate = t.remind_on || '', cTime = t.remind_time || '09:00', error = '';
  const today = todayIso();
  async function save(fields, msg) {
    error = ''; const r = await callTool('update_task', { task_id: t.id, ...fields });
    if (!r) return; t = r.structuredContent.task; note = msg || ''; patchTaskQuiet(t); onChange && onChange(t); draw();
  }
  function dueMoment(task) { if (!task.due_date) return null; const [y, m, d] = task.due_date.split('-').map(Number); const [hh, mm] = (task.due_time || '23:59').split(':').map(Number); return new Date(y, m - 1, d, hh, mm); }
  function setDue(date, time) {
    const f = { due_date: date, due_time: date ? time : null };
    if (!date) { f.remind_before_minutes = null; f.remind_at = null; return save(f, t.remind_before != null || t.remind_on ? 'The reminder was removed with the due date.' : ''); }
    if (t.remind_on && t.remind_before == null) { const nd = new Date(date + 'T' + (time || '23:59') + ':00'); const at = remindAt(t); if (at && at >= nd) { f.remind_at = null; return save(f, 'The reminder was removed because it would now come after the due date.'); } }
    return save(f);
  }
  function draw() {
    const timed = !!(t.due_date && t.due_time), has = !!t.due_date, at = remindAt(t);
    const hasBefore = t.remind_before != null && has;
    const onDay = has && !timed && t.remind_on === t.due_date && !t.remind_time && !hasBefore;
    const atDue = timed && !hasBefore && (!t.remind_on || (t.remind_on === t.due_date && t.remind_time === t.due_time));
    const custom = !!t.remind_on && !hasBefore && !onDay && !atDue;
    const presets = timed ? PRE_TIMED : PRE_ALL;
    const before = (m) => { if (!has) return null; const due = dueMoment(t); const base = timed ? due : new Date(due.getFullYear(), due.getMonth(), due.getDate(), 9, 0); return new Date(base.getTime() - m * 60000); };
    const radio = (on, label, hint, click, disabled) => h('button', { class: 'radio' + (on ? ' on' : ''), role: 'radio', 'aria-checked': on, disabled, onclick: click }, h('span', { class: 'rd' }, icon('check')), h('span', { class: 'grow' }, h('div', {}, label), hint ? h('div', { class: 'hint' }, hint) : null));
    const dateInput = h('input', { class: 'input', type: 'date', value: t.due_date || '', 'aria-label': 'Due date', onchange: (e) => setDue(e.target.value || null, t.due_time) });
    const timeInput = h('input', { class: 'input', type: 'time', value: t.due_time || '', 'aria-label': 'Due time', onchange: (e) => e.target.value && setDue(t.due_date, e.target.value) });
    const customProblem = () => { if (!cDate || !cTime) return ''; const m = new Date(cDate + 'T' + cTime + ':00'); if (m <= new Date()) return 'That time has already passed.'; if (t.due_date && cDate > t.due_date) return 'A reminder has to come before the due date.'; if (timed && cDate === t.due_date && cTime >= t.due_time) return 'On the due day it has to be before ' + timeLabel(t.due_time) + '.'; return ''; };
    const dateChip = (label, iso) => h('button', { class: 'pill' + (t.due_date === iso ? ' on' : ''), onclick: () => setDue(iso, t.due_time) }, label);
    const customRow = (custom || customOpen) ? h('div', { style: 'margin-top:12px' }, h('div', { class: 'two' },
      h('input', { class: 'input', type: 'date', min: today, max: t.due_date || '', value: cDate, 'aria-label': 'Reminder date', onchange: (e) => { cDate = e.target.value; draw(); } }),
      h('input', { class: 'input', type: 'time', value: cTime, 'aria-label': 'Reminder time', onchange: (e) => { cTime = e.target.value; draw(); } })),
      h('div', { class: customProblem() ? 'err' : 'hint', style: 'margin:8px 0' }, customProblem() || ('Any day up to ' + dayLabel(t.due_date) + (timed ? ', before ' + timeLabel(t.due_time) + ' on the day' : '') + '.')),
      h('button', { class: 'btn primary small', disabled: !cDate || !cTime || !!customProblem(), onclick: () => { customOpen = false; save({ remind_at: cDate + 'T' + cTime }); } }, 'Set reminder')) : null;
    root.replaceChildren(...[
      h('div', { class: 'block' }, h('h4', {}, 'Priority'), h('div', { class: 'chiprow' }, ['high', 'normal', 'low'].map((p) => h('button', { class: 'pill' + (t.priority === p ? ' on' : ''), onclick: () => save({ priority: p }) }, h('span', { class: 'dot', style: 'background:var(--' + p + ')' }), PRI_LABEL[p])))),
      h('div', { class: 'block' }, h('h4', {}, icon('cal'), 'Due'),
        h('div', { class: 'chiprow', style: 'margin-bottom:10px' }, dateChip('Today', today), dateChip('Tomorrow', shift(today, 1)), dateChip('Next week', shift(today, 7)), has ? h('button', { class: 'pill', onclick: () => setDue(null, null) }, 'No date') : null),
        h('div', { class: 'two' }, dateInput, h('div', { style: 'display:flex;gap:8px;align-items:center' }, has ? timeInput : null, has && timed ? h('button', { class: 'btn ghost small', onclick: () => setDue(t.due_date, null) }, 'All day') : null))),
      h('div', { class: 'block' }, h('h4', {}, icon('bell'), 'Remind me'),
        !has ? h('div', { class: 'hint' }, 'Set a due date first. A reminder always comes before it.') : [
          h('div', { class: 'status' + (at ? ' on' : '') }, at ? (at <= new Date() ? 'Was set for ' : 'Reminds you ') + momentLabel(at) : 'No reminder'),
          h('div', { class: 'card', role: 'radiogroup' },
            timed ? radio(atDue && !customOpen, 'At ' + timeLabel(t.due_time), "When it's due", () => { customOpen = false; save({ remind_before_minutes: null, remind_at: null }); })
                  : [radio(!hasBefore && !t.remind_on && !customOpen, 'No reminder', '', () => { customOpen = false; save({ remind_before_minutes: null, remind_at: null }); }),
                     radio(onDay && !customOpen, 'On the day, 9:00 AM', '', () => { customOpen = false; save({ remind_at: t.due_date }); })],
            presets.map((m) => { const w = before(m); return radio(hasBefore && t.remind_before === m && !customOpen, minLabel(m) + ' before', !timed && w ? momentLabel(w) : '', () => { customOpen = false; save({ remind_before_minutes: m }); }, !!w && w <= new Date()); }),
            radio(custom || customOpen, 'At a date and time', custom && !customOpen && at ? momentLabel(at) : '', () => { customOpen = !customOpen; draw(); })),
          customRow]),
      h('div', { class: 'block' }, h('h4', {}, icon('folder'), 'Space'), (() => {
        const sel = h('select', { class: 'input', 'aria-label': 'Space', onchange: (e) => save({ space: e.target.value }) }, h('option', { value: 'Others' }, 'Others'), (state.data.spaces || []).map((s) => h('option', { value: s.name, selected: s.id === t.space_id }, s.name)));
        return sel; })()),
      note ? h('div', { class: 'hint', style: 'margin-top:10px' }, note) : null].filter(Boolean));
  }
  draw(); return root;
}
function patchTaskQuiet(t) { const d = state.data; if (!d) return; if (d.view === 'task' && d.task && d.task.id === t.id) d.task = t; eachTaskList((rows) => rows.map((r) => (r.id === t.id ? t : r))); }
function openEditor(t) {
  const close = () => { state.sheet = null; render(); };
  const body = editorBody(t, () => {});
  const del = h('button', { class: 'btn ghost small', onclick: () => confirmDelete(t, close) }, icon('trash'), 'Delete');
  const sheet = h('div', { class: 'overlay', onclick: (e) => { if (e.target === sheet) close(); } }, h('div', { class: 'sheet' },
    h('div', { style: 'display:flex;align-items:flex-start;gap:10px;margin-bottom:6px' }, h('div', { class: 'grow' }, h('h2', { style: 'margin:0;font-size:1.15rem;letter-spacing:-.02em' }, t.description), t.detail ? h('div', { class: 'hint' }, t.detail) : null), h('button', { class: 'iconbtn', 'aria-label': 'Close', onclick: close }, icon('x'))),
    body, h('div', { style: 'display:flex;justify-content:space-between;margin-top:14px' }, del, h('button', { class: 'btn primary', onclick: close }, 'Done'))));
  state.sheet = sheet; render();
}
function confirmDelete(t, done) {
  const ov = h('div', { class: 'overlay', style: 'z-index:60' }, h('div', { class: 'sheet' }, h('h2', { style: 'margin:0 0 6px;font-size:1.1rem' }, 'Delete this?'), h('p', { class: 'hint', style: 'margin:0 0 16px;font-size:.92rem' }, '“' + t.description + '” will be deleted. This cannot be undone.'),
    h('div', { style: 'display:flex;gap:8px' }, h('button', { class: 'btn', style: 'flex:1', onclick: () => ov.remove() }, 'Cancel'), h('button', { class: 'btn danger', style: 'flex:1', onclick: async () => { ov.remove(); const r = await callTool('delete_task', { task_id: t.id, confirm: true }); if (r) { removeTask(t.id); state.sheet = null; if (state.data.view === 'task') state.data = { view: 'deleted', kind: 'to-do', name: t.description }; render(); } } }, 'Delete'))));
  document.body.append(ov);
}

/* ---------- one to-do ---------- */
function viewTask(d) {
  const t = d.task, done = t.status === 'done';
  const card = h('div', { class: 'card tcard' },
    d.created ? h('div', { class: 'banner', style: 'margin:-4px -4px 12px' }, icon('check'), 'Added to MyConfía') : null,
    h('div', { style: 'display:flex;gap:12px;align-items:flex-start' },
      h('button', { class: 'tick' + (done ? ' done' : ''), style: 'margin-top:5px', 'aria-label': done ? 'Reopen' : 'Mark done', onclick: () => toggle(t) }, icon('check')),
      h('div', { class: 'grow' }, h('h2', { style: done ? 'text-decoration:line-through;color:var(--faint)' : '' }, t.description), t.detail ? h('div', { class: 'hint', style: 'font-size:.92rem' }, t.detail) : null,
        h('div', { class: 'chips' }, h('span', { class: 'chip' }, icon('folder'), t.space), t.list ? h('span', { class: 'chip' }, (t.list_emoji || '') + ' ' + t.list) : null, t.repeat ? h('span', { class: 'chip' }, icon('repeat'), t.repeat) : null))),
    editorBody(t, () => {}),
    h('div', { style: 'display:flex;justify-content:space-between;margin-top:14px' }, h('button', { class: 'btn ghost small', onclick: () => confirmDelete(t) }, icon('trash'), 'Delete'),
      h('button', { class: 'btn small', onclick: async () => { const r = await callTool('show_today', {}); if (r) setData(r.structuredContent); } }, 'Open Today')));
  return [header('To-do', null), card];
}

/* ---------- spaces ---------- */
const SPACE_COLORS = ['#3477c9', '#1f9d6b', '#d9731f', '#7c5cd8', '#c93b8f', '#1f9bb0', '#b8951a', '#d0443e'];
const colorOf = (s, i) => s.color || SPACE_COLORS[(i || 0) % SPACE_COLORS.length];
function viewSpaces(d) {
  if (d.selected) return viewSpace(d);
  const cards = d.spaces.map((s, i) => h('button', { class: 'space', style: 'animation-delay:' + (i * 40) + 'ms', onclick: () => openSpaceCard(s) },
    h('div', { class: 'bar', style: 'background:' + colorOf(s, i) }), h('div', { class: 'name' }, s.name),
    h('div', { class: 'meta' }, h('span', {}, h('b', {}, s.notes), ' notes'), h('span', {}, h('b', {}, s.todos), ' to-dos'), h('span', {}, h('b', {}, s.lists), ' lists'))));
  return [header('Spaces', d.spaces.length + ' areas of your life and work'), h('div', { class: 'grid' }, cards)];
}
async function openSpaceCard(s) { const r = await callTool('open_space', { space: s.id === null ? 'Others' : String(s.id) }); if (r) { state.spaceTab = s.todos || !s.notes ? 'todos' : 'notes'; setData(r.structuredContent); } }
function viewSpace(d) {
  const sel = d.selected, color = colorOf(sel.space, d.spaces.findIndex((x) => x.id === sel.space.id));
  const tabs = [['notes', 'Notes', sel.notes.length], ['todos', 'To-dos', sel.todos.length], ['lists', 'Lists', sel.lists.length]];
  const pane = [];
  if (state.spaceTab === 'notes') {
    pane.push(sel.notes.length ? h('div', { class: 'card' }, sel.notes.map((n) => h('div', { class: 'note' }, h('div', { class: 'd' }, n.date ? dayLabel(n.date) : ''), h('div', {}, n.summary)))) : h('div', { class: 'empty' }, h('b', {}, 'No notes here yet.'), 'Tell Claude something to remember and it lands here.'));
  } else if (state.spaceTab === 'todos') {
    pane.push(addBar('Add a to-do to ' + sel.space.name, async (text) => { const r = await callTool('add_task', { description: text, space: sel.space.id === null ? 'Others' : String(sel.space.id) }); if (!r) return false; addToView(r.structuredContent.task); return true; }));
    pane.push(sel.todos.length ? h('div', { class: 'card' }, sel.todos.map((t) => taskRow(t))) : h('div', { class: 'empty' }, h('b', {}, 'No to-dos here.')));
  } else {
    pane.push(...sel.lists.map((l) => h('div', { class: 'section' }, h('h3', {}, (l.emoji || '') + ' ' + l.name + ' ', h('span', { class: 'c' }, '· ' + l.items.length)),
      h('div', { class: 'card' }, l.items.map((t) => taskRow(t)), h('div', { style: 'padding:10px 12px' }, addBar('Add to ' + l.name, async (text) => { const r = await callTool('add_list_item', { list: String(l.id), text }); if (!r) return false; setData(r.structuredContent); return true; }))))));
    if (!sel.lists.length) pane.push(h('div', { class: 'empty' }, h('b', {}, 'No lists yet.'), 'Ask Claude to “create a reading list”.'));
  }
  return [h('button', { class: 'back', onclick: async () => { const r = await callTool('list_spaces', {}); if (r) setData(r.structuredContent); } }, icon('back'), 'All spaces'),
    h('div', { class: 'brand' }, h('span', { class: 'dot', style: 'width:14px;height:14px;background:' + color }), h('div', { class: 'grow' }, h('h1', {}, sel.space.name), h('div', { class: 'sub' }, sel.notes.length + ' notes · ' + sel.todos.length + ' to-dos · ' + sel.lists.length + ' lists'))),
    h('div', { class: 'seg' }, tabs.map(([id, label, n]) => h('button', { class: state.spaceTab === id ? 'on' : '', onclick: () => { state.spaceTab = id; render(); } }, label, h('span', { class: 'n' }, n)))), pane];
}

/* ---------- capture ---------- */
function viewCapture(d) {
  const out = [header('Saved', 'Filed and ready'), h('div', { class: 'banner' }, icon('check'), 'Saved to MyConfía')];
  for (const [i, p] of d.parts.entries()) {
    const color = SPACE_COLORS[(p.space_id || i) % SPACE_COLORS.length];
    const pts = (p.summary || '').split('\n').map((s) => s.replace(/^[-•*]\s*/, '').trim()).filter(Boolean);
    out.push(h('div', { class: 'partcard', style: 'border-left-color:' + color, }, h('div', { class: 'sp', style: 'color:' + color }, icon('folder'), p.space, p.suggested_space ? h('span', { class: 'chip' }, 'New space? ' + p.suggested_space) : null),
      pts.length ? h('ul', { class: 'pts' }, pts.map((x) => h('li', {}, x))) : null,
      p.decisions.length ? [h('div', { class: 'lbl' }, 'Decisions'), h('ul', { class: 'pts' }, p.decisions.map((x) => h('li', {}, x)))] : null,
      p.concerns.length ? [h('div', { class: 'lbl' }, 'Concerns'), h('ul', { class: 'pts' }, p.concerns.map((x) => h('li', {}, x)))] : null,
      p.tasks.length ? [h('div', { class: 'lbl' }, 'To-dos'), h('div', { class: 'card', style: 'margin-top:8px;box-shadow:none' }, p.tasks.map((t) => h('div', { class: 'row' }, h('span', { class: 'tick', style: 'pointer-events:none' }, icon('check')), h('button', { class: 't-main', onclick: async () => { const r = await callTool('show_task', { task_id: t.id }); if (r) setData(r.structuredContent); } }, h('div', { class: 't-title' }, (t.list_emoji ? t.list_emoji + ' ' : '') + t.description), (t.due_date || t.repeat) ? h('div', { class: 'chips' }, t.due_date ? h('span', { class: 'chip' }, icon('cal'), dayLabel(t.due_date) + (t.due_time ? ', ' + timeLabel(t.due_time) : '')) : null, t.repeat ? h('span', { class: 'chip' }, icon('repeat'), t.repeat) : null) : null))))] : null));
  }
  if (d.warning) out.push(h('div', { class: 'hint', style: 'margin:4px 4px 10px' }, d.warning));
  out.push(h('div', { style: 'display:flex;gap:8px;flex-wrap:wrap' }, h('button', { class: 'btn', onclick: async () => { const r = await callTool('show_today', {}); if (r) setData(r.structuredContent); } }, icon('todo'), 'Open Today'), h('button', { class: 'btn', onclick: async () => { const r = await callTool('list_spaces', {}); if (r) setData(r.structuredContent); } }, icon('folder'), 'Spaces')));
  return out;
}

/* ---------- answer ---------- */
function inline(text) {
  const out = []; const re = /(\*\*[^*]+\*\*|`[^`]+`)/g; let last = 0, m;
  while ((m = re.exec(text))) { if (m.index > last) out.push(text.slice(last, m.index)); const tok = m[0]; out.push(tok.startsWith('**') ? h('strong', {}, tok.slice(2, -2)) : h('code', {}, tok.slice(1, -1))); last = m.index + tok.length; }
  if (last < text.length) out.push(text.slice(last)); return out;
}
function markdown(src) {
  const root = h('div', { class: 'answer' }); let list = null, para = [];
  const flush = () => { if (para.length) { root.append(h('p', {}, inline(para.join(' ')))); para = []; } };
  for (const raw of String(src).split('\n')) {
    const line = raw.trim(); const li = line.match(/^(?:[-*•]|\d+[.)])\s+(.*)/);
    if (li) { flush(); if (!list) { list = h(/^\d/.test(line) ? 'ol' : 'ul', {}); root.append(list); } list.append(h('li', {}, inline(li[1]))); }
    else if (!line) { flush(); list = null; } else { list = null; para.push(line); }
  } flush(); return root;
}
function viewAnswer(d) {
  return [header('Your notes say', null), h('div', { class: 'q' }, '“' + d.question + '”'), h('div', { class: 'card' }, markdown(d.answer)),
    d.sources && d.sources.length ? h('div', { class: 'srcs' }, d.sources.map((s) => {
      const label = h('span', {}, (s.date ? dayLabel(s.date) + ' · ' : '') + String(s.title || '').replace(/^(Task|Note|Follow-up) · /, ''));
      return s.kind === 'task' ? h('button', { class: 'src', onclick: async () => { const r = await callTool('show_task', { task_id: s.id }); if (r) setData(r.structuredContent); } }, icon('todo'), label) : h('span', { class: 'src' }, icon('note'), label);
    })) : null];
}

/* ---------- small cards ---------- */
function viewDone(d) { return [header(d.kind === 'to-do' ? 'Deleted' : 'Done'), h('div', { class: 'banner' }, icon('check'), (d.kind || 'Item') + ' deleted' + (d.name ? ': ' + d.name : ''))]; }
function viewNote(d) { return [header('Note saved'), h('div', { class: 'card' }, h('div', { class: 'note' }, h('div', { class: 'd' }, d.space || ''), h('div', {}, d.text || 'Saved.')))]; }

/* ---------- render ---------- */
function render() {
  const d = state.data; if (!d) return;
  const views = { today: viewToday, list: viewToday, task: viewTask, spaces: viewSpaces, capture: viewCapture, answer: viewAnswer, deleted: viewDone, note: viewNote };
  const fn = views[d.view];
  $app.replaceChildren(...[].concat(fn ? fn(d) : [h('div', { class: 'empty' }, 'Nothing to show.')]).flat(Infinity).filter(Boolean), ...(state.sheet ? [state.sheet] : []));
  reportSize();
}
showLoading();
</script></body></html>
"""
