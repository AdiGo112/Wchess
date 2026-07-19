# API Reference

Base URL: `http://localhost:3000/api/v1`
Swagger UI: `http://localhost:3000/api/docs`

All protected routes require: `Authorization: Bearer <accessToken>`

---

## Auth

| Method | Path | Auth | Body | Response |
|---|---|---|---|---|
| POST | `/auth/register` | — | `{ username, email, password, name }` | `{ accessToken, refreshToken, user }` |
| POST | `/auth/login` | — | `{ username, password }` | `{ accessToken, refreshToken, user }` |
| POST | `/auth/refresh` | — | `{ refreshToken }` | `{ accessToken, refreshToken }` |
| POST | `/auth/logout` | ✓ | — | `204` |
| GET | `/auth/me` | ✓ | — | `UserDto` |
| POST | `/auth/forgot-password` | — | `{ email }` | `204` |
| POST | `/auth/reset-password` | — | `{ token, newPassword }` | `204` |

**Error codes:** AUTH_001–AUTH_007 (see `Here_is_THE_plan.md §43`)

---

## Users

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/users/:username` | — | Public profile |
| PATCH | `/users/me` | ✓ | Update own profile `{ name, bio, country }` |
| GET | `/users/:username/stats` | — | Wins, losses, draws, rating history |
| GET | `/users/search?q=` | — | Search by username |

---

## Games

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/games/:id` | — | Single game by ID |
| GET | `/games/history/:userId` | ✓ | Paginated game history `?page=1&limit=20&variant=blitz` |
| POST | `/games/challenge` | ✓ | Challenge a user `{ targetUsername, timeControl, variant }` |
| GET | `/games/live` | — | Currently active public games |

---

## Matchmaking

All paths are under the global prefix `/api/v1`. Implemented in feature 03 Inc 2.

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/matchmaking/challenge` | ✓ | Create friend-challenge link. Body `{ variant, timeControl, increment?, creatorColor? }` → `{ token, shareUrl, expiresAt }` (TTL 10 min) |
| POST | `/matchmaking/challenge/:token/accept` | ✓ | Accept a challenge → `{ gameId, color }`. Creator notified via `challenge_accepted` socket event. Errors: 404 `CHALLENGE_NOT_FOUND` / `CHALLENGE_EXPIRED`, 409 `CHALLENGE_ALREADY_ACCEPTED`, 403 `CANNOT_ACCEPT_OWN_CHALLENGE` |
| POST | `/matchmaking/computer` | ✓ | Create vs-computer game immediately. Body `{ difficulty (1-5), variant, timeControl, increment? }` → `{ gameId }`. Black player is the `computer` engine; `difficulty` stored on the Redis room |
| GET | `/matchmaking/queue-status` | ✓ | Whether caller is queued → `{ inQueue, variant, timeControl, position }` |

> Quick-match queueing is over Socket.io (`join_queue` / `leave_queue` / `match_found`), not REST — see `websocket-events.md`.

---

## Leaderboard

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/leaderboard` | — | Top 100 `?variant=blitz&period=all\|week\|month` |
| GET | `/leaderboard/rank/:userId` | — | A user's rank and rating |

---

## Tournaments

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/tournaments` | — | List `?status=upcoming\|ongoing\|completed&type=swiss` |
| POST | `/tournaments` | ✓ ADMIN | Create `{ name, format, variant, timeControl, startAt, rounds }` |
| GET | `/tournaments/:id` | — | Tournament detail |
| POST | `/tournaments/:id/join` | ✓ | Join tournament |
| POST | `/tournaments/:id/leave` | ✓ | Leave tournament |
| GET | `/tournaments/:id/standings` | — | Current standings |
| GET | `/tournaments/:id/rounds/:num` | — | Pairings for a round |

---

## Puzzles

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/puzzles/daily` | — | Today's daily puzzle |
| GET | `/puzzles/next` | ✓ | Next spaced-repetition puzzle for user |
| GET | `/puzzles/:id` | — | Single puzzle |
| POST | `/puzzles/:id/attempt` | ✓ | Submit attempt `{ moves: string[] }` |
| GET | `/puzzles/themes` | — | All available themes |
| GET | `/puzzles?theme=fork&rating=1500` | — | Filter puzzles |

---

## Social

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/friends` | ✓ | My friends list |
| GET | `/friends/requests/pending` | ✓ | Incoming requests |
| POST | `/friends/request/:userId` | ✓ | Send friend request |
| POST | `/friends/accept/:requestId` | ✓ | Accept request |
| POST | `/friends/decline/:requestId` | ✓ | Decline request |
| DELETE | `/friends/:friendId` | ✓ | Remove friend |
| POST | `/follow/:userId` | ✓ | Follow user |
| DELETE | `/follow/:userId` | ✓ | Unfollow |
| GET | `/activity-feed` | ✓ | My activity feed |

---

## Notifications

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/notifications` | ✓ | My notifications `?unread=true&limit=20` |
| PATCH | `/notifications/:id/read` | ✓ | Mark as read |
| PATCH | `/notifications/read-all` | ✓ | Mark all as read |

---

## Chat

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/chat/rooms/:roomId/history` | ✓ | Message history `?before={cursor}&limit=50` |

---

## Analysis

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/analysis/game/:gameId` | ✓ | Request full game analysis → `{ jobId }` |
| GET | `/analysis/game/:gameId` | ✓ | Get analysis result (or 202 if pending) |
| POST | `/analysis/position` | ✓ | Evaluate position `{ fen, depth, multipv }` |

---

## Media

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/media/avatar` | ✓ | Upload avatar (multipart, max 2MB jpg/png/webp) → `{ url }` |
| DELETE | `/media/avatar` | ✓ | Remove avatar |

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
