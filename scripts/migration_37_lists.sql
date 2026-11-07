-- scripts/migration_37_lists.sql — Lists, repeating items and per-item reminders (schema.sql
-- section 37). Run it BEFORE deploying the backend that uses it:
--     .venv/bin/python scripts/apply_migration.py scripts/migration_37_lists.sql
-- or paste the whole file into Supabase > SQL Editor > Run. Safe to run more than once.

-- 37. Lists. Everything to do or keep track of is an item (a `task` row); a list is a named
--     pile of items - Movies, Books, Groceries, Birthdays, Routines. An item with no list is a
--     plain to-do in the main Tasks list. A list name is matched server-side when a capture
--     says "add X to my reading list", so (like initiative.name) it is not encrypted.
create table if not exists item_list (
    id bigint generated always as identity primary key,
    user_id uuid not null references auth.users(id) on delete cascade,
    name text not null,
    emoji text,
    position integer,
    created_at timestamptz not null default now()
);
create unique index if not exists item_list_user_lower_name_idx on item_list (user_id, lower(name));
alter table item_list enable row level security;
drop policy if exists "Users manage their own lists" on item_list;
create policy "Users manage their own lists" on item_list
    for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- An item no longer needs a note: "add Dune to my reading list" saves only the item.
--   list_id       - its list (null = the main Tasks list); deleting a list deletes its items
--   initiative_id - its category, set directly now that there may be no note to inherit it from
--   repeat        - null | daily | weekdays | weekly | monthly | yearly | hours:N
--   detail        - extra context kept with the item (encrypted, like description)
--   reminded_key  - the occurrence its push reminder was last sent for, so it is sent once
alter table task add column if not exists list_id bigint references item_list(id) on delete cascade;
alter table task add column if not exists initiative_id bigint references initiative(id) on delete set null;
alter table task add column if not exists repeat text;
alter table task add column if not exists detail text;
alter table task add column if not exists reminded_key text;
create index if not exists task_list_id_idx on task (list_id);

-- Existing tasks take their category from the note they came from.
update task t set initiative_id = i.initiative_id
from interaction i
where t.interaction_id = i.id and t.initiative_id is null and i.initiative_id is not null;

-- A "Shopping"/"Groceries" initiative was really a list: turn it into one, move its to-dos
-- across, and drop the initiative (its notes stay, uncategorized).
insert into item_list (user_id, name, emoji)
select user_id, name, '🛒' from initiative where lower(name) in ('shopping', 'groceries')
on conflict do nothing;
update task t set list_id = l.id, initiative_id = null
from initiative ini, item_list l
where t.initiative_id = ini.id and lower(ini.name) in ('shopping', 'groceries')
  and l.user_id = ini.user_id and lower(l.name) = lower(ini.name);
delete from initiative where lower(name) in ('shopping', 'groceries');
