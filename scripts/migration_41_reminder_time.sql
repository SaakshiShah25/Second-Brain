-- scripts/migration_41_reminder_time.sql - a time of day for a task's reminder (schema.sql section 41).
-- Paste into Supabase > SQL Editor > Run. Safe to run more than once.
-- Run scripts/migration_38_task_options.sql first (this extends its remind_on column).

-- 41. A task's reminder (remind_on, the day) can now say WHEN that day: remind_time. Null means the default,
--     9 AM, so every reminder set before this keeps arriving at 9 AM. The scheduler (api/routers/push.py ->
--     push_notify.send_task_reminders) sends it once that time has passed on that day in the device's own
--     time zone; reminded_on remembers it was sent. Until this has run, reminders work as before (9 AM) and
--     choosing a time says to run this first.
alter table task add column if not exists remind_time time;
notify pgrst, 'reload schema';
