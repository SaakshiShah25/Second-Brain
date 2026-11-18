// 05 · MyConfía inside Claude (MCP)
import { el, tf, setO, show, prog, ease, lerp, typeText } from '../engine.js';
import { C, SPACES, background, headline, revealWords, endCard, icon, kicker, logoSvg } from '../components.js';

export default {
  duration: 21,
  poster: 9.6,
  music: { bpm: 98, key: 62, prog: ['ii', 'V', 'I', 'vi'], mood: 'calm', drumsFrom: 2.4 },
  build(root, cue) {
    const bg = background(root, { blobs: [C.amber, C.accent, C.blue, C.amber] });
    const k = kicker(root, { y: 110, text: 'MyConfía in Claude · MCP', color: C.amberInk });
    const h1 = headline(root, { x: 540, y: 245, text: 'Your second brain, *inside your AI.*', size: 82 });
    cue(0.2, 'pop'); cue(0.6, 'pop', { p: 1.2 });

    // chat window
    const win = el(root, { x: 540, y: 820, w: 980, h: 900, center: true, cls: 'card', style: { borderRadius: '36px', overflow: 'hidden', background: '#fffdf9' } });
    el(win, {
      x: 0, y: 0, w: 980, h: 84, style: { background: C.paper2, display: 'flex', alignItems: 'center', gap: '14px', padding: '0 32px', fontSize: '28px', fontWeight: 700, boxSizing: 'border-box', borderBottom: '1px solid rgba(40,30,20,.07)' },
      html: `${icon('chat', 30, C.ink)}Claude<span style="margin-left:auto;display:flex;align-items:center;gap:10px;font-size:22px;font-weight:600;color:${C.muted}">${icon('plug', 22, C.muted)}Connected: <span style="color:${C.ink}">MyConfía</span><span style="width:12px;height:12px;border-radius:50%;background:${C.green}"></span></span>`,
    });
    const userMsg = el(win, { x: 230, y: 116, w: 720, style: { background: C.paper2, borderRadius: '28px 28px 8px 28px', padding: '22px 28px', fontSize: '29px', lineHeight: 1.4, fontWeight: 520, boxSizing: 'border-box' } });
    const ask = 'Add “send proposal to Acme” for Friday, remind me a day before. And what’s on today?';
    const tools = ['add_task', 'show_today'].map((name, i) => el(win, {
      x: 32, y: 300 + i * 66,
      html: `<span class="sp" style="display:flex">${icon('spark', 24, C.amberInk)}</span><span>Used <b>MyConfía</b> · <span class="mono">${name}</span></span><span class="ok" style="display:flex">${icon('check', 24, C.green, 3)}</span>`,
      style: { display: 'flex', alignItems: 'center', gap: '12px', fontSize: '24px', color: C.muted, background: '#fff', border: '1.5px solid rgba(40,30,20,.1)', padding: '10px 18px', borderRadius: '16px' },
    }));
    const reply = el(win, { x: 32, y: 446, w: 916, style: { fontSize: '29px', lineHeight: 1.45, fontWeight: 480 } });
    const replyText = 'Done. “Send proposal to Acme” is in Work, due Friday, with a reminder Thursday at 10 AM. Here’s your day:';
    // interactive Today view (MCP App)
    const app = el(win, { x: 32, y: 580, w: 916, cls: 'card', style: { padding: '24px 28px', borderRadius: '26px', border: `2px solid ${C.accent}26` } });
    app.innerHTML = `<div style="display:flex;align-items:center;gap:12px;font-size:24px;font-weight:700">${logoSvg(36)}Today · MyConfía<span style="margin-left:auto;font-size:20px;color:${C.muted};font-weight:500">3 to-dos</span></div>` +
      [['Prep the CEO deck', 'work', '9:00 AM'], ['Gym', 'health', '6:00 PM'], ['Call family: Happy Diwali 🪔', 'family', 'Evening']].map(([t, s, d], i) =>
        `<div class="row" style="display:flex;align-items:center;gap:16px;margin-top:${i ? 12 : 20}px;font-size:27px;font-weight:620"><div class="check" style="width:36px;height:36px;border-color:${SPACES[s].color};color:${SPACES[s].color}">${icon('check', 20, '#fff', 3.4)}</div><span class="tt" style="position:relative">${t}</span><span style="margin-left:auto;font-size:22px;color:${C.muted};font-weight:500">${d}</span></div>`).join('');
    const rows = [...app.querySelectorAll('.row')];

    // setup steps
    const h2 = headline(root, { x: 540, y: 245, text: 'Set it up in *a minute.*', size: 90 });
    const steps = [
      ['1', 'In Claude: Settings → Connectors', 'Choose “Add custom connector”'],
      ['2', 'Paste your MyConfía link', 'You’ll find it in MyConfía → Settings'],
      ['3', 'Sign in and press Allow', 'No new password. Disconnect anytime.'],
    ].map(([n, t, s], i) => el(root, {
      x: 540, y: 560 + i * 200, w: 900, center: true, cls: 'card',
      html: `<div style="width:84px;height:84px;border-radius:50%;background:${C.accent};color:#fff;font-size:42px;font-weight:750;display:flex;align-items:center;justify-content:center;flex:none">${n}</div>
        <div><div style="font-size:36px;font-weight:700;letter-spacing:-0.025em">${t}</div><div style="font-size:26px;color:${C.muted};margin-top:4px">${s}</div></div>`,
      style: { display: 'flex', alignItems: 'center', gap: '28px', padding: '30px 34px' },
    }));
    const foot = el(root, { x: 540, y: 1210, center: true, html: `${icon('plug', 28, C.amberInk)}Built on MCP, the open standard for connecting AI apps`, style: { display: 'flex', alignItems: 'center', gap: '12px', fontSize: '28px', color: C.amberInk, fontWeight: 600 } });

    cue(1.8, 'whoosh', { len: 0.5 }); cue(2.6, 'type', { len: 2.2 }); cue(4.9, 'swipe');
    cue(5.6, 'blip', { p: 1 }); cue(6.0, 'tick'); cue(6.3, 'blip', { p: 1.2 }); cue(6.7, 'tick');
    cue(8.6, 'pop', { p: 0.9 }); cue(9.0, 'tick'); cue(9.2, 'tick'); cue(9.4, 'tick');
    cue(10.4, 'chime');
    cue(12.3, 'whoosh', { len: 0.5 }); [0, 1, 2].forEach(i => cue(12.9 + i * 0.5, 'pop', { p: 0.9 + i * 0.15 })); cue(14.8, 'pop', { p: 1.4 });

    const end = endCard(root, cue, 16.6);

    return t => {
      bg(t);
      show(k, t, 0.1, 16.5, { y: -20 });
      revealWords(h1, t, 0.2, { out: 12.0 });
      revealWords(h2, t, 12.4, { out: 16.3 });
      show(win, t, 1.7, 12.0, { y: 300, s: 0.85, e: 'out5', d: 0.9 });
      show(userMsg, t, 2.4, Infinity, { y: 30, x: 30, e: 'out' });
      if (t >= 2.5) typeText(userMsg, ask, t, 2.6, 4.8, t < 4.9); else userMsg.innerHTML = '';
      tools.forEach((n, i) => {
        const a = 5.5 + i * 0.7;
        show(n, t, a, Infinity, { y: 20, e: 'out' });
        const done = t > a + 0.45;
        n.querySelector('.sp').style.transform = `rotate(${done ? 0 : t * 400}deg)`;
        setO(n.querySelector('.ok'), done ? 1 : 0);
      });
      if (t > 7.0) typeText(reply, replyText, t, 7.0, 8.4, false); else reply.innerHTML = '';
      show(app, t, 8.5, Infinity, { y: 40, s: 0.92 });
      rows.forEach((r, i) => {
        const kk = ease.out(prog(t, 8.9 + i * 0.2, 9.3 + i * 0.2));
        r.style.opacity = kk; r.style.transform = `translateX(${(1 - kk) * -30}px)`;
      });
      // tick the first one, like you would in the interactive view
      const ck = rows[0].querySelector('.check');
      ck.classList.toggle('on', t > 10.4);
      ck.style.transform = `scale(${1 + Math.sin(prog(t, 10.4, 10.8) * Math.PI) * 0.3})`;
      rows[0].querySelector('.tt').style.cssText = `position:relative;color:${t > 10.4 ? C.faint : C.ink};text-decoration:${t > 10.4 ? 'line-through' : 'none'}`;
      steps.forEach((s, i) => show(s, t, 12.9 + i * 0.5, 16.3, { x: -80, y: 0, s: 0.95 }));
      show(foot, t, 14.8, 16.3, { y: 20 });
      end(t);
    };
  },
};
