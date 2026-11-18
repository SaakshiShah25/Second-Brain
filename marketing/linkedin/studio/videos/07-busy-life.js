// 07 · How MyConfía fits a busy life (you're not one person, you're five)
import { el, tf, setO, show, prog, ease, lerp } from '../engine.js';
import { C, SPACES, background, headline, revealWords, endCard, icon, kicker, spaceTile, logoSvg } from '../components.js';

export default {
  duration: 22,
  poster: 11.5,
  music: { bpm: 112, key: 60, prog: ['I', 'V', 'vi', 'IV'], mood: 'bright', drumsFrom: 2.6 },
  build(root, cue) {
    const bg = background(root, { blobs: [C.pink, C.amber, C.sky, C.teal] });
    const h1 = headline(root, { x: 540, y: 560, text: 'You’re not one person.', size: 96 });
    const h2 = headline(root, { x: 540, y: 720, text: '*You’re five.*', size: 150 });
    cue(0.3, 'pop', { p: 0.8 }); cue(1.5, 'impact', { v: 0.6 });

    // five roles fanned like cards
    const roles = [
      ['👔', 'The employee', 'CEO deck, 9 AM', C.blue],
      ['🚀', 'The hustler', 'Ship the landing page', C.red],
      ['🧸', 'The parent', 'Toy for Aarav', C.pink],
      ['🏃', 'The gym-goer', 'Workout at 6', C.teal],
      ['🪔', 'The child', 'Call home for Diwali', C.sun],
    ].map(([e, t, s, c], i) => {
      const n = el(root, {
        x: 540, y: 800, w: 250, h: 360, center: true, cls: 'card',
        html: `<div style="font-size:76px;line-height:1">${e}</div><div style="font-size:32px;font-weight:750;letter-spacing:-0.03em;margin-top:22px;line-height:1.1">${t}</div><div style="font-size:24px;color:${C.muted};margin-top:10px;line-height:1.3">${s}</div>`,
        style: { padding: '34px 26px', borderTop: `10px solid ${c}`, boxSizing: 'border-box' },
      });
      return n;
    });
    const h3 = headline(root, { x: 540, y: 250, text: 'Five lives. *One head.*', size: 92 });

    // a day, with nudges at the right moments
    const h4 = headline(root, { x: 540, y: 200, text: 'MyConfía nudges each one, *right on time.*', size: 72 });
    const day = [
      ['7:00', 'Workout before work 🏃', SPACES.health],
      ['8:30', 'CEO deck: final read-through 📊', SPACES.work],
      ['1:00', 'Order Aarav’s toy 🧸', SPACES.family],
      ['6:30', '1 kg vegetables on the way home 🥦', SPACES.home],
      ['8:00', 'Call family: Happy Diwali 🪔', SPACES.family],
      ['10:30', 'Landing page: one more hour 🚀', { name: 'Side project', color: C.red }],
    ];
    const line = el(root, { x: 150, y: 400, w: 5, h: 860, style: { background: 'rgba(40,30,20,.12)', borderRadius: '3px' } });
    const fill = el(root, { x: 150, y: 400, w: 5, h: 0, style: { background: C.accent, borderRadius: '3px' } });
    const rows = day.map(([time, what, sp], i) => {
      const y = 450 + i * 150;
      const dot = el(root, { x: 152, y, w: 30, h: 30, center: true, style: { borderRadius: '50%', background: '#fff', border: `5px solid ${sp.color}` } });
      const tm = el(root, { x: 120, y: y - 18, html: time, style: { fontSize: '30px', fontWeight: 700, color: C.muted, transform: 'translateX(-100%)', textAlign: 'right' } });
      tm._base = ''; tm.style.left = '30px'; tm.style.width = '80px';
      const card = el(root, {
        x: 200, y: y - 50, w: 820,
        html: `<div style="flex:none">${logoSvg(56)}</div><div style="min-width:0"><div style="font-size:21px;color:${C.muted};font-weight:500">Reminder · <span style="color:${sp.color};font-weight:650">${sp.name}</span></div><div style="font-size:31px;font-weight:680;letter-spacing:-0.02em;white-space:nowrap">${what}</div></div>`,
        style: { display: 'flex', alignItems: 'center', gap: '18px', background: '#fff', borderRadius: '26px', padding: '16px 22px', boxShadow: '0 12px 36px rgba(40,30,20,.1)', boxSizing: 'border-box' },
      });
      return { dot, tm, card, a: 9.0 + i * 0.55 };
    });
    rows.forEach(r => { cue(r.a, 'ding', { v: 0.45 }); });

    // every part of you, one place
    const h5 = headline(root, { x: 540, y: 230, text: 'Every part of you. *One place.*', size: 86 });
    const tiles = [['work', '6 to-dos'], ['side', '5 to-dos'], ['family', '4 to-dos'], ['home', 'Groceries list'], ['health', '3 habits'], ['ideas', '12 notes']]
      .map(([s, c], i) => spaceTile(root, { x: i % 2 ? 790 : 290, y: 520 + Math.floor(i / 2) * 250, space: s, count: c, w: 460, h: 210 }));
    tiles.forEach((_, i) => cue(13.8 + i * 0.15, 'pop', { p: 0.8 + i * 0.1 }));

    cue(2.6, 'whoosh', { len: 0.5 }); [0, 1, 2, 3, 4].forEach(i => cue(2.9 + i * 0.32, 'pop', { p: 0.8 + i * 0.12 }));
    cue(5.4, 'pop', { p: 0.9 }); cue(7.6, 'whoosh', { len: 0.5, up: false });
    cue(16.8, 'riser', { len: 1.2 });

    const end = endCard(root, cue, 18);

    return t => {
      bg(t);
      revealWords(h1, t, 0.3, { out: 2.5 });
      revealWords(h2, t, 1.5, { out: 2.5 });
      revealWords(h3, t, 5.3, { out: 7.6 });
      roles.forEach((n, i) => {
        const a = 2.9 + i * 0.32;
        const kin = ease.back(prog(t, a, a + 0.6));
        const fan = ease.inOut(prog(t, 4.4, 5.2));
        const gather = ease.in(prog(t, 7.5, 8.1));
        const ang = (i - 2) * 6 * fan;
        const x = (i - 2) * 190 * fan;
        tf(n, { x: x * (1 - gather), y: (1 - kin) * 700 + Math.abs(i - 2) * 24 * fan + gather * 900, r: ang * (1 - gather), s: 0.9, o: Math.min(1, prog(t, a, a + 0.2)) * (1 - prog(t, 7.9, 8.1)) });
        n.style.zIndex = i;
      });
      revealWords(h4, t, 8.3, { out: 13.0 });
      const fk = prog(t, 8.8, 12.4);
      fill.style.height = (fk * 860) + 'px';
      setO(line, prog(t, 8.3, 8.7) * (1 - prog(t, 13, 13.4)));
      setO(fill, prog(t, 8.3, 8.7) * (1 - prog(t, 13, 13.4)));
      rows.forEach(r => {
        show(r.dot, t, r.a - 0.15, 13.0, { s: 0.2, y: 0 });
        show(r.tm, t, r.a - 0.15, 13.0, { y: 10, e: 'out' });
        show(r.card, t, r.a, 13.0, { x: 80, y: 0, s: 0.9 });
      });
      revealWords(h5, t, 13.5, { out: 17.8 });
      tiles.forEach((n, i) => show(n, t, 13.8 + i * 0.15, 17.8, { s: 0.6, y: 50 }));
      end(t);
    };
  },
};
