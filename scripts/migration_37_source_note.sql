-- scripts/migration_37_source_note.sql - links the notes of one message (schema.sql section 37).
-- Paste into Supabase > SQL Editor > Run. Safe to run more than once.

-- 37. One message, several initiatives (api/routers/capture.py): the notes made from one message are saved as one
--     note per initiative. The first holds the original text; the others point at it with source_id instead of
--     repeating it, and are deleted with it (on delete cascade, which also removes their tasks). Safe to run more
--     than once. Until it has been run, the app keeps the original text on every note, as before.
alter table interaction add column if not exists source_id bigint references interaction(id) on delete cascade;
create index if not exists interaction_source_idx on interaction (source_id);
notify pgrst, 'reload schema';
