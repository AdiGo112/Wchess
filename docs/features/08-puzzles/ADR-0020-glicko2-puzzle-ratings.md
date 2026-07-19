# ADR-0020 — Use Glicko-2 for Puzzle and User Puzzle Ratings

## Status

Accepted

## Context

After each puzzle attempt, the system must update two ratings: the puzzle's difficulty rating (does this puzzle deserve a higher or lower rating?) and the user's puzzle skill rating (did the user demonstrate stronger or weaker tactical ability?). The outcome is binary: solved or not solved.

Alternatives considered:

1. **Elo (two-player variant)** — treat each puzzle attempt as a match between user and puzzle; update both ratings using the standard Elo formula. Simple but has known weaknesses: does not model rating uncertainty; all established ratings are treated as equally reliable regardless of sample size.
2. **Fixed difficulty** — keep puzzle ratings at their imported Lichess values permanently; only update a simple user puzzle score. Does not allow ChessWeb's ratings to diverge from Lichess's when user populations differ.
3. **TrueSkill** — designed for multiplayer games; not appropriate for a binary user-vs-puzzle context.
4. **Glicko-1** — adds a rating deviation (RD) to Elo; accounts for uncertainty. Simpler than Glicko-2 but does not model rating volatility.
5. **Glicko-2** — extends Glicko-1 with a volatility parameter (σ) that measures whether a player is on a consistent winning or losing streak. Used by FIDE, Lichess, and Chess.com for game ratings; already familiar to chess players.

**Why Glicko-2 over Elo:**

Puzzles have widely varying sample counts. A puzzle with 10 attempts has high uncertainty (RD ≈ 350); a puzzle with 10,000 attempts is well-calibrated (RD ≈ 30). Glicko-2's RD makes this uncertainty explicit and causes new puzzles to move quickly toward their true difficulty while established puzzles change slowly. Elo has no equivalent mechanism.

**Why reuse Glicko-2 (same as game ratings) rather than a different system for puzzles:**

ChessWeb already uses Glicko-2 for game ratings (`UserRating` table). Using the same algorithm for puzzle ratings means:
- One implementation to maintain (`PuzzleRatingService` mirrors the structure of `RatingService`)
- Consistent rating semantics — a puzzle rating of 1500 and a game rating of 1500 are both "average" for their respective populations
- Familiar rating display logic — the same UI components that show game rating deltas can be reused for puzzle rating deltas

**Separation from game ratings:**

Puzzle ratings are completely independent of game ratings. The `UserRating` table tracks game performance by variant (standard, blitz, bullet, etc.). Puzzle rating state is tracked separately — either in a `UserPuzzleRating` table or derived from `UserPuzzleAttempt` records. There is no cross-contamination: solving puzzles well does not improve game ratings, and vice versa.

**Initial values:**
- New puzzle on import: `{ rating: <lichessRating>, ratingDeviation: <lichessRD>, volatility: 0.06 }`
- User's first puzzle attempt (no prior puzzle rating): `{ rating: 1500, ratingDeviation: 350, volatility: 0.06 }` — the Glicko-2 defaults for a provisionally-rated player

## Decision

Implement `PuzzleRatingService` using the Glicko-2 algorithm to update both the puzzle's rating and the user's puzzle rating after every `POST /puzzles/:id/attempt`.

**Glicko-2 update steps (per the Glishman 2012 paper):**

```
Step 1: Convert to Glicko-2 internal scale
  μ  = (r - 1500) / 173.7178
  φ  = RD / 173.7178

Step 2: For each game result (one puzzle attempt = one game):
  g(φ_j) = 1 / sqrt(1 + 3φ_j² / π²)
  E(s|μ, μ_j, φ_j) = 1 / (1 + exp(-g(φ_j) * (μ - μ_j)))
  s_j = 1 if solved, 0 if not

Step 3: Compute estimated variance
  v = 1 / (g(φ_j)² * E * (1 - E))

Step 4: Compute delta
  Δ = v * g(φ_j) * (s_j - E)

Step 5: Compute new volatility σ' (Illinois algorithm — see Glishman paper)

Step 6: Update φ and μ
  φ* = sqrt(φ² + σ'²)
  φ' = 1 / sqrt(1/φ*² + 1/v)
  μ' = μ + φ'² * g(φ_j) * (s_j - E)

Step 7: Convert back to rating scale
  r' = 173.7178 * μ' + 1500
  RD' = 173.7178 * φ'
```

The update is applied symmetrically: user is the "player", puzzle is the "opponent". For a solved puzzle, the user "wins" (s=1) and the puzzle "loses" (s=0). For a failed puzzle, the user "loses" (s=0) and the puzzle "wins" (s=1).

**Storage:**

- Puzzle rating: stored directly on the `Puzzle` row (`rating`, `ratingDeviation` columns); updated via `prisma.puzzle.update` after each attempt
- User puzzle rating: stored in a `UserPuzzleRating` table (one row per user) with columns `userId`, `rating`, `ratingDeviation`, `volatility`; upserted after each attempt

**Rating delta returned to client:**

```typescript
interface RatingDelta {
  userRatingBefore: number;
  userRatingAfter: number;
  puzzleRatingBefore: number;
  puzzleRatingAfter: number;
}
```

This enables the frontend to display "+12 puzzle rating" after a solve.

## Consequences

**Positive:**
- Rating uncertainty (RD) prevents new puzzles from being over-trusted; well-sampled puzzles become stable reference points
- ChessWeb puzzle ratings will naturally diverge from Lichess ratings over time, reflecting ChessWeb's specific user population
- Volatility (σ) allows recovering from rating miscalibration — if a puzzle is consistently solved by users rated far below it, the volatility prevents the rating from getting stuck
- Consistent algorithm across game and puzzle ratings reduces implementation surface area
- RD displayed alongside rating on the stats page gives users an honest confidence indicator

**Negative / Trade-offs:**
- Glicko-2 is more complex than Elo; the Illinois algorithm step for computing new volatility requires iterative convergence and is non-trivial to implement correctly — test vectors from the Glishman paper must be used to validate the implementation (see `AUTOMATED_TESTING_STRATEGY.md`)
- The update happens synchronously during `POST /puzzles/:id/attempt`; for 11M concurrent users this may become a bottleneck — consider moving rating updates to a BullMQ job in a future increment
- Puzzle rating RD grows over time if a puzzle receives no attempts; this is by design (uncertainty increases when a player is inactive) but means rarely-attempted puzzles move more than expected when they are eventually attempted
- The Glicko-2 rating period (typically 1–2 weeks of games) is not applicable here; each puzzle attempt triggers an immediate update. This is equivalent to Glicko-2 with a rating period of one game, which is a standard simplification for online chess systems
