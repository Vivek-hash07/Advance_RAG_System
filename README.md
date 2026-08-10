# Vectorless RAG

Local RAG app that indexes PDFs, images, webpages, and YouTube (videos + playlists) with [PageIndex](https://pageindex.ai) trees — no document embeddings. Answers cite pages, timestamps, or original links. Auth is [Better Auth](https://www.better-auth.com/); long ingest runs through [Inngest](https://www.inngest.com/). Webpage fetch uses [Scrapling](https://scrapling.readthedocs.io/en/latest/).

## Prerequisites

- Node 20+
- A Postgres database (Neon works well)
- API keys: OpenAI, PageIndex, YouTube Data API v3
- Optional: Google OAuth client for “Sign in with Google”

## Setup

```bash
cp .env.example .env
# Fill every required key in .env (see below)
npm install
npm run db:deploy
npm run db:generate

# Webpage scraping (Scrapling) — Python 3.10+
/opt/homebrew/bin/python3.13 -m venv scripts/scrapling/.venv
scripts/scrapling/.venv/bin/pip install -r scripts/scrapling/requirements.txt
```

### Required environment variables

Copy from `.env.example`. Keep values on their own line — **do not** put `# comments` on the same line as a URL (Better Auth will treat the comment as part of the origin).

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Postgres connection string |
| `BETTER_AUTH_SECRET` | Long random secret for auth |
| `BETTER_AUTH_URL` | App origin, e.g. `http://localhost:3000` |
| `NEXT_PUBLIC_BETTER_AUTH_URL` | Same origin (browser auth client) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth |
| `PAGEINDEX_API_KEY` | Document tree indexing |
| `OPENAI_API_KEY` | OpenAI (`sk-…`) or OpenRouter (`sk-or-v1-…`) key for routing + answers |
| `OPENAI_BASE_URL` | Optional. Auto-set to OpenRouter when the key is `sk-or-v1-…` |
| `CHAT_MODEL` / `REASONING_MODEL` | Defaults to `gpt-4o-mini` (OpenRouter: `openai/gpt-4o-mini`) |
| `YOUTUBE_API_KEY` | Video/playlist metadata (transcripts use YouTube’s public player) |
| `INNGEST_DEV` | Set to `1` for local Inngest |

Optional tuning knobs (`YOUTUBE_EAGER_BUILD_MAX`, retrieval limits, etc.) are documented in `.env.example`.

## Run locally

You need **two** terminals. Keep the app on port **3000** so auth and Inngest URLs stay aligned.

```bash
# Terminal 1 — Next.js
npm run dev

# Terminal 2 — Inngest (runs ingest jobs)
npm run inngest
```

- App: [http://localhost:3000](http://localhost:3000)
- Inngest Dev UI: [http://localhost:8288](http://localhost:8288)

If something else already owns port 3000, free it before starting (`lsof -iTCP:3000 -sTCP:LISTEN`). Running on `3001` will break Better Auth (`Invalid origin`) unless you update both auth URL env vars to match.

### After pulling schema changes

```bash
npm run db:deploy
npm run db:generate
# then restart `npm run dev`
```

## Smoke checklist (Phase 0)

Automated prerequisites:

```bash
npm run verify:phase0
```

Manual UI smokes (signed in, with both `dev` and `inngest` running):

1. **PDF** — upload a PDF → status `ready` → ask a question → answer includes a page citation.
2. **YouTube video** — paste a watch URL → `ready` → ask → answer includes a timestamp deep link.
3. **Playlist** — small playlist (≤20 videos) builds eagerly; larger ones show a pending-video notice until a routed video is built on demand.
4. **Webpage** — paste a public URL → Scrapling scrape → `ready` → ask → citation links back to the page.
5. **Image** — upload PNG/JPEG/WebP/GIF → vision transcription → `ready` → ask with page citations.

Offline / API helpers (no full ask path):

```bash
npm run verify:ingest
npm run verify:youtube          # offline
npm run verify:youtube -- --live  # needs YOUTUBE_API_KEY
npm run verify:webpage          # Scrapling fetch only (no PageIndex)
```

## Scripts

| Script | What it does |
|--------|----------------|
| `npm run dev` | Next.js on port 3000 |
| `npm run inngest` | Local Inngest Dev Server → `/api/inngest` |
| `npm run db:deploy` | Apply Prisma migrations |
| `npm run db:generate` | Regenerate Prisma client |
| `npm run db:migrate` | Create/apply a migration in development |
| `npm run verify:phase0` | Env + DB + Inngest route health |
| `npm run verify:ingest` | Offline file/PDF conversion checks |
| `npm run verify:youtube` | YouTube URL/transcript helpers |
| `npm run verify:webpage` | Scrapling webpage scrape (no PageIndex) |

## Product roadmap

See [ROADMAP.md](./ROADMAP.md) for phases (stabilize → YouTube polish → conversations/Mem0 → new source types → production).
