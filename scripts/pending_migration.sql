-- scripts/pending_migration.sql — schema changes not yet applied to the
-- Supabase database: Supabase dashboard > SQL Editor > New query > paste
-- this whole file > Run. Safe to run more than once.
-- (Sections 25-27 were applied on 2026-10-24; this is schema.sql section 28.)

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
