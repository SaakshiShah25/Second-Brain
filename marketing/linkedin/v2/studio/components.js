// v2 components: everything uses the app's own tokens (frontend/src/styles/index.css) in light AND dark,
// and the devices play back frames recorded from the real app (capture/takes).
import { el, tf, setO, show, prog, ease, lerp, clamp } from './engine.js';

export const SPACE_COLORS = { Work: '#3477c9', Family: '#c93b8f', Home: '#d9731f', Health: '#1f9d6b', 'Side project': '#7c5cd8' };

// lucide icons used by the app
const P = {
  check: '<path d="M20 6 9 17l-5-5"/>',
  send: '<path d="M5 12h14M12 5l7 7-7 7"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  mic: '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v3"/>',
  lock: '<rect width="18" height="11" x="3" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  key: '<circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6M15.5 7.5l3 3L22 7l-3-3"/>',
  spark: '<path d="M12 3l1.9 5.8L20 11l-6.1 2.2L12 19l-1.9-5.8L4 11l6.1-2.2z"/>',
  db: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14a9 3 0 0 0 18 0V5"/><path d="M3 12a9 3 0 0 0 18 0"/>',
  shield: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>',
  plug: '<path d="M12 22v-5M9 8V2M15 8V2M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8z"/>',
  laptop: '<rect width="18" height="12" x="3" y="4" rx="2"/><path d="M2 20h20"/>',
  phone: '<rect width="14" height="20" x="5" y="2" rx="2"/><path d="M12 18h.01"/>',
  chat: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  eyeOff: '<path d="M9.9 4.2A10 10 0 0 1 12 4c7 0 10 8 10 8a13 13 0 0 1-1.7 2.7M6.6 6.6A13 13 0 0 0 2 12s3 8 10 8a9.7 9.7 0 0 0 5.4-1.6M2 2l20 20"/><path d="M14.1 14.1a3 3 0 0 1-4.2-4.2"/>',
  briefcase: '<path d="M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/><rect width="20" height="14" x="2" y="6" rx="2"/>',
  home: '<path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  heart: '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>',
  flag: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><path d="M4 22v-7"/>',
  rocket: '<path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/>',
  grad: '<path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/>',
  dumbbell: '<path d="M14.4 14.4 9.6 9.6M18.657 21.485a2 2 0 1 1-2.829-2.828l-1.767 1.768a2 2 0 1 1-2.829-2.829l6.364-6.364a2 2 0 1 1 2.829 2.829l-1.768 1.767a2 2 0 1 1 2.828 2.829zM21.5 21.5l-1.4-1.4M3.9 3.9 2.5 2.5M6.404 12.768a2 2 0 1 1-2.829-2.829l1.768-1.767a2 2 0 1 1-2.828-2.829l2.828-2.828a2 2 0 1 1 2.829 2.828l1.767-1.768a2 2 0 1 1 2.829 2.829z"/>',
  wallet: '<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>',
  user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
};
export const icon = (name, size = 24, color = 'currentColor', sw = 2.2) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" style="display:block;flex:none">${P[name]}</svg>`;

// The app's brand mark (components/ConfiaLogo.tsx): open arc in currentColor + amber dot.
export const mark = (size = 64, color = 'var(--accent)') => `<svg width="${size}" height="${size}" viewBox="0 0 86 86" fill="none" style="display:block;color:${color}"><path d="M62 20C54 13 43 12 34 17C21 24 16 39 23 52C30 65 46 70 59 63" stroke="currentColor" stroke-width="9" stroke-linecap="round"/><circle cx="63" cy="60" r="9" fill="#E9A73B"/></svg>`;
// The app header lock-up: mark + "MyConfía".
export const lockup = (size = 60) => `<span style="display:inline-flex;align-items:center;gap:${size * 0.22}px;font-weight:700;letter-spacing:-0.035em;font-size:${size}px;color:var(--ink)">${mark(size * 1.05)}MyConfía</span>`;

// ---------- scenes ----------
// A full-frame layer in one theme. Everything inside uses the theme's variables.
export function scene(root, theme = 'light') {
  const n = el(root, { x: 0, y: 0, w: 1080, h: 1350, cls: `scene ${theme}` });
  n._theme = theme;
  return n;
}
// Cross-fade/slide a scene in at a, out at b.
export function sceneShow(n, t, a, b = Infinity, { wipe = false } = {}) {
  const kin = ease.inOut(prog(t, a, a + 0.5));
  const kout = ease.inOut(prog(t, b, b + 0.5));
  const vis = t >= a && t < b + 0.5;
  n.style.visibility = vis ? 'visible' : 'hidden';
  if (wipe) { n.style.opacity = 1; n.style.clipPath = `circle(${kin * 150}% at 50% 100%)`; }
  else { n.style.opacity = kin; n.style.clipPath = ''; }
  if (kout > 0) n.style.opacity = (wipe ? 1 : kin) * (1 - kout);
}

// ---------- type ----------
// App-style heading. *word* = accent colour (like "Good morning, *Aanya*").
export function heading(parent, { x = 540, y, w = 960, size = 88, text, align = 'center', color = 'var(--ink)', weight = 700, lh = 1.05 }) {
  const n = el(parent, { x, y, w, center: true, style: { fontSize: size + 'px', fontWeight: weight, letterSpacing: '-0.04em', lineHeight: lh, textAlign: align, color } });
  let mode = false;
  n.innerHTML = text.split(/(\s+|<br>)/).map(tok => {
    if (tok === '<br>') return '<br>';
    if (/^\s+$/.test(tok) || !tok) return tok;
    let w2 = tok; const startAcc = !mode && w2.startsWith('*');
    if (startAcc) { mode = true; w2 = w2.slice(1); }
    const cls = mode ? 'w acc' : 'w';
    if (mode && /\*[.,!?…:’']*$/.test(w2)) { w2 = w2.replace(/\*([.,!?…:’']*)$/, '$1'); mode = false; }
    return `<span class="${cls}">${w2}</span>`;
  }).join('');
  n._words = [...n.querySelectorAll('.w')];
  return n;
}
export function words(n, t, a, { stagger = 0.07, out = Infinity, d = 0.45 } = {}) {
  tf(n, {});
  setO(n, t >= a - 0.05 && t < out + 0.8 ? 1 : 0);
  n._words.forEach((w, i) => {
    const s0 = a + i * stagger;
    const k = ease.out5(prog(t, s0, s0 + d));
    const ko = ease.inOut(prog(t, out + i * 0.025, out + i * 0.025 + 0.3));
    w.style.opacity = clamp(prog(t, s0, s0 + d * 0.5) * (1 - ko));
    w.style.transform = `translateY(${(1 - k) * 0.5}em) `;
    w.style.filter = `blur(${(1 - k) * 8 + ko * 6}px)`;
  });
}
// Section label like the app's "TODAY · 4".
export function label(parent, { x = 540, y, text, color = 'var(--faint)', size = 26 }) {
  return el(parent, { x, y, center: true, html: text, style: { fontSize: size + 'px', fontWeight: 650, letterSpacing: '0.08em', textTransform: 'uppercase', color, whiteSpace: 'nowrap' } });
}

// ---------- app-like pieces ----------
// A grouped list card like the app's (white card, hairline dividers), rows: { title, meta, accentMeta, space, done }
export function listGroup(parent, { x = 540, y, w = 900, rows, size = 1 }) {
  const n = el(parent, { x, y, w, center: true, cls: 'group' });
  n._rows = rows.map(r => {
    const row = document.createElement('div');
    row.className = 'row';
    row.style.fontSize = 34 * size + 'px';
    const sc = r.space ? SPACE_COLORS[r.space] ?? r.color : null;
    row.innerHTML = `<div class="ring${r.done ? ' on' : ''}" style="${r.ring ? `border-color:${r.ring}` : ''}">${icon('check', 22 * size, '#fff', 3.4)}</div>
      <div style="flex:1;min-width:0"><div class="rt">${r.title}</div>
      <div class="rm">${r.meta ?? ''}${r.accentMeta ? ` <span style="color:var(--accent)">· ${icon('bell', 20 * size, 'var(--accent)')} ${r.accentMeta}</span>` : ''}</div></div>
      ${sc ? `<span class="pill" style="color:${sc};background:${sc}1c">${r.space}</span>` : ''}${r.bell ? icon('bell', 30 * size, 'var(--accent)') : ''}`;
    n.appendChild(row);
    return row;
  });
  return n;
}
export function tick(row, k) {
  const ring = row.querySelector('.ring');
  ring.classList.toggle('on', k > 0.4);
  ring.style.transform = `scale(${1 + Math.sin(clamp(k) * Math.PI) * 0.25})`;
  row.querySelector('.rt').style.setProperty('--strike', clamp((k - 0.3) / 0.7));
  row.querySelector('.rt').style.color = k > 0.5 ? 'var(--faint)' : '';
}
// Space filter chip like the app's bottom chips ("Work 4").
export function spaceChip(parent, { x, y, name, count, color, iconName = 'briefcase', solid = false, size = 30 }) {
  const c = color ?? SPACE_COLORS[name] ?? '#78716c';
  return el(parent, {
    x, y, center: true, cls: 'chipx',
    html: `${icon(iconName, size, solid ? '#fff' : c)}<span>${name}</span>${count !== undefined ? `<span style="opacity:.6">${count}</span>` : ''}`,
    style: { fontSize: size + 'px', color: solid ? '#fff' : 'var(--ink)', background: solid ? c : 'var(--card)', borderColor: solid ? c : 'var(--border-strong)' },
  });
}

// iOS-style notification with the real app icon.
export function banner(parent, { x = 540, y, w = 900, title, body, time = 'now' }) {
  return el(parent, {
    x, y, w, center: true, cls: 'banner',
    html: `<img src="../assets/app-icon.png" style="width:84px;height:84px;border-radius:20px;flex:none">
      <div style="flex:1;min-width:0"><div style="display:flex;justify-content:space-between;font-size:24px;color:var(--muted);font-weight:500"><span style="font-weight:650;color:var(--ink);letter-spacing:0.02em">MYCONFÍA</span><span>${time}</span></div>
      <div style="font-size:32px;font-weight:650;letter-spacing:-0.02em;margin-top:4px;color:var(--ink)">${title}</div>
      ${body ? `<div style="font-size:27px;color:var(--muted);margin-top:2px">${body}</div>` : ''}</div>`,
  });
}

// ---------- devices that play real recorded frames ----------
const TAKES = '../../capture/takes/';
export const preload = [];
const src = (take, i) => `${TAKES}${take}/${String(i).padStart(4, '0')}.png`;
export function registerTake(take, frames) { for (let i = 1; i <= frames; i++) preload.push(src(take, i)); }

// Frame index helper: play frames f0..f1 between a and b (clamped).
export const frameAt = (t, a, b, f0, f1) => Math.round(lerp(f0, f1, prog(t, a, b)));

export function phoneDevice(parent, { x, y, h = 1000, frames = {} }) {
  const sw = Math.round((h - 30) * 402 / 874), w = sw + 30;
  const root = el(parent, { x, y, w, h, center: true, cls: 'device phone' });
  const img = el(root, { tag: 'img', x: 15, y: 15, w: sw, h: h - 30, style: { borderRadius: '50px', objectFit: 'cover', background: '#000' } });
  el(root, { x: w / 2 - 55, y: 26, w: 110, h: 30, style: { background: '#000', borderRadius: '20px' } });
  for (const [take, n] of Object.entries(frames)) registerTake(take, n);
  root._set = (take, i) => { const s = src(take, Math.max(1, i)); if (img._s !== s) { img.src = s; img._s = s; } };
  root._w = w;
  return root;
}
export function laptopDevice(parent, { x, y, w = 1000, frames = {} }) {
  const sw = w - 36, sh = Math.round(sw * 900 / 1440);
  const root = el(parent, { x, y, w: w + 80, h: sh + 70, center: true });
  const lid = el(root, { x: 40, y: 0, w, h: sh + 36, cls: 'device laptop' });
  const img = el(lid, { tag: 'img', x: 18, y: 18, w: sw, h: sh, style: { borderRadius: '8px', objectFit: 'cover', background: '#000' } });
  el(root, { x: 0, y: sh + 36, w: w + 80, h: 22, style: { background: 'linear-gradient(#d6d3ce,#a8a49d)', borderRadius: '0 0 26px 26px', boxShadow: '0 30px 60px rgba(0,0,0,.25)' } });
  el(root, { x: (w + 80) / 2 - 80, y: sh + 36, w: 160, h: 10, style: { background: '#8e8a83', borderRadius: '0 0 10px 10px' } });
  for (const [take, n] of Object.entries(frames)) registerTake(take, n);
  root._set = (take, i) => { const s = src(take, Math.max(1, i)); if (img._s !== s) { img.src = s; img._s = s; } };
  return root;
}
// A single still from a take (e.g. the MCP view), shown as a card.
export function still(parent, { x, y, w, take, frame = 1, radius = 24 }) {
  registerTake(take, frame);
  const n = el(parent, { tag: 'img', x, y, w, center: true, style: { borderRadius: radius + 'px', display: 'block' } });
  n.src = src(take, frame);
  return n;
}

// ---------- end card (no call to action: only the waitlist video asks for anything) ----------
export function endCard(root, cue, a, { theme = 'light', line1 = 'You’re not one person.', line2 = 'You’re *five.*', sub = 'MyConfía remembers for all of them.', cta = null } = {}) {
  const s = scene(root, theme);
  const lg = el(s, { x: 540, y: 400, center: true, html: mark(230) });
  const wm = el(s, { x: 540, y: 580, center: true, html: `<span style="font-weight:700;letter-spacing:-0.045em;font-size:96px">MyConfía</span>` });
  const h1 = heading(s, { y: 760, size: 64, text: line1, color: 'var(--muted)', weight: 600 });
  const h2 = heading(s, { y: 850, size: 92, text: line2 });
  const sb = el(s, { x: 540, y: 960, center: true, html: sub, style: { fontSize: '36px', color: 'var(--muted)', fontWeight: 500, letterSpacing: '-0.02em' } });
  const btn = cta ? el(s, { x: 540, y: 1090, center: true, cls: 'cta', html: cta }) : null;
  const plats = el(s, {
    x: 540, y: 1250, center: true,
    html: `<span>${icon('laptop', 30)}Web</span><span>${icon('phone', 30)}Mobile</span><span>${icon('plug', 30)}Claude</span>`,
    style: { display: 'flex', gap: '44px', fontSize: '30px', fontWeight: 600, color: 'var(--faint)' },
  });
  plats.querySelectorAll('span').forEach(x => { x.style.cssText = 'display:flex;align-items:center;gap:10px'; });
  cue(a, 'whoosh', { len: 0.5 }); cue(a + 0.35, 'impact', { v: 0.7 }); if (cta) cue(a + 1.8, 'pop', { p: 1.2 });
  return t => {
    sceneShow(s, t, a);
    const k = show(lg, t, a + 0.3, Infinity, { s: 0.4, y: 0, d: 0.9, e: 'back', r: -40 });
    if (k > 0.99) tf(lg, { r: Math.sin((t - a) * 1.5) * 3 });
    show(wm, t, a + 0.55, Infinity, { y: 30, e: 'out5' });
    words(h1, t, a + 0.9);
    words(h2, t, a + 1.2);
    show(sb, t, a + 1.6, Infinity, { y: 20, e: 'out5' });
    if (btn) { const kb = show(btn, t, a + 1.8, Infinity, { s: 0.7, y: 20 }); if (kb > 0.99) tf(btn, { s: 1 + Math.sin((t - a) * 4) * 0.02 }); }
    show(plats, t, a + 1.9, Infinity, { y: 20, e: 'out5' });
  };
}

export { lerp, clamp };

// ---------- camera: push in on part of the screen ----------
// keys: [[time, scale, focusX, focusY, screenX = 540, screenY = 760], ...] in stage coordinates (unzoomed).
export function camera(parent) {
  const n = el(parent, { x: 0, y: 0, w: 1080, h: 1350 });
  n.style.transformOrigin = '0 0';
  return n;
}
export function aim(cam, t, keys) {
  let a = keys[0], b = keys[0];
  for (let i = 0; i < keys.length; i++) { if (t >= keys[i][0]) { a = keys[i]; b = keys[i + 1] ?? keys[i]; } }
  if (t < keys[0][0]) b = a;
  const k = b === a ? 0 : ease.inOut(prog(t, a[0], b[0]));
  const s = lerp(a[1], b[1], k), px = lerp(a[2], b[2], k), py = lerp(a[3], b[3], k);
  const cx = lerp(a[4] ?? 540, b[4] ?? 540, k), cy = lerp(a[5] ?? 760, b[5] ?? 760, k);
  cam.style.transform = `translate(${cx - px * s}px, ${cy - py * s}px) scale(${s})`;
}
// Fade at the top of a scene so captions stay readable over a zoomed device.
export function topFade(parent, h = 330) {
  return el(parent, { x: 0, y: 0, w: 1080, h, style: { background: 'linear-gradient(var(--bg) 62%, color-mix(in srgb, var(--bg) 0%, transparent))', pointerEvents: 'none' } });
}

// ---------- voice takes: home → recording (live transcript) → send → reply, timed from the take's own marks ----------
import { TAKE } from './takes-index.js';
export const takeFrames = take => TAKE[take].frames;
export function voiceFrame(take, t, start, spoken, replyEnd) {
  const M = TAKE[take].marks;
  if (t < start) return M.home;
  if (t < spoken) return frameAt(t, start, spoken - 0.1, M.recording, M.spoken);
  if (t < spoken + 0.35) return M.finished;
  if (t < spoken + 0.7) return M.sent;
  if (t < spoken + 1.0) return Math.min(M.sent + 1, M.reply);
  return frameAt(t, spoken + 1.0, replyEnd ?? spoken + 1.0, M.reply, M.replyEnd);
}

// ---------- live voice caption: what's being said, big enough to read in the feed ----------
export function voiceCaption(parent, { y = 360, text }) {
  const n = el(parent, { x: 540, y, w: 940, center: true, cls: 'card2', style: { padding: '26px 32px', display: 'flex', gap: '22px', alignItems: 'flex-start', border: '2px solid color-mix(in srgb, var(--accent) 40%, transparent)' } });
  n.innerHTML = `<div class="vmic" style="width:64px;height:64px;border-radius:50%;background:var(--accent);display:flex;align-items:center;justify-content:center;flex:none">${icon('mic', 32, '#fff', 2.4)}</div><div class="vtx" style="font-size:38px;font-weight:550;line-height:1.3;letter-spacing:-0.02em;padding-top:6px"></div>`;
  const words = text.split(' '), vtx = n.querySelector('.vtx'), vmic = n.querySelector('.vmic');
  n._update = (t, start, spoken) => {
    show(n, t, start, spoken + 0.9, { y: 20, s: 0.96, e: 'out5', od: 0.35 });
    const k = Math.round(words.length * prog(t, start + 0.1, spoken - 0.1));
    vtx.innerHTML = `“${words.slice(0, k).join(' ')}<span style="opacity:.25">${k < words.length ? ' ' + words.slice(k).join(' ') : ''}</span>”`;
    vmic.style.transform = `scale(${t < spoken ? 1 + Math.sin(t * 9) * 0.06 : 1})`;
  };
  return n;
}
