-- Single-user dictionary + IELTS. Run in Supabase SQL Editor (Dashboard → SQL Editor).
-- To reset DB first, uncomment and run the block below once, then run the rest.

-- drop table if exists public.ielts_topic_vocab;
-- drop table if exists public.ielts_practice;
-- drop table if exists public.ielts_questions;
-- drop table if exists public.ielts_topics;
-- drop table if exists public.words;

-- ----- Create tables -----
create table if not exists public.words (
  id uuid primary key default gen_random_uuid(),
  word text not null,
  normalized_word text not null,
  ipa_us text default '',
  is_saved boolean not null default false,
  part_of_speech text not null default 'other',
  level text not null default 'B1' check (level in ('A1','A2','B1','B2','C1','C2')),
  meaning text not null,
  synonyms text[] not null default '{}',
  antonyms text[] not null default '{}',
  examples text[] not null default '{}',
  note text default '',
  tags text[] not null default '{}',
  senses jsonb not null default '[]',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (normalized_word)
);

-- For existing DBs: add new columns if missing
alter table public.words add column if not exists note text default '';
alter table public.words add column if not exists tags text[] not null default '{}';
alter table public.words add column if not exists senses jsonb not null default '[]';

create index if not exists words_updated_at_idx on public.words(updated_at desc);
create index if not exists words_is_saved_idx on public.words(is_saved) where is_saved = true;

alter table public.words enable row level security;

-- Allow anon (no login) to do everything: single-user app.
drop policy if exists "Allow anon all on words" on public.words;
create policy "Allow anon all on words"
  on public.words
  for all
  to anon
  using (true)
  with check (true);

-- IELTS Speaking (topics, questions, practice, vocab)
create table if not exists public.ielts_topics (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.ielts_questions (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid not null references public.ielts_topics(id) on delete cascade,
  text text not null,
  part text not null check (part in ('1','2','3')),
  created_at timestamptz not null default now()
);

create table if not exists public.ielts_practice (
  question_id uuid primary key references public.ielts_questions(id) on delete cascade,
  draft text not null default '',
  history jsonb not null default '[]'
);

create table if not exists public.ielts_topic_vocab (
  topic_id uuid primary key references public.ielts_topics(id) on delete cascade,
  items jsonb not null default '[]'
);

create index if not exists ielts_questions_topic_part_idx on public.ielts_questions(topic_id, part);

alter table public.ielts_topics enable row level security;
alter table public.ielts_questions enable row level security;
alter table public.ielts_practice enable row level security;
alter table public.ielts_topic_vocab enable row level security;

drop policy if exists "Allow anon all on ielts_topics" on public.ielts_topics;
create policy "Allow anon all on ielts_topics" on public.ielts_topics for all to anon using (true) with check (true);
drop policy if exists "Allow anon all on ielts_questions" on public.ielts_questions;
create policy "Allow anon all on ielts_questions" on public.ielts_questions for all to anon using (true) with check (true);
drop policy if exists "Allow anon all on ielts_practice" on public.ielts_practice;
create policy "Allow anon all on ielts_practice" on public.ielts_practice for all to anon using (true) with check (true);
drop policy if exists "Allow anon all on ielts_topic_vocab" on public.ielts_topic_vocab;
create policy "Allow anon all on ielts_topic_vocab" on public.ielts_topic_vocab for all to anon using (true) with check (true);
