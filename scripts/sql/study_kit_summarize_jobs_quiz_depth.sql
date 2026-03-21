-- Add quiz depth for async Study Kit jobs (exam-level vs adaptive vs quick review).
-- Run once if `study_kit_summarize_jobs` already exists without this column.

alter table public.study_kit_summarize_jobs
  add column if not exists quiz_depth text not null default 'review';

comment on column public.study_kit_summarize_jobs.quiz_depth is
  'review | exam | adaptive — passed to OpenAI system prompt for quiz section.';
