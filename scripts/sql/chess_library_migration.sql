-- =============================================================================
--  Chess library migration — moves the Lichess puzzle dataset off local SQLite
--  onto Supabase Postgres so the chess routes work on every device.
--
--  Run order:
--    1. This file (creates schema, RLS policies).
--    2. `scripts/import-puzzles-supabase.ts` (bulk-load via pg COPY).
--    3. `scripts/sql/drop_user_puzzle_progress.sql` (cleanup orphan v1 table).
--
--  All FKs target `public.auth_users(id)` — this codebase uses a custom Bearer
--  token / sessions auth model, NOT Supabase's built-in `auth.users`. See
--  `lib/get-auth-user.ts` and the 15 sibling files in this folder.
-- =============================================================================

-- -----------------------------------------------------------------------------
--  Library tables — public read, server-only writes (service role bypasses RLS)
-- -----------------------------------------------------------------------------

create table if not exists public.chess_lib_puzzles (
  puzzle_id        text primary key,
  fen              text not null,
  moves            text not null,
  rating           integer not null,
  rating_deviation integer not null,
  popularity       integer not null,
  nb_plays         integer not null,
  game_url         text,
  level            text not null
    check (level in ('beginner','intermediate','hard','expert'))
);

create index if not exists idx_chess_lib_puzzles_level_rating
  on public.chess_lib_puzzles (level, rating);
create index if not exists idx_chess_lib_puzzles_level_popularity
  on public.chess_lib_puzzles (level, popularity desc, nb_plays desc, puzzle_id);
create index if not exists idx_chess_lib_puzzles_rating
  on public.chess_lib_puzzles (rating);

create table if not exists public.chess_lib_themes (
  puzzle_id text not null
    references public.chess_lib_puzzles(puzzle_id) on delete cascade,
  theme     text not null,
  primary key (puzzle_id, theme)
);
create index if not exists idx_chess_lib_themes_theme_puzzle
  on public.chess_lib_themes (theme, puzzle_id);

create table if not exists public.chess_lib_openings (
  puzzle_id   text not null
    references public.chess_lib_puzzles(puzzle_id) on delete cascade,
  opening_tag text not null,
  primary key (puzzle_id, opening_tag)
);
create index if not exists idx_chess_lib_openings_tag_puzzle
  on public.chess_lib_openings (opening_tag, puzzle_id);

-- Materialised count lookups. Populated only at import time — re-run the
-- import script (which truncates + recomputes) after puzzle data changes.
-- Live counts on a 200K join would miss the 100ms target on chip browse.
create table if not exists public.chess_lib_theme_counts (
  theme text not null,
  level text not null,
  count integer not null,
  primary key (theme, level)
);
comment on table public.chess_lib_theme_counts is
  'Counts populated only at import time. Re-run import script after puzzle data changes.';

create table if not exists public.chess_lib_opening_counts (
  opening_tag text not null,
  level       text not null,
  count       integer not null,
  primary key (opening_tag, level)
);
comment on table public.chess_lib_opening_counts is
  'Counts populated only at import time. Re-run import script after puzzle data changes.';

alter table public.chess_lib_puzzles        enable row level security;
alter table public.chess_lib_themes         enable row level security;
alter table public.chess_lib_openings       enable row level security;
alter table public.chess_lib_theme_counts   enable row level security;
alter table public.chess_lib_opening_counts enable row level security;

-- The Lichess dataset is public; let any authenticated or anon role read it.
-- Writes happen only with the service-role key (which bypasses RLS).
drop policy if exists "lib puzzles readable by anyone"        on public.chess_lib_puzzles;
drop policy if exists "lib themes readable by anyone"         on public.chess_lib_themes;
drop policy if exists "lib openings readable by anyone"       on public.chess_lib_openings;
drop policy if exists "lib theme_counts readable by anyone"   on public.chess_lib_theme_counts;
drop policy if exists "lib opening_counts readable by anyone" on public.chess_lib_opening_counts;

create policy "lib puzzles readable by anyone"
  on public.chess_lib_puzzles        for select using (true);
create policy "lib themes readable by anyone"
  on public.chess_lib_themes         for select using (true);
create policy "lib openings readable by anyone"
  on public.chess_lib_openings       for select using (true);
create policy "lib theme_counts readable by anyone"
  on public.chess_lib_theme_counts   for select using (true);
create policy "lib opening_counts readable by anyone"
  on public.chess_lib_opening_counts for select using (true);

-- -----------------------------------------------------------------------------
--  User-scoped tables — RLS enabled, no policies (server uses service role
--  + manual user_id filter — same pattern as user_puzzle_progress, notes,
--  chess_games).
-- -----------------------------------------------------------------------------

create table if not exists public.chess_game_puzzles (
  id              text primary key,                                       -- gp_<12hex>_<ply>
  user_id         uuid not null
    references public.auth_users(id) on delete cascade,
  game_id         text not null,
  ply             integer not null,
  fullmove        integer not null,
  side            text not null check (side in ('w','b')),
  fen             text not null,
  solution_moves  text not null,                                            -- space-joined UCI
  played_uci      text,
  classification  text not null check (classification in ('mistake','blunder')),
  eval_before_cp  integer,
  eval_after_cp   integer,
  swing_cp        integer not null,
  source_url      text,
  white_name      text,
  black_name      text,
  themes          text not null,
  created_at      timestamptz not null default now()
);
create index if not exists idx_chess_game_puzzles_user_game
  on public.chess_game_puzzles (user_id, game_id);
create index if not exists idx_chess_game_puzzles_user_created
  on public.chess_game_puzzles (user_id, created_at desc);

-- Per-attempt log. Each row references EITHER a library puzzle OR a
-- game-extracted puzzle, never both. The CHECK enforces exactly-one-non-null
-- so a typo can't sneak through.
create table if not exists public.chess_attempts (
  id              bigserial primary key,
  user_id         uuid not null
    references public.auth_users(id) on delete cascade,
  lib_puzzle_id   text
    references public.chess_lib_puzzles(puzzle_id) on delete cascade,
  game_puzzle_id  text
    references public.chess_game_puzzles(id) on delete cascade,
  attempted_at    timestamptz not null default now(),
  solved          boolean not null,
  hints_used      smallint not null default 0 check (hints_used between 0 and 3),
  duration_ms     integer not null default 0 check (duration_ms >= 0),
  constraint chess_attempts_exactly_one_target check (
    (lib_puzzle_id is null) <> (game_puzzle_id is null)
  )
);
create index if not exists idx_chess_attempts_user_lib
  on public.chess_attempts (user_id, lib_puzzle_id)
  where lib_puzzle_id is not null;
create index if not exists idx_chess_attempts_user_game
  on public.chess_attempts (user_id, game_puzzle_id)
  where game_puzzle_id is not null;
create index if not exists idx_chess_attempts_user_at
  on public.chess_attempts (user_id, attempted_at desc);

alter table public.chess_attempts     enable row level security;
alter table public.chess_game_puzzles enable row level security;
