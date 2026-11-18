// 12 · Waitlist call to action
import { el, tf, setO, show, prog, ease, lerp } from '../engine.js';
import { C, background, headline, revealWords, endCard, icon } from '../components.js';

export default {
  duration: 14,
  poster: 12.5,
  music: { bpm: 116, key: 62, prog: ['I', 'V', 'vi', 'IV'], mood: 'pulse', drumsFrom: 3.6 },
  build(root, cue) {
    const bg = background(root, { blobs: [C.amber, C.accent, C.pink, C.sky] });
    const h1 = headline(root, { x: 540, y: 560, text: 'Stop trying to remember _everything._', size: 96 });
    const h2 = headline(root, { x: 540, y: 600, text: 'Let MyConfía remember *for you.*', size: 104 });
    cue(0.3, 'pop', { p: 0.8 }); cue(1.9, 'pop', { p: 1 }); cue(2.2, 'riser', { len: 1.3 });

    const beat = 60 / 116;
    const feats = [
      ['🎙️', 'Speak it', 'Voice or text, any time'],
      ['🗂️', 'It sorts it', 'Into the right space'],
      ['🔔', 'It reminds you', 'Before it matters'],
      ['💬', 'Ask it anything', 'Answers from your notes'],
      ['🔒', 'Kept private', 'Encrypted, never sold'],
    ].map(([e, t, s], i) => el(root, {
      x: 540, y: 330 + i * 175, w: 860, center: true, cls: 'card',
      html: `<div style="font-size:72px;line-height:1;width:100px;text-align:center">${e}</div><div><div style="font-size:46px;font-weight:750;letter-spacing:-0.035em">${t}</div><div style="font-size:28px;color:${C.muted};margin-top:2px">${s}</div></div>`,
      style: { display: 'flex', alignItems: 'center', gap: '30px', padding: '26px 38px' },
    }));
    const fa = i => 3.6 + i * beat * 2;
    feats.forEach((_, i) => cue(fa(i), 'pop', { p: 0.8 + i * 0.13 }));

    const end = endCard(root, cue, 9.4, { tagline: 'Early access is opening soon.<br>Be one of the first in.' });

    return t => {
      bg(t);
      revealWords(h1, t, 0.3, { out: 1.7 });
      revealWords(h2, t, 1.9, { out: 3.4 });
      feats.forEach((n, i) => {
        show(n, t, fa(i), 9.0, { x: i % 2 ? 120 : -120, y: 0, s: 0.9, r: i % 2 ? 3 : -3 });
      });
      end(t);
    };
  },
};
