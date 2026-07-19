# Feature 07 — Tournaments: Increment 5 Implementation Plan

## Scope

BullMQ automation: enqueue `start-tournament` job on create, `advance-round` job on round creation. Processor handles both job types. `recordGameResult()` triggers immediate advancement when all games in a round complete.

## Files Created / Modified

| File | Action |
|------|--------|
| `backend/src/tournaments/tournaments-queue.module.ts` | Create |
| `backend/src/tournaments/tournaments.processor.ts` | Create |
| `backend/src/tournaments/tournaments.service.ts` | Modify (enqueue jobs in create(), implement recordGameResult()) |
| `backend/src/tournaments/tournaments.module.ts` | Modify (import TournamentsQueueModule) |
| `backend/src/game/game.service.ts` | Modify (call TournamentsService.recordGameResult on game end) |

## Acceptance Criteria

- [ ] Creating a tournament enqueues a BullMQ delayed job `start-tournament` with delay = `startAt - Date.now()`.
- [ ] When the job fires, tournament transitions from `UPCOMING` to `ONGOING` using an optimistic lock (updateMany with where status=UPCOMING).
- [ ] Round 1 Game rows are created by the processor.
- [ ] A BullMQ `advance-round` job is enqueued after each round's games are created.
- [ ] When a tournament game ends, `GameService` calls `TournamentsService.recordGameResult(game)`.
- [ ] `recordGameResult` updates scores and checks if all games in the current round are COMPLETED.
- [ ] If all current-round games are done: `advanceRound()` is called immediately.
- [ ] `advance-round` job is idempotent: if `tournament.currentRound !== job.data.expectedRound`, the job returns without action.
- [ ] After `maxRounds` rounds, `status` transitions to `COMPLETED`.
- [ ] Tournament with fewer than 4 players at `startAt`: transitions directly to COMPLETED with no games created.

## Complexity

**L (Large)** — Multiple moving parts: BullMQ job scheduling and idempotency, cross-service calls (GameService → TournamentsService), round completion detection. The idempotency logic requires careful database query design.
