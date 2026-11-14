import { useState } from 'react'
import { ChevronDown, Compass, Smile } from 'lucide-react'
import FeedbackMenu from '../components/FeedbackMenu'
import { useTour } from '../components/TourGate'
import { ListGroup, ListRow } from '../components/ListGroup'
import PageHeader from '../components/PageHeader'

// Settings > Help & FAQ. Short answers that say what actually happens in this app - when a feature changes,
// change its answer here (and in the README / docs/TEST_PACK.md) in the same commit.
const SECTIONS: { title: string; items: { q: string; a: string }[] }[] = [
  {
    title: 'Getting started',
    items: [
      {
        q: 'What can I type or say?',
        a: 'Anything you want to remember or do. “Call with Rohan - he’s unsure about pricing, send him the comparison by Friday 5pm” becomes a note with its key points and a to-do with a date. A single line like “buy milk” just becomes a to-do. You can type, or tap the mic and talk.',
      },
      {
        q: 'How do I ask about my notes?',
        a: 'On the Home tab, ask in your own words - “what did I note about pricing?”, “what’s overdue?”. The answer comes from your own notes and tasks, and a chip under it shows which note it used (tap it to open that note).',
      },
      {
        q: 'What are Home, Today and Spaces?',
        a: 'Home is where you log things and ask questions. Today is what needs you - overdue, due today, and anything marked high priority - plus Upcoming and Anytime (to-dos with no date). Spaces is everything you logged, grouped by area of your life (Work, Family, Health…), with its notes, to-dos and lists.',
      },
    ],
  },
  {
    title: 'Notes and tasks',
    items: [
      {
        q: 'It put my note in the wrong space. How do I change it?',
        a: 'Right under the reply, tap the pencil next to the space name and pick another - its to-dos move with it. You can also open a to-do and change its Category, or press and hold a to-do on Today and drag it onto a space chip. Before sending, the + button lets you choose the space yourself.',
      },
      {
        q: 'Can I take back a note I just logged?',
        a: 'Yes - tap Undo under the reply. It removes that note and the to-dos it created. Later, you can delete a note from Spaces → its page → Source notes, or delete a to-do from its sheet.',
      },
      {
        q: 'How do due dates, reminders and repeats work?',
        a: 'Say them naturally: “tomorrow at 5pm”, “every Monday”, “on the 20th”. To change one later, tap the to-do: you can edit the wording, date, time and repeat, set a priority (high, normal, low) and pick a reminder. Turn on notifications in Settings to get reminders on your phone.',
      },
      {
        q: 'Why is a to-do on the Today tab?',
        a: 'Today shows only three kinds: overdue, due today (or reminded today), and high priority. Anything dated tomorrow or later is under Upcoming; undated ones are under Anytime.',
      },
      {
        q: 'What is the box at the bottom of Today?',
        a: 'The same input as Home, but it only saves: whatever you type or say becomes to-dos and notes, and a card shows exactly what was filed (with Undo). It never answers questions - if you ask one, it points you to Home and keeps your text.',
      },
      {
        q: 'Can I create or delete a space by typing?',
        a: 'Yes, on the Home tab. “Create a workspace called IBM and add this task: send the deck tomorrow” makes the space and files the task in it. “Delete the space Work” asks you to confirm first; its notes, to-dos and lists move to Others rather than being deleted. You can also manage spaces from the sliders button on Today and Spaces.',
      },
      {
        q: 'What are lists?',
        a: 'Things you collect rather than do - books, movies, places. Say “add Dune to my reading list” and it lands in the right list. “Create a reading list in Personal” makes one.',
      },
    ],
  },
  {
    title: 'Voice',
    items: [
      {
        q: 'How does voice work?',
        a: 'Tap the mic, talk, tap the square to finish. The words appear in the box for you to read and fix before you send - nothing is saved until you press send. Use the pause button to stop for a moment, or the bin to throw the recording away. If your browser blocked the microphone, allow it from the lock icon by the address bar (on Android: Settings → Apps → MyConfía → Permissions).',
      },
    ],
  },
  {
    title: 'When something is off',
    items: [
      {
        q: 'It says “the AI has hit its usage limit”.',
        a: 'The app runs on shared free AI allowances, and sometimes they run out for a while. Nothing was saved or answered, and your text is back in the box - send it again in a little while.',
      },
      {
        q: 'Are the answers always right?',
        a: 'No. They’re written by an AI from your notes and can be incomplete or wrong. Check the source chip under an answer, and double-check anything important against the original note.',
      },
      {
        q: 'I’m offline.',
        a: 'You can still look at what you’ve loaded. Logging and asking need a connection - your text stays in the box until you’re back online.',
      },
      {
        q: 'How do I report a problem or give feedback?',
        a: 'Tap the flag under any reply to report that reply, or go to Settings → Help → “Report a problem”. To tell us how it’s going, use “Rate MyConfía” (or the little card that appears after you’ve logged a few notes). We read everything. Please don’t include private details from your notes - the app never attaches your note text unless you tick the box to include a reply.',
      },
      {
        q: 'My question got “That looks like a question”.',
        a: 'You asked it in the box on the Today tab, which only saves. Ask it on the Home tab instead.',
      },
    ],
  },
  {
    title: 'Privacy and your data',
    items: [
      {
        q: 'Who can read my notes?',
        a: 'Only you. Notes are encrypted before they are stored. To work out what a note means and to answer questions, the text is sent to AI providers - Groq and Cohere, and NVIDIA when Groq is busy - for that processing only. It is never used to train AI models, sold, or used for advertising.',
      },
      {
        q: 'What does app lock do?',
        a: 'It asks for a PIN (or your fingerprint or face, if you turn that on) when you open the app or come back after a short break. It is set per device and doesn’t change your account password.',
      },
      {
        q: 'Can I download or delete my data?',
        a: 'Yes, both from Settings: “Download my data” gives you every note, task and space as a file, and “Delete account” permanently removes your account and everything in it.',
      },
    ],
  },
]

function Question({ q, a }: { q: string; a: string }) {
  return (
    <details className="group border-b border-border last:border-b-0">
      <summary className="pressable flex cursor-pointer list-none items-center gap-3 px-4 py-3.5 text-[0.9375rem] font-medium [&::-webkit-details-marker]:hidden">
        <span className="min-w-0 flex-1">{q}</span>
        <ChevronDown size={18} strokeWidth={2} className="flex-shrink-0 text-text-faint transition-transform group-open:rotate-180" />
      </summary>
      <p className="px-4 pb-4 text-[0.9375rem] leading-relaxed" style={{ color: 'color-mix(in srgb, var(--sb-text) 88%, var(--sb-bg-card))' }}>{a}</p>
    </details>
  )
}

export default function HelpPage() {
  const { startTour } = useTour()
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  return (
    <div>
      <PageHeader backTo="/settings" backLabel="Settings" title="Help & FAQ" />

      <ListGroup>
        <ListRow icon={Compass} iconColor="var(--sb-text-muted)" soft label="Take the tour again" chevron onClick={() => startTour()} />
      </ListGroup>

      {SECTIONS.map((section) => (
        <section key={section.title} className="mb-6">
          <h2 className="mb-2 px-1 text-[0.8125rem] font-medium uppercase tracking-wide text-text-faint">{section.title}</h2>
          <div className="overflow-hidden rounded-2xl border border-border bg-bg-card">
            {section.items.map((item) => (
              <Question key={item.q} {...item} />
            ))}
          </div>
        </section>
      ))}

      <ListGroup title="Still stuck?" footer="Reports go straight to us - we read every one.">
        <ListRow icon={Smile} iconColor="var(--sb-text-muted)" soft label="Send feedback" detail="Rate the app or report a problem" chevron onClick={() => setFeedbackOpen(true)} />
      </ListGroup>
      {feedbackOpen && <FeedbackMenu onClose={() => setFeedbackOpen(false)} />}
    </div>
  )
}
