// Reusable visual pieces for the MyConfía videos, drawn with brand tokens.
import { el, tf, setO, show, prog, ease, lerp, clamp } from './engine.js';

export const C = {
  paper: '#fdfbf7', paper2: '#f4f1eb', card: '#ffffff', ink: '#1c1917', muted: '#6b645a', faint: '#a39d92',
  accent: '#ea580c', amber: '#f5a524', amberInk: '#a3570a', navy: '#211f36', navy2: '#2c2947', cream: '#f5efe3',
  blue: '#2563eb', pink: '#db2777', sun: '#d97706', teal: '#0d9488', sky: '#0284c7', red: '#e11d48', grey: '#78716c', green: '#16a34a',
};

export const SPACES = {
  work: { name: 'Work', emoji: '💼', color: C.blue },
  family: { name: 'Family', emoji: '❤️', color: C.pink },
  home: { name: 'Home', emoji: '🏠', color: C.sun },
  health: { name: 'Health', emoji: '💪', color: C.teal },
  ideas: { name: 'Ideas', emoji: '💡', color: C.accent },
  uni: { name: 'University', emoji: '🎓', color: C.sky },
  side: { name: 'Side project', emoji: '🚀', color: C.red },
};

// lucide-style icons
const P = {
  check: '<path d="M20 6 9 17l-5-5"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  cal: '<rect width="18" height="18" x="3" y="4" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  mic: '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v3"/>',
  lock: '<rect width="18" height="11" x="3" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  unlock: '<rect width="18" height="11" x="3" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/>',
  key: '<circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6M15.5 7.5l3 3L22 7l-3-3"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  spark: '<path d="M12 3l1.9 5.8L20 11l-6.1 2.2L12 19l-1.9-5.8L4 11l6.1-2.2z"/>',
  send: '<path d="M5 12h14M12 5l7 7-7 7"/>',
  db: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14a9 3 0 0 0 18 0V5"/><path d="M3 12a9 3 0 0 0 18 0"/>',
  shield: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>',
  plug: '<path d="M12 22v-5M9 8V2M15 8V2M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8z"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  note: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z"/><path d="M14 2v4a2 2 0 0 0 2 2h4M8 13h8M8 17h5"/>',
  laptop: '<rect width="18" height="12" x="3" y="4" rx="2"/><path d="M2 20h20"/>',
  phone: '<rect width="14" height="20" x="5" y="2" rx="2"/><path d="M12 18h.01"/>',
  chat: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  eyeOff: '<path d="M9.9 4.2A10 10 0 0 1 12 4c7 0 10 8 10 8a13 13 0 0 1-1.7 2.7M6.6 6.6A13 13 0 0 0 2 12s3 8 10 8a9.7 9.7 0 0 0 5.4-1.6M2 2l20 20"/><path d="M14.1 14.1a3 3 0 0 1-4.2-4.2"/>',
};
export const icon = (name, size = 24, color = 'currentColor', sw = 2.2) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" style="display:block;flex:none">${P[name]}</svg>`;

export const logoSvg = (size = 120) => `
<svg width="${size}" height="${size}" viewBox="0 0 512 512" style="display:block">
  <rect width="512" height="512" rx="112" fill="${C.navy}"/>
  <path d="M348 158 A135 135 0 1 0 291 372" fill="none" stroke="${C.cream}" stroke-width="46" stroke-linecap="round"/>
  <circle cx="358" cy="342" r="47" fill="#e9a93b"/>
</svg>`;

export function logo(parent, { x, y, size = 120 }) {
  return el(parent, { x, y, center: true, html: logoSvg(size), style: { filter: 'drop-shadow(0 18px 40px rgba(33,31,54,.28))' } });
}

// Wordmark: "MyConfía"
export function wordmark(parent, { x, y, size = 64, color = C.ink }) {
  return el(parent, {
    x, y, center: true,
    html: `<span style="font-weight:700;letter-spacing:-0.04em;font-size:${size}px;color:${color};white-space:nowrap">MyConf<span style="color:${C.accent}">í</span>a</span>`,
  });
}

// Background: paper (or navy) with slow drifting colour blobs and grain.
export function background(root, { theme = 'paper', blobs = [C.amber, C.accent, C.sky] } = {}) {
  root.style.background = theme === 'navy' ? C.navy : C.paper;
  const nodes = blobs.map((c, i) => el(root, {
    x: [120, 820, 300, 900][i % 4], y: [180, 420, 1150, 1100][i % 4], w: 760, h: 760, center: true,
    style: { borderRadius: '50%', background: `radial-gradient(circle, ${c}${theme === 'navy' ? '55' : '30'} 0%, ${c}00 65%)` },
  }));
  el(root, { x: 0, y: 0, w: 1080, h: 1350, cls: 'grain' });
  return t => nodes.forEach((n, i) => tf(n, { x: Math.sin(t * 0.35 + i * 2) * 70, y: Math.cos(t * 0.3 + i * 1.3) * 60, s: 1 + Math.sin(t * 0.4 + i) * 0.08 }));
}

// Headline split into word spans for staggered reveal. Use *word* for accent colour, _word_ for marker.
export function headline(parent, { x, y, w = 960, size = 92, align = 'center', color = C.ink, text, weight = 700, lh = 1.04 }) {
  const n = el(parent, { x, y, w, center: true, style: { fontSize: size + 'px', fontWeight: weight, letterSpacing: '-0.035em', lineHeight: lh, textAlign: align, color } });
  // *accent words* and _marker words_ may span several words
  let mode = '';
  const html = text.split(/(\s+|<br>)/).map(tok => {
    if (tok === '<br>') return '<br>';
    if (/^\s+$/.test(tok) || tok === '') return tok;
    let word = tok;
    if (!mode && word.startsWith('*')) { mode = 'acc'; word = word.slice(1); }
    else if (!mode && word.startsWith('_')) { mode = 'mk'; word = word.slice(1); }
    const cls = 'w' + (mode ? ' ' + mode : '');
    if (mode === 'acc' && /\*[.,!?…:]*$/.test(word)) { word = word.replace(/\*([.,!?…:]*)$/, '$1'); mode = ''; }
    else if (mode === 'mk' && /_[.,!?…:]*$/.test(word)) { word = word.replace(/_([.,!?…:]*)$/, '$1'); mode = ''; }
    return `<span class="${cls}">${word}</span>`;
  }).join('');
  n.innerHTML = html;
  n._words = [...n.querySelectorAll('.w')];
  return n;
}

// Reveal words of a headline one by one, then hide them all at `out`.
export function revealWords(n, t, a, { stagger = 0.08, out = Infinity, d = 0.5 } = {}) {
  tf(n, {});
  setO(n, t >= a - 0.05 && t < out + 0.8 ? 1 : 0);
  n._words.forEach((w, i) => {
    const k = ease.back(prog(t, a + i * stagger, a + i * stagger + d));
    const ko = ease.inOut(prog(t, out + i * 0.03, out + i * 0.03 + 0.35));
    w.style.display = 'inline-block';
    w.style.opacity = clamp(Math.min(1, prog(t, a + i * stagger, a + i * stagger + d * 0.6)) * (1 - ko));
    w.style.transform = `translateY(${(1 - k) * 60 - ko * 40}px) rotate(${(1 - k) * 6}deg)`;
    if (w.classList.contains('mk')) w.style.setProperty('--mk', clamp(prog(t, a + i * stagger + 0.25, a + i * stagger + 0.7)));
  });
}

export function chip(parent, { text, color = C.accent, x, y, size = 26, solid = false, emoji = '' }) {
  return el(parent, {
    x, y, cls: 'chip', center: true,
    html: `${emoji ? `<span style="font-size:${size}px">${emoji}</span>` : ''}<span>${text}</span>`,
    style: { fontSize: size + 'px', color: solid ? '#fff' : color, background: solid ? color : color + '1a', border: `2px solid ${color}33` },
  });
}

// A to-do card like the app's.
export function taskCard(parent, { x, y, w = 760, title, space, due, remind, list, done = false, center = true, size = 1 }) {
  const sp = typeof space === 'string' ? SPACES[space] : space;
  const meta = [
    sp ? `<span class="meta" style="color:${sp.color};background:${sp.color}14"><span class="dot" style="background:${sp.color}"></span>${sp.name}</span>` : '',
    due ? `<span class="meta">${icon('cal', 22 * size, C.muted)}${due}</span>` : '',
    remind ? `<span class="meta" style="color:${C.amberInk};background:${C.amber}24">${icon('bell', 22 * size, C.amberInk)}${remind}</span>` : '',
    list ? `<span class="meta">${icon('list', 22 * size, C.muted)}${list}</span>` : '',
  ].join('');
  const n = el(parent, {
    x, y, w, center, cls: 'card task',
    html: `<div class="check${done ? ' on' : ''}" style="border-color:${sp ? sp.color : C.accent}">${icon('check', 24 * size, '#fff', 3.4)}</div>
      <div style="min-width:0;flex:1"><div class="ttl" style="font-size:${34 * size}px">${title}</div><div class="metas">${meta}</div></div>`,
  });
  n._check = n.querySelector('.check');
  n._ttl = n.querySelector('.ttl');
  return n;
}
export function setDone(card, k) {
  card._check.classList.toggle('on', k > 0.5);
  card._check.style.transform = `scale(${1 + Math.sin(clamp(k) * Math.PI) * 0.25})`;
  card._ttl.style.setProperty('--strike', clamp(k));
}

export function noteCard(parent, { x, y, w = 760, title, body, space }) {
  const sp = SPACES[space];
  return el(parent, {
    x, y, w, center: true, cls: 'card note',
    html: `<div style="display:flex;align-items:center;gap:12px;color:${sp.color};font-weight:600;font-size:24px">${icon('note', 26, sp.color)} Note · ${sp.name}</div>
      <div style="font-size:32px;font-weight:650;margin-top:10px;letter-spacing:-0.02em">${title}</div>
      <div style="font-size:26px;color:${C.muted};margin-top:6px;line-height:1.35">${body}</div>`,
  });
}

export function spaceTile(parent, { x, y, space, count, w = 300, h = 170 }) {
  const sp = typeof space === 'string' ? SPACES[space] : space;
  return el(parent, {
    x, y, w, h, center: true, cls: 'tile',
    html: `<div style="font-size:52px;line-height:1">${sp.emoji}</div><div style="font-size:34px;font-weight:700;letter-spacing:-0.03em;margin-top:12px">${sp.name}</div>
      ${count !== undefined ? `<div class="cnt" style="font-size:24px;color:${C.muted};font-weight:500;margin-top:2px">${count}</div>` : ''}`,
    style: { background: sp.color + '16', border: `2px solid ${sp.color}30`, color: C.ink },
  });
}

// iPhone-ish frame. Returns { root, screen }.
export function phone(parent, { x, y, scale = 1, w = 470, h = 960 }) {
  const root = el(parent, { x, y, w, h, center: true, cls: 'phone' });
  root._base = '';
  root.style.transformOrigin = 'center';
  const screen = el(root, { x: 14, y: 14, w: w - 28, h: h - 28, cls: 'screen' });
  el(screen, { x: (w - 28) / 2 - 62, y: 14, w: 124, h: 34, style: { background: '#111', borderRadius: '20px', zIndex: 5 } });
  el(screen, {
    x: 34, y: 18, html: '9:41', style: { fontSize: '22px', fontWeight: 650, color: C.ink },
  });
  return { root, screen, scale };
}

// Laptop browser window. Returns { root, body }.
export function browser(parent, { x, y, w = 980, h = 640, url = 'myconfia.app' }) {
  const root = el(parent, { x, y, w, h, center: true, cls: 'browser' });
  el(root, {
    x: 0, y: 0, w, h: 56, style: { background: C.paper2, borderBottom: '1px solid rgba(40,30,20,.08)', display: 'flex', alignItems: 'center', gap: '10px', padding: '0 22px', boxSizing: 'border-box' },
    html: `<i class="tl" style="background:#ff5f57"></i><i class="tl" style="background:#febc2e"></i><i class="tl" style="background:#28c840"></i>
      <div style="margin-left:24px;flex:1;max-width:420px;height:34px;border-radius:10px;background:#fff;display:flex;align-items:center;gap:8px;padding:0 14px;font-size:19px;color:${C.muted}">${icon('lock', 16, C.muted)}${url}</div>`,
  });
  const body = el(root, { x: 0, y: 56, w, h: h - 56 });
  return { root, body };
}

// Notification banner.
export function toast(parent, { x, y, w = 820, title, body, time = 'now' }) {
  return el(parent, {
    x, y, w, center: true, cls: 'toast',
    html: `<div style="flex:none">${logoSvg(76)}</div>
      <div style="flex:1;min-width:0"><div style="display:flex;justify-content:space-between;font-size:23px;color:${C.muted};font-weight:500"><span>MyConfía · Reminder</span><span>${time}</span></div>
      <div style="font-size:31px;font-weight:700;letter-spacing:-0.02em;margin-top:4px">${title}</div>
      ${body ? `<div style="font-size:25px;color:${C.muted};margin-top:2px">${body}</div>` : ''}</div>`,
  });
}

// The capture bar ("Tell MyConfía anything").
export function captureBar(parent, { x, y, w = 820, placeholder = 'Tell MyConfía anything…', size = 1 }) {
  const n = el(parent, {
    x, y, w, center: true, cls: 'capture',
    html: `<div class="ctext" style="flex:1;font-size:${36 * size}px;min-height:${46 * size}px;line-height:1.3"></div>
      <div class="cmic" style="width:${64 * size}px;height:${64 * size}px">${icon('mic', 30 * size, '#fff')}</div>`,
  });
  n._text = n.querySelector('.ctext');
  n._mic = n.querySelector('.cmic');
  n._ph = placeholder;
  return n;
}
export function setCapture(n, html) {
  n._text.innerHTML = html || `<span style="color:${C.faint}">${n._ph}</span>`;
}

// Animated voice waveform bars.
export function waveform(parent, { x, y, bars = 28, w = 520, h = 110, color = C.accent }) {
  const n = el(parent, { x, y, w, h, center: true, style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' } });
  const bs = [...Array(bars)].map(() => {
    const b = document.createElement('div');
    b.style.cssText = `width:${w / bars * 0.55}px;border-radius:99px;background:${color};height:10px`;
    n.appendChild(b); return b;
  });
  n._update = (t, level = 1) => bs.forEach((b, i) => {
    const v = (Math.sin(t * 11 + i * 0.9) * 0.5 + 0.5) * (Math.sin(t * 7.3 + i * 2.1) * 0.5 + 0.5) * Math.sin((i + 1) / (bars + 1) * Math.PI);
    b.style.height = Math.max(10, (0.15 + v * 0.85) * h * level) + 'px';
  });
  return n;
}

// Shared end card: logo, wordmark, tagline, waitlist button.
export function endCard(root, cue, a, { tagline = 'Remembers everything. Reminds you when it matters.', cta = 'Join the waitlist', sub = 'Link in the comments', theme = 'paper' } = {}) {
  const layer = el(root, { x: 0, y: 0, w: 1080, h: 1350, style: { background: theme === 'navy' ? C.navy : C.paper } });
  const glow = el(layer, { x: 540, y: 520, w: 900, h: 900, center: true, style: { borderRadius: '50%', background: `radial-gradient(circle, ${C.amber}55, ${C.amber}00 62%)` } });
  const lg = logo(layer, { x: 540, y: 470, size: 230 });
  const wm = wordmark(layer, { x: 540, y: 690, size: 104, color: theme === 'navy' ? C.cream : C.ink });
  const tg = el(layer, { x: 540, y: 818, w: 900, center: true, html: tagline, style: { fontSize: '40px', textAlign: 'center', color: theme === 'navy' ? '#cfc8bb' : C.muted, fontWeight: 500, letterSpacing: '-0.02em', lineHeight: 1.25 } });
  const btn = el(layer, { x: 540, y: 990, center: true, cls: 'cta', html: `${cta} ${icon('send', 36, '#fff', 2.8)}` });
  const sb = el(layer, { x: 540, y: 1090, center: true, html: sub, style: { fontSize: '28px', color: theme === 'navy' ? '#a8a197' : C.faint, fontWeight: 500 } });
  const plats = el(layer, {
    x: 540, y: 1235, center: true,
    html: `<span>${icon('laptop', 28, 'currentColor')}Web</span><span>${icon('phone', 28, 'currentColor')}Mobile</span><span>${icon('plug', 28, 'currentColor')}Claude (MCP)</span>`,
    style: { display: 'flex', gap: '40px', fontSize: '28px', fontWeight: 600, color: theme === 'navy' ? '#cfc8bb' : C.muted },
  });
  plats.querySelectorAll('span').forEach(s => { s.style.display = 'flex'; s.style.alignItems = 'center'; s.style.gap = '10px'; });
  cue(a, 'whoosh', { len: 0.5 });
  cue(a + 0.35, 'impact', { v: 0.8 });
  cue(a + 1.3, 'pop', { p: 1.2 });
  return t => {
    setO(layer, prog(t, a, a + 0.35));
    layer.style.clipPath = `circle(${ease.inOut(prog(t, a, a + 0.6)) * 110}% at 50% 40%)`;
    show(lg, t, a + 0.3, Infinity, { s: 0.3, y: 0, d: 0.8, e: 'elastic' });
    tf(glow, { s: 0.8 + Math.sin(t * 1.5) * 0.05 + ease.out(prog(t, a + 0.3, a + 1)) * 0.2, o: prog(t, a + 0.3, a + 1) });
    show(wm, t, a + 0.6, Infinity, { y: 40 });
    show(tg, t, a + 0.85, Infinity, { y: 30 });
    const k = show(btn, t, a + 1.3, Infinity, { s: 0.6, y: 20, e: 'back' });
    if (k > 0.99) tf(btn, { s: 1 + Math.sin((t - a) * 4) * 0.025 });
    show(sb, t, a + 1.6, Infinity, { y: 20 });
    show(plats, t, a + 1.9, Infinity, { y: 20 });
  };
}

// Little caption pill at the top ("01 · What is MyConfía").
export function kicker(parent, { x = 540, y = 110, text, color = C.accent }) {
  return el(parent, { x, y, center: true, cls: 'kicker', html: text, style: { color, background: color + '16', border: `2px solid ${color}30` } });
}

// 2x2 board of spaces with their items. groups: [{ space: key|{name,emoji,color}, rows: [[title, meta], ...] }]
export function spaceBoard(root, cue, groups, { a, out = Infinity, top = 540, rowH = 120, h = 380 }) {
  const tiles = groups.map((g, i) => {
    const sp = typeof g.space === 'string' ? SPACES[g.space] : g.space;
    const x = i % 2 ? 790 : 290, y = top + (i < 2 ? 0 : h + 40);
    const n = el(root, { x, y, w: 480, h, center: true, cls: 'tile', style: { background: '#fff', border: `2px solid ${sp.color}30`, boxShadow: '0 14px 40px rgba(40,30,20,.08)' } });
    el(n, { x: 28, y: 24, html: `<span style="font-size:44px">${sp.emoji}</span><span>${sp.name}</span>`, style: { display: 'flex', gap: '14px', alignItems: 'center', fontSize: '38px', fontWeight: 750, letterSpacing: '-0.03em', color: sp.color, whiteSpace: 'nowrap' } });
    n._rows = g.rows.map(([t, m], j) => el(n, {
      x: 28, y: 112 + j * rowH, w: 424,
      html: `<div style="display:flex;gap:16px;align-items:flex-start"><div class="check" style="border-color:${sp.color};width:38px;height:38px"></div><div style="min-width:0"><div style="font-size:31px;font-weight:650;letter-spacing:-0.02em;line-height:1.15">${t}</div><div style="font-size:25px;color:${C.muted};margin-top:5px">${m}</div></div></div>`,
    }));
    cue(a + i * 0.16, 'pop', { p: 0.9 + i * 0.12 });
    n._rows.forEach((_, j) => cue(a + 0.55 + i * 0.16 + j * 0.22, 'tick'));
    return n;
  });
  return t => tiles.forEach((n, i) => {
    show(n, t, a + i * 0.16, out, { s: 0.7, y: 60, e: 'back', oy: 40 });
    n._rows.forEach((r, j) => show(r, t, a + 0.55 + i * 0.16 + j * 0.22, Infinity, { y: 20, x: -20, e: 'out' }));
  });
}

// Simple "Today" screen inside a phone. Returns { header, list, cards[] }.
export function phoneToday(screen, { cards = [], title = 'Today', date = 'Sat, 15 Nov', y0 = 190, gap = 150 }) {
  const header = el(screen, { x: 34, y: 76, html: `<div style="font-size:23px;color:${C.muted};font-weight:500">${date}</div><div style="font-size:56px;font-weight:750;letter-spacing:-0.04em;margin-top:2px">${title}</div>` });
  const list = cards.map((c, i) => taskCard(screen, { x: 34, y: y0 + i * gap, w: 374, center: false, size: 0.72, ...c }));
  return { header, list };
}

export { lerp, clamp };
