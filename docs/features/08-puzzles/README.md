# 08-Puzzles — Feature Overview

## Summary

The puzzles feature delivers tactical chess training backed by ~3.3 million puzzles from the Lichess open dataset. Each puzzle is a real game position where the correct continuation is one or more moves. The system tracks per-user performance, updates ratings after every attempt using Glicko-2, and schedules future reviews using the SM-2 spaced repetition algorithm so that users revisit difficult puzzles at optimal intervals.

## Lichess Open Puzzle Dataset

- **Source:** `https://database.lichess.org/#puzzles` — released under CC0 (public domain)
- **Size:** ~3.3 million puzzles (CSV, ~900 MB compressed)
- **Format:** tab-separated CSV with columns: PuzzleId, FEN, Moves, Rating, RatingDeviation, Popularity, NbPlays, Themes, GameUrl, OpeningTags
- **Import:** Node.js seeder script (`npm run seed:puzzles`) reads the CSV line-by-line and batch-inserts via Prisma `createMany` in chunks of 1,000 rows
- **Puzzle FEN:** the position immediately before the first move in `Moves` — the opponent's last move has already been played
- **Moves:** space-separated UCI move strings, e.g. `"e2e4 d7d5 f1b5"` — the first move is the opponent's (played automatically), the rest are the user's expected continuation

## Rating System (Glicko-2)

Both puzzles and users carry independent Glicko-2 ratings for the puzzle domain:

| Parameter | Initial Value | Notes |
|---|---|---|
| `rating` | Imported from Lichess (typically 600–3000) | Updated after each user attempt |
| `ratingDeviation` | 350 for new users; imported value for puzzles | Shrinks as more attempts accumulate |
| `sigma` (volatility) | 0.06 (Glicko-2 default) | Tracks rating instability |

- A solved puzzle causes the user's puzzle rating to increase and the puzzle's rating to decrease (puzzle was "too easy")
- A failed puzzle causes the user's rating to decrease and the puzzle's rating to increase (puzzle was "too hard")
- New puzzles with high RD can move quickly; well-sampled puzzles stabilize

## Spaced Repetition (SM-2)

After each attempt, SM-2 calculates when the user should next see this puzzle:

**Quality mapping from attempt result:**

| Condition | Quality |
|---|---|
| Failed (solved = false) | 0 |
| Solved, timeTaken >= 60s | 2 |
| Solved, timeTaken < 60s | 3 |
| Solved, timeTaken < 30s | 4 |
| Solved, timeTaken < 10s | 5 |

**SM-2 interval rules:**
- Quality < 3 → reset interval to 1 day, repetitions to 0
- Quality >= 3, repetitions = 0 → next interval = 1 day
- Quality >= 3, repetitions = 1 → next interval = 6 days
- Quality >= 3, repetitions > 1 → next interval = round(prevInterval × easeFactor)
- easeFactor minimum: 1.3

## Themes and Tags

Puzzles are tagged with one or more tactical themes drawn from the Lichess taxonomy:

`fork`, `pin`, `skewer`, `discoveredAttack`, `doubleCheck`, `mateIn1`, `mateIn2`, `mateIn3`, `mateIn4`, `mateIn5`, `backRankMate`, `smotheredMate`, `arabianMate`, `deflection`, `decoy`, `interference`, `zugzwang`, `sacrifice`, `xRayAttack`, `trappedPiece`, `exposedKing`, `endgame`, `middlegame`, `opening`, `queenEndgame`, `rookEndgame`, `bishopEndgame`, `knightEndgame`, `pawnEndgame`

Opening tags (e.g. `sicilianDefense`, `ruiLopez`) are stored separately in `openingTags[]`.

## Daily Puzzle

- One puzzle selected for all users each day — everyone sees the same puzzle
- Selected by a BullMQ cron job at 00:00 UTC; puzzle rating 1400–1600 (accessible to most users)
- Stored in Redis as `puzzle:daily` with TTL set to the number of seconds remaining until the next midnight UTC
- No JWT required to view the daily puzzle
- A separate streak counter tracks consecutive days a user solves the daily puzzle

## Prisma Models

```prisma
model Puzzle {
  id              String   @id  // Lichess puzzle ID, e.g. "00008"
  fen             String
  moves           String   // space-separated UCI moves e.g. "e2e4 d7d5"
  rating          Float    @default(1500)
  ratingDeviation Float    @default(350)
  themes          String[] // array of theme tags
  openingTags     String[]
  attempts        UserPuzzleAttempt[]

  @@index([rating])
  @@index([themes], type: Gin) // GIN index for array containment queries
}

model UserPuzzleAttempt {
  id           String   @id @default(cuid())
  userId       String
  user         User     @relation(fields: [userId], references: [id])
  puzzleId     String
  puzzle       Puzzle   @relation(fields: [puzzleId], references: [id])
  solved       Boolean
  timeTaken    Int      // milliseconds
  attemptedAt  DateTime @default(now())
  // SM-2 fields:
  easeFactor   Float    @default(2.5)
  interval     Int      @default(1) // days until next review
  repetitions  Int      @default(0)
  nextReview   DateTime @default(now())

  @@unique([userId, puzzleId])
  @@index([userId, nextReview]) // supports SM-2 queue query
}
```

## Dependencies

- `chess.js` — move validation on both backend (seeder) and frontend (board interaction)
- `react-chessboard` — interactive chessboard React component
- `csv-parse` — streaming CSV parser for the seeder script
- `ioredis` — Redis client for daily puzzle cache and streak tracking
- BullMQ — cron job for daily puzzle rotation
- Prisma — PostgreSQL ORM for Puzzle and UserPuzzleAttempt tables
