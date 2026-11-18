// 03 · MyConfía on the web
import { el, tf, setO, show, prog, ease, lerp, typeText } from '../engine.js';
import { C, background, headline, revealWords, browser, taskCard, endCard, icon, kicker, logoSvg } from '../components.js';

export default {
  duration: 17.5,
  poster: 7.2,
  music: { bpm: 100, key: 65, prog: ['IV', 'I', 'V', 'vi'], mood: 'bright', drumsFrom: 2.4 },
  build(root, cue) {
    const bg = background(root, { blobs: [C.blue, C.amber, C.accent, C.sky] });
    const k = kicker(root, { y: 110, text: 'MyConfía on the web', color: C.blue });
    const h1 = headline(root, { x: 540, y: 250, text: 'Your whole life, *on one screen.*', size: 84 });
    const h2 = headline(root, { x: 540, y: 250, text: 'Type it the way you’d *say it.*', size: 84 });
    const h3 = headline(root, { x: 540, y: 250, text: 'Ask it *anything* you’ve written.', size: 84 });
    cue(0.2, 'pop');

    const br = browser(root, { x: 540, y: 820, w: 1000, h: 820 });
    const B = br.body; // 1000 x 764
    const side = el(B, { x: 0, y: 0, w: 250, h: 764, style: { background: C.paper2, padding: '26px 22px', boxSizing: 'border-box' } });
    const spaces = [['Work', C.blue, 6], ['Family', C.pink, 3], ['Home', C.sun, 4], ['Health', C.teal, 2], ['Side project', C.red, 5]];
    side.innerHTML = `<div style="display:flex;align-items:center;gap:12px;font-weight:750;font-size:26px;letter-spacing:-0.03em">${logoSvg(42)}MyConfía</div>
      <div style="margin-top:30px;display:flex;align-items:center;gap:10px;font-size:22px;font-weight:650;color:${C.accent};background:${C.accent}14;padding:10px 12px;border-radius:12px">${icon('cal', 22, C.accent)}Today</div>
      <div style="margin:22px 0 8px 12px;font-size:17px;font-weight:650;color:${C.faint};letter-spacing:.06em">SPACES</div>` +
      spaces.map(([n, c, cnt], i) => `<div style="display:flex;align-items:center;gap:12px;padding:9px 12px;font-size:22px;font-weight:600"><span style="width:14px;height:14px;border-radius:5px;background:${c}"></span>${n}<span class="cnt${i}" style="margin-left:auto;color:${C.muted};font-size:19px">${cnt}</span></div>`).join('');
    const workCnt = side.querySelector('.cnt0');

    const main = el(B, { x: 250, y: 0, w: 750, h: 764 });
    el(main, { x: 36, y: 26, html: `<div style="font-size:20px;color:${C.muted};font-weight:500">Saturday, 15 November</div><div style="font-size:46px;font-weight:750;letter-spacing:-0.04em">Today</div>` });
    const bar = el(main, { x: 36, y: 124, w: 678, cls: 'capture', style: { padding: '12px 12px 12px 24px' }, html: `<div class="ctext" style="flex:1;font-size:25px;min-height:32px;line-height:1.3"></div><div class="cmic" style="width:50px;height:50px">${icon('send', 24, '#fff', 2.6)}</div>` });
    const barText = bar.querySelector('.ctext');
    const list = el(main, { x: 36, y: 222, w: 678, h: 540 });
    const cards = [
      ['Prep the CEO deck', 'work', 'Tonight', '8 PM'],
      ['Gym', 'health', 'Today · 6:00 PM'],
      ['Groceries: 1 kg vegetables', 'home', 'Today', null],
      ['Draft landing page copy', { name: 'Side project', color: C.red }, 'Sun'],
    ].map(([title, space, due, remind]) => taskCard(list, { x: 0, y: 0, w: 678, center: false, size: 0.7, title, space, due, remind }));
    const newCard = taskCard(list, { x: 0, y: 0, w: 678, center: false, size: 0.7, title: 'Investor update draft', space: 'work', due: 'Fri', remind: 'Thu 6 PM' });

    // answer panel
    const answer = el(main, { x: 36, y: 222, w: 678, cls: 'card', style: { padding: '28px 30px', border: `2px solid ${C.accent}30` } });
    answer.innerHTML = `<div style="display:flex;align-items:center;gap:10px;color:${C.accent};font-weight:700;font-size:22px">${icon('spark', 24, C.accent)}From your notes</div>
      <div class="ans" style="font-size:27px;line-height:1.45;margin-top:14px;font-weight:500"></div>
      <div class="src" style="display:flex;gap:10px;margin-top:20px;flex-wrap:wrap">
        <span class="meta" style="color:${C.blue};background:${C.blue}14">${icon('note', 20, C.blue)}Design sync · 12 Nov</span>
        <span class="meta" style="color:${C.blue};background:${C.blue}14">${icon('check', 20, C.blue)}To-do · Onboarding copy</span></div>`;
    const ansText = answer.querySelector('.ans'), src = answer.querySelector('.src');
    const reply = 'You promised to share the new onboarding copy by Wednesday and review the icon set before Friday’s demo.';

    cue(2.0, 'whoosh', { len: 0.5 }); cue(3.4, 'pop', { p: 0.9 });
    cue(3.7, 'type', { len: 2.0 }); cue(5.9, 'pop', { p: 1.2 }); cue(6.15, 'chime'); cue(6.5, 'tick');
    cue(8.9, 'pop'); cue(9.2, 'type', { len: 1.5 }); cue(10.9, 'sparkle'); cue(11.1, 'whoosh', { len: 0.4 }); cue(12.5, 'pop', { p: 1.3 });

    const end = endCard(root, cue, 14);

    return t => {
      bg(t);
      show(k, t, 0.1, 13.9, { y: -20 });
      revealWords(h1, t, 0.2, { out: 3.2 });
      revealWords(h2, t, 3.4, { out: 8.6 });
      revealWords(h3, t, 8.8, { out: 13.8 });
      show(br.root, t, 1.9, 13.8, { y: 300, s: 0.8, e: 'out5', d: 0.9 });
      // capture bar text
      if (t < 3.7) barText.innerHTML = `<span style="color:${C.faint}">Tell MyConfía anything…</span>`;
      else if (t < 5.9) typeText(barText, 'Investor update draft by Friday, remind me Thursday evening', t, 3.7, 5.7);
      else if (t < 9.2) barText.innerHTML = `<span style="color:${C.faint}">Tell MyConfía anything…</span>`;
      else if (t < 10.9) typeText(barText, 'What did I promise the design team?', t, 9.2, 10.7);
      else barText.innerHTML = `<span style="color:${C.faint}">Tell MyConfía anything…</span>`;
      // list: new card slides in at top and pushes others down
      const push = ease.back(prog(t, 5.9, 6.5));
      newCard.style.top = '0px';
      show(newCard, t, 5.9, Infinity, { y: -40, s: 0.85 });
      newCard.style.boxShadow = t > 6 ? `0 0 0 ${5 * (1 - prog(t, 6.2, 8.4))}px ${C.blue}55, 0 14px 40px rgba(40,30,20,.1)` : '';
      cards.forEach((c, i) => {
        c.style.top = (i * 128 + push * 128) + 'px';
        show(c, t, 2.4 + i * 0.12, Infinity, { y: 30, e: 'out' });
      });
      workCnt.textContent = t > 6.2 ? '7' : '6';
      workCnt.style.color = t > 6.2 && t < 8 ? C.blue : C.muted;
      workCnt.style.fontWeight = t > 6.2 && t < 8 ? 800 : 500;
      // answer
      const ka = show(answer, t, 11.0, Infinity, { y: 40, s: 0.94 });
      list.style.opacity = 1 - ka * 0.85;
      if (t > 11.2) typeText(ansText, reply, t, 11.3, 12.4, false); else ansText.innerHTML = '';
      setO(src, prog(t, 12.5, 12.8));
      end(t);
    };
  },
};
