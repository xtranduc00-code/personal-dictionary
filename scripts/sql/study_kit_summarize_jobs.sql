-- Async Exam Notes jobs (OCR + OpenAI) — avoids short serverless HTTP timeouts.
--
-- Supabase Storage (Dashboard → Storage): create a **private** bucket named exactly:
--   study-kit-async-jobs
-- Default: service role key (server + Netlify background function) uploads/downloads/deletes; no public read.
-- If upload fails with 403, confirm SUPABASE_SERVICE_ROLE_KEY is set on Netlify for both Next and Functions.

create table if not exists public.study_kit_summarize_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.auth_users (id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'completed', 'failed')),
  input_mode text not null,
  presets_csv text not null,
  custom_scope text not null default '',
  sources_json jsonb not null default '{}'::jsonb,
  result_summary text,
  result_truncated boolean,
  result_file_name text,
  error_code text,
  error_detail text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists study_kit_summarize_jobs_user_created_idx
  on public.study_kit_summarize_jobs (user_id, created_at desc);

comment on table public.study_kit_summarize_jobs is 'Queued Study Kit summarize runs; worker is Netlify background function.';
