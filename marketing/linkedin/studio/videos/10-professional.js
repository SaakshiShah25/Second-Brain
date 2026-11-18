// 10 · Persona: working professionals with a side hustle
import { persona } from '../persona.js';
import { C } from '../components.js';

export default persona({
  emoji: '💼', color: C.blue, blobs: [C.blue, C.amber, C.red, C.teal], seed: 12,
  title: 'The 9-to-5 *+ side hustle*',
  sub: 'Nine to five at the job.<br>Six to midnight on the dream.',
  messLine: 'Two careers. *Zero headspace.*',
  mess: ['📊 Q3 report for my manager', '🗣️ 1:1 prep with Neha', '🎬 Edit the new video', '📦 Ship 2 client orders', '💰 Renew SIP by the 5th', '🏋️ Gym 3× this week'],
  said: 'Q3 report due Thursday, edit the new video tonight, and renew my SIP before the 5th.',
  spacesLine: 'Each life *in its own space.*',
  spaces: [
    { space: 'work', rows: [['Q3 report', 'Thu · 🔔 Wed 5 PM'], ['1:1 prep with Neha', 'Note · 4 points']] },
    { space: { name: 'Side hustle', emoji: '🎬', color: C.red }, rows: [['Edit the new video', 'Tonight · 9 PM'], ['Ship 2 client orders', 'Tomorrow']] },
    { space: { name: 'Money', emoji: '💰', color: C.green }, rows: [['Renew SIP', 'By the 5th · 🔔 3rd'], ['Credit card bill', 'Due the 12th']] },
    { space: 'health', rows: [['Gym', 'Mon · Wed · Fri'], ['Lights out by 11:30', 'Daily']] },
  ],
  toast: { title: 'Edit the new video', body: 'Your evening block starts now', time: '9:00 PM' },
  closing: 'Two careers. *One memory.*',
  music: { bpm: 104, key: 65, prog: ['I', 'vi', 'ii', 'V'], mood: 'bright', drumsFrom: 3.0 },
});
