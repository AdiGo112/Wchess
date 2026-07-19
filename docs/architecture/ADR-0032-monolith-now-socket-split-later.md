# ADR-0032: Modular Monolith Now, Socket-Layer Split Later

**Status:** Accepted
**Date:** 2026-07-19
**Supersedes:** `Here_is_THE_plan.md` §4 (15-service decomposition)

## Context

`Here_is_THE_plan.md` §4 prescribes decomposing the backend into 15 services on ports
3001–3015. A full read of `backend/src/**` found the actual coupling between the 11 Nest
modules to be two service dependencies (`games → leaderboard`,
`matchmaking → games`) plus a shared `JwtAuthGuard`. At 105 tracked files, the monolith
is not the constraint, and decomposition would convert the one relationship that must be
transactionally consistent — game completion writing ratings — into a network call
requiring a saga or outbox to restore what a single `await` gives free today.

Separately, the app currently **cannot correctly run as more than one instance**:
`disconnectTimers` (`game.gateway.ts:24`) and `activeKeys`
(`matchmaking.service.ts:36`) are per-process, and `@socket.io/redis-adapter` is
installed but never wired in `main.ts`. This is a silent failure — the app looks
horizontally scalable and is not.

Target: a running, correct, basic game in ~2 months, with features added incrementally.

## Decision

**Stack:** Node/NestJS + PostgreSQL + Redis + Socket.io + React (migrating to TypeScript).

**Architecture A — now.** Stay a modular monolith. Deploy **one instance**, deliberately.
Fix correctness, delete unused infrastructure. Specifically:

- MongoDB is removed. Its only consumers are the chat and notification modules, both cut
  from v1 — so the dependency disappears with them rather than being migrated.
- Bull and `backend/src/stockfish/` are removed. The processor has been analysis-only and
  uncalled since ADR-0009, and returns a random legal move.
- Cut from v1: chat, notifications, puzzles, tournaments, spectate. Puzzles and
  tournaments have services but no frontend. Each is re-addable as an increment.
- Single-instance is an **accepted constraint, not an oversight.** The Redis adapter and
  the two per-process state holders are correct as-is on one instance and must be fixed
  before instance #2. See "Before adding a second instance" below.

**Architecture B — later.** Split the WebSocket layer (`games`, `matchmaking`, and
eventually `chat`) into its own deployable, with Redis pub/sub between it and the HTTP
API. This is the split lichess uses (`lila` / `lila-ws`), and current module boundaries
already sit on that line. Trigger: sustained >5k concurrent sockets, **or** the first
time a non-game deploy interrupts live games.

**Architectures D–G — deferred, not rejected.** Go or Elixir for the realtime layer, Rust
for a future analysis service, Cloudflare Durable Objects for per-game state. Each is
reconsidered only against measured numbers — specifically event-loop lag, concurrent
sockets, and queue depth, none of which are currently instrumented. Rationale and trigger
conditions for each are recorded in `temp_architecture.md`.

## Consequences

**Positive:** No new runtime, language, or infrastructure to learn inside the two-month
window. Two of three stateful services are deleted rather than migrated. Cutting the
unfinished modules removes the chat authorization hole and the leaking spectator counter
outright — deleting wrong code is cheaper than fixing it. Module boundaries are preserved,
so B stays cheap and D–G stay open.

**Negative:** One deployable means a fault in any module can restart live games. One
instance means no redundancy: a crash drops every in-flight game, and deploys are
user-visible. Accepted for v1 on the basis that there are no users yet; it is the first
thing to revisit once there are.

**Neutral:** Redis stays. Its game-room and matchmaking-queue roles are load-bearing
(ADR-0006, ADR-0007). Its leaderboard role (ADR-0011) is not — `UserRating` already
carries `@@index([variant, rating(sort: Desc)])`, so an indexed `ORDER BY ... LIMIT 100`
would serve the same result. Keeping the zset because the code exists and works, not
because it is required.

## Before adding a second instance

All three are correct today and silently wrong the moment a second process starts:

1. Wire `@socket.io/redis-adapter` in `main.ts` — without it, `server.to(room).emit()`
   reaches only local sockets and two players on different boxes desync with no error.
2. `disconnectTimers` (`game.gateway.ts:24`) → Redis keys with expiry.
3. `activeKeys` (`matchmaking.service.ts:36`) → Redis SET, plus leader election or a
   dedicated worker for the 500ms poll loop.

## Known unimplemented decisions

**ADR-0004 (Server-Authoritative Clock) is Accepted and not implemented.** It specifies a
per-game `setInterval` at 100ms resolution, `clock_update` events every second, and a
500ms grace margin. None exist. Clocks advance only when a move arrives
(`game.gateway.ts:180-186`), and timeout is detected only via a client-sent
`claim_timeout` (`:317`) — so a game whose opponent closes their browser hangs until the
86400s room TTL, is never persisted, and never settles ratings. Closing this is the
largest item in the first sprint. See the ADR-0004 addendum for the design variance.
