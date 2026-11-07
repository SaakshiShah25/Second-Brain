-- scripts/migration_43_admin_storage.sql — per-user storage totals for the admin page
-- (schema.sql section 43). Paste into Supabase > SQL Editor > Run. Safe to run more than once.
--
-- Returns ONLY counts and byte sizes per user - never any note/task/document text. Sizes are
-- of the stored (encrypted) values, i.e. what actually takes space. Only the backend's service
-- key can call it; anon/authenticated users cannot.
create or replace function admin_storage_by_user()
returns table (
    user_id uuid,
    notes bigint, note_bytes bigint,
    tasks bigint, task_bytes bigint,
    documents bigint, document_bytes bigint,
    index_chunks bigint, index_bytes bigint
)
language sql
security definer
set search_path = public
as $$
    with u as (
        select user_id from interaction where user_id is not null
        union select user_id from task where user_id is not null
        union select user_id from document
        union select user_id from search_chunk
    )
    select
        u.user_id,
        (select count(*) from interaction i where i.user_id = u.user_id),
        (select coalesce(sum(octet_length(i.raw_text)), 0) from interaction i where i.user_id = u.user_id),
        (select count(*) from task t where t.user_id = u.user_id),
        (select coalesce(sum(octet_length(t.description)), 0) from task t where t.user_id = u.user_id),
        (select count(*) from document d where d.user_id = u.user_id),
        (select coalesce(sum(d.size_bytes), 0) from document d where d.user_id = u.user_id),
        (select count(*) from search_chunk c where c.user_id = u.user_id),
        (select coalesce(sum(octet_length(c.text)), 0) from search_chunk c where c.user_id = u.user_id)
    from u;
$$;

revoke all on function admin_storage_by_user() from public, anon, authenticated;
grant execute on function admin_storage_by_user() to service_role;
notify pgrst, 'reload schema';
