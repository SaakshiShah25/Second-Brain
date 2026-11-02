-- scripts/migration_38_task_options.sql - priority, reminder and own category for tasks (schema.sql section 38).
-- Paste into Supabase > SQL Editor > Run. Safe to run more than once.

-- 38. Task options (api/routers/tasks.py, push_notify.py): a priority the user sets (high / normal / low), a reminder date
--     (remind_on - a push at 9 AM that day; reminded_on remembers it was sent), and the task's own category
--     (initiative_id), so a task can be moved to another category without moving the note it came from. Existing tasks
--     take their note's category. Safe to run more than once. Until it has been run, tasks still list and save
--     as before; changing priority, reminder or category says to run this first.
alter table task add column if not exists priority text not null default 'normal';
alter table task add column if not exists remind_on date;
alter table task add column if not exists reminded_on date;
alter table task add column if not exists initiative_id bigint references initiative(id) on delete set null;
update task set initiative_id = interaction.initiative_id
  from interaction
  where task.interaction_id = interaction.id and task.initiative_id is null and interaction.initiative_id is not null;
create index if not exists task_initiative_idx on task (initiative_id);
create index if not exists task_remind_on_idx on task (remind_on) where remind_on is not null;
notify pgrst, 'reload schema';
