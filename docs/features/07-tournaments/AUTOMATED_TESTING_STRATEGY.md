# Feature 07 — Tournaments: Automated Testing Strategy

## What to Test

### Unit Tests (Jest)

**`swiss.pairing.ts`**
- 4 players at equal score: 2 pairs returned, no player appears twice.
- 4 players at different scores: high-score players paired together.
- 5 players (odd count): 2 pairs + 1 bye player returned; bye goes to lowest-ranked player without a prior bye.
- 6 players with prior head-to-head: rematch avoided, alternative pairing used.
- 2 players (minimum viable): 1 pair.

**`round-robin.pairing.ts`**
- 4 players: returns 3 rounds × 2 pairings = 6 total games scheduled.
- 6 players: returns 5 rounds × 3 pairings = 15 total games.
- Each pair appears exactly once across all rounds.

**`knockout.pairing.ts`**
- 8 players: round 1 returns 4 pairings (top seed vs bottom seed).
- 5 players: nearest power of 2 is 8, so 3 byes are added for top 3 seeds in round 1.
- Seeding: players sorted by rating DESC for initial bracket.

**`TournamentsService`**
- `join()` throws `400 NOT_UPCOMING` when `status !== 'UPCOMING'`.
- `join()` throws `409 TOURNAMENT_FULL` when player count equals `maxPlayers`.
- `join()` throws `409 ALREADY_JOINED` when `TournamentPlayer` row already exists.
- `leave()` throws `400 NOT_UPCOMING` when status is ONGOING.
- `recordGameResult()` increments winner's score by 1, loser's by 0.
- `recordGameResult()` increments both players' score by 0.5 on draw.
- `getStandings()` sorts by score DESC, then buchholz DESC.
- `advanceRound()` when `currentRound >= maxRounds`: sets status to COMPLETED.

### Integration Tests (Jest + Prisma test DB)

- Full Swiss tournament lifecycle: create → 4 players join → `handleStartTournament()` called → 2 Game rows created → both games completed → `advanceRound()` → 2 more Game rows → after `maxRounds` → `status === 'COMPLETED'`.
- Knockout bracket: 4 players, after round 1 (2 winners), round 2 has 1 game.
- BullMQ idempotent: calling `advanceRound()` twice for the same round only creates new games once.

### E2E Tests (Playwright or Cypress)

- Create tournament via UI, join as 4 users, wait for start, verify game appears for each player.
- Standings table updates after a game completes.

## What to Mock

- **Unit tests**: Mock Prisma client with `@quramy/jest-prisma` or manual mocks. Mock `GameService.createGame()`.
- **Integration tests**: Use a dedicated `TEST_DATABASE_URL` pointing to a test PostgreSQL instance. BullMQ jobs are triggered synchronously in tests via `worker.processJob()`.
- **E2E tests**: Real backend and frontend.

## Coverage Targets

- Pairing algorithms: 95%+ branch coverage (pure functions, easy to test exhaustively).
- `TournamentsService`: 85%+ branch coverage.
- Controller: 70% (mostly delegation).
