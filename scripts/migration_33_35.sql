-- Sections 33-35 of schema.sql: the only ones not yet in the Supabase database
-- (checked 2026-10-28). Paste into Supabase > SQL Editor > Run. Safe to run more than once.

-- 33. Initiative digest cache (initiative_digest.py). The Notes page shows
--     each initiative as ONE living page - a one-line summary and the
--     points from all its notes, organised into short sections. That is
--     written by the LLM only when the initiative's notes change (the
--     `fingerprint`), then served from here. initiative_id 0 = notes with
--     no initiative ("Others"). `digest` is encrypted JSON text.
--     Safe to run more than once.
create table if not exists initiative_digest (
    user_id uuid not null references auth.users(id) on delete cascade,
    initiative_id bigint not null,
    fingerprint text not null,
    digest text not null,                -- encrypted JSON {summary, sections}
    created_at timestamptz not null default now(),
    primary key (user_id, initiative_id)
);
alter table initiative_digest enable row level security;
drop policy if exists "Users read their own initiative digests" on initiative_digest;
create policy "Users read their own initiative digests" on initiative_digest
    for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 34. The user's own order for initiatives (the chip row and the Notes
--     page follow it). Null = not ordered yet, sorted after the ordered
--     ones by creation time. Safe to run more than once.
alter table initiative add column if not exists position integer;

-- 35. Observability (observability.py). One row per thing worth knowing:
--     an API request, an LLM or Cohere call (model, tokens, feature), a
--     capture/question, a limit being hit, or an error (with the reference
--     code the user was shown). Feeds the admin page and the daily report;
--     rows older than 30 days are deleted by the daily report job. Never
--     holds note or question text. Server-side only: RLS on, no policies,
--     so only the backend's service key can read or write it.
--     Safe to run more than once.
create table if not exists app_event (
    id bigint generated always as identity primary key,
    created_at timestamptz not null default now(),
    user_id uuid references auth.users(id) on delete cascade,
    kind text not null,          -- request | llm | cohere | usage | limit | error | client_error
    name text not null,          -- route, feature, limit or place of the error
    status integer,
    duration_ms integer,
    model text,
    tokens integer,
    error_id text,
    detail jsonb not null default '{}'::jsonb
);
create index if not exists app_event_created_at_idx on app_event (created_at);
create index if not exists app_event_user_created_idx on app_event (user_id, created_at);
alter table app_event enable row level security;

-- Make the API see the new tables/column straight away.
notify pgrst, 'reload schema';
