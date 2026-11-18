// v2 · 02 · Five lives, three ways in: phone (voice), web, Claude
import { el, tf, setO, show, prog, ease } from '../engine.js';
import { scene, sceneShow, heading, words, label, phoneDevice, laptopDevice, still, frameAt, endCard, icon, camera, aim, topFade, mark, voiceFrame, takeFrames, voiceCaption } from '../components.js';

export default {
  duration: 21,
  poster: 10.5,
  music: { bpm: 106, key: 64, prog: ['I', 'V', 'vi', 'IV'], mood: 'warm', drumsFrom: 2.6 },
  build(root, cue) {
    const s1 = scene(root, 'light');
    const a1 = heading(s1, { y: 560, size: 104, text: 'Five lives.' });
    const a2 = heading(s1, { y: 700, size: 104, text: '*Three* ways to tell it.' });
    cue(0.3, 'pop', { p: 0.8 }); cue(1.1, 'pop', { p: 1.1 });

    // phone, voice (light)
    const s2 = scene(root, 'light');
    const cam2 = camera(s2);
    const ph = phoneDevice(cam2, { x: 540, y: 840, h: 1060, frames: { 'phone-voice-light': 22 } });
    topFade(s2);
    const l2 = label(s2, { y: 92, text: '1 · On your phone', color: 'var(--accent)' });
    const c2 = heading(s2, { y: 175, size: 80, text: 'Just *say it.*' });
    const vc2 = voiceCaption(s2, { y: 370, text: 'Pick up medicines, book the dentist for Saturday, and call Riya after lunch.' });
    cue(3.2, 'mic'); cue(6.7, 'tick'); cue(7.0, 'pop', { p: 1.2 }); cue(7.6, 'sparkle');

    // laptop, web (dark)
    const s3 = scene(root, 'dark');
    const cam3 = camera(s3);
    const lp = laptopDevice(cam3, { x: 540, y: 780, w: 960, frames: { 'laptop-today-dark': takeFrames('laptop-today-dark') } });
    topFade(s3);
    const l3 = label(s3, { y: 92, text: '2 · On the web', color: 'var(--accent)' });
    const c3 = heading(s3, { y: 175, size: 80, text: 'Or say it *at your desk.*' });
    const vc3 = voiceCaption(s3, { y: 370, text: 'Investor update draft by Friday, remind me Thursday evening' });
    cue(8.8, 'whoosh', { len: 0.5 }); cue(9.4, 'mic'); cue(11.8, 'pop', { p: 1.2 }); cue(12.4, 'chime');

    // Claude (dark)
    const s4 = scene(root, 'dark');
    const l4 = label(s4, { y: 92, text: '3 · Inside Claude', color: 'var(--accent)' });
    const c4 = heading(s4, { y: 175, size: 80, text: 'Or *ask your AI.*' });
    const chat = el(s4, { x: 540, y: 790, w: 960, h: 900, center: true, cls: 'card2', style: { overflow: 'hidden' } });
    el(chat, { x: 0, y: 0, w: 960, h: 84, style: { display: 'flex', alignItems: 'center', gap: '14px', padding: '0 30px', fontSize: '28px', fontWeight: 650, borderBottom: '1px solid var(--border)', boxSizing: 'border-box' },
      html: `${icon('chat', 28)}Claude<span style="margin-left:auto;display:flex;align-items:center;gap:10px;font-size:22px;color:var(--muted)">${mark(30)}MyConfía connected<span style="width:11px;height:11px;border-radius:50%;background:#16a34a"></span></span>` });
    const ask = el(chat, { x: 460, y: 112, w: 470, html: 'What’s on today?', style: { background: 'var(--bg2)', borderRadius: '26px 26px 8px 26px', padding: '20px 26px', fontSize: '30px', fontWeight: 500, boxSizing: 'border-box', textAlign: 'right' } });
    const used = el(chat, { x: 30, y: 230, html: `${icon('spark', 22, 'var(--accent)')}Used MyConfía · <span class="mono">show_today</span>${icon('check', 22, '#16a34a', 3)}`, style: { display: 'flex', alignItems: 'center', gap: '10px', fontSize: '23px', color: 'var(--muted)', border: '1px solid var(--border-strong)', padding: '10px 16px', borderRadius: '14px' } });
    const view = still(chat, { x: 480, y: 560, w: 900, take: 'mcp-today-dark', radius: 22 });
    view.style.border = '1px solid var(--border-strong)';
    cue(13.3, 'whoosh', { len: 0.5 }); cue(14.0, 'pop'); cue(14.6, 'blip', { p: 1.1 }); cue(15.2, 'pop', { p: 1.3 });

    const end = endCard(root, cue, 17.2, { theme: 'light' });

    return t => {
      sceneShow(s1, t, 0, 2.6);
      words(a1, t, 0.3, { out: 2.3 }); words(a2, t, 1.0, { out: 2.3 });

      sceneShow(s2, t, 2.6, 8.4);
      show(l2, t, 2.8, Infinity, { y: -10, e: 'out5' }); words(c2, t, 2.9);
      show(ph, t, 2.6, Infinity, { y: 240, s: 0.94, e: 'out5', d: 0.8 });
      vc2._update(t, 3.2, 6.5);
      ph._set('phone-voice-light', voiceFrame('phone-voice-light', t, 3.2, 6.5, 8.0));
      aim(cam2, t, [[2.6, 1, 540, 840, 540, 840], [3.4, 1.6, 540, 1200, 540, 1040], [6.6, 1.6, 540, 1200, 540, 1040], [7.5, 1.4, 540, 640, 540, 800]]);

      sceneShow(s3, t, 8.4, 13.0);
      show(l3, t, 8.6, Infinity, { y: -10, e: 'out5' }); words(c3, t, 8.7);
      show(lp, t, 8.4, Infinity, { y: 200, s: 0.95, e: 'out5', d: 0.8 });
      vc3._update(t, 9.4, 11.7);
      lp._set('laptop-today-dark', voiceFrame('laptop-today-dark', t, 9.4, 11.7, 12.6));
      aim(cam3, t, [[8.4, 1, 540, 780, 540, 780], [9.3, 2.15, 560, 1008, 540, 950], [11.7, 2.15, 560, 1008, 540, 950], [12.4, 1.7, 612, 800, 540, 800]]);

      sceneShow(s4, t, 13.0, 17.2);
      show(l4, t, 13.2, Infinity, { y: -10, e: 'out5' }); words(c4, t, 13.3);
      show(chat, t, 13.1, Infinity, { y: 200, s: 0.95, e: 'out5', d: 0.8 });
      show(ask, t, 13.9, Infinity, { x: 30, y: 10, e: 'out5' });
      show(used, t, 14.5, Infinity, { y: 10, e: 'out5' });
      show(view, t, 15.1, Infinity, { y: 40, s: 0.96, e: 'out5' });
      end(t);
    };
  },
};
