-- Add clock columns to chess_games for server-side time sync.
-- Run in Supabase SQL editor after chess_games table exists.

alter table public.chess_games
  add column if not exists white_time_ms integer,
  add column if not exists black_time_ms integer;

comment on column public.chess_games.white_time_ms is 'White remaining clock in milliseconds. NULL = unlimited.';
comment on column public.chess_games.black_time_ms is 'Black remaining clock in milliseconds. NULL = unlimited.';
