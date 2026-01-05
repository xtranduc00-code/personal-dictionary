# Personal Dictionary (MVP)

Minimal web app to:
- Search words with OpenAI explanations
- Auto-save searched words into personal library
- See CEFR level (A1-C2) and part of speech

## Tech stack

- Next.js + TypeScript + Tailwind
- OpenAI API for dictionary-like output
- Supabase (Postgres) for syncing History + My Words across devices (no login)

## Setup

1. Copy env template
```bash
cp .env.example .env.local
```

2. Fill `.env.local`
```bash
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-4.1-mini
```

3. Create the table in Supabase: Dashboard → SQL Editor → run `supabase/schema.sql`

4. Install and run
```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Pages

- `/` Search + result + Save to My Words; History + My Words lists
- `/library` personal word library (My Words / History) + filters
- `/real-time-call` **Call Ken** – English Realtime Tutor (giao diện + logic nằm trong folder `call-ken/`, gộp chung project)

Call Ken là một phần của app: code trong `call-ken/` (components, lib, styles), API key realtime tại `/api/realtime-client-secret`. Cần `OPENAI_API_KEY` trong `.env` để gọi được. Folder `real_timecall/` là bản gốc (Vite/TanStack) giữ để tham khảo, không dùng khi chạy Next.js.

## Notes

- Single-user app, no login. If Supabase env is set, data syncs across devices; otherwise words are stored in browser localStorage only.
