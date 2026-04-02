-- Watch Together: saved YouTube clips grouped by folder (per user).
-- Run in Supabase SQL Editor after `auth_users` exists.
--
-- Columns match app usage: folder_name + title + youtube_url + sort_order
-- (`order` is reserved in SQL → sort_order)

create table if not exists public.watch_playlist (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.auth_users (id) on delete cascade,
  folder_name text not null default 'General',
  title text not null,
  youtube_url text not null,
  subtitle_url text,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.watch_playlist
  add column if not exists subtitle_url text;

create index if not exists watch_playlist_user_folder_order_idx
  on public.watch_playlist (user_id, folder_name, sort_order, title);

comment on table public.watch_playlist is 'User YouTube playlist for Watch Together (folders + clips).';

-- RLS: direct anon key access denied unless Supabase Auth uid matches (same pattern as note_folders).
-- App API uses service role → bypasses RLS.

alter table public.watch_playlist enable row level security;

drop policy if exists "watch_playlist_select_own" on public.watch_playlist;
drop policy if exists "watch_playlist_insert_own" on public.watch_playlist;
drop policy if exists "watch_playlist_update_own" on public.watch_playlist;
drop policy if exists "watch_playlist_delete_own" on public.watch_playlist;

create policy "watch_playlist_select_own" on public.watch_playlist
  for select to authenticated
  using (user_id = auth.uid());

create policy "watch_playlist_insert_own" on public.watch_playlist
  for insert to authenticated
  with check (user_id = auth.uid());

create policy "watch_playlist_update_own" on public.watch_playlist
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "watch_playlist_delete_own" on public.watch_playlist
  for delete to authenticated
  using (user_id = auth.uid());
