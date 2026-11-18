// v2 · 06 · Your data is safe. Claims match PRODUCT_OVERVIEW §3.9 and the Terms (AES at rest, key outside the DB,
// never trains AI, never sold, no ads, Claude can be disconnected). Dark theme, app styling.
import { el, tf, setO, show, prog, rng } from '../engine.js';
import { scene, sceneShow, heading, words, label, endCard, icon } from '../components.js';

export default {
  duration: 19.5,
  poster: 5.6,
  music: { bpm: 90, key: 57, prog: ['i', 'VI', 'III', 'VII'], mood: 'night', drumsFrom: 2.6, level: 0.55 },
  build(root, cue) {
    const s1 = scene(root, 'dark');
    const lb = label(s1, { y: 120, text: 'Privacy', color: 'var(--accent)' });
    const a1 = heading(s1, { y: 260, size: 80, text: 'Your life is personal. *We treat it that way.*' });
    // a note card styled like the app's space page
    const note = el(s1, { x: 540, y: 720, w: 900, center: true, cls: 'card2', style: { padding: '34px 38px', borderLeft: '6px solid #1f9d6b' } });
    note.innerHTML = `<div style="display:flex;align-items:center;gap:10px;font-size:28px;font-weight:650;color:#1f9d6b">${icon('heart', 28, '#1f9d6b')}<span style="text-decoration:underline;text-underline-offset:6px;text-decoration-color:#1f9d6b66">Space: Health</span></div>
      <div class="body" style="font-size:36px;font-weight:500;line-height:1.4;margin-top:16px;min-height:150px"></div>`;
    const body = note.querySelector('.body');
    const plain = 'Results from Dr. Mehta on Friday. Don’t tell Mom until I know more.';
    const R = rng(9), B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    const cipher = 'gAAAAABnZ3kQ' + [...Array(62)].map(() => B64[Math.floor(R() * 64)]).join('') + '==';
    const lock = el(s1, { x: 540, y: 470, w: 120, h: 120, center: true, style: { borderRadius: '34px', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 20px 60px rgba(255,122,51,.4)' }, html: icon('lock', 62, '#1a0f08', 2.4) });
    const l1 = el(s1, { x: 540, y: 1000, center: true, html: `${icon('shield', 34, 'var(--accent)')}Encrypted with AES before it’s stored`, style: { display: 'flex', alignItems: 'center', gap: '14px', fontSize: '36px', fontWeight: 600 } });
    cue(0.3, 'pop', { p: 0.8 }); cue(1.9, 'type', { len: 1.4 }); cue(3.8, 'lock'); cue(4.0, 'glitch', { len: 0.9 }); cue(5.1, 'pop', { p: 0.8 });

    const s2 = scene(root, 'dark');
    const b1 = heading(s2, { y: 260, size: 76, text: 'Even a leaked database shows *only gibberish.*' });
    const db = el(s2, { x: 310, y: 780, w: 420, h: 480, center: true, cls: 'card2', style: { padding: '32px', boxSizing: 'border-box' } });
    db.innerHTML = `<div style="display:flex;align-items:center;gap:12px;font-size:30px;font-weight:650">${icon('db', 32)}Database</div>` +
      [...Array(6)].map(() => `<div class="mono" style="font-size:19px;color:var(--faint);margin-top:18px;white-space:nowrap;overflow:hidden">gAAAAB${[...Array(18)].map(() => B64[Math.floor(R() * 64)]).join('')}</div>`).join('');
    const key = el(s2, { x: 790, y: 780, w: 360, h: 480, center: true, cls: 'card2', style: { padding: '32px', boxSizing: 'border-box', textAlign: 'center', border: '2px dashed color-mix(in srgb, var(--accent) 50%, transparent)' } });
    key.innerHTML = `<div style="display:flex;justify-content:center;margin-top:56px">${icon('key', 116, 'var(--accent)', 1.8)}</div><div style="font-size:32px;font-weight:650;margin-top:40px">The key</div><div style="font-size:25px;color:var(--muted);margin-top:8px;line-height:1.3">kept outside the database</div>`;
    cue(6.8, 'whoosh', { len: 0.5, up: false }); cue(7.2, 'pop', { p: 0.7 }); cue(7.5, 'pop', { p: 0.9 }); cue(8.0, 'lock', { v: 0.6 });

    const s3 = scene(root, 'dark');
    const c1 = heading(s3, { y: 230, size: 84, text: 'Our promises, *in plain words.*' });
    const lab = label(s3, { x: 120, y: 400, text: 'Privacy', size: 24 });
    lab._center = false; lab.style.left = '90px';
    const group = el(s3, { x: 540, y: 740, w: 900, center: true, cls: 'group' });
    group.innerHTML = [['lock', 'Notes encrypted at rest', 'AES, with the key held separately'], ['spark', 'Never used to train AI models', 'Your notes power your assistant, nothing else'], ['eyeOff', 'Never sold. No ads.', 'Not now, not later'], ['plug', 'You stay in control', 'Disconnect Claude from Settings anytime']].map(([ic, t, s]) =>
      `<div class="row" style="font-size:34px"><div style="width:72px;height:72px;border-radius:20px;background:color-mix(in srgb,var(--accent) 14%,transparent);display:flex;align-items:center;justify-content:center;flex:none">${icon(ic, 36, 'var(--accent)')}</div><div style="flex:1"><div class="rt" style="font-weight:650">${t}</div><div class="rm">${s}</div></div>${icon('check', 36, '#4ade80', 3)}</div>`).join('');
    const rows = [...group.children];
    rows.forEach((_, i) => cue(10.7 + i * 0.45, 'pop', { p: 0.8 + i * 0.12 })); cue(12.7, 'chime', { key: 81 });

    const end = endCard(root, cue, 15.4, { theme: 'dark', sub: 'Encrypted. Never sold. Never used to train AI.' });

    return t => {
      sceneShow(s1, t, 0, 6.6);
      show(lb, t, 0.2, Infinity, { y: -10, e: 'out5' }); words(a1, t, 0.3);
      show(note, t, 1.5, Infinity, { y: 80, s: 0.95, e: 'out5' });
      if (t < 4.0) body.textContent = plain.slice(0, Math.round(plain.length * prog(t, 1.9, 3.3)));
      else {
        const k = prog(t, 4.0, 4.9), n = Math.round(cipher.length * k), fr = Math.floor(t * 30);
        let s = cipher.slice(0, n);
        for (let i = n; i < Math.min(cipher.length, n + 12); i++) s += B64[(fr * 7 + i * 13) % 64];
        body.innerHTML = `<span class="mono" style="color:var(--accent);font-size:29px;word-break:break-all">${s}</span>${k < 1 ? `<span style="color:var(--faint)">${plain.slice(Math.min(plain.length, n + 12))}</span>` : ''}`;
      }
      const kl = show(lock, t, 3.65, Infinity, { s: 0.2, y: -50, e: 'back', d: 0.6 });
      if (kl > 0.98) tf(lock, { y: Math.sin(t * 2) * 5 });
      show(l1, t, 5.1, Infinity, { y: 20, e: 'out5' });

      sceneShow(s2, t, 6.6, 10.2);
      words(b1, t, 6.8);
      show(db, t, 7.1, Infinity, { x: -80, y: 0, e: 'out5' });
      show(key, t, 7.4, Infinity, { x: 80, y: 0, e: 'out5' });

      sceneShow(s3, t, 10.2, 15.4);
      words(c1, t, 10.4); show(lab, t, 10.5, Infinity, { y: 0, e: 'out5' });
      show(group, t, 10.6, Infinity, { y: 30, e: 'out5' });
      rows.forEach((r, i) => { const k = prog(t, 10.7 + i * 0.45, 11.1 + i * 0.45); r.style.opacity = k; r.style.transform = `translateX(${(1 - k) * 40}px)`; });
      end(t);
    };
  },
};
