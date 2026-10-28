-- scripts/migration_36_push.sql - the push_subscription table for task reminders (schema.sql section 36).
-- Paste into Supabase > SQL Editor > Run. Safe to run more than once.

-- 36. Web Push subscriptions (push_notify.py) - one row per browser/device that turned on
--     task reminders. `timezone` is the device's IANA zone ("Asia/Kolkata") so 9 AM and 5 PM
--     are the user's own 9 and 5. last_9am / last_5pm hold the local DATE a reminder was last
--     sent in that slot, so the half-hourly job never sends one twice. The endpoint is the
--     push service's address for the device (unique). Safe to run more than once.
create table if not exists push_subscription (
    id bigint generated always as identity primary key,
    user_id uuid not null references auth.users(id) on delete cascade,
    endpoint text not null unique,
    p256dh text not null,
    auth text not null,
    timezone text not null default 'UTC',
    last_9am date,
    last_5pm date,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);
create index if not exists push_subscription_user_idx on push_subscription (user_id);
alter table push_subscription enable row level security;
drop policy if exists "Users manage their own push subscriptions" on push_subscription;
create policy "Users manage their own push subscriptions" on push_subscription
    for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
