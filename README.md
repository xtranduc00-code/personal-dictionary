# KFC Workspace

All-in-One productivity app — full-stack personal productivity and **IELTS preparation**: English dictionary, Listening / Reading / Writing / Speaking practice, flashcards, notes, calendar, translation, **Google Drive** integration, and an **AI realtime speaking partner** (voice).

Built for production-style deployment (e.g. Vercel + Supabase + OpenAI).

---

## Tech stack

| Area | Stack |
|------|--------|
| Framework | **Next.js** (App Router), **TypeScript**, **Tailwind CSS** |
| AI | **OpenAI** — definitions, translation, speaking scoring/feedback, realtime voice |
| Data & auth | **Supabase** (PostgreSQL) — user auth, flashcards, notes, calendar, IELTS speaking topics |
| Integrations | Google OAuth (Drive), optional R2 for static audio assets |

---

## Getting started

1. **Environment**

   ```bash
   cp .env.example .env.local
   ```

   Configure at minimum: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `OPENAI_API_KEY`.  
   **Profile avatars**: upload **directly from the browser** with `supabase-js` (anon key + user JWT). The app session stays custom (`auth_sessions`); `/api/auth/storage-jwt` mints a short-lived JWT signed with **`SUPABASE_JWT_SECRET`** (Dashboard → **Settings** → **API** → **JWT Secret** — *not* `service_role`). That JWT makes Storage RLS treat `auth.uid()` as your `auth_users.id`. **Never** put `SUPABASE_SERVICE_ROLE_KEY` in client code.  
   For **Google Drive**: `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` — OAuth callback: `/api/drive-auth/callback/google`.  
   For **app “Continue with Google”** (same client ID/secret), add redirect URI: `/api/auth/google/callback` (e.g. `http://localhost:3000/api/auth/google/callback`).

2. **Database**  
   Run new SQL from `supabase/migrations/` in the Supabase SQL Editor (in timestamp order).  
   Password + email auth: run `20250322100000_auth_password.sql` and `20250322110000_auth_email.sql`.  
   Profile avatars: run `20250323120000_auth_avatar_storage.sql` then `20250324140000_avatar_storage_rls_and_rpc.sql` (Storage policies for `authenticated` + RPC `set_my_avatar_url` / `clear_my_avatar_url`).  
   Forgot-password emails: set `RESEND_API_KEY` (and `AUTH_EMAIL_FROM`) in `.env.local`.  
   Prefer `SUPABASE_SERVICE_ROLE_KEY` on the server if RLS would block auth writes.

3. **Run locally**

   ```bash
   npm install
   npm run dev
   ```

   App: `http://localhost:3000` (or the URL printed in the terminal).

4. **Drive UI styles**  
   After changing styles under `features/google-drive/`, rebuild the bundled Drive CSS:

   ```bash
   npm run build:drive-css
   ```

---

## Application routes (overview)

| Path | Purpose |
|------|---------|
| `/` | Portfolio landing |
| `/dictionary`, `/translate`, `/library`, `/history` | Vocabulary and lookup history |
| `/listening`, `/ielts-reading`, `/ielts-writing`, `/ielts-speaking` | IELTS skills |
| `/real-time-call` | AI speaking partner (realtime) — implementation in `features/call-ken/` |
| `/drive` | Embedded Google Drive browser |
| `/flashcards`, `/notes`, `/calendar` | Study tools |

Realtime voice requires `/api/realtime-client-secret` and a valid `OPENAI_API_KEY`.

---

## Repository structure

| Directory | Role |
|-----------|------|
| `app/` | Next.js routes, layouts, and `app/api/*` route handlers |
| `components/` | Shared UI (navigation, modals, editors, IELTS UI) |
| `lib/` | Shared logic, content data, utilities |
| `features/` | **Feature modules** (isolated code paths); see below |
| `supabase/` | SQL schema and migrations |

### Feature modules (`features/`)

Self-contained slices of the app (e.g. **Call Ken**, **Google Drive**). Typical layout per feature:

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
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run start` | Start production server |
| `npm run build:drive-css` | Rebuild `public/gdrive/drive.css` from Drive feature sources |
| `npm run parse-reading` / `parse-speaking` / `parse-writing` | Content pipeline scripts (see `scripts/`) |
