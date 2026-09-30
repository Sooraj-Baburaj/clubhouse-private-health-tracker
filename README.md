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
