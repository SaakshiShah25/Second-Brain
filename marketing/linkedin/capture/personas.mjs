// Staged accounts for the persona videos: each person's own spaces, to-dos, lists and notes, plus what they say
// into the capture box and what MyConfía files it as.
import { task } from './demo-data.mjs';

const D = '2026-11-15';
const day = n => { const d = new Date(D + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const note = (id, initiative_id, spaces, summary, o = {}) => ({ id, initiative_id, raw_text: summary, summary, topics: [], decisions: [], concerns: [], date: day(-2), location: null,
  created_at: day(-2) + 'T08:00:00Z', geo_lat: null, geo_lng: null, geo_address: null, maps_url: null, initiative: spaces.find(s => s.id === initiative_id), tasks: [], extracted_facts: null, ...o });
const list = (id, name, emoji, initiative_id) => ({ id, name, emoji, position: id, created_at: '2026-11-01T10:00:00Z', initiative_id });
const inList = (l, description, o = {}) => task(description, { list_id: l.id, item_list: { id: l.id, name: l.name, emoji: l.emoji }, initiative_id: l.initiative_id, ...o });
// capture reply part
const part = (initiative_id, initiative_name, summary, tasks, extra = {}) => ({ interaction_id: summary ? initiative_id * 1000 : null, note_saved: !!summary, initiative_id, initiative_name, suggested_initiative: null, summary,
  tasks_created: tasks.map((t, i) => ({ id: 800 + initiative_id * 10 + i, owner: 'me', due_date: null, due_time: null, ...t })), skipped_due_dates: [], decisions: [], concerns: [], ...extra });

function build({ name, theme, spaces, lists, tasks, notes, said, parts, adds }) {
  return { name, theme, spaces, lists, tasks, notes, said, parts, adds };
}

export const PERSONAS = {};

{ // ---------- student ----------
  const S = [{ id: 1, name: 'University', color: '#7c5cd8' }, { id: 2, name: 'Internships', color: '#3477c9' }, { id: 3, name: 'Hackathon', color: '#d9731f' }, { id: 4, name: 'Family', color: '#c93b8f' }, { id: 5, name: 'Fitness', color: '#1f9d6b' }];
  const L = [list(21, 'Applications', '📝', 2), list(22, 'Hostel shopping', '🛒', null)];
  PERSONAS.student = build({
    name: 'Rohan', theme: 'light', spaces: S, lists: L,
    tasks: [
      task('Database systems assignment', { initiative_id: 1, due_date: day(5), remind_on: day(4), remind_time: '20:00:00', priority: 'high' }),
      task('Lab viva prep', { initiative_id: 1, due_date: day(1), due_time: '10:00:00' }),
      task('Hackathon team call', { initiative_id: 3, due_date: D, due_time: '20:00:00', remind_before: 10 }),
      task('Submit the pitch deck', { initiative_id: 3, due_date: day(6), due_time: '11:00:00' }),
      task('Polish résumé', { initiative_id: 2, due_date: D }),
      task('Pay hostel mess fees', { due_date: day(-1), priority: 'high' }),
      task('Run 5 km', { initiative_id: 5, due_date: D, due_time: '18:30:00', repeat: 'daily' }),
      inList(L[0], 'Product intern, fintech startup'), inList(L[0], 'Data analyst summer role'), inList(L[1], 'Extension cord'),
    ],
    notes: [note(301, 1, S, 'Professor Rao: the project report needs a literature review and two diagrams.'), note(302, 2, S, 'Career fair: three startups hiring interns, follow up by Friday.')],
    said: 'Ask Professor Rao for a recommendation letter this week, and remind me about Mom’s birthday on Sunday',
    parts: [part(1, 'University', 'Ask Professor Rao for a recommendation letter this week.', [{ description: 'Ask Professor Rao for a letter', due_date: day(5) }]),
      part(4, 'Family', 'Mom’s birthday on Sunday.', [{ description: 'Mom’s birthday 🎂', due_date: day(7) }])],
    adds: [{ description: 'Ask Professor Rao for a letter', initiative_id: 1, due_date: day(5) }, { description: 'Mom’s birthday 🎂', initiative_id: 4, due_date: day(7), remind_on: day(6), remind_time: '21:00:00' }],
  });
}
{ // ---------- founder ----------
  const S = [{ id: 1, name: 'Fundraise', color: '#1f9d6b' }, { id: 2, name: 'Customers', color: '#3477c9' }, { id: 3, name: 'Team', color: '#d9731f' }, { id: 4, name: 'Family', color: '#c93b8f' }, { id: 5, name: 'Health', color: '#1f9bb0' }];
  const L = [list(31, 'Investor pipeline', '📈', 1), list(32, 'Hiring', '🧑‍💻', 3)];
  PERSONAS.founder = build({
    name: 'Meera', theme: 'dark', spaces: S, lists: L,
    tasks: [
      task('Send the investor update', { initiative_id: 1, due_date: day(5), remind_on: day(4), remind_time: '18:00:00', priority: 'high' }),
      task('Backend engineer interview', { initiative_id: 3, due_date: D, due_time: '15:00:00', remind_before: 15 }),
      task('Draft the offer letter', { initiative_id: 3, due_date: day(1) }),
      task('GST filing', { due_date: day(5), priority: 'high' }),
      task('Kid’s parent-teacher meeting', { initiative_id: 4, due_date: day(3), due_time: '16:00:00' }),
      task('Walk 30 minutes', { initiative_id: 5, due_date: D, due_time: '18:00:00', repeat: 'daily' }),
      inList(L[0], 'Blume: second meeting'), inList(L[0], 'Angel: intro via Kunal'), inList(L[1], 'Backend engineer'), inList(L[1], 'Founding designer'),
    ],
    notes: [note(401, 2, S, 'Demo with Arjun’s team: they liked the dashboards; asked for SSO before rollout.', { decisions: ['Ship SSO in December'], concerns: ['Their IT review takes 3 weeks'] }),
      note(402, 1, S, 'Partner call: wants to see two more months of revenue growth.')],
    said: 'Follow up with Acme on pricing tomorrow at 11, and book our anniversary dinner for Saturday',
    parts: [part(2, 'Customers', 'Follow up with Acme on pricing tomorrow at 11.', [{ description: 'Follow up with Acme on pricing', due_date: day(1), due_time: '11:00' }]),
      part(4, 'Family', 'Anniversary dinner on Saturday.', [{ description: 'Book the anniversary dinner 🌹', due_date: day(6) }])],
    adds: [{ description: 'Follow up with Acme on pricing', initiative_id: 2, due_date: day(1), due_time: '11:00:00', remind_before: 30 }, { description: 'Book the anniversary dinner 🌹', initiative_id: 4, due_date: day(6) }],
  });
}
{ // ---------- 9-to-5 + side hustle ----------
  const S = [{ id: 1, name: 'Day job', color: '#3477c9' }, { id: 2, name: 'Side hustle', color: '#d0443e' }, { id: 3, name: 'Money', color: '#b8951a' }, { id: 4, name: 'Health', color: '#1f9d6b' }, { id: 5, name: 'Family', color: '#c93b8f' }];
  const L = [list(41, 'Video ideas', '🎬', 2), list(42, 'Bills', '🧾', 3)];
  PERSONAS.professional = build({
    name: 'Kabir', theme: 'light', spaces: S, lists: L,
    tasks: [
      task('Q3 report for Neha', { initiative_id: 1, due_date: day(4), remind_on: day(3), remind_time: '17:00:00', priority: 'high' }),
      task('1:1 prep', { initiative_id: 1, due_date: day(1), due_time: '10:30:00' }),
      task('Edit the new video', { initiative_id: 2, due_date: D, due_time: '21:00:00', remind_before: 10 }),
      task('Ship 2 client orders', { initiative_id: 2, due_date: day(1) }),
      task('Renew SIP', { initiative_id: 3, due_date: day(5), remind_on: day(3) }),
      task('Gym', { initiative_id: 4, due_date: D, due_time: '19:00:00', repeat: 'weekdays' }),
      inList(L[0], 'Desk setup tour'), inList(L[0], '5 tools I use daily'), inList(L[1], 'Credit card, due 12th'),
    ],
    notes: [note(501, 1, S, 'Neha wants the Q3 report to lead with churn and the two fixes we shipped.'), note(502, 2, S, 'Sponsor email: wants a 60-second mention in December.')],
    said: 'Q3 report due Thursday, edit the new video tonight at 9, and renew my SIP before the 5th',
    parts: [part(1, 'Day job', '', [{ description: 'Q3 report', due_date: day(4) }]), part(2, 'Side hustle', '', [{ description: 'Edit the new video', due_date: D, due_time: '21:00' }]), part(3, 'Money', '', [{ description: 'Renew SIP', due_date: day(5) }])],
    adds: [],
  });
}
{ // ---------- parent ----------
  const S = [{ id: 1, name: 'Kids', color: '#1f9bb0' }, { id: 2, name: 'Home', color: '#d9731f' }, { id: 3, name: 'Family', color: '#c93b8f' }, { id: 4, name: 'Me time', color: '#1f9d6b' }, { id: 5, name: 'Work', color: '#3477c9' }];
  const L = [list(51, 'Groceries', '🥦', 2), list(52, 'Gift ideas', '🎁', 3)];
  PERSONAS.parent = build({
    name: 'Priya', theme: 'dark', spaces: S, lists: L,
    tasks: [
      task('Aarav’s volcano project', { initiative_id: 1, due_date: day(1), remind_on: D, remind_time: '17:00:00', priority: 'high' }),
      task('Pediatrician', { initiative_id: 1, due_date: day(2), due_time: '17:00:00', remind_before: 30 }),
      task('Call the plumber', { initiative_id: 2, due_date: D }),
      task('Pay school fees', { initiative_id: 1, due_date: day(-1), priority: 'high' }),
      task('Call Nani', { initiative_id: 3, due_date: D, due_time: '19:00:00' }),
      task('Yoga', { initiative_id: 4, due_date: D, due_time: '19:30:00', repeat: 'daily' }),
      inList(L[0], 'Milk'), inList(L[0], '1 kg vegetables'), inList(L[0], 'Atta, 5 kg'), inList(L[1], 'Board game for Aarav'),
    ],
    notes: [note(601, 1, S, 'Parent-teacher meeting: Aarav is doing well in maths; needs more reading time at home.'), note(602, 3, S, 'Nani’s 80th in January: book the hall by mid-December.')],
    said: 'Pediatrician Tuesday at 5, carry the vaccination card, and add milk and vegetables to groceries',
    parts: [part(1, 'Kids', 'Pediatrician on Tuesday at 5; carry the vaccination card.', [{ description: 'Pediatrician', due_date: day(2), due_time: '17:00' }]),
      part(2, 'Home', '', [{ description: 'Milk', list_id: 51, list_name: 'Groceries', list_emoji: '🥦' }, { description: 'Vegetables', list_id: 51, list_name: 'Groceries', list_emoji: '🥦' }])],
    adds: [],
  });
}
