// 06 · Your data is safe (navy theme). Claims match PRODUCT_OVERVIEW §3.9 and the Terms: AES encryption at rest,
// key kept outside the database, never used to train AI, never sold, no ads, Claude can be disconnected.
import { el, tf, setO, show, prog, ease, lerp, rng } from '../engine.js';
import { C, background, headline, revealWords, endCard, icon, kicker } from '../components.js';

export default {
  duration: 18.5,
  poster: 7.8,
  music: { bpm: 90, key: 57, prog: ['i', 'VI', 'III', 'VII'], mood: 'deep', drumsFrom: 2.8, level: 0.55 },
  build(root, cue) {
    const bg = background(root, { theme: 'navy', blobs: [C.accent, C.amber, C.blue, C.amber] });
    const cream = C.cream;
    const k = kicker(root, { y: 110, text: 'Your data, protected', color: C.amber });
    const h1 = headline(root, { x: 540, y: 270, text: 'Your life is personal. *We treat it that way.*', size: 80, color: cream });
    cue(0.2, 'pop', { p: 0.7 }); cue(0.9, 'pop', { p: 0.9 });

    // note → ciphertext
    const note = el(root, { x: 540, y: 700, w: 880, center: true, style: { background: '#fff', borderRadius: '32px', padding: '36px 40px', boxShadow: '0 30px 80px rgba(0,0,0,.35)' } });
    note.innerHTML = `<div style="display:flex;align-items:center;gap:12px;font-size:24px;font-weight:650;color:${C.teal}">${icon('note', 26, C.teal)}Note · Health</div>
      <div class="body" style="font-size:38px;font-weight:620;letter-spacing:-0.02em;line-height:1.35;margin-top:14px;min-height:154px"></div>`;
    const body = note.querySelector('.body');
    const plain = 'Results from Dr. Mehta on Friday. Don’t tell Mom until I know more.';
    const R = rng(9);
    const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    const cipher = 'gAAAAABnZ3kQ' + [...Array(64)].map(() => B64[Math.floor(R() * 64)]).join('') + '==';
    const lock = el(root, { x: 540, y: 470, w: 130, h: 130, center: true, style: { borderRadius: '36px', background: C.amber, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 20px 60px ${C.amber}66` }, html: icon('lock', 70, C.navy, 2.4) });
    const lbl = el(root, { x: 540, y: 1000, center: true, html: `${icon('shield', 34, C.amber)}Encrypted with AES before it’s stored`, style: { display: 'flex', alignItems: 'center', gap: '14px', fontSize: '36px', fontWeight: 650, color: cream } });

    // database + key, kept apart
    const h2 = headline(root, { x: 540, y: 270, text: 'Even a leaked database shows *only gibberish.*', size: 76, color: cream });
    const db = el(root, { x: 300, y: 760, w: 400, h: 470, center: true, style: { background: C.navy2, borderRadius: '36px', border: '2px solid rgba(245,239,227,.12)', padding: '30px', boxSizing: 'border-box' } });
    db.innerHTML = `<div style="display:flex;align-items:center;gap:12px;font-size:30px;font-weight:700;color:${cream}">${icon('db', 34, cream)}Database</div>` +
      [...Array(6)].map(() => `<div class="mono" style="font-size:19px;color:#8f89b5;margin-top:18px;white-space:nowrap;overflow:hidden">${'gAAAAB' + [...Array(18)].map(() => B64[Math.floor(R() * 64)]).join('')}</div>`).join('');
    const key = el(root, { x: 790, y: 760, w: 340, h: 470, center: true, style: { background: C.navy2, borderRadius: '36px', border: `2px dashed ${C.amber}66`, padding: '30px', boxSizing: 'border-box', textAlign: 'center' } });
    key.innerHTML = `<div style="display:flex;justify-content:center;margin-top:60px">${icon('key', 120, C.amber, 1.8)}</div><div style="font-size:32px;font-weight:700;color:${cream};margin-top:40px">The key</div><div style="font-size:25px;color:#b9b2c9;margin-top:8px;line-height:1.3">kept outside the database</div>`;
    const wall = el(root, { x: 590, y: 760, w: 6, h: 420, center: true, style: { background: `repeating-linear-gradient(${C.amber} 0 14px, transparent 14px 26px)`, borderRadius: '3px' } });

    // promises
    const h3 = headline(root, { x: 540, y: 270, text: 'Our promises, *in plain words.*', size: 84, color: cream });
    const promises = [
      ['lock', 'Notes encrypted at rest', 'AES, with the key held separately'],
      ['spark', 'Never used to train AI models', 'Your notes power your assistant, nothing else'],
      ['eyeOff', 'Never sold. No ads.', 'Not now, not later'],
      ['plug', 'You stay in control', 'Disconnect Claude from Settings anytime'],
    ].map(([ic, t, s], i) => el(root, {
      x: 540, y: 520 + i * 170, w: 900, center: true,
      html: `<div style="width:76px;height:76px;border-radius:24px;background:${C.amber}22;display:flex;align-items:center;justify-content:center;flex:none">${icon(ic, 40, C.amber, 2.2)}</div>
        <div><div style="font-size:36px;font-weight:700;letter-spacing:-0.02em;color:${cream}">${t}</div><div style="font-size:25px;color:#b9b2c9;margin-top:4px">${s}</div></div>
        <div style="margin-left:auto">${icon('check', 40, C.green, 3)}</div>`,
      style: { display: 'flex', alignItems: 'center', gap: '26px', padding: '26px 30px', background: C.navy2, borderRadius: '28px', border: '1.5px solid rgba(245,239,227,.1)', boxSizing: 'border-box' },
    }));

    cue(1.8, 'whoosh', { len: 0.5 }); cue(2.2, 'type', { len: 1.4 });
    cue(4.0, 'lock'); cue(4.25, 'glitch', { len: 0.9 }); cue(5.2, 'pop', { p: 0.8 });
    cue(7.0, 'whoosh', { len: 0.5, up: false }); cue(7.4, 'pop', { p: 0.7 }); cue(7.7, 'pop', { p: 0.9 }); cue(8.2, 'lock', { v: 0.6 });
    promises.forEach((_, i) => cue(10.8 + i * 0.45, 'pop', { p: 0.8 + i * 0.12 }));
    cue(12.8, 'chime', { key: 81 });

    const end = endCard(root, cue, 14.6, { theme: 'navy', tagline: 'Encrypted, never sold, never used to train AI.<br>Just your second brain.' });

    return t => {
      bg(t);
      show(k, t, 0.1, 14.5, { y: -20 });
      revealWords(h1, t, 0.2, { out: 6.7 });
      revealWords(h2, t, 7.0, { out: 10.2 });
      revealWords(h3, t, 10.4, { out: 14.3 });
      show(note, t, 1.8, 6.8, { y: 120, s: 0.9 });
      // type the note, then scramble into ciphertext
      if (t < 4.2) {
        const n = Math.round(plain.length * prog(t, 2.2, 3.6));
        body.textContent = plain.slice(0, n);
        body.className = 'body'; body.style.color = C.ink;
      } else {
        const kk = prog(t, 4.25, 5.1);
        const n = Math.round(cipher.length * kk);
        const frame = Math.floor(t * 30);
        let s = cipher.slice(0, n);
        for (let i = n; i < Math.min(cipher.length, n + 14); i++) s += B64[(frame * 7 + i * 13) % 64];
        const rest = plain.slice(Math.min(plain.length, n + 14));
        body.innerHTML = `<span class="mono" style="color:#7c6fd6;font-size:30px;word-break:break-all">${s}</span>${kk < 1 ? `<span style="color:${C.faint}">${rest}</span>` : ''}`;
      }
      const kl = show(lock, t, 3.85, 6.8, { s: 0.2, y: -60, e: 'elastic', d: 0.8 });
      if (kl > 0.98) tf(lock, { y: Math.sin(t * 2) * 6 });
      show(lbl, t, 5.2, 6.8, { y: 30 });
      show(db, t, 7.3, 10.2, { x: -100, y: 0 });
      show(key, t, 7.6, 10.2, { x: 100, y: 0 });
      show(wall, t, 8.1, 10.2, { y: 0, s: 0.3 });
      promises.forEach((p, i) => show(p, t, 10.8 + i * 0.45, 14.3, { x: 60, y: 0 }));
      end(t);
    };
  },
};
