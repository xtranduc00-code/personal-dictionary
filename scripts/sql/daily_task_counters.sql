-- Per-day counters that back cumulative daily tasks (e.g. "5 vocab", "10 chess puzzles").
-- Run AFTER daily_tasks.sql (shares the same auth_users FK pattern).

create table if not exists public.daily_task_counters (
  user_id uuid not null references public.auth_users (id) on delete cascade,
  counter_date date not null default current_date,
  counter_key text not null,
  value integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, counter_date, counter_key)
);

create index if not exists daily_task_counters_user_date_idx
  on public.daily_task_counters (user_id, counter_date);

alter table public.daily_task_counters enable row level security;

-- Atomic increment: upsert +1 and return the new value.
create or replace function public.increment_daily_task_counter(
  p_user_id uuid,
  p_date date,
  p_key text
)
returns integer
language plpgsql
as $$
declare
  new_value integer;
begin
  insert into public.daily_task_counters (user_id, counter_date, counter_key, value)
  values (p_user_id, p_date, p_key, 1)
  on conflict (user_id, counter_date, counter_key)
  do update set value = daily_task_counters.value + 1, updated_at = now()
  returning value into new_value;
  return new_value;
end;
$$;
