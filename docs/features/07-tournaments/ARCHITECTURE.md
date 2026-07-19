# Feature 07 — Tournaments: Architecture

## Service Map

```
Browser
  |
  | REST (HTTP)
  v
NestJS TournamentsController
  |
  +-- TournamentsService
  |       |
  |       |-- Prisma (PostgreSQL)
  |       |     Tables: Tournament, TournamentPlayer, Game (tournamentId FK)
  |       |
  |       +-- GameService (Feature 02)
  |             Creates Game rows for pairings
  |
  +-- Pairing Modules
  |       swiss.pairing.ts
  |       arena.pairing.ts
  |       round-robin.pairing.ts
  |       knockout.pairing.ts
  |
  +-- BullMQ Queue: "tournaments"
          |
          +-- Delayed job: "start-tournament" (fires at startAt)
          |     Transitions UPCOMING → ONGOING, runs pairRound()
          |
          +-- Delayed job: "advance-round" (fires at round end time)
                Checks if all games done, runs next pairRound() or
                transitions to COMPLETED
```

## Data Flow — Round Advancement

1. Tournament created with `startAt = 2026-06-25T14:00:00Z`.
2. `TournamentsService.create()` enqueues a BullMQ delayed job `start-tournament` with delay = `startAt - now`.
3. At `startAt`, `TournamentsProcessor.handleStartTournament()` runs:
   - Transitions tournament to ONGOING.
   - Calls `swissPairing.pairRound(tournamentId, round=1)`.
   - Creates `Game` rows for each pairing.
   - Enqueues `advance-round` delayed job for `round1EndTime`.
4. As games complete, `GameService` calls `TournamentsService.onGameComplete(gameId)`.
5. `onGameComplete` checks if all games in current round are done. If so, immediately advances (cancels the delayed job or the delayed job is idempotent).
6. `advance-round` job always checks if round already advanced (idempotent guard: `if tournament.currentRound !== expectedRound, return`).

## DB Ownership

| Data | Store | Table/Collection |
|------|-------|------------------|
| Tournament metadata | PostgreSQL | `Tournament` |
| Player registrations | PostgreSQL | `TournamentPlayer` |
| Tournament games | PostgreSQL | `Game` (tournamentId FK) |
| BullMQ jobs | Redis | BullMQ managed |

## Backend File Tree

```
backend/src/tournaments/
├── tournaments.controller.ts
├── tournaments.service.ts
├── tournaments.module.ts
├── tournaments.processor.ts
├── tournaments-queue.module.ts
├── dto/
│   └── create-tournament.dto.ts
└── pairing/
    ├── swiss.pairing.ts
    ├── arena.pairing.ts
    ├── round-robin.pairing.ts
    └── knockout.pairing.ts
```
