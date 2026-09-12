# Docker Setup

Two databases run locally via Docker Compose: **PostgreSQL 16** and **Redis 7**.
The app itself does not run in Docker — it runs on the host, against these.

The compose file is `../../docker-compose.yml`. It is not reproduced here; an
inlined copy in a doc is a copy that goes stale, and this one had been
advertising a MongoDB service for months after Mongo left the stack (2026-07-19).

---

## Start / stop

```bash
docker compose up -d       # start both, detached
docker compose ps          # check both are healthy
docker compose stop        # stop, keep the data
docker compose down -v     # stop AND wipe the volumes
docker compose logs -f postgres
docker compose logs -f redis
```

Both services declare healthchecks, so `docker compose ps` showing `healthy` —
not just `running` — is what "ready" means.

---

## First time

```bash
docker compose up -d
cd backend
cp .env.example .env       # then fill in JWT_SECRET
npx prisma migrate dev     # applies all 4 migrations
npx prisma studio          # optional — browse the data
```

**There is no seed script.** `backend/package.json` has no `prisma.seed` entry
and `prisma/seed.ts` does not exist. Register users through the app, or through
one of the `verify-*.mjs` scripts.

---

## Connecting by hand

The compose file pins container names, so these are stable:

```bash
docker exec -it chessweb_postgres psql -U chess -d chessweb
docker exec -it chessweb_redis redis-cli
```

---

## What is safe to wipe

| Store | Wiping costs you |
|---|---|
| **Redis** | In-flight games only. Queues, presence and socket routing are rebuilt by reconnecting clients, and the leaderboard reseeds itself from Postgres on boot. |
| **PostgreSQL** | Everything. Users, games, ratings, analyses. `down -v` is not recoverable. |

`docker compose down -v` drops both volumes. If you meant "restart the
databases", that is `docker compose restart`.

---

## Prisma migration workflow

```bash
npx prisma migrate dev --name <describe_change>   # create + apply in dev
npx prisma migrate deploy                          # apply in production
npx prisma generate                                # regenerate the client
npx prisma migrate reset                           # wipe + replay every migration
```

A schema change is not finished until `npx prisma generate` has run — the
`@prisma/client` types are generated, not committed, which is why CI runs it
before it typechecks anything (`ci-cd.md`).

---

## Ports

| Service | Port | Connection string |
|---|---|---|
| PostgreSQL | 5432 | `postgresql://chess:chess123@localhost:5432/chessweb` |
| Redis | 6379 | `redis://localhost:6379` |
| NestJS API | 3100 | `http://localhost:3100` |
| Vite dev server | 5173 | `http://localhost:5173` |

---

## When it will not start

| Symptom | Cause |
|---|---|
| `port is already allocated` | A local Postgres/Redis is already on 5432/6379. Stop it, or change the host-side port in `docker-compose.yml`. |
| Backend boots, then `ECONNREFUSED 5432` | The containers are up but not yet `healthy`. Wait for the healthcheck. |
| `Environment variable not found: DATABASE_URL` | `backend/.env` is missing — `cp .env.example .env`. |
| Everything is up, the app is empty | Expected. There is no seed data. |
