-- scripts/migration_43_list_space.sql - a home space for a list (schema.sql section 43).
-- Paste into Supabase > SQL Editor > Run. Safe to run more than once.
-- Run scripts/migration_40_lists.sql first (this extends the item_list table it creates).

-- 43. "Create a reading list in Personal": a list (label) can now say which space it lives in. New entries added
--     to it without a space of their own go there, and the space's page shows the label even before it holds
--     anything. Null = no home yet (it shows under Others, and takes the space of its first entry as before).
--     Deleting the space just clears this (the list stays). Until it has run, lists work as before.
alter table item_list add column if not exists initiative_id bigint references initiative(id) on delete set null;
notify pgrst, 'reload schema';
