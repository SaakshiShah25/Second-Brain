// 11 · Persona: parents and whoever runs the home
import { persona } from '../persona.js';
import { C } from '../components.js';

export default persona({
  emoji: '🏡', color: C.pink, blobs: [C.pink, C.amber, C.sky, C.sun], seed: 21,
  title: 'Parents & *home runners*',
  sub: 'Kids, home, family.<br>And somewhere in there, you.',
  messLine: 'The invisible *to-do list.*',
  mess: ['🌋 Volcano project, Mon', '🩺 Pediatrician, Tue 5 PM', '🥦 1 kg vegetables + milk', '🪔 Diwali gift list', '🔧 Call the plumber', '🧘 Yoga at 7'],
  said: 'Aarav’s volcano project due Monday, pediatrician Tuesday at 5, and add milk and vegetables to groceries.',
  spacesLine: 'The whole household, *sorted.*',
  spaces: [
    { space: { name: 'Kids', emoji: '🧒', color: C.sky }, rows: [['Volcano project 🌋', 'Mon · 🔔 Sat 10 AM'], ['Pediatrician', 'Tue · 5:00 PM']] },
    { space: 'home', rows: [['Groceries', 'Milk, 1 kg vegetables'], ['Call the plumber', 'Tomorrow']] },
    { space: 'family', rows: [['Diwali gifts 🪔', 'List · 6 people'], ['Call Nani', 'Sunday']] },
    { space: { name: 'Me time', emoji: '🧘', color: C.teal }, rows: [['Yoga', 'Daily · 7 AM'], ['Finish my book', 'This month']] },
  ],
  toast: { title: 'Pediatrician at 5:00 PM', body: 'In 30 minutes · carry the vaccination card', time: '4:30 PM' },
  closing: 'You hold the family together. *We’ll hold the details.*',
  music: { bpm: 96, key: 67, prog: ['IV', 'I', 'vi', 'V'], mood: 'calm', drumsFrom: 3.0 },
});
