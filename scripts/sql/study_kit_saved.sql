-- Study Kit: Subjects (folders) + sheets — persisted per user (replaces browser-only storage when signed in).
-- Run once in Supabase SQL editor after study_kit_sessions.sql (needs auth_users).

create table if not exists public.study_kit_saved_topics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.auth_users (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.study_kit_saved_sheets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.auth_users (id) on delete cascade,
  topic_id uuid not null references public.study_kit_saved_topics (id) on delete cascade,
  title text not null default '',
  markdown text not null,
  truncated boolean not null default false,
  saved_at timestamptz not null default now()
);

create index if not exists study_kit_saved_topics_user_updated_idx
  on public.study_kit_saved_topics (user_id, updated_at desc);

create index if not exists study_kit_saved_sheets_topic_saved_idx
  on public.study_kit_saved_sheets (topic_id, saved_at desc);

create index if not exists study_kit_saved_sheets_user_idx
  on public.study_kit_saved_sheets (user_id);

comment on table public.study_kit_saved_topics is 'Study Kit Subjects: user-organized folders for saved markdown sheets.';
comment on table public.study_kit_saved_sheets is 'Markdown sheet inside a study_kit_saved_topics folder.';
