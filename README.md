# hltb-calendar-cf

A game-backlog scheduling calendar. Search for games, pull their completion-time estimates from [HowLongToBeat](https://howlongtobeat.com), and lay them out on a month/week calendar that computes when you'll finish each game based on your weekly play schedule. Supports per-day capacity overrides, splitting a game's hours across days, progress tracking, archiving finished games, and optional accounts for syncing your calendar across devices.

## Architecture

Everything runs on a single Cloudflare Worker:

| Layer | Tech | Location |
|-------|------|----------|
| API | [Hono](https://hono.dev) on Cloudflare Workers | `src/api/index.ts` |
| Database | Cloudflare D1 (SQLite) via Drizzle ORM | `src/api/database/`, migrations in `src/api/migrations/` |
| Frontend | React 18 + Vite, served as static assets by the same Worker (`ASSETS` binding) | `src/web/` |
| Auth | Email/password (PBKDF2-SHA256, 100k iterations), server-side sessions in D1, `HttpOnly`/`Secure`/`SameSite=Lax` cookie | `src/api/index.ts` |
| HLTB data | Fetched through an external proxy server (HowLongToBeat blocks Cloudflare IPs) | `PROXY_BASE_URL` + `PROXY_API_KEY` |
| Rate limiting | Cloudflare Workers rate-limit bindings (`unsafe.bindings` in `wrangler.jsonc`): 10 req/min/IP on auth, 30 req/min/IP on HLTB endpoints | `wrangler.jsonc` |

The frontend keeps all state in `localStorage` (works fully logged-out) and, when signed in, autosaves to the server every 2 seconds.

### API endpoints

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/api/auth/register` | POST | – | Create account (email + password ≥ 8 chars), sets session cookie |
| `/api/auth/login` | POST | – | Sign in, sets session cookie |
| `/api/auth/logout` | POST | – | Delete session, clear cookie |
| `/api/auth/me` | GET | – | Current user or `null` |
| `/api/calendar/save` | POST | ✅ | Save calendar state (1 MB max) |
| `/api/calendar/load` | GET | ✅ | Load saved calendar state |
| `/api/hltb/search` | POST | – | Search games by name via the proxy |
| `/api/hltb/fetch` | POST | – | Fetch one game by its HowLongToBeat URL |

See [AUDIT.md](AUDIT.md) for the security review of this surface.

## Setup

```sh
npm install
```

**Secrets** — the proxy API key is not in the repo; set it once per Cloudflare account:

```sh
npx wrangler secret put PROXY_API_KEY
```

For local development, put it in a `.dev.vars` file (gitignored):

```
PROXY_API_KEY=<your key>
```

`PROXY_BASE_URL` is a plain var in `wrangler.jsonc` and needs no setup.

**Database** — apply migrations before first run:

```sh
# local dev database (.wrangler/state)
npx wrangler d1 migrations apply hltb-calendar --local

# production database
npx wrangler d1 migrations apply hltb-calendar --remote
```

## Commands

| Command | What it does |
|---------|--------------|
| `npm run dev` | Runs `wrangler dev` at `http://localhost:8787` — the full Worker (API + assets). Serves the frontend from `dist/`, so run `npm run build` first (and after frontend changes). |
| `npx vite dev` | Alternative dev server with frontend HMR; the Cloudflare Vite plugin runs the Worker alongside it. |
| `npm run build` | Vite production build → `dist/` (client assets + worker bundle). |
| `npm run deploy` | `wrangler deploy` — deploys the Worker. Run `npm run build` first: `npm run build && npm run deploy`. |
| `npm test` | Vitest against the real Workers runtime (`@cloudflare/vitest-pool-workers`). Add `-- --run` for a single non-watch pass. |
| `npm run cf-typegen` | Regenerates `worker-configuration.d.ts` from `wrangler.jsonc`. Rerun after changing bindings/vars. |
| `npx tsc -b` | Typecheck the worker (root `tsconfig.json`). |
| `npx tsc -p tsconfig.app.json --noEmit` | Typecheck the React frontend. |
| `npx drizzle-kit generate` | Generate a new SQL migration after editing `src/api/database/schema.ts` (then apply with `wrangler d1 migrations apply`). |

### Typical workflows

```sh
# local development
npm run build && npm run dev

# ship it
npm test -- --run && npm run build && npm run deploy
```

## Configuration notes

- `wrangler.jsonc` holds all bindings: the `DB` D1 database, the `ASSETS` static-assets binding, `PROXY_BASE_URL`, and the two rate limiters (`RATE_LIMITER_AUTH`, `RATE_LIMITER_HLTB`). The rate limiters use wrangler's experimental `unsafe.bindings` — the "experimental and may change" warning on every build is expected.
- The API degrades gracefully if the rate-limit bindings are unavailable (requests pass through unlimited).
- Design language (colors, typography, layout) is documented in [design.md](design.md).
