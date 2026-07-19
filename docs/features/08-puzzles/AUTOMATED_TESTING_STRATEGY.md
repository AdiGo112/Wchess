# 08-Puzzles — Automated Testing Strategy

## Test File Locations

```
src/puzzles/puzzles.service.spec.ts
src/puzzles/spaced-repetition.service.spec.ts
src/puzzles/puzzle-rating.service.spec.ts
test/puzzles.e2e-spec.ts
e2e/puzzles.playwright.spec.ts
```

---

## Unit Tests (Jest)

### SpacedRepetitionService (`spaced-repetition.service.spec.ts`)

Test the `calculateNextReview(state, quality)` function in complete isolation — no database or external dependencies.

**Test cases:**

| Description | Input state | Quality | Expected output |
|---|---|---|---|
| First solve (rep=0), quality 5 | `{ ef: 2.5, interval: 1, reps: 0 }` | 5 | `{ ef: 2.6, interval: 1, reps: 1 }` |
| Second solve (rep=1), quality 5 | `{ ef: 2.6, interval: 1, reps: 1 }` | 5 | `{ ef: 2.7, interval: 6, reps: 2 }` |
| Third solve (rep=2), quality 5 | `{ ef: 2.7, interval: 6, reps: 2 }` | 5 | `{ ef: 2.8, interval: 16, reps: 3 }` |
| Failure resets state | `{ ef: 2.8, interval: 16, reps: 3 }` | 0 | `{ ef: 1.3, interval: 1, reps: 0 }` |  ← EF recalc: 2.8 + 0.1 - 5*(0.08+5*0.02) = 2.8 - 1.5 = 1.3 |
| Quality 3 — minimal progress | `{ ef: 2.5, interval: 1, reps: 0 }` | 3 | `{ ef: 2.5, interval: 1, reps: 1 }` |
| EF floor enforced | `{ ef: 1.4, interval: 1, reps: 0 }` | 0 | `{ ef: 1.3, interval: 1, reps: 0 }` |
| EF floor does not go below 1.3 | `{ ef: 1.3, interval: 1, reps: 0 }` | 0 | `{ ef: 1.3, interval: 1, reps: 0 }` |
| nextReview is in the future | any solved state | 5 | `nextReview > new Date()` |
| Quality 4 second solve | `{ ef: 2.5, interval: 1, reps: 1 }` | 4 | `{ ef: 2.5, interval: 6, reps: 2 }` |  ← EF unchanged at quality 4 (0.1 - 1*(0.08+0.02) = 0) |
| Third solve quality 4 | `{ ef: 2.5, interval: 6, reps: 2 }` | 4 | `{ ef: 2.5, interval: 15, reps: 3 }` |  ← round(6 * 2.5) = 15 |

**Key assertions:**
- `easeFactor` precision to 2 decimal places (use `toBeCloseTo(expected, 2)`)
- `nextReview` date is approximately `addDays(new Date(), interval)` (allow ±1 second for test execution time)
- After a quality < 3 failure, `repetitions` always resets to 0

---

### PuzzleRatingService (`puzzle-rating.service.spec.ts`)

Test Glicko-2 math with known input values.

**Test setup:**
```typescript
const mockPrisma = {
  puzzle: { findUnique: jest.fn(), update: jest.fn() },
  userPuzzleRating: { findUnique: jest.fn(), upsert: jest.fn() },
};
```

**Test cases:**

| Description | Puzzle rating | User rating | Solved | Expected direction |
|---|---|---|---|---|
| User solves puzzle rated equal to user | 1500, RD=200 | 1500, RD=200 | true | User rating increases by ~10–20; puzzle rating decreases by ~10–20 |
| User fails puzzle rated equal to user | 1500, RD=200 | 1500, RD=200 | false | User rating decreases; puzzle rating increases |
| User with high RD (new user) solves | 1500, RD=80 | 1500, RD=350 | true | User rating changes more (high RD = high uncertainty) |
| User solves easy puzzle (user >> puzzle) | 800, RD=80 | 1800, RD=80 | true | Rating change is small (expected outcome) |
| User fails easy puzzle (user >> puzzle) | 800, RD=80 | 1800, RD=80 | false | Rating change is large (unexpected outcome) |

**Known Glicko-2 test vector** (use for deterministic assertion):
```
User:   r=1500, RD=200, sigma=0.06
Puzzle: r=1500, RD=200, sigma=0.06
Outcome: user solved (s=1)
Expected: user new_r ≈ 1519, new_RD ≈ 185
          puzzle new_r ≈ 1481, new_RD ≈ 185
Use toBeCloseTo(expected, 0) for integer comparison
```

---

### PuzzlesService (`puzzles.service.spec.ts`)

Test SM-2 queue logic and daily puzzle retrieval with mocked Prisma and Redis.

**Mock setup:**
```typescript
const mockPrisma = {
  userPuzzleAttempt: {
    findFirst: jest.fn(),
    upsert: jest.fn(),
    count: jest.fn(),
    findMany: jest.fn(),
  },
  puzzle: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
  },
};
const mockRedis = {
  get: jest.fn(),
  setex: jest.fn(),
  hgetall: jest.fn(),
  hset: jest.fn(),
};
```

**Test cases:**

| Description | Setup | Expected |
|---|---|---|
| getNextPuzzle — SM-2 due puzzle returned first | `findFirst` (attempt) returns a due attempt | Returns puzzle from due attempt, source='due' |
| getNextPuzzle — random fallback when none due | `findFirst` (attempt) returns null; `findFirst` (puzzle) returns a puzzle | Returns unseen puzzle, source='new' |
| getNextPuzzle — 404 when no puzzles at all | Both findFirst calls return null | Throws NotFoundException |
| getDailyPuzzle — from Redis cache | `redis.get` returns puzzleId; `puzzle.findUnique` returns puzzle | Returns puzzle |
| getDailyPuzzle — fallback when Redis empty | `redis.get` returns null; `puzzle.findFirst` returns puzzle | Returns puzzle, does not call setex |
| getDailyPuzzle — 503 when no puzzle found | `redis.get` null; `puzzle.findFirst` null | Throws ServiceUnavailableException |

---

## Integration Tests (Supertest)

**Environment:** NestJS test app with real Prisma connected to a test PostgreSQL database (separate DB, seeded with 3 known puzzles before each test suite, truncated after).

**Test file:** `test/puzzles.e2e-spec.ts`

### Setup

```typescript
beforeAll(async () => {
  // Seed 3 test puzzles
  await prisma.puzzle.createMany({
    data: [
      { id: 'TEST001', fen: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq -', moves: 'd8f6 f3e5', rating: 1200, ratingDeviation: 80, themes: ['fork'], openingTags: [] },
      { id: 'TEST002', fen: '...', moves: '...', rating: 1500, ratingDeviation: 80, themes: ['pin'], openingTags: [] },
      { id: 'TEST003', fen: '...', moves: '...', rating: 1800, ratingDeviation: 80, themes: ['mateIn2'], openingTags: [] },
    ],
  });
});
```

### Test Cases

**POST /puzzles/:id/attempt full flow:**
```
1. Authenticate (POST /auth/login) → get JWT
2. POST /puzzles/TEST001/attempt { solved: true, timeTaken: 5000 }
3. Assert response 201 with nextReview, ratingDelta
4. Query DB: SELECT * FROM UserPuzzleAttempt WHERE userId=X AND puzzleId='TEST001'
5. Assert: repetitions=1, interval=1, nextReview is approximately tomorrow, easeFactor≈2.6
```

**GET /puzzles/daily with Redis mock:**
```
1. Inject mock Redis that returns 'TEST002' for key 'puzzle:daily'
2. GET /puzzles/daily
3. Assert 200 with id='TEST002'
```

**GET /puzzles?theme=fork verifies GIN index:**
```
1. GET /puzzles?theme=fork
2. Assert 200 with data array containing only TEST001
3. Assert data[0].id === 'TEST001'
4. Assert total === 1
```

**GET /puzzles/next — SM-2 due puzzle priority:**
```
1. Create UserPuzzleAttempt for TEST001 with nextReview = yesterday (overdue)
2. Create UserPuzzleAttempt for TEST002 with nextReview = tomorrow (not due)
3. GET /puzzles/next (with JWT)
4. Assert response puzzle.id === 'TEST001' and source === 'due'
```

---

## E2E Tests (Playwright)

**Test file:** `e2e/puzzles.playwright.spec.ts`

**Prerequisite:** Dev server running, test user created and logged in via Playwright fixture.

### Test: Solve Daily Puzzle

```
1. Navigate to /puzzles/daily
2. Wait for chessboard to render (selector: '[data-testid="chess-board"]')
3. Wait 600ms for first opponent move to auto-play
4. Read solution moves from puzzle (hardcoded test puzzle with known solution)
5. Make the correct first move (drag piece from source to target square)
6. Assert: opponent move auto-plays within 400ms
7. Make the correct second move (if puzzle has two user moves)
8. Assert: "Puzzle Solved!" message appears (selector: '[data-testid="puzzle-result"]')
9. Assert: rating change is displayed (selector: '[data-testid="rating-delta"]')
10. Navigate away to /dashboard
11. Navigate back to /puzzles/daily
12. Assert: same puzzle is shown (same FEN)
13. Assert: the puzzle is not immediately shown as "new" — SM-2 state persists
```

### Test: Wrong Move Feedback

```
1. Navigate to /puzzles/:id (test puzzle with known wrong first move)
2. Wait for first opponent move
3. Make a clearly wrong move (e.g., move a pawn to an invalid position)
4. Assert: board flashes red (CSS class or data attribute)
5. Assert: user can retry (piece returns to original square or board resets to pre-attempt position)
6. Make the correct move
7. Assert: move is accepted (opponent auto-responds)
```

### Test: Rating Updates Visible After Solve

```
1. Note user's current puzzle rating on /profile or /puzzles/stats
2. Solve a puzzle successfully
3. Navigate to /puzzles/stats
4. Assert: totalSolved has increased by 1
5. Assert: currentRating has changed (increased if puzzle was solved)
```
