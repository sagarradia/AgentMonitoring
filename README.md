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
| `db` (agents, projects, chats, meta/repos), `onSnapshot` | Postgres (Neon via Vercel, or Supabase) through `/api/db/...` route handlers; the page fetches on load and polls every 15 s |
| `sample` (streamed chat) and `sample.json` | `POST /api/chat` (streams from the Anthropic API) and `POST /api/extract` (JSON), server side only |
| `mcp` `list_repos` ("Sync from GitHub") | `GET /api/repos`, which calls GitHub REST `GET /user/repos` with `GITHUB_TOKEN` |
| `downloads` (CSV) | A normal browser Blob download |

**November 2026 update.** The page now matches the Claude artifact at version 9: an Overview landing page,
a Directory (People and Spreadsheet layouts, editable fields and models), a Status report built from the repo
record, Capabilities (skills, plugins and guardrails scoped to everyone, a project, a team or named people),
Connections (models and where their keys live, never the keys), and card layouts with a Spreadsheet switch on
Roster, Todos, Goals and KPIs, and Library. Layout choices are remembered in the browser. Capabilities and model
settings are stored as `meta/ext` and `meta/models`. A one-time upgrade (`meta/upgrade-2026-11`) adds the repo
progress record to existing agents and replaces `meta/report`; it never overwrites memory, docs, skills or routines
you added, or todos you changed.

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
lib/server/          store (Postgres/Neon, Supabase, or a local file), auth, rate limit, Claude client
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
| `DATABASE_URL` | Postgres connection string. Set automatically when you add Neon to the project in Vercel (Storage → Neon). `POSTGRES_URL` is accepted too. |
| `SUPABASE_URL` | Only if you use Supabase instead of Neon: your project URL, `https://<ref>.supabase.co`. |
| `SUPABASE_SERVICE_ROLE_KEY` | Only with Supabase: the service role key (Project Settings → API). Server side only. It bypasses RLS, and the tables give no access to the anon key. |
| `APP_PASSWORD` | The shared login password. If it is unset, nothing can be reached. Changing it signs everyone out. |

Optional: `ANTHROPIC_MODEL` overrides the model (default `claude-opus-5-5`); `AUTO_SEED=off`
turns off loading the seed on first start.

**First start.** With `DATABASE_URL`, the app creates its four tables itself. With any database,
the first request loads `seed.json` (39 agents and the project brief), skips documents that
already exist, and records `meta/seeded` so it never runs again. Agents you delete stay deleted.
For local development without Supabase, `DB_DRIVER=file` stores documents in `.data/db.json`
(`DB_FILE` changes the path). The file driver refuses to run on Vercel.

## Setup

```bash
npm install
```

1. **Database.**
   - **Neon (recommended on Vercel):** nothing to do. Tables and seed data are created on first start.
   - **Supabase:** in the SQL editor, run `supabase/schema.sql`, then `supabase/seed.sql`. Both are
     safe to run again. The schema enables Row Level Security with no policies and revokes access
     from `anon` and `authenticated`, so only the server (service role key) can read or write.
   - To seed from a terminal instead: `npm run seed` (add `-- --force` to overwrite). It uses the
     same environment variables as the app.
2. **Seed data.** Agents are keyed by `id`, projects by project id. The shipped `seed.json` has a
   single `{ "brief": ... }` rather than projects keyed by id, so the seed attaches that brief to the
   project most seed agents belong to (`Skybirds-Empyrean-Avenue__familyvault`).
3. **Run.**
   ```bash
   npm run dev                  # http://localhost:3000, sign in with APP_PASSWORD
   ```
   Without a database: `DB_DRIVER=file npm run seed`, then `DB_DRIVER=file APP_PASSWORD=... npm run dev`.

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

## Deploy (Vercel + Neon)

From the Vercel dashboard:

1. **Add New → Project**, import `sagarradia/AgentMonitoring` (production branch `main`).
   Vercel detects Next.js.
2. In **Environment Variables**, add `ANTHROPIC_API_KEY`, `GITHUB_TOKEN` and `APP_PASSWORD`, then click **Deploy**.
3. In the project, open **Storage → Create Database → Neon** and connect it to the project
   (all environments). This adds `DATABASE_URL`.
4. **Deployments → ⋯ → Redeploy** so the new variable is picked up. Open the URL and sign in. The
   first page load creates the tables and loads the seed.

Or from the CLI: `vercel link`, `vercel env add <NAME> production` for each variable,
`vercel integration add neon`, then `vercel --prod`.

Every preview deployment is behind the same login. If previews should not share the production
database, connect a separate Neon branch to the Preview environment.

## Security notes

- The Anthropic key, the GitHub token and the database credentials are only read on the
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

## Agent controls and the Live tab (November 2026)
Every agent can be activated, paused, rested (with a timer that ends by itself), revoked or withdrawn, one at a time or by team. An agent can have a backup; when a Chief of Staff is away, the backup is named in a banner and told in chat that it is covering. The Live tab shows an overall bar, a bar per team and per agent, and a bar per ticket with its state (running, queued, paused, waiting, done). A bar only shows a percentage someone recorded; running tickets with none show a moving stripe. These controls record the founder's decision on this page and in each agent's chat; they do not stop a scheduled run elsewhere.

## Scope levels, shared items and downloaded files (November 2026)
Guardrails, skills and plugins, and the new Shared items (todo, KPI, goal, memory note, document) can apply to the whole organisation, projects, teams and named individuals, in any mix, with individuals left out. Todos, KPIs and goals are copied onto each agent so each tracks its own progress; narrowing removes copies without progress and keeps the ones with progress. Memory notes and documents are read when an agent chats. A person's card lists what applies to them, with Remove for this person and Give this person something. Capabilities can add skills, plugins and connectors from downloaded files (.zip, .skill, SKILL.md, plugin.json, marketplace.json, .mcp.json): the files are read in the browser and never run, and connector commands and keys are not saved.

## Live feed, real pause switch, grouped tabs

- Tabs are grouped: Overview, Progress (Now, History, Status report), People (Directory, Teams, Library), Work (Todos, Goals & KPIs), Capabilities, Connections.
- **Add a task** works for any agent (person card, Teams panel, Now tab, Work > Todos).
- With `GITHUB_TOKEN` set, the site reads GitHub issues itself (on open, every 5 minutes, and daily by cron) and updates ticket status. Optional `CRON_SECRET` protects the daily cron.
- **Pause all agents** adds or removes the `agents-paused` label on the Agent control issue. This needs the token to have Issues read and write. Per-person Pause/Rest/Revoke only record a decision.
- Saves check the last-seen version; if another device changed the same item first, you get a message and the latest copy.

## Task plans, helper agents and brains

- **Add a task** also records tools, skills, plugins, memory sources, a model and helper agents. Defaults come from the task and the first agent. The model suggestion is the cheapest connected model that is accurate enough (`lib/taskplan.ts`; the cost and accuracy ratings are rough estimates, not prices). Leads (Head level, CTO, Chief of Staff) always get the most accurate model and their own brain.
- **Brain and memory** is in every agent's Edit panel, profile card and the Build-an-agent form.
- Pause, Rest and Revoke on a person also set the label `agent-paused:<name>` on the Agent control issue. An agent only obeys it once its role file says to look for that label (a founder-only change in FamilyVault).
- The page refreshes every 5 seconds while visible, and straight away when you return to the tab.
