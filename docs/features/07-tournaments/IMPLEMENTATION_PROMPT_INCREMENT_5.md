# Feature 07 — Tournaments: Increment 5 Implementation Prompt

Copy and paste the following prompt into a fresh AI conversation. It is fully self-contained.

---

You are implementing Increment 5 of the Tournaments feature for ChessWeb: BullMQ automation for tournament start and round advancement. Increments 1-4 are complete.

## Existing Codebase State

- `backend/src/tournaments/tournaments.service.ts` has `create()`, `join()`, `leave()`, `getStandings()`, and a `dispatchPairing()` helper
- All 4 pairing algorithms exist in `backend/src/tournaments/pairing/`
- `BullMQ` and `@nestjs/bullmq` are installed
- A Redis connection is available via `backend/src/redis/redis.module.ts` providing `REDIS_CLIENT`
- `GameService.createGame(dto)` creates a Game row and returns the game object
- `GameService.onGameComplete` hook does NOT yet call TournamentsService — you will add that call

## Files to Create

### `backend/src/tournaments/tournaments-queue.module.ts`

```typescript
import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'tournaments' }),
  ],
  exports: [BullModule],
})
export class TournamentsQueueModule {}
```

### `backend/src/tournaments/tournaments.processor.ts`

```typescript
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { TournamentsService } from './tournaments.service';

@Processor('tournaments')
@Injectable()
export class TournamentsProcessor extends WorkerHost {
  private readonly logger = new Logger(TournamentsProcessor.name);

  constructor(private readonly tournamentsService: TournamentsService) {
    super();
  }

  async process(job: Job): Promise<void> {
    switch (job.name) {
      case 'start-tournament':
        await this.handleStartTournament(job);
        break;
      case 'advance-round':
        await this.handleAdvanceRound(job);
        break;
      default:
        this.logger.warn(`Unknown job type: ${job.name}`);
    }
  }

  private async handleStartTournament(job: Job<{ tournamentId: string }>) {
    const { tournamentId } = job.data;
    this.logger.log(`Starting tournament ${tournamentId}`);
    await this.tournamentsService.startTournament(tournamentId);
  }

  private async handleAdvanceRound(job: Job<{ tournamentId: string; expectedRound: number }>) {
    const { tournamentId, expectedRound } = job.data;
    this.logger.log(`Advance round check for tournament ${tournamentId}, expectedRound: ${expectedRound}`);
    await this.tournamentsService.advanceRoundIfExpected(tournamentId, expectedRound);
  }
}
```

## Methods to Add to TournamentsService

### `startTournament(tournamentId: string)`

```typescript
async startTournament(tournamentId: string): Promise<void> {
  // Optimistic lock: only transition from UPCOMING
  const updated = await this.prisma.tournament.updateMany({
    where: { id: tournamentId, status: 'UPCOMING' },
    data: { status: 'ONGOING', currentRound: 1 },
  });
  if (updated.count === 0) {
    this.logger.warn(`Tournament ${tournamentId} is not UPCOMING — skipping start`);
    return;
  }

  const tournament = await this.prisma.tournament.findUnique({
    where: { id: tournamentId },
    include: { players: { include: { user: true } } },
  });

  if (tournament.players.length < 4) {
    await this.prisma.tournament.update({
      where: { id: tournamentId },
      data: { status: 'COMPLETED' },
    });
    this.logger.log(`Tournament ${tournamentId} completed immediately (< 4 players)`);
    return;
  }

  const previousGames = []; // No previous games in round 1
  const { pairs, bye } = await this.dispatchPairing(tournament, tournament.players, previousGames);

  // Create Game rows for each pair
  for (const pair of pairs) {
    await this.gameService.createGame({
      whitePlayerId: pair.whitePlayerId,
      blackPlayerId: pair.blackPlayerId,
      timeControl: tournament.timeControl,
      tournamentId: tournament.id,
      tournamentRound: 1,
    });
  }

  // Handle bye
  if (bye) {
    await this.prisma.tournamentPlayer.update({
      where: { tournamentId_userId: { tournamentId, userId: bye } },
      data: { score: { increment: 1 }, hasBye: true },
    });
  }

  // Schedule advance-round job for this round
  const roundDurationMs = this.computeRoundDuration(tournament.timeControl);
  await this.queue.add('advance-round',
    { tournamentId, expectedRound: 1 },
    { delay: roundDurationMs }
  );
}
```

### `advanceRoundIfExpected(tournamentId: string, expectedRound: number)`

```typescript
async advanceRoundIfExpected(tournamentId: string, expectedRound: number): Promise<void> {
  const tournament = await this.prisma.tournament.findUnique({ where: { id: tournamentId } });
  if (!tournament) return;
  if (tournament.currentRound !== expectedRound) {
    // Round already advanced (all games completed early)
    this.logger.log(`Tournament ${tournamentId} already on round ${tournament.currentRound}, expected ${expectedRound} — skipping`);
    return;
  }
  await this.advanceRound(tournamentId);
}
```

### `advanceRound(tournamentId: string)`

```typescript
async advanceRound(tournamentId: string): Promise<void> {
  const tournament = await this.prisma.tournament.findUnique({
    where: { id: tournamentId },
    include: { players: { include: { user: true } } },
  });
  const nextRound = tournament.currentRound + 1;

  if (nextRound > tournament.maxRounds) {
    await this.prisma.tournament.update({
      where: { id: tournamentId },
      data: { status: 'COMPLETED' },
    });
    this.logger.log(`Tournament ${tournamentId} COMPLETED`);
    return;
  }

  await this.prisma.tournament.update({
    where: { id: tournamentId },
    data: { currentRound: nextRound },
  });

  const previousGames = await this.prisma.game.findMany({
    where: { tournamentId },
  });
  const { pairs, bye } = await this.dispatchPairing(tournament, tournament.players, previousGames as any);

  for (const pair of pairs) {
    await this.gameService.createGame({
      whitePlayerId: pair.whitePlayerId,
      blackPlayerId: pair.blackPlayerId,
      timeControl: tournament.timeControl,
      tournamentId,
      tournamentRound: nextRound,
    });
  }

  if (bye) {
    await this.prisma.tournamentPlayer.update({
      where: { tournamentId_userId: { tournamentId, userId: bye } },
      data: { score: { increment: 1 }, hasBye: true },
    });
  }

  const roundDurationMs = this.computeRoundDuration(tournament.timeControl);
  await this.queue.add('advance-round',
    { tournamentId, expectedRound: nextRound },
    { delay: roundDurationMs }
  );
}
```

### `recordGameResult(game: Game)`

```typescript
async recordGameResult(game: { id: string; tournamentId: string; result: string; whitePlayerId: string; blackPlayerId: string; tournamentRound: number }): Promise<void> {
  if (!game.tournamentId) return;

  // Update scores
  if (game.result === 'WHITE_WIN') {
    await this.prisma.tournamentPlayer.update({
      where: { tournamentId_userId: { tournamentId: game.tournamentId, userId: game.whitePlayerId } },
      data: { score: { increment: 1 } },
    });
  } else if (game.result === 'BLACK_WIN') {
    await this.prisma.tournamentPlayer.update({
      where: { tournamentId_userId: { tournamentId: game.tournamentId, userId: game.blackPlayerId } },
      data: { score: { increment: 1 } },
    });
  } else if (game.result === 'DRAW') {
    await this.prisma.tournamentPlayer.updateMany({
      where: { tournamentId: game.tournamentId, userId: { in: [game.whitePlayerId, game.blackPlayerId] } },
      data: { score: { increment: 0.5 } },
    });
  }

  // Recompute Buchholz for both players
  await this.recomputeBuchholz(game.tournamentId);

  // Check if all games in this round are complete
  const incompleteCount = await this.prisma.game.count({
    where: {
      tournamentId: game.tournamentId,
      tournamentRound: game.tournamentRound,
      status: { not: 'COMPLETED' },
    },
  });

  if (incompleteCount === 0) {
    await this.advanceRound(game.tournamentId);
  }
}
```

## Update GameService

In `backend/src/game/game.service.ts`, after a game completes, add:
```typescript
if (game.tournamentId) {
  await this.tournamentsService.recordGameResult(game);
}
```

## Update TournamentsModule

Import `TournamentsQueueModule`, inject `@InjectQueue('tournaments') private queue: Queue` into `TournamentsService`, provide `TournamentsProcessor`.

## Update TournamentsService.create()

After `prisma.tournament.create(...)`, enqueue the start job:
```typescript
await this.queue.add('start-tournament',
  { tournamentId: tournament.id },
  { delay: Math.max(0, new Date(dto.startAt).getTime() - Date.now()) }
);
```

## Verification

1. Create a tournament with `startAt` 10 seconds from now.
2. 4 users join.
3. Wait 10 seconds. Check BullMQ dashboard or logs: `start-tournament` job fired.
4. Query PostgreSQL: `SELECT * FROM "Game" WHERE "tournamentId" = '<id>';` — should show 2 rows with `tournamentRound = 1`.
5. Complete both games. Verify 2 new Game rows created with `tournamentRound = 2`.
6. After all rounds, verify tournament `status = 'COMPLETED'`.
