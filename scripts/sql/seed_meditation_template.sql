-- Seed the new `meditation_10min` template for users who already have
-- daily_task_templates rows. The DEFAULT_TEMPLATES seeding logic in
-- app/api/daily-tasks/templates/route.ts only fires when a user has zero
-- templates (or is on the legacy id set), so existing users won't pick this
-- up automatically — this migration backfills.
--
-- Idempotent: NOT EXISTS guard skips users who already added it manually.
-- Single-user use: only inserts for users that already have *some* templates,
-- so we don't accidentally seed accounts that haven't initialized yet.

insert into public.daily_task_templates (user_id, id, label, href, sort_order)
select distinct
  t.user_id,
  'meditation_10min',
  '10 min meditation',
  '/',
  5
from public.daily_task_templates t
where not exists (
  select 1
  from public.daily_task_templates existing
  where existing.user_id = t.user_id
    and existing.id = 'meditation_10min'
);
