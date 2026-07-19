# Feature 08 — Puzzles: Delivery Notes

## Deployment Checklist

### Before First Deployment

- [ ] Run `prisma migrate deploy` to apply the `Puzzle` and `UserPuzzleAttempt` table migrations, including the GIN index on `themes`
- [ ] Run `prisma migrate deploy` to apply the `UserPuzzleRating` table migration (created in Increment 2)
- [ ] Download the Lichess puzzle CSV: `https://database.lichess.org/#puzzles` → save as `data/lichess_db_puzzle.csv` (approximately 900 MB compressed; decompress before running seeder)
- [ ] Run the seeder: `npx ts-node src/puzzles/seeds/seed-puzzles.ts data/lichess_db_puzzle.csv` — takes approximately 10 minutes; log output confirms progress every 10,000 rows
- [ ] Verify seeder completed: `SELECT COUNT(*) FROM "Puzzle"` in the production DB should return ~3,300,000
- [ ] Confirm BullMQ worker is registered and the `puzzles` queue appears in the Bull Dashboard (if configured)
- [ ] Verify the daily puzzle cron fires correctly: at 00:00 UTC check Redis for `puzzle:daily` key with a positive TTL
- [ ] Confirm `REDIS_URL` environment variable is set in production
- [ ] Confirm `DATABASE_URL` environment variable points to the production PostgreSQL instance

### Environment Variables Required

| Variable | Description | Example |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@host:5432/chessweb` |
| `REDIS_URL` | Redis connection string | `redis://localhost:6379` |
| `JWT_SECRET` | JWT signing secret (existing) | (from secrets manager) |

No new environment variables are introduced by this feature beyond `REDIS_URL` (which may already exist for other features).

### Post-Deployment Smoke Tests

Run these manually after deploying to production:

```bash
# Daily puzzle is accessible (no auth)
curl https://api.chessweb.com/puzzles/daily

# Specific puzzle by ID (use any known Lichess puzzle ID from the seeder)
curl https://api.chessweb.com/puzzles/00008

# Filtered listing
curl "https://api.chessweb.com/puzzles?theme=fork&minRating=1200&maxRating=1800"

# Protected endpoint returns 401 without token
curl -X POST https://api.chessweb.com/puzzles/00008/attempt \
  -H "Content-Type: application/json" \
  -d '{"solved":true,"timeTaken":5000}'
# Expected: 401

# Authenticated attempt (replace TOKEN with a valid JWT)
curl -X POST https://api.chessweb.com/puzzles/00008/attempt \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"solved":true,"timeTaken":8000}'
# Expected: 201 with nextReview, ratingDelta, sm2State
```

---

## Data Migration

### Initial Seed (Required — One-Time)

The `Puzzle` table is empty on first deployment. The seeder script must be run before users can access puzzles.

```bash
# On the production server or a migration runner:
npx ts-node src/puzzles/seeds/seed-puzzles.ts data/lichess_db_puzzle.csv
```

The seeder is idempotent (`skipDuplicates: true`) — it is safe to re-run if interrupted. Progress is logged every 10,000 rows to stdout.

### Re-seeding After a New Lichess Export

When Lichess releases an updated puzzle export (they do so periodically):
1. Download the new CSV
2. Re-run the seeder — existing puzzles are skipped; only new puzzles (by PuzzleId) are inserted
3. ChessWeb ratings on existing puzzles are preserved (the seeder never overwrites existing rows)

### No Schema Changes After Initial Migration

All Prisma models for this feature (`Puzzle`, `UserPuzzleAttempt`, `UserPuzzleRating`) are created in the initial migration. No follow-up schema changes are required across the five increments.

---

## External Dependencies

| Dependency | Purpose | Notes |
|---|---|---|
| `csv-parse` | Streaming CSV parsing in the seeder | Version 5.x; install with `npm install csv-parse` |
| `chess.js` | Move validation on the frontend; optional backend validation | Already listed in project dependencies |
| `react-chessboard` | Interactive chessboard component | Frontend only |
| `date-fns` | Date arithmetic in SM-2 (`addDays`) | Lightweight; tree-shakeable |
| `@nestjs/bull` + `bullmq` | Daily puzzle cron job | Must be registered in `PuzzlesModule` |
| `ioredis` | Redis client for daily puzzle cache and streak tracking | Already used in the project |

### Lichess Dataset License

The Lichess puzzle dataset is released under **CC0 (Creative Commons Zero — Public Domain Dedication)**. No attribution is required. Commercial use is explicitly permitted. See: `https://database.lichess.org/#puzzles`

---

## Known Limitations

### Performance

- **`NOT IN` subquery for new-puzzle selection** — `GET /puzzles/next` uses a `NOT IN (SELECT puzzleId FROM UserPuzzleAttempt WHERE userId=$1)` subquery to find never-attempted puzzles. This is acceptable for a v1 with up to ~100,000 puzzle attempts per user, but should be replaced with a `LEFT JOIN ... IS NULL` pattern for users who have attempted tens of thousands of puzzles. Tracking issue: replace with a `LEFT JOIN` once user attempt counts exceed 50,000 rows in production.

- **Synchronous Glicko-2 updates** — rating updates happen inline during `POST /puzzles/:id/attempt`. For the expected load at launch this is fine. If this endpoint becomes a bottleneck under sustained high concurrency (>1,000 req/s), consider moving Glicko-2 computation to a BullMQ job.

- **Streak Redis key has no TTL** — `user:{userId}:puzzle_streak` has no expiry. If a user is deleted, their streak key will remain in Redis. Add a cleanup step to `UserService.deleteUser` to call `redis.del` on this key when user deletion is implemented.

### Puzzle Quality

- ChessWeb has no editorial control over Lichess puzzle quality. A small fraction of puzzles may have disputed solutions or positions where multiple moves are objectively correct but only one is accepted by the system. No mechanism to flag or skip disputed puzzles exists in v1.

- Puzzle annotations (explanations of why a move is correct) are not available in the Lichess dataset. ChessWeb shows the solution moves only; no textual or visual explanation is provided. This is a known UX gap compared to premium puzzle products.

### Daily Puzzle

- The daily puzzle cron job at 00:00 UTC selects a random puzzle in the 1400–1600 rating range. If the cron job fails (e.g., Redis is unreachable), `GET /puzzles/daily` falls back to a runtime random selection but does not set the Redis key — meaning each request hits the database. This is a low-frequency failure mode but produces unnecessary DB load if Redis is down for an extended period.

- All users see the same daily puzzle. There is no personalisation based on user rating for the daily puzzle. A 2200-rated user and an 800-rated user both see a 1400–1600 rated puzzle.

### Frontend

- Move validation in the browser relies on `chess.js` running the same moves as stored in `Puzzle.moves`. If a puzzle's stored moves are incorrect (a data quality issue from the Lichess dataset), the user may find the puzzle impossible to complete. No retry or skip mechanism exists in v1.

---

## Rollback Plan

### Rollback Increment 5 (Frontend)

- Revert the frontend commits; the backend remains fully functional
- Remove the `/puzzles` routes from the React Router config to prevent users from accessing the broken UI

### Rollback Increment 4 (Frontend Board)

- Same as Increment 5 rollback

### Rollback Increments 2–3 (Backend — Solve Flow + SM-2)

- `POST /puzzles/:id/attempt` endpoint is the only new destructive operation; it can be removed from the controller without affecting the GET endpoints (daily puzzle, browse, list)
- The `UserPuzzleAttempt` table and `UserPuzzleRating` table can be preserved — they contain no data that cannot be regenerated

### Rollback Increment 1 (Backend — Import + CRUD)

- Drop the `Puzzle` table and `UserPuzzleAttempt` table via `prisma migrate reset` (destructive — use only if full rollback of the feature is required)
- Remove the `PuzzlesModule` from `AppModule` imports

### Feature Flag (Recommended)

If a quick disable is needed without a code rollback, add a feature flag `PUZZLES_ENABLED=false` environment variable and wrap the `PuzzlesModule` registration in `AppModule` with a conditional check. This allows the feature to be disabled without a deployment.
