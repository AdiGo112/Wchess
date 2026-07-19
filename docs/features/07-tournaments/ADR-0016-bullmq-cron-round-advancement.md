# ADR-0016: BullMQ Delayed Jobs for Automatic Round Advancement

**Status:** Accepted
**Date:** 2026-06-24

## Context

Tournament rounds need to start and advance automatically. Two trigger points exist:
1. **Tournament start**: When `startAt` arrives, transition UPCOMING → ONGOING and pair round 1.
2. **Round end**: When either all games in a round complete OR a time limit expires (for rounds with time controls), advance to the next round.

Options considered:
- **Cron job**: A recurring cron checks all ONGOING tournaments every minute and advances rounds as needed. Simple but introduces up to 60 seconds of delay. Also fires unnecessarily when no tournaments are active.
- **BullMQ delayed jobs**: A specific job is enqueued for each event at the precise time needed. Fires exactly when needed, no busy-polling.
- **WebSocket event trigger only**: Only advance when the last game completes. Problem: if a game times out or a player disconnects without the game completing, the round never advances.

BullMQ was already adopted as the job queue system (Feature 03 matchmaking uses it). Adding tournament jobs reuses existing infrastructure.

## Decision

Use BullMQ delayed jobs on a `tournaments` queue:
- On tournament create: enqueue `start-tournament` job with delay = `startAt - Date.now()`.
- On each round creation: enqueue `advance-round` job with `{ tournamentId, expectedRound: N }` and delay = `roundDuration` (e.g., 30 minutes for a 5+3 tournament round).
- When all games in a round complete early, call `advanceRound()` directly and make the pending `advance-round` job idempotent (it checks `currentRound !== expectedRound` and exits early if already advanced).
- The idempotency check is essential: `tournament.currentRound` is the source of truth. The job stores `expectedRound` in its data and compares before acting.

## Consequences

**Positive:**
- Precise timing: tournaments start and advance at the correct time, not up to N minutes late.
- No busy-polling: system resources are not consumed when no tournaments are running.
- Early completion handled gracefully: direct call + idempotent job = no double advancement.
- BullMQ is already in the stack (no new infrastructure).

**Negative:**
- Jobs must be strictly idempotent — advancing the same round twice would create duplicate Game rows. The `expectedRound` guard prevents this, but the code must be tested carefully.
- If Redis (BullMQ's backing store) goes down and the job is lost, the tournament will not advance until the next `advance-round` job (or manual intervention). Acceptable risk for v1.

**Neutral:**
- Round duration is derived from the tournament's time control. For a 5+3 game, the maximum game duration is approximately (5 min × 2 players) + (40 moves × 3 sec) = 12 minutes. A safe round window might be 15-20 minutes. This is a product decision, not a technical one.
