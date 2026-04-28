-- Forgiving streak v2: replaces the all-or-nothing daily_tasks_streak() RPC,
-- adds freezes (sick day / travel) and a per-day skip-recovery dismissal log.
-- Streak compute itself moves into TypeScript (lib/streak/compute.ts) — easier
-- to test, debug, and tune than PL/pgSQL. The DB just stores raw events.
--
-- Run this AFTER daily_tasks.sql and daily_task_templates.sql.

-- ─── 1. Drop the broken task_key CHECK on daily_tasks ───────────────────────
-- The original constraint hardcoded a stale task-id list (`flashcards_10`,
-- `chess_puzzles_5`, ...) that no longer matches the user-customizable
-- templates table. Inserts with current IDs (`vocab_10`, `chess_puzzles_10`,
-- `diary_write`, `read_hbr`) silently failed → daily_tasks_streak() always
-- returned 0. Templates are the authority now.
alter table public.daily_tasks
  drop constraint if exists daily_tasks_task_key_check;

-- ─── 2. Streak freezes (sick day / travel) ──────────────────────────────────
-- One row per (user, frozen_date). Frozen days don't count as misses in the
-- streak walker. Travel mode inserts a range of rows; sick day inserts one.
create table if not exists public.streak_freezes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.auth_users (id) on delete cascade,
  freeze_date date not null,
  freeze_type text not null check (freeze_type in ('sick_day', 'travel')),
  created_at timestamptz not null default now(),
  unique (user_id, freeze_date)
);
create index if not exists streak_freezes_user_date_idx
  on public.streak_freezes (user_id, freeze_date);

alter table public.streak_freezes enable row level security;
do $$ begin
  create policy "streak_freezes owner read" on public.streak_freezes for select using (user_id = auth.uid());
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "streak_freezes owner write" on public.streak_freezes for insert with check (user_id = auth.uid());
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "streak_freezes owner delete" on public.streak_freezes for delete using (user_id = auth.uid());
exception when duplicate_object then null; end $$;

-- ─── 3. Skip-recovery dismissals ────────────────────────────────────────────
-- One row per (user, dismiss_date). Used to remember the user already saw the
-- "you missed yesterday" prompt so we don't re-show it the same day.
create table if not exists public.streak_recovery_dismissals (
  user_id uuid not null references public.auth_users (id) on delete cascade,
  dismiss_date date not null,
  action text not null check (action in ('skip', 'make_up', 'dont_ask_again')),
  created_at timestamptz not null default now(),
  primary key (user_id, dismiss_date)
);

alter table public.streak_recovery_dismissals enable row level security;
do $$ begin
  create policy "streak_recovery owner read" on public.streak_recovery_dismissals for select using (user_id = auth.uid());
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "streak_recovery owner write" on public.streak_recovery_dismissals for insert with check (user_id = auth.uid());
exception when duplicate_object then null; end $$;

-- ─── 4. Persistent "skip recovery disabled" flag ────────────────────────────
-- Single boolean, lives on a tiny per-user prefs table. Kept separate from
-- daily_task_templates / daily_tasks so it can be extended (timezone,
-- day_start_hour, threshold_pct) without touching task tables.
create table if not exists public.user_streak_prefs (
  user_id uuid primary key references public.auth_users (id) on delete cascade,
  timezone text not null default 'Asia/Bangkok',
  day_start_hour int not null default 0 check (day_start_hour between 0 and 23),
  threshold_pct int not null default 100 check (threshold_pct between 50 and 100),
  streak_enabled boolean not null default true,
  skip_recovery_enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.user_streak_prefs enable row level security;
do $$ begin
  create policy "user_streak_prefs owner read" on public.user_streak_prefs for select using (user_id = auth.uid());
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "user_streak_prefs owner write" on public.user_streak_prefs for insert with check (user_id = auth.uid());
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "user_streak_prefs owner update" on public.user_streak_prefs for update using (user_id = auth.uid());
exception when duplicate_object then null; end $$;
