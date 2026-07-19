# 08-Puzzles — Workflows

## Workflow 1: Puzzle Import

**Trigger:** Developer runs `npm run seed:puzzles` (or `npx ts-node src/puzzles/seeds/seed-puzzles.ts data/lichess_db_puzzle.csv`)

**Precondition:** `data/lichess_db_puzzle.csv` exists (downloaded from `https://database.lichess.org/#puzzles`). PostgreSQL migrations have been applied (`prisma migrate deploy`).

```
Step 1: Open file stream for data/lichess_db_puzzle.csv
Step 2: Pipe through csv-parse with { delimiter: ',', columns: true, skip_empty_lines: true }
Step 3: For each parsed row, map CSV columns to Puzzle fields:
         {
           id:              row.PuzzleId,
           fen:             row.FEN,
           moves:           row.Moves,
           rating:          parseFloat(row.Rating),
           ratingDeviation: parseFloat(row.RatingDeviation),
           themes:          row.Themes.split(' '),
           openingTags:     row.OpeningTags ? row.OpeningTags.split(' ') : [],
         }
Step 4: Accumulate rows into a batch array (size 1,000)
Step 5: When batch is full, call:
         prisma.puzzle.createMany({ data: batch, skipDuplicates: true })
Step 6: Clear batch, log progress (e.g. "Imported 50000 puzzles...")
Step 7: After stream ends, flush any remaining partial batch
Step 8: Log total imported count and duration
```

**Expected runtime:** ~10 minutes for 3.3M puzzles on standard developer hardware.

**Re-import safety:** `skipDuplicates: true` means running the seeder again is safe — existing puzzles are skipped, new ones are inserted.

---

## Workflow 2: Daily Puzzle Selection

**Trigger:** BullMQ cron job fires at `00:00 UTC` every day (cron expression: `0 0 * * *`)

```
Step 1: Query PostgreSQL for a random puzzle in rating range 1400–1600:
         SELECT * FROM "Puzzle"
         WHERE rating BETWEEN 1400 AND 1600
         ORDER BY RANDOM()
         LIMIT 1
Step 2: Compute TTL = secondsUntilMidnightUTC()
         const now = new Date();
         const midnight = new Date(now);
         midnight.setUTCHours(24, 0, 0, 0);
         const ttl = Math.floor((midnight.getTime() - now.getTime()) / 1000);
Step 3: Store in Redis:
         redis.setex('puzzle:daily', ttl, puzzle.id)
Step 4: Log: "Daily puzzle set: ${puzzle.id} (rating: ${puzzle.rating}), TTL: ${ttl}s"
```

**Fallback (GET /puzzles/daily when Redis is empty):**
```
If redis.get('puzzle:daily') returns null:
  Query: SELECT * FROM Puzzle WHERE rating BETWEEN 1400 AND 1600 ORDER BY RANDOM() LIMIT 1
  Return that puzzle (do NOT set Redis — let the cron job handle it)
```

---

## Workflow 3: User Solves a Puzzle

**Actor:** Authenticated user on the puzzle page

```
Step 1: GET /puzzles/next (or navigate to /puzzles/:id directly)
        PuzzlesService.getNextPuzzle(userId):
          a. Check SM-2 queue:
             SELECT upa.*, p.*
             FROM UserPuzzleAttempt upa
             JOIN Puzzle p ON upa.puzzleId = p.id
             WHERE upa.userId = $userId
               AND upa.nextReview <= NOW()
             ORDER BY upa.nextReview ASC
             LIMIT 1
          b. If found: return puzzle with source='due'
          c. If not found: random unseen puzzle:
             SELECT * FROM Puzzle
             WHERE id NOT IN (
               SELECT puzzleId FROM UserPuzzleAttempt WHERE userId = $userId
             )
             ORDER BY RANDOM() LIMIT 1
          d. If still not found (user has attempted every puzzle!): 404

Step 2: Frontend receives puzzle { id, fen, moves, themes }
        Parse moves into array: const moveList = puzzle.moves.split(' ')
        // moveList[0] = opponent's first move (auto-played)
        // moveList[1], [3], [5] ... = user's expected moves
        // moveList[2], [4], [6] ... = opponent's response moves (auto-played)

Step 3: Frontend initializes chess.js with puzzle.fen
        Records attemptStartTime = Date.now()
        After 500ms delay: apply moveList[0] to board (opponent's first move)

Step 4: User drags a piece
        Frontend converts the drop to UCI format: e.g. "e4" → "e2e4"
        Compare to moveList[currentMoveIndex]:
          - Match: apply move, auto-play opponent response after 300ms, advance index
          - No match: flash board red, allow retry (do not advance index)

Step 5: When all user moves in moveList are correctly played: solved = true
        When user explicitly gives up (clicks "Give Up" button): solved = false
        timeTaken = Date.now() - attemptStartTime

Step 6: POST /puzzles/:id/attempt { solved, timeTaken }
        Backend:
          a. quality = mapQuality(solved, timeTaken)
          b. currentSM2 = await getOrDefaultSM2State(userId, puzzleId)
          c. newSM2 = SpacedRepetitionService.calculateNextReview(currentSM2, quality)
          d. ratingDelta = await PuzzleRatingService.updateRatings(puzzleId, userId, solved)
          e. await prisma.userPuzzleAttempt.upsert({
               where: { userId_puzzleId: { userId, puzzleId } },
               update: { solved, timeTaken, attemptedAt: new Date(), ...newSM2 },
               create: { userId, puzzleId, solved, timeTaken, ...newSM2 },
             })
          f. If puzzleId === daily puzzle ID: update streak in Redis

Step 7: Frontend receives { nextReview, ratingDelta, quality }
        Display: "Solved!" or "Incorrect" message
        Show rating change: "+12 puzzle rating"
        Show next review: "Next review in 6 days"
```

---

## Workflow 4: SM-2 Queue (Next Puzzle Selection)

**Actor:** Authenticated user requesting the next puzzle

```
Priority 1 — Due puzzles (previously seen, scheduled for today or earlier):
  Query: UserPuzzleAttempt WHERE userId=X AND nextReview <= NOW() ORDER BY nextReview ASC LIMIT 1
  → Returns the most overdue puzzle first

Priority 2 — New puzzles (never attempted by this user):
  Query: Puzzle WHERE id NOT IN (SELECT puzzleId FROM UserPuzzleAttempt WHERE userId=X)
         ORDER BY RANDOM() LIMIT 1
  → Returns a random unseen puzzle
  → Note: for large userbases the NOT IN subquery should be replaced with a LEFT JOIN + IS NULL for performance

Priority 3 — 404:
  → Only reached if the user has attempted every puzzle in the database
  → In practice this is unreachable with 3.3M puzzles
```

**Quality-to-Interval Growth Table (for documentation purposes):**

| Quality | After attempt 1 | After attempt 2 | After attempt 3 |
|---|---|---|---|
| 5 (< 10s) | 1 day | 6 days | 16 days |
| 4 (< 30s) | 1 day | 6 days | 14 days |
| 3 (< 60s) | 1 day | 6 days | 12 days |
| 0 (fail) | reset to 1 | reset to 1 | reset to 1 |

---

## Workflow 5: Streak Tracking

**Trigger:** POST /puzzles/:id/attempt where `puzzleId` equals the current `puzzle:daily` value

```
Step 1: redis.get('puzzle:daily') → dailyPuzzleId
Step 2: If puzzleId !== dailyPuzzleId: skip streak logic
Step 3: redis.hgetall(`user:${userId}:puzzle_streak`) → { streak, lastSolvedDate }
Step 4: Compute today's date string: new Date().toISOString().split('T')[0]  // "2026-06-23"
Step 5: If lastSolvedDate === today: already counted today, do nothing (idempotent)
Step 6: Compute yesterday: new Date(Date.now() - 86400000).toISOString().split('T')[0]
Step 7: If lastSolvedDate === yesterday: streak was maintained
          newStreak = parseInt(streak || '0') + 1
        Else (streak broken or first time):
          newStreak = 1
Step 8: redis.hset(`user:${userId}:puzzle_streak`, {
          streak: newStreak.toString(),
          lastSolvedDate: today,
        })
```
