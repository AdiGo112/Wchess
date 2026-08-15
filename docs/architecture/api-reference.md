# API Reference

Base URL: `http://localhost:3100/api/v1`
Swagger UI: `http://localhost:3100/api/docs`

All protected routes require: `Authorization: Bearer <accessToken>`

> **Scope.** This file documents the endpoints that exist in `backend/src` today.
> Chat, notifications, puzzles, tournaments, social, analysis and media were cut
> from v1 by ADR-0032 and their modules deleted — their endpoint tables have been
> removed from this file rather than left looking live. See `docs/FUTURE_SCOPE.md`
> for what returns and when.

---

## Auth

| Method | Path | Auth | Body | Response |
|---|---|---|---|---|
| POST | `/auth/register` | — | `{ username, email, password, name }` | `{ user }` |
| POST | `/auth/login` | — | `{ username, password }` | `{ accessToken, refreshToken, user }` |
| POST | `/auth/refresh` | — | `{ refreshToken }` | `{ accessToken, refreshToken }` |
| POST | `/auth/logout` | — | `{ refreshToken }` | `204` |
| GET | `/auth/me` | ✓ | — | `UserDto` |

`/auth/logout` is deliberately unguarded: it is idempotent and identifies the
session by the refresh token in the body, so an expired access token can still
log you out.

**`UserDto`** — identity only: `{ id, username, email, name, role, avatarUrl, createdAt }`.
It carries no ratings or W/L; use `/users/:username/stats` for those.

Refresh tokens are stored as SHA-256 hashes, rotate on every use, and expire
after `REFRESH_TOKEN_EXPIRES_DAYS` (default 30). Expired rows are swept on the
owner's next login and on logout — there is no scheduled job.

---

## Users

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/users` | — | Player directory `?page=1&limit=25&search=` → `{ players, total, page, limit }`. Each row is `{ id, username, name, createdAt, rating }`, where `rating` is the player's highest across variants (`null` if never rated). `limit` is capped at 50. |
| GET | `/users/:username` | — | Public profile (never returns `passwordHash` or `email`) |
| GET | `/users/:username/stats` | — | `{ userId, username, ratings[], totalGames }`. Each `ratings[]` row is one variant: `{ variant, rating, ratingDeviation, wins, losses, draws, provisional }` |
| PATCH | `/users/me` | ✓ | Update own profile `{ name?, bio?, country? }` (max 50 / 300 / 2 chars) |

---

## Games

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/games/:id` | — | Single completed game by ID. Live games live in Redis and are not exposed here. |
| GET | `/games/history/:userId` | ✓ | Paginated history `?page=1&limit=20` (limit capped at 50) → `{ games, total, page, limit }` |

`GET /games/history/:userId` requires auth. It was unguarded until the
pre-Increment-2 hardening pass, which let anyone walk username → id → full
history without logging in.

Each `games[]` row includes `pgn` — a standard PGN with `Event`/`Site`/`Date`/
`White`/`Black`/`WhiteElo`/`BlackElo`/`TimeControl`/`Result` tags, written at
game end.

---

## Matchmaking

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/matchmaking/challenge` | ✓ | Create friend-challenge link. Body `{ timeControl, increment?, creatorColor? }` → `{ token, shareUrl, expiresAt }` (TTL 10 min) |
| POST | `/matchmaking/challenge/:token/accept` | ✓ | Accept a challenge → `{ gameId, color, timeControl }`. Creator notified via `challenge_accepted` socket event. Errors: 404 `CHALLENGE_NOT_FOUND` / `CHALLENGE_EXPIRED`, 409 `CHALLENGE_ALREADY_ACCEPTED`, 403 `CANNOT_ACCEPT_OWN_CHALLENGE` |
| POST | `/matchmaking/computer` | ✓ | Create vs-computer game immediately. Body `{ difficulty (1-5), timeControl, increment? }` → `{ gameId }`. Black is the `computer` engine; `difficulty` is stored on the Redis room |
| GET | `/matchmaking/queue-status` | ✓ | Whether caller is queued → `{ inQueue, variant, timeControl, position }` |

**No `variant` in any request body.** The server always derives it from
`timeControl` (`variantFromTimeControl`) so a client can't request one variant
and be rated under another. A `variant` field sent anyway is silently stripped
by the global `ValidationPipe` (`whitelist: true`).

`shareUrl` is built from `FRONTEND_URL`, falling back to `CORS_ORIGIN`, then
`http://localhost:5173`.

> Quick-match queueing is over Socket.io (`join_queue` / `leave_queue` /
> `match_found`), not REST — see `websocket-events.md`.

---

## Leaderboard

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/leaderboard` | — | `?variant=blitz&period=all\|week\|month&limit=100` (capped at 200). Returns a bare array of `{ userId, rating, rank, username, name, avatarUrl }`. Unknown `period` falls back to `all`. |
| GET | `/leaderboard/rank/:userId` | — | `?variant=blitz&period=...` → `{ rank, rating }`, both `null` if the player is unrated in that variant |

Boards are Redis sorted sets. Week/month buckets are **live** boards — the
current rating of players active in that period, not a start-of-period snapshot.
They self-expire (14 / 62 days, re-armed on each write). Enriched top-N reads are
cached for 60s. On boot the service reseeds from Postgres if the all-time boards
are empty, so a Redis flush is recoverable.

---

## Standard Error Response
```json
{
  "statusCode": 400,
  "error": "BAD_REQUEST",
  "code": "AUTH_001",
  "message": "Username already taken",
  "timestamp": "2026-06-23T12:00:00Z",
  "traceId": "abc123"
}
```
