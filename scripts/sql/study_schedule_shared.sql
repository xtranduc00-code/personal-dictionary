-- Shared study schedule grid: one row for the whole app (all logged-in users read/write the same data).
-- Run once in Supabase SQL editor. Requires service role (or RLS policies) for API access via supabaseForUserData().

create table if not exists public.study_schedule_shared (
  id text primary key default 'global' check (id = 'global'),
  accounts jsonb not null default '["Hồng 1","Hồng 2","Hồng 3","Minh 1","Minh 2"]'::jsonb,
  by_date jsonb not null default '{}'::jsonb,
  -- Paint brushes: array of {name,color}. Editable in the UI; can also be edited directly in this row.
  presets jsonb not null default '[{"name":"Duy","color":"#1e293b"},{"name":"Quang","color":"#0f766e"},{"name":"Thư","color":"#6d28d9"}]'::jsonb,
  -- cz = show slots in browser local TZ (API maps client "local" ↔ cz); vn = Vietnam labels only
  time_display text not null default 'vn' check (time_display in ('vn', 'cz')),
  updated_at timestamptz not null default now()
);

-- Migration: add presets column on existing tables (no-op if already there).
alter table public.study_schedule_shared
  add column if not exists presets jsonb not null default '[{"name":"Duy","color":"#1e293b"},{"name":"Quang","color":"#0f766e"},{"name":"Thư","color":"#6d28d9"}]'::jsonb;

insert into public.study_schedule_shared (id) values ('global')
  on conflict (id) do nothing;

comment on table public.study_schedule_shared is 'Shared study grid: 30-min VN slots, accounts, per-day cells, paint brushes, timezone display toggle.';
