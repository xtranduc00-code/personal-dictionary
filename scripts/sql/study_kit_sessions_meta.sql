-- Optional: snapshot of Study Kit form (sources, formats, scope) for "restore setup".
-- Run in Supabase SQL editor after study_kit_sessions exists.

alter table public.study_kit_sessions
  add column if not exists meta jsonb not null default '{}'::jsonb;

comment on column public.study_kit_sessions.meta is 'Study Kit form snapshot (JSON): input tab, formats, custom scope, serializable sources.';
