// v2 · 08 · Persona: university students (real staged account, light)
import { persona } from '../persona.js';
export default persona({
  id: 'student', theme: 'light', who: 'university students', frames: { typed: 36, reply: 38 },
  said: 'Ask Professor Rao for a recommendation letter this week, and remind me about Mom’s birthday on Sunday',
  hatsLine: 'You’re also *the student,*',
  hats: [['the intern', 'briefcase', '#3477c9'], ['the hacker', 'rocket', '#d9731f'], ['the runner', 'heart', '#1f9d6b'], ['the son', 'home', '#c93b8f'], ['the friend', 'user', '#7c5cd8']],
  closing: 'Fewer *“I totally forgot.”* More university.',
  music: { bpm: 110, key: 64, prog: ['I', 'V', 'vi', 'IV'], mood: 'warm', drumsFrom: 2.1 },
});
