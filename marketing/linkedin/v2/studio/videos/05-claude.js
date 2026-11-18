// v2 · 05 · MyConfía inside Claude: the real interactive Today view (mcp_ui.py), then the setup
import { el, tf, setO, show, prog, typeText } from '../engine.js';
import { scene, sceneShow, heading, words, label, still, endCard, icon, mark, camera, aim, topFade } from '../components.js';

export default {
  duration: 22,
  poster: 10.4,
  music: { bpm: 98, key: 62, prog: ['ii', 'V', 'I', 'vi'], mood: 'warm', drumsFrom: 2.2 },
  build(root, cue) {
    const s1 = scene(root, 'dark');
    const cam = camera(s1);
    const chat = el(cam, { x: 540, y: 800, w: 980, h: 1000, center: true, cls: 'card2', style: { overflow: 'hidden' } });
    el(chat, { x: 0, y: 0, w: 980, h: 84, style: { display: 'flex', alignItems: 'center', gap: '14px', padding: '0 30px', fontSize: '28px', fontWeight: 650, borderBottom: '1px solid var(--border)', boxSizing: 'border-box' },
      html: `${icon('chat', 28)}Claude<span style="margin-left:auto;display:flex;align-items:center;gap:10px;font-size:22px;color:var(--muted)">${mark(30)}MyConfía connected<span style="width:11px;height:11px;border-radius:50%;background:#16a34a"></span></span>` });
    const user = el(chat, { x: 230, y: 110, w: 720, style: { background: 'var(--bg2)', borderRadius: '28px 28px 8px 28px', padding: '22px 28px', fontSize: '29px', lineHeight: 1.4, fontWeight: 500, boxSizing: 'border-box' } });
    const ask = 'Add “send proposal to Acme” for Friday, remind me a day before. And what’s on today?';
    const tools = ['add_task', 'show_today'].map((name, i) => el(chat, {
      x: 30, y: 290 + i * 64,
      html: `<span class="sp" style="display:flex">${icon('spark', 22, 'var(--accent)')}</span>Used MyConfía · <span class="mono">${name}</span><span class="ok" style="display:flex">${icon('check', 22, '#16a34a', 3)}</span>`,
      style: { display: 'flex', alignItems: 'center', gap: '10px', fontSize: '23px', color: 'var(--muted)', border: '1px solid var(--border-strong)', padding: '10px 16px', borderRadius: '14px' },
    }));
    const reply = el(chat, { x: 30, y: 432, w: 920, style: { fontSize: '28px', lineHeight: 1.45 } });
    const replyText = 'Done: “Send proposal to Acme” is in Work, due Friday, reminder Thursday 10 AM. Here’s your day:';
    const view = still(chat, { x: 490, y: 790, w: 920, take: 'mcp-today-dark', radius: 22 });
    view.style.border = '1px solid var(--border-strong)';
    topFade(s1, 380);
    const lb = label(s1, { y: 92, text: 'MyConfía in Claude · MCP', color: 'var(--accent)' });
    const a1 = heading(s1, { y: 180, size: 78, text: 'Your second brain, *inside your AI.*' });
    cue(0.3, 'pop'); cue(2.2, 'type', { len: 2.2 }); cue(4.8, 'blip'); cue(5.3, 'tick'); cue(5.5, 'blip', { p: 1.2 }); cue(6.0, 'tick'); cue(8.2, 'pop', { p: 1.2 }); cue(9.0, 'chime');

    const s2 = scene(root, 'light');
    const b1 = heading(s2, { y: 270, size: 90, text: 'Set it up in *a minute.*' });
    const steps = el(s2, { x: 540, y: 690, w: 920, center: true, cls: 'group' });
    steps.innerHTML = [['1', 'In Claude: Settings → Connectors', 'Choose “Add custom connector”'], ['2', 'Paste your MyConfía address', 'It’s in MyConfía → Settings → Use MyConfía in Claude'], ['3', 'Sign in and press Allow', 'No new password. Disconnect anytime.']].map(([n, t, s]) =>
      `<div class="row" style="font-size:34px"><div style="width:72px;height:72px;border-radius:50%;background:var(--accent);color:#fff;font-weight:700;display:flex;align-items:center;justify-content:center;flex:none">${n}</div><div><div class="rt" style="font-weight:650">${t}</div><div class="rm" style="white-space:normal">${s}</div></div></div>`).join('');
    const foot = el(s2, { x: 540, y: 1060, center: true, html: `${icon('plug', 28, 'var(--muted)')}Built on MCP, the open standard for connecting AI apps`, style: { display: 'flex', alignItems: 'center', gap: '12px', fontSize: '28px', color: 'var(--muted)', fontWeight: 550 } });
    cue(12.6, 'whoosh', { len: 0.5 }); cue(13.3, 'pop'); cue(13.7, 'pop', { p: 1.15 }); cue(14.1, 'pop', { p: 1.3 });

    const end = endCard(root, cue, 18.2, { theme: 'dark' });

    return t => {
      sceneShow(s1, t, 0, 12.4);
      show(lb, t, 0.2, Infinity, { y: -10, e: 'out5' }); words(a1, t, 0.3);
      show(chat, t, 1.2, Infinity, { y: 260, s: 0.94, e: 'out5', d: 0.9 });
      show(user, t, 2.0, Infinity, { x: 30, y: 10, e: 'out5' });
      if (t > 2.1) typeText(user, ask, t, 2.2, 4.4, t < 4.6); else user.innerHTML = '';
      tools.forEach((n, i) => { const a = 4.8 + i * 0.7; show(n, t, a, Infinity, { y: 10, e: 'out5' }); n.querySelector('.sp').style.transform = `rotate(${t < a + 0.45 ? t * 400 : 0}deg)`; setO(n.querySelector('.ok'), t > a + 0.45 ? 1 : 0); });
      if (t > 6.4) typeText(reply, replyText, t, 6.4, 7.9, false); else reply.innerHTML = '';
      show(view, t, 8.1, Infinity, { y: 40, s: 0.96, e: 'out5' });
      aim(cam, t, [[1.2, 1, 540, 800, 540, 800], [2.0, 1.12, 540, 520, 540, 640], [8.0, 1.12, 540, 520, 540, 640], [9.2, 1.12, 540, 1000, 540, 880], [12.4, 1.13, 540, 1000, 540, 880]]);

      sceneShow(s2, t, 12.4, 18.2);
      words(b1, t, 12.6);
      show(steps, t, 13.2, Infinity, { y: 40, e: 'out5' });
      [...steps.children].forEach((r, i) => { const k = prog(t, 13.3 + i * 0.4, 13.7 + i * 0.4); r.style.opacity = k; r.style.transform = `translateX(${(1 - k) * -40}px)`; });
      show(foot, t, 14.6, Infinity, { y: 20, e: 'out5' });
      end(t);
    };
  },
};
