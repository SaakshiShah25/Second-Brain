// v2 · 01 · You're not one person. You're five. (introduces MyConfía with the real app)
import { el, tf, setO, show, prog, ease, lerp } from '../engine.js';
import { scene, sceneShow, heading, words, label, listGroup, tick, banner, phoneDevice, frameAt, endCard, icon, camera, aim, topFade, voiceFrame, takeFrames, voiceCaption } from '../components.js';

export default {
  duration: 27,
  poster: 13.2,
  music: { bpm: 102, key: 62, prog: ['I', 'vi', 'IV', 'V'], mood: 'warm', drumsFrom: 9.4 },
  build(root, cue) {
    // 1 · the motto (light)
    const s1 = scene(root, 'light');
    const m1 = heading(s1, { y: 560, size: 96, text: 'You’re not one person.' });
    const m2 = heading(s1, { y: 720, size: 170, text: 'You’re *five.*' });
    cue(0.4, 'pop', { p: 0.8 }); cue(1.7, 'impact', { v: 0.55 });

    // 2 · the five, as app rows that keep piling up
    const lb = label(s1, { y: 200, text: 'Today · in your head' });
    const g = listGroup(s1, {
      y: 720, w: 920, rows: [
        { title: 'Prep the CEO deck', meta: 'The employee · tonight, 8:00 PM', space: 'Work' },
        { title: 'Ship the landing page', meta: 'The side-hustler · tomorrow', space: 'Side project' },
        { title: 'Buy a toy for Aarav', meta: 'The parent · this week', space: 'Family' },
        { title: 'Gym', meta: 'The gym-goer · 6:00 PM', space: 'Health' },
        { title: 'Call Mom', meta: 'The son · 7:00 PM', space: 'Family' },
        { title: '1 kg vegetables', meta: 'Somebody has to · on the way home', space: 'Home' },
      ],
    });
    const more = el(s1, { x: 540, y: 1180, center: true, html: '', style: { fontSize: '34px', fontWeight: 650, color: 'var(--accent)' } });
    const q1 = heading(s1, { y: 270, size: 76, text: 'Five lives. *One head.*' });
    g._rows.forEach((_, i) => cue(3.3 + i * 0.32, 'pop', { p: 0.8 + i * 0.09 }));

    // 3 · you wrote it down… but where?
    const q2 = heading(s1, { y: 560, size: 92, text: 'You wrote it down.' });
    const q3 = heading(s1, { y: 700, size: 120, text: '…but *where?*' });
    cue(7.3, 'whoosh', { len: 0.4, up: false }); cue(7.5, 'pop', { p: 0.8 }); cue(8.3, 'pop', { p: 1.1 }); cue(8.6, 'riser', { len: 0.8 });

    // 4 · the real app: tell it, it sorts it (light)
    const s2 = scene(root, 'light');
    const cam2 = camera(s2);
    const ph = phoneDevice(cam2, { x: 540, y: 830, h: 1060, frames: { 'phone-capture-light': takeFrames('phone-capture-light') } });
    topFade(s2);
    const c1 = heading(s2, { y: 160, size: 78, text: 'Just *say it* to MyConfía.' });
    const c2 = heading(s2, { y: 160, size: 70, text: 'It files each thing *in its space.*' });
    const vc = voiceCaption(s2, { y: 370, text: 'CEO meeting tomorrow 9am, prep the deck tonight. Buy a toy for Aarav, call Mom at 7, 1 kg veggies, gym at 6.' });
    cue(10.2, 'mic'); cue(13.6, 'pop', { p: 1.2 }); cue(14.6, 'sparkle');

    // 5 · same brain, dark mode: Today, tick, reminder
    const s3 = scene(root, 'dark');
    const cam3 = camera(s3);
    const ph2 = phoneDevice(cam3, { x: 540, y: 830, h: 1060, frames: { 'phone-today-dark': 10 } });
    topFade(s3);
    const d1 = heading(s3, { y: 160, size: 74, text: 'Your whole day, *in one place.*' });
    const bn = banner(s3, { y: 560, title: 'Call Mom', body: 'In 10 minutes · 7:00 PM', time: '6:50 PM' });
    const d2 = heading(s3, { y: 160, size: 74, text: 'Reminded *before* it matters.' });
    cue(17.2, 'whoosh', { len: 0.5 }); cue(18.6, 'chime'); cue(20.6, 'ding');

    // 6 · positioning
    const s4 = scene(root, 'dark');
    const p1 = heading(s4, { y: 430, size: 80, text: 'Not another to-do app.', color: 'var(--muted)' });
    const p2 = heading(s4, { y: 700, size: 96, text: 'A second brain that *remembers everything.*' });
    cue(22.2, 'pop', { p: 0.8 }); cue(22.6, 'riser', { len: 0.9 });

    const end = endCard(root, cue, 23.6, { theme: 'light' });

    return t => {
      sceneShow(s1, t, 0, 9.3);
      words(m1, t, 0.4, { out: 2.9 });
      words(m2, t, 1.6, { out: 2.9 });
      show(lb, t, 3.0, 7.0, { y: -10, e: 'out5' });
      words(q1, t, 3.1, { out: 7.0 });
      const kg = show(g, t, 3.2, 7.0, { y: 80, s: 0.94, e: 'out5', d: 0.6 });
      g._rows.forEach((r, i) => {
        const k = ease.out5(prog(t, 3.3 + i * 0.32, 3.75 + i * 0.32));
        r.style.opacity = k; r.style.transform = `translateY(${(1 - k) * 30}px)`;
      });
      const extra = Math.floor(Math.max(0, (t - 5.4) * 22));
      more.innerHTML = extra > 0 ? `+ ${extra} more things to remember` : '';
      setO(more, kg * prog(t, 5.4, 5.6));
      // the pile starts to shake as it overflows
      if (t > 5.8 && t < 7) tf(g, { x: Math.sin(t * 40) * 3 * prog(t, 5.8, 6.8), o: kg });
      words(q2, t, 7.4, { out: 9.0 });
      words(q3, t, 8.2, { out: 9.0 });

      sceneShow(s2, t, 9.3, 16.9);
      words(c1, t, 9.5, { out: 13.5 });
      words(c2, t, 13.8, { out: 16.6 });
      show(ph, t, 9.4, Infinity, { y: 260, s: 0.92, e: 'out5', d: 0.9 });
      // home → typing → sent → reply → scroll through the reply
      vc._update(t, 10.2, 13.5);
      ph._set('phone-capture-light', voiceFrame('phone-capture-light', t, 10.2, 13.5, 16.6));
      aim(cam2, t, [[9.4, 1, 540, 830, 540, 830], [10.4, 1, 540, 830, 540, 830], [11.2, 1.55, 540, 1150, 540, 1000], [13.5, 1.55, 540, 1150, 540, 1000], [14.5, 1.45, 540, 640, 540, 820], [16.6, 1.45, 540, 760, 540, 820]]);

      sceneShow(s3, t, 16.9, 22.0);
      words(d1, t, 17.1, { out: 19.9 });
      words(d2, t, 20.1, { out: 21.8 });
      show(ph2, t, 16.9, Infinity, { y: 200, s: 0.95, e: 'out5', d: 0.8 });
      aim(cam3, t, [[16.9, 1, 540, 830, 540, 830], [17.8, 1.5, 540, 600, 540, 780], [20.2, 1.5, 540, 600, 540, 780], [21.4, 1.2, 540, 700, 540, 820]]);
      ph2._set('phone-today-dark', t < 18.5 ? 1 : t < 18.62 ? 2 : t < 18.8 ? 3 : 4);
      show(bn, t, 20.5, 21.9, { y: -160, s: 0.95, e: 'back' });

      sceneShow(s4, t, 22.0, 23.6);
      words(p1, t, 22.1, { out: 23.5 });
      words(p2, t, 22.5, { out: 23.5 });
      end(t);
    };
  },
};
