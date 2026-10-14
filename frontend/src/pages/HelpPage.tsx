import { Link } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import Disclosure from '../components/Disclosure'
import PageIntro from '../components/PageIntro'

// Help & FAQ - its own page at /help, reached from the "?" button in the
// top-right of every screen, the link at the bottom of the desktop
// sidebar, and a row in Settings. Not one of the main tabs: those are
// things people use daily, and these are "once in a while" questions.
//
// Grouped by what the person is trying to do, and each answer is short
// Markdown (bold key terms, bullets for steps/examples) so it can be
// skimmed instead of read as a paragraph. Keep the answers in step with
// the app's behaviour if it changes.
interface Faq {
  q: string
  a: string
}

const SECTIONS: { title: string; items: Faq[] }[] = [
  {
    title: 'Getting started',
    items: [
      {
        q: 'What can I type in the chat?',
        a: `Three kinds of things:

- **A note** about someone - *"Met Priya from Acme today, she's moving to Pune in March"*. It's saved and filed under the right person.
- **A task** - *"Send Arjun the proposal by Friday"*. It appears on **Today** with its due date.
- **A question** about what you've logged - *"When did I last talk to Priya?"*

Very short messages like *"hi"* or *"ok"* aren't logged - add a little detail and they will be.

You can type, or tap the **mic** and speak. When you stop, your words are finalized and the note **sends itself after 3 seconds** - tap **Edit** in that moment (or just start typing) to fix a misheard word first.`,
      },
      {
        q: 'Why did my recording say nothing was heard?',
        a: `The mic didn't pick up any speech, so **nothing was saved**.

- Tap the mic again and speak a little closer to the phone.
- If your browser blocked the microphone, allow it from the **lock icon** next to the address bar (on Android: *Settings → Apps → MyConfía → Permissions*).`,
      },
    ],
  },
  {
    title: 'Asking questions',
    items: [
      {
        q: 'How do I scan a business card?',
        a: `Tap the **camera** icon next to the chat box and take or choose a photo of the card.

- The name, role, company, phone and email are read from it, and you can **correct anything** before it's saved.
- If the name matches someone you already have, you'll be asked whether it's the same person.`,
      },
      {
        q: 'What if my connection drops while I\'m logging a note?',
        a: `You'll see an **"offline"** bar at the top as soon as the device loses its connection.

- A note that couldn't be sent goes **back into the box**, with a **Retry** button. A recording that couldn't be uploaded is **kept**, so you don't have to say it again.
- When you're back online the red message turns **green** - tap **Retry**.
- If the connection dropped *while* a note was being saved, it may already have gone through: **check Notes before retrying** so it isn't saved twice.`,
      },
      {
        q: 'Can I ask about a time period?',
        a: `Yes - use everyday phrases like **last week**, **this month**, **in July**, **last 30 days** or a **year**.

- Combine it with a name: *"What did I discuss with Aditi in July?"*
- Or count: *"How many people did I meet this month?"*`,
      },
      {
        q: 'How do I know where an answer came from?',
        a: `Under each answer, open the **sources** list to see the notes it was based on. If something looks off, check there first - an answer is only as good as the notes behind it.`,
      },
      {
        q: 'Are the answers always right?',
        a: `**No.** Answers are written by an AI from your notes and can be incomplete or wrong, so each one carries a reminder. Double-check anything important against the original note.`,
      },
      {
        q: 'How do I report a wrong or inappropriate answer?',
        a: `Tap **Report** under the answer, pick a reason (*incorrect, offensive, irrelevant, other*) and optionally add details. Reports are stored privately and used to improve the app.`,
      },
    ],
  },
  {
    title: 'Contacts, dates and companies',
    items: [
      {
        q: 'What does Search cover?',
        a: `**Contacts, notes and tasks.** Press **Ctrl/Cmd + K** or tap the magnifier at the top right. Search runs on your device over your own data, so you can type names, companies or any word from a note. Use the **arrow keys** to move through the results and **Enter** to open one.`,
      },
      {
        q: 'Does it remember birthdays and anniversaries?',
        a: `Yes. If a note mentions a yearly date - *"her birthday is 12 March"* - it's saved on that person's profile under **Important dates**, and shows on **Today** when it's coming up.

You can also add, edit or remove dates by hand on the profile.`,
      },
      {
        q: 'What is the Today page?',
        a: `A daily summary of:

- your open and overdue **tasks**
- **people to follow up with**
- upcoming **birthdays and anniversaries**

You can also have it **emailed each morning** from the Notifications setting.`,
      },
      {
        q: 'What is Keep in touch?',
        a: `A reminder system for the people you don't want to lose touch with.

- On a contact's profile, or on **Contacts → Keep in touch**, choose how often you want to catch up: *weekly, monthly, every 3 months…*
- They're grouped by that schedule, each showing **when you last talked** and whether a catch-up is **due** or **overdue**.
- **Snooze** pushes a catch-up back a week, and **Log a catch-up** opens the chat to record it. Any new note about them restarts the clock.
- Anyone due shows on **Today**, and in your morning brief.`,
      },
      {
        q: 'How do I fix a mistake in a saved note or contact?',
        a: `- **A note:** open it (on the **Notes** tab, or in the contact's timeline) and tap **Edit** to change the summary, date, location or category - or **Delete**.
- **A contact:** open their profile and tap **Edit info**.
- **A follow-up:** tick it off on **Today** or on the contact's profile.`,
      },
      {
        q: 'What if I have the same person twice?',
        a: `Open one of them, expand **Merge or delete this contact**, and choose who to merge them into. All their notes and follow-ups move across. This **can't be undone**.`,
      },
      {
        q: 'What are categories (initiatives)?',
        a: `Notes are sorted automatically into categories such as **Personal**, **Job** and **Fitness**.

- Add your own on the **Notes** tab → **Initiatives**. Just type a name: each new category gets a **colour and icon automatically**, different from your others.
- Want something different? Tap a category to **rename it or change its colour and icon**.`,
      },
      {
        q: 'What does the company view show?',
        a: `On the **Contacts** page, pick a company to open its own page:

- everyone you know there, and how many conversations you've had with each
- your most recent notes involving them
- a **company briefing** - an AI-written summary, on request`,
      },
    ],
  },
  {
    title: 'Privacy and your account',
    items: [
      {
        q: 'Who can read my notes?',
        a: `**Only you.** Notes, contacts and tasks are encrypted before they're stored.

To answer your questions, the relevant text is sent to AI providers (Groq and Cohere) for processing. It isn't used by this app for anything else.`,
      },
      {
        q: 'What does App lock do?',
        a: `It asks for a **PIN** when you open the app or return after a short break.

- The PIN belongs to your **account**, so it's the **same on every device and browser** you sign in on. Set it once in **Settings → App lock**.
- **Fingerprint / face** unlock is the one thing you switch on **per device**, because it uses that device's own sensor. Your PIN always works as a backup.
- After several wrong PINs it makes you wait before trying again, and that wait can't be skipped by clearing the browser.
- It doesn't change your account password.`,
      },
      {
        q: 'Can I get deleted notes back?',
        a: `**No** - deleting is permanent, so you're asked to confirm first. Deleting your whole account from **Settings** removes all of your data.`,
      },
    ],
  },
]

export default function HelpPage() {
  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold tracking-tight">Help &amp; FAQ</h1>
      <PageIntro>Quick answers about logging notes, asking questions, privacy and your account.</PageIntro>

      <div className="flex flex-col gap-7">
        {SECTIONS.map((section) => (
          <section key={section.title}>
            <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-accent">{section.title}</h2>
            <div className="flex flex-col gap-2">
              {section.items.map((item) => (
                <Disclosure key={item.q} summary={<span className="font-medium text-text">{item.q}</span>}>
                  <div className="prose-chat border-l-2 border-accent/60 pl-3 text-sm leading-relaxed text-text-muted [&_em]:text-text [&_strong]:!text-accent">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{item.a}</ReactMarkdown>
                  </div>
                </Disclosure>
              ))}
            </div>
          </section>
        ))}
      </div>

      <p className="mt-8 text-xs text-text-faint">
        More: the{' '}
        <Link to="/privacy" className="text-accent underline">
          Privacy Policy
        </Link>{' '}
        and the{' '}
        <Link to="/account-deletion" className="text-accent underline">
          account deletion info
        </Link>
        .
      </p>
    </div>
  )
}
