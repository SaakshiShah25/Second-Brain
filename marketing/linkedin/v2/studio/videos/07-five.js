// v2 · 07 · The motto: You're not one person. You're five.
import { el, tf, setO, show, prog, ease, lerp } from '../engine.js';
import { scene, sceneShow, heading, words, label, phoneDevice, frameAt, endCard, banner, spaceChip, camera, aim, topFade, SPACE_COLORS } from '../components.js';

export default {
  duration: 25,
  poster: 6.4,
  music: { bpm: 108, key: 60, prog: ['I', 'V', 'vi', 'IV'], mood: 'warm', drumsFrom: 2.7 },
  build(root, cue) {
    const s1 = scene(root, 'light');
    const m1 = heading(s1, { y: 560, size: 96, text: 'You’re not one person.' });
    const m2 = heading(s1, { y: 720, size: 170, text: 'You’re *five.*' });
    cue(0.3, 'pop', { p: 0.8 }); cue(1.4, 'impact', { v: 0.6 });

    // the five, each tied to a space
    const roles = [
      ['👔', 'The employee', 'CEO deck by 9 AM', 'Work', 'briefcase'],
      ['🚀', 'The side-hustler', 'Landing page, tonight', 'Side project', 'flag'],
      ['🧸', 'The parent', 'Toy for Aarav', 'Family', 'home'],
      ['🏃', 'The gym-goer', 'Workout at 6', 'Health', 'heart'],
      ['🏠', 'The one who runs the house', 'Bills, groceries, plumber', 'Home', 'home'],
    ];
    const h2 = heading(s1, { y: 170, size: 72, text: 'Each one has *a to-do list.*' });
    const cards = roles.map(([e, t, s, sp, ic], i) => el(s1, {
      x: 540, y: 380 + i * 172, w: 920, center: true, cls: 'card2',
      html: `<div style="font-size:64px;width:90px;text-align:center">${e}</div><div style="flex:1;min-width:0"><div style="font-size:38px;font-weight:650;letter-spacing:-0.03em">${t}</div><div style="font-size:27px;color:var(--muted);margin-top:2px">${s}</div></div>
        <span class="pill" style="font-size:24px;color:${SPACE_COLORS[sp]};background:${SPACE_COLORS[sp]}1c">${sp}</span>`,
      style: { display: 'flex', alignItems: 'center', gap: '26px', padding: '24px 32px' },
    }));
    cards.forEach((_, i) => cue(2.9 + i * 0.4, 'pop', { p: 0.8 + i * 0.12 }));
    const h3 = heading(s1, { y: 1270, size: 44, text: 'Most apps act like you only have *one.*', color: 'var(--muted)', weight: 600 });

    // real spaces (dark)
    const s2 = scene(root, 'dark');
    const cam2 = camera(s2);
    const ph = phoneDevice(cam2, { x: 540, y: 840, h: 1060, frames: { 'phone-spaces-dark': 11 } });
    topFade(s2);
    const c1 = heading(s2, { y: 180, size: 76, text: 'MyConfía gives each one *its own space.*' });
    cue(8.2, 'whoosh', { len: 0.5 }); cue(10.6, 'pop', { p: 1.1 });

    // a day of reminders (light)
    const s3 = scene(root, 'light');
    const d1 = heading(s3, { y: 170, size: 74, text: 'And reminds each one, *on time.*' });
    const day = [['7:00 AM', 'Workout before work 🏃'], ['8:30 AM', 'CEO deck: final read-through'], ['1:00 PM', 'Order Aarav’s toy 🧸'], ['6:30 PM', '1 kg vegetables on the way home'], ['7:00 PM', 'Call Mom'], ['10:30 PM', 'Landing page: one more hour 🚀']];
    const bns = day.map(([time, title], i) => banner(s3, { y: 360 + i * 160, w: 920, title, time }));
    bns.forEach((_, i) => cue(12.8 + i * 0.5, 'ding', { v: 0.4 }));

    // all five, one place (dark Today with a tick)
    const s4 = scene(root, 'dark');
    const cam4 = camera(s4);
    const ph2 = phoneDevice(cam4, { x: 540, y: 840, h: 1060, frames: { 'phone-today-dark': 10 } });
    topFade(s4);
    const e1 = heading(s4, { y: 180, size: 76, text: 'All five, *in one place.*' });
    cue(16.8, 'whoosh', { len: 0.5 }); cue(18.4, 'chime');

    const end = endCard(root, cue, 21.2, { theme: 'light' });

    return t => {
      sceneShow(s1, t, 0, 8.0);
      words(m1, t, 0.3, { out: 2.5 }); words(m2, t, 1.3, { out: 2.5 });
      words(h2, t, 2.7, { out: 7.7 });
      cards.forEach((c, i) => show(c, t, 2.9 + i * 0.4, 7.7, { x: i % 2 ? 90 : -90, y: 0, s: 0.96, e: 'out5' }));
      words(h3, t, 5.6, { out: 7.7 });

      sceneShow(s2, t, 8.0, 12.4);
      words(c1, t, 8.2);
      show(ph, t, 8.0, Infinity, { y: 220, s: 0.95, e: 'out5', d: 0.8 });
      ph._set('phone-spaces-dark', t < 9.2 ? 1 : t < 10.4 ? frameAt(t, 9.2, 10.2, 2, 5) : t < 10.6 ? 6 : frameAt(t, 10.6, 12.2, 7, 11));
      aim(cam2, t, [[8.0, 1, 540, 840, 540, 840], [9.0, 1.4, 540, 700, 540, 800], [12.4, 1.4, 540, 760, 540, 800]]);

      sceneShow(s3, t, 12.4, 16.6);
      words(d1, t, 12.5);
      bns.forEach((b, i) => show(b, t, 12.8 + i * 0.5, Infinity, { y: -60, s: 0.95, e: 'back' }));

      sceneShow(s4, t, 16.6, 21.2);
      words(e1, t, 16.8);
      show(ph2, t, 16.6, Infinity, { y: 220, s: 0.95, e: 'out5', d: 0.8 });
      ph2._set('phone-today-dark', t < 18.3 ? 1 : t < 18.42 ? 2 : t < 18.6 ? 3 : t < 19.4 ? 4 : frameAt(t, 19.4, 21, 5, 10));
      aim(cam4, t, [[16.6, 1, 540, 840, 540, 840], [17.5, 1.5, 540, 600, 540, 780], [19.3, 1.5, 540, 600, 540, 780], [21, 1.3, 540, 760, 540, 800]]);
      end(t);
    };
  },
};
