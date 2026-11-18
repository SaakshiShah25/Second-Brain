// 01 · What is MyConfía
import { el, tf, setO, show, prog, ease, lerp, typeText, rng } from '../engine.js';
import { C, SPACES, background, headline, revealWords, captureBar, setCapture, endCard, toast, icon, kicker } from '../components.js';

export default {
  duration: 25.5,
  poster: 13.8,
  music: { bpm: 104, key: 62, prog: ['vi', 'IV', 'I', 'V'], mood: 'bright', drumsFrom: 8.2, arpFrom: 3.3, dips: [[7.9, 0.5, 0.25]] },
  build(root, cue) {
    const bg = background(root, { blobs: [C.amber, C.accent, C.sky, C.pink] });

    // ---------- 1. Hook ----------
    const h1 = headline(root, { x: 540, y: 600, text: 'You wrote it down.', size: 104 });
    const h2 = headline(root, { x: 540, y: 740, text: '…but *where?*', size: 128 });
    cue(0.3, 'pop', { p: 0.8 }); cue(1.5, 'pop', { p: 1.1 });
    const R = rng(4);
    const scraps = [
      ['Notes app', '📝', 170, 250, -8], ['WhatsApp to self', '💬', 820, 230, 6], ['Email draft', '✉️', 150, 1030, 7],
      ['Sticky note', '🟨', 860, 1060, -6], ['Voice memo', '🎙️', 520, 1180, 3], ['Back of a receipt', '🧾', 540, 330, -3],
    ].map(([t, e, x, y, r]) => {
      const n = el(root, { x, y, center: true, cls: 'card', html: `<span style="font-size:40px">${e}</span><span>${t}</span><span style="color:${C.accent};font-weight:800">?</span>`, style: { display: 'flex', gap: '14px', alignItems: 'center', padding: '20px 28px', fontSize: '30px', fontWeight: 650, whiteSpace: 'nowrap' } });
      n._r = r; n._ph = R() * 6; return n;
    });
    scraps.forEach((_, i) => cue(1.75 + i * 0.12, 'blip', { p: 0.8 + i * 0.1, v: 0.7 }));

    // ---------- 2. Life doesn't stop ----------
    const k2 = kicker(root, { y: 120, text: 'Meanwhile, in your head…' });
    const h3 = headline(root, { x: 540, y: 250, text: 'Tomorrow 9 AM: *meet the CEO.*', size: 76 });
    const h4 = headline(root, { x: 540, y: 250, text: 'One head. _Too many tabs._', size: 86 });
    const items = [
      ['Prep the CEO deck', '📊', C.blue], ['Buy a toy for Aarav', '🧸', C.pink], ['1 kg vegetables', '🥦', C.sun],
      ['Call family: Happy Diwali', '🪔', C.pink], ['Workout at 6', '🏃', C.teal], ['Pay electricity bill', '⚡', C.sun],
      ['Reply to Priya', '💬', C.blue], ['Book dentist', '🦷', C.teal], ['That startup idea', '💡', C.accent],
    ];
    const pile = items.map(([t, e, c], i) => {
      const n = el(root, {
        x: 540 + (R() - 0.5) * 420, y: 520 + i * 78 + (R() - 0.5) * 30, center: true, cls: 'card',
        html: `<span style="font-size:38px">${e}</span><span>${t}</span>`,
        style: { display: 'flex', gap: '16px', alignItems: 'center', padding: '20px 30px', fontSize: '34px', fontWeight: 650, whiteSpace: 'nowrap', borderLeft: `8px solid ${c}` },
      });
      n._r = (R() - 0.5) * 16; n._a = 4.1 + i * 0.36;
      cue(n._a + 0.15, 'pop', { p: 0.7 + i * 0.07, v: 0.8, pan: (R() - 0.5) * 0.8 });
      return n;
    });
    cue(3.6, 'pop', { p: 0.9 }); cue(5.9, 'swipe');
    cue(7.55, 'whoosh', { len: 0.6, up: false });

    // ---------- 3. Just tell MyConfía ----------
    const h5 = headline(root, { x: 540, y: 330, text: 'Just *tell* MyConfía.', size: 100 });
    const bar = captureBar(root, { x: 540, y: 700, w: 940 });
    const said = 'CEO meeting tomorrow 9am, prep the deck tonight. Buy a toy for Aarav, 1 kg veggies, call family for Diwali, gym at 6.';
    cue(8.3, 'pop', { p: 1 }); cue(8.9, 'type', { len: 2.3 }); cue(11.35, 'sparkle');

    // ---------- 4. Sorted into spaces ----------
    const h6 = headline(root, { x: 540, y: 200, text: 'It sorts your life *into spaces.*', size: 78 });
    const groups = [
      ['work', [['Meet the CEO', 'Tomorrow · 9:00'], ['Prep the deck', 'Tonight · 🔔 8 PM']]],
      ['family', [['Buy a toy for Aarav', 'This week'], ['Call family 🪔', 'Diwali · 🔔 10 AM']]],
      ['home', [['Groceries list', '1 kg vegetables'], ['Electricity bill', 'Due Friday']]],
      ['health', [['Gym', 'Today · 6:00 PM'], ['Book dentist', 'Saturday']]],
    ];
    const tiles = groups.map(([key, rows], i) => {
      const sp = SPACES[key];
      const x = i % 2 ? 790 : 290, y = i < 2 ? 520 : 960;
      const n = el(root, { x, y, w: 470, h: 400, center: true, cls: 'tile', style: { background: '#fff', border: `2px solid ${sp.color}30`, boxShadow: '0 14px 40px rgba(40,30,20,.08)' } });
      el(n, { x: 28, y: 26, html: `<span style="font-size:44px">${sp.emoji}</span><span>${sp.name}</span>`, style: { display: 'flex', gap: '14px', alignItems: 'center', fontSize: '38px', fontWeight: 750, letterSpacing: '-0.03em', color: sp.color } });
      n._rows = rows.map(([t, m], j) => el(n, {
        x: 28, y: 120 + j * 130, w: 414,
        html: `<div style="display:flex;gap:16px;align-items:flex-start"><div class="check" style="border-color:${sp.color};width:38px;height:38px"></div><div><div style="font-size:31px;font-weight:650;letter-spacing:-0.02em">${t}</div><div style="font-size:24px;color:${C.muted};margin-top:4px">${m}</div></div></div>`,
      }));
      return n;
    });
    tiles.forEach((n, i) => { cue(11.8 + i * 0.18, 'pop', { p: 0.9 + i * 0.12 }); n._rows.forEach((_, j) => cue(12.4 + i * 0.18 + j * 0.25, 'tick')); });

    // ---------- 5. Reminds you ----------
    const h7 = headline(root, { x: 540, y: 260, text: 'And reminds you *before* it matters.', size: 80 });
    const clock = el(root, { x: 540, y: 560, center: true, html: '8:00 PM', style: { fontSize: '170px', fontWeight: 700, whiteSpace: 'nowrap', letterSpacing: '-0.05em', color: C.ink } });
    const t1 = toast(root, { x: 540, y: 820, title: 'Prep the CEO deck', body: 'Meeting tomorrow at 9:00 AM', time: '8:00 PM' });
    const t2 = toast(root, { x: 540, y: 1010, title: 'Call family: Happy Diwali 🪔', body: 'You said you would, this morning', time: '10:00 AM' });
    cue(16.0, 'whoosh', { len: 0.4 }); cue(16.6, 'ding'); cue(17.5, 'ding', { v: 0.8 });

    // ---------- 6. Positioning line ----------
    const h8 = headline(root, { x: 540, y: 560, text: 'Not another to-do app.', size: 84, color: C.muted });
    const h9 = headline(root, { x: 540, y: 740, text: 'A _second brain_ that *remembers everything.*', size: 92 });
    cue(19.4, 'pop', { p: 0.8 }); cue(20.2, 'riser', { len: 1.2 });

    const end = endCard(root, cue, 21.5);

    return t => {
      bg(t);
      // 1
      revealWords(h1, t, 0.3, { out: 3.2 });
      revealWords(h2, t, 1.5, { out: 3.2, stagger: 0.12 });
      scraps.forEach((n, i) => {
        show(n, t, 1.75 + i * 0.12, 3.15, { s: 0.5, y: 30, rr: n._r + Math.sin(t * 1.4 + n._ph) * 3, oy: 0, os: 0.6 });
      });
      // 2
      show(k2, t, 3.5, 7.6, { y: -20 });
      revealWords(h3, t, 3.6, { out: 5.7 });
      revealWords(h4, t, 5.9, { out: 7.6 });
      pile.forEach((n, i) => {
        const a = n._a;
        const kin = ease.out(prog(t, a, a + 0.45));
        const suck = ease.in(prog(t, 7.55, 8.05));
        const y0 = -500 * (1 - kin);
        const jitter = t > 6.6 ? Math.sin(t * 9 + i) * 2.5 * prog(t, 6.6, 7.5) : 0;
        const bx = parseFloat(n.style.left), by = parseFloat(n.style.top);
        tf(n, { x: (540 - bx) * suck + jitter, y: y0 + (700 - by) * suck, r: lerp(n._r * 3, n._r, kin) * (1 - suck) + suck * 90, s: 1 - suck * 0.9, o: Math.min(1, prog(t, a, a + 0.12)) * (1 - prog(t, 7.85, 8.05)) });
      });
      // 3
      revealWords(h5, t, 8.2, { out: 11.3 });
      show(bar, t, 8.3, Infinity, { s: 0.6, y: 0, e: 'back' });
      if (t < 8.9) setCapture(bar, '');
      else if (t < 11.3) typeText(bar._text, said, t, 8.9, 11.1);
      else setCapture(bar, '');
      bar._mic.style.transform = `scale(${1 + (t > 11.1 && t < 11.5 ? Math.sin(prog(t, 11.1, 11.5) * Math.PI) * 0.25 : 0)})`;
      // the bar leaves upward as the spaces arrive
      if (t > 11.4) {
        const k = ease.inOut(prog(t, 11.4, 11.9));
        tf(bar, { y: -1200 * k * 0 - k * 120, s: 1 - k * 0.15, o: 1 - k });
      }
      // 4
      revealWords(h6, t, 11.6, { out: 15.6 });
      tiles.forEach((n, i) => {
        show(n, t, 11.8 + i * 0.18, 15.6, { s: 0.7, y: 60, e: 'back', oy: 40 });
        n._rows.forEach((r, j) => show(r, t, 12.4 + i * 0.18 + j * 0.25, Infinity, { y: 20, x: -20, e: 'out' }));
      });
      // 5
      revealWords(h7, t, 16.0, { out: 19.0 });
      show(clock, t, 16.0, 19.0, { s: 0.8, y: 30 });
      show(t1, t, 16.5, 19.0, { y: -120, s: 0.9, e: 'back' });
      show(t2, t, 17.4, 19.0, { y: -120, s: 0.9, e: 'back' });
      // 6
      revealWords(h8, t, 19.3, { out: 21.4 });
      revealWords(h9, t, 19.9, { out: 21.4, stagger: 0.1 });
      end(t);
    };
  },
};
