-- Notes: folders + labels (per user). Run in Supabase SQL after `notes` and `auth_users` exist.
--
-- DỮ LIỆU CŨ: Script này KHÔNG xóa và KHÔNG di chuyển hàng trong `notes`.
-- Chỉ thêm bảng mới (rỗng) + cột `folder_id` (NULL). Ghi chú cũ vẫn ở `notes`, hiển thị
-- "Chưa phân loại" cho tới khi bạn gán folder/label trong app.
--
-- (Tuỳ chọn) Sao lưu nhanh trước khi chạy:
--   select id, user_id, title, left(body, 200) as body_preview, created_at from public.notes;
--
-- Kiểm tra sau khi chạy: select count(*) from public.notes;  -- phải bằng số dòng trước đó.

create table if not exists public.note_folders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.auth_users (id) on delete cascade,
  name text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists note_folders_user_sort_idx
  on public.note_folders (user_id, sort_order, name);

create table if not exists public.note_labels (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.auth_users (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create unique index if not exists note_labels_user_lower_name_uidx
  on public.note_labels (user_id, lower(trim(name)));

create index if not exists note_labels_user_name_idx
  on public.note_labels (user_id, name);

create table if not exists public.note_note_labels (
  note_id uuid not null references public.notes (id) on delete cascade,
  label_id uuid not null references public.note_labels (id) on delete cascade,
  primary key (note_id, label_id)
);

create index if not exists note_note_labels_label_idx
  on public.note_note_labels (label_id);

alter table public.notes
  add column if not exists folder_id uuid references public.note_folders (id) on delete set null;

create index if not exists notes_user_folder_idx
  on public.notes (user_id, folder_id);

comment on table public.note_folders is 'User-defined folders for organizing notes.';
comment on table public.note_labels is 'User-defined labels/tags for notes.';
comment on table public.note_note_labels is 'Assigns labels to notes.';
