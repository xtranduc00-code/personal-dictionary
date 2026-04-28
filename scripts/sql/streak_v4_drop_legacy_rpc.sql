-- Drop the legacy `daily_tasks_streak()` PL/pgSQL function. Replaced by the
-- TypeScript `computeStreak()` in lib/streak-compute.ts (v2/v3) which is
-- forgiving (1 miss / 7-day window) and template-count aware. The old RPC
-- required exactly-6-tasks-completed which never matched the template set
-- after the count drifted to 5.
--
-- The single remaining caller in app/api/daily-tasks/counters/route.ts was
-- removed in the same commit (no client read its result).
--
-- Idempotent. Safe to run twice.

drop function if exists public.daily_tasks_streak(uuid);
