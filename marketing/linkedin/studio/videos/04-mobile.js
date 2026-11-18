// 04 · MyConfía on your phone (voice capture)
import { el, tf, setO, show, prog, ease, lerp } from '../engine.js';
import { C, background, headline, revealWords, phone, taskCard, endCard, icon, kicker, waveform, toast, logoSvg } from '../components.js';

export default {
  duration: 18,
  poster: 8.4,
  music: { bpm: 106, key: 67, prog: ['I', 'iii', 'vi', 'IV'], mood: 'bright', drumsFrom: 2.6 },
  build(root, cue) {
    const bg = background(root, { blobs: [C.teal, C.amber, C.accent, C.pink] });
    const k = kicker(root, { y: 110, text: 'MyConfía on your phone', color: C.teal });
    const h1 = headline(root, { x: 540, y: 245, text: 'Hold. Speak. *Done.*', size: 96 });
    const h2 = headline(root, { x: 540, y: 245, text: 'Walking. Commuting. *Between meetings.*', size: 76 });
    const h3 = headline(root, { x: 540, y: 245, text: 'In your pocket, _wherever you are._', size: 80 });
    cue(0.2, 'pop'); cue(0.5, 'pop', { p: 1.1 }); cue(0.8, 'pop', { p: 1.3 });

    const ph = phone(root, { x: 540, y: 860, w: 470, h: 900 });
    const S = ph.screen; // 442 x 872
    el(S, { x: 30, y: 72, html: `<div style="font-size:22px;color:${C.muted};font-weight:500">Saturday, 15 Nov</div><div style="font-size:54px;font-weight:750;letter-spacing:-0.04em">Today</div>` });
    const base = [
      taskCard(S, { x: 22, y: 0, w: 398, center: false, size: 0.7, title: 'Prep the CEO deck', space: 'work', due: 'Tonight' }),
      taskCard(S, { x: 22, y: 0, w: 398, center: false, size: 0.7, title: 'Gym', space: 'health', due: '6:00 PM' }),
    ];
    const added = [
      taskCard(S, { x: 22, y: 0, w: 398, center: false, size: 0.7, title: 'Pick up medicines', space: 'health', due: 'Today' }),
      taskCard(S, { x: 22, y: 0, w: 398, center: false, size: 0.7, title: 'Book the dentist', space: 'health', due: 'Sat' }),
      taskCard(S, { x: 22, y: 0, w: 398, center: false, size: 0.7, title: 'Call Riya', space: 'family', due: '2:00 PM' }),
    ];
    // recording sheet
    const sheet = el(S, { x: 0, y: 872, w: 442, h: 470, style: { background: '#fff', borderRadius: '40px 40px 0 0', boxShadow: '0 -20px 60px rgba(40,30,20,.15)' } });
    el(sheet, { x: 0, y: 40, w: 442, html: 'Listening…', style: { textAlign: 'center', fontSize: '26px', fontWeight: 650, color: C.accent } });
    const wf = waveform(sheet, { x: 221, y: 140, w: 360, h: 90, bars: 24 });
    const transcript = el(sheet, { x: 34, y: 205, w: 374, style: { fontSize: '25px', lineHeight: 1.4, fontWeight: 550, color: C.ink, textAlign: 'center' } });
    const words = 'Pick up medicines, book the dentist for Saturday, and call Riya after lunch.'.split(' ');
    const micBtn = el(S, { x: 221, y: 790, w: 110, h: 110, center: true, style: { borderRadius: '50%', background: C.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 16px 40px ${C.accent}66`, zIndex: 3 }, html: icon('mic', 50, '#fff', 2.4) });
    const ripples = [0, 1, 2].map(() => el(S, { x: 221, y: 790, w: 110, h: 110, center: true, style: { borderRadius: '50%', border: `4px solid ${C.accent}` } }));
    const lockToast = toast(root, { x: 540, y: 520, w: 820, title: 'Call Riya', body: 'In 10 minutes · 2:00 PM', time: '1:50 PM' });

    // availability badges
    const badges = [
      ['phone', 'Android app', 'Install from Google Play'],
      ['phone', 'iPhone', 'Share → Add to Home Screen'],
    ].map(([ic, t, s], i) => el(root, {
      x: i ? 790 : 290, y: 1240, center: true,
      html: `<div style="display:flex;align-items:center;gap:12px;font-size:32px;font-weight:750;letter-spacing:-0.03em">${icon(ic, 32, C.teal, 2.4)}${t}</div><div style="font-size:23px;color:${C.muted};font-weight:500;margin-top:2px">${s}</div>`,
      style: { background: '#fff', padding: '16px 26px', borderRadius: '24px', boxShadow: '0 14px 40px rgba(40,30,20,.14)', border: `2px solid ${C.teal}33` },
    }));

    cue(1.6, 'whoosh', { len: 0.6 });
    cue(2.6, 'mic'); cue(5.9, 'tick'); cue(6.2, 'sparkle');
    [0, 1, 2].forEach(i => cue(6.5 + i * 0.25, 'pop', { p: 0.9 + i * 0.15 }));
    cue(9.6, 'swipe'); cue(10.6, 'ding');
    cue(12.6, 'pop', { p: 1 }); cue(12.9, 'pop', { p: 1.2 });

    const end = endCard(root, cue, 14.4);

    return t => {
      bg(t);
      show(k, t, 0.1, 14.3, { y: -20 });
      revealWords(h1, t, 0.2, { out: 8.9, stagger: 0.25 });
      revealWords(h2, t, 9.2, { out: 12.1 });
      revealWords(h3, t, 12.3, { out: 14.2 });
      // phone tilts gently once things are added
      const tilt = ease.inOut(prog(t, 9.3, 10.2)) * (1 - ease.inOut(prog(t, 12.2, 13)));
      const kp = show(ph.root, t, 1.5, 14.2, { y: 400, s: 0.8, e: 'out5', d: 1 });
      const shrink = ease.inOut(prog(t, 12.2, 12.9));
      if (kp > 0.99) tf(ph.root, { y: tilt * 120 + Math.sin(t * 1.2) * 4 - shrink * 90, s: 1 - tilt * 0.08 - shrink * 0.14, r: -tilt * 3 });
      // list layout
      const push = ease.back(prog(t, 6.5, 7.3));
      added.forEach((c, i) => { c.style.top = (200 + i * 128) + 'px'; show(c, t, 6.5 + i * 0.25, Infinity, { y: 40, s: 0.85 }); });
      base.forEach((c, i) => { c.style.top = (200 + i * 128 + push * 3 * 128) + 'px'; show(c, t, 2.0 + i * 0.12, Infinity, { y: 30, e: 'out' }); });
      // recording
      const press = t > 2.5 && t < 6.0;
      micBtn.style.transform = `translate(-50%,-50%) scale(${press ? 1.15 + Math.sin(t * 8) * 0.03 : 1})`;
      micBtn.style.opacity = 1 - prog(t, 6.3, 6.6);
      ripples.forEach((r, i) => {
        const ph2 = ((t - 2.6) * 0.9 + i / 3) % 1;
        tf(r, { s: 1 + ph2 * 1.3, o: press ? (1 - ph2) * 0.6 : 0 });
      });
      const open = ease.out5(prog(t, 2.6, 3.1)) * (1 - ease.inOut(prog(t, 6.0, 6.4)));
      sheet.style.transform = `translateY(${-open * 470}px)`;
      wf._update(t, press ? 1 : 0.2);
      const shown = Math.floor(prog(t, 3.0, 5.8) * words.length);
      transcript.textContent = words.slice(0, shown).join(' ');
      show(lockToast, t, 10.5, 12.1, { y: -140, s: 0.9 });
      badges.forEach((b, i) => show(b, t, 12.6 + i * 0.3, 14.2, { y: 40, s: 0.7 }));
      end(t);
    };
  },
};
