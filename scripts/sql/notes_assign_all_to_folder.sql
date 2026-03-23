-- Gán toàn bộ ghi chú chưa có folder (folder_id IS NULL) của một user vào một folder mới.
-- Chạy sau notes_folders_labels.sql (cần có bảng note_folders và cột notes.folder_id).
--
-- QUAN TRỌNG: username phải là tài khoản đang đăng nhập trên app (tên ở góc dưới sidebar),
-- không phải account khác — nếu lệch thì UPDATE sẽ 0 dòng và app vẫn trống.
-- Xem nhanh: select id, username from public.auth_users order by username;
--
-- Sửa chuỗi bên dưới cho đúng.

WITH u AS (
  SELECT id
  FROM public.auth_users
  WHERE username = 'xtranduc0D'
  LIMIT 1
),
ins AS (
  INSERT INTO public.note_folders (user_id, name, sort_order)
  SELECT id, 'General', 0
  FROM u
  RETURNING id, user_id
)
UPDATE public.notes n
SET folder_id = ins.id
FROM ins
WHERE n.user_id = ins.user_id
  AND n.folder_id IS NULL;

-- Kiểm tra:
-- select id, title, folder_id from public.notes where user_id = (select id from public.auth_users where username = 'xtranduc0D' limit 1);
--
-- Nếu bạn đã tạo folder trong app và chỉ muốn gán vào folder có sẵn (không tạo thêm):
-- update public.notes
-- set folder_id = 'PASTE_FOLDER_UUID'::uuid
-- where user_id = 'PASTE_USER_UUID'::uuid
--   and folder_id is null;
