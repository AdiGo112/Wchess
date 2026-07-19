# Feature 07 — Tournaments: Domain Model

## Prisma Schema

```prisma
enum TournamentFormat {
  SWISS
  ARENA
  ROUND_ROBIN
  KNOCKOUT
}

enum TournamentStatus {
  UPCOMING
  ONGOING
  COMPLETED
}

model Tournament {
  id            String             @id @default(uuid())
  name          String
  format        TournamentFormat
  status        TournamentStatus   @default(UPCOMING)
  timeControl   String             // e.g. "5+3"
  maxPlayers    Int
  maxRounds     Int                // computed on create; Swiss: ceil(log2(maxPlayers))
  currentRound  Int                @default(0)
  startAt       DateTime
  createdAt     DateTime           @default(now())
  updatedAt     DateTime           @updatedAt
  createdById   String
  createdBy     User               @relation(fields: [createdById], references: [id])
  players       TournamentPlayer[]
  games         Game[]
}

model TournamentPlayer {
  id           String     @id @default(uuid())
  tournamentId String
  tournament   Tournament @relation(fields: [tournamentId], references: [id])
  userId       String
  user         User       @relation(fields: [userId], references: [id])
  score        Float      @default(0)  // 1=win, 0.5=draw, 0=loss
  buchholz     Float      @default(0)  // updated after each round
  hasBye       Boolean    @default(false)
  joinedAt     DateTime   @default(now())

  @@unique([tournamentId, userId])
}

// Extend existing Game model:
// Add to Game model in schema.prisma:
// tournamentId   String?
// tournament     Tournament? @relation(fields: [tournamentId], references: [id])
// tournamentRound Int?        // which round of the tournament this game belongs to
```

## Business Rules and Invariants

- A tournament cannot be created with `startAt` in the past.
- A user can only join a tournament when `status === 'UPCOMING'`.
- A user can only leave a tournament when `status === 'UPCOMING'`.
- A user cannot join the same tournament twice (`@@unique([tournamentId, userId])` enforced at DB level).
- A tournament cannot have more players than `maxPlayers`.
- `maxRounds` for Swiss is computed as `Math.ceil(Math.log2(maxPlayers))` at creation time. For Round Robin, it is `maxPlayers - 1`. For KO, it is `Math.ceil(Math.log2(maxPlayers))`. For Arena, it is not applicable (time-based).
- Status transitions are: `UPCOMING → ONGOING` (triggered by BullMQ at `startAt`) and `ONGOING → COMPLETED` (triggered when `currentRound >= maxRounds` and all games in the last round are done).
- No other status transitions are valid. There is no PAUSED state in v1.
- Score is updated in `TournamentPlayer` immediately when a tournament game ends. `GameService.onGameComplete()` calls `TournamentsService.recordGameResult()`.
- Buchholz tiebreak = sum of all opponents' current scores. Recomputed after every game result.
- A bye counts as a win (score += 1) and is never given to the same player twice.
- In Swiss pairing, players are sorted by score DESC, then paired within score groups. Rematches are avoided by checking the `Game` table for existing pairs in this tournament.
- A minimum of 4 players is required to start a Swiss tournament. If fewer players have joined at `startAt`, the tournament transitions directly to COMPLETED with no games played.

## Score Calculation

```
Win:  score += 1.0
Draw: score += 0.5
Loss: score += 0.0
Bye:  score += 1.0
```

Buchholz for player P after round R = sum of (opponent.score at end of round R) for each opponent P faced so far.
