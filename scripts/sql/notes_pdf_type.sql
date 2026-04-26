-- PDF notes: extends note_type to allow 'pdf'. Body holds the storage path,
-- title holds the original file name. Run after notes_diary_columns.sql.
-- The PDF binary itself lives in Supabase Storage bucket 'notes-pdfs',
-- which must be created manually in the Supabase dashboard (private; access
-- is brokered by /api/notes/[noteId]/pdf using the service role).

alter table public.notes
  drop constraint if exists notes_note_type_check;

alter table public.notes
  add constraint notes_note_type_check
  check (note_type in ('note', 'diary', 'pdf'));

comment on column public.notes.note_type is 'note | diary | pdf';
