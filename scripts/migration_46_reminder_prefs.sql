-- scripts/migration_46_reminder_prefs.sql - when each device wants its daily summaries, and alarm-style reminders
-- (schema.sql section 46). Paste into Supabase > SQL Editor > Run. Safe to run more than once.

-- 46. Per device (a row of push_subscription): the morning and evening summary can each be switched off and moved to a
--     time of the user's choosing (the device's local time, "HH:MM"); alarm_style makes the reminders for individual
--     tasks ring like an alarm (a full-screen card with sound and vibration) instead of a quiet notification.
--     The defaults are exactly what every device had before: 9 AM and 5 PM, no alarm.
alter table push_subscription add column if not exists morning_on boolean not null default true;
alter table push_subscription add column if not exists morning_time text not null default '09:00';
alter table push_subscription add column if not exists evening_on boolean not null default true;
alter table push_subscription add column if not exists evening_time text not null default '17:00';
alter table push_subscription add column if not exists alarm_style boolean not null default false;
notify pgrst, 'reload schema';
