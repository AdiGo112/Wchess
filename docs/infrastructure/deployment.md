# Deployment

---

## Local Development

```bash
# Terminal 1: Databases
docker compose up -d

# Terminal 2: Backend
cd backend
npm run start:dev     # ts-node-dev with hot reload, port 3100

# Terminal 3: Frontend
cd frontend
npm run dev           # Vite, port 5173
```

---

## Production: Render + Neon (ADR-0035)

```
             browser ── https ──► Render web service "wchess" (free, Singapore)
                                   one Node process: API + Socket.io + the built SPA
                                   │                     │
                  private network  ▼                     ▼  TLS (sslmode=require)
          Render Key Value "wchess-redis"         Neon Postgres (free)
          free, 25 MB, no persistence,            0.5 GB, sleeps after 5 idle min
          noeviction, no public access
                                                  ▲
          cron-job.org ── every 10 min ──► /api/v1/health/live (keeps the web service awake)
          GitHub Actions ── nightly ──► pg_dump → AES-256 → 30-day artifact
```

Everything is declared in [`render.yaml`](../../render.yaml) except the two things Render can't
create for free: the database (Neon) and the pinger (cron-job.org). Production deploys
`main`; promote with `dev → staging → main` as usual.

### First deploy (≈20 minutes, done once)

1. **Neon.** Sign up at neon.com → create a project, region **AWS Asia Pacific (Singapore)**
   (next to Render's Singapore region; latency between the app and the DB counts on every query).
   Copy the connection string: **direct**, not pooled (one long-lived app instance doesn't
   need the pooler, and `prisma migrate` wants a direct connection). It must end with
   `?sslmode=require`.
2. **Render.** Sign up at render.com with GitHub → **New → Blueprint** → pick `AdiGo112/Wchess`.
   Render reads `render.yaml` and shows two resources (`wchess`, `wchess-redis`). It asks for
   the one value it can't fill: paste the Neon string into `DATABASE_URL`. Apply.
3. **Wait for the first build** (frontend + backend, a few minutes). The start command runs
   `prisma migrate deploy`, so the empty Neon database gets the schema on first boot. If the
   deploy fails at that step, `DATABASE_URL` is wrong.
4. **Check it.** `https://<your-service>.onrender.com/api/v1/health` should return
   `{"status":"ok","db":"ok","redis":"ok"}`. Register, play a computer game, open its review.
5. **Pinger.** Sign up at cron-job.org → new cronjob → URL
   `https://<your-service>.onrender.com/api/v1/health/live`, every **10 minutes**.
   Render's free instance sleeps after 15 minutes without incoming traffic. Use `/live`, not
   `/health`: `/health` runs a query, and a query every 10 minutes keeps Neon awake around
   the clock (≈ 90 of its 100 free compute-hours a month).
6. **Backups.** GitHub repo → Settings → Secrets and variables → Actions → add
   `BACKUP_DATABASE_URL` (the same Neon string) and `BACKUP_PASSPHRASE` (a long random string;
   **store it in your password manager**, a dump you can't decrypt is not a backup). Then
   Actions → backup → **Run workflow** once by hand and check it uploads `db-N`.

### After the first deploy, verify

- `node frontend/scripts/verify-security.mjs` against the live URL (change `API`/`WS` at the
  top). In particular **R**: 10 failed logins from one machine should 429 while your phone,
  on another network, can still log in. If everyone shares one bucket, the `TRUST_PROXY`
  hop count is wrong (ship-plan 0.6).
- The refresh cookie shows `Secure` in the browser's dev tools (it's `NODE_ENV=production`).
- `/api/docs` is a 404 (Swagger is dev-only).

### Restore a backup (tested 2026-10-11 against a local copy: all rows matched)

```bash
# download db-N from the backup run's artifacts, unzip, then:
gpg -d -o db.dump db.dump.gpg                       # asks for BACKUP_PASSPHRASE
pg_restore --no-owner --no-privileges --clean --if-exists -d "$TARGET_DATABASE_URL" db.dump
```

Use a `pg_restore` whose major version matches the **target** server. A newer one emits
settings an older server rejects (seen locally: `transaction_timeout` from 18 against 16,
harmless, one ignored error).

### What a restart costs

Render's free Key Value keeps nothing across a restart, and every deploy restarts. Live games,
clocks, queues and pending challenges are lost; players see a disconnect. The leaderboard
rebuilds itself from Postgres on boot. Accepted for a portfolio launch (ADR-0035); a paid Key
Value with persistence removes it.

### Free-tier terms to re-check (every ~6 months)

Render: 750 instance-hours a month (always-on uses ~744), sleep after 15 min, Key Value
eviction default `allkeys-lru` (we override it). Neon: 0.5 GB, 100 CU-hours, scale-to-zero.
GitHub: scheduled workflows on a public repo are **disabled after 60 days without a commit**,
so a quiet repo silently stops backing up; re-enable from the Actions tab.

---

## Scaling (not deployed: the local lab)

Production is one instance on purpose (ADR-0032): the throttler, the analysis limits and the
disconnect timers live in process memory. Going to N instances is the next system-design
milestone, done first as a **local lab** with published numbers:

- `docker compose` with nginx in front of 2–3 app instances, sticky sessions for Socket.io;
- `@socket.io/redis-adapter` wired in (the package is installed but **not** used yet: earlier
  revisions of this file said it was wired, it isn't);
- in-memory state moved to Redis: throttler storage, analysis limits, disconnect timers;
- load-test 1 vs N instances and kill one mid-game to see what players experience.

---

## CI/CD

`.github/workflows/ci.yml` runs backend (test + build), frontend (typecheck + build) and a
branch-promotion guard. `.github/workflows/backup.yml` is the nightly dump above. Render
auto-deploys `main` on push, so there is no deploy job.

See **[`ci-cd.md`](./ci-cd.md)** for what each step checks and the
`feature/* → dev → staging → main` workflow.

---

## Monitoring checklist

The full, ordered pre-launch plan (security + ops) is **[`ship-plan.md`](./ship-plan.md)**.

- [x] Liveness `GET /api/v1/health/live`, readiness `GET /api/v1/health`
- [ ] Pinger on `/health/live` (cron-job.org, step 5 above)
- [ ] Error tracking (Sentry, ship-plan 1.7)
- [x] Nightly encrypted PostgreSQL backups (`backup.yml`; secrets in step 6)
- [x] HTTPS: Render's, auto-renewed
