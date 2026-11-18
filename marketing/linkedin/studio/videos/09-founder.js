// 09 · Persona: founders and business owners
import { persona } from '../persona.js';
import { C } from '../components.js';

export default persona({
  emoji: '🚀', color: C.accent, blobs: [C.accent, C.amber, C.blue, C.pink], seed: 8,
  title: 'Founders & *business owners*',
  sub: 'Investors, customers, hiring.<br>Plus the rest of your life.',
  messLine: 'Ten fires. *One brain.*',
  mess: ['📈 Investor update, Fri', '🤝 Acme pricing follow-up', '🧑‍💻 Backend interview, 3 PM', '🧾 GST filing by the 20th', '💬 Arjun’s demo feedback', '🌹 Anniversary dinner'],
  said: 'Follow up with Acme on pricing tomorrow, investor update by Friday, and book our anniversary dinner for Saturday.',
  spacesLine: 'Company and life, *both handled.*',
  spaces: [
    { space: { name: 'Fundraise', emoji: '📈', color: C.teal }, rows: [['Investor update', 'Fri · 🔔 Thu 6 PM'], ['Reply to Meera’s intro', 'Today']] },
    { space: { name: 'Customers', emoji: '🤝', color: C.blue }, rows: [['Acme: pricing follow-up', 'Tomorrow · 11 AM'], ['Arjun’s demo feedback', 'Note · 3 decisions']] },
    { space: { name: 'Team', emoji: '🧑‍💻', color: C.sun }, rows: [['Backend interview', 'Today · 3 PM'], ['Draft the offer letter', 'Mon']] },
    { space: 'family', rows: [['Anniversary dinner 🌹', 'Sat · 🔔 Thu'], ['Kid’s parent-teacher meet', 'Wed · 4 PM']] },
  ],
  toast: { title: 'Follow up with Acme on pricing', body: 'You told Rohan you’d reply by noon', time: '11:00 AM' },
  closing: 'Run the company. *Let MyConfía hold the details.*',
  music: { bpm: 114, key: 62, prog: ['vi', 'IV', 'I', 'V'], mood: 'pulse', drumsFrom: 3.0 },
});
