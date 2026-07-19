# 08-Puzzles — Domain Model

## Entities

### Puzzle

Represents a single tactical position imported from the Lichess puzzle dataset.

```typescript
interface Puzzle {
  id: string;              // Lichess puzzle ID — immutable primary key
  fen: string;             // Starting FEN — immutable after import
  moves: string;           // Space-separated UCI moves — immutable after import
                           // First move = opponent's (auto-played); rest = user's solution
  rating: number;          // Glicko-2 rating — mutable, updated after each attempt
  ratingDeviation: number; // Glicko-2 RD — mutable
  themes: string[];        // Tactical tags — immutable after import
  openingTags: string[];   // Opening family tags — immutable after import
}
```

**Invariants:**
- `fen` and `moves` are never modified after import (they are the ground truth from Lichess)
- `id` is the Lichess puzzle ID, kept as-is to allow safe re-imports with `skipDuplicates: true`
- `rating` and `ratingDeviation` diverge from the original Lichess values over time as ChessWeb users solve puzzles

### UserPuzzleAttempt

Join table between `User` and `Puzzle`. One row per (user, puzzle) pair. Carries the full SM-2 state so the system knows when to resurface the puzzle.

```typescript
interface UserPuzzleAttempt {
  id: string;
  userId: string;
  puzzleId: string;
  solved: boolean;         // most recent attempt result
  timeTaken: number;       // milliseconds — most recent attempt duration
  attemptedAt: Date;       // timestamp of most recent attempt
  // SM-2 state:
  easeFactor: number;      // default 2.5; minimum 1.3
  interval: number;        // days until next review; starts at 1
  repetitions: number;     // number of consecutive successful reviews; starts at 0
  nextReview: Date;        // when this puzzle should next be shown to the user
}
```

**Invariants:**
- Unique on `(userId, puzzleId)` — upserted on each attempt (only the most recent SM-2 state is kept)
- `easeFactor` must never fall below 1.3 (SM-2 hard floor)
- `nextReview` is always a future date after a successful attempt (quality >= 3), or tomorrow after a failed one

## Value Objects

### PuzzleRating

Encapsulates Glicko-2 rating state for either a Puzzle or a User's puzzle performance:

```typescript
interface PuzzleRating {
  rating: number;           // μ — current skill estimate
  ratingDeviation: number;  // φ — uncertainty; high RD = fewer data points
  volatility: number;       // σ — measures expected rating fluctuation (default 0.06)
}
```

Initial values:
- New puzzle on import: `{ rating: <lichessRating>, ratingDeviation: <lichessRD>, volatility: 0.06 }`
- New user's first puzzle attempt: `{ rating: 1500, ratingDeviation: 350, volatility: 0.06 }`

### SM2State

Snapshot of the SM-2 algorithm state for one (user, puzzle) pair:

```typescript
interface SM2State {
  easeFactor: number;  // EF — efficiency factor; controls how fast interval grows
  interval: number;    // days until next review
  repetitions: number; // consecutive successful reviews (quality >= 3)
  nextReview: Date;    // absolute date of next scheduled review
}
```

**Initial state (first attempt):** `{ easeFactor: 2.5, interval: 1, repetitions: 0, nextReview: new Date() }`

### RatingDelta

Returned to the client after a `POST /puzzles/:id/attempt` to show rating movement:

```typescript
interface RatingDelta {
  userRatingBefore: number;
  userRatingAfter: number;
  puzzleRatingBefore: number;
  puzzleRatingAfter: number;
}
```

## Aggregates

### PuzzleSession

A sequence of puzzle attempts within a single user sitting (not persisted as a table — derived concept used in stats). Defined as all `UserPuzzleAttempt` rows for a user within a contiguous time window (e.g., the same calendar day).

Properties derivable from the session:
- Accuracy for the session: `solvedCount / totalAttempts * 100`
- Session rating delta: sum of `ratingDelta.userRatingAfter - ratingDelta.userRatingBefore`
- Themes practiced in the session

## Domain Rules

### Quality Mapping

The quality score (0–5) bridges the SM-2 algorithm to chess puzzle outcomes:

| Condition | Quality | Meaning |
|---|---|---|
| `solved = false` | 0 | Complete failure — blackout |
| `solved = true && timeTaken >= 60000ms` | 2 | Correct but serious difficulty |
| `solved = true && timeTaken < 60000ms` | 3 | Correct with hesitation |
| `solved = true && timeTaken < 30000ms` | 4 | Correct with small effort |
| `solved = true && timeTaken < 10000ms` | 5 | Perfect recall |

Note: quality 1 is not used (would represent partial recall that is not applicable to binary pass/fail chess puzzles).

### SM-2 Interval Progression

```
quality < 3:
  repetitions = 0
  interval = 1

quality >= 3:
  new_ef = max(1.3, ef + 0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))
  if repetitions == 0: new_interval = 1
  if repetitions == 1: new_interval = 6
  if repetitions > 1:  new_interval = round(prev_interval * ef)
  repetitions += 1
```

Example for a user solving a puzzle 3 times with quality 5 each time:
- Attempt 1: interval=1, repetitions=1, EF=2.6, nextReview = today+1
- Attempt 2: interval=6, repetitions=2, EF=2.7, nextReview = today+6
- Attempt 3: interval=round(6*2.7)=16, repetitions=3, EF=2.8, nextReview = today+16

### Puzzle Rating Immutability

Only `rating` and `ratingDeviation` on a Puzzle are mutable. `fen`, `moves`, `themes`, and `openingTags` are write-once (imported from Lichess and never overwritten by user activity).

### Daily Puzzle Independence

Solving the daily puzzle counts toward SM-2 scheduling (a `UserPuzzleAttempt` is created just like any other puzzle), but the daily streak is tracked separately in Redis and only increments when the daily puzzle specifically is solved.

### Puzzle Rating vs Game Rating

These are completely independent systems:
- `UserPuzzleAttempt` records + `PuzzleRatingService` → user's puzzle Glicko-2 rating
- `UserRating` table → user's game Glicko-2 rating per variant
- No cross-contamination; solving puzzles well does not improve game rating in the data model
