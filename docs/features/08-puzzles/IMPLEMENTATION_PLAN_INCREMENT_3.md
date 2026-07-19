# Feature 08 — Puzzles: Increment 3 Implementation Plan

## Scope

Increment 3 completes the backend by wiring in full SM-2 spaced repetition scheduling and the BullMQ daily puzzle cron job. `SpacedRepetitionService` is created as a pure stateless service implementing the SM-2 algorithm. `recordAttempt` in `PuzzlesService` is updated to call `SpacedRepetitionService.calculateNextReview` and persist the resulting `easeFactor`, `interval`, `repetitions`, and `nextReview` values on the `UserPuzzleAttempt` row. The `getNextPuzzle` method is updated to prioritise due puzzles (by `nextReview <= NOW()`) over new puzzles. The BullMQ worker that selects and caches the daily puzzle at 00:00 UTC is registered. The `GET /puzzles/stats` endpoint is also added in this increment. After this increment all five backend endpoints described in API_DESIGN.md are fully functional.

## Files Created / Modified

| File | Action |
|---|---|
| `src/puzzles/spaced-repetition.service.ts` | Create |
| `src/puzzles/puzzles.service.ts` | Modify — integrate SM-2 in `recordAttempt`; complete `getNextPuzzle` SM-2 queue query; add `getStats` method |
| `src/puzzles/puzzles.controller.ts` | Modify — add `GET /stats` route |
| `src/puzzles/puzzles.processor.ts` | Create — BullMQ processor for `puzzles` queue cron job |
| `src/puzzles/puzzles.module.ts` | Modify — register `SpacedRepetitionService`, `BullModule.registerQueue({ name: 'puzzles' })`, `BullModule.forRootAsync(...)` |
| `src/puzzles/puzzles.service.spec.ts` | Create — unit tests for `getNextPuzzle` and `getDailyPuzzle` |
| `src/puzzles/spaced-repetition.service.spec.ts` | Create — SM-2 unit tests |

## Acceptance Criteria

- [ ] `POST /puzzles/:id/attempt` response now includes a meaningful `nextReview` date (not a placeholder): `today + 1 day` for a first solve
- [ ] After two consecutive solves of the same puzzle, `UserPuzzleAttempt.interval` is 6 and `nextReview` is approximately 6 days from now
- [ ] After a failed attempt on a puzzle the user previously had `interval=16`, the `UserPuzzleAttempt.interval` resets to 1
- [ ] `GET /puzzles/next` returns `source: 'due'` for a user who has a puzzle with `nextReview <= NOW()` in their history
- [ ] `GET /puzzles/next` returns `source: 'new'` for a user with no due puzzles
- [ ] `GET /puzzles/stats` returns 401 without JWT
- [ ] `GET /puzzles/stats` returns `{ totalAttempts, totalSolved, accuracy, currentRating, ratingDeviation, streak, lastSolvedDate }` for an authenticated user
- [ ] BullMQ worker fires at 00:00 UTC and sets `puzzle:daily` in Redis with a TTL equal to seconds until the next midnight UTC (verify by checking Redis after a manual trigger)
- [ ] BullMQ cron can be triggered manually for testing: call `puzzlesQueue.add('selectDailyPuzzle', {}, { repeat: false })` in a test script and confirm `puzzle:daily` is set
- [ ] All unit tests in `spaced-repetition.service.spec.ts` pass (10 test cases covering quality 0–5, EF floor, nextReview date)
- [ ] All unit tests in `puzzles.service.spec.ts` pass (SM-2 queue, Redis hit/miss, 503 fallback)

## Complexity

**M** — Moderate. `SpacedRepetitionService` is a pure function — straightforward to implement once the algorithm is understood. The main complexity is integrating it into `recordAttempt` correctly (read current SM-2 state, compute new state, write back in the upsert). The BullMQ cron setup is boilerplate. The `getStats` endpoint requires a `COUNT`/`SUM` aggregation query on `UserPuzzleAttempt` and a Redis `HGETALL` for the streak.
