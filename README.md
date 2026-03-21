# Ken Workspace

All-in-One productivity app — full-stack personal productivity and **IELTS preparation**: English dictionary, Listening / Reading / Writing / Speaking practice, flashcards, notes, calendar, translation, **Google Drive** integration, and **AI realtime speaking** (voice).

Built for production-style deployment (e.g. Vercel + Supabase + OpenAI).

---

## For reviewers and instructors

This is a **Next.js** web app (TypeScript). To run it locally:

1. Install **Node.js 20+** (LTS is recommended).
2. In the project directory: `npm install`
3. Copy the env template: `cp .env.example .env.local`  
   You do **not** need every variable filled in to open some routes (e.g. the portfolio). **Sign-in, persisted data, and AI** need Supabase and OpenAI (see the table below).
4. Run `npm run dev` and open **http://127.0.0.1:3000** (the dev server binds to `127.0.0.1` per `package.json`).

**Database:** the app uses **Supabase (PostgreSQL)**. Your clone may **not** include a `supabase/migrations/` folder. If it is missing, ask the author for migration SQL or use an already configured Supabase project. Example migration names (when applicable) are referenced in comments inside `.env.example`.

---

## Tech stack

| Area | Stack |
|------|--------|
| Framework | **Next.js** (App Router), **TypeScript**, **Tailwind CSS** |
| AI | **OpenAI** — definitions, translation, speaking scoring/feedback, realtime voice |
| Data & auth | **Supabase** (PostgreSQL) — user auth, flashcards, notes, calendar, IELTS speaking topics |
| Integrations | Google OAuth (Drive), optional R2 for static audio assets |

---

## Prerequisites

- **Node.js 20+** (LTS recommended)
- **npm** (bundled with Node)

---

## Getting started (local)

### 1. Install & env file

```bash
npm install
cp .env.example .env.local
```

Edit `.env.local` as needed. **Per-variable documentation** is in `.env.example` (comments).

**Typical minimum for full local feature testing:**

| Purpose | Variables (see `.env.example` for details) |
|---------|---------------------------------------------|
| Auth + cloud data | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| AI APIs (dictionary, translation, speaking, …) | `OPENAI_API_KEY` |
| Avatar uploads with Storage RLS | `SUPABASE_JWT_SECRET` (+ `/api/auth/storage-jwt` flow) |
| Server-side DB writes when RLS blocks anon | `SUPABASE_SERVICE_ROLE_KEY` — **server only**, never in client code |
| Google Drive OAuth | `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` (+ `/api/drive-auth/callback/google` URIs for host/port) |
| Video calls (LiveKit) | `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `NEXT_PUBLIC_LIVEKIT_URL` |

### 2. Database (Supabase)

1. Create a project on [Supabase](https://supabase.com) and copy the URL, anon key, and service role if needed.
2. In the **SQL Editor**, run migration files **in filename order** (timestamp ascending) **if** `supabase/migrations/` exists in your clone.  
   - Example filenames are referenced in `.env.example` comments (auth password, email, avatar storage, etc.).  
   - If the repo has **no** migrations folder, you need the SQL bundle from the author — the schema cannot be recreated from this README alone.

3. Password reset via email: set `RESEND_API_KEY` (and `AUTH_EMAIL_FROM` in production) — see `.env.example`.

### 3. Run dev server

```bash
npm run dev
```

App: **http://127.0.0.1:3000** (or the URL printed in the terminal).

### 4. Drive UI styles (only if you edit Drive feature CSS)

```bash
npm run build:drive-css
```

---

## What works without optional services?

- **Portfolio / some mostly static pages:** often usable with minimal env.
- **Sign-in, notes, flashcards, calendar, server-backed IELTS:** need Supabase + migrations.
- **AI speaking, scoring, realtime:** need `OPENAI_API_KEY` (and the corresponding realtime setup).
- **Google Drive in the app:** need Google OAuth + `AUTH_SECRET`.
- **`/call` (video rooms):** need LiveKit env vars.

---

## Application routes (overview)

| Path | Purpose |
|------|---------|
| `/` | Portfolio landing |
| `/dictionary`, `/translate`, `/library`, `/history` | Vocabulary and lookup history |
| `/listening`, `/ielts-reading`, `/ielts-writing`, `/ielts-speaking` | IELTS skills |
| `/real-time-call` | AI speaking (realtime) — implementation in `features/call-ken/` |
| `/drive` | Embedded Google Drive browser |
| `/flashcards`, `/notes`, `/calendar` | Study tools |

Realtime voice needs `/api/realtime-client-secret` and a valid `OPENAI_API_KEY`.

---

## Repository structure

| Directory | Role |
|-----------|------|
| `app/` | Next.js routes, layouts, and `app/api/*` route handlers |
| `components/` | Shared UI (navigation, modals, editors, IELTS UI) |
| `lib/` | Shared logic, content data, utilities |
| `features/` | **Feature modules** (isolated code paths); see below |
| `supabase/` | SQL schema / migrations **when present in your clone** |

### Feature modules (`features/`)

Self-contained slices (e.g. **Call Ken**, **Google Drive**). Typical layout per feature:

- `components/` — UI scoped to that feature  
- `lib/` — Hooks, helpers, API helpers  
- `routes/` or entry — Main screen exported into `app/`  
- `styles/` — Feature CSS when needed  

**Import path:** `@/features/<feature-name>/...`  
Example: `@/features/call-ken/routes/index`

**Adding a new feature:** create `features/<your-feature>/` with the folders above, then add a route under `app/` that imports from `@/features/<your-feature>/...`.

---

## Operational notes

- With Supabase env vars set and the user signed in, data syncs across devices; some paths degrade to browser storage if Supabase is unavailable.
- **IELTS test content** is for personal/educational use; respect Cambridge and publisher terms if you redistribute or commercialise.

---

## Scripts (reference)

| Command | Description |
|---------|-------------|
| `npm run dev` | Development server (`127.0.0.1`) |
| `npm run build` | Production build |
| `npm run start` | Start production server |
| `npm run lint` | ESLint |
| `npm run build:drive-css` | Rebuild `public/gdrive/drive.css` from Drive feature sources |
| `npm run hash-password` | One-off: hash a password for seeding / support (see script usage) |
