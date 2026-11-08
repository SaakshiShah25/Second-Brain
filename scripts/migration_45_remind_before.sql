-- scripts/migration_45_remind_before.sql - "remind me before" on a task (schema.sql section 45).
-- Paste into Supabase > SQL Editor > Run. Safe to run more than once.

-- 45. How many minutes before its due time a task should remind you (30 = half an hour before, 1440 = a day before).
--     Null = no early reminder (the usual reminder at the due time still applies). Counted from the due time, or
--     from 9 AM on the due date when the task has no time.
alter table task add column if not exists remind_before integer;
notify pgrst, 'reload schema';
