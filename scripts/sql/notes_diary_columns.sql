-- Diary entries as notes: type + calendar date. Run in Supabase SQL after `public.notes` exists.
-- Existing rows become note_type = 'note'; diary entries use note_type = 'diary' and diary_date.

alter table public.notes
  add column if not exists note_type text not null default 'note';

alter table public.notes
  add column if not exists diary_date date null;

update public.notes
set note_type = 'note'
where note_type is null;

alter table public.notes
  drop constraint if exists notes_note_type_check;

alter table public.notes
  add constraint notes_note_type_check
  check (note_type in ('note', 'diary'));

-- One diary entry per user per calendar day (enforced in app + DB).
create unique index if not exists notes_one_diary_per_day_uidx
  on public.notes (user_id, diary_date)
  where note_type = 'diary' and diary_date is not null;

create index if not exists notes_user_diary_list_idx
  on public.notes (user_id, diary_date desc)
  where note_type = 'diary';

comment on column public.notes.note_type is 'note | diary';
comment on column public.notes.diary_date is 'Local calendar date for diary entries (YYYY-MM-DD from client).';
