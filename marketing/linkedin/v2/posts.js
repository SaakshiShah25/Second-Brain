// v2 LinkedIn copy. Built around the campaign line "You're not one person. You're five."
// Only the last post asks people to join the waitlist; every other post just tells the story.

export const motto = 'You’re not one person. You’re five.';

export const schedule = {
  cadence: '3 posts a week (Tue · Wed · Thu), 8:30-10:00 AM IST, over 4 weeks',
};

export const posts = [
  {
    id: '01-intro', week: 'Week 1 · Tue', series: 'You’re not one person',
    headline: 'You’re not one person. You’re five.',
    body: `You’re not one person. You’re five.

The employee with a CEO deck due at 9.
The side-hustler shipping a landing page at midnight.
The parent who promised a toy last week.
The gym-goer who swore “this week, for sure”.
The son or daughter who still hasn’t called home.

Each of them has a to-do list. And all five share one head.

So we write things down. In a notes app, a WhatsApp to ourselves, an email draft, the back of a receipt. Then we forget where.

That’s why we’re building MyConfía.

Just say what’s on your mind, as messy as it comes out:
🎙️ “CEO meeting tomorrow 9am, prep the deck tonight. Buy a toy for Aarav, call Mom at 7, 1 kg veggies, gym at 6.”

It works out which part of your life each thing belongs to and files it in that space: Work, Family, Home, Health, whatever your life has. Dates and reminders included. Each space keeps its to-dos, lists and notes, and you can ask it later what you told it.

Not another to-do app. A second brain that remembers everything, for all five of you.

On the web, on your phone, and inside Claude.

Which of your five drops the ball most often?`,
    hashtags: ['#Productivity', '#SecondBrain', '#BuildInPublic'],
  },
  {
    id: '02-everywhere', week: 'Week 1 · Wed', series: 'Three ways to tell it',
    headline: 'Five lives. Three ways to tell MyConfía about them.',
    body: `Five lives. Three ways to tell MyConfía about them.

The thought arrives wherever you are, so MyConfía is wherever you are:

📱 On your phone: tap the mic and just say it.
💻 On the web: tap the mic at your desk, and see your whole life on one screen.
🔌 Inside Claude: ask your AI what’s on today, or have it add a to-do for you.

Say it on one and it’s on all three. Same spaces, same reminders, same memory.

The video shows the real app, the same screens you’ll use, in light mode and dark.

Over the next three posts I’ll walk through each one.

Where do your thoughts usually show up: phone, laptop, or AI chat?`,
    hashtags: ['#Productivity', '#AI', '#BuildInPublic'],
  },
  {
    id: '03-web', week: 'Week 1 · Thu', series: 'On the web',
    headline: 'No forms. No dropdowns. No typing. Just say it.',
    body: `No forms. No dropdowns. No typing. Just say it.

This is MyConfía on the web, the real screen.

On the left, your spaces. In the middle, Today: what’s overdue, what’s due, what’s high priority.

Tap the mic at the bottom and say:
🎙️ “Investor update draft by Friday, remind me Thursday evening”

It becomes a to-do in Work, due Friday, with a reminder on Thursday evening. You didn’t touch a single field. (Typing works too, if you prefer.)

Then ask, out loud:
🎙️ “What did I promise the design team?”

It answers from your own notes and shows which note it used, so you can check.

The web app is where the employee plans the week, the side-hustler reviews the night’s work, and the parent finds that one thing the school said three weeks ago. Five lives, one screen.

It runs in any modern browser, light or dark. Nothing to install.`,
    hashtags: ['#Productivity', '#SecondBrain', '#WebApp'],
  },
  {
    id: '04-mobile', week: 'Week 2 · Tue', series: 'On your phone',
    headline: 'Your best ideas show up at the worst times.',
    body: `Your best ideas show up at the worst times.

Walking. Driving. Two minutes before a meeting. Halfway through dinner.

So on your phone, MyConfía takes about five seconds:

1. Tap the mic.
2. Say: “Pick up medicines, book the dentist for Saturday, and call Riya after lunch.”
3. Send.

You watch your words appear as you speak. Then MyConfía files them: two to-dos in Health, one in Family, each with its date. A reminder arrives before it’s due, not after you’ve missed it.

No typing. No sorting. No “I’ll write it down later”.

Get it:
→ Android: the MyConfía app on Google Play
→ iPhone: open MyConfía in Safari, tap Share, then “Add to Home Screen”

You’re five people on the move. Your second brain should be in your pocket.`,
    hashtags: ['#Productivity', '#VoiceNotes', '#MobileApp'],
  },
  {
    id: '05-claude', week: 'Week 2 · Wed', series: 'Inside Claude (MCP)',
    headline: 'I asked Claude what was on my plate today. It actually knew.',
    body: `I asked Claude what was on my plate today. It actually knew.

MyConfía plugs into Claude through MCP, the Model Context Protocol, an open standard for connecting AI apps to your tools.

Once it’s connected, you can say:
→ “Add ‘send proposal to Acme’ for Friday and remind me a day before.”
→ “What’s on today?”
→ “What did I note from my call with Arjun?”
→ “Save this meeting summary to my Work space.”

And Claude doesn’t just answer in text. It shows MyConfía’s own Today view right in the chat, the one you see in the video, and you can tick things off there.

Setup takes about a minute:
1. In Claude: Settings → Connectors → Add custom connector.
2. Paste your MyConfía address (MyConfía → Settings → Use MyConfía in Claude).
3. Sign in and press Allow.

No new password. Deleting anything always needs your confirmation. Disconnect from Settings at any time.

Your AI is great at thinking. Now it remembers for all five of you.`,
    hashtags: ['#AI', '#Claude', '#MCP'],
  },
  {
    id: '06-secure', week: 'Week 2 · Thu', series: 'Your data is safe',
    headline: 'We’re asking you to tell an app about all five of your lives. Here’s exactly how we protect them.',
    body: `We’re asking you to tell an app about all five of your lives. Here’s exactly how we protect them.

A second brain only works if you trust it with the real stuff: health, money, family, work. So, in plain words:

🔒 Your notes and to-do descriptions are encrypted with AES before they’re stored.
🗝️ The encryption key is kept outside the database. Anyone who gets into the database sees gibberish, not your notes.
🧠 Your data is never used to train AI models.
🚫 Never sold. No ads. That isn’t our business model, now or later.
🔌 Connected Claude? Disconnect it from Settings and its access ends straight away.

And because honesty matters more than buzzwords: MyConfía is not end-to-end encrypted. To sort your notes, set reminders and answer your questions, the app has to read them, and that processing runs through our AI providers under the same rule: never used for training.

We’d rather say that up front than bury it in the fine print.

Questions about privacy? Ask in the comments and I’ll answer every one.`,
    hashtags: ['#Privacy', '#DataSecurity', '#Productivity'],
  },
  {
    id: '07-five', week: 'Week 3 · Tue', series: 'The idea behind MyConfía',
    headline: 'Most productivity apps assume you’re one person. You’re not.',
    body: `Most productivity apps assume you’re one person. You’re not.

You’re the employee, the side-hustler, the parent, the gym-goer and the one who runs the house. Five people, five to-do lists, one head.

That one idea is the whole design of MyConfía:

🗂️ Each of your five gets its own space. Work doesn’t drown out Family. The side project doesn’t vanish under the day job.

🎙️ You don’t have to sort or even type anything. Say it however it comes out and MyConfía files each piece in the right space.

🔔 Each of the five gets reminded at the right moment:
7:00 → workout before work
8:30 → CEO deck, final read-through
1:00 → order the toy
6:30 → vegetables on the way home
7:00 → call Mom
10:30 → one more hour on the landing page

📋 And when you want the full picture, all five sit together in Today.

Being productive isn’t doing more. It’s not dropping things, for any of the people you are.

Who are your five?`,
    hashtags: ['#Productivity', '#WorkLifeBalance', '#SecondBrain'],
  },
  {
    id: '08-student', week: 'Week 3 · Wed', series: 'For university students',
    headline: 'A student isn’t one person either.',
    body: `A student isn’t one person either.

You’re a student. You’re also the intern-to-be, the hackathon teammate, the runner, the son or daughter, and somebody’s friend. Every one of them has deadlines.

Here’s what that looks like in MyConfía (the screens in the video are the real app):

🎙️ Walking out of a lecture, say:
“Ask Professor Rao for a recommendation letter this week, and remind me about Mom’s birthday on Sunday.”

🗂️ The letter lands in University, the birthday in Family, each with its date.

📋 Today shows the overdue mess fees, tonight’s hackathon call, the run at 6:30 and the assignment that’s due Friday.

🔔 A reminder shows up while there’s still time to act, not after the deadline.

Fewer “I totally forgot” moments. More time to actually enjoy university.

Tag the friend who runs entirely on last-minute panic 👇`,
    hashtags: ['#Students', '#StudentLife', '#Productivity'],
  },
  {
    id: '09-founder', week: 'Week 3 · Thu', series: 'For founders',
    headline: 'Founders don’t drop balls because they’re disorganised. They drop them because they’re five people.',
    body: `Founders don’t drop balls because they’re disorganised. They drop them because they’re five people.

You’re the founder. You’re also the seller chasing a pricing decision, the recruiter with an interview at 3, the fundraiser owing an investor update, the partner with an anniversary coming up, and the parent with a parent-teacher meeting on Wednesday.

Here’s how that runs in MyConfía (real screens in the video):

🎙️ After a call, say:
“Follow up with Acme on pricing tomorrow at 11, and book our anniversary dinner for Saturday.”

🗂️ Acme goes to Customers, the dinner goes to Family. Both dated, both reminded.

🧠 Notes from calls keep their decisions and concerns. Ask later, “What did Arjun’s team say about SSO?”, and you get the answer with the note it came from.

🔌 Living in Claude all day? Connect MyConfía and ask it right there.

Run the company. Let MyConfía hold the details.

Founders: what would you want it to remember first?`,
    hashtags: ['#Founders', '#Startups', '#Productivity'],
  },
  {
    id: '10-professional', week: 'Week 4 · Tue', series: 'For the 9-to-5 + side hustle',
    headline: '9 to 5 at the job. 6 to midnight on the dream.',
    body: `9 to 5 at the job. 6 to midnight on the dream.

If you have a side hustle, you’re at least five people. You’re the employee. You’re also the creator, the investor, the gym-goer and the brother or sister. Two careers and a life, in one head.

In MyConfía (real screens in the video):

🎙️ Say it in one breath:
“Q3 report due Thursday, edit the new video tonight at 9, and renew my SIP before the 5th.”

🗂️ The report lands in Day job, the video in Side hustle, the SIP in Money. Three lives, kept apart and still in one place.

📋 Today shows what matters now across all of them.

🔔 At 9 PM: “Edit the new video.” Your evening block starts on time.

Two careers. One memory.`,
    hashtags: ['#SideHustle', '#Productivity', '#CareerGrowth'],
  },
  {
    id: '11-parent', week: 'Week 4 · Wed', series: 'For parents',
    headline: 'Every home has an invisible to-do list. It usually lives in one person’s head.',
    body: `Every home has an invisible to-do list. It usually lives in one person’s head.

That person is the parent. They’re also the chef, the homework helper, the daughter who calls Nani, the professional with a job of their own, and, somewhere in there, themselves.

In MyConfía (real screens in the video):

🎙️ Say it while packing lunch:
“Pediatrician Tuesday at 5, carry the vaccination card, and add milk and vegetables to groceries.”

🗂️ The appointment goes to Kids with its date. Milk and vegetables go straight onto the Groceries list.

📋 Today shows the volcano project due tomorrow, the school fees, the call to Nani and yoga in the evening.

🔔 Thirty minutes before the appointment, a reminder. No more “was that today?”

You hold the family together. We’ll hold the details.

Tag the person in your home who remembers everything. They deserve a break ❤️`,
    hashtags: ['#Parenting', '#FamilyLife', '#Productivity'],
  },
  {
    id: '12-waitlist', week: 'Week 4 · Thu', series: 'Join the waitlist',
    headline: 'You’re not one person. You’re five. And now there’s one place for all of them.',
    body: `You’re not one person. You’re five. And now there’s one place for all of them.

Over the last four weeks I’ve shown you MyConfía. In five lines:

🎙️ Just say it, whenever it comes to mind.
🗂️ It sorts it into the right space in your life.
🔔 It reminds you before it matters.
💬 Ask it anything you’ve told it.
🔒 Encrypted, never sold, never used to train AI.

On the web, on your phone, and inside Claude.

Early access opens soon. We’re letting people in in small batches so we can listen to every one of them.

👉 Join the waitlist: the link is in the first comment.

If you’ve followed along, thank you. Reply with the first thing you’d want MyConfía to remember for you.`,
    hashtags: ['#Productivity', '#SecondBrain', '#EarlyAccess'],
    comment: 'Join the MyConfía waitlist here: [WAITLIST LINK]',
  },
];
