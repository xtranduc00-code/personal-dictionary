# Supabase setup (1 lần)

## Bước 1: Tạo project

1. Vào https://supabase.com/dashboard → **New project**
2. Điền tên, mật khẩu DB (để ý lưu), chọn region → **Create**

## Bước 2: Chạy SQL tạo bảng

1. Trong project vừa tạo → bên trái chọn **SQL Editor**
2. Chọn **New query**
3. Copy **toàn bộ** nội dung file `schema.sql` (trong folder này) dán vào ô
4. Bấm **Run** (hoặc Ctrl+Enter)

Xong khi thấy "Success. No rows returned".

## Bước 3: Lấy URL và Key

1. Bên trái chọn **Project Settings** (icon bánh răng)
2. Chọn **API**
3. Copy:
   - **Project URL** → dán vào `.env` làm `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public** (trong Project API keys) → dán vào `.env` làm `NEXT_PUBLIC_SUPABASE_ANON_KEY`

## .env cần có

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4.1-mini
```

Sau đó chạy `npm run dev` — History và My Words sẽ đồng bộ qua Supabase.
