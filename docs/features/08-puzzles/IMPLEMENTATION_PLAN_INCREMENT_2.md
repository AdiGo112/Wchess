# Feature 08 — Puzzles: Increment 2 Implementation Plan

## Scope

Increment 2 delivers the puzzle attempt submission flow and the Glicko-2 rating system. It builds on the read-only infrastructure from Increment 1 by adding `POST /puzzles/:id/attempt`, `PuzzleRatingService`, and the `UserPuzzleRating` Prisma model. When a user submits an attempt, the backend maps the `(solved, timeTaken)` pair to a quality score (0–5), calls `PuzzleRatingService` to compute Glicko-2 deltas for both the puzzle and the user, and upserts a `UserPuzzleAttempt` row. The response returns the attempt ID, quality, rating delta, and a placeholder `nextReview` date (SM-2 scheduling is not yet implemented — it is added in Increment 3). The `GET /puzzles/next` endpoint is also introduced in this increment to begin returning the SM-2 priority queue query, though all new attempts will have default SM-2 state until Increment 3 is complete.

## Files Created / Modified

| File | Action |
|---|---|
| `prisma/migrations/YYYYMMDDHHMMSS_add_user_puzzle_rating/migration.sql` | Create |
| `prisma/schema.prisma` | Modify — add `UserPuzzleRating` model |
| `src/puzzles/puzzles.controller.ts` | Modify — add `POST /:id/attempt` and `GET /next` routes |
| `src/puzzles/puzzles.service.ts` | Modify — add `recordAttempt`, `getNextPuzzle`, `mapQuality` methods |
| `src/puzzles/puzzle-rating.service.ts` | Create |
| `src/puzzles/dto/attempt-puzzle.dto.ts` | Create |
| `src/puzzles/puzzles.module.ts` | Modify — provide `PuzzleRatingService` |

## Acceptance Criteria

- [ ] `POST /puzzles/:id/attempt` returns 401 without a valid JWT
- [ ] `POST /puzzles/:id/attempt` returns 400 if `timeTaken` is missing, zero, or negative
- [ ] `POST /puzzles/:id/attempt` returns 400 if `solved` is not a boolean
- [ ] `POST /puzzles/:id/attempt` returns 404 if the puzzle ID does not exist
- [ ] `POST /puzzles/:id/attempt` with `{ solved: true, timeTaken: 8000 }` returns 201 with `quality: 5`
- [ ] `POST /puzzles/:id/attempt` with `{ solved: true, timeTaken: 35000 }` returns 201 with `quality: 4`
- [ ] `POST /puzzles/:id/attempt` with `{ solved: true, timeTaken: 65000 }` returns 201 with `quality: 2`
- [ ] `POST /puzzles/:id/attempt` with `{ solved: false, timeTaken: 5000 }` returns 201 with `quality: 0`
- [ ] After a successful attempt, a `UserPuzzleAttempt` row exists in the DB with the correct `userId`, `puzzleId`, and `solved` values
- [ ] After a successful attempt, a `UserPuzzleRating` row is upserted for the user with `rating > 1500` (for a solved puzzle against equal-rated puzzle)
- [ ] The `ratingDelta` in the response has `userRatingAfter > userRatingBefore` when `solved: true`
- [ ] The `ratingDelta` in the response has `puzzleRatingAfter < puzzleRatingBefore` when `solved: true` (puzzle "lost")
- [ ] `GET /puzzles/next` returns 401 without a JWT
- [ ] `GET /puzzles/next` returns a puzzle with `source: 'new'` for a user who has never attempted any puzzle
- [ ] Unit tests in `src/puzzles/puzzle-rating.service.spec.ts` pass for all Glicko-2 test cases

## Complexity

**L** — Large. The Glicko-2 algorithm implementation is mathematically non-trivial (Illinois convergence algorithm for volatility update). Requires careful translation of the Glishman paper's equations into TypeScript, plus test vectors for validation. The `recordAttempt` method orchestrates three operations (quality mapping, Glicko-2, Prisma upsert) and must be transactionally safe if any step fails.
