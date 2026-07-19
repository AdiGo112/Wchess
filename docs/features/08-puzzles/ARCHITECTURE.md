# 08-Puzzles — Architecture

## System Diagram

```
Browser (React)
    │
    │  HTTP REST
    ▼
PuzzlesController          (src/puzzles/puzzles.controller.ts)
    │
    ├──► PuzzlesService     (src/puzzles/puzzles.service.ts)
    │       │
    │       ├──► Prisma (PostgreSQL)
    │       │       ├── Puzzle table
    │       │       └── UserPuzzleAttempt table
    │       │
    │       ├──► ioredis
    │       │       ├── GET/SETEX puzzle:daily
    │       │       └── HGETALL/HSET user:{userId}:puzzle_streak
    │       │
    │       ├──► SpacedRepetitionService
    │       │       └── calculateNextReview(sm2State, quality) → SM2State
    │       │
    │       └──► PuzzleRatingService
    │               └── updateRatings(puzzleId, userId, solved) → RatingDelta
    │
    └──► JwtAuthGuard / OptionalJwtAuthGuard
```

No Socket.io is used in the puzzle flow. All interactions are synchronous HTTP request/response.

## Module Structure

```
src/puzzles/
├── puzzles.module.ts
├── puzzles.controller.ts
├── puzzles.service.ts
├── puzzle-rating.service.ts
├── spaced-repetition.service.ts
├── dto/
│   ├── attempt-puzzle.dto.ts       // { solved: boolean, timeTaken: number }
│   ├── puzzle-list-query.dto.ts    // { theme?, minRating?, maxRating?, page? }
│   └── puzzle-response.dto.ts
├── interfaces/
│   ├── sm2-state.interface.ts      // { easeFactor, interval, repetitions, nextReview }
│   └── rating-delta.interface.ts   // { userRatingBefore, userRatingAfter, puzzleRatingBefore, puzzleRatingAfter }
└── seeds/
    └── seed-puzzles.ts             // Lichess CSV import script
```

## Data Flow: Solving a Puzzle

```
1. GET /puzzles/next
   PuzzlesService.getNextPuzzle(userId)
     → Prisma: SELECT * FROM UserPuzzleAttempt
               WHERE userId = $1 AND nextReview <= NOW()
               ORDER BY nextReview ASC LIMIT 1
     → if none: SELECT * FROM Puzzle
                WHERE id NOT IN (SELECT puzzleId FROM UserPuzzleAttempt WHERE userId=$1)
                ORDER BY RANDOM() LIMIT 1
     → returns Puzzle row + current SM-2 state

2. POST /puzzles/:id/attempt { solved, timeTaken }
   PuzzlesService.recordAttempt(userId, puzzleId, dto)
     a. Calculate quality from (solved, timeTaken)
     b. SpacedRepetitionService.calculateNextReview(currentSM2State, quality) → newSM2State
     c. PuzzleRatingService.updateRatings(puzzleId, userId, solved) → ratingDelta
     d. Prisma.userPuzzleAttempt.upsert (update SM-2 fields + solved/timeTaken)
     e. Return { nextReview, ratingDelta, quality }
```

## Redis Key Patterns

| Key | Type | TTL | Value |
|---|---|---|---|
| `puzzle:daily` | String | seconds until next midnight UTC | Puzzle ID (string) |
| `user:{userId}:puzzle_streak` | Hash | No TTL (persistent) | `{ streak: "7", lastSolvedDate: "2026-06-23" }` |

### Computing TTL for Daily Puzzle

```typescript
function secondsUntilMidnightUTC(): number {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setUTCHours(24, 0, 0, 0); // next midnight UTC
  return Math.floor((midnight.getTime() - now.getTime()) / 1000);
}
```

## Daily Puzzle Cron Job (BullMQ)

```
BullMQ Worker (cron: '0 0 * * *')
  1. SELECT * FROM Puzzle WHERE rating BETWEEN 1400 AND 1600 ORDER BY RANDOM() LIMIT 1
  2. redis.setex('puzzle:daily', secondsUntilMidnightUTC(), puzzle.id)
  3. Log selection to application logger
```

The worker is registered in `PuzzlesModule` via `BullModule.registerQueue({ name: 'puzzles' })`.

## PostgreSQL Indexing Strategy

```sql
-- Supports SM-2 queue: "give me puzzles due for this user"
CREATE INDEX ON "UserPuzzleAttempt" ("userId", "nextReview");

-- Supports rating-range filter in GET /puzzles?minRating=...
CREATE INDEX ON "Puzzle" ("rating");

-- Supports theme filter: WHERE themes @> ARRAY['fork']
CREATE INDEX ON "Puzzle" USING gin ("themes");
```

The GIN index on `themes` is added via Prisma migration using a raw SQL block in the migration file.

## Puzzle Seeder

```
src/puzzles/seeds/seed-puzzles.ts
  1. Open data/lichess_db_puzzle.csv for streaming
  2. Pipe through csv-parse (delimiter: ',', columns: true, skip_empty_lines: true)
  3. Collect rows into batches of 1,000
  4. For each batch: prisma.puzzle.createMany({ data: batch, skipDuplicates: true })
  5. Log progress every 10,000 rows
  Runtime: ~10 minutes for 3.3M puzzles on standard hardware
  Command: npx ts-node src/puzzles/seeds/seed-puzzles.ts data/lichess_db_puzzle.csv
```

## Separation from Game Ratings

Puzzle ratings are entirely independent of game (Elo/Glicko-2) ratings:

- `User.rating` and variant-specific ratings live in `UserRating` table (managed by RatingService)
- Puzzle rating is derived from `UserPuzzleAttempt` records — there is no persistent `User.puzzleRating` column; instead `PuzzleRatingService` computes and stores it in a `UserPuzzleRating` table or returns it aggregated from attempts
- A high puzzle rating does not affect a user's game rating and vice versa

## Frontend Architecture

```
React Router
  /puzzles           → PuzzleListPage
  /puzzles/daily     → PuzzleDailyPage
  /puzzles/:id       → PuzzlePage

State:
  Zustand puzzleSlice: { currentPuzzleId, puzzleSolved, movesPlayed[], attemptStartTime }
  React Query: usePuzzle(id), useNextPuzzle(), useAttemptPuzzle()

Board:
  react-chessboard with chess.js for move legality
  Solution validation: compare user move (UCI) against puzzle.moves array index
```
