# ADR-0034: Event-Driven Clock Sweeper, No Per-Second clock_sync

**Status:** Accepted
**Date:** 2026-10-09
**Amends:** ADR-0004 addendum (the 1-second deadline sweeper and its `clock_sync` push)
**Plan:** [`performance-plan.md`](./performance-plan.md), Phase 7 (pulled forward)
**Measured with:** `frontend/scripts/bench-live.mjs` → `bench/results/live-*.json`

## Context

ADR-0004 keeps every clock on the server: a Redis sorted set `clock:deadlines` maps each
active room to the moment its side to move flags (`lastMoveAt + remaining + 500 ms grace`).
Until this ADR, one `setInterval` swept it **every second**:

- `ZRANGEBYSCORE clock:deadlines -inf +inf` read *every* room, expired or not;
- a `GET` per room; and
- a `clock_sync` broadcast per room, every second, to correct the client countdown.

That meant cost for nothing happening. Measured on 2026-10-09 (`live-baseline.json`):

| | Baseline |
|---|---|
| Redis commands per minute, **zero games** | 60 (1 per second, forever) |
| Redis commands per game per minute, nobody moving | 72 |
| Socket messages per game per minute, nobody moving | 120 |
| Flag-fall precision | up to 1 s late (poll granularity) |

At 60 commands a minute, the server sends ~2.6M Redis commands a month while completely
idle. That's enough to exhaust a free-tier Redis command quota on its own (ship-plan, "free-tier
risks"), and it contradicts the project goal of measurably low running cost.

The per-second `clock_sync` existed because the client counted down by subtracting a fixed
1000 ms per `setInterval` tick, which drifts whenever the browser throttles timers
(background tabs).

## Decision

**1. Sleep until the earliest deadline instead of polling.**
- `scheduleSweep(at)` keeps exactly one `setTimeout` per process, for the earliest known
  deadline. Every `setDeadline` (game start, each move, each computer move) returns its
  deadline, and the gateway calls `scheduleSweep` with it. An earlier deadline pulls the
  wake-up forward; a later one is ignored.
- When the timer fires: `ZRANGEBYSCORE clock:deadlines -inf <now>` reads **only expired**
  rooms, each is CAS-claimed to `ended` exactly as before, then `armSweep()` re-reads the
  earliest remaining deadline (`ZRANGE … 0 0 WITHSCORES`) and schedules again.
- No deadlines → no timer → **zero** Redis commands while idle.
- Boot calls `armSweep()` once, so deadlines already in Redis still flag after a restart.
- Guards: sleep at most 60 s (a missed re-arm can't strand a game), at least 250 ms (a
  deadline that can't be settled yet can't hot-loop).

**2. No per-second `clock_sync`.** Clocks reach clients with every `move_made`, in
`game_start`, and in the `game_state` join/reconnect snapshot. That snapshot now carries the
**live** clock (`liveTimers`: the side to move's time minus time spent thinking), not
the stale last-move clock.

**3. The client counts down by wall-clock time.** `ChessGame.tsx` anchors on the last
server reading (`{ timers, at: Date.now() }`) and displays `timers[side] − (now − at)`, so
a throttled interval can only make the display update late, never drift.

## Consequences

Measured after (`live-event-driven.json`), same machine, same script:

| | Before | After |
|---|---|---|
| Redis commands/min, zero games (app's own) | 60 | **0** |
| Redis commands per game per minute, nobody moving | 72 | **4** |
| Socket messages per game per minute, nobody moving | 120 | **0** |
| Redis commands per move | 5.3 | 5 |
| Flag-fall precision | ≤ 1 s late | on the deadline (10,534 ms vs 10,500 ms) |

(The bench's own `INFO`/`CONFIG` calls and Docker's health-check `PING` account for the
14/min the idle window reports; with no bench running, a 20 s window showed only `PING`.)

**Costs / risks**
- **Single instance assumed** (ADR-0032 already requires it). The wake-up timer is
  per process and learns of new deadlines only from its own `setDeadline` calls. A second
  instance would see deadlines set by the first only at its next 60 s re-arm. Before
  instance #2: re-arm from Redis periodically on every instance, or consume Redis keyspace
  notifications. The `claimEnd` CAS already makes concurrent sweepers safe.
- **Clock drift between server corrections.** Clients no longer get a correction every
  second. The wall-clock anchor makes that safe: the display error is bounded by the
  one-way network delay at the last move, which is the same error any move echo has.
- `clock_sync` is removed from the protocol (`websocket-events.md`). No client depends on
  it; `verify-clocks.mjs` now asserts it is **not** sent.

## Alternatives considered

- **Keep polling, but read only expired rooms.** Cuts per-game cost but still 60 idle
  commands a minute. Rejected: the idle cost was the main problem.
- **Redis keyspace notifications (per-room key TTL = deadline).** No timer in the app at
  all, but expired-key events are best-effort and delivered only to connected
  subscribers. Losing one would hang a game. A good candidate when going multi-instance,
  paired with this ADR's re-arm as a backstop.
- **A per-game `setTimeout`.** Rejected in ADR-0004 (doesn't survive a restart, N timers);
  one timer for the earliest deadline keeps the restart safety.
