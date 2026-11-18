// 02 · Where MyConfía lives: web, mobile, Claude
import { el, tf, setO, show, prog, ease, lerp, typeText } from '../engine.js';
import { C, background, headline, revealWords, browser, phone, taskCard, endCard, icon, kicker, logoSvg } from '../components.js';

export default {
  duration: 17,
  poster: 7.6,
  music: { bpm: 108, key: 64, prog: ['I', 'vi', 'IV', 'V'], mood: 'bright', drumsFrom: 2.2 },
  build(root, cue) {
    const bg = background(root, { blobs: [C.sky, C.amber, C.accent, C.teal] });
    const k = kicker(root, { y: 110, text: 'Where it lives' });
    const h1 = headline(root, { x: 540, y: 250, text: 'One brain. *Everywhere you are.*', size: 84 });
    cue(0.2, 'pop'); cue(0.5, 'pop', { p: 1.1 });

    // devices
    const br = browser(root, { x: 540, y: 610, w: 860, h: 470 });
    // web UI: sidebar + list
    const side = el(br.body, { x: 0, y: 0, w: 220, h: 414, style: { background: C.paper2, padding: '22px 18px', boxSizing: 'border-box' } });
    side.innerHTML = `<div style="display:flex;align-items:center;gap:10px;font-weight:750;font-size:22px;letter-spacing:-0.03em">${logoSvg(34)}MyConfía</div>` +
      [['Today', C.accent], ['Work', C.blue], ['Family', C.pink], ['Home', C.sun], ['Health', C.teal]].map(([n, c], i) =>
        `<div style="display:flex;align-items:center;gap:10px;margin-top:${i ? 12 : 26}px;font-size:20px;font-weight:600;color:${i ? C.ink : C.accent}"><span style="width:12px;height:12px;border-radius:4px;background:${c}"></span>${n}</div>`).join('');
    el(br.body, { x: 250, y: 22, html: 'Today', style: { fontSize: '36px', fontWeight: 750, letterSpacing: '-0.03em' } });
    const webCards = [
      taskCard(br.body, { x: 250, y: 84, w: 580, center: false, size: 0.62, title: 'Prep the CEO deck', space: 'work', due: 'Tonight' }),
      taskCard(br.body, { x: 250, y: 186, w: 580, center: false, size: 0.62, title: 'Gym', space: 'health', due: '6:00 PM' }),
    ];
    const webNew = taskCard(br.body, { x: 250, y: 288, w: 580, center: false, size: 0.62, title: "Pick up Mom's birthday cake 🎂", space: 'family', due: 'Sat', remind: 'Fri 7 PM' });

    const ph = phone(root, { x: 250, y: 1060, w: 330, h: 520 });
    el(ph.screen, { x: 26, y: 64, html: 'Today', style: { fontSize: '36px', fontWeight: 750, letterSpacing: '-0.04em' } });
    const phBar = el(ph.screen, { x: 18, y: 400, w: 266, cls: 'capture', style: { padding: '12px 12px 12px 18px', gap: '8px', borderWidth: '2px' }, html: `<div class="ctext" style="flex:1;font-size:17px;line-height:1.25;min-height:22px"></div><div class="cmic" style="width:38px;height:38px">${icon('mic', 18, '#fff')}</div>` });
    const phText = phBar.querySelector('.ctext');
    const phCard = taskCard(ph.screen, { x: 18, y: 120, w: 266, center: false, size: 0.5, title: "Mom's birthday cake 🎂", space: 'family', due: 'Sat' });

    const chat = el(root, { x: 790, y: 1060, w: 440, h: 440, center: true, cls: 'card', style: { borderRadius: '30px', overflow: 'hidden' } });
    el(chat, { x: 0, y: 0, w: 440, h: 64, style: { background: C.paper2, display: 'flex', alignItems: 'center', gap: '10px', padding: '0 22px', fontSize: '21px', fontWeight: 650 }, html: `${icon('chat', 22, C.ink)}Claude <span style="margin-left:auto;display:flex;align-items:center;gap:6px;color:${C.green};font-size:17px"><span style="width:9px;height:9px;border-radius:50%;background:${C.green}"></span>MyConfía</span>` });
    const ask = el(chat, { x: 140, y: 90, w: 280, html: "What's on this weekend?", style: { background: C.paper2, borderRadius: '20px 20px 6px 20px', padding: '14px 18px', fontSize: '20px', fontWeight: 550 } });
    const ans = el(chat, { x: 20, y: 172, w: 400, style: { fontSize: '19px', lineHeight: 1.4, color: C.ink } });
    ans.innerHTML = `Saturday: <b>pick up Mom's birthday cake</b> 🎂 (reminder Friday 7 PM).`;
    const chatCard = taskCard(chat, { x: 20, y: 290, w: 400, center: false, size: 0.55, title: "Mom's birthday cake 🎂", space: 'family', due: 'Sat', remind: 'Fri' });

    // sync beams
    const beams = [[250, 900, 540, 820], [250, 900, 790, 860]].map(() => el(root, { x: 0, y: 0, w: 22, h: 22, center: true, style: { borderRadius: '50%', background: C.accent, boxShadow: `0 0 0 8px ${C.accent}33, 0 0 30px ${C.accent}` } }));
    const beamPath = [[250, 850, 540, 700], [250, 850, 790, 940]];

    cue(2.0, 'whoosh', { len: 0.5 }); cue(2.3, 'pop', { p: 0.8 }); cue(2.5, 'pop', { p: 1 }); cue(2.7, 'pop', { p: 1.2 });
    cue(3.6, 'type', { len: 1.6 }); cue(5.4, 'pop', { p: 1.3 }); cue(5.6, 'whoosh', { len: 0.5 });
    cue(6.2, 'chime'); cue(6.6, 'tick'); cue(7.4, 'pop', { p: 1.1 });

    // platform labels
    const h2 = headline(root, { x: 540, y: 250, text: 'Capture anywhere. *It’s everywhere.*', size: 80 });
    const labels = [
      [540, 900, 'laptop', 'Web app', 'Any browser, any laptop'],
      [250, 1300, 'phone', 'Mobile', 'Android app · iPhone home screen'],
      [790, 1300, 'plug', 'Claude', 'Plugs in through MCP'],
    ].map(([x, y, ic, t, s]) => el(root, {
      x, y: y - 40, center: true,
      html: `<div style="display:flex;align-items:center;gap:12px;font-size:34px;font-weight:750;letter-spacing:-0.03em">${icon(ic, 34, C.accent, 2.4)}${t}</div><div style="font-size:24px;color:${C.muted};font-weight:500;text-align:center;margin-top:2px">${s}</div>`,
      style: { background: '#fff', padding: '16px 26px', borderRadius: '24px', boxShadow: '0 14px 40px rgba(40,30,20,.14)', border: `2px solid ${C.accent}33` },
    }));
    labels.forEach((_, i) => cue(9.3 + i * 0.35, 'pop', { p: 0.9 + i * 0.15 }));

    const end = endCard(root, cue, 13);

    return t => {
      bg(t);
      show(k, t, 0.1, 12.9, { y: -20 });
      revealWords(h1, t, 0.2, { out: 8.5 });
      revealWords(h2, t, 8.8, { out: 12.8 });
      show(br.root, t, 2.0, 12.8, { y: 120, s: 0.85 });
      show(ph.root, t, 2.3, 12.8, { y: 160, x: -80, s: 0.85, rr: -3 * prog(t, 2.3, 3) });
      show(chat, t, 2.5, 12.8, { y: 160, x: 80, s: 0.85, rr: 3 * prog(t, 2.5, 3.2) });
      webCards.forEach((c, i) => show(c, t, 2.7 + i * 0.12, Infinity, { y: 20, e: 'out' }));
      // phone capture
      if (t < 3.6) phText.innerHTML = `<span style="color:${C.faint}">Tell MyConfía…</span>`;
      else if (t < 5.4) typeText(phText, "Mom's birthday cake, Sat", t, 3.6, 5.2);
      else phText.innerHTML = `<span style="color:${C.faint}">Tell MyConfía…</span>`;
      show(phCard, t, 5.4, Infinity, { y: 60, s: 0.8 });
      // beams travel to web and chat
      beams.forEach((b, i) => {
        const [x0, y0, x1, y1] = beamPath[i];
        const kk = ease.inOut(prog(t, 5.55, 6.2));
        const vis = t > 5.55 && t < 6.35;
        tf(b, { x: lerp(x0, x1, kk), y: lerp(y0, y1, kk) - Math.sin(kk * Math.PI) * 140, s: 1, o: vis ? 1 : 0 });
      });
      show(webNew, t, 6.2, Infinity, { y: 40, s: 0.9 });
      webNew.style.boxShadow = t > 6.2 && t < 8 ? `0 0 0 ${4 * (1 - prog(t, 6.2, 8))}px ${C.pink}66, 0 14px 40px rgba(40,30,20,.1)` : '';
      show(ask, t, 6.5, Infinity, { y: 20, x: 20 });
      show(ans, t, 7.1, Infinity, { y: 20, e: 'out' });
      show(chatCard, t, 7.4, Infinity, { y: 30, s: 0.9 });
      labels.forEach((n, i) => show(n, t, 9.3 + i * 0.35, 12.8, { s: 0.6, y: 30 }));
      end(t);
    };
  },
};
