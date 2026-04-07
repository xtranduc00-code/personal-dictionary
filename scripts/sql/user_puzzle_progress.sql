-- Library puzzle completion per Ken auth user. Run in Supabase SQL after `auth_users` exists.
-- API uses service role / server client; RLS blocks direct anon access.

create table if not exists public.user_puzzle_progress (
  user_id uuid not null references public.auth_users (id) on delete cascade,
  puzzle_id text not null,
  puzzle_level text not null check (puzzle_level in ('beginner', 'intermediate', 'hard', 'expert')),
  solved_at timestamptz not null default now(),
  attempts integer not null default 1 check (attempts >= 1),
  primary key (user_id, puzzle_id)
);

create index if not exists user_puzzle_progress_user_level_idx
  on public.user_puzzle_progress (user_id, puzzle_level);

comment on table public.user_puzzle_progress is 'Tracks solved puzzles from data/chess-puzzles.json library.';

alter table public.user_puzzle_progress enable row level security;
