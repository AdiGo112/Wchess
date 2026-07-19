# ADR-0019 — Use SM-2 Spaced Repetition Algorithm for Puzzle Scheduling

## Status

Accepted

## Context

After a user attempts a puzzle, the system must decide when to show that puzzle again. The goal is to surface difficult puzzles sooner and well-mastered puzzles less frequently, reducing unnecessary repetition while maximising retention. This is the classic spaced repetition problem.

Alternatives considered:

1. **No scheduling** — show puzzles randomly every time; simple but wastes time repeating already-mastered material and never reinforces difficult positions
2. **Fixed interval** — show every puzzle again after N days; does not adapt to individual performance
3. **SM-2 (SuperMemo 2)** — the original 1987 spaced repetition algorithm by Piotr Wozniak; interval grows multiplicatively based on a per-item ease factor; quality score 0–5 controls ease factor updates
4. **SM-18 / FSRS** — modern successors with higher retention accuracy but significantly more complex state and calibration requirements
5. **Leitner system** — box-based scheduling; simpler than SM-2 but less fine-grained; no per-item ease factor

**Why SM-2 over more modern algorithms:**

- SM-2 is well-understood, has decades of validation, and produces demonstrably good retention for discrete knowledge items (exactly what chess puzzles are)
- FSRS requires a training phase and per-user calibration data before it outperforms SM-2; at launch, ChessWeb has no such calibration data
- SM-2 state is compact: three floats per (user, puzzle) pair — `easeFactor`, `interval`, `repetitions` — stored directly on the `UserPuzzleAttempt` row with no additional tables
- SM-2 is stateless between calls: `calculateNextReview(sm2State, quality) → newSM2State` is a pure function, trivially testable
- The quality score (0–5) maps naturally to chess puzzle outcomes: solved quickly = 5, solved slowly = 3, failed = 0

**Quality mapping design:**

Binary pass/fail chess puzzles require mapping to SM-2's 0–5 scale. The time dimension provides the only continuous signal available:

| Condition | Quality | Rationale |
|---|---|---|
| `solved = false` | 0 | Complete failure — blackout; reset interval |
| `solved = true, timeTaken >= 60s` | 2 | Solved but required substantial time; still resets interval (quality < 3) |
| `solved = true, timeTaken < 60s` | 3 | Correct with hesitation |
| `solved = true, timeTaken < 30s` | 4 | Correct with small effort |
| `solved = true, timeTaken < 10s` | 5 | Immediate recall |

Quality 1 is intentionally unused — it would represent "almost recalled" which is not meaningful in a binary puzzle context. The 60-second threshold for quality 2 means even slow correct solutions reset the interval; this intentionally keeps difficult puzzles in frequent rotation until the user can solve them confidently and quickly.

## Decision

Implement the SM-2 algorithm in `SpacedRepetitionService` as a pure stateless service with a single public method:

```typescript
calculateNextReview(state: SM2State, quality: 0 | 2 | 3 | 4 | 5): SM2State
```

**SM-2 algorithm (exact implementation):**

```
if quality < 3:
  repetitions = 0
  interval = 1

if quality >= 3:
  new_ef = max(1.3, ef + 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))
  if repetitions == 0: new_interval = 1
  elif repetitions == 1: new_interval = 6
  else: new_interval = round(prev_interval * ef)
  repetitions = repetitions + 1

nextReview = today + new_interval days
```

The ease factor floor of 1.3 is the SM-2 specification minimum and prevents the interval from stagnating for consistently difficult puzzles.

SM-2 state is stored on the `UserPuzzleAttempt` row (one row per user–puzzle pair, upserted on each attempt). No separate scheduling table is required.

The `getNextPuzzle` service method queries:
```sql
SELECT * FROM UserPuzzleAttempt
WHERE userId = $1 AND nextReview <= NOW()
ORDER BY nextReview ASC LIMIT 1
```

This retrieves the most-overdue puzzle first. If no puzzles are due, a random never-attempted puzzle is returned.

## Consequences

**Positive:**
- No external service dependency — SM-2 runs entirely in the NestJS process as a pure function
- Minimal storage overhead — three extra columns on `UserPuzzleAttempt`; no scheduling queue tables
- Easily testable — the pure function can be unit-tested exhaustively against known SM-2 vectors (see `AUTOMATED_TESTING_STRATEGY.md`)
- Adapts per user — each user builds an independent SM-2 state for each puzzle; personalisation is inherent
- Well-documented algorithm — future developers can refer to Wozniak's original paper

**Negative / Trade-offs:**
- SM-2 is not optimal in the FSRS sense — it slightly over-repeats some material and under-repeats other material compared to a calibrated model; acceptable for a v1 puzzle feature
- The quality mapping is a heuristic — the time thresholds (10s, 30s, 60s) are reasonable defaults but not empirically calibrated to ChessWeb's user base; they can be tuned later
- Upsert model only stores the most recent SM-2 state per (user, puzzle) pair — full attempt history requires a separate analytics collection (MongoDB, tracked separately from the Prisma model)
- The `repetitions == 0 → interval = 1` and `repetitions == 1 → interval = 6` bootstrap rules mean all users follow the same first two intervals regardless of time taken; this is by SM-2 specification
