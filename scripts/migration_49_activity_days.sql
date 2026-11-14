-- Run this once in the Supabase SQL editor (safe to run more than once).

-- 49. One row per person per day they used the app, kept for good. The detailed usage events are deleted after 30 days
--     (api/routers/admin.py), so without this "how many days has this person used the app?" could only look 30 days back.
--     Filled by the backend as people use the app (observability.py); the inserts below add what we still know from before.
--     Counts days only - never what was done. Read only by the backend's service key. Safe to run more than once.
create table if not exists user_activity_day (
    user_id uuid not null references auth.users(id) on delete cascade,
    day date not null,
    primary key (user_id, day)
);
alter table user_activity_day enable row level security;
insert into user_activity_day (user_id, day)
    select distinct user_id, (created_at at time zone 'utc')::date from app_event
    where user_id is not null and kind in ('request', 'usage', 'llm')
    on conflict do nothing;
insert into user_activity_day (user_id, day)
    select distinct user_id, (created_at at time zone 'utc')::date from interaction
    where user_id is not null and created_at is not null
    on conflict do nothing;
notify pgrst, 'reload schema';
