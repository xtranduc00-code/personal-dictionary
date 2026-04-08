-- User-defined daily task templates. Run AFTER daily_tasks.sql

create table if not exists public.daily_task_templates (
  id text not null,
  user_id uuid not null references public.auth_users (id) on delete cascade,
  label text not null,
  href text not null default '/',
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  primary key (user_id, id)
);

create index if not exists daily_task_templates_user_idx
  on public.daily_task_templates (user_id, sort_order);

alter table public.daily_task_templates enable row level security;
