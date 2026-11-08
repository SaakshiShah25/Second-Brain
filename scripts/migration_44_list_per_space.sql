-- scripts/migration_44_list_per_space.sql - a list belongs to ONE space (schema.sql section 44).
-- Paste into Supabase > SQL Editor > Run. Safe to run more than once.
-- Run migration_43_list_space.sql first (this uses item_list.initiative_id).

-- 44. Until now "Reading list" was one list for the whole account, with entries from several spaces. Now each space has
--     its own lists: the same name can exist in two spaces. This
--       1. makes a list's name unique per space (not per account),
--       2. gives every list a space (the one most of its entries are in, if it had none),
--       3. splits a list that holds entries from other spaces: each of those spaces gets its own list of the same
--          name, and the entries move onto it, and
--       4. puts the entries that had no space into their list's space.
--     Nothing is deleted. Entries keep their wording, dates and ticks.
drop index if exists item_list_user_lower_name_idx;
create unique index if not exists item_list_user_space_name_idx on item_list (user_id, coalesce(initiative_id, 0), lower(name));

do $$
declare
    l record;
    x record;
    home bigint;
    copy_id bigint;
begin
    for l in select * from item_list loop
        home := l.initiative_id;
        if home is null then
            select t.initiative_id into home from task t
            where t.list_id = l.id and t.initiative_id is not null
            group by t.initiative_id order by count(*) desc, t.initiative_id limit 1;
            if home is not null then
                update item_list set initiative_id = home where id = l.id;
            end if;
        end if;

        -- entries filed under another space move to that space's own list of the same name
        for x in select distinct t.initiative_id as space from task t
                 where t.list_id = l.id and t.initiative_id is not null and t.initiative_id is distinct from home loop
            select id into copy_id from item_list
            where user_id = l.user_id and initiative_id = x.space and lower(name) = lower(l.name);
            if copy_id is null then
                insert into item_list (user_id, name, emoji, initiative_id)
                values (l.user_id, l.name, l.emoji, x.space) returning id into copy_id;
            end if;
            update task set list_id = copy_id where list_id = l.id and initiative_id = x.space;
        end loop;

        -- entries with no space of their own live where their list lives
        if home is not null then
            update task set initiative_id = home where list_id = l.id and initiative_id is null;
        end if;
    end loop;
end $$;
notify pgrst, 'reload schema';
