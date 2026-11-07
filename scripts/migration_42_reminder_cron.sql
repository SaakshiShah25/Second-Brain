-- scripts/migration_42_reminder_cron.sql — Runs the reminder job from Supabase every minute
-- (schema.sql section 42), replacing the half-hourly GitHub Actions schedule.
--
-- Before running: replace the two placeholders below with
--   * the deployed backend's base URL (e.g. https://second-brain-api-ot22.onrender.com)
--   * the CRON_SECRET value ALREADY set on Render (the same one the GitHub secret holds) - don't make a new one,
--     or the daily report and the manual workflow stop matching Render.
-- Then paste the file into Supabase > SQL Editor > Run. Don't commit the filled-in copy.
-- Both values are kept in Supabase Vault, not in the job text. Safe to run more than once.
--
-- Check it's working:  select * from cron.job_run_details order by start_time desc limit 5;
--                      select status_code, content from net._http_response order by created desc limit 5;
-- Stop it:             select cron.unschedule('send-reminders');

create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
declare
    v_url text := 'https://YOUR-BACKEND.onrender.com';   -- <- replace
    v_secret text := 'YOUR-CRON-SECRET';                  -- <- replace
    v_id uuid;
begin
    select id into v_id from vault.secrets where name = 'reminders_api_url';
    if v_id is null then perform vault.create_secret(v_url, 'reminders_api_url');
    else perform vault.update_secret(v_id, v_url); end if;

    select id into v_id from vault.secrets where name = 'reminders_cron_secret';
    if v_id is null then perform vault.create_secret(v_secret, 'reminders_cron_secret');
    else perform vault.update_secret(v_id, v_secret); end if;
end $$;

-- Scheduling under an existing name replaces that job.
select cron.schedule('send-reminders', '* * * * *', $job$
    select net.http_post(
        url := (select decrypted_secret from vault.decrypted_secrets where name = 'reminders_api_url')
               || '/api/push/send-due',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'X-Cron-Secret', (select decrypted_secret from vault.decrypted_secrets where name = 'reminders_cron_secret')),
        body := '{}'::jsonb,
        timeout_milliseconds := 30000
    );
$job$);
