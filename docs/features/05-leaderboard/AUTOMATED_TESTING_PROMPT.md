# Feature 05 — Leaderboard: Automated Testing Prompt

Copy and paste the following prompt into Claude Code to generate the full test suite for the leaderboard feature.

---

## Prompt

```
Write a complete automated test suite for the ChessWeb leaderboard feature. The backend is NestJS with ioredis and Prisma (PostgreSQL). The frontend is React with React Query and Tailwind CSS.

## 1. LeaderboardService Unit Tests (backend/src/leaderboard/leaderboard.service.spec.ts)

Use jest with ioredis-mock (or manual mock). Mock PrismaService with jest.fn().

Test the following methods:

### updateRating(userId, newRating, variant)
- Calls ZADD on leaderboard:{variant} with correct score and member
- Calls ZADD on leaderboard:{variant}:weekly:{year}-W{week} with correct args
- Calls ZADD on leaderboard:{variant}:monthly:{year}-{month} with correct args
- Calls EXPIRE on weekly key with 691200 seconds (NX option so it doesn't reset existing TTL)
- Calls EXPIRE on monthly key with 2764800 seconds (NX option)
- Calls DEL on weekly cache key after ZADD (invalidation)
- Calls DEL on monthly cache key after ZADD (invalidation)

### getTop100(variant, limit)
- Returns empty result when leaderboard is empty (ZREVRANGE returns [])
- Returns entries sorted by rank ascending (rank 1 = highest rating)
- Calls prisma.user.findMany with the correct userId IN array
- Maps enrichment correctly: winRate = blitzWins / blitzGamesPlayed (handle division by zero)
- Returns correct total from ZCARD result

### getTimeScoped(variant, period)
- Returns cached JSON without calling prisma when cache key exists
- On cache miss: calls ZREVRANGE, then prisma, then SET cache with 60s EX
- Subsequent calls within 60s use cache (no second prisma call)

### getUserRank(userId, variant)
- ZREVRANK returns 4 → response { rank: 5 }
- ZREVRANK returns 0 → response { rank: 1 }
- ZREVRANK returns null (nil) → response { rank: null, rating: null, gamesPlayed: 0, winRate: 0 }

## 2. LeaderboardController Unit Tests (backend/src/leaderboard/leaderboard.controller.spec.ts)

Mock LeaderboardService.

- GET /leaderboard passes variant and limit to service.getTop100()
- GET /leaderboard/weekly passes correct period to service.getTimeScoped()
- GET /leaderboard/monthly passes correct period to service.getTimeScoped()
- GET /leaderboard/me passes userId from JWT payload to service.getUserRank()
- Invalid variant ('chess960') returns 400 with { code: 'INVALID_VARIANT' }
- limit=0 returns 400 (validation)
- limit=101 returns 400 (validation)

## 3. Integration Tests (backend/test/leaderboard.e2e-spec.ts)

Use real Redis (configure via environment, or use @testcontainers/redis). Use real PostgreSQL with Prisma migrate. Seed 5 users before each test, flush Redis before each test.

- After calling updateRating for 5 users, GET /leaderboard returns them in correct descending rating order
- GET /leaderboard/me returns rank 3 when user has the 3rd highest rating
- GET /leaderboard/me returns { rank: null } for unranked user
- GET /leaderboard/weekly returns only players who have a score in this week's key
- GET /leaderboard?variant=rapid uses 'rapid' sorted set, not 'blitz'

## 4. Frontend Tests (frontend/src/pages/LeaderboardPage.test.tsx)

Use @testing-library/react, @testing-library/user-event, msw for API mocking.

Setup: render LeaderboardPage with a mocked authenticated user (userId='user-1', username='AdiGo').

Mock endpoints:
- GET /leaderboard?variant=blitz → { entries: 10 entries, total: 4200 }
- GET /leaderboard/me?variant=blitz → { rank: 347, userId: 'user-1', username: 'AdiGo', rating: 1540, gamesPlayed: 63, winRate: 0.52 }
- GET /leaderboard?variant=rapid → different 10 entries

Test cases:
- Default tab "Blitz" is highlighted on mount
- Table has 10 data rows on successful load
- User's own row (userId='user-1' is outside top 10 in mock) appears at the bottom with yellow-100 background
- Clicking "Rapid" tab calls GET /leaderboard?variant=rapid and re-renders table
- Clicking "Weekly" period calls GET /leaderboard/weekly?variant=blitz
- Win rate 0.52 displays as "52%"
- Loading state: skeleton rows visible before MSW response resolves (use delayed response in MSW handler)
- Error state: "Failed to load leaderboard" shown when MSW returns 500

Use realistic test IDs or accessible selectors (getByRole('tab', { name: 'Blitz' }), getByRole('row')).

## File structure expected
- backend/src/leaderboard/leaderboard.service.spec.ts
- backend/src/leaderboard/leaderboard.controller.spec.ts
- backend/test/leaderboard.e2e-spec.ts
- frontend/src/pages/LeaderboardPage.test.tsx
- frontend/src/test/msw/leaderboard.handlers.ts (MSW handlers)

Write complete, runnable test files. Do not write placeholder comments like "// test here".
```
