# Feature 08 — Puzzles

**Branch:** `feature/puzzles`
**Depends on:** `feature/auth`

## Goal
Tactics training with a bank of ~4M puzzles (from Lichess open database), spaced repetition scheduling, and Glicko-2 puzzle ratings.

---

## Backend

### Files
```
backend/src/puzzles/
├── puzzles.module.ts
├── puzzles.service.ts
└── puzzles.controller.ts
```

### PostgreSQL Models (Prisma)
```
Puzzle         — fen, solution moves, rating, themes, plays
PuzzleAttempt  — userId, puzzleId, solved, timeMs, nextReviewAt
```

### Puzzle Rating (Glicko-2)
- Each puzzle has its own Glicko-2 rating
- Updates after every attempt:
  - Puzzle "wins" when user fails (rating goes up)
  - Puzzle "loses" when user solves (rating goes down)
- This makes puzzle ratings reflect true difficulty

### Spaced Repetition (SM-2 variant)
`PuzzleAttempt.nextReviewAt` calculated by SM-2 algorithm:
- Correct solve: next review in `interval * easeFactor` days
- Wrong: reset to 1 day interval
- `easeFactor` starts at 2.5, adjusts per performance

### Data Import
Import Lichess puzzle CSV (`lichess_db_puzzle.csv.zst`):
```
PuzzleId,FEN,Moves,Rating,RatingDeviation,Popularity,NbPlays,Themes,GameUrl,OpeningTags
```
Batch-import script: `scripts/import-puzzles.ts`

### Endpoints
```
GET  /api/v1/puzzles/daily            — today's puzzle (Redis cached 24h)
GET  /api/v1/puzzles/next             — next spaced-repetition puzzle for user
GET  /api/v1/puzzles/:id              — single puzzle
POST /api/v1/puzzles/:id/attempt      body: { moves: string[] }
GET  /api/v1/puzzles/themes           — all theme names
GET  /api/v1/puzzles?theme=&rating=   — filter
```

### Daily Puzzle
Deterministic by date — same puzzle for all users each day:
```typescript
const dayIndex = Math.floor(Date.now() / 86400000);
const puzzleId = await this.prisma.puzzle.findFirst({
  skip: dayIndex % totalPuzzles,
  orderBy: { id: 'asc' },
});
// Cached in Redis with TTL until midnight
```

---

## Frontend

### Pages
```
frontend/src/pages/
├── Puzzles.tsx      — browse, daily puzzle, theme filter
└── PuzzlePlay.tsx   — interactive puzzle board
```

### Puzzle Board
- Show position, player to move indicated
- Accept only correct moves
- Show "Best move!" on correct first move
- Show solution on failure
- Rating change shown after completion
- "Next puzzle" button

---

## Checklist
- [ ] Prisma: Puzzle, PuzzleAttempt models + migration
- [ ] Import script for Lichess puzzle database
- [ ] PuzzlesService: `getNext()` with spaced repetition
- [ ] PuzzlesService: `getDaily()` with Redis cache
- [ ] PuzzlesService: `attempt()` — validate moves + update ratings
- [ ] Glicko-2 puzzle rating update
- [ ] SM-2 spaced repetition scheduling
- [ ] All endpoints
- [ ] Frontend: Puzzles browse page
- [ ] Frontend: PuzzlePlay interactive board
- [ ] Frontend: Daily puzzle widget on Home page

## Verify
1. `GET /puzzles/daily` → same puzzle all day
2. Submit correct moves → `{ solved: true, ratingChange: +5 }`
3. Submit wrong moves → `{ solved: false }`, solution shown
4. `GET /puzzles/next` → different puzzle on next call (spaced repetition)
5. Puzzle rating adjusts based on solve/fail rate
