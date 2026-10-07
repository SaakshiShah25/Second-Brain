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
--
-- REMOVED as a feature (redundant once notes are already sorted into
-- user-managed initiatives) - extraction.py no longer asks the LLM for
-- it, nothing writes it going forward, and the UI no longer reads or
-- edits it. Column kept, not dropped, same as the client/contract tables
-- above - existing rows already tagged aren't destroyed, just no longer
-- shown.
alter table interaction add column if not exists meeting_type text default '';

-- interaction.decisions: settled outcomes reached in the meeting,
-- distinct from the task table's still-open follow-ups.
alter table interaction add column if not exists decisions jsonb default '[]'::jsonb;

-- interaction.concerns: specific objections/hesitations raised, distinct
-- from the general topic-level `sentiment` column.
alter table interaction add column if not exists concerns jsonb default '[]'::jsonb;

-- 15. Phase 10: Clients dashboard. REMOVED from the app (frontend pages,
--     api/routers/clients.py, document_extract.py, and storage.py are all
--     deleted) - these two tables are deliberately left here rather than
--     dropped, so any contract data already saved isn't destroyed; they're
--     just dormant now. Original comment, kept for context: once a deal
--     closed, the finalized agreement (PDF/.docx/scanned photo) was
--     uploaded, structured into these fields, and the original file kept
--     in Supabase Storage - client.document_path was a storage path, not
--     the file itself, served back out via a short-lived signed URL.

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

-- 17. Switch embeddings from local sentence-transformers (384-dim,
--     all-MiniLM-L6-v2) to Cohere's hosted embed-english-v3.0 API
--     (1024-dim) - see embeddings.py. Running the local model in-process
--     was OOM-crashing the deployed backend on Render's free tier
--     (confirmed live: crashed mid-request, every time, computing an
--     embedding). A hosted API call has no local memory footprint.
--
-- All existing data is wiped here rather than migrated - the old 384-dim
-- embeddings are incompatible with the new 1024-dim column regardless
-- (there's no way to "convert" a vector from one model's space to
-- another's), and this is explicitly a clean-slate reset before testing
-- the new setup, not a preserve-old-data migration.
truncate table client_signatory, client, interaction_person, task, interaction, person
    restart identity cascade;

drop function if exists match_interactions(vector(384), int, bigint, uuid);

alter table interaction alter column embedding type vector(1024);

drop index if exists interaction_embedding_idx;
create index interaction_embedding_idx
    on interaction using ivfflat (embedding vector_cosine_ops)
    with (lists = 100);

create or replace function match_interactions (
    query_embedding vector(1024),
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

-- 18. Per-account settings (theme/font-size preference, Terms of Service
--     acceptance) - one row per user, created on first read by
--     db.get_user_preference(). Kept server-side (not just localStorage)
--     so a preference/acceptance made on the web app also applies on the
--     Android app, since both point at the same account.
create table if not exists user_preference (
    user_id uuid primary key references auth.users(id) on delete cascade,
    theme text not null default 'dark',        -- 'dark' | 'light'
    font_size text not null default 'default', -- 'small' | 'default' | 'large'
    terms_accepted_at timestamptz,             -- null until the user accepts the Terms gate
    updated_at timestamptz not null default now()
);

-- 19. Opt-OUT flag for the scheduled daily-brief email (see
--     api/routers/brief.py's POST /send-daily-emails, run on a schedule
--     by .github/workflows/morning-brief.yml). Defaults to true - the
--     whole point of a daily brief is that it reaches you whether or not
--     you open the app that day, so it should arrive automatically
--     unless someone turns it off, not sit dormant until they discover
--     an opt-in toggle in Settings. The "Send now" button on the Digest
--     page is a separate, explicit per-click resend and is unaffected by
--     this flag either way.
alter table user_preference add column if not exists daily_brief_email_enabled boolean not null default true;

-- 20. Phase 11: Notes / Initiatives. A note (interaction) no longer has
--     to be about a specific person - it can be a standalone idea/
--     reminder (person_id now nullable). Notes can also be classified
--     into a user-managed "initiative" (Tenaxis AI, Personal, Job,
--     Fitness, etc.) - a per-NOTE category, distinct from person.tags
--     (which tags a PERSON, e.g. "client"/"friend").

alter table interaction alter column person_id drop not null;

create table if not exists initiative (
    id bigint generated always as identity primary key,
    user_id uuid not null references auth.users(id) on delete cascade,
    name text not null,
    color text,                              -- optional hex, nullable - no v1 color-picker UI
    created_at timestamptz not null default now()
);

create unique index if not exists initiative_user_id_lower_name_idx
    on initiative (user_id, lower(name));

alter table initiative enable row level security;
drop policy if exists "Users manage their own initiatives" on initiative;
create policy "Users manage their own initiatives" on initiative
    for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ON DELETE SET NULL - deleting an initiative un-categorizes its notes
-- rather than destroying them or blocking the delete.
alter table interaction add column if not exists initiative_id
    bigint references initiative(id) on delete set null;

-- 21. A follow-up task can be about someone OTHER than the interaction's
--     primary person (e.g. a note about a meeting with two people, where
--     the follow-up is specifically for the secondary one) - task.person_id
--     lets a task carry its own specific person instead of always
--     inheriting the interaction's primary person for display. Nullable
--     and ON DELETE SET NULL: null means "use the interaction's primary
--     person" (the existing/default behavior, and what every pre-existing
--     task already implicitly does), not an error state.
alter table task add column if not exists person_id
    bigint references person(id) on delete set null;

-- 22. Encrypt-at-rest for note/person/task content (see crypto_utils.py
--     and db.py's _encrypt_fields()/_decrypt_row()). The app-level key
--     (ENCRYPTION_KEY) encrypts before every write and decrypts after
--     every read - this DDL alone does NOT encrypt any existing data.
--     Existing rows are migrated by the one-off
--     scripts/encrypt_existing_data.py, run once after ENCRYPTION_KEY is
--     in place. No column-type changes needed here: jsonb happily stores
--     a scalar string (a Fernet ciphertext token is just base64 text,
--     and `"a-string"` is valid JSON), so sentiment/topics/
--     extracted_facts/decisions/concerns/personal_notes stay jsonb -
--     confirmed live against production before writing this migration.
--
--     NOT encrypted, deliberately: person.name/aliases/role/company/
--     phone/email/tags and initiative.name - these are used for actual
--     server-side matching (candidate resolution during capture, ilike
--     company grouping, alias lookup) and encrypting them would break
--     that matching.

-- Onboarding tour "seen it" flag - same shape/reasoning as
-- user_preference.terms_accepted_at (section 18): stored server-side,
-- not localStorage, so it follows the account across the web app and
-- the Android app rather than needing to be re-shown on each. Null
-- until the user finishes or skips the tour (see
-- POST /api/settings/complete-tour); both finishing and skipping set it
-- the same way, since there's no separate "explicitly skipped" state to
-- track - either way, don't auto-show it again.
alter table user_preference add column if not exists tour_completed_at timestamptz;

-- 23. The `client`/`client_signatory` tables (section 15) were kept
--     dormant, not dropped, when the Clients/Contracts feature itself
--     was removed from the app - purely so any contract data already
--     saved at the time wasn't destroyed. Confirmed empty (0 rows in
--     both, already truncated back when the feature was removed) and no
--     application code references them anymore (db.py has no
--     client/client_signatory functions at all). Safe to actually drop
--     now - uncomment and run these two lines yourself when ready
--     (left commented rather than run automatically, since dropping a
--     table is irreversible and this file's other statements are all
--     deliberately non-destructive create/alter-if-not-exists):
-- drop table if exists client_signatory;
-- drop table if exists client;

-- 24. Free/premium subscriptions (see entitlements.py). Kept as its own
--     table rather than more columns on user_preference - this maps
--     directly onto a payment provider's own webhook events
--     (checkout completed / subscription updated / canceled), so it's
--     natural for a webhook handler to upsert this whole row wholesale
--     without touching unrelated UI settings. `tier` is the source of
--     truth entitlements.py reads; the provider fields exist so a
--     webhook can find the right row and so support can look up "what
--     did this user actually pay for" without leaving this table.
create table if not exists subscription (
    user_id uuid primary key references auth.users(id) on delete cascade,
    tier text not null default 'free',              -- 'free' | 'premium'
    status text not null default 'active',          -- 'active' | 'canceled' | 'past_due'
    provider text,                                   -- e.g. 'stripe' - null while still on free
    provider_customer_id text,
    provider_subscription_id text,
    current_period_end timestamptz,                  -- premium access is honored through this date
                                                       -- even after cancellation (paid-through period)
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);

-- Monthly usage counters for free-tier metering (see entitlements.py's
-- check_and_increment()). One row per (user, resource, calendar month) -
-- `period` is the month's first day (e.g. '2026-09-01'), so "this
-- month's count" is always a single-row lookup, and old rows are just
-- inert history (nothing needs to actively reset them at month-end).
create table if not exists usage_counter (
    user_id uuid not null references auth.users(id) on delete cascade,
    resource text not null,      -- e.g. 'interactions_logged', 'ai_questions_asked'
    period date not null,        -- first day of the calendar month this count applies to
    count integer not null default 0,
    primary key (user_id, resource, period)
);

-- Atomic "insert or +1" for usage_counter, called via
-- supabase.rpc("increment_usage_counter", {...}) from db.increment_usage().
-- Needed because two concurrent requests each doing a Python-side
-- read-then-write (get count, add 1, write) could both read the same
-- starting value and one increment would be lost - `on conflict ... do
-- update` pushes the read-modify-write into a single atomic statement
-- instead.
create or replace function increment_usage_counter (
    p_user_id uuid,
    p_resource text,
    p_period date
)
returns integer
language sql
as $$
    insert into usage_counter (user_id, resource, period, count)
    values (p_user_id, p_resource, p_period, 1)
    on conflict (user_id, resource, period)
    do update set count = usage_counter.count + 1
    returning count;
$$;

-- 25. RLS on user_preference/subscription/usage_counter - found missing
--     during a security review. Every other user-owned table already has
--     this (person/interaction/task/etc., section 8; google_credentials/
--     oauth_state, section 14) - these three were added in later phases
--     (settings, Phase 12 daily brief opt-out, billing) and each missed
--     it. Today's actual exposure is limited (the app's own backend
--     always queries these with its service-role key, which bypasses RLS
--     entirely, and the frontend never talks to Supabase directly) - but
--     RLS is exactly the defense-in-depth layer meant to catch a FUTURE
--     mistake (a direct client-side Supabase call, a new endpoint that
--     forgets to scope by user_id, a bug), and subscription/usage_counter
--     specifically gate billing/entitlements, so leaving them as the only
--     unprotected tables was worth closing rather than leaving as a
--     silent exception to the rule every other table follows.
alter table user_preference enable row level security;
alter table subscription enable row level security;
alter table usage_counter enable row level security;

drop policy if exists "Users manage their own preferences" on user_preference;
create policy "Users manage their own preferences" on user_preference
    for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users manage their own subscription" on subscription;
create policy "Users manage their own subscription" on subscription
    for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users manage their own usage" on usage_counter;
create policy "Users manage their own usage" on usage_counter
    for all using (auth.uid() = user_id) with check (auth.uid() = user_id);


-- 26. In-app reporting of AI-generated content. Google Play's AI-Generated
--     Content policy requires an in-app way for users to flag offensive or
--     inaccurate AI output; each report stores the question, the AI's
--     answer, and the user's reason so it can actually be reviewed. The
--     question/answer/details are encrypted at rest by db.py exactly like
--     note content (they quote the user's private notes), the ids of the
--     source notes aren't (ids only, no content). Reviewed by the
--     maintainer through db.list_reports(), never through the API.
create table if not exists ai_report (
    id bigint generated always as identity primary key,
    user_id uuid not null references auth.users(id) on delete cascade,
    kind text not null default 'answer',     -- 'answer' | 'capture'
    reason text not null,                      -- 'incorrect' | 'offensive' | 'irrelevant' | 'other'
    details text,                              -- optional free text from the user (encrypted)
    question text,                             -- what the user asked/logged (encrypted)
    answer text,                               -- what the AI replied (encrypted)
    source_interaction_ids jsonb not null default '[]'::jsonb,
    status text not null default 'open',       -- 'open' | 'reviewed'
    created_at timestamptz not null default now()
);

create index if not exists ai_report_status_created_idx on ai_report (status, created_at desc);

alter table ai_report enable row level security;

-- A user can file and see their own reports; nobody can edit or delete
-- them from the client side (the maintainer's review flow uses the
-- service role, which bypasses RLS).
drop policy if exists "Users file their own reports" on ai_report;
create policy "Users file their own reports" on ai_report
    for insert with check (auth.uid() = user_id);

drop policy if exists "Users read their own reports" on ai_report;
create policy "Users read their own reports" on ai_report
    for select using (auth.uid() = user_id);


-- 27. Drop the approximate (ivfflat) vector index - it makes
--     match_interactions() return FEWER results than exist, sometimes none.
--     Found while testing a real account: all 8 of its notes had embeddings,
--     an exact cosine calculation ranked the right notes at the top, yet
--     match_interactions() returned an empty list. Two causes, both inherent
--     to ivfflat: (1) `lists = 100` on a table with a handful of rows leaves
--     almost every list empty, and a query only scans one list by default;
--     (2) the index finds nearest neighbors across EVERY user's notes first
--     and the user_id filter is applied afterwards, so for any one user most
--     of the candidates get thrown away - worse as more people sign up.
--     Without it, Postgres uses interaction_user_id_idx to narrow to one
--     user's rows and sorts them by exact distance: always correct, and
--     plenty fast for the hundreds-to-thousands of notes one person writes.
--     Revisit (e.g. a partitioned or HNSW index with iterative scans) only if
--     a single user ever has hundreds of thousands of notes.
drop index if exists interaction_embedding_idx;


-- 28. Important dates (birthdays, anniversaries) on a person's profile - a
--     list of {"label","month","day","year"} entries (see important_dates.py).
--     Stored as encrypted JSON text like personal_notes: a birthday is
--     personal data, and db.py's _ENCRYPTED_JSON_FIELDS handles it the same
--     way. Capture is best-effort about this column - a note still saves
--     before this migration is run, it just won't record the dates.
alter table person add column if not exists important_dates text default '[]';


-- 29. Make the vector search impossible to run without a user filter.
--     match_interactions() used `filter_user_id is null or user_id = ...`,
--     i.e. passing NULL meant "search EVERYONE's notes" - and the function
--     was callable by any signed-in user through Supabase's public REST API
--     (RLS would still have filtered a signed-in caller, but the service-role
--     key the backend uses bypasses RLS, so one missing user id in backend
--     code would have searched every account). Now:
--       * filter_user_id is required and always applied: NULL matches no rows;
--       * the user filter runs in the WHERE clause (served by
--         interaction_user_id_idx) BEFORE the nearest-neighbour ordering and
--         LIMIT, so only that user's vectors are ever scored;
--       * only the backend (service_role) can execute it at all.
drop function if exists match_interactions(vector, int, bigint, uuid);

create or replace function match_interactions (
    query_embedding vector(1024),
    filter_user_id uuid,
    match_count int default 5,
    filter_person_id bigint default null
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
security invoker
as $$
    select
        interaction.id,
        interaction.person_id,
        interaction.raw_text,
        interaction.date,
        interaction.summary,
        1 - (interaction.embedding <=> query_embedding) as similarity
    from interaction
    where interaction.user_id = filter_user_id
      and interaction.embedding is not null
      and (filter_person_id is null or interaction.person_id = filter_person_id)
    order by interaction.embedding <=> query_embedding
    limit least(match_count, 50);
$$;

revoke execute on function match_interactions(vector, uuid, int, bigint) from public, anon, authenticated;
grant execute on function match_interactions(vector, uuid, int, bigint) to service_role;
