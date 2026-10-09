# Ship Plan: security hardening → free-tier launch

> Written 2026-10-09. Goal: ship **fast** on **free tiers**. The host is not chosen yet
> (Adi decides when and how). Every phase below works on any host; the decisions that
> depend on the host are marked **[host]**.
>
> Source checklist: OWASP Top 10:2025, the OWASP WebSocket cheat sheet, the Prisma raw-query
> docs. The audit of this repo against that checklist is in the table at the bottom.

---

## The one decision that shapes everything: serve from one origin

The backend already serves `frontend/dist` (`ServeStaticModule` in `app.module.ts`), so
the whole app can run on **one free web service at one URL**. Do that. Do not split the
frontend onto Vercel and the API onto another host.

- **Cookies just work.** Moving the refresh token into an `HttpOnly` cookie (Phase 1)
  only works cleanly when the cookie is first-party. With two domains it becomes a
  third-party cookie (`SameSite=None`), and Safari and Firefox block those.
- **CORS stops mattering.** It's the same origin, so `CORS_ORIGIN` is just that one URL.
- **One service to keep awake** on a free tier instead of two.

Managed Postgres and Redis on free tiers are still separate services; that's fine.

---

## Phase 0 — Blockers (must land before any public URL)

Branch: `chore/security-hardening` off `dev`. Ordered by risk.

| # | Item | Where | Done when |
|---|---|---|---|
| 0.1 | **Dependency vulns.** `npm audit fix` (non-breaking) in both apps. Bump NestJS 10 → 11 only if the critical/high findings remain. Try the smallest major first; 12 is a separate branch. | `backend/`, `frontend/` package files | `npm audit --omit=dev --audit-level=high` exits 0, 91 + 21 tests green |
| 0.2 | **Audit gate in CI**: add `npm audit --omit=dev --audit-level=high` to both jobs | `ci.yml` | CI fails on a new high |
| 0.3 | **`helmet()`** with a CSP that allows `'self'`, the Stockfish worker (`worker-src 'self' blob:`), `wasm-unsafe-eval`, and `connect-src 'self' wss:` | `main.ts` | headers present; `verify-pages` + `verify-review-ui` still pass (they catch a CSP that breaks the engine) |
| 0.4 | **Swagger off in production**: `if (process.env.NODE_ENV !== 'production')` around `SwaggerModule.setup` | `main.ts` | `/api/docs` returns 404 with `NODE_ENV=production` |
| 0.5 | **Login/register throttling**: `@Throttle({ short: { limit: 5, ttl: 60_000 } })` on `/auth/login`, `/auth/register`, `/auth/refresh` | `auth.controller.ts` | 6th login in a minute returns 429 (unit or verify check) |
| 0.6 | **`trust proxy`**: every free host sits behind a proxy; without it, all users share the proxy's IP and one throttle bucket | `main.ts` — `app.getHttpAdapter().getInstance().set('trust proxy', 1)` | throttling is per client IP on staging |
| 0.7 | **Socket event rate limit**: per-socket counter (e.g. 20 events/s, then disconnect). ThrottlerGuard does not cover gateways | `game.gateway.ts` (one small helper, called first in each handler) | spam test disconnects; gateway spec covers it |
| 0.8 | **Socket payload checks**: `roomId` is a 6-character `[A-Z0-9]` string, squares match `^[a-h][1-8]$`, `promotion` is one of `qrbn` | `game.gateway.ts` | malformed payloads rejected without hitting Redis; spec covers it |
| 0.9 | **Message size**: `maxHttpBufferSize: 16_384` on the gateway; `json({ limit: '32kb' })` for HTTP | gateway decorator, `main.ts` | oversized frame is dropped |
| 0.10 | **`forbidNonWhitelisted: true`** | `main.ts` | unknown body fields return 400; verify scripts still pass |
| 0.11 | **`/api/v1/health`**: `{ status, db, redis }` with a `SELECT 1` and a `PING`. Free hosts need it for health checks, and uptime pingers use it | new `health.controller.ts` | returns 200 when both are up, 503 otherwise |
| 0.12 | **Secrets check**: `git log --all -- '*.env'` is empty; `JWT_SECRET` ≥ 64 random chars in the host's secret store **[host]** | — | documented in `environment.md` |
| 0.13 | **Logging**: JSON logs (Nest 11's `ConsoleLogger({ json: true })` if 0.1 lands on 11, so no new dependency; else `nestjs-pino`), a request id on every HTTP request and socket event, and **security events**: failed login, refused refresh, 429s, rejected socket actions (not a player, out of turn, bad payload). Never log tokens, passwords or emails. | `main.ts`, `auth.service.ts`, `game.gateway.ts` | a failed login and a rejected move each produce one searchable JSON line; `grep -i token` over a test run's logs finds nothing |

Effort: about one focused day. 0.1 can grow if Nest needs a major bump. Everything else is a
few lines.

---

## Phase 1 — Before telling anyone the URL

| # | Item | Notes |
|---|---|---|
| 1.1 | **Refresh token → `HttpOnly; Secure; SameSite=Strict` cookie**, access token in memory only | Today it's in `sessionStorage` (`AuthContext.tsx`), where any script on the page can read it. Backend sets the cookie on login/refresh and clears it on logout; frontend stops storing it. `SameSite=Strict` + same origin covers CSRF for `/auth/refresh`; nothing else reads the cookie. Requires the one-origin decision above. |
| 1.2 | **Global JWT guard + `@Public()`** | Deny by default; today each route opts in with `@UseGuards`. Mark login, register, refresh, leaderboard, `/games/live` and health as public. |
| 1.3 | **Insecure direct object reference (IDOR) pass** | For every `:id` route, check that a stranger's id can't read or change another user's data. Add one check per route to a verify script. |
| 1.4 | **Analysis throttle** | Stockfish runs on the server's CPU, which is scarce on a free tier. Limit to 1 running sweep per user and a few per hour. |
| 1.5 | **Production errors** | `NODE_ENV=production`, no stack traces in responses, `app.enableShutdownHooks()` so a free-tier restart closes Redis/Prisma cleanly. |
| 1.6 | **Database and Redis over TLS** **[host]** | Managed free tiers (e.g. Neon, Upstash) require it anyway: `?sslmode=require` and `rediss://`. Never expose either to the open internet. |
| 1.7 | **Error tracking + uptime** | Sentry's free plan for backend and frontend; a free uptime pinger on `/health`. Many free web tiers sleep when idle, and the pinger also keeps it awake (check the host's terms) **[host]**. |
| 1.8 | **Backups** **[host]** | Check whether the free Postgres tier includes point-in-time restore or daily backups. If it doesn't, add a nightly `pg_dump` GitHub Action. **Test one restore.** |
| 1.9 | **ZAP baseline scan** against the staging URL | Free and automated (`zaproxy/action-baseline`). Fix the highs. |

---

## Phase 2 — After launch (track, don't block)

- Dependabot for both `package.json` files (security updates only, to keep the PR count small).
- Account lockout after N failed logins (on top of 0.5's IP throttle).
- Privacy policy + account deletion (you store email addresses; GDPR applies if EU users sign up).
- A load test (k6) at ~100 concurrent games, so you know the free tier's ceiling before users find it.
- Pay down the 54 `no-explicit-any` lint warnings, then make the rule an error.

---

## Free-tier risks to check before choosing a host [host]

- **Sleeping instances.** Free web services often spin down when idle. A sleeping server
  drops every live socket, and the first visitor waits for a cold start. Clocks survive
  (deadlines live in Redis), but players see a disconnect.
- **Redis command quotas.** The matchmaking poll runs every 500 ms per active queue and
  the clock sweeper every 1 s, so the server sends Redis commands non-stop even with zero
  users. Check the free Redis tier's daily or monthly command cap against that, or make
  both loops sleep when there are no queues or games.
- **CPU and RAM.** Server-side Stockfish analysis (1.4) is the heaviest thing here; an
  80-move game took ~95 s locally.
- **One instance only.** That's fine: the in-memory throttler and the per-process
  disconnect timers assume it (ADR-0032).

---

## Where the repo stands today (audit, 2026-10-09)

| Area | Status |
|---|---|
| SQL injection | ✅ no `$queryRaw`/`$queryRawUnsafe`; Prisma only |
| HTTP input validation | ✅ global `ValidationPipe` + `whitelist` · ⚠️ `forbidNonWhitelisted: false` (0.10) |
| Socket input validation | ❌ (0.8) |
| Access control | ✅ players-only game actions (tested) · ⚠️ per-route guards (1.2) · ❌ IDOR pass (1.3) |
| Passwords / refresh tokens | ✅ bcrypt-10, hashed rotating refresh tokens, ban checks · ❌ refresh token in `sessionStorage` (1.1) |
| Rate limiting | ✅ global HTTP throttler · ❌ login (0.5), sockets (0.7), proxy IP (0.6) |
| Headers / misconfiguration | ❌ helmet (0.3), Swagger public (0.4) |
| Supply chain | ❌ 1 critical + 8 high (backend), 2 high (frontend) (0.1) · ✅ lockfile installs |
| Ops | ❌ `/health` (0.11), monitoring (1.7), backups (1.8) |
| Tests | ✅ backend 91 Jest, frontend 21 Vitest, 73 live checks, 38 browser checks |
