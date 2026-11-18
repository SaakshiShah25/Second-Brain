// Tiny deterministic animation engine.
// Every video is a pure function of time: update(t) sets every element's state for that instant,
// so the live preview and the frame-by-frame MP4 render are identical.

export const W = 1080, H = 1350;

export const clamp = (v, a = 0, b = 1) => (Number.isNaN(v) ? a : Math.min(b, Math.max(a, v)));
export const lerp = (a, b, k) => a + (b - a) * k;
export const prog = (t, a, b) => (a === Infinity ? 0 : b <= a ? (t >= a ? 1 : 0) : clamp((t - a) / (b - a)));

export const ease = {
  linear: k => k,
  out: k => 1 - Math.pow(1 - k, 3),
  out5: k => 1 - Math.pow(1 - k, 5),
  in: k => k * k * k,
  inOut: k => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2),
  back: k => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2); },
  backSoft: k => { const c1 = 1.1, c3 = c1 + 1; return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2); },
  elastic: k => (k === 0 || k === 1 ? k : Math.pow(2, -10 * k) * Math.sin((k * 10 - 0.75) * (2 * Math.PI / 3)) + 1),
};

// Seeded RNG so "random" layouts are the same on every render.
export function rng(seed = 1) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// Create an absolutely positioned element.
export function el(parent, { tag = 'div', cls = '', html = '', style = {}, x, y, w, h, center = false } = {}) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html) n.innerHTML = html;
  n.style.position = 'absolute';
  if (x !== undefined) n.style.left = x + 'px';
  if (y !== undefined) n.style.top = y + 'px';
  if (w !== undefined) n.style.width = w + 'px';
  if (h !== undefined) n.style.height = h + 'px';
  Object.assign(n.style, style);
  if (center && w === undefined) n.style.width = 'max-content';
  n._center = center; // translate(-50%,-50%) so x,y is the centre
  n._base = '';
  parent.appendChild(n);
  return n;
}

// Set transform from parts, keeping the element's centring and base transform.
export function tf(n, { x = 0, y = 0, s = 1, r = 0, sx, sy, o } = {}) {
  const c = n._center ? 'translate(-50%,-50%) ' : '';
  const sc = sx !== undefined || sy !== undefined ? `scale(${sx ?? s},${sy ?? s})` : `scale(${s})`;
  n.style.transform = `${c}translate(${x}px,${y}px) ${sc} rotate(${r}deg) ${n._base}`;
  if (o !== undefined) setO(n, o);
}

export function setO(n, o) {
  o = clamp(o);
  n.style.opacity = o;
  n.style.visibility = o <= 0.002 ? 'hidden' : 'visible';
}

// The workhorse: element enters at `a`, leaves at `b`.
// opts: d (in duration), od (out duration), y/x (entry offset), oy/ox (exit offset), s (entry scale),
//       os (exit scale), r (entry rotation), rr (resting rotation), e (entry easing), blur
export function show(n, t, a, b = Infinity, o = {}) {
  const d = o.d ?? 0.55, od = o.od ?? 0.4;
  const e = ease[o.e ?? 'back'];
  const kIn = prog(t, a, a + d);
  const pin = e(kIn);
  const pout = ease.inOut(prog(t, b, b + od));
  const x = (o.x ?? 0) * (1 - pin) + (o.ox ?? 0) * pout;
  const y = (o.y ?? 50) * (1 - pin) + (o.oy ?? -30) * pout;
  const sIn = o.s ?? 0.92;
  const s = lerp(sIn, 1, pin) * lerp(1, o.os ?? 0.96, pout);
  const r = (o.r ?? 0) * (1 - pin) + (o.rr ?? 0);
  const op = Math.min(ease.out(kIn) * 1.15, 1) * (1 - pout);
  tf(n, { x, y, s, r, o: op });
  if (o.blur) n.style.filter = `blur(${(1 - ease.out(kIn)) * o.blur + pout * o.blur}px)`;
  return pin * (1 - pout);
}

// Type text out character by character between a and b.
export function typeText(n, text, t, a, b, caret = true) {
  const k = prog(t, a, b);
  const len = Math.round(text.length * k);
  const blink = caret && (k < 1 ? true : Math.floor(t * 2.2) % 2 === 0) && t >= a - 0.2;
  n.innerHTML = escapeHtml(text.slice(0, len)) + (blink ? '<span class="caret"></span>' : '');
  return len;
}

export function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Cue list for the sound engine. Videos call cue(t, type, opts) while building.
export function makeCues() {
  const list = [];
  const cue = (t, type, opts = {}) => { list.push({ t, type, ...opts }); };
  return { list, cue };
}
