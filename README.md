# Clubhouse

A private, invite-only health tracker for a group of friends. Members log what they eat (by photo or search) and what
they burn, follow a diet plan their admin writes, keep "momentum" streaks that pause instead of breaking, and cheer each
other on in one team chat with admin-configured meme triggers.

Two apps share one API:

| Surface | Path | Stack |
|---|---|---|
| Member app (installable PWA) | `/` | React 19, Vite, TanStack Router + Query, Tailwind v4, motion, Workbox |
| Admin panel | `/admin` | Same stack, desktop-first |
| API | `/api` | Hono on Node 22, Drizzle ORM, Postgres, zod |

AI (Claude, through a single gateway in `packages/ai-gateway`) speeds up photo logging, natural-language entry, the
daily coach card, progress narratives and diet drafts. Every AI feature has a logic-only path, and AI can be switched
off team-wide from the admin panel.

## Repository

```
apps/web            member PWA (atomic design: ui/atoms → molecules → organisms, pages, features, infrastructure)
apps/admin          admin SPA
packages/contracts  zod schemas and DTOs shared by the API and both apps
packages/domain     pure logic engine: targets, burn, bands, streaks, forecasts, triggers, scheduling (no I/O)
packages/ai-gateway the only code that talks to Claude; registry, budgets, pricing, guard tests
packages/db         Drizzle schema, SQL migrations, seeds (foods, activity types, triggers, pricing)
packages/server     Hono API: application use cases, infrastructure adapters, HTTP interface, jobs
packages/client     typed fetch client used by both apps
packages/ui         theme-agnostic primitives (sheets, dialogs, charts, toasts, motion presets)
e2e                 Playwright suites (member on iPhone/Pixel emulation, admin on desktop)
scripts             Vercel Build Output assembly
infra               docker-compose for local Postgres (and optional MinIO)
```

## Run it locally

Requirements: Node 22, pnpm 10, Docker.

```bash
pnpm install
cp .env.example .env            # the defaults work for local development
pnpm db:up                      # Postgres on localhost:54329
pnpm db:migrate
pnpm seed:all                   # activity types, pricing, ~2,100 foods, starter meme triggers
pnpm setup:super-admin --username you --name "Your Name"   # prints a one-time password
pnpm seed:demo                  # optional: 6 demo members with 30 days of logs (password clubhouse-demo-1)
pnpm dev                        # API :3000, member app :5173, admin :5174/admin/
```

Local defaults: images are stored on disk under `.data/storage` (`STORAGE_DRIVER=local`), AI answers come from
deterministic mocks (`AI_MODE=mock`), realtime is replaced by polling, and push is disabled until VAPID keys are set.
To try real Claude calls set `AI_MODE=live` and `ANTHROPIC_API_KEY`, then switch AI on in Admin › AI.

Testing on a phone: run `pnpm dev`, open `http://<your-lan-ip>:5173` on the phone. Camera and push need HTTPS, so for
those use a tunnel (for example `cloudflared tunnel --url http://localhost:5173`) and add the tunnel origin to
`EXTRA_ORIGINS` in `.env`.

## Commands

| Command | What it does |
|---|---|
| `pnpm dev` | API + both apps with hot reload |
| `pnpm typecheck` / `pnpm lint` | TypeScript and ESLint across the monorepo |
| `pnpm test` | Unit tests (domain engine, AI gateway guards, copy lint) |
| `pnpm test:integration` | API tests against a throwaway `clubhouse_test` database |
| `pnpm test:e2e` | Playwright suites (needs a migrated and seeded database) |
| `pnpm build` | Both apps + the API bundle into `.vercel/output` |
| `pnpm db:generate` | New migration from schema changes |
| `pnpm db:reset` | Drop and recreate the local schema |
| `pnpm icons` | Regenerate PWA icons from the logo |

## Seeds: what runs where

| Command | Local | Production | What it writes |
|---|---|---|---|
| `pnpm seed:static` | yes | yes (run automatically by the migrate workflow) | activity types with MET values, AI model pricing |
| `pnpm seed:foods` | yes | yes, once (safe to re-run; never overwrites admin edits) | ~650 Indian foods with household servings + ~1,500 USDA basics |
| `pnpm seed:triggers` | yes | yes, once | the starter meme-trigger catalogue, switched off |
| `pnpm setup:super-admin` | yes | yes, once (or `POST /api/setup`) | the team and the first Super Admin |
| `pnpm seed:demo` | yes | **never** (refuses when `NODE_ENV=production`) | 6 fake members with 30 days of logs, plans, chat and memes |

## Headless API

The backend is a standalone, headless HTTP API: `packages/server` (Hono) with no UI code, a typed contract
(`packages/contracts`) and a typed client (`packages/client`). Both front-ends are static SPAs that only call it:

```
apps/web  (member PWA)  ─┐                         ┌─ /api/*        member endpoints
                         ├─ @clubhouse/client ──▶ packages/server ─┤
apps/admin (admin SPA)  ─┘                         └─ /api/admin/*  admin endpoints (role + re-auth guarded)
```

- **One API, two audiences.** Member and admin endpoints live in the same service under different prefixes and
  middleware, sharing one domain engine and database. Splitting them into two services would duplicate auth,
  validation and business rules without any scaling benefit at this size.
- **Runs anywhere Node runs.** `src/dev.ts` is a plain Node HTTP server; `src/vercel.ts` adapts the same app to a
  Vercel function. Docker, Fly, Railway or a VM work the same way. Another client (a native app, a bot) can use the
  same API with the same session cookie or a `Authorization: Bearer` token.
- **Same-origin by default.** Both SPAs and the API are served from one domain (`/`, `/admin`, `/api`), so the
  session cookie stays `SameSite=Lax`, there is no CORS surface, and CSRF protection is a header + origin check.
  Moving the API to its own domain (e.g. `api.example.com`) would need CORS with credentials and `SameSite=None`
  cookies.
- **Scaling.** The API is stateless: every instance can serve any request, so Vercel (or any host) scales it
  horizontally. Shared state lives in Postgres (connection pooler, short transactions, indexed queries), object
  storage (presigned URLs, so images never pass through the API after upload) and Supabase Realtime (live hints).
  Background work uses lease rows, so any number of instances can receive the scheduler tick safely. The first limits
  you would meet are Postgres connections and the free-tier quotas, long before the API design itself.

## Offline data and caching

Three layers, each with one job:

| Layer | Holds | Revalidation |
|---|---|---|
| **Service worker** (`apps/web/src/sw.ts`) | App shell, fonts, photos; network-first copies of screen endpoints | New app version → update prompt; photos stale-while-revalidate |
| **Query cache** (TanStack Query, persisted to IndexedDB) | Screen data: Today, Diet, Progress, Inbox, profile | Stale-time per query, refetch on focus/reconnect, realtime hints |
| **Synced collections** (`apps/web/src/infrastructure/cache`) | Large datasets: the food catalogue (~2,100 foods) and chat history (up to 2,000 messages) | Delta sync (below) |

Synced collections live in IndexedDB and memory, so food search and chat open instantly and work offline. Each one
pulls only what changed since its last sync (`GET /api/foods/catalog?since=`, `GET /api/chat/changes?since=`); database
triggers keep `updated_at` current on every edit and reaction, and each delta re-reads a two-minute overlap so late
commits are never missed. The shared engine (`cache/engine.ts`) handles:

- **Scope:** data belongs to one person on one team; another sign-in, sign-out or a new payload format drops it.
- **Triggers:** session start, tab focus, back online, realtime hints (`chat.*`, `foods.changed`), local writes,
  a 60 s chat interval as a realtime fallback, and "Refresh now" in Settings › App.
- **Freshness:** foods are considered fresh for 6 h, chat for 15 s; forced triggers ignore that.
- **Robustness:** one pull at a time, a Web Lock so only one tab syncs, BroadcastChannel so other tabs re-read,
  exponential backoff on errors (data is never thrown away on failure), a full re-download every few days and
  whenever the server says `reset` (e.g. after an admin clears chat), quota handling, and persistent-storage requests.

Food search is local-first: results appear on every keystroke from the cached catalogue, and when online the server's
ranking (with recents and favourites) is merged in for the same query.

## Architecture notes

- **Clean architecture.** Routes (`packages/server/src/interface/http`) validate input and call use cases in
  `application/`, which depend on ports (`application/ports.ts`) implemented in `infrastructure/`. All maths lives in
  `packages/domain` and is unit-tested.
- **Offline first.** Food, activity, weight and chat writes use client-generated ids and an IndexedDB outbox; the API
  upserts with last-write-wins on `clientUpdatedAt`, so replays never duplicate.
- **Jobs on serverless.** A pinger calls `POST /api/jobs/tick` every minute; each run takes a lease row, replies
  immediately and finishes its bounded, idempotent steps in the background (notifications, nightly rollovers, recaps,
  retention, housekeeping, budget alerts). Vercel's daily cron is the catch-up.
- **AI boundary.** Only `packages/ai-gateway/src/client.ts` imports the Anthropic SDK; a guard test and an ESLint rule
  enforce it. Every call is budgeted, logged in `ai_calls` and priced from `ai_pricing`.

Deployment: see [DEPLOY.md](DEPLOY.md).
