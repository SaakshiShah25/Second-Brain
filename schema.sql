-- schema.sql
-- Run this once in your Supabase project's SQL Editor (Project -> SQL Editor -> New query).
-- Sets up: pgvector extension, the three core tables, a real vector similarity
-- search function (used by db.py's search_interactions_by_embedding), and an
-- ANN index so that search stays fast as your interaction count grows.

-- 1. Enable pgvector (gives Postgres a real `vector` column type + similarity operators)
create extension if not exists vector;

-- 2. Person table
create table if not exists person (
    id bigint generated always as identity primary key,
    user_id uuid references auth.users(id) on delete cascade,
    name text not null,
    aliases jsonb default '[]'::jsonb,        -- list of alternate names/nicknames
    description text default '',              -- general/stable appearance + personality (NOT role/company)
    role text default '',                     -- job title/role, e.g. "Procurement Manager"
    company text default '',                  -- organization/company they're affiliated with
    phone text default '',                    -- e.g. from a scanned business card
    email text default '',                    -- e.g. from a scanned business card
    tags jsonb default '[]'::jsonb,           -- e.g. ["client","friend"]
    first_met_date date,
    created_at timestamptz default now()
);

-- 3. Interaction table
--    embedding dimension is 384 to match the sentence-transformers model
--    "all-MiniLM-L6-v2" used in capture.py. If you swap embedding models,
--    update this dimension to match (and re-embed existing rows).
create table if not exists interaction (
    id bigint generated always as identity primary key,
    user_id uuid references auth.users(id) on delete cascade,
    person_id bigint not null references person(id) on delete cascade,
    raw_text text not null,                   -- untouched original note (source of truth)
    date date,
    location text,
    appearance text default '',               -- what they wore/looked like AT THIS SPECIFIC meeting
                                               -- (distinct from person.description, which is stable/general)
    summary text,
    sentiment jsonb default '[]'::jsonb,      -- list of {"topic":..., "sentiment":...} objects
    topics jsonb default '[]'::jsonb,
    extracted_facts jsonb default '{}'::jsonb,
    embedding vector(384),                    -- real vector type, not a JSON list in a text column
    created_at timestamptz default now()
);

-- 4. Task table
create table if not exists task (
    id bigint generated always as identity primary key,
    user_id uuid references auth.users(id) on delete cascade,
    interaction_id bigint references interaction(id) on delete cascade,
    description text not null,
    due_date date,
    status text default 'open',               -- open | done
    created_at timestamptz default now()
);

-- 5. Multi-user: user_id on an existing table from before Supabase Auth
--    existed. The CREATE TABLE statements above already include user_id
--    for new installs - these ALTERs backfill an existing table (a no-op
--    on a fresh install, since the columns already exist), and are safe
--    to re-run. Must run BEFORE match_interactions() below, since that
--    function references interaction.user_id directly - on an existing
--    database, "create table if not exists" alone won't have added it.
--    Nullable for now (existing rows predate any user) - see the
--    backfill step near the bottom of this file.
alter table person add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table interaction add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table task add column if not exists user_id uuid references auth.users(id) on delete cascade;

-- 6. ANN index for fast approximate nearest-neighbor search over embeddings.
--    ivfflat + cosine distance, matching the <=> operator used below.
--    "lists" is a tuning knob - 100 is a reasonable default for a prototype
--    (up to tens of thousands of rows); increase it as your data grows.
create index if not exists interaction_embedding_idx
    on interaction using ivfflat (embedding vector_cosine_ops)
    with (lists = 100);

-- 7. Similarity search function, callable via supabase.rpc("match_interactions", {...})
--    from db.py. This is what makes it a genuine vector search (using the
--    index + cosine distance operator) rather than a Python-side loop.
create or replace function match_interactions (
    query_embedding vector(384),
    match_count int default 5,
    filter_person_id bigint default null,
    filter_user_id uuid default null
)
returns table (
    id bigint,
    person_id bigint,
    raw_text text,
    date date,
    summary text,
    similarity float
)
language sql stable
as $$
    select
        interaction.id,
        interaction.person_id,
        interaction.raw_text,
        interaction.date,
        interaction.summary,
        1 - (interaction.embedding <=> query_embedding) as similarity
    from interaction
    where interaction.embedding is not null
      and (filter_person_id is null or interaction.person_id = filter_person_id)
      and (filter_user_id is null or interaction.user_id = filter_user_id)
    order by interaction.embedding <=> query_embedding
    limit match_count;
$$;

-- 8. Secondary-person links: people mentioned in a note besides its
--    primary person (e.g. "Rhea, Priya's sister") get linked here instead
--    of being buried as text in interaction.extracted_facts, so they're
--    independently queryable later even if they never get their own
--    primary note. Populated by capture.py's resolve_and_link_other_people().
create table if not exists interaction_person (
    id bigint generated always as identity primary key,
    user_id uuid references auth.users(id) on delete cascade,
    interaction_id bigint not null references interaction(id) on delete cascade,
    person_id bigint not null references person(id) on delete cascade,
    relation text default '',   -- how they relate to the primary person/note in THIS interaction
    created_at timestamptz default now()
);

-- Backfill for an existing interaction_person table (see note in step 5 -
-- same reasoning, just has to come after this table's own CREATE above).
alter table interaction_person add column if not exists user_id uuid references auth.users(id) on delete cascade;

create index if not exists interaction_person_person_idx on interaction_person(person_id);
create index if not exists interaction_person_interaction_idx on interaction_person(interaction_id);

create index if not exists person_user_id_idx on person(user_id);
create index if not exists interaction_user_id_idx on interaction(user_id);
create index if not exists task_user_id_idx on task(user_id);
create index if not exists interaction_person_user_id_idx on interaction_person(user_id);

-- 9. phone/email on an existing `person` table from before business card
--    capture (card_scan.py) existed. The CREATE TABLE above already
--    includes these for new installs - this is only needed to backfill
--    an existing table, and is safe to re-run.
alter table person add column if not exists phone text default '';
alter table person add column if not exists email text default '';

-- 10. Row Level Security: every table is now scoped to user_id. The
--     backend (db.py) always uses the service_role key, which bypasses
--     RLS entirely, so these policies don't change app behavior - they're
--     defense-in-depth (Supabase's own recommendation for any table with
--     a user_id column) in case anything ever queries these tables with
--     the anon key directly instead of going through the API.
alter table person enable row level security;
alter table interaction enable row level security;
alter table task enable row level security;
alter table interaction_person enable row level security;

drop policy if exists "Users manage their own people" on person;
create policy "Users manage their own people" on person
    for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users manage their own interactions" on interaction;
create policy "Users manage their own interactions" on interaction
    for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users manage their own tasks" on task;
create policy "Users manage their own tasks" on task
    for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users manage their own interaction_person links" on interaction_person;
create policy "Users manage their own interaction_person links" on interaction_person
    for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 11. ONE-TIME BACKFILL - done (2026-08-15, backfilled onto
--     sanket3shah@gmail.com's account via a one-off script). Left here for
--     reference / in case a fresh install ever needs it again: find your
--     user id in the Supabase dashboard (Authentication -> Users), or run
--     `select id, email from auth.users;`, then:
--
-- update person set user_id = 'YOUR-USER-UUID-HERE' where user_id is null;
-- update interaction set user_id = 'YOUR-USER-UUID-HERE' where user_id is null;
-- update task set user_id = 'YOUR-USER-UUID-HERE' where user_id is null;
-- update interaction_person set user_id = 'YOUR-USER-UUID-HERE' where user_id is null;

-- 12. Now that every row has an owner, enforce it going forward - run
--     this block in the SQL Editor:
alter table person alter column user_id set not null;
alter table interaction alter column user_id set not null;
alter table task alter column user_id set not null;
alter table interaction_person alter column user_id set not null;

-- 13. Phase 6: Google Calendar sync (per-task, manual "Add to Calendar")
--     + opt-in device location on capture.

-- task.calendar_event_id: set once a task has been pushed to the user's
-- Google Calendar (see google_calendar.py) - lets the UI show "already
-- synced" and lets a later "remove" action find the event to delete.
alter table task add column if not exists calendar_event_id text;

-- interaction geo_* columns: an opt-in device location captured AT THE
-- TIME OF LOGGING the note (see ChatInput.tsx's location toggle) -
-- deliberately separate from the existing free-text `location` column
-- above, which is whatever the note's TEXT says (e.g. "at their office
-- downtown", extracted by the LLM) - a different, less precise thing
-- than a device GPS coordinate. maps_url needs no API key (it's a plain
-- Google Maps URL scheme); geo_address is only ever populated if a
-- GOOGLE_MAPS_API_KEY is configured (see google_maps.py) - both are
-- null whenever the user didn't opt in for that note.
alter table interaction add column if not exists geo_lat double precision;
alter table interaction add column if not exists geo_lng double precision;
alter table interaction add column if not exists geo_address text;
alter table interaction add column if not exists maps_url text;

-- google_credentials: one row per user who has connected Google
-- Calendar - holds the OAuth access/refresh token pair. Never returned
-- in any API response; read only server-side by google_calendar.py.
create table if not exists google_credentials (
    user_id uuid primary key references auth.users(id) on delete cascade,
    access_token text not null,
    refresh_token text not null,
    expires_at timestamptz not null,
    scope text default '',
    created_at timestamptz default now()
);

-- oauth_state: short-lived, single-use nonces bridging the "authenticated
-- API call" world and the "unauthenticated browser redirect" world that
-- OAuth's own consent-screen hop requires - see google_calendar.py /
-- api/routers/calendar.py for how `state` carries the user id across
-- that redirect. Consumed (deleted) immediately on use; a row older than
-- ~10 minutes is treated as invalid by the callback handler.
create table if not exists oauth_state (
    state text primary key,
    user_id uuid not null references auth.users(id) on delete cascade,
    created_at timestamptz default now()
);

alter table google_credentials enable row level security;
alter table oauth_state enable row level security;

drop policy if exists "Users manage their own google credentials" on google_credentials;
create policy "Users manage their own google credentials" on google_credentials
    for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users manage their own oauth state" on oauth_state;
create policy "Users manage their own oauth state" on oauth_state
    for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 14. Phase 7: richer meeting capture - follow-up ownership, personal
--     notes (kept separate from professional description), meeting
--     type, decisions, and concerns. See extraction.py's schema for how
--     these get populated and retrieval.py's _format_interaction_block
--     for how they surface in Ask/briefing answers.

-- person.personal_notes: same append-on-update convention as
-- person.description (db.update_person_personal_notes) - family,
-- hobbies, interests, life events, kept out of `description` (which is
-- professional/stable demeanor+appearance only).
alter table person add column if not exists personal_notes text default '';

-- task.owner: 'me' (the note-taker owes this) or 'them' (the other
-- person owes it) - plain text like task.status already is, validated
-- at the API layer rather than a DB enum.
alter table task add column if not exists owner text default 'me';

-- interaction.meeting_type: discovery/demo/negotiation/check-in/
-- networking/contract/support/internal/other - free text (not a DB
-- enum) for flexibility, but extraction.py's prompt constrains the LLM
-- to that fixed set.
alter table interaction add column if not exists meeting_type text default '';

-- interaction.decisions: settled outcomes reached in the meeting,
-- distinct from the task table's still-open follow-ups.
alter table interaction add column if not exists decisions jsonb default '[]'::jsonb;

-- interaction.concerns: specific objections/hesitations raised, distinct
-- from the general topic-level `sentiment` column.
alter table interaction add column if not exists concerns jsonb default '[]'::jsonb;

-- 15. Phase 10: Clients dashboard. Once a deal closes, the finalized
--     agreement (PDF/.docx/scanned photo) is uploaded, structured into
--     these fields by document_extract.py, and the original file is kept
--     in Supabase Storage (see storage.py) - client.document_path is a
--     storage path, not the file itself; the file is only ever served
--     back out via a short-lived signed URL.

create table if not exists client (
    id bigint generated always as identity primary key,
    user_id uuid not null references auth.users(id) on delete cascade,
    company text not null default '',
    client_legal_name text default '',
    provider_legal_name text default '',
    effective_date date,
    term_months integer,
    end_date date,                            -- explicit from the doc, or effective_date + term_months
    auto_renews boolean default false,
    renewal_notice_days integer,
    fee_amount numeric,
    fee_currency text default '',
    fee_frequency text default '',            -- monthly/quarterly/annual/one-time/other
    payment_terms text default '',
    termination_terms text default '',
    other_terms text default '',              -- catch-all: confidentiality, exclusivity, SLAs, governing law, etc.
    status text default 'active',             -- active/expired/terminated - plain text like task.status
    document_path text,                       -- Supabase Storage path, null if no document was attached
    document_filename text default '',
    created_at timestamptz default now()
);

-- client_signatory: the people named in the agreement (both sides), one
-- row per person. `person_id` links to an existing Person record when a
-- confident name match was found (same person_match.find_confident_match
-- auto-link pattern capture.py's resolve_and_link_other_people already
-- uses for secondary mentions) - null if no confident match, so the name
-- is still kept even when it can't be tied to a Person yet.
create table if not exists client_signatory (
    id bigint generated always as identity primary key,
    client_id bigint not null references client(id) on delete cascade,
    user_id uuid not null references auth.users(id) on delete cascade,
    name text not null,
    role text default '',
    side text default 'client',               -- 'client' or 'provider'
    person_id bigint references person(id) on delete set null,
    created_at timestamptz default now()
);

create index if not exists idx_client_user on client(user_id);
create index if not exists idx_client_signatory_client on client_signatory(client_id);

alter table client enable row level security;
alter table client_signatory enable row level security;

drop policy if exists "Users manage their own clients" on client;
create policy "Users manage their own clients" on client
    for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users manage their own client signatories" on client_signatory;
create policy "Users manage their own client signatories" on client_signatory
    for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 16. person.personal_notes: migrated from a single append-only text blob
--     to a dated timeline (jsonb array of {"date":..., "note":...}
--     objects). The old flat-text version conflated permanent facts
--     ("from Bangalore") with point-in-time ones ("expecting a baby next
--     month") with no way to tell how stale a fact is - a briefing
--     6 months later would state the pregnancy as still-current. Dated
--     entries let both the UI and the briefing LLM reason about recency.
--     Existing text (if any) is migrated into a single entry dated at
--     migration time, since the old format didn't preserve per-note dates.
do $$
begin
    if exists (
        select 1 from information_schema.columns
        where table_name = 'person' and column_name = 'personal_notes' and data_type = 'text'
    ) then
        alter table person rename column personal_notes to personal_notes_old;
        alter table person add column personal_notes jsonb default '[]'::jsonb;
        update person set personal_notes = case
            when personal_notes_old is not null and personal_notes_old != ''
                then jsonb_build_array(jsonb_build_object('date', current_date, 'note', personal_notes_old))
            else '[]'::jsonb
        end;
        alter table person drop column personal_notes_old;
    end if;
end $$;
