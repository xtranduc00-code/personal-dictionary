-- Remove the fixed CHECK constraint so users can have custom task keys.
-- Run AFTER daily_tasks.sql

alter table public.daily_tasks drop constraint if exists daily_tasks_task_key_check;
