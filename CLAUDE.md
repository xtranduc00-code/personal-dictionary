# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Ken Workspace — a full-stack English learning platform with news reading, AI dictionary, IELTS practice, real-time voice tutoring, Spotify integration, chess, notes, and more. Built for daily personal use.

## Commands

```bash
npm run dev          # Dev server at http://127.0.0.1:3000 (webpack mode)
npm run build        # Production build (webpack)
npm run build:clean  # Clean .next/ then build
npm run lint         # ESLint (flat config, ESLint 9)
npm run start        # Start production server
```

No test suite exists in this repo.

## Stack

- **Next.js 16** (App Router, Server Components by default), **React 19**, **TypeScript 5** (strict)
- **Tailwind CSS 4** via `@tailwindcss/postcss` (no tailwind.config.ts — defaults only; separate `tailwind.drive.config.cjs` for Google Drive feature CSS)
- **Supabase** for PostgreSQL + auth + storage (Row Level Security)
- **OpenAI API** for definitions, scoring, transcription, realtime voice
- **Spotify Web Playback SDK** with PKCE OAuth
- **LiveKit** for WebRTC voice calls
- **Netlify** primary deployment; **Vercel** optional (cron config in `vercel.json`)
- Package manager: **npm** (both `package-lock.json` and `pnpm-lock.yaml` exist; npm is the active one)

## Architecture

### Directory layout

- `app/` — Next.js App Router: pages, layouts, API routes
- `components/` — Shared React components
- `lib/` — Utilities, API helpers, content generators (IELTS data lives in `lib/engnovate-*-generated/`)
- `features/` — Self-contained modules: `call-ken/` (LiveKit voice), `google-drive/` (Drive OAuth browser)
- `hooks/` — Custom React hooks
- `data/` — Static JSON bundled for API routes (`chess-puzzles.json`, `common-words.json`)
- `scripts/` — Node/Deno utilities, SQL migrations
- `netlify/` — Netlify plugins (cache persistence)
- `types/` — TypeScript declarations (Spotify SDK, Drive OAuth)

### Key architectural patterns

**Server vs Client**: Most pages are Server Components. Client components handle interactive UIs (IELTS tests, Spotify player, chess board). API routes handle auth, AI calls, and news caching.

**State management**: React Context only (no Redux/Zustand). Key contexts: `AuthProvider`, `MeetCallProvider`, `YTPlayerProvider`, `I18nProvider`, `ToastProvider`.

**Auth**: Custom username/email + bcrypt password stored in Supabase. Google OAuth via NextAuth 5 (Drive only). Spotify uses PKCE with encrypted httpOnly cookie tokens.

**Data bundling**: `next.config.ts` uses `outputFileTracingIncludes` to bundle `data/` JSON files into serverless functions. `outputFileTracingExcludes` keeps `public/` out of server traces.

**External packages**: Several native Node modules (`pdf-parse`, `@napi-rs/canvas`, `mammoth`, `xlsx`, `jsdom`) are in `serverExternalPackages` to avoid bundling issues.

**Spotify singleton**: The Web Playback SDK player is a module-level singleton that survives client-side navigation.

**Ambient sounds**: Generated entirely via Web Audio API (white/pink/brown noise + EQ + convolution reverb) — no audio files.

### Environment

All env vars are documented in `.env.example`. Public vars use `NEXT_PUBLIC_` prefix. Most routes degrade gracefully without all vars configured.

## IELTS UI conventions (from .cursor/rules)

- IELTS Listening and Reading share styles from `components/ielts/shared/questionStyles.ts`
- SingleChoiceSection: circle radio + content only (no A/B/C labels)
- ChooseTwoSection: circle checkbox (`rounded-full`) + content only
- Notes/fill-in-blank: keep `leading-relaxed`/`leading-8` and spacing consistent between Listening and Reading
- Transcript highlights: green for correct (`explanation-highlight`), red for wrong (`transcript-sentence-wrong`)
- Test content data is in `lib/engnovate-*-generated/` — change data there, not per-test components
