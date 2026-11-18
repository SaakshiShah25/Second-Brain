// 08 · Persona: university students
import { persona } from '../persona.js';
import { C } from '../components.js';

export default persona({
  emoji: '🎓', color: C.sky, blobs: [C.sky, C.amber, C.teal, C.accent], seed: 5,
  title: 'University *students*',
  sub: 'Lectures, deadlines, internships.<br>And somehow, a life.',
  messLine: 'Your week, *all at once.*',
  mess: ['📚 DBMS assignment, Fri', '✉️ Ask Prof. Rao for a letter', '💻 Hackathon call, 8 PM', '💸 Hostel mess fees', '📝 3 internship applications', '🎂 Mom’s birthday, Sun'],
  said: 'DBMS assignment due Friday, ask Prof. Rao for a recommendation, and remind me about Mom’s birthday on Sunday.',
  spacesLine: 'Sorted into *your spaces.*',
  spaces: [
    { space: 'uni', rows: [['DBMS assignment', 'Fri · 🔔 Thu 8 PM'], ['Letter from Prof. Rao', 'This week']] },
    { space: { name: 'Internships', emoji: '💼', color: C.blue }, rows: [['Applications', 'List · 3 to go'], ['Polish résumé', 'Sun']] },
    { space: { name: 'Hackathon', emoji: '💻', color: C.red }, rows: [['Team call', 'Today · 8 PM'], ['Submit the pitch', 'Sat · 11 AM']] },
    { space: 'family', rows: [['Mom’s birthday 🎂', 'Sun · 🔔 Sat 9 PM'], ['Book the bus home', 'Next week']] },
  ],
  toast: { title: 'Ask Prof. Rao for a letter', body: 'His office hours start in 15 minutes', time: '2:45 PM' },
  closing: 'Fewer *“I totally forgot.”* More time to live.',
  music: { bpm: 110, key: 64, prog: ['I', 'V', 'vi', 'IV'], mood: 'bright', drumsFrom: 3.0 },
});
