-- Daily task completion tracking per user.
-- Run this in Supabase SQL editor after auth_users table exists.

create table if not exists public.daily_tasks (
  id uuid not null default gen_random_uuid() primary key,
  user_id uuid not null references public.auth_users (id) on delete cascade,
  task_date date not null default current_date,
  task_key text not null check (task_key in (
    'read_engoo', 'read_guardian', 'flashcards_10',
    'ielts_listening', 'ielts_speaking', 'chess_puzzles_5'
  )),
  completed_at timestamptz,
  auto_detected boolean not null default false,
  unique (user_id, task_date, task_key)
);

create index if not exists daily_tasks_user_date_idx
  on public.daily_tasks (user_id, task_date);

-- Streak function: consecutive days where ALL 6 tasks were completed (ending today or yesterday)
create or replace function public.daily_tasks_streak(p_user_id uuid)
returns integer
language sql stable
as $$
  with completed_days as (
    select task_date
    from public.daily_tasks
    where user_id = p_user_id
      and completed_at is not null
    group by task_date
    having count(distinct task_key) = 6
  ),
  numbered as (
    select task_date,
           task_date - (row_number() over (order by task_date desc))::int as grp
    from completed_days
  ),
  latest_grp as (
    select grp from numbered
    where task_date >= current_date - 1
    order by task_date desc
    limit 1
  )
  select coalesce(
    (select count(*)::int from numbered where grp = (select grp from latest_grp)),
    0
  );
$$;

alter table public.daily_tasks enable row level security;

-- RLS policies
create policy "Users can read own daily tasks"
  on public.daily_tasks for select
  using (user_id = auth.uid());

create policy "Users can insert own daily tasks"
  on public.daily_tasks for insert
  with check (user_id = auth.uid());

create policy "Users can update own daily tasks"
  on public.daily_tasks for update
  using (user_id = auth.uid());
