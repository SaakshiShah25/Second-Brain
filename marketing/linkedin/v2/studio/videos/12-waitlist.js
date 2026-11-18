// v2 · 12 · The only video with a call to action: join the waitlist.
import { el, show, prog } from '../engine.js';
import { scene, sceneShow, heading, words, endCard, icon } from '../components.js';

export default {
  duration: 16,
  poster: 14.4,
  music: { bpm: 112, key: 62, prog: ['I', 'V', 'vi', 'IV'], mood: 'warm', drumsFrom: 3.4 },
  build(root, cue) {
    const s1 = scene(root, 'light');
    const a1 = heading(s1, { y: 560, size: 96, text: 'You’re not one person.' });
    const a2 = heading(s1, { y: 720, size: 150, text: 'You’re *five.*' });
    cue(0.3, 'pop', { p: 0.8 }); cue(1.4, 'impact', { v: 0.55 });

    const s2 = scene(root, 'dark');
    const b1 = heading(s2, { y: 220, size: 80, text: 'One second brain *for all of them.*' });
    const group = el(s2, { x: 540, y: 760, w: 900, center: true, cls: 'group' });
    const beat = 60 / 112;
    group.innerHTML = [['mic', 'Just say it', 'Voice first, whenever it comes to mind'], ['briefcase', 'It sorts it', 'Into the right space of your life'], ['bell', 'It reminds you', 'Before it matters'], ['chat', 'Ask it anything', 'Answers from your own notes'], ['lock', 'Kept private', 'Encrypted, never sold, never used to train AI']].map(([ic, t, s]) =>
      `<div class="row" style="font-size:34px"><div style="width:72px;height:72px;border-radius:20px;background:color-mix(in srgb,var(--accent) 14%,transparent);display:flex;align-items:center;justify-content:center;flex:none">${icon(ic, 36, 'var(--accent)')}</div><div><div class="rt" style="font-weight:650">${t}</div><div class="rm">${s}</div></div></div>`).join('');
    const rows = [...group.children];
    const at = i => 3.6 + i * beat * 2;
    rows.forEach((_, i) => cue(at(i), 'pop', { p: 0.8 + i * 0.12 }));

    const end = endCard(root, cue, 10.6, { theme: 'light', sub: 'Early access is opening soon.', cta: `Join the waitlist ${icon('send', 36, '#fff', 2.8)}` });

    return t => {
      sceneShow(s1, t, 0, 3.0);
      words(a1, t, 0.3, { out: 2.7 }); words(a2, t, 1.3, { out: 2.7 });
      sceneShow(s2, t, 3.0, 10.6);
      words(b1, t, 3.2);
      show(group, t, 3.4, Infinity, { y: 30, e: 'out5' });
      rows.forEach((r, i) => { const k = prog(t, at(i), at(i) + 0.4); r.style.opacity = k; r.style.transform = `translateX(${(1 - k) * (i % 2 ? 50 : -50)}px)`; });
      end(t);
    };
  },
};
