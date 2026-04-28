-- Seed the new `meditation_10min` template for users who already have
-- daily_task_templates rows. The DEFAULT_TEMPLATES seeding logic in
-- app/api/daily-tasks/templates/route.ts only fires when a user has zero
-- templates (or is on the legacy id set), so existing users won't pick this
-- up automatically — this migration backfills.
--
-- Idempotent: NOT EXISTS guard skips users who already added it manually.
-- Single-user use: only inserts for users that already have *some* templates,
-- so we don't accidentally seed accounts that haven't initialized yet.

-- Drop the legacy CHECK constraint on daily_tasks.task_key if it's still
-- there. The original daily_tasks.sql hardcoded an enum-like list that
-- didn't include meditation_10min, so manual ticks would fail silently
-- with a DB error and the optimistic UI would revert on reload. The
-- daily_tasks_flexible_key.sql migration removes it; doing it again here
-- is a no-op when already dropped, but ensures users who only ran this
-- seed file don't get stuck.
alter table public.daily_tasks drop constraint if exists daily_tasks_task_key_check;

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
