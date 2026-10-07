import { HelpCircle } from 'lucide-react'
import Card from './Card'
import Disclosure from './Disclosure'

// Settings > Help & FAQ. A section inside Settings rather than its own
// nav tab: the five tabs are all things people use daily, and the
// questions here are "once in a while" ones. Answers are short and say
// what actually happens in this app - keep them in step with the
// behaviour if it changes.
const FAQ: { q: string; a: string }[] = [
  {
    q: 'What can I type in the chat?',
    a: 'Two kinds of things. Notes - "Met Priya from Acme today, she\'s moving to Pune in March" - get saved and filed under the right person. Questions - "When did I last talk to Priya?" or "Who did I meet in July?" - get answered from your saved notes. Reminders like "remind me to call Dad on Friday" become tasks.',
  },
  {
    q: 'Can I ask about a time period?',
    a: 'Yes. Try "last week", "this month", "in July", "last 30 days" or a year. You can combine it with a name ("What did I discuss with Aditi in July?") or ask for counts ("How many people did I meet this month?").',
  },
  {
    q: 'How do I know where an answer came from?',
    a: 'Under an answer, tap the sources list to see the notes it was based on. If something looks off, check there first - the answer can only be as good as the notes behind it.',
  },
  {
    q: 'Are the answers always right?',
    a: 'No. Answers are written by an AI from your notes and can be incomplete or wrong, so every one carries a reminder. Please double-check anything important against the original note.',
  },
  {
    q: 'How do I report a wrong or inappropriate answer?',
    a: 'Use the Report button under the answer, pick a reason and optionally add details. Reports are stored privately and used to improve the app.',
  },
  {
    q: 'Why did my recording say nothing was heard?',
    a: 'The mic didn\'t pick up any speech, so nothing was saved. Tap the mic again and speak a little closer to the phone. If your browser blocked the microphone, allow it from the lock icon next to the address bar (or Settings → Apps → MyConfía → Permissions on Android).',
  },
  {
    q: 'What does Search cover?',
    a: 'People, notes and tasks. Press Ctrl/Cmd + K or tap the magnifier at the top right. Search runs on your device over your own decrypted data, so it works the way you type it - names, companies, or words from a note.',
  },
  {
    q: 'Does it remember birthdays and anniversaries?',
    a: 'Yes. If a note mentions a recurring date ("her birthday is 12 March", "our anniversary is next Tuesday"), it\'s saved on that person\'s profile under Important dates and shows up under Today when it\'s coming up. You can edit or remove them on the profile.',
  },
  {
    q: 'What is the Today page?',
    a: 'A short daily summary of your open tasks, people to follow up with, and upcoming dates. You can also have it emailed each morning from the Notifications setting.',
  },
  {
    q: 'What does the company view show?',
    a: 'On the People page, each company lists the people you know there, how many conversations you\'ve had with each, and your most recent notes. "Get AI briefing" adds a written summary on top.',
  },
  {
    q: 'Who can read my notes?',
    a: 'Only you. Notes, contacts and tasks are encrypted before they are stored. To answer questions, the relevant text is sent to AI providers (Groq and Cohere) for processing and is not used by this app for anything else.',
  },
  {
    q: 'What does App lock do?',
    a: 'It asks for a PIN - or your fingerprint / face, if your device supports it and you turn it on - when you open the app or return after a short break. It is set per device and doesn\'t change your account password.',
  },
  {
    q: 'Can I get deleted notes back?',
    a: 'No - deleting is permanent, so you\'ll be asked to confirm first. Deleting your whole account from Settings removes all your data.',
  },
]

export default function HelpFaq() {
  return (
    <Card className="mb-4">
      <div className="mb-3 flex items-center gap-2">
        <HelpCircle size={15} strokeWidth={1.6} className="text-accent" />
        <h2 className="text-sm font-semibold tracking-tight text-text-muted">Help &amp; FAQ</h2>
      </div>
      <div className="flex flex-col gap-2">
        {FAQ.map((item) => (
          <Disclosure key={item.q} summary={<span className="font-medium text-text">{item.q}</span>}>
            <p className="text-sm leading-relaxed text-text-muted">{item.a}</p>
          </Disclosure>
        ))}
      </div>
    </Card>
  )
}
