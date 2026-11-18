// v2 · 11 · Persona: parents and whoever runs the home (real staged account, dark)
import { persona } from '../persona.js';
export default persona({
  id: 'parent', theme: 'dark', who: 'parents', frames: { typed: 34, reply: 36 },
  said: 'Pediatrician Tuesday at 5, carry the vaccination card, and add milk and vegetables to groceries',
  hatsLine: 'You’re also *the parent,*',
  hats: [['the chef', 'home', '#d9731f'], ['the teacher', 'grad', '#1f9bb0'], ['the daughter', 'heart', '#c93b8f'], ['the professional', 'briefcase', '#3477c9'], ['and you', 'user', '#1f9d6b']],
  closing: 'You hold the family together. *We’ll hold the details.*',
  music: { bpm: 96, key: 67, prog: ['IV', 'I', 'vi', 'V'], mood: 'warm', drumsFrom: 2.3 },
});
