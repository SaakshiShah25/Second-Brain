-- scripts/pending_migration.sql — schema changes not yet applied to the
-- Supabase database (schema.sql sections 28-29). Applied automatically by
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

create table if not exists entity_edge (
    id bigint generated always as identity primary key,
    user_id uuid not null references auth.users(id) on delete cascade,
    src_type text not null,              -- person | organization | document | interaction
    src_id bigint not null,
    rel text not null,                   -- works_at | family | colleague | friend | related_to | belongs_to
    dst_type text not null,
    dst_id bigint not null,
    label text,                          -- encrypted: the words used ("Priya's sister", "VP Operations")
    source_type text,                    -- interaction | document | manual | backfill
    source_id bigint,
    valid_from date,
    valid_to date,                       -- null = current
    created_at timestamptz not null default now(),
    unique (user_id, src_type, src_id, rel, dst_type, dst_id)
);
create index if not exists entity_edge_src_idx on entity_edge (user_id, src_type, src_id);
create index if not exists entity_edge_dst_idx on entity_edge (user_id, dst_type, dst_id);

create table if not exists fact (
    id bigint generated always as identity primary key,
    user_id uuid not null references auth.users(id) on delete cascade,
    entity_type text not null,           -- person | organization | document
    entity_id bigint not null,
    attribute text not null,             -- role | company | phone | email | personal | trait | relation_to_me
    value text not null,                 -- encrypted
    source_type text,                    -- interaction | document | manual | backfill
    source_id bigint,
    observed_on date,
    superseded_by bigint references fact(id) on delete set null,
    superseded_on date,
    created_at timestamptz not null default now()
);
create index if not exists fact_entity_idx on fact (user_id, entity_type, entity_id);

alter table organization enable row level security;
alter table entity_edge enable row level security;
alter table fact enable row level security;
drop policy if exists "Users manage their own organizations" on organization;
create policy "Users manage their own organizations" on organization
    for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "Users manage their own edges" on entity_edge;
create policy "Users manage their own edges" on entity_edge
    for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "Users manage their own facts" on fact;
create policy "Users manage their own facts" on fact
    for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
