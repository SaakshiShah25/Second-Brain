// LinkedIn campaign copy, one entry per post. The hub (index.html) and posts.md are both built from this file.
// [WAITLIST LINK] is a placeholder: put the real link in the first comment (LinkedIn shows posts with links less).

export const schedule = {
  cadence: '3 posts a week (Tue · Wed · Thu), 8:30-10:00 AM IST, over 4 weeks',
  start: 'Week 1',
};

export const posts = [
  {
    id: '01-intro', week: 'Week 1 · Tue', series: 'Introducing MyConfía',
    headline: 'You wrote it down. You just can’t remember where.',
    body: `You wrote it down. You just can’t remember where.

Notes app. WhatsApp to yourself. An email draft. The back of a receipt.

We all have a system. The system is “everywhere”.

Here’s a normal Tuesday:
→ Tomorrow at 9 you’re meeting the CEO. The deck isn’t ready.
→ You promised your kid a toy last week.
→ You need 1 kg of vegetables on the way home.
→ It’s Diwali and you haven’t called the family.
→ And you still want to fit in a workout.

None of this is hard. Holding all of it in your head at the same time is.

That’s why we’re building MyConfía.

Tell it what’s on your mind, typed or spoken, as messy as you like. It works out which part of your life each thing belongs to, puts it in the right space (Work, Family, Home, Health, whatever your life has) and reminds you before it matters.

Each space holds your to-dos, lists and notes. Later, ask it “what did I promise the design team?” and it answers from what you told it.

It isn’t another to-do app. It’s a second brain that remembers everything, so you don’t have to.

On the web, on your phone, and inside Claude.

Early access opens soon. The waitlist link is in the comments 👇

What’s the strangest place you’ve ever “saved” an important note?`,
    hashtags: ['#Productivity', '#SecondBrain', '#BuildInPublic'],
    comment: 'Join the MyConfía waitlist here: [WAITLIST LINK]',
  },
  {
    id: '02-everywhere', week: 'Week 1 · Wed', series: 'Where it lives',
    headline: 'The best place to capture a thought is whatever is already in your hand.',
    body: `The best place to capture a thought is whatever is already in your hand.

Sometimes that’s your phone. Sometimes it’s your laptop. More and more, it’s an AI chat window.

So MyConfía isn’t stuck on one device:

📱 On your phone: hold the mic, say it, done.
💻 On the web: your whole life on one big screen.
🔌 Inside Claude: ask your AI assistant to add a to-do or tell you what’s on today. It reads and writes to your MyConfía.

Capture it in one place and it’s in all three. Same spaces, same reminders, same memory.

Over the next three posts I’ll show you each one properly.

Quick poll in the comments: where do you capture most of your thoughts? Phone, laptop, or AI chat?`,
    hashtags: ['#Productivity', '#AI', '#BuildInPublic'],
    comment: 'Want early access? Join the MyConfía waitlist: [WAITLIST LINK]',
  },
  {
    id: '03-web', week: 'Week 1 · Thu', series: 'Where it lives · Web',
    headline: 'No forms. No dropdowns. No date pickers. Just type it the way you’d say it.',
    body: `No forms. No dropdowns. No date pickers. Just type it the way you’d say it.

This is MyConfía on the web.

On the left, your spaces: Work, Family, Home, Health, the side project. In the middle, Today.

Type:
“Investor update draft by Friday, remind me Thursday evening”

You get a to-do in Work, due Friday, with a reminder on Thursday evening. You didn’t pick a single field.

Then ask it something:
“What did I promise the design team?”

It answers from your own notes and shows where each part came from, so you can check.

Where the web app shines:
→ Monday planning
→ End-of-day reviews
→ Finding the thing someone told you three weeks ago

It runs in any modern browser. Nothing to install.

Waitlist link in the comments 👇`,
    hashtags: ['#Productivity', '#SecondBrain', '#WebApp'],
    comment: 'Try MyConfía on the web when early access opens. Join the waitlist: [WAITLIST LINK]',
  },
  {
    id: '04-mobile', week: 'Week 2 · Tue', series: 'Where it lives · Mobile',
    headline: 'Your best ideas show up at the worst times.',
    body: `Your best ideas show up at the worst times.

Walking. Driving. Two minutes before a meeting. Halfway through dinner.

That’s why MyConfía on your phone takes about five seconds:

1. Hold the mic.
2. Say: “Pick up medicines, book the dentist for Saturday, and call Riya after lunch.”
3. Let go.

That’s three to-dos, each in the right space, each with its date. A reminder arrives before it’s due, not after you’ve missed it.

No typing, no sorting, no “I’ll write it down later”. Later never comes.

Get it:
→ Android: the MyConfía app on Google Play
→ iPhone: open MyConfía in Safari, tap Share, then “Add to Home Screen”. It installs like an app.

Join the waitlist via the link in the comments 👇`,
    hashtags: ['#Productivity', '#VoiceNotes', '#MobileApp'],
    comment: 'MyConfía waitlist (Android + iPhone): [WAITLIST LINK]',
  },
  {
    id: '05-claude', week: 'Week 2 · Wed', series: 'Where it lives · Claude (MCP)',
    headline: 'I asked Claude what was on my plate today. It actually knew.',
    body: `I asked Claude what was on my plate today. It actually knew.

That’s because MyConfía plugs into Claude through MCP, the Model Context Protocol, an open standard for connecting AI apps to your tools.

Once connected, you can say things like:
→ “Add ‘send proposal to Acme’ for Friday and remind me a day before.”
→ “What’s on today?”
→ “What did I note from my call with Arjun?”
→ “Save this meeting summary to my Work space.”

Claude doesn’t just reply in text. It shows your Today list, a to-do with its due date and reminder, or a space, as interactive cards right in the chat.

Setup takes about a minute:
1. In Claude, go to Settings → Connectors → Add custom connector.
2. Paste your MyConfía link (you’ll find it in MyConfía → Settings).
3. Sign in and press Allow.

No new password. Deleting anything always needs your confirmation. You can disconnect Claude from Settings at any time.

Your AI is great at thinking. Now it remembers too.

Waitlist in the comments 👇`,
    hashtags: ['#AI', '#Claude', '#MCP'],
    comment: 'Get early access to MyConfía + the Claude connector: [WAITLIST LINK]',
  },
  {
    id: '06-secure', week: 'Week 2 · Thu', series: 'Your data is safe',
    headline: 'We’re asking you to tell an app everything. Here’s exactly how we protect it.',
    body: `We’re asking you to tell an app everything. Here’s exactly how we protect it.

A second brain only works if you trust it with the real stuff: health, money, family, work. So, in plain words:

🔒 Your notes and to-do descriptions are encrypted with AES before they’re stored.
🗝️ The encryption key is kept outside the database. Anyone who gets into the database sees gibberish, not your notes.
🧠 Your data is never used to train AI models.
🚫 Never sold. No ads. That isn’t our business model, now or later.
🔌 Connected Claude? Disconnect it from Settings and its access ends straight away.

And because honesty matters more than buzzwords: MyConfía is not end-to-end encrypted. To sort your notes, set reminders and answer your questions, the app has to read them, and that processing runs through our AI providers under the same rule: never used for training.

We’d rather tell you that up front than bury it in the fine print.

Questions about privacy? Ask in the comments and I’ll answer every one.`,
    hashtags: ['#Privacy', '#DataSecurity', '#Productivity'],
    comment: 'Join the MyConfía waitlist: [WAITLIST LINK]',
  },
  {
    id: '07-busy-life', week: 'Week 3 · Tue', series: 'Productivity in a busy life',
    headline: 'You’re not one person. You’re five.',
    body: `You’re not one person. You’re five.

The employee with a CEO deck due at 9.
The side-hustler shipping a landing page at midnight.
The parent who promised a toy.
The gym-goer who swore “this week, for sure”.
The son or daughter who needs to call home for Diwali.

Each of them has a to-do list. Most productivity apps act as if you only have one.

Being productive isn’t about doing more. It’s about not dropping things.

Here’s a day with MyConfía:
7:00 → workout before work
8:30 → CEO deck, final read-through
1:00 → order the toy
6:30 → 1 kg vegetables on the way home
8:00 → call the family
10:30 → one more hour on the side project

You didn’t schedule any of it. You said each thing when it came to mind. MyConfía sorted it into the right space and reminded you at the right time.

That’s the whole idea: you capture it, it remembers, it reminds you.

Which of your five people drops the ball most often? 😅`,
    hashtags: ['#Productivity', '#WorkLifeBalance', '#SecondBrain'],
    comment: 'If this sounds like your week, join the MyConfía waitlist: [WAITLIST LINK]',
  },
  {
    id: '08-student', week: 'Week 3 · Wed', series: 'Persona · University students',
    headline: 'University is a full-time job with no manager.',
    body: `University is a full-time job with no manager.

Assignments. Recommendation letters. Internship applications. Hackathons. Mess fees. And your mom’s birthday, which you will not forget this year.

Here’s how students use MyConfía:

🎙️ Walking out of a lecture, say:
“DBMS assignment due Friday, ask Prof. Rao for a recommendation, and remind me about Mom’s birthday on Sunday.”

🗂️ It goes into your spaces: University, Internships, Hackathon, Family. Each to-do gets its date.

🔔 You get a reminder the day before the deadline, and one before office hours, while there’s still time to act.

💬 Before exam week, ask: “What do I still have due this week?”

Fewer “I totally forgot” moments. More time to actually enjoy university.

Students, we want you in early access. Waitlist in the comments, and tag the friend who runs entirely on last-minute panic 👇`,
    hashtags: ['#Students', '#StudentLife', '#Productivity'],
    comment: 'Students: join the MyConfía waitlist here: [WAITLIST LINK]',
  },
  {
    id: '09-founder', week: 'Week 3 · Thu', series: 'Persona · Founders & business owners',
    headline: 'Founders don’t drop balls because they’re disorganised. They drop them because there are 200 balls.',
    body: `Founders don’t drop balls because they’re disorganised. They drop them because there are 200 balls.

The investor update. The pricing follow-up you promised a customer. A hiring interview at 3. The tax filing due on the 20th. Feedback from yesterday’s demo. And the anniversary dinner you still haven’t booked.

Here’s how founders use MyConfía:

🎙️ Straight after a call, dictate what happened. MyConfía pulls out the decisions and follow-ups, with dates.

🗂️ Spaces keep it apart without splitting it up: Fundraise, Customers, Team, Family. One place, clear lanes.

🔔 “Follow up with Acme on pricing” turns up at 11, before the noon deadline you gave them.

💬 A week later: “What did Acme say about pricing?” You get the answer, with the note it came from.

🔌 Living in Claude all day? Connect MyConfía and ask it right there.

Run the company. Let MyConfía hold the details.

Waitlist in the comments 👇 Founders, I’d love to hear what you’d want it to remember first.`,
    hashtags: ['#Founders', '#Startups', '#Productivity'],
    comment: 'Founders and business owners: join the MyConfía waitlist: [WAITLIST LINK]',
  },
  {
    id: '10-professional', week: 'Week 4 · Tue', series: 'Persona · 9-to-5 + side hustle',
    headline: '9 to 5 at the job. 6 to midnight on the dream.',
    body: `9 to 5 at the job. 6 to midnight on the dream.

If you have a side hustle, you know the feeling: two careers, one brain, no headspace.

The Q3 report. Prep for a 1:1. The video you need to edit tonight. Two client orders to ship. An SIP renewal before the 5th. The gym, three times this week, apparently.

Here’s how MyConfía keeps both lives running:

🗂️ Separate spaces for Work, Side hustle, Money and Health, so your day job and your dream don’t blur together, yet you can still see everything in one place.

🎙️ Say “Q3 report due Thursday, edit the new video tonight, renew my SIP before the 5th” and each one lands in the right space with the right date.

🔔 At 9 PM: “Edit the new video. Your evening block starts now.”

💬 And the one question that saves your weekend: “What’s due this week?”

Two careers. One memory.

Waitlist in the comments 👇`,
    hashtags: ['#SideHustle', '#Productivity', '#CareerGrowth'],
    comment: 'Running a side hustle? Join the MyConfía waitlist: [WAITLIST LINK]',
  },
  {
    id: '11-parent', week: 'Week 4 · Wed', series: 'Persona · Parents & home runners',
    headline: 'Every home has an invisible to-do list. It usually lives in one person’s head.',
    body: `Every home has an invisible to-do list. It usually lives in one person’s head.

The volcano project due Monday. The pediatrician on Tuesday. Milk and 1 kg of vegetables. The Diwali gift list. The plumber. And yoga at 7, if there’s any time left for you.

Here’s how MyConfía carries that list:

🎙️ Say it while you’re packing lunch: “Aarav’s volcano project due Monday, pediatrician Tuesday at 5, add milk and vegetables to groceries.”

🗂️ It goes into Kids, Home, Family, and yes, a space that’s just for you.

📝 Lists for the things that are lists: groceries, gifts, the packing list for the trip home.

🔔 30 minutes before the appointment: “Pediatrician at 5:00 PM. Carry the vaccination card.”

You hold the family together. We’ll hold the details.

Tag the person in your home who remembers everything. They deserve a break ❤️

Waitlist in the comments 👇`,
    hashtags: ['#Parenting', '#FamilyLife', '#Productivity'],
    comment: 'Join the MyConfía waitlist: [WAITLIST LINK]',
  },
  {
    id: '12-waitlist', week: 'Week 4 · Thu', series: 'Join the waitlist',
    headline: 'Stop trying to remember everything.',
    body: `Stop trying to remember everything.

Over the last four weeks I’ve shown you what we’re building. Here it is in five lines:

🎙️ Speak it or type it, whenever it comes to mind.
🗂️ It sorts it into the right space in your life.
🔔 It reminds you before it matters.
💬 Ask it anything you’ve told it.
🔒 Encrypted, never sold, never used to train AI.

On the web, on your phone, and inside Claude.

Early access opens soon. We’re letting people in in small batches so we can actually listen to every one of them.

👉 The waitlist link is in the first comment.

If you’ve followed this series, thank you. Reply with the first thing you’d want MyConfía to remember for you, and I’ll read every reply.`,
    hashtags: ['#Productivity', '#SecondBrain', '#EarlyAccess'],
    comment: 'Here’s the MyConfía waitlist. See you inside: [WAITLIST LINK]',
  },
];
