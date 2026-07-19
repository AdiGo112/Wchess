# ADR-0017: Explicit Tournament Lifecycle States

**Status:** Accepted
**Date:** 2026-06-24

## Context

Tournaments go through distinct phases: registration, active play, and completion. Operations that are valid in one phase are invalid in another (joining is only valid during registration; pairing only happens during active play). Without a formal state machine, guards become scattered across the codebase and are easy to forget or bypass.

## Decision

Use an explicit `TournamentStatus` enum with three states: `UPCOMING`, `ONGOING`, `COMPLETED`. All state transitions happen only through named service methods with guard checks:

- `UPCOMING → ONGOING`: Only via `TournamentsProcessor.handleStartTournament()`. Guard: tournament must currently be `UPCOMING`.
- `ONGOING → COMPLETED`: Only via `TournamentsService.advanceRound()` when `currentRound >= maxRounds`. Guard: tournament must currently be `ONGOING`.

No other transitions are permitted. There is no `PAUSED` state, no `CANCELLED` state, and no direct field mutation (`UPDATE tournaments SET status = ?`) without going through the service method.

Each service method that mutates state performs an optimistic lock check:
```typescript
const updated = await prisma.tournament.updateMany({
  where: { id: tournamentId, status: 'UPCOMING' }, // Guard
  data: { status: 'ONGOING', currentRound: 1 },
});
if (updated.count === 0) {
  throw new Error('State transition failed: tournament is not UPCOMING');
}
```

This uses Prisma's `updateMany` with a `where` clause as an optimistic lock — if the state has already changed (e.g., due to a race condition with a duplicate BullMQ job), the update affects 0 rows and the transition is rejected.

## Consequences

**Positive:**
- All state mutation is centralized and auditable.
- Race conditions (e.g., BullMQ job fires twice) are handled by the optimistic lock — only one transition succeeds.
- Business rules ("cannot join after tournament starts") are enforced at the data layer, not just the HTTP layer.

**Negative:**
- Rigid: no pausing or cancelling an ongoing tournament in v1. This is an explicit trade-off — adding `PAUSED` or `CANCELLED` states in v2 is straightforward but requires migration.
- The optimistic lock check (updateMany with where clause) is less ergonomic than a simple update. Worth the safety.

**Neutral:**
- The three-state model is sufficient for all v1 tournament types (Swiss, Arena, Round Robin, Knockout).
