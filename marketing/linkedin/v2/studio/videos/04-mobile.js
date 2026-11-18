// v2 · 04 · MyConfía on your phone: real voice capture (dark), real spaces (light)
import { el, show } from '../engine.js';
import { scene, sceneShow, heading, words, label, phoneDevice, frameAt, endCard, camera, aim, topFade, icon, voiceFrame, voiceCaption } from '../components.js';

export default {
  duration: 21,
  poster: 7.4,
  music: { bpm: 104, key: 67, prog: ['I', 'iii', 'vi', 'IV'], mood: 'warm', drumsFrom: 3.0 },
  build(root, cue) {
    const s1 = scene(root, 'dark');
    const cam1 = camera(s1);
    const ph = phoneDevice(cam1, { x: 540, y: 840, h: 1060, frames: { 'phone-voice-dark': 22 } });
    topFade(s1);
    const lb = label(s1, { y: 92, text: 'MyConfía on your phone', color: 'var(--accent)' });
    const a1 = heading(s1, { y: 180, size: 84, text: 'Hold. Speak. *Done.*' });
    const vc = voiceCaption(s1, { y: 370, text: 'Pick up medicines, book the dentist for Saturday, and call Riya after lunch.' });
    const a2 = heading(s1, { y: 180, size: 70, text: 'Three to-dos. *Right spaces.*' });
    cue(1.6, 'mic'); cue(5.6, 'tick'); cue(6.1, 'pop', { p: 1.2 }); cue(6.8, 'sparkle');

    const s2 = scene(root, 'light');
    const cam2 = camera(s2);
    const ph2 = phoneDevice(cam2, { x: 540, y: 840, h: 1060, frames: { 'phone-spaces-light': 11 } });
    topFade(s2);
    const b1 = heading(s2, { y: 180, size: 76, text: 'Every life, *its own space.*' });
    cue(10.0, 'whoosh', { len: 0.5 }); cue(12.4, 'pop', { p: 1.1 });

    const s3 = scene(root, 'light');
    const c1 = heading(s3, { y: 330, size: 84, text: 'On *Android* and *iPhone.*' });
    const rows = el(s3, { x: 540, y: 690, w: 900, center: true, cls: 'group' });
    rows.innerHTML = [['phone', 'Android', 'The MyConfía app on Google Play'], ['phone', 'iPhone', 'Open in Safari → Share → Add to Home Screen']].map(([ic, t, s]) =>
      `<div class="row" style="font-size:34px"><div style="width:76px;height:76px;border-radius:22px;background:color-mix(in srgb,var(--accent) 12%,transparent);display:flex;align-items:center;justify-content:center">${icon(ic, 38, 'var(--accent)')}</div><div><div class="rt" style="font-weight:650">${t}</div><div class="rm" style="white-space:normal">${s}</div></div></div>`).join('');
    const c2 = el(s3, { x: 540, y: 950, center: true, html: 'Walking. Commuting. Between meetings.', style: { fontSize: '38px', color: 'var(--muted)', fontWeight: 500, letterSpacing: '-0.02em' } });
    cue(14.3, 'whoosh', { len: 0.5 }); cue(14.8, 'pop'); cue(15.1, 'pop', { p: 1.2 });

    const end = endCard(root, cue, 17.4, { theme: 'dark' });

    return t => {
      sceneShow(s1, t, 0, 9.8);
      show(lb, t, 0.2, Infinity, { y: -10, e: 'out5' });
      words(a1, t, 0.3, { out: 6.2, stagger: 0.22 }); words(a2, t, 6.4);
      show(ph, t, 0.1, Infinity, { y: 260, s: 0.94, e: 'out5', d: 0.9 });
      vc._update(t, 1.6, 5.5);
      ph._set('phone-voice-dark', voiceFrame('phone-voice-dark', t, 1.6, 5.5, 8));
      aim(cam1, t, [[0.9, 1, 540, 840, 540, 840], [1.8, 1.65, 540, 1210, 540, 1050], [5.6, 1.65, 540, 1210, 540, 1050], [6.6, 1.45, 540, 600, 540, 790]]);

      sceneShow(s2, t, 9.8, 14.2);
      words(b1, t, 10.0);
      show(ph2, t, 9.8, Infinity, { y: 220, s: 0.95, e: 'out5', d: 0.8 });
      ph2._set('phone-spaces-light', t < 11 ? 1 : t < 12.2 ? frameAt(t, 11, 12.0, 2, 5) : t < 12.4 ? 6 : frameAt(t, 12.4, 14.0, 7, 11));
      aim(cam2, t, [[9.8, 1, 540, 840, 540, 840], [10.8, 1.4, 540, 700, 540, 800], [14.2, 1.4, 540, 760, 540, 800]]);

      sceneShow(s3, t, 14.2, 17.4);
      words(c1, t, 14.4);
      show(rows, t, 14.7, Infinity, { y: 40, e: 'out5' });
      show(c2, t, 15.3, Infinity, { y: 20, e: 'out5' });
      end(t);
    };
  },
};
