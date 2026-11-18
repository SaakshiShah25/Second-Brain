// Staged demo account for screenshots: one busy person's life across five spaces.
const D = '2026-11-15'; // Sunday
const day = n => { const d = new Date(D + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

export const SPACES = [
  { id: 1, name: 'Work', color: '#3477c9' },
  { id: 2, name: 'Family', color: '#c93b8f' },
  { id: 3, name: 'Home', color: '#d9731f' },
  { id: 4, name: 'Health', color: '#1f9d6b' },
  { id: 5, name: 'Side project', color: '#7c5cd8' },
];
const sp = id => SPACES.find(s => s.id === id);

export const LISTS = [
  { id: 11, name: 'Groceries', emoji: '🥦', position: 0, created_at: '2026-11-01T10:00:00Z', initiative_id: 3 },
  { id: 12, name: 'Gift ideas', emoji: '🎁', position: 1, created_at: '2026-11-02T10:00:00Z', initiative_id: 2 },
  { id: 13, name: 'Books to read', emoji: '📚', position: 2, created_at: '2026-11-03T10:00:00Z', initiative_id: null },
];

let nid = 100;
export const task = (description, o = {}) => ({
  id: nid++, interaction_id: null, description, due_date: null, due_time: null, status: 'open', owner: 'me', priority: 'normal',
  remind_on: null, remind_time: null, remind_before: null, initiative_id: null, list_id: null, item_list: null, repeat: null, detail: null,
  created_at: '2026-11-14T09:00:00Z', interaction: null, ...o,
});
const inList = (lid, description, o = {}) => { const l = LISTS.find(x => x.id === lid); return task(description, { list_id: lid, item_list: { id: l.id, name: l.name, emoji: l.emoji }, initiative_id: l.initiative_id, ...o }); };

export const TASKS = [
  task('Prep the CEO deck', { initiative_id: 1, due_date: D, due_time: '20:00:00', priority: 'high', remind_before: 60 }),
  task('Meet the CEO', { initiative_id: 1, due_date: day(1), due_time: '09:00:00', priority: 'high', remind_before: 30 }),
  task('Send proposal to Acme', { initiative_id: 1, due_date: day(5), remind_on: day(4), remind_time: '10:00:00' }),
  task('Investor update draft', { initiative_id: 1, due_date: day(6) }),
  task('Buy a toy for Aarav', { initiative_id: 2, due_date: day(2) }),
  task('Call Mom', { initiative_id: 2, due_date: D, due_time: '19:00:00', remind_before: 10 }),
  task('Gym', { initiative_id: 4, due_date: D, due_time: '18:00:00', repeat: 'weekdays' }),
  task('Book the dentist', { initiative_id: 4, due_date: day(7) }),
  task('Pay electricity bill', { initiative_id: 3, due_date: day(-1), priority: 'high' }),
  task('Ship the landing page', { initiative_id: 5, due_date: day(1) }),
  task('Reply to Priya about the launch', { initiative_id: 5, due_date: D }),
  task('Renew passport', { status: 'done', initiative_id: 3, due_date: day(-2) }),
  inList(11, '1 kg vegetables'), inList(11, 'Milk'), inList(11, 'Atta, 5 kg'),
  inList(12, 'Silver bracelet for Mom'), inList(12, 'Board game for the kids'),
  inList(13, 'Atomic Habits'),
];

export const NOTES = [
  { id: 201, initiative_id: 1, raw_text: 'CEO meeting tomorrow 9am. Deck needs Q3 numbers, the hiring plan and the two customer stories.', summary: 'CEO meeting tomorrow at 9 AM: the deck needs Q3 numbers, the hiring plan and two customer stories.', topics: ['CEO meeting', 'Q3'], decisions: ['Lead with the customer stories'], concerns: ['Q3 numbers not final yet'], date: D },
  { id: 202, initiative_id: 5, raw_text: 'Design sync: share onboarding copy by Wednesday, review the icon set before Friday demo.', summary: 'Design sync: share the onboarding copy by Wednesday and review the icon set before Friday’s demo.', topics: ['Design', 'Onboarding'], decisions: ['Ship the warmer onboarding copy'], concerns: [], date: day(-3) },
  { id: 203, initiative_id: 4, raw_text: 'Doctor said walk 30 min daily, recheck vitamin D in 6 weeks.', summary: 'Walk 30 minutes daily; recheck vitamin D in six weeks.', topics: ['Health'], decisions: [], concerns: [], date: day(-5) },
  { id: 204, initiative_id: 2, raw_text: 'Mom’s birthday on the 28th: dinner at home, ask the cousins in Pune to join.', summary: 'Mom’s birthday on the 28th: dinner at home, and ask the cousins in Pune to join.', topics: ['Birthday'], decisions: [], concerns: [], date: day(-1) },
].map(n => ({ location: null, created_at: n.date + 'T08:00:00Z', geo_lat: null, geo_lng: null, geo_address: null, maps_url: null, initiative: sp(n.initiative_id), tasks: [], extracted_facts: null, ...n }));

export function demo(theme, opts = {}) { return makeData(theme, { spaces: SPACES, lists: LISTS, tasks: TASKS, notes: NOTES, ...opts }); }

export function makeData(theme, { spaces, lists, tasks: TASKS, notes, without = [], name = 'Aanya' }) {
  const tasks = TASKS.filter(t => !without.includes(t.description)).map(t => ({ ...t }));
  const settings = { user_id: '00000000-0000-4000-8000-000000000001', theme, font_size: 'default', terms_accepted_at: '2026-10-01T00:00:00Z', tour_completed_at: '2026-10-01T00:00:00Z', usage_mode: 'both', updated_at: '2026-10-01T00:00:00Z' };
  const counts = () => ({ overdue: 1, due_soon: 6, open: tasks.filter(t => t.status === 'open').length, done: tasks.filter(t => t.status === 'done').length });
  return {
    tasks,
    add(list) { for (const t of list) tasks.unshift(task(t.description, t)); },
    routes(p, method, body) {
      if (p === '/api/health') return { ok: true };
      if (p.startsWith('/api/settings')) return settings;
      if (p === '/api/initiatives') return spaces.map(s => ({ ...s, created_at: '2026-10-01T00:00:00Z' }));
      if (p === '/api/tasks') return { tasks, counts: counts() };
      const m = p.match(/^\/api\/tasks\/(\d+)$/);
      if (m && method === 'PATCH') { const t = tasks.find(x => x.id === +m[1]); if (t) Object.assign(t, JSON.parse(body || '{}')); return { ok: true }; }
      if (p === '/api/lists') return lists;
      if (p === '/api/notes') return notes;
      if (p === '/api/admin/me') return { admin: false };
      if (p === '/api/feedback/prompt') return { ask: false };
      if (p.startsWith('/api/push/prefs')) return {};
      if (p === '/api/push/key') return { public_key: '' };
      return null;
    },
  };
}
