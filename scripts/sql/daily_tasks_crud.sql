-- Adds CRUD support to daily_task_templates.
--
-- target_count: per-template counter threshold (replaces the hardcoded
--   COUNTER_TASKS map in components/daily-tasks/daily-tasks-auto-detect.ts).
--   Nullable — non-counter tasks have no threshold.
-- is_default:   true for ids seeded by DEFAULT_TEMPLATES. Used by "Reset to
--   defaults" to know which rows to re-seed, and to label rows in the UI.
--
-- Idempotent. Safe to re-run.

alter table public.daily_task_templates
  add column if not exists target_count int,
  add column if not exists is_default boolean not null default false;

-- Backfill is_default for the 6 known seeded ids on this single-user setup.
update public.daily_task_templates
  set is_default = true
  where id in (
    'read_engoo', 'read_hbr', 'vocab_10',
    'chess_puzzles_10', 'diary_write', 'meditation_10min'
  );

-- Backfill target_count for the two counter-based defaults. Mirrors the
-- numbers that used to live in COUNTER_TASKS.
update public.daily_task_templates
  set target_count = 5
  where id = 'vocab_10' and target_count is null;
update public.daily_task_templates
  set target_count = 10
  where id = 'chess_puzzles_10' and target_count is null;
