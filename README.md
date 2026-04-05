# Ken Workspace

> A self-built English learning environment — because the best way to get fluent is to build the tools you actually want to use.

I learn English by reading real news, practicing IELTS, and looking up words mid-sentence. Every feature in this app exists because I needed it and couldn't find exactly what I wanted elsewhere. Over time it grew into a full-stack production app that I use daily.

---

## The story

Learning a language daily means constantly switching contexts: you read an article, hit an unknown word, look it up, want to save it, come back later to practice it, get distracted, need to refocus. Most tools solve only one of those steps in isolation. This app connects them all.

**You read → you look up → you save → you practice → you focus.**

- **News** (`/news`) is the starting point. Real articles from The Guardian and Engoo Daily News, rendered with zero loading stutter via server-side pre-fetch and HTTP caching. You pick a story, you read it in English.

- **Dictionary & Translate** (`/dictionary`, `/translate`) are the interruption layer — the moment you hit an unfamiliar word mid-article, you query OpenAI for a full definition, example sentences, and a Vietnamese gloss. No tab-switching.

- **Library & History** (`/library`, `/history`) close the loop. Words you look up are saved and browsable, so nothing disappears into the void.

- **Flashcards** (`/flashcards`) turn your saved vocabulary into spaced-repetition review cards backed by Supabase — synced across devices.

- **IELTS suite** (`/listening`, `/ielts-reading`, `/ielts-writing`, `/ielts-speaking`) covers structured exam practice when you want to go beyond passive reading. The speaking module scores your responses with OpenAI.

- **AI Realtime Speaking** (`/real-time-call`) is a live voice conversation with an AI tutor — WebRTC via LiveKit, scored and transcribed in real time.

- **Spotify** (`/spotify`) is the music layer — a full Web Playback SDK integration with OAuth PKCE flow, playlist browser, and a floating dock that survives client-side navigation without losing playback state (a module-level singleton keeps the SDK player alive across route changes).

- **Ambient Sounds** (floating widget, every page) generates Rain, Café, and Ocean noise entirely in the browser using Web Audio API — three layered noise sources (white/pink/brown) with per-layer EQ filters and convolution reverb. No external audio files, no network requests. Good for focusing without lyrics.

- **Notes, Calendar, Study Schedule** (`/notes`, `/calendar`, `/study-schedule`) are the planning layer — Supabase-backed so changes sync across devices.

- **Google Drive** (`/drive`) lets you browse and open your own Drive files without leaving the app. OAuth scoped to read-only.

---

## Tech highlights (for technical reviewers)

| Concern | Approach |
|---------|----------|
| Framework | Next.js 15 App Router, React 19, TypeScript |
| Styling | Tailwind CSS |
| Auth & data | Supabase (PostgreSQL + Row Level Security) |
| AI | OpenAI — definitions, scoring, realtime voice (WebRTC) |
| Music | Spotify Web Playback SDK — PKCE OAuth, module-level player singleton to survive navigation |
| Audio synthesis | Web Audio API — multi-layer noise (white/pink/brown) + BiquadFilter EQ + convolution reverb |
| Performance | Async Server Components + in-memory cache + `Cache-Control: s-maxage` headers — news list loads with zero client waterfall |
| Realtime voice | LiveKit WebRTC + OpenAI Realtime API |
| Google OAuth | Drive read-only via NextAuth |
| Deployment target | Vercel + Supabase + optional Cloudflare R2 |

---

## Running locally

### 1. Install dependencies

```bash
npm install
cp .env.example .env.local
```

Edit `.env.local` — every variable is documented with comments in `.env.example`.

### 2. Minimum env to open the app

| Feature | Required vars |
|---------|---------------|
| Auth + synced data | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| AI (dictionary, translate, speaking) | `OPENAI_API_KEY` |
| Spotify | `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`, `SPOTIFY_TOKEN_ENCRYPTION_KEY` |
| Google Drive | `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` |
| Realtime voice calls | `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `NEXT_PUBLIC_LIVEKIT_URL` |
| Avatar uploads | `SUPABASE_JWT_SECRET`, `SUPABASE_SERVICE_ROLE_KEY` |

Most routes degrade gracefully — the portfolio, news, dictionary, and ambient player all work without Supabase.

### 3. Database

Create a Supabase project, copy your URL + anon key, and run the migration files (if present in `supabase/migrations/`) in timestamp order via the SQL Editor. If the migrations folder is missing from your clone, contact the author for the SQL bundle.

### 4. Start the dev server

```bash
npm run dev
```

Opens at **http://127.0.0.1:3000** (bound to `127.0.0.1` by default).

---

## Route map

| Path | What it does |
|------|--------------|
| `/` | Portfolio / landing |
| `/news` | News feed — Guardian (world/sport) + Engoo Daily News |
| `/dictionary` | Word lookup with AI definitions and examples |
| `/translate` | Sentence-level translation with OpenAI |
| `/library`, `/history` | Saved words and lookup history |
| `/flashcards` | Spaced-repetition vocabulary cards (Supabase) |
| `/listening` | IELTS Listening practice |
| `/ielts-reading` | IELTS Reading practice |
| `/ielts-writing` | IELTS Writing practice |
| `/ielts-speaking` | IELTS Speaking practice with AI scoring |
| `/real-time-call` | Live AI voice conversation (LiveKit + OpenAI Realtime) |
| `/spotify` | Spotify player — full Web Playback SDK integration |
| `/notes` | Markdown notes (Supabase) |
| `/calendar` | Study calendar (Supabase) |
| `/study-schedule` | Weekly study planner |
| `/drive` | Google Drive browser (OAuth, read-only) |
| `/profile` | User settings and avatar |

---

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Dev server at `127.0.0.1:3000` |
| `npm run build` | Production build |
| `npm run start` | Start production server |
| `npm run lint` | ESLint |
| `npm run build:drive-css` | Rebuild `public/gdrive/drive.css` |
| `npm run hash-password` | Hash a password for seeding/support |

---

## Repository layout

```
app/          — Next.js routes and API route handlers
components/   — Shared UI components
lib/          — Shared logic, utilities, API helpers
features/     — Self-contained feature modules (e.g. call-ken, drive)
supabase/     — SQL migrations (when present)
```
