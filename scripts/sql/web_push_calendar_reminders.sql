-- Web Push subscriptions + dedup log for calendar reminder notifications.
-- Run in Supabase SQL editor. API uses supabaseForUserData() (service role).

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.auth_users (id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint push_subscriptions_endpoint_unique unique (endpoint)
);

create index if not exists push_subscriptions_user_id_idx
  on public.push_subscriptions (user_id);

create table if not exists public.calendar_reminder_sent (
  user_id uuid not null,
  event_id uuid not null,
  kind text not null,
  sent_at timestamptz not null default now(),
  primary key (user_id, event_id, kind)
);

create index if not exists calendar_reminder_sent_event_id_idx
  on public.calendar_reminder_sent (event_id);

-- Study schedule grid (shared): same push_subscriptions, separate dedup table.
-- Requires public.study_schedule_shared (see study_schedule_shared.sql).

create table if not exists public.study_schedule_reminder_sent (
  user_id uuid not null references public.auth_users (id) on delete cascade,
  kind text not null,
  slot_key text not null,
  sent_at timestamptz not null default now(),
  primary key (user_id, kind, slot_key)
);

create index if not exists study_schedule_reminder_sent_user_id_idx
  on public.study_schedule_reminder_sent (user_id);

