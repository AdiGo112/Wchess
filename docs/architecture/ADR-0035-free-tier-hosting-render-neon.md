# ADR-0035: Free-Tier Hosting on Render + Neon

**Status:** Accepted
**Date:** 2026-10-11
**Builds on:** ADR-0032 (one instance), ship-plan "one origin" decision
**Setup:** [`../infrastructure/deployment.md`](../infrastructure/deployment.md), [`render.yaml`](../../render.yaml)

## Context

ChessWeb needs a public URL at $0 that keeps working for a year or more without attention.
What the app demands of a host (measured, `bench/results/live-nest11.json`):

- **one always-on Node process** serving API, Socket.io and the SPA on one origin (the refresh
  cookie is `SameSite=Strict`), with long-lived websockets;
- **≈155 MB RSS idle**, more while a Stockfish analysis child runs: 512 MB is the floor;
- **Redis on the hot path**: 5 commands per move, 3 per waiting game per minute, ≈14 per idle
  minute (≈600k a month before anyone plays);
- **Postgres**: small (finished games, ratings, analyses), touched on logins and game ends.

## Options considered

| | App | Postgres | Redis | Verdict |
|---|---|---|---|---|
| **A** | Render free | **Neon free** | Render Key Value free | **Chosen** |
| B | Render free | Neon free | Upstash free | 500k commands/month: idle traffic alone exceeds it |
| C | Koyeb free | — | — | Comparable, but mid-acquisition (Mistral); limits may move |
| D | Oracle Always Free VM | same box | same box | Most power; unannounced quota cuts, idle reclaim, we own TLS/patching/backups |

Render's own free Postgres was ruled out: it is **deleted 30 days after creation** (+14 days grace).

## Decision

Option A, with four rules that make the free tiers hold:

1. **Liveness vs readiness.** `GET /health/live` touches nothing; `GET /health` checks Postgres
   and Redis. Render's health check and the keep-awake pinger use `/live`. Pinging `/health`
   every 10 minutes would keep Neon from ever sleeping (≈90 of 100 free CU-hours a month).
2. **Redis is state, not cache.** `maxmemoryPolicy: noeviction`: Render's default
   (`allkeys-lru`) would silently evict a live game under memory pressure; noeviction fails the
   write loudly instead.
3. **Durability lives in Postgres only.** Free Key Value has no persistence, so a restart loses
   live games and queues. Everything that must survive (users, ratings, finished games,
   analyses) is already in Postgres; the leaderboard reseeds from it on boot.
4. **Backups don't depend on the provider.** Nightly `pg_dump` (GitHub Actions), AES-256
   encrypted because the repo and its artifacts are public, kept 30 days. Restore tested.

## Consequences

- **Recovery point objective: 24 h** for Postgres (nightly dump); Neon's own short restore
  window usually does better. **Recovery time: ~15 min** (new Neon project, restore, swap
  `DATABASE_URL`).
- **Every deploy drops live games.** Acceptable for a portfolio; fixed by a paid Key Value with
  persistence, or by the multi-instance design below.
- **Single point of failure, on purpose.** One instance (ADR-0032). Scaling out is designed and
  measured as a local lab first (deployment.md, "Scaling").
- **Cold paths:** Neon's first query after 5 idle minutes pays a wake-up; server-side analysis is
  slow on a free CPU share (bounded by ship-plan 1.4's per-user limits).
- **Portability:** the app is one process with three env vars of infrastructure
  (`DATABASE_URL`, `REDIS_URL`, `PORT`); moving host is a redeploy plus a `pg_dump`/restore.
- **Free tiers change** (Render's Postgres went 90 → 30 days, Upstash's quota went daily →
  monthly, Oracle halved its allowance in 2026). Re-check terms every ~6 months.
