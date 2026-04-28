-- Streak v3: drop freeze tables/columns. Sick day + travel mode removed
-- because the 1-miss-per-7-day forgiveness rule already covers ~all real-life
-- sick/travel cases for personal use, and the quota tracking + UI for one user
-- was over-engineered. App now only differentiates active / at_risk / broken /
-- never_started.
--
-- Safe to run multiple times. Existing rows in streak_freezes (if any from
-- testing) are dropped — that's fine, they were ephemeral anyway.

drop table if exists public.streak_freezes;
