-- Notes: share folders (and all notes inside subtree) with another user.
-- This does NOT copy notes. Access is computed in the API layer.

create table if not exists public.note_folder_shares (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.auth_users (id) on delete cascade,
  folder_id uuid not null references public.note_folders (id) on delete cascade,
  shared_by_user_id uuid not null references public.auth_users (id) on delete cascade,
  shared_with_user_id uuid not null references public.auth_users (id) on delete cascade,
  role text not null default 'editor',
  created_at timestamptz not null default now()
);

create unique index if not exists note_folder_shares_folder_with_uidx
  on public.note_folder_shares (folder_id, shared_with_user_id);

create index if not exists note_folder_shares_with_user_idx
  on public.note_folder_shares (shared_with_user_id, owner_user_id);

comment on table public.note_folder_shares is 'Share a folder subtree of notes with another user.';
