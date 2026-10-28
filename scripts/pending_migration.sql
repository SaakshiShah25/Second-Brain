-- scripts/pending_migration.sql — schema changes not yet applied to the
-- Supabase database (schema.sql sections 28-33). Applied automatically by
-- scripts/apply_migration.py when DATABASE_URL is set in .env, or paste this
-- whole file into Supabase > SQL Editor > Run. Safe to run more than once.

-- 28. Unified retrieval index (search_index.py) - ONE searchable layer over
--     every source, used by the retrieval agent (agent.py). Each row is a
--     "chunk": a short, self-contained text for one entity (a note, a task,
--     a person's profile card, a document) plus filterable metadata.
--     DERIVED data: rebuilt from the source tables at any time
--     (scripts/reindex_search.py), and refreshed automatically after every
--     write, so it can never become the source of truth.
--     `text` is Fernet-encrypted like all other content - keyword (BM25)
--     scoring therefore runs in Python after decryption (personal scale);
--     vector similarity runs in SQL via match_search_chunks() below.
create table if not exists search_chunk (
    id bigint generated always as identity primary key,
    user_id uuid not null references auth.users(id) on delete cascade,
    kind text not null,                  -- note | task | person | document
    entity_id bigint not null,           -- id in the source table for `kind`
    title text,                          -- encrypted, short label for citations
    text text not null,                  -- encrypted, what gets searched / shown to the agent
    embedding vector(1024),
    item_date date,                      -- note date / task due / doc created
    person_ids bigint[] not null default '{}',
    initiative_id bigint,
    meta jsonb not null default '{}',    -- non-sensitive extras (status, owner, category)
    updated_at timestamptz not null default now(),
    unique (user_id, kind, entity_id)
);

create index if not exists search_chunk_user_kind_idx on search_chunk (user_id, kind);
create index if not exists search_chunk_embedding_idx
    on search_chunk using hnsw (embedding vector_cosine_ops);

alter table search_chunk enable row level security;
drop policy if exists "Users manage their own search chunks" on search_chunk;
create policy "Users manage their own search chunks" on search_chunk
    for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create or replace function match_search_chunks (
    query_embedding vector(1024),
    filter_user_id uuid,
    match_count int default 40,
    filter_kinds text[] default null,
    filter_person_id bigint default null,
    filter_initiative_id bigint default null,
    date_from date default null,
    date_to date default null
)
returns table (id bigint, kind text, entity_id bigint, similarity float)
language sql stable
as $$
    select c.id, c.kind, c.entity_id, 1 - (c.embedding <=> query_embedding) as similarity
    from search_chunk c
    where c.user_id = filter_user_id
      and c.embedding is not null
      and (filter_kinds is null or c.kind = any(filter_kinds))
      and (filter_person_id is null or filter_person_id = any(c.person_ids))
      and (filter_initiative_id is null or c.initiative_id = filter_initiative_id)
      and (date_from is null or c.item_date >= date_from)
      and (date_to is null or c.item_date <= date_to)
    order by c.embedding <=> query_embedding
    limit match_count;
$$;

-- 29. Knowledge graph + facts (graph.py). Derived deterministically from what
--     note extraction / filing already returns - no extra LLM calls.
--     (entity_edge and fact, first defined here, are now relationship and
--     person_fact - see section 31, which also upgrades a database that
--     already has the old names.)
--     organization: companies as real records, matched case- and
--       suffix-insensitively via name_key ("Northwind Pvt Ltd" = "northwind").
--     entity_edge: typed links between entities - person works_at
--       organization (with valid_from/valid_to, so job changes keep
--       history), person family/colleague/friend/related_to person (label
--       keeps the words used, e.g. "Priya's sister"), document belongs_to
--       person/organization. Polymorphic (type + id), so deletes/merges are
--       handled in graph.py rather than by foreign keys.
--     fact: one attribute value about one entity, with provenance (which
--       note/document/edit it came from), when it was observed, and
--       supersession: a new role/company/phone never overwrites the old one,
--       it supersedes it - so "where did Priya work before?" is answerable.
create table if not exists organization (
    id bigint generated always as identity primary key,
    user_id uuid not null references auth.users(id) on delete cascade,
    name text not null,
    name_key text not null,
    created_at timestamptz not null default now(),
    unique (user_id, name_key)
);

alter table organization enable row level security;
drop policy if exists "Users manage their own organizations" on organization;
create policy "Users manage their own organizations" on organization
    for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 30. Daily brief cache (morning_brief.py). The brief used to be re-written
--     by the LLM on every visit to the Today tab, so its wording changed
--     each time and each visit cost a model call. Now one brief is kept
--     per user per day, and reused as long as the facts it was written
--     from (tasks, calendar, quiet contacts) haven't changed - the
--     `fingerprint`. The in-app view, the "Email" button and the morning
--     cron therefore all show the same text. `brief` is encrypted like
--     every other content field. Safe to run more than once.
create table if not exists daily_brief (
    user_id uuid not null references auth.users(id) on delete cascade,
    brief_date date not null,
    fingerprint text not null,
    brief text not null,                 -- encrypted
    created_at timestamptz not null default now(),
    primary key (user_id, brief_date)
);
alter table daily_brief enable row level security;
drop policy if exists "Users read their own daily brief" on daily_brief;
create policy "Users read their own daily brief" on daily_brief
    for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 31. Memory layer: person_fact, relationship, key_date (graph.py,
--     memory_schema.py). What the app REMEMBERS about people, in typed rows
--     that can be filtered and joined - not one free-text blob per person.
--     person_fact   one attribute value about a person (likes, hobby, diet,
--                   lives_in, role, ...), about themself or a relative
--                   (subject = self | spouse | child | parent | ...). Old
--                   values are superseded, never overwritten, so history
--                   stays answerable. `value` is encrypted; `value_norm` is
--                   a plain lower-case copy kept ONLY for non-sensitive
--                   attributes, so "which friends are vegetarian" is a query;
--                   sensitive ones (health) are flagged and get no plain copy.
--     relationship  who is linked to whom (person - person, person works_at
--                   organization, document belongs_to person). `rel_type`
--                   says what src IS to dst (spouse | parent | child |
--                   sibling | relative | friend | colleague | other); the
--                   inverse is worked out in code, not stored twice.
--     key_date      recurring dates: birthday, anniversary, custom. Month
--                   and day are plain columns so "whose birthday is next
--                   month" is a query; label and names are encrypted. A
--                   month with no day is allowed ("turns 5 in June").
--     person_fact and relationship were first created as `fact` and
--     `entity_edge` (section 29, first version): a database that has those
--     gets them renamed and extended in place, keeping every row. Safe to
--     run more than once.

do $$
begin
    if to_regclass('public.fact') is not null and to_regclass('public.person_fact') is null then
        alter table fact rename to person_fact;
    end if;
    if to_regclass('public.entity_edge') is not null and to_regclass('public.relationship') is null then
        alter table entity_edge rename to relationship;
    end if;
end $$;

create table if not exists person_fact (
    id bigint generated always as identity primary key,
    user_id uuid not null references auth.users(id) on delete cascade,
    person_id bigint not null references person(id) on delete cascade,
    attribute text not null,             -- likes | dislikes | hobby | diet | lives_in | role | company | ... (memory_schema.py)
    subject text not null default 'self',-- self | spouse | child | parent | sibling | pet | other
    subject_name text,                   -- encrypted: "Anya" when the fact is about a relative
    value text not null,                 -- encrypted
    value_norm text,                     -- plain, lower-case; NULL for sensitive attributes
    confidence text not null default 'stated',   -- stated | likely (hearsay)
    is_sensitive boolean not null default false,
    source_type text,                    -- interaction | document | manual | backfill
    source_id bigint,
    observed_on date,                    -- when the app learned it
    valid_to date,                       -- when it stopped being true / was replaced
    superseded_by bigint references person_fact(id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- Bring a renamed `fact` table up to the same shape.
do $$
begin
    if exists (select 1 from information_schema.columns
               where table_schema = 'public' and table_name = 'person_fact' and column_name = 'entity_id') then
        delete from person_fact where entity_type <> 'person';
        alter table person_fact rename column entity_id to person_id;
        alter table person_fact drop column entity_type;
    end if;
    if exists (select 1 from information_schema.columns
               where table_schema = 'public' and table_name = 'person_fact' and column_name = 'superseded_on') then
        alter table person_fact rename column superseded_on to valid_to;
    end if;
end $$;
alter table person_fact add column if not exists subject text not null default 'self';
alter table person_fact add column if not exists subject_name text;
alter table person_fact add column if not exists value_norm text;
alter table person_fact add column if not exists confidence text not null default 'stated';
alter table person_fact add column if not exists is_sensitive boolean not null default false;
alter table person_fact add column if not exists updated_at timestamptz not null default now();
delete from person_fact where person_id not in (select id from person);
do $$
begin
    if not exists (select 1 from pg_constraint
                   where conrelid = 'public.person_fact'::regclass and confrelid = 'public.person'::regclass) then
        alter table person_fact add constraint person_fact_person_fk
            foreign key (person_id) references person(id) on delete cascade;
    end if;
end $$;
drop index if exists fact_entity_idx;
create index if not exists person_fact_person_idx on person_fact (user_id, person_id);
create index if not exists person_fact_attr_idx on person_fact (user_id, attribute, value_norm);

create table if not exists relationship (
    id bigint generated always as identity primary key,
    user_id uuid not null references auth.users(id) on delete cascade,
    src_type text not null,              -- person | organization | document | interaction
    src_id bigint not null,
    rel text not null,                   -- works_at | family | colleague | friend | related_to | belongs_to
    dst_type text not null,
    dst_id bigint not null,
    rel_type text,                       -- what src IS to dst: spouse | parent | child | sibling | relative | friend | colleague | other
    label text,                          -- encrypted: the words used ("Priya's sister", "VP Operations")
    source_type text,                    -- interaction | document | manual | backfill
    source_id bigint,
    valid_from date,
    valid_to date,                       -- null = current
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (user_id, src_type, src_id, rel, dst_type, dst_id)
);
alter table relationship add column if not exists rel_type text;
alter table relationship add column if not exists updated_at timestamptz not null default now();
drop index if exists entity_edge_src_idx;
drop index if exists entity_edge_dst_idx;
create index if not exists relationship_src_idx on relationship (user_id, src_type, src_id);
create index if not exists relationship_dst_idx on relationship (user_id, dst_type, dst_id);

create table if not exists key_date (
    id bigint generated always as identity primary key,
    user_id uuid not null references auth.users(id) on delete cascade,
    person_id bigint not null references person(id) on delete cascade,
    date_type text not null check (date_type in ('birthday', 'anniversary', 'custom')),
    label text,                          -- encrypted: "Birthday", "Wedding anniversary", "Son's annual day"
    subject text not null default 'self',-- whose date: self | spouse | child | parent | sibling | other
    subject_name text,                   -- encrypted: "Anya"
    month smallint not null check (month between 1 and 12),
    day smallint check (day between 1 and 31),   -- null = month known, day not
    year smallint check (year between 1900 and 2100),   -- birth year / wedding year, only when stated
    remind_days_before smallint,
    source_type text,                    -- interaction | manual | backfill
    source_id bigint,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);
create index if not exists key_date_person_idx on key_date (user_id, person_id);
create index if not exists key_date_month_day_idx on key_date (user_id, month, day);

alter table person_fact enable row level security;
alter table relationship enable row level security;
alter table key_date enable row level security;
drop policy if exists "Users manage their own facts" on person_fact;
drop policy if exists "Users manage their own person facts" on person_fact;
create policy "Users manage their own person facts" on person_fact
    for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "Users manage their own edges" on relationship;
drop policy if exists "Users manage their own relationships" on relationship;
create policy "Users manage their own relationships" on relationship
    for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "Users manage their own key dates" on key_date;
create policy "Users manage their own key dates" on key_date
    for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 32. A task's deadline can carry a time of day ("finish the project by 7pm").
--     due_time is null for the usual date-only deadline. Safe to run more than once.
alter table task add column if not exists due_time time;

-- Make the API see the new tables straight away.
notify pgrst, 'reload schema';

-- 33. Web Push subscriptions (push_notify.py) - one row per browser/device that turned on
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
