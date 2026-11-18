// Shared storyboard for the persona videos:
// title card → the mess in their head → one voice capture → sorted spaces → a timely reminder → closing line → end card.
import { el, tf, setO, show, prog, ease, lerp, typeText, rng } from './engine.js';
import { C, background, headline, revealWords, captureBar, setCapture, endCard, toast, kicker, spaceBoard, icon } from './components.js';

export function persona(p) {
  return {
    duration: 19,
    poster: 10.6,
    music: p.music,
    build(root, cue) {
      const bg = background(root, { blobs: p.blobs });
      const R = rng(p.seed ?? 3);

      // 1. title
      const k = kicker(root, { y: 110, text: 'MyConfía for…', color: p.color });
      const avatar = el(root, { x: 540, y: 470, w: 260, h: 260, center: true, html: p.emoji, style: { borderRadius: '50%', background: p.color + '1f', border: `4px solid ${p.color}40`, fontSize: '140px', display: 'flex', alignItems: 'center', justifyContent: 'center' } });
      const title = headline(root, { x: 540, y: 740, text: p.title, size: 104 });
      const sub = el(root, { x: 540, y: 920, w: 900, center: true, html: p.sub, style: { fontSize: '42px', color: C.muted, textAlign: 'center', fontWeight: 500, letterSpacing: '-0.02em', lineHeight: 1.3 } });
      cue(0.2, 'pop', { p: 0.8 }); cue(0.4, 'impact', { v: 0.5 }); cue(1.3, 'pop', { p: 1.1 });

      // 2. the mess
      const h2 = headline(root, { x: 540, y: 250, text: p.messLine, size: 84 });
      const slots = [[300, 520], [780, 560], [270, 760], [790, 800], [330, 1010], [760, 1050]];
      const mess = p.mess.map((txt, i) => {
        const x = 540 + (i % 2 ? 1 : -1) * (90 + R() * 50), y = 470 + i * 128;
        const n = el(root, { x, y, center: true, cls: 'card', html: txt, style: { padding: '22px 30px', fontSize: '33px', fontWeight: 650, whiteSpace: 'nowrap', borderLeft: `8px solid ${p.color}`, letterSpacing: '-0.02em' } });
        n._r = (R() - 0.5) * 12; n._ph = R() * 6;
        cue(3.2 + i * 0.28, 'pop', { p: 0.75 + i * 0.09, pan: x > 540 ? 0.5 : -0.5 });
        return n;
      });

      // 3. capture
      const h3 = headline(root, { x: 540, y: 330, text: 'Say it once.', size: 100 });
      const bar = captureBar(root, { x: 540, y: 680, w: 940 });
      cue(5.4, 'whoosh', { len: 0.5, up: false }); cue(5.9, 'mic'); cue(6.3, 'type', { len: 2.0 }); cue(8.5, 'sparkle');

      // 4. spaces
      const h4 = headline(root, { x: 540, y: 220, text: p.spacesLine, size: 78 });
      const board = spaceBoard(root, cue, p.spaces, { a: 9.0, out: 13.1, top: 540 });

      // 5. reminder
      const h5 = headline(root, { x: 540, y: 330, text: 'Reminded *before* it matters.', size: 84 });
      const clock = el(root, { x: 540, y: 600, center: true, html: p.toast.time, style: { fontSize: '150px', fontWeight: 700, letterSpacing: '-0.05em', whiteSpace: 'nowrap' } });
      const tst = toast(root, { x: 540, y: 850, ...p.toast });
      cue(13.4, 'whoosh', { len: 0.4 }); cue(14.0, 'ding');

      // 6. closing line
      const h6 = headline(root, { x: 540, y: 640, text: p.closing, size: 92 });
      cue(15.6, 'riser', { len: 0.8 });

      const end = endCard(root, cue, 16.6, { tagline: p.endTag ?? 'Remembers everything. Reminds you when it matters.' });

      return t => {
        bg(t);
        show(k, t, 0.1, 16.5, { y: -20 });
        const ka = show(avatar, t, 0.2, 2.8, { s: 0.3, y: 0, e: 'elastic', d: 0.9 });
        if (ka > 0.98) tf(avatar, { y: Math.sin(t * 2.4) * 8, r: Math.sin(t * 1.7) * 3 });
        revealWords(title, t, 0.5, { out: 2.7 });
        show(sub, t, 1.3, 2.8, { y: 30 });
        revealWords(h2, t, 3.0, { out: 5.3 });
        mess.forEach((n, i) => {
          const a = 3.2 + i * 0.28;
          const suck = ease.in(prog(t, 5.3, 5.8));
          const kin = ease.back(prog(t, a, a + 0.5));
          const bx = parseFloat(n.style.left), by = parseFloat(n.style.top);
          tf(n, { x: (540 - bx) * suck, y: (1 - kin) * 60 + (680 - by) * suck + Math.sin(t * 1.5 + n._ph) * 6, r: n._r * (1 - suck) + Math.sin(t + n._ph) * 2, s: lerp(0.6, 1, kin) * (1 - suck * 0.85), o: Math.min(1, prog(t, a, a + 0.15)) * (1 - prog(t, 5.6, 5.8)) });
        });
        revealWords(h3, t, 5.7, { out: 8.6 });
        show(bar, t, 5.7, 8.7, { s: 0.6, y: 0, os: 0.8, oy: -60 });
        if (t < 6.3) setCapture(bar, '');
        else typeText(bar._text, p.said, t, 6.3, 8.3);
        bar._mic.style.transform = `scale(${t > 5.9 && t < 8.4 ? 1.1 + Math.sin(t * 9) * 0.06 : 1})`;
        revealWords(h4, t, 8.8, { out: 13.0 });
        board(t);
        revealWords(h5, t, 13.3, { out: 15.4 });
        show(clock, t, 13.4, 15.4, { s: 0.8, y: 30 });
        show(tst, t, 13.9, 15.4, { y: -120, s: 0.9 });
        revealWords(h6, t, 15.5, { out: 16.6, stagger: 0.06 });
        end(t);
      };
    },
  };
}
