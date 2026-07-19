# ADR-0004: Server-Authoritative Clock

**Status:** Accepted
**Date:** 2026-06-23

## Context
Chess clocks are a critical game mechanic. If clocks run client-side, a malicious player could pause JavaScript execution, manipulate system time, or throttle their browser to gain extra time. We needed to decide where the authoritative clock lives.

## Decision
Clocks are maintained exclusively on the server using Node.js setInterval (100ms resolution). The client receives clock_update events every second and uses local interpolation between updates for smooth display. The client clock is display-only; it has no authority over game outcome.

## Consequences
**Positive:** Cheat-resistant. Players cannot gain time by manipulating the client. Consistent clock state across browser tabs and reconnections.
**Negative:** Clock display has up to 1 second of latency vs. actual server time. Network lag means a move submitted just before timeout may arrive at the server after the clock expires. We add a 500ms server-side grace margin: if a move arrives within 500ms of timeout, it is accepted.
**Neutral:** Server must maintain one setInterval per active game. At 1000 concurrent games, this is 1000 intervals — manageable with Node.js event loop.

---

## Addendum (2026-07-19) — NOT IMPLEMENTED, and a design variance

**This ADR is marked Accepted but no part of it was ever built.** A full read of
`backend/src/games/**` found:

- no `setInterval` per game, and no interval anywhere in the game path;
- no `clock_update` event — it appears in neither the gateway nor
  `docs/architecture/websocket-events.md`;
- no 500ms grace margin.

What actually exists: clocks advance only inside `handleMove`
(`game.gateway.ts:180-186`), by subtracting `now - room.lastMoveAt` from the mover's
budget. Nothing on the server ever observes that a clock has reached zero. Timeout is
discovered only when the **opponent** sends `claim_timeout` (`:317`). If that opponent
closes their browser, the game hangs until the room's 86400s TTL expires
(`games.service.ts:27`), is never written to PostgreSQL, and never settles ratings.

The clock is therefore server-*computed* but not server-*authoritative*: no authority
acts without a client prompting it.

### Variance from the decision as written

The decision stands in intent and is being implemented, with one change: **a single
sweeper over a Redis sorted set of deadlines, rather than one `setInterval` per game.**

Store `deadline = lastMoveAt + timers[sideToMove]` as the score in a sorted set on every
move. One interval per process polls `ZRANGEBYSCORE deadlines -inf now` and flags whatever
has expired. One timer total instead of one per active game, and — unlike a per-process
`setInterval` — the deadlines survive a restart, which matters given ADR-0032's
single-instance deployment.

The original "1000 intervals is manageable" note in Consequences is true but irrelevant:
the sorted set is less code, not just less overhead, and it removes an entire class of
"timer lost on restart" bug. The 500ms grace margin and `clock_update` interpolation are
retained as specified.
