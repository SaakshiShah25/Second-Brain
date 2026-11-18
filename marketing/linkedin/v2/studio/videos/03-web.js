// v2 · 03 · MyConfía on the web (real laptop layout, light then dark)
import { el, show } from '../engine.js';
import { scene, sceneShow, heading, words, label, laptopDevice, frameAt, endCard, camera, aim, topFade, voiceFrame, takeFrames, voiceCaption } from '../components.js';

export default {
  duration: 20,
  poster: 6.2,
  music: { bpm: 100, key: 65, prog: ['IV', 'I', 'V', 'vi'], mood: 'warm', drumsFrom: 1.9 },
  build(root, cue) {
    const s1 = scene(root, 'light');
    const cam1 = camera(s1);
    const lp1 = laptopDevice(cam1, { x: 540, y: 800, w: 960, frames: { 'laptop-today-light': takeFrames('laptop-today-light') } });
    topFade(s1);
    const lb1 = label(s1, { y: 92, text: 'MyConfía on the web', color: 'var(--accent)' });
    const a1 = heading(s1, { y: 180, size: 78, text: 'Your whole life, *on one screen.*' });
    const a2 = heading(s1, { y: 180, size: 78, text: 'Just say it. *Even at your desk.*' });
    const vc1 = voiceCaption(s1, { y: 380, text: 'Investor update draft by Friday, remind me Thursday evening' });
    const a3 = heading(s1, { y: 180, size: 78, text: 'Filed, dated, *reminded.*' });
    cue(0.3, 'pop'); cue(2.4, 'mic'); cue(5.2, 'pop', { p: 1.2 }); cue(5.8, 'chime');

    const s2 = scene(root, 'dark');
    const cam2 = camera(s2);
    const lp2 = laptopDevice(cam2, { x: 540, y: 800, w: 960, frames: { 'laptop-ask-dark': takeFrames('laptop-ask-dark') } });
    topFade(s2);
    const b1 = heading(s2, { y: 180, size: 78, text: 'Ask it anything, *out loud.*' });
    const vc2 = voiceCaption(s2, { y: 370, text: 'What did I promise the design team?' });
    cue(8.6, 'whoosh', { len: 0.5 }); cue(9.3, 'mic'); cue(11.4, 'sparkle'); cue(11.9, 'pop', { p: 1.3 });

    const s3 = scene(root, 'dark');
    const cam3 = camera(s3);
    const lp3 = laptopDevice(cam3, { x: 540, y: 800, w: 960, frames: { 'laptop-spaces-dark': 1 } });
    topFade(s3);
    const c1 = heading(s3, { y: 180, size: 78, text: 'Every life, *its own space.*' });
    cue(14.0, 'whoosh', { len: 0.5 });

    const end = endCard(root, cue, 16.6, { theme: 'light' });

    return t => {
      sceneShow(s1, t, 0, 8.4);
      show(lb1, t, 0.2, Infinity, { y: -10, e: 'out5' });
      words(a1, t, 0.3, { out: 2.2 }); words(a2, t, 2.4, { out: 5.5 }); words(a3, t, 5.7);
      show(lp1, t, 0.1, Infinity, { y: 220, s: 0.95, e: 'out5', d: 0.9 });
      vc1._update(t, 2.4, 5.1);
      lp1._set('laptop-today-light', voiceFrame('laptop-today-light', t, 2.4, 5.1, 7.0));
      aim(cam1, t, [[1.2, 1, 540, 800, 540, 800], [2.3, 2.15, 560, 1008, 540, 950], [5.2, 2.15, 560, 1008, 540, 950], [6.0, 1.7, 612, 820, 540, 800]]);

      sceneShow(s2, t, 8.4, 13.8);
      words(b1, t, 8.7);
      show(lp2, t, 8.4, Infinity, { y: 200, s: 0.95, e: 'out5', d: 0.8 });
      vc2._update(t, 9.3, 11.2);
      lp2._set('laptop-ask-dark', voiceFrame('laptop-ask-dark', t, 9.3, 11.2, 11.8));
      aim(cam2, t, [[8.4, 1, 540, 800, 540, 800], [9.2, 2.15, 560, 1040, 540, 950], [11.2, 2.15, 560, 1040, 540, 950], [12.0, 1.85, 570, 600, 540, 720]]);

      sceneShow(s3, t, 13.8, 16.6);
      words(c1, t, 14.0);
      show(lp3, t, 13.8, Infinity, { y: 200, s: 0.95, e: 'out5', d: 0.8 });
      lp3._set('laptop-spaces-dark', 1);
      aim(cam3, t, [[13.8, 1, 540, 800, 540, 800], [14.8, 1.6, 600, 700, 540, 760], [16.6, 1.6, 620, 760, 540, 760]]);
      end(t);
    };
  },
};
