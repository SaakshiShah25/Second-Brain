// Every LinkedIn graphic for the page: video thumbnails, image posts, carousels, page assets.
// All app screens come from the real captures in ../capture/takes (served at /capture/takes).
const T = '/capture/takes/';
const ICON = '/v2/assets/app-icon.png';
const shot = (take, f = 1) => `${T}${take}/${String(f).padStart(4, '0')}.png`;

// ── building blocks
const brand = (x = 80, y = 76) => `<div class="brand" style="left:${x}px;top:${y}px"><img src="${ICON}">MyConfía</div>`;
const tag = (text, { right = 80, top = 78 } = {}) => `<div class="tag" style="right:${right}px;top:${top}px">${text}</div>`;
const title = (html, { x = 80, y = 190, size = 112, w = 920, align = 'left' } = {}) =>
  `<div class="title" style="left:${x}px;top:${y}px;width:${w}px;font-size:${size}px;text-align:${align}">${html}</div>`;
const sub = (html, { x = 80, y = 480, size = 38, w = 900, align = 'left' } = {}) =>
  `<div class="sub" style="left:${x}px;top:${y}px;width:${w}px;font-size:${size}px;text-align:${align}">${html}</div>`;
const phone = (src, { x, y, w = 560, rot = 0, z = 2 }) =>
  `<div class="phone" style="left:${x}px;top:${y}px;width:${w}px;transform:rotate(${rot}deg);z-index:${z}"><img src="${src}"></div>`;
const laptop = (src, { x, y, w = 1000, z = 2 }) =>
  `<div class="laptop" style="left:${x}px;top:${y}px;width:${w}px;z-index:${z}"><div class="scr"><img src="${src}"></div><div class="base"></div></div>`;
const picture = (src, { x, y, w, h, pos = 'top', z = 2, r = 28 }) =>
  `<div class="shot" style="left:${x}px;top:${y}px;width:${w}px;${h ? `height:${h}px;` : ''}z-index:${z};border-radius:${r}px"><img src="${src}" style="${h ? `height:100%;object-fit:cover;object-position:${pos}` : ''}"></div>`;
const watch = (label = 'Watch', { right = 80, bottom = 80, left } = {}) =>
  `<div class="watch" style="${left != null ? `left:${left}px` : `right:${right}px`};bottom:${bottom}px"><i></i>${label}</div>`;
const micSvg = (s = 30) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round"><rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>`;
const bubble = (text, { x = 60, y, w = 960, size = 38 }) =>
  `<div class="bubble" style="left:${x}px;top:${y}px;width:${w}px;font-size:${size}px"><div class="mic">${micSvg()}</div><div>${text}</div></div>`;
const chip = (label, c, style = '') => `<span class="chip" style="--c:${c};${style}"><b></b>${label}</span>`;
const dots = (n, on, { x = 80, y = 1250 } = {}) => `<div class="dots" style="left:${x}px;top:${y}px">${Array.from({ length: n }, (_, i) => `<span class="${i === on ? 'on' : ''}"></span>`).join('')}</div>`;
const swipe = (text = 'Swipe', { right = 80, y = 1234 } = {}) => `<div class="swipe" style="right:${right}px;top:${y}px">${text} <span style="font-size:36px">→</span></div>`;
const fade = (from = 1010, to = 1350) => `<div style="position:absolute;left:0;right:0;top:${from}px;height:${to - from}px;z-index:3;background:linear-gradient(transparent, var(--bg) 92%)"></div>`;

const SPACE = { work: '#2f6fd6', family: '#d6336c', health: '#16a34a', home: '#ea7a0c', side: '#7c5cd6', money: '#0f9488', kids: '#db2777', uni: '#4f46e5', customers: '#0891b2' };

// ── thumbnails (1080×1350, same 4:5 as the videos)
const TH = (id, theme, fn) => ({ id: `thumb-${id}`, out: `thumbnails/${id}.jpg`, w: 1080, h: 1350, theme: `${theme} glow`, pages: [fn] });

const thumbnails = [
  TH('01-intro', 'light', () => `${brand()}${tag('Ep 01')}
    ${title('You’re not<br><span class="acc">one person.</span><br>You’re five.', { y: 190, size: 108 })}
    ${bubble('“Prep the deck tonight, buy a toy for Aarav, call Mom at 7, gym at 6.”', { x: 80, y: 560, w: 920, size: 36 })}
    ${phone(shot('phone-capture-light', 37), { x: 250, y: 780, w: 580 })}
    ${watch('Watch', { right: 80, bottom: 70 })}`),

  TH('02-everywhere', 'light', () => `${brand()}${tag('Ep 02')}
    ${title('Say it once.<br><span class="acc">It’s everywhere.</span>', { y: 200, size: 118 })}
    ${laptop(shot('laptop-today-light', 17), { x: 40, y: 560, w: 860 })}
    ${picture(shot('mcp-today-dark'), { x: 600, y: 470, w: 440, r: 22, z: 3 })}
    ${phone(shot('phone-today-light', 1), { x: 640, y: 760, w: 360, z: 4 })}
    ${sub('Phone · Web · Claude', { y: 1210, size: 40 })}
    ${watch('Watch', { right: 80, bottom: 60 })}`),

  TH('03-web', 'light', () => `${brand()}${tag('Ep 03 · Web')}
    ${title('No forms.<br>No typing.<br><span class="acc">Just say it.</span>', { y: 190, size: 116 })}
    ${laptop(shot('laptop-ask-light', 15), { x: 120, y: 640, w: 1180 })}
    ${bubble('“What did I promise the design team?”', { x: 80, y: 1060, w: 680, size: 34 })}
    ${watch('Watch', { right: 80, bottom: 60 })}`),

  TH('04-mobile', 'light', () => `${brand()}${tag('Ep 04 · Phone')}
    ${title('5 seconds.<br><span class="acc">Zero typing.</span>', { y: 200, size: 124 })}
    ${sub('Tap the mic. Say it. Done.', { y: 460, size: 42 })}
    ${phone(shot('phone-voice-light', 16), { x: 300, y: 580, w: 600 })}
    ${bubble('“Pick up medicines, book the dentist for Saturday, call Riya after lunch.”', { x: 80, y: 960, w: 700, size: 34 })}
    ${watch('Watch', { right: 80, bottom: 80 })}`),

  TH('05-claude', 'dark', () => `${brand()}${tag('Ep 05 · Claude')}
    ${title('We asked Claude<br>what’s on today.<br><span class="acc">It knew.</span>', { y: 190, size: 108 })}
    ${picture(shot('mcp-today-dark'), { x: 110, y: 620, w: 860, r: 30 })}
    ${fade(1100)}
    ${watch('Watch', { right: 80, bottom: 70 })}`),

  TH('06-secure', 'navy', () => `${brand()}${tag('Ep 06 · Privacy', { top: 78 })}
    ${title('What happens to<br>your data.<br><span class="acc">In plain words.</span>', { y: 190, size: 104 })}
    <div style="position:absolute;left:80px;top:590px;z-index:4;display:flex;flex-direction:column;gap:22px;font-size:38px;font-weight:600;letter-spacing:-0.02em">
      ${['Encrypted at rest (AES)', 'Never trains AI', 'Never sold. No ads.'].map(t => `<div style="display:flex;gap:18px;align-items:center"><span style="width:52px;height:52px;border-radius:50%;background:#e8a93a;color:#211f38;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:30px">✓</span>${t}</div>`).join('')}
    </div>
    ${phone(shot('phone-settings-light', 3), { x: 600, y: 600, w: 440, rot: 4 })}
    ${watch('Watch', { left: 80, bottom: 90 })}`),

  TH('07-five', 'light', () => `${brand()}${tag('Ep 07')}
    ${title('Most apps think<br>you’re <span class="acc">one person.</span>', { y: 200, size: 108 })}
    <div style="position:absolute;left:80px;top:470px;width:470px;z-index:5;display:flex;flex-wrap:wrap;gap:18px">
      ${chip('Work', SPACE.work)}${chip('Side project', SPACE.side)}${chip('Family', SPACE.family)}${chip('Health', SPACE.health)}${chip('Home', SPACE.home)}
    </div>
    ${phone(shot('phone-spaces-light', 1), { x: 560, y: 470, w: 470 })}
    ${watch('Watch', { left: 80, bottom: 90 })}`),

  ...[
    ['08-student', 'Ep 08 · Students', 'Students aren’t<br><span class="acc">one person</span> either.', 'persona-student-today', 'light'],
    ['09-founder', 'Ep 09 · Founders', 'Founders are<br><span class="acc">five people.</span>', 'persona-founder-today', 'dark'],
    ['10-professional', 'Ep 10 · Side hustle', '9 to 5.<br><span class="acc">6 to midnight.</span>', 'persona-professional-today', 'light'],
    ['11-parent', 'Ep 11 · Parents', 'The invisible<br>to-do list<br><span class="acc">at home.</span>', 'persona-parent-today', 'light'],
  ].map(([id, t, h, take, theme]) => TH(id, theme, () => `${brand()}${tag(t)}
    ${title(h, { y: 200, size: 116 })}
    ${phone(shot(take), { x: 250, y: 560, w: 580 })}
    ${watch('Watch', { right: 80, bottom: 80 })}`)),

  TH('12-waitlist', 'light', () => `${brand()}${tag('Early access')}
    ${title('One place for<br><span class="acc">all five of you.</span>', { y: 200, size: 116 })}
    ${phone(shot('phone-capture-light', 1), { x: 80, y: 520, w: 460, rot: -4 })}
    ${phone(shot('phone-today-light', 1), { x: 540, y: 560, w: 460, rot: 4 })}
    <div class="watch" style="left:50%;transform:translateX(-50%);bottom:90px;font-size:38px;padding:24px 44px 24px 26px"><i></i>Join the waitlist</div>`),
];

// ── image posts (1080×1350)
const IMG = (id, theme, fn) => ({ id, out: `images/${id}.png`, w: 1080, h: 1350, theme: `${theme} glow`, pages: [fn] });

const five = [
  ['💼', 'The employee', 'Deck due at 9', SPACE.work],
  ['🚀', 'The side-hustler', 'Landing page, half done', SPACE.side],
  ['👶', 'The parent', 'Lunch box, school form, toy', SPACE.family],
  ['🏋️', 'The gym-goer', '“Tomorrow, definitely”', SPACE.health],
  ['📞', 'The kid', '“Call Mom” for day four', SPACE.home],
];

const images = [
  IMG('p01-welcome', 'navy', () => `
    <img src="${ICON}" style="position:absolute;left:390px;top:150px;width:300px;height:300px;border-radius:70px;box-shadow:0 40px 100px rgba(0,0,0,.4)">
    ${title('Hi, we’re MyConfía.', { x: 0, y: 530, w: 1080, size: 100, align: 'center' })}
    ${sub('A second brain for people who are<br>never just one thing.', { x: 0, y: 670, w: 1080, size: 44, align: 'center' })}
    <div style="position:absolute;left:0;right:0;top:860px;display:flex;justify-content:center;gap:16px;flex-wrap:wrap;padding:0 100px;z-index:4">
      ${['🎙️ Say it', '🗂️ It sorts', '🔔 It reminds', '💬 Ask it'].map(t => `<span style="padding:18px 30px;border-radius:99px;background:#2c2a47;border:1px solid rgba(246,241,231,.15);font-size:34px;font-weight:600">${t}</span>`).join('')}
    </div>
    <div style="position:absolute;left:0;right:0;bottom:110px;text-align:center;font-size:40px;font-weight:700;letter-spacing:-0.02em;z-index:4">You’re not one person. <span class="acc">You’re five.</span></div>`),

  IMG('p02-meet-the-five', 'light', () => `${brand()}
    ${title('How many people<br>are you <span class="acc">before 10 AM?</span>', { y: 170, size: 80 })}
    <div style="position:absolute;left:80px;right:80px;top:390px;display:flex;flex-direction:column;gap:16px;z-index:4">
      ${five.map(([e, n, d, c]) => `<div class="card" style="display:flex;align-items:center;gap:28px;padding:20px 34px;border-left:10px solid ${c}">
        <span style="font-size:58px">${e}</span><div><div style="font-size:42px;font-weight:700;letter-spacing:-0.03em">${n}</div><div style="font-size:30px;color:var(--muted);margin-top:4px">${d}</div></div></div>`).join('')}
    </div>
    <div style="position:absolute;left:80px;bottom:76px;font-size:40px;font-weight:700;letter-spacing:-0.02em;z-index:4">Five lives. One head. <span class="acc">One second brain.</span></div>`),

  IMG('p04-not-a-todo-app', 'light', () => `${brand()}
    ${title('It’s not a <span style="text-decoration:line-through;text-decoration-color:var(--accent);text-decoration-thickness:10px">to-do app.</span>', { y: 180, size: 92 })}
    <div style="position:absolute;left:80px;right:80px;top:340px;display:grid;grid-template-columns:1fr 1fr;gap:28px;z-index:4">
      <div class="card" style="padding:40px 36px;background:var(--bg2);box-shadow:none">
        <div style="font-size:34px;font-weight:700;color:var(--muted);margin-bottom:30px">A to-do app</div>
        ${['You type, pick a list, pick a date', 'Holds tasks only', 'Forgets what you decided', 'You do the sorting'].map(t => `<div style="display:flex;gap:16px;font-size:32px;line-height:1.25;margin-bottom:28px;color:var(--muted)"><span style="color:#b91c1c;font-weight:800">✕</span>${t}</div>`).join('')}
      </div>
      <div class="card" style="padding:40px 36px;border:3px solid var(--accent)">
        <div style="font-size:34px;font-weight:700;color:var(--accent);margin-bottom:30px">MyConfía</div>
        ${['You just say it, any way you like', 'To-dos, lists and notes per space', 'Answers what you told it, with the source', 'Sorts and reminds for you'].map(t => `<div style="display:flex;gap:16px;font-size:32px;line-height:1.25;margin-bottom:28px;font-weight:600"><span style="color:#16a34a;font-weight:800">✓</span>${t}</div>`).join('')}
      </div>
    </div>
    ${picture(shot('laptop-ask-light', 15), { x: 80, y: 1010, w: 920, h: 250, pos: '50% 8%', r: 24 })}
    <div style="position:absolute;left:80px;bottom:30px;font-size:24px;color:var(--faint);z-index:4">Real screen: asking MyConfía on the web</div>`),

  IMG('p05-palest-ink', 'navy', () => `
    <div style="position:absolute;left:80px;top:150px;font-size:300px;line-height:1;font-weight:900;color:#e8a93a;opacity:.9">“</div>
    ${title('The palest ink<br>is better than<br>the best memory.', { y: 420, size: 112 })}
    ${sub('— Chinese proverb', { y: 820, size: 40 })}
    <div style="position:absolute;left:80px;right:80px;bottom:100px;display:flex;align-items:center;gap:20px;font-size:34px;font-weight:600;z-index:4">
      <img src="${ICON}" style="width:64px;height:64px;border-radius:16px">Today, the ink is your voice. <span class="acc">Just say it.</span></div>`),

  IMG('p07-light-or-dark', 'light', () => `
    <div style="position:absolute;right:0;top:0;bottom:0;width:540px;background:#141210"></div>
    <div style="position:absolute;left:0;top:90px;width:540px;text-align:center;font-size:96px;font-weight:800;letter-spacing:-0.05em;z-index:4">☀️<br>Light</div>
    <div style="position:absolute;right:0;top:90px;width:540px;text-align:center;font-size:96px;font-weight:800;letter-spacing:-0.05em;color:#f5f2eb;z-index:4">🌙<br>Dark</div>
    ${phone(shot('phone-today-light', 1), { x: 60, y: 420, w: 420 })}
    ${phone(shot('phone-today-dark', 1), { x: 600, y: 420, w: 420 })}
    <div style="position:absolute;left:50%;top:1170px;transform:translateX(-50%);z-index:5;padding:22px 40px;border-radius:99px;background:#ea580c;color:#fff;font-size:38px;font-weight:700;white-space:nowrap;box-shadow:0 18px 44px rgba(234,88,12,.4)">Which one are you? Vote below</div>`),

  IMG('p08-say-it-messy', 'light', () => `${brand()}
    ${title('Say it <span class="acc">messy.</span><br>It still gets it right.', { y: 180, size: 88 })}
    ${bubble('“CEO meeting tomorrow 9am, prep the deck tonight. Buy a toy for Aarav, call Mom at 7, 1 kg veggies, gym at 6.”', { x: 80, y: 400, w: 920, size: 34 })}
    <div style="position:absolute;left:520px;top:650px;font-size:60px;z-index:4;color:var(--accent)">↓</div>
    ${phone(shot('phone-capture-light', 37), { x: 80, y: 740, w: 470 })}
    <div style="position:absolute;left:600px;top:780px;display:flex;flex-direction:column;gap:20px;z-index:5">
      ${chip('Work · 2', SPACE.work)}${chip('Family · 2', SPACE.family)}${chip('Health · 1', SPACE.health)}
      <div style="font-size:28px;color:var(--muted);line-height:1.35;margin-top:14px;width:400px">Dates and reminders set. One Undo removes it all.</div>
    </div>`),

  IMG('p09-shipped', 'light', () => `${brand()}${tag('Build in public')}
    ${title('What we shipped<br><span class="acc">this fortnight.</span>', { y: 180, size: 92 })}
    <div style="position:absolute;left:80px;right:80px;top:400px;display:grid;grid-template-columns:1fr 1fr;gap:20px;z-index:4">
      ${[['🔌', 'Claude connection', 'Sign in, approve, disconnect any time'], ['💻', 'Laptop layout', 'Sidebar, wide pages, shortcuts'], ['⏰', 'Alarm reminders', 'Full-screen card, sound, vibration'],
         ['🔔', 'Always before due', 'Reminders never land late'], ['🔍', 'Typo-proof search', 'Spaces, lists, to-dos, notes'], ['🔐', 'App lock', 'A PIN on any device']]
        .map(([e, h, d]) => `<div class="card" style="padding:28px 30px;min-height:240px"><div style="font-size:54px">${e}</div><div style="font-size:36px;font-weight:700;letter-spacing:-0.03em;margin-top:14px">${h}</div><div style="font-size:27px;color:var(--muted);margin-top:8px;line-height:1.3">${d}</div></div>`).join('')}
    </div>
    <div style="position:absolute;left:80px;bottom:70px;font-size:32px;font-weight:600;color:var(--muted);z-index:4">What should we build next? Tell us below.</div>`),

  IMG('p10-which-one', 'light', () => `${brand()}
    ${title('Which of your five<br><span class="acc">forgets the most?</span>', { y: 180, size: 92 })}
    <div style="position:absolute;left:80px;right:80px;top:440px;display:flex;flex-direction:column;gap:20px;z-index:4">
      ${[['A', '💼', 'The employee', SPACE.work], ['B', '🚀', 'The side-hustler', SPACE.side], ['C', '📞', 'The family one', SPACE.family], ['D', '🏋️', 'The health one', SPACE.health], ['E', '🏠', 'The home one', SPACE.home]]
        .map(([l, e, n, c]) => `<div class="card" style="display:flex;align-items:center;gap:28px;padding:22px 30px"><span style="width:76px;height:76px;border-radius:22px;background:${c};color:#fff;display:flex;align-items:center;justify-content:center;font-size:40px;font-weight:800">${l}</span><span style="font-size:50px">${e}</span><span style="font-size:42px;font-weight:700;letter-spacing:-0.03em">${n}</span></div>`).join('')}
    </div>
    <div style="position:absolute;left:80px;bottom:76px;font-size:40px;font-weight:700;z-index:4">Reply with a letter 👇</div>`),

  IMG('p11-privacy', 'navy', () => `${brand()}
    ${title('5 questions to ask<br><span class="acc">any app</span> you trust.', { y: 180, size: 90 })}
    <div style="position:absolute;left:80px;right:80px;top:440px;display:flex;flex-direction:column;gap:18px;z-index:4">
      ${[['Encrypted when stored?', 'Yes, AES. Key kept outside the database.', true], ['Used to train AI?', 'Never.', true], ['Sold, or used for ads?', 'Never. No ads at all.', true],
         ['Can I take my data?', 'Yes. Download everything in Settings.', true], ['End-to-end encrypted?', 'No. The app reads notes to sort and answer.', false]]
        .map(([q, a, ok]) => `<div style="display:flex;gap:24px;align-items:center;padding:24px 30px;border-radius:28px;background:#2c2a47;border:1px solid rgba(246,241,231,.12)">
          <span style="flex:none;width:60px;height:60px;border-radius:50%;background:${ok ? '#e8a93a' : 'transparent'};border:3px solid #e8a93a;color:${ok ? '#211f38' : '#e8a93a'};display:flex;align-items:center;justify-content:center;font-size:32px;font-weight:900">${ok ? '✓' : '✕'}</span>
          <div><div style="font-size:36px;font-weight:700;letter-spacing:-0.02em">${q}</div><div style="font-size:28px;color:var(--muted);margin-top:4px">${a}</div></div></div>`).join('')}
    </div>
    <div style="position:absolute;left:80px;bottom:60px;font-size:28px;color:var(--muted);z-index:4">MyConfía’s answers. Honest beats buzzwords.</div>`),
];

// ── carousels (1080×1350 slides → PDF + PNGs)
const slideHead = (n, total, label) => `${brand()}<div class="tag" style="right:80px;top:78px">${label} · ${n}/${total}</div>`;

const howItWorks = [
  () => `${brand()}
    ${title('Most apps make<br>you organise first.<br><span class="acc">We flipped it.</span>', { y: 200, size: 96 })}
    ${sub('How MyConfía works, in 4 swipes.', { y: 520, size: 44 })}
    ${phone(shot('phone-capture-light', 1), { x: 560, y: 660, w: 440, rot: 5 })}
    ${dots(6, 0)}${swipe()}`,
  ...[
    ['1', 'Say it.', 'As messy as it comes out. As many things as you like.', 'phone-voice-light', 16],
    ['2', 'It sorts.', 'Every piece lands in the right space, with its date.', 'phone-capture-light', 37],
    ['3', 'It reminds.', 'Before the due time. Never after.', 'phone-today-light', 1],
    ['4', 'Ask it.', '“What did I promise the design team?” Answered from your notes, with the source.', 'phone-ask-light', 15],
  ].map(([n, h, d, take, f], i) => () => `${slideHead(i + 1, 4, 'How it works')}
    <div class="num" style="position:absolute;left:80px;top:200px;font-size:180px;line-height:1;opacity:.95">0${n}</div>
    ${title(h, { y: 400, size: 88, w: 480 })}
    ${sub(d, { y: 520, size: 38, w: 440 })}
    ${phone(shot(take, f), { x: 560, y: 220, w: 460 })}
    ${dots(6, i + 1)}${swipe()}`),
  () => `${brand()}
    ${title('No folders to set up.<br>No forms to fill.<br><span class="acc">Just say it.</span>', { y: 260, size: 96 })}
    ${sub('Every screen in this carousel is the real app.<br>On the web, on your phone, and inside Claude.', { y: 640, size: 40 })}
    <div style="position:absolute;left:80px;top:860px;display:flex;gap:18px;z-index:4">${chip('Follow MyConfía', '#ea580c')}</div>
    ${dots(6, 5)}`,
];

const claudeSetup = [
  () => `${brand()}
    ${title('Connect your<br>second brain to<br><span class="acc">Claude</span> in 60 sec.', { y: 210, size: 104 })}
    ${sub('No code. No API keys. 3 steps.', { y: 600, size: 44 })}
    ${picture(shot('mcp-today-light'), { x: 160, y: 740, w: 840, h: 460, r: 28 })}
    ${dots(5, 0)}${swipe()}`,
  () => `${slideHead(1, 3, 'Setup')}
    <div class="num" style="position:absolute;left:80px;top:200px;font-size:180px;line-height:1">01</div>
    ${title('In<br>MyConfía', { y: 400, size: 88, w: 480 })}
    ${sub('Settings → <b style="color:var(--ink)">Use MyConfía in Claude</b> → copy the connector address.', { y: 600, size: 36, w: 460 })}
    ${phone(shot('phone-settings-light', 3), { x: 580, y: 220, w: 440 })}
    ${dots(5, 1)}${swipe()}`,
  () => `${slideHead(2, 3, 'Setup')}
    <div class="num" style="position:absolute;left:80px;top:200px;font-size:180px;line-height:1">02</div>
    ${title('In Claude', { y: 400, size: 92 })}
    <div style="position:absolute;left:80px;top:560px;display:flex;flex-direction:column;gap:22px;z-index:4">
      ${['Settings', 'Connectors', 'Add custom connector', 'Paste the address'].map((t, i) => `<div class="card" style="display:flex;align-items:center;gap:24px;padding:26px 34px;width:760px;font-size:40px;font-weight:650;letter-spacing:-0.02em"><span class="num" style="font-size:32px">${i + 1}</span>${t}${i < 3 ? '<span style="margin-left:auto;color:var(--faint)">→</span>' : ''}</div>`).join('')}
    </div>
    ${dots(5, 2)}${swipe()}`,
  () => `${slideHead(3, 3, 'Setup')}
    <div class="num" style="position:absolute;left:80px;top:200px;font-size:180px;line-height:1">03</div>
    ${title('Sign in. Press<br><span class="acc">Allow.</span> Done.', { y: 400, size: 96 })}
    ${sub('Then try:', { y: 640, size: 40 })}
    <div style="position:absolute;left:80px;top:720px;display:flex;flex-direction:column;gap:20px;z-index:4">
      ${['“What’s on today?”', '“Add ‘renew passport’ for next Monday.”', '“What did we decide in the design sync?”'].map(t => `<div class="card" style="padding:24px 32px;font-size:36px;font-weight:600;width:fit-content">💬 ${t}</div>`).join('')}
    </div>
    ${dots(5, 3)}${swipe()}`,
  () => `${brand()}
    ${title('Changed your mind?<br><span class="acc">One tap</span> disconnects.', { y: 240, size: 96 })}
    ${sub('Disconnect in MyConfía’s Settings and Claude’s access ends immediately. Deleting anything from Claude always asks you first.', { y: 560, size: 38 })}
    ${picture(shot('mcp-today-dark'), { x: 160, y: 790, w: 760, h: 400, r: 28 })}
    ${dots(5, 4)}`,
];

const carousels = [
  { id: 'p03-how-it-works', out: 'carousels/p03-how-it-works', w: 1080, h: 1350, theme: 'light glow', pages: howItWorks },
  { id: 'p06-claude-setup', out: 'carousels/p06-claude-setup', w: 1080, h: 1350, theme: 'light glow', pages: claudeSetup },
];

// ── page assets
const pageAssets = [
  { id: 'logo', out: 'page-assets/logo-400.png', w: 400, h: 400, theme: 'navy', pages: [() => `<img src="${ICON}" style="position:absolute;inset:0;width:400px;height:400px">`] },
  { id: 'cover', out: 'page-assets/cover-1128x191.png', w: 1128, h: 191, theme: 'navy', pages: [() => `
    <div style="position:absolute;left:330px;top:52px;z-index:4;font-size:44px;font-weight:800;letter-spacing:-0.04em">You’re not one person. <span class="acc">You’re five.</span></div>
    <div style="position:absolute;left:330px;top:116px;z-index:4;font-size:22px;color:var(--muted);font-weight:500">Say it. It sorts. It reminds. A second brain for all of you.</div>
`] },
];

export const graphics = [...thumbnails, ...images, ...carousels, ...pageAssets];
