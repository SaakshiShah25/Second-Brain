// MyConfía LinkedIn PAGE copy (company voice: "we").
// 12 video posts (videos from ../v2/out, each with a designed thumbnail) + 11 image posts.
// Hooks: line 1 stops the scroll, line 2 opens a gap, and both fit above LinkedIn's "…see more" (~210 chars).
// Only the final post asks for the waitlist. Every post carries 5 hashtags, always including #MyConfia.

export const motto = 'You’re not one person. You’re five.';

export const schedule = {
  cadence: '4 posts a week for 6 weeks: image posts Mon & Wed, video posts Tue & Thu, 8:30–10:00 AM IST',
  tips: [
    'Upload videos natively (never a YouTube link) and set the matching thumbnail under “Edit thumbnail”.',
    'Carousels: upload the PDF as a Document post and give it the title shown below.',
    'Reply to every comment in the first hour; that is when LinkedIn decides how far a post travels.',
    'Re-share each page post from your personal profile with one line of your own on top.',
  ],
};

export const posts = [
  // ───────────────────────── WEEK 1
  {
    id: 'p01-welcome', when: 'Week 1 · Mon', kind: 'image', series: 'Page launch',
    media: 'out/images/p01-welcome.png',
    hook: 'You remember every song lyric from 2009, but not what you promised your team on Monday.',
    body: `You remember every song lyric from 2009, but not what you promised your team on Monday.
That isn’t a memory problem. It’s a “too many lives in one head” problem.

Hi, we’re MyConfía. 👋

We’re building a second brain for people who are never just one thing: the employee, the side-hustler, the parent, the gym-goer, the one who keeps the house running.

You say what’s on your mind, as messy as it comes out. MyConfía files every piece into the right part of your life, reminds you before it matters, and answers when you ask what you told it.

On this page we’ll show the real app, share what we ship each week, and be straight with you about how we handle your data.

Follow along. And tell us: what’s the last thing you forgot that you really shouldn’t have? 👇`,
    hashtags: ['#MyConfia', '#SecondBrain', '#Productivity', '#BuildInPublic', '#Startup'],
  },
  {
    id: 'v01-intro', when: 'Week 1 · Tue', kind: 'video', series: 'You’re not one person',
    media: '../v2/out/01-intro.mp4', thumb: 'out/thumbnails/01-intro.jpg',
    hook: 'You’re not one person. You’re five.',
    body: `You’re not one person. You’re five.
And all five of them are sharing one to-do list in your head.

The employee with a CEO deck due at 9.
The side-hustler shipping a landing page at midnight.
The parent who promised a toy last week.
The gym-goer who swore “this week, for sure”.
The son or daughter who still hasn’t called home.

So you write things down: a notes app, a WhatsApp to yourself, an email draft, the back of a receipt. Then you forget where.

Watch what happens when you just say it instead (real app, no mock-ups):
🎙️ “CEO meeting tomorrow 9am, prep the deck tonight. Buy a toy for Aarav, call Mom at 7, 1 kg veggies, gym at 6.”

One sentence. MyConfía splits it into Work, Family and Health, with dates and reminders. 🗂️

Not another to-do app. A second brain for all five of you.

Which of your five drops the ball most often?`,
    hashtags: ['#MyConfia', '#SecondBrain', '#Productivity', '#VoiceAI', '#WorkLifeBalance'],
  },
  {
    id: 'p02-meet-the-five', when: 'Week 1 · Wed', kind: 'image', series: 'Meet the five',
    media: 'out/images/p02-meet-the-five.png',
    hook: 'Quick test: how many people are you before 10 AM?',
    body: `Quick test: how many people are you before 10 AM?
Most of us hit five before the coffee kicks in.

💼 The employee: deck due at 9.
🚀 The side-hustler: landing page half done.
👶 The parent: lunch box, school form, toy.
🏋️ The gym-goer: “tomorrow, definitely.”
📞 The kid: “call Mom” for the fourth day running.

Every productivity app we tried treated us as one person with one list. So the side project vanished under the day job, and the family stuff hid behind work.

MyConfía gives each of your five a space of its own, and still shows you all five together in Today.

Which one are you neglecting this week? Be honest. 😅`,
    hashtags: ['#MyConfia', '#Productivity', '#WorkLifeBalance', '#SideHustle', '#WorkingParents'],
  },
  {
    id: 'v02-everywhere', when: 'Week 1 · Thu', kind: 'video', series: 'Three ways to tell it',
    media: '../v2/out/02-everywhere.mp4', thumb: 'out/thumbnails/02-everywhere.jpg',
    hook: 'Your thoughts don’t wait until you’re at your desk. So neither do we.',
    body: `Your thoughts don’t wait until you’re at your desk. So neither do we.
Say it in one place, and it shows up in all three.

📱 On your phone: tap the mic and just say it.
💻 On the web: see your whole life on one screen.
🔌 Inside Claude: ask your AI what’s on today, or have it add a to-do for you.

Same spaces, same reminders, same memory, everywhere.

The video shows the real app, light and dark, exactly as you’ll use it. Over the next few weeks we’ll walk through each one.

Where do your best ideas usually turn up: phone, laptop, or mid-chat with an AI?`,
    hashtags: ['#MyConfia', '#Productivity', '#AI', '#CrossPlatform', '#SecondBrain'],
  },

  // ───────────────────────── WEEK 2
  {
    id: 'p03-how-it-works', when: 'Week 2 · Mon', kind: 'carousel', series: 'How it works',
    media: 'out/carousels/p03-how-it-works.pdf', docTitle: 'How MyConfía works, in 4 swipes',
    hook: 'Most apps make you organise before you can remember. We flipped it.',
    body: `Most apps make you organise before you can remember. We flipped it.
You talk. MyConfía does the filing. Here’s the whole thing in 4 swipes 👉

1️⃣ Say it. As messy as it comes out, as many things as you like.
2️⃣ It sorts. Each piece lands in the right space: Work, Family, Health, wherever.
3️⃣ It reminds. Before the due time, never after.
4️⃣ Ask it. “What did I promise the design team?” and it answers from your own notes, showing the note it used.

No folders to set up first. No forms to fill in. No “I’ll organise it later”.

Every screen in this carousel is the real app.

Which step would save you the most time?`,
    hashtags: ['#MyConfia', '#SecondBrain', '#Productivity', '#VoiceFirst', '#ProductDesign'],
  },
  {
    id: 'v03-web', when: 'Week 2 · Tue', kind: 'video', series: 'On the web',
    media: '../v2/out/03-web.mp4', thumb: 'out/thumbnails/03-web.jpg',
    hook: 'No forms. No dropdowns. No typing. Just say it.',
    body: `No forms. No dropdowns. No typing. Just say it.
This is MyConfía on a laptop, and you don’t fill in a single field.

On the left, your spaces. In the middle, Today: what’s overdue, what’s due, what’s high priority.

Tap the mic and say:
🎙️ “Investor update draft by Friday, remind me Thursday evening.”
→ A to-do in Work, due Friday, reminder Thursday evening.

Then ask, out loud:
🎙️ “What did I promise the design team?”
→ The answer, plus the note it came from, so you can check it.

Prefer typing? That works too.

Any modern browser, light or dark. Nothing to install.`,
    hashtags: ['#MyConfia', '#Productivity', '#WebApp', '#VoiceAI', '#RemoteWork'],
  },
  {
    id: 'p04-not-a-todo-app', when: 'Week 2 · Wed', kind: 'image', series: 'Not a to-do app',
    media: 'out/images/p04-not-a-todo-app.png',
    hook: 'We get asked “so it’s a to-do app?” every week. Honest answer: no.',
    body: `We get asked “so it’s a to-do app?” every week. Honest answer: no.
A to-do app remembers what you typed into it. A second brain remembers what you told it.

A to-do app:
❌ Wants you to type, pick a list, pick a date.
❌ Holds tasks, nothing else.
❌ Can’t tell you what you decided last Thursday.

MyConfía:
✅ Takes whatever you say, however you say it.
✅ Keeps to-dos, lists and notes in each space of your life.
✅ Answers questions about anything you’ve told it, and shows its source.
✅ Reminds you before it matters.

Save this for the next time someone asks you why they keep forgetting things. 🔖`,
    hashtags: ['#MyConfia', '#SecondBrain', '#Productivity', '#KnowledgeManagement', '#PKM'],
  },
  {
    id: 'v04-mobile', when: 'Week 2 · Thu', kind: 'video', series: 'On your phone',
    media: '../v2/out/04-mobile.mp4', thumb: 'out/thumbnails/04-mobile.jpg',
    hook: 'Your best ideas show up at the worst times.',
    body: `Your best ideas show up at the worst times.
Walking. Driving. Two minutes before a meeting. Halfway through dinner.

So on your phone, MyConfía takes about five seconds:

1. Tap the mic.
2. Say: “Pick up medicines, book the dentist for Saturday, and call Riya after lunch.”
3. Send.

Your words appear as you speak. Then they’re filed: two to-dos in Health, one in Family, each with its date. 🔔 The reminder arrives before it’s due.

No typing. No sorting. No “I’ll write it down later”.

→ Android: MyConfía on Google Play
→ iPhone: open MyConfía in Safari, tap Share, then “Add to Home Screen”

What’s the weirdest place a great idea has hit you?`,
    hashtags: ['#MyConfia', '#Productivity', '#VoiceNotes', '#MobileApp', '#Android'],
  },

  // ───────────────────────── WEEK 3
  {
    id: 'p05-palest-ink', when: 'Week 3 · Mon', kind: 'image', series: 'Quote',
    media: 'out/images/p05-palest-ink.png',
    hook: '“The palest ink is better than the best memory.” This proverb is older than paper notebooks.',
    body: `“The palest ink is better than the best memory.”
This proverb is older than paper notebooks, and it’s still right.

Your brain is brilliant at ideas and terrible at storage. Every “I’ll remember that” is a small bet against yourself, and most of us lose it daily.

The modern version of pale ink shouldn’t need a pen, a notebook, or even typing. It should be as easy as saying the thought out loud the moment you have it.

That’s the whole idea behind MyConfía.

What’s one thing you were sure you’d remember, and didn’t? 👇`,
    hashtags: ['#MyConfia', '#Productivity', '#Mindset', '#SecondBrain', '#MondayMotivation'],
  },
  {
    id: 'v05-claude', when: 'Week 3 · Tue', kind: 'video', series: 'Inside Claude (MCP)',
    media: '../v2/out/05-claude.mp4', thumb: 'out/thumbnails/05-claude.jpg',
    hook: 'We asked Claude what was on our plate today. It actually knew.',
    body: `We asked Claude what was on our plate today. It actually knew.
Because MyConfía now plugs straight into Claude.

It uses MCP, the Model Context Protocol, an open standard for connecting AI assistants to your tools. Once connected, you can say:

→ “Add ‘send proposal to Acme’ for Friday and remind me a day before.”
→ “What’s on today?”
→ “What did I note from my call with Arjun?”
→ “Save this meeting summary to my Work space.”

And Claude doesn’t just reply in text. It shows MyConfía’s own Today view right in the chat, and you can tick things off there.

🔐 No new password. Deleting anything always asks you first. Disconnect from Settings any time and access ends straight away.

Your AI is great at thinking. Now it remembers, too.`,
    hashtags: ['#MyConfia', '#Claude', '#MCP', '#AIAgents', '#GenerativeAI'],
  },
  {
    id: 'p06-claude-setup', when: 'Week 3 · Wed', kind: 'carousel', series: 'Claude setup',
    media: 'out/carousels/p06-claude-setup.pdf', docTitle: 'Connect MyConfía to Claude in 60 seconds',
    hook: 'Connect your second brain to Claude in about 60 seconds. No code, no API keys.',
    body: `Connect your second brain to Claude in about 60 seconds. No code, no API keys.
Swipe through the 3 steps 👉

1️⃣ In MyConfía: Settings → “Use MyConfía in Claude” → copy the connector address.
2️⃣ In Claude: Settings → Connectors → Add custom connector → paste it.
3️⃣ Sign in to MyConfía and press Allow.

That’s it. Now try:
💬 “What’s on today?”
💬 “Add ‘renew passport’ for next Monday.”
💬 “What did we decide in the design sync?”

Changed your mind? Disconnect from MyConfía’s Settings and Claude’s access ends immediately.

Save this post for later 🔖`,
    hashtags: ['#MyConfia', '#Claude', '#MCP', '#AItools', '#Productivity'],
  },
  {
    id: 'v06-secure', when: 'Week 3 · Thu', kind: 'video', series: 'Your data is safe',
    media: '../v2/out/06-secure.mp4', thumb: 'out/thumbnails/06-secure.jpg',
    hook: 'You’re about to tell an app about all five of your lives. You deserve to know exactly what happens next.',
    body: `You’re about to tell an app about all five of your lives.
You deserve to know exactly what happens next. In plain words:

🔒 Your notes and to-do descriptions are encrypted with AES before they’re stored.
🗝️ The encryption key lives outside the database. Someone who breaks into the database sees gibberish.
🧠 Your data is never used to train AI models.
🚫 Never sold. No ads. Not now, not later.
📦 Download all your data from Settings, any time.
📱 Add an App lock PIN on any device.

And the honest part, because it matters more than buzzwords: MyConfía is not end-to-end encrypted. To sort your notes, set reminders and answer questions, the app has to read them, and that processing runs through our AI providers under the same rule: never used for training.

We’d rather tell you up front than hide it in the fine print.

Privacy questions? Ask below. We answer every one.`,
    hashtags: ['#MyConfia', '#Privacy', '#DataSecurity', '#Encryption', '#TrustAndSafety'],
  },

  // ───────────────────────── WEEK 4
  {
    id: 'p07-light-or-dark', when: 'Week 4 · Mon', kind: 'image', series: 'Light or dark?',
    media: 'out/images/p07-light-or-dark.png',
    hook: 'Settle a debate in our team: light mode or dark mode?',
    body: `Settle a debate in our team: light mode or dark mode? ☀️🌙
Half of us won’t touch the other one.

So MyConfía ships both, designed side by side, not as an afterthought:

☀️ Light: warm paper, for the morning plan at your desk.
🌙 Dark: easy on the eyes, for the midnight side-hustle session.

Both screens in this image are the real Today view.

Vote in the comments: ☀️ or 🌙? We’ll share the result next week.`,
    hashtags: ['#MyConfia', '#UIDesign', '#DarkMode', '#ProductDesign', '#UX'],
  },
  {
    id: 'v07-five', when: 'Week 4 · Tue', kind: 'video', series: 'The idea behind MyConfía',
    media: '../v2/out/07-five.mp4', thumb: 'out/thumbnails/07-five.jpg',
    hook: 'Most productivity apps assume you’re one person. That’s why they stop working by week two.',
    body: `Most productivity apps assume you’re one person.
That’s why they stop working by week two.

You’re the employee, the side-hustler, the parent, the gym-goer and the one who runs the house. Five people, five lists, one head.

That one idea shaped every part of MyConfía:

🗂️ Each of your five gets its own space. Work doesn’t drown out Family.
🎙️ You never sort anything. Say it however it comes out.
🔔 Each one gets reminded at the right moment:
7:00 → workout before work
8:30 → CEO deck, final read
1:00 → order the toy
6:30 → veggies on the way home
7:00 → call Mom
10:30 → one more hour on the landing page
📋 And Today shows all five together when you want the full picture.

Being productive isn’t doing more. It’s not dropping things, for any of the people you are.

Who are your five?`,
    hashtags: ['#MyConfia', '#Productivity', '#WorkLifeBalance', '#TimeManagement', '#SecondBrain'],
  },
  {
    id: 'p08-say-it-messy', when: 'Week 4 · Wed', kind: 'image', series: 'Say it messy',
    media: 'out/images/p08-say-it-messy.png',
    hook: 'This is the messiest sentence we tested MyConfía with. It still got every piece right.',
    body: `This is the messiest sentence we tested MyConfía with.
It still put every piece in the right place.

🎙️ “CEO meeting tomorrow 9am, prep the deck tonight. Buy a toy for Aarav, call Mom at 7, 1 kg veggies, gym at 6.”

Six things. Three parts of life. Zero punctuation discipline.

What came back (real screen in the image):
💼 Work: meet the CEO, tomorrow 9:00 · prep the deck, tonight 8:00
👨‍👩‍👦 Family: buy a toy for Aarav · call Mom, 7:00 PM
💪 Health: gym, 6:00 PM

And if it ever gets something wrong, a single Undo removes the whole capture.

You think in run-on sentences. Your second brain should too.

Drop your messiest real to-do sentence in the comments 👇`,
    hashtags: ['#MyConfia', '#VoiceAI', '#AI', '#Productivity', '#NaturalLanguage'],
  },
  {
    id: 'v08-student', when: 'Week 4 · Thu', kind: 'video', series: 'For university students',
    media: '../v2/out/08-student.mp4', thumb: 'out/thumbnails/08-student.jpg',
    hook: 'A student isn’t one person either. Ask anyone with a hackathon, an internship and a mess fee due the same week.',
    body: `A student isn’t one person either.
Ask anyone with a hackathon, an internship and a mess fee due the same week.

You’re the student, the intern-to-be, the hackathon teammate, the runner, the son or daughter. Every one of them has deadlines.

Here’s that life in MyConfía (real screens in the video):

🎙️ Walking out of a lecture:
“Ask Professor Rao for a recommendation letter this week, and remind me about Mom’s birthday on Sunday.”

🗂️ The letter lands in University, the birthday in Family.
📋 Today shows the overdue mess fees, tonight’s hackathon call, the 6:30 run and Friday’s assignment.
🔔 Reminders come while there’s still time to act.

Fewer “I totally forgot” moments. More time to actually enjoy university.

Tag the friend who runs entirely on last-minute panic 👇`,
    hashtags: ['#MyConfia', '#Students', '#StudentLife', '#CollegeLife', '#Productivity'],
  },

  // ───────────────────────── WEEK 5
  {
    id: 'p09-shipped', when: 'Week 5 · Mon', kind: 'image', series: 'What we shipped',
    media: 'out/images/p09-shipped.png',
    hook: 'We shipped more in the last two weeks than in the month before. Here’s what changed.',
    body: `We shipped more in the last two weeks than in the month before.
Here’s what changed in MyConfía, building in public:

🔌 Claude connection: MyConfía works inside Claude, with sign-in, approval and one-tap disconnect.
💻 A real laptop layout: spaces in a sidebar, wider pages, keyboard shortcuts.
⏰ Alarm-style reminders: a full-screen card with sound, if you want more than a quiet notification.
🔔 Reminders always land before the due time, never after it.
🔍 Search that forgives typos, across spaces, lists, to-dos and notes.
🔐 App lock: a PIN to reopen MyConfía on any device.

Small team, real users, weekly releases.

What should we build next? The most-liked reply goes on our list.`,
    hashtags: ['#MyConfia', '#BuildInPublic', '#ProductUpdate', '#Startup', '#IndieHackers'],
  },
  {
    id: 'v09-founder', when: 'Week 5 · Tue', kind: 'video', series: 'For founders',
    media: '../v2/out/09-founder.mp4', thumb: 'out/thumbnails/09-founder.jpg',
    hook: 'Founders don’t drop balls because they’re disorganised. They drop them because they’re five people.',
    body: `Founders don’t drop balls because they’re disorganised.
They drop them because they’re five people.

The founder. The seller chasing a pricing call. The recruiter with an interview at 3. The fundraiser owing an investor update. And the partner and parent who has a life too.

Here’s that in MyConfía (real screens in the video):

🎙️ After a call:
“Follow up with Acme on pricing tomorrow at 11, and book our anniversary dinner for Saturday.”

🗂️ Acme goes to Customers, the dinner to Family. Both dated, both reminded.
🧠 Call notes keep their decisions and concerns. Ask later, “What did Arjun’s team say about SSO?”, and get the answer with the note it came from.
🔌 Living in Claude all day? Ask it there.

Run the company. Let MyConfía hold the details.

Founders: what’s the one thing you wish someone would remember for you?`,
    hashtags: ['#MyConfia', '#Founders', '#Startups', '#Entrepreneurship', '#Productivity'],
  },
  {
    id: 'p10-which-one', when: 'Week 5 · Wed', kind: 'image', series: 'Which one forgets?',
    media: 'out/images/p10-which-one.png',
    hook: 'Be honest. Which of your five forgets the most?',
    body: `Be honest. Which of your five forgets the most? 👀
Reply with the letter. No judgement (okay, a little).

A 💼 The employee: “Wait, that was due today?”
B 🚀 The side-hustler: the project that’s been “almost done” since March.
C 👨‍👩‍👧 The family one: the call home that keeps slipping.
D 🏋️ The health one: the gym bag that never leaves the car.
E 🏠 The home one: out of milk. Again.

Our team’s answer: mostly D, with a lot of C. 🙈

We’ll share the results (and what they say about all of us) next week.`,
    hashtags: ['#MyConfia', '#Productivity', '#WorkLifeBalance', '#Wellbeing', '#Poll'],
  },
  {
    id: 'v10-professional', when: 'Week 5 · Thu', kind: 'video', series: 'For the 9-to-5 + side hustle',
    media: '../v2/out/10-professional.mp4', thumb: 'out/thumbnails/10-professional.jpg',
    hook: '9 to 5 at the job. 6 to midnight on the dream.',
    body: `9 to 5 at the job. 6 to midnight on the dream.
If that’s you, you’re running two careers and a life out of one head.

The employee. The creator. The investor. The gym-goer. The brother or sister.

In MyConfía (real screens in the video):

🎙️ One breath:
“Q3 report due Thursday, edit the new video tonight at 9, and renew my SIP before the 5th.”

🗂️ The report lands in Day job, the video in Side hustle, the SIP in Money. Kept apart, still in one place.
📋 Today shows what matters now across all of them.
🔔 At 9 PM: “Edit the new video.” Your evening block starts on time.

Two careers. One memory.

Side-hustlers: what are you building after hours?`,
    hashtags: ['#MyConfia', '#SideHustle', '#CreatorEconomy', '#CareerGrowth', '#Productivity'],
  },

  // ───────────────────────── WEEK 6
  {
    id: 'p11-privacy', when: 'Week 6 · Mon', kind: 'image', series: 'Privacy in one picture',
    media: 'out/images/p11-privacy.png',
    hook: 'Before you trust any app with your life, ask it these 5 questions. Here are our answers.',
    body: `Before you trust any app with your life, ask it these 5 questions.
Here are our answers, no fine print.

1. Is my data encrypted when it’s stored? ✅ Yes, AES, with the key kept outside the database.
2. Is it used to train AI? ✅ Never.
3. Is it sold, or used for ads? ✅ Never. No ads at all.
4. Can I take it with me? ✅ Yes, download everything from Settings.
5. Is it end-to-end encrypted? ❌ No. The app reads your notes to sort them and answer you, through AI providers who are also bound to never train on them.

Ask these questions of every app you use. The good ones will answer plainly.

Save this checklist 🔖`,
    hashtags: ['#MyConfia', '#Privacy', '#DataProtection', '#CyberSecurity', '#DigitalWellbeing'],
  },
  {
    id: 'v11-parent', when: 'Week 6 · Tue', kind: 'video', series: 'For parents',
    media: '../v2/out/11-parent.mp4', thumb: 'out/thumbnails/11-parent.jpg',
    hook: 'Every home has an invisible to-do list. It usually lives in one person’s head.',
    body: `Every home has an invisible to-do list.
It usually lives in one person’s head.

That person is the parent. Also the chef, the homework helper, the one who calls Nani, a professional with a job of their own, and, somewhere in there, themselves.

In MyConfía (real screens in the video):

🎙️ Said while packing lunch:
“Pediatrician Tuesday at 5, carry the vaccination card, and add milk and vegetables to groceries.”

🗂️ The appointment goes to Kids with its date. Milk and vegetables go straight onto the Groceries list.
📋 Today shows the volcano project due tomorrow, the school fees, the call to Nani and evening yoga.
🔔 Thirty minutes before the appointment: a reminder. No more “was that today?”

You hold the family together. We’ll hold the details.

Tag the person in your home who remembers everything. They deserve a break ❤️`,
    hashtags: ['#MyConfia', '#Parenting', '#WorkingParents', '#FamilyLife', '#MentalLoad'],
  },
  {
    id: 'v12-waitlist', when: 'Week 6 · Thu', kind: 'video', series: 'Join the waitlist',
    media: '../v2/out/12-waitlist.mp4', thumb: 'out/thumbnails/12-waitlist.jpg',
    hook: 'You’re not one person. You’re five. And now there’s one place for all of them.',
    body: `You’re not one person. You’re five.
And now there’s one place for all of them.

Six weeks, one idea. MyConfía in five lines:

🎙️ Just say it, whenever it comes to mind.
🗂️ It files it into the right space in your life.
🔔 It reminds you before it matters.
💬 Ask it anything you’ve told it.
🔒 Encrypted, never sold, never used to train AI.

On the web, on your phone, and inside Claude.

Early access opens soon, in small batches, so we can listen to every single person.

👉 Join the waitlist: link in the first comment.

Thank you for following along. Reply with the first thing you want MyConfía to remember for you.`,
    hashtags: ['#MyConfia', '#SecondBrain', '#Productivity', '#EarlyAccess', '#Waitlist'],
    comment: 'Join the MyConfía waitlist here 👉 [WAITLIST LINK]',
  },
];

// Company-page setup images (not posts).
export const pageAssets = [
  { file: 'out/page-assets/logo-400.png', use: 'Page logo (400×400)' },
  { file: 'out/page-assets/cover-1128x191.png', use: 'Page cover image (1128×191)' },
];

export const pageAbout = {
  tagline: 'You’re not one person. You’re five. One second brain for all of them.',
  about: `MyConfía is a second brain for people who are never just one thing.

Say what’s on your mind, as messy as it comes out. MyConfía files every piece into the right space in your life (Work, Family, Health, your side project), reminds you before it matters, and answers when you ask what you told it.

Spaces hold your to-dos, lists and notes. Use it on the web, on your phone, or inside Claude.

Your notes are encrypted at rest, never used to train AI, and never sold. No ads.`,
};
