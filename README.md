# Vector RAG

Local RAG app that indexes PDFs, Word documents, text and markdown, VTT captions, images, webpages, and YouTube videos and playlists in [Qdrant](https://qdrant.tech). Answers cite pages, timestamps, or original links. Chat memory is stored in Postgres. Auth is [Better Auth](https://www.better-auth.com/). Webpage fetch is a plain HTTP request with an SSRF check. The ask path is a [LangGraph](https://langchain-ai.github.io/langgraph/) pipeline. Indexing finishes inside the upload request.

## Prerequisites

- Node 20+
- A Postgres database (Neon works well)
- A Qdrant cluster (`QUDRANT_API_KEY` and `CLUSTER_ENDPOINT`)
- API keys: OpenAI or OpenRouter, YouTube Data API v3
- Optional: Google OAuth client for “Sign in with Google”

## Setup

```bash
cp .env.example .env
# Fill every required key in .env (see below)
npm install
npm run db:deploy
npm run db:generate
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
| `OPENAI_API_KEY` | OpenAI (`sk-…`) or OpenRouter (`sk-or-v1-…`) key for routing, embeddings, and answers |
| `OPENAI_BASE_URL` | Optional. Auto-set to OpenRouter when the key is `sk-or-v1-…` |
| `CHAT_MODEL` / `REASONING_MODEL` | Defaults to `gpt-4o-mini` (OpenRouter: `openai/gpt-4o-mini`) |
| `EMBEDDING_MODEL` | Defaults to `text-embedding-3-small` (OpenRouter: `openai/text-embedding-3-small`) |
| `CHUNK_MODEL` | Model that groups text into topical chunks. On OpenRouter the default is the free `liquid/lfm-3-1.7b:free`. Set `AGENTIC_CHUNKING=0` to skip it |
| `QUDRANT_API_KEY` | Qdrant Cloud API key |
| `CLUSTER_ENDPOINT` | Qdrant cluster URL. Port `6333` is added when none is set |
| `YOUTUBE_API_KEY` | Video/playlist metadata (transcripts use YouTube’s public player) |

Optional tuning knobs (playlist size, retrieval limits, etc.) are documented in `.env.example`.

## Run locally

Keep the app on port **3000** so auth URLs stay aligned.

```bash
npm run dev
```

- App: [http://localhost:3000](http://localhost:3000)

If something else already owns port 3000, free it before starting (`lsof -iTCP:3000 -sTCP:LISTEN`). Running on `3001` will break Better Auth (`Invalid origin`) unless you update both auth URL env vars to match.

### After pulling schema changes

```bash
npm run db:deploy
npm run db:generate
# then restart `npm run dev`
```

## How a source becomes searchable

Every source is turned into text, then into chunks, then into vectors in the `rag_chunks` Qdrant collection. Chunking is the same for all of them. A small free model (`liquid/lfm-3-1.7b:free` on OpenRouter) reads numbered passages and groups the ones that share a topic. It never rewrites the source text. Each stored chunk is still capped at 1,200 characters with 200 characters of overlap when a group has to be cut. PDF page markers stay on their own page, and the first `[HH:MM:SS]` in a chunk is the timestamp citation. If the free model is rate-limited or returns nothing usable, that window falls back to the character splitter and indexing continues.

| Source | What is extracted before chunking |
|--------|-----------------------------------|
| PDF | Per-page text, marked `## Page N`, so a citation can name the page |
| Word (`.docx`) | Headings, paragraphs, and lists via Mammoth. Legacy `.doc` is rejected |
| Text / Markdown | The file as-is, including headings |
| Image | A vision model transcribes the picture into Markdown (OCR plus a short description) |
| WebVTT | Caption cues merged by speaker, each paragraph prefixed with `[HH:MM:SS]` |
| Webpage | An HTTP fetch keeps headings and lists; the source URL is stored for the citation |
| YouTube video | Public captions, grouped by chapter or by 5-minute windows, with `[HH:MM:SS]` on each paragraph |
| Playlist | The listing is saved, then every video's captions are chunked before the playlist is marked ready. A question about the series uses that catalog (channel and video order) plus the matching transcript chunks |

A question then rewrites the query, searches those chunks, and answers from the top matches with page, timestamp, or link citations. Chat memory is a separate Postgres table, searched from the `user_memories` collection.

## Smoke checklist (Phase 0)

Automated prerequisites:

```bash
npm run verify:phase0
```

Manual UI smokes (signed in, with `npm run dev` running):

1. **PDF** — upload a PDF → status `ready` → ask a question → answer includes a page citation.
2. **YouTube video** — paste a watch URL → `ready` → ask → answer includes a timestamp deep link.
3. **Playlist** — adding it chunks every video before the source shows ready. A question picks the playlist instead of unrelated files, and can answer who made it and where the series starts from the video list.
4. **Webpage** — paste a public URL → page fetch → `ready` → ask → citation links back to the page.
5. **Image** — upload PNG/JPEG/WebP/GIF → vision transcription → `ready` → ask with page citations.

Offline / API helpers (no full ask path):

```bash
npm run verify:ingest
npm run verify:youtube          # offline
npm run verify:youtube -- --live  # needs YOUTUBE_API_KEY
npm run verify:webpage          # webpage fetch only
```

## Scripts

| Script | What it does |
|--------|----------------|
| `npm run dev` | Next.js on port 3000 |
| `npm run db:deploy` | Apply Prisma migrations |
| `npm run db:generate` | Regenerate Prisma client |
| `npm run db:migrate` | Create/apply a migration in development |
| `npm run verify:phase0` | Env and database health |
| `npm run verify:ingest` | Offline file/PDF conversion checks |
| `npm run verify:youtube` | YouTube URL/transcript helpers |
| `npm run verify:webpage` | Webpage scrape |
| `npm run verify:qdrant` | Qdrant credentials and collection setup |
| `npm run verify:chunk` | One sample of the free chunk model |

## Product roadmap

See [ROADMAP.md](./ROADMAP.md) for the original product phases. Document retrieval now uses Qdrant vectors, and chat memory is stored in Postgres.
