// v2 persona storyboard, built on the motto and the persona's own real screens:
// "You're not one person." → their five hats → real capture → real Today → real Spaces → closing line → end card.
import { el, tf, show, prog } from './engine.js';
import { scene, sceneShow, heading, words, label, phoneDevice, frameAt, endCard, spaceChip, camera, aim, topFade, voiceFrame, takeFrames, voiceCaption } from './components.js';

export function persona(p) {
  const id = p.id, theme = p.theme, other = theme === 'light' ? 'dark' : 'light';
  const cap = `persona-${id}-capture`, F = p.frames; // F = { typed, reply }
  return {
    duration: 22,
    poster: 9.2,
    music: p.music,
    build(root, cue) {
      // 1 · motto + the five hats
      const s1 = scene(root, theme);
      const lb = label(s1, { y: 140, text: `MyConfía for ${p.who}`, color: 'var(--accent)' });
      const m1 = heading(s1, { y: 330, size: 92, text: 'You’re not one person.' });
      const m2 = heading(s1, { y: 470, size: 84, text: p.hatsLine });
      const chips = p.hats.map(([name, ic, color], i) => spaceChip(s1, { x: [300, 780, 300, 780, 540][i], y: 700 + Math.floor(i / 2) * 150, name, color, iconName: ic, size: 36 }));
      cue(0.3, 'pop', { p: 0.8 }); cue(1.4, 'pop', { p: 1 }); chips.forEach((_, i) => cue(2.2 + i * 0.3, 'pop', { p: 0.85 + i * 0.1 }));

      // 2 · real capture
      const s2 = scene(root, theme);
      const cam2 = camera(s2);
      const ph = phoneDevice(cam2, { x: 540, y: 840, h: 1060, frames: { [cap]: takeFrames(cap) } });
      topFade(s2);
      const c1 = heading(s2, { y: 180, size: 84, text: 'Just *say it.*' });
      const vc = voiceCaption(s2, { y: 370, text: p.said });
      const c2 = heading(s2, { y: 180, size: 76, text: 'It lands in *the right space.*' });
      cue(5.6, 'mic'); cue(8.4, 'pop', { p: 1.2 }); cue(9.1, 'sparkle');

      // 3 · real Today
      const s3 = scene(root, other === 'dark' ? theme : theme);
      const cam3 = camera(s3);
      const ph2 = phoneDevice(cam3, { x: 540, y: 840, h: 1060, frames: { [`persona-${id}-today`]: 1 } });
      topFade(s3);
      const d1 = heading(s3, { y: 180, size: 80, text: 'Your day, *sorted.*' });
      cue(11.2, 'whoosh', { len: 0.5 });

      // 4 · real Spaces
      const s4 = scene(root, theme);
      const cam4 = camera(s4);
      const ph3 = phoneDevice(cam4, { x: 540, y: 840, h: 1060, frames: { [`persona-${id}-spaces`]: 1 } });
      topFade(s4);
      const e1 = heading(s4, { y: 180, size: 76, text: 'Every life, *its own space.*' });
      cue(14.4, 'whoosh', { len: 0.5 });

      // 5 · closing line
      const s5 = scene(root, other);
      const f1 = heading(s5, { y: 640, size: 92, text: p.closing });
      cue(17.3, 'pop', { p: 0.8 }); cue(17.6, 'riser', { len: 0.8 });

      const end = endCard(root, cue, 18.8, { theme });

      return t => {
        sceneShow(s1, t, 0, 5.2);
        show(lb, t, 0.1, Infinity, { y: -10, e: 'out5' });
        words(m1, t, 0.3); words(m2, t, 1.3);
        chips.forEach((c, i) => show(c, t, 2.2 + i * 0.3, Infinity, { s: 0.6, y: 40, e: 'back' }));

        sceneShow(s2, t, 5.2, 11.0);
        words(c1, t, 5.4, { out: 8.5 }); words(c2, t, 8.7);
        show(ph, t, 5.2, Infinity, { y: 240, s: 0.94, e: 'out5', d: 0.8 });
        vc._update(t, 5.6, 8.3);
      ph._set(cap, voiceFrame(cap, t, 5.6, 8.3, 9.4));
        aim(cam2, t, [[5.2, 1, 540, 840, 540, 840], [5.9, 1.55, 540, 1180, 540, 1020], [8.3, 1.55, 540, 1180, 540, 1020], [9.2, 1.45, 540, 620, 540, 800]]);

        sceneShow(s3, t, 11.0, 14.2);
        words(d1, t, 11.2);
        ph2._set(`persona-${id}-today`, 1); ph3._set(`persona-${id}-spaces`, 1);
        show(ph2, t, 11.0, Infinity, { y: 220, s: 0.95, e: 'out5', d: 0.8 });
        aim(cam3, t, [[11.0, 1, 540, 840, 540, 840], [11.9, 1.45, 540, 560, 540, 760], [14.2, 1.45, 540, 760, 540, 800]]);

        sceneShow(s4, t, 14.2, 17.2);
        words(e1, t, 14.4);
        show(ph3, t, 14.2, Infinity, { y: 220, s: 0.95, e: 'out5', d: 0.8 });
        aim(cam4, t, [[14.2, 1, 540, 840, 540, 840], [15.1, 1.42, 540, 620, 540, 780], [17.2, 1.42, 540, 760, 540, 800]]);

        sceneShow(s5, t, 17.2, 18.8);
        words(f1, t, 17.3, { stagger: 0.06 });
        end(t);
      };
    },
  };
}
