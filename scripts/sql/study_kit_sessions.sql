-- Study Kit: server-side session = knowledge sheet (markdown) + chat transcript per user.
-- Run once in Supabase SQL editor.

create table if not exists public.study_kit_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.auth_users (id) on delete cascade,
  title text not null default '',
  summary_markdown text not null,
  truncated boolean not null default false,
  messages jsonb not null default '[]'::jsonb,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists study_kit_sessions_user_updated_idx
  on public.study_kit_sessions (user_id, updated_at desc);

comment on table public.study_kit_sessions is 'Study Kit: saved sheet, section chat threads (messages JSON), optional form snapshot (meta).';
comment on column public.study_kit_sessions.meta is 'Form snapshot when generating: tabs, formats, scope, serializable sources.';
