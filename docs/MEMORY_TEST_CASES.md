# Memory layer: manual test cases

What these check: details in a note are filed into `person_fact`, `key_date` and
`relationship`, show up on the contact's page, and can be asked about.

## Before you start (once)

1. Supabase → SQL Editor → paste all of `scripts/pending_migration.sql` → Run.
   Safe to run again. (It also creates the search index and daily brief tables,
   and renames `fact` / `entity_edge` to `person_fact` / `relationship` if an
   earlier version made them.)
2. Optional, for contacts you already have:
   `venv/bin/python scripts/rebuild_graph.py your@email.com` (no model calls).
3. Run the backend and the web app as usual, and sign in.
4. Automated checks that need no database: `python tests/test_memory_schema.py`,
   `python tests/test_graph_memory.py`, `python tests/test_agent_memory_tools.py`.

Where to look: open the contact → **Key dates**, **Remembered details**,
**Family & connections** (new sections above "Personal notes"). In Supabase,
`month`, `day`, `attribute`, `subject`, `rel_type` are readable; `value`, `label`
and names are stored encrypted, so they look like gibberish in the table editor.

```sql
select person_id, date_type, subject, month, day, year, source_type from key_date order by person_id;
select person_id, attribute, subject, value_norm, confidence, superseded_by, valid_to, source_type from person_fact order by person_id, id;
select src_id, dst_id, rel, rel_type, source_type from relationship where src_type = 'person' and dst_type = 'person';
```

## 1. One rich note fills all three tables

Send in the chat (use any real name; contacts are created as needed):

> Lunch with Priya today. Her birthday is on March 14. She's married to Karan, their wedding anniversary is November 2. Their daughter Anya turns 5 in June. Priya prefers coffee over tea, is training for a marathon, and moved to Pune last year. I need to send her the deck by Friday.

Expect on **Priya's** page:
- Key dates: *Birthday: 14 March*, *Karan's wedding anniversary: 2 November*, each with "In N days" when within 30 days.
- Remembered details: Likes · coffee over tea, Lives in · Pune, a goal/hobby for the marathon.
- Family & connections: Karan (spouse), Anya (child).
- **Anya's** page: *Anya's birthday: June (day not known)*. **Karan's** page: Priya (spouse).
- A follow-up task "send the deck" as before.

## 2. Ask for those details back

Ask one at a time:
- "When is Priya's birthday?" → 14 March, with how far away it is.
- "When is Priya and Karan's anniversary?" → 2 November.
- "What does Priya like to drink?" → coffee over tea.
- "Where does Priya live?" → Pune.
- "Who is Priya married to?" / "Does Priya have kids?" → Karan / Anya.
- "When is Anya's birthday?" → June, and says the day isn't known (it must not invent one).

## 3. Missing data is stated, not guessed

Ask for the birthday of a contact who has none: "When is Rohan's birthday?" →
it says no birthday is recorded for Rohan. Also ask "What does Rohan like?" for
a contact with no saved details → says nothing is recorded.

## 4. Questions across everyone

- "Whose birthday is coming up?" → people with a birthday in the next 30 days, soonest first.
- "Whose birthday is in March?" → Priya.
- Log "Neha loves coffee and hates cold weather", then ask "Who likes coffee?" → Priya and Neha.
- Log "Rohan is vegetarian" and "Meera is vegan", then ask "Who is vegetarian?" → Rohan only (words must match).
- "Which friends are vegetarian?" needs the contact to have the tag `friend` (edit the contact → Tags), or a note that calls them a friend.

## 5. Relative dates become real dates

On any day, log: "Rohan's son Veer's birthday is tomorrow." → Veer gets a
birthday on tomorrow's actual date (a month and day, not the word "tomorrow").

## 6. Changes supersede, they don't overwrite

Log "Priya moved to Bengaluru." → Lives in now shows Bengaluru. Then ask
"Where did Priya live before?" → Pune. In Supabase the old `lives_in` row has
`superseded_by` and `valid_to` set. (Likes and hobbies add up instead of replacing.)

## 7. Hearsay is marked

Log "I think Rohan is allergic to peanuts." → shows with "possibly". Log it again
as certain ("Rohan is allergic to peanuts") → "possibly" disappears.

## 8. The same note twice adds nothing

Send the exact note from test 1 again → no duplicate dates or details.

## 9. Typed-in values win over notes

On Priya's page add a birthday of 15 March by hand (Add a date). Then log
"Priya's birthday is March 14." → her page still shows 15 March (marked "added by you").
Without a manual date, a later note with a different date replaces the earlier one.

## 10. Bad dates are ignored

Log "Priya's birthday is February 30." → no birthday is created, the note still saves.

## 11. Merge keeps the memory

Create two contacts for the same person (e.g. "Priya" and "Priya K"), give each a
different detail, merge one into the other from the contact page → the details
and dates of both appear on the remaining contact; identical dates appear once.

## 12. Search finds them

Ask "Who is training for a marathon?" or "Who lives in Pune?" → Priya comes up
(each person's search card now includes their dates, details and family).

## 13. Nothing breaks before the migration

(Only if you want to confirm graceful behaviour.) With section 31 not yet applied,
notes still save, contact pages open (the new sections are just empty), and
the app answers as before.
