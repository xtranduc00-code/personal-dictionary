-- Rename default Vietnamese folder label to English (optional; UI also maps "Ghi chú cũ" → General).
update public.note_folders
set name = 'General'
where name = 'Ghi chú cũ';
