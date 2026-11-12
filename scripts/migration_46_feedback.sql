-- Run this once in the Supabase SQL editor (safe to run more than once).
-- Adds the table behind the rating card, "Report a problem" and the admin page's Feedback card.

-- 46. User feedback: a "how is it going?" rating, reported problems, and "ask me later" markers (so the
--     rating card is asked once per account, not once per device). Read and written only by the backend's
--     service key (RLS on, no policies), like app_event. Shown on the admin page (api/routers/admin.py).
--     Safe to run more than once.
create table if not exists feedback (
    id bigint generated always as identity primary key,
    created_at timestamptz not null default now(),
    user_id uuid not null references auth.users(id) on delete cascade,
    kind text not null check (kind in ('rating', 'issue', 'snooze')),
    rating smallint check (rating between 1 and 4),      -- 1 poor, 2 okay, 3 good, 4 loving it (kind = 'rating')
    tags text[] not null default '{}',                    -- the reasons / category the person picked
    message text,                                         -- optional, written by the person
    screen text,                                          -- where in the app it was sent from
    context jsonb not null default '{}'::jsonb,           -- app version, last error reference, optional pasted reply
    status text not null default 'new' check (status in ('new', 'seen', 'fixed'))
);
create index if not exists feedback_created_at_idx on feedback (created_at);
create index if not exists feedback_user_created_idx on feedback (user_id, created_at);
alter table feedback enable row level security;
notify pgrst, 'reload schema';
