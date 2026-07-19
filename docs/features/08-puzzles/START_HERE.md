# 08-Puzzles — Start Here

## What is this feature?

Tactical chess training with spaced repetition. Users solve puzzles sourced from the Lichess open dataset (~3.3M puzzles). After each attempt the system updates both the puzzle's Glicko-2 rating and the user's puzzle rating, then schedules the next review using the SM-2 spaced repetition algorithm so difficult puzzles resurface sooner and mastered ones recede.

## Three Key Services

| Service | Responsibility |
|---|---|
| `PuzzlesService` | CRUD for puzzles, daily puzzle retrieval from Redis, next-puzzle selection (SM-2 queue), filtered listing, stats aggregation |
| `PuzzleRatingService` | Glicko-2 rating updates for both the Puzzle row and the user's puzzle rating after each attempt |
| `SpacedRepetitionService` | SM-2 algorithm — maps attempt quality (0–5) to new easeFactor, interval (days), repetitions, and nextReview date |

## Three Key Data Stores

| Store | What lives there |
|---|---|
| **PostgreSQL** | `Puzzle` table (FEN, moves, themes, Glicko-2 rating/RD), `UserPuzzleAttempt` table (join table with SM-2 state: easeFactor, interval, repetitions, nextReview) |
| **MongoDB** | Detailed attempt history (full move list, board snapshots) for analytics — not queried during normal puzzle flow |
| **Redis** | `puzzle:daily` key (today's puzzle ID, TTL = seconds until next midnight UTC); `user:{userId}:puzzle_streak` hash (streak count + lastSolvedDate) |

## Three Entry Points

| Entry Point | Details |
|---|---|
| `GET /puzzles/daily` | Public — returns today's daily puzzle from Redis cache; no JWT required |
| `GET /puzzles/:id` | Public — returns puzzle FEN, moves, themes, and current rating; no JWT required |
| `POST /puzzles/:id/attempt` | Protected (JWT) — records solve/fail, triggers Glicko-2 + SM-2 updates, returns rating delta and next review date |

## No WebSocket Needed

Puzzles are a stateless REST interaction. The frontend loads a puzzle, the user solves it offline in the browser (move validation against the stored solution moves), and a single POST records the result. There is no real-time server involvement during puzzle solving.

## Reading Order

1. **README.md** — feature overview, Prisma models, dataset details
2. **DOMAIN_MODEL.md** — entities, value objects, aggregates, domain rules
3. **ARCHITECTURE.md** — system diagram, service wiring, Redis patterns, seeder
4. **API_DESIGN.md** — all endpoints with request/response shapes and auth requirements
5. **WORKFLOWS.md** — four key workflows (import, daily puzzle, solving, SM-2 queue)
6. **ADR-0018-lichess-puzzle-dataset.md** — why Lichess open dataset
7. **ADR-0019-sm2-spaced-repetition.md** — why SM-2 over alternatives
8. **ADR-0020-glicko2-puzzle-ratings.md** — why Glicko-2 for both user and puzzle ratings
9. **AUTOMATED_TESTING_STRATEGY.md** — unit, integration, and E2E test plan
10. **AUTOMATED_TESTING_PROMPT.md** — self-contained AI prompt to generate all tests
11. **IMPLEMENTATION_PROMPT_BACKEND.md** — full NestJS backend implementation prompt
12. **IMPLEMENTATION_PROMPT_FRONTEND.md** — full React frontend implementation prompt
13. **IMPLEMENTATION_PLAN_INCREMENT_1.md** through **IMPLEMENTATION_PLAN_INCREMENT_5.md** — phased delivery plan
14. **IMPLEMENTATION_PROMPT_INCREMENT_1.md** through **IMPLEMENTATION_PROMPT_INCREMENT_5.md** — per-increment AI prompts

## Key Decisions at a Glance

- Puzzle source: Lichess open dataset (CC0 license, ~3.3M puzzles, pre-rated with Glicko-2)
- Spaced repetition: SM-2 algorithm; quality derived from timeTaken + solved flag
- Puzzle rating system: Glicko-2, separate from game ratings; initial puzzle rating = Lichess rating on import
- Daily puzzle: same puzzle for all users, selected by cron at 00:00 UTC, cached in Redis with TTL
- No live board communication over WebSocket — all puzzle interaction is REST
