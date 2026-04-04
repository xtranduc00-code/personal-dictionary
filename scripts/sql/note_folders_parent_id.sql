-- Nested note folders: self-referencing parent_id (run in Supabase SQL editor).
-- Safe to run multiple times (IF NOT EXISTS).

alter table public.note_folders
  add column if not exists parent_id uuid references public.note_folders (id) on delete set null;

create index if not exists note_folders_user_parent_idx
  on public.note_folders (user_id, parent_id);

comment on column public.note_folders.parent_id is
  'Parent folder; NULL = top-level. ON DELETE SET NULL orphans children to root.';
