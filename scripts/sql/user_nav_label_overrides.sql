-- Run in Supabase SQL editor (or migrate) once.
-- Stores per-user sidebar label overrides; empty object = all defaults from i18n.

create table if not exists public.user_nav_label_overrides (
  user_id uuid not null primary key references public.auth_users (id) on delete cascade,
  overrides jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists user_nav_label_overrides_updated_at_idx
  on public.user_nav_label_overrides (updated_at desc);

comment on table public.user_nav_label_overrides is 'Optional sidebar nav label text per auth user; keys match i18n TranslationKey subset.';
