# Agent Desk

A private, single-page CRM for AI agents: GitHub projects in a rail, an agent tree shown as a
spreadsheet (goals, KRAs, KPIs, todos, routines, memory, docs, skills), a chat with each agent,
a proposals list built from the chat, and a "build an agent" wizard.

This is the Next.js (App Router, TypeScript) version of `agent-desk.html`, which was written for
the Claude artifact runtime. The UI and behaviour are unchanged. `e2e/parity.spec.ts` renders the
original file and this app with the same data and checks that the markup is identical across
12 screens. What changed is the plumbing:

| Artifact capability (`window.claude`) | Here |
|---|---|
| `db` (agents, projects, chats, meta/repos), `onSnapshot` | Supabase Postgres via `/api/db/...` route handlers; the page fetches on load and polls every 15 s |
| `sample` (streamed chat) and `sample.json` | `POST /api/chat` (streams from the Anthropic API) and `POST /api/extract` (JSON), server side only |
| `mcp` `list_repos` ("Sync from GitHub") | `GET /api/repos`, which calls GitHub REST `GET /user/repos` with `GITHUB_TOKEN` |
| `downloads` (CSV) | A normal browser Blob download |

The whole app sits behind a shared-password login, and every API route has a per-IP rate limit.

## Layout

```
app/                 pages (/, /login) and route handlers under app/api
  api/db/[collection]/route.ts        GET  /api/db/:collection
  api/db/[collection]/[id]/route.ts   GET, PUT, DELETE /api/db/:collection/:id
  api/chat, api/extract, api/repos, api/config, api/login, api/logout
components/desk.ts   the view: render functions and event handlers ported from the original page
lib/                 typed logic: model (dates, flags, tree), templates, prompts, csv, seed
lib/client/runtime.ts  browser replacements for db / sample / mcp / downloads
lib/server/          store (Supabase, or a local file), auth, rate limit, Claude client
proxy.ts             login wall in front of every page and API route
supabase/schema.sql  tables agents, projects, chats, meta (id text pk, data jsonb, updated_at)
scripts/seed.ts      loads seed.json
```

## Environment variables

Copy `.env.example` to `.env.local` and fill it in. Never commit real values (`.env*` is ignored).

| Name | What it is |
|---|---|
| `ANTHROPIC_API_KEY` | Anthropic API key. Used only by `/api/chat` and `/api/extract` on the server. Without it, chat and "Generate with Claude" are hidden, as they were when the artifact had no Claude access. |
| `GITHUB_TOKEN` | GitHub token with read-only access: a fine-grained token with **Metadata: read** on the repositories you want listed (or a classic token with no scopes for public repos only). Without it, "Sync from GitHub" is hidden. |
| `SUPABASE_URL` | Your project URL, `https://<ref>.supabase.co`. |
| `SUPABASE_SERVICE_ROLE_KEY` | The service role key (Project Settings → API). Server side only. It bypasses RLS, and the tables give no access to the anon key. |
| `APP_PASSWORD` | The shared login password. If it is unset, nothing can be reached. Changing it signs everyone out. |

Optional: `ANTHROPIC_MODEL` overrides the model (default `claude-opus-5-5`).
For local development without Supabase, `DB_DRIVER=file` stores documents in `.data/db.json`
(`DB_FILE` changes the path). The file driver refuses to run on Vercel.

## Setup

```bash
npm install
```

1. **Database.** In the Supabase dashboard, open the SQL editor, paste `supabase/schema.sql` and run it.
   The schema is safe to run again. It enables Row Level Security with no policies and revokes
   access from `anon` and `authenticated`, so only the server, using the service role key, can
   read or write.
2. **Seed.** With `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in your shell or `.env.local`:
   ```bash
   set -a; source .env.local; set +a
   npm run seed                 # loads seed.json; existing documents are kept
   npm run seed -- --force      # overwrite documents that already exist
   ```
   Agents are keyed by their `id`. Projects are keyed by project id. The shipped `seed.json` has a
   single `{ "brief": ... }` rather than projects keyed by id, so the seed script attaches that brief
   to the project most seed agents belong to (`Skybirds-Empyrean-Avenue__familyvault`).
3. **Run.**
   ```bash
   npm run dev                  # http://localhost:3000, sign in with APP_PASSWORD
   ```
   Without Supabase: `DB_DRIVER=file npm run seed`, then `DB_DRIVER=file APP_PASSWORD=... npm run dev`.

## Tests

```bash
npm run lint                     # tsc --noEmit
npm test                         # unit tests: db routes, CSV builder, auth, Claude routes (SDK mocked), prompts, seed
npm run build && npm run test:e2e
```

The browser tests run a production build against a freshly seeded local file store. They make no
calls to Supabase, Anthropic or GitHub.
- `e2e/roster.spec.ts` signs in, checks the seeded roster (39 agents), expands an agent, edits a
  todo's due date, reloads, and checks the date persisted.
- `e2e/parity.spec.ts` compares the markup with the original `agent-desk.html`.

If Playwright's bundled Chromium is missing, set `PW_CHROMIUM=/path/to/chromium`.

## Deploy (Vercel)

```bash
npm i -g vercel
vercel login
vercel link                                   # create or link the project
vercel env add ANTHROPIC_API_KEY production
vercel env add GITHUB_TOKEN production
vercel env add SUPABASE_URL production
vercel env add SUPABASE_SERVICE_ROLE_KEY production
vercel env add APP_PASSWORD production
vercel --prod
```

Each `vercel env add` prompts for its value, so values don't end up in your shell history. Add the
same variables for `preview` if you use preview deployments. Every preview URL is behind the same
login. Run the schema and the seed against the production Supabase project before the first visit.

## Security notes

- The Anthropic key, the GitHub token and the Supabase service role key are only read on the
  server. The browser never sees them, and none are in the repository.
- Request bodies and chat text are never logged. Errors are logged as route, error class and
  HTTP status only.
- The session cookie is HttpOnly, SameSite=Lax and Secure on HTTPS. It holds an expiry signed with
  HMAC-SHA256 under `APP_PASSWORD`, and lasts 14 days.
- Rate limits per IP: 240 db requests/min, 20 Claude requests/min, 10 GitHub syncs/min, 10 login
  attempts per 15 min. They are kept in memory per server instance, which is enough to stop a
  runaway client or a password guesser on a private tool. They are not a global quota.
- Pages send `X-Robots-Tag: noindex` and `robots.txt` disallows everything.
- The agent prompt keeps the original honesty rules: the agent has no run logs, so its reasons are
  a reading of the records, not a report of what happened.
