# Implementation Prompt — Backend (Feature 07: Tournaments)

## Purpose

This is a self-contained prompt for a fresh AI session. Paste everything between
"BEGIN PROMPT" and "END PROMPT" to implement the full NestJS backend for the
Tournaments feature.

---

## BEGIN PROMPT

You are implementing the Tournaments backend for ChessWeb, a NestJS 10 + PostgreSQL chess
application using Prisma ORM, BullMQ, and Socket.io. Follow each section precisely.

### Stack assumptions

- NestJS 10 with `@nestjs/bullmq`, `bullmq`, `ioredis`
- Prisma Client generated from `backend/prisma/schema.prisma`
- JWT auth middleware already present as `JwtAuthGuard` (attaches `req.user` with `{ id, username, role }`)
- Socket.io server is registered as a NestJS provider under the injection token `'SOCKET_IO'`
- BullMQ Redis connection is available as `REDIS_CONNECTION` provider (ioredis instance)

---

### Step 1: Prisma Schema Additions

Append these models and enum to `backend/prisma/schema.prisma`. Do NOT overwrite existing models.

```prisma
enum TournamentStatus {
  WAITING
  ACTIVE
  COMPLETED
  CANCELLED
}

model Tournament {
  id             String             @id @default(cuid())
  name           String
  organizerId    String
  organizer      User               @relation("OrganizedTournaments", fields: [organizerId], references: [id])
  variant        String             @default("standard")
  timeControl    String
  maxPlayers     Int
  currentPlayers Int                @default(0)
  rounds         Int
  currentRound   Int                @default(0)
  status         TournamentStatus   @default(WAITING)
  startTime      DateTime?
  createdAt      DateTime           @default(now())
  players        TournamentPlayer[]
  games          TournamentGame[]
}

model TournamentPlayer {
  id           String     @id @default(cuid())
  tournamentId String
  tournament   Tournament @relation(fields: [tournamentId], references: [id])
  userId       String
  user         User       @relation("TournamentParticipations", fields: [userId], references: [id])
  points       Float      @default(0)
  tiebreak     Float      @default(0)
  byeRound     Int?
  eliminated   Boolean    @default(false)
  joinedAt     DateTime   @default(now())
  @@unique([tournamentId, userId])
}

model TournamentGame {
  id           String     @id @default(cuid())
  tournamentId String
  tournament   Tournament @relation(fields: [tournamentId], references: [id])
  gameId       String?    @unique
  game         Game?      @relation(fields: [gameId], references: [id])
  round        Int
  whiteId      String
  blackId      String?
}
```

Also add `tournamentId String?` as a nullable field on the existing `Game` model and add
`@relation` back-reference so `TournamentGame.game` resolves correctly.

Run: `npx prisma migrate dev --name add-tournaments`

---

### Step 2: Module Structure

Create `backend/src/tournaments/` with these files:

```
tournaments/
  dto/
    create-tournament.dto.ts
    join-tournament.dto.ts
  tournaments.controller.ts
  tournaments.service.ts
  tournaments.module.ts
  round-advancement.processor.ts
  tournament-organizer.guard.ts
```

---

### Step 3: DTOs

**create-tournament.dto.ts**
```typescript
import { IsString, IsInt, Min, Max, IsOptional, IsIn } from 'class-validator';

export class CreateTournamentDto {
  @IsString()
  name: string;

  @IsString()
  timeControl: string; // e.g. "5+0", "10+5"

  @IsInt()
  @Min(2)
  @Max(256)
  maxPlayers: number;

  @IsInt()
  @Min(1)
  @Max(11)
  rounds: number;

  @IsOptional()
  @IsIn(['standard', 'chess960', 'crazyhouse', 'antichess'])
  variant?: string;
}
```

---

### Step 4: TournamentsService

Implement `backend/src/tournaments/tournaments.service.ts`:

```typescript
import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
  Inject,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Server } from 'socket.io';
import { CreateTournamentDto } from './dto/create-tournament.dto';

@Injectable()
export class TournamentsService {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue('tournament-rounds') private readonly roundsQueue: Queue,
    @Inject('SOCKET_IO') private readonly io: Server,
  ) {}

  // ─── Create ──────────────────────────────────────────────────────────────────

  async createTournament(dto: CreateTournamentDto, organizerId: string) {
    return this.prisma.tournament.create({
      data: {
        name: dto.name,
        organizerId,
        variant: dto.variant ?? 'standard',
        timeControl: dto.timeControl,
        maxPlayers: dto.maxPlayers,
        rounds: dto.rounds,
        status: 'WAITING',
      },
    });
  }

  // ─── Join ─────────────────────────────────────────────────────────────────────

  async joinTournament(tournamentId: string, userId: string) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { id: tournamentId },
    });
    if (!tournament) throw new NotFoundException('Tournament not found');
    if (tournament.status !== 'WAITING') {
      throw new BadRequestException('Tournament is not accepting registrations');
    }
    if (tournament.currentPlayers >= tournament.maxPlayers) {
      throw new ConflictException('Tournament is full');
    }

    const existing = await this.prisma.tournamentPlayer.findUnique({
      where: { tournamentId_userId: { tournamentId, userId } },
    });
    if (existing) throw new ConflictException('User has already joined this tournament');

    await this.prisma.tournamentPlayer.create({
      data: { tournamentId, userId },
    });
    await this.prisma.tournament.update({
      where: { id: tournamentId },
      data: { currentPlayers: { increment: 1 } },
    });
  }

  // ─── Start ────────────────────────────────────────────────────────────────────

  async startTournament(tournamentId: string, requesterId: string) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { id: tournamentId },
    });
    if (!tournament) throw new NotFoundException('Tournament not found');
    if (tournament.organizerId !== requesterId) {
      throw new ForbiddenException('Only the organizer can start the tournament');
    }
    if (tournament.status !== 'WAITING') {
      throw new BadRequestException('Tournament is not in WAITING state');
    }
    if (tournament.currentPlayers < 2) {
      throw new BadRequestException('At least 2 players must join before starting');
    }

    await this.prisma.tournament.update({
      where: { id: tournamentId },
      data: { status: 'ACTIVE', currentRound: 1, startTime: new Date() },
    });

    // Pair round 1 immediately
    await this.pairRound(tournamentId, 1);

    // Enqueue a delayed job to check if round 1 is complete
    // Delay = estimated max game duration based on time control
    const delayMs = this.estimateRoundDurationMs(tournament.timeControl);
    await this.roundsQueue.add(
      'check-round-complete',
      { tournamentId, round: 1 },
      { delay: delayMs, jobId: `${tournamentId}-round-1` },
    );

    return { message: 'Tournament started', round: 1 };
  }

  // ─── Swiss Pairing ────────────────────────────────────────────────────────────

  /**
   * Swiss pairing algorithm:
   * 1. Load active (non-eliminated) players, sort by points DESC, tiebreak DESC.
   * 2. If player count is odd, find the lowest-ranked player with no prior bye and
   *    assign them a bye (+1 point, byeRound = roundNumber). Remove from pairing list.
   * 3. Load all prior TournamentGame rows to build a "previously faced" set.
   * 4. Pair players greedily: take the first unpaired player, find the highest-ranked
   *    remaining player they have NOT yet faced, pair them. Repeat.
   * 5. If no valid opponent exists (all have been faced), fall back to the next
   *    available player ignoring rematch constraint.
   * 6. Persist pairings as TournamentGame rows and update tournament.currentRound.
   */
  async pairRound(
    tournamentId: string,
    roundNumber: number,
  ): Promise<{ games: any[]; byePlayerId: string | null }> {
    const allPlayers = await this.prisma.tournamentPlayer.findMany({
      where: { tournamentId, eliminated: false },
      orderBy: [{ points: 'desc' }, { tiebreak: 'desc' }],
    });

    const previousGames = await this.prisma.tournamentGame.findMany({
      where: { tournamentId },
      select: { whiteId: true, blackId: true },
    });

    // Build set of already-faced opponents for each player
    const faced = new Map<string, Set<string>>();
    for (const p of allPlayers) faced.set(p.userId, new Set());
    for (const g of previousGames) {
      faced.get(g.whiteId)?.add(g.blackId ?? '');
      if (g.blackId) faced.get(g.blackId)?.add(g.whiteId);
    }

    let activePlayers = [...allPlayers];
    let byePlayerId: string | null = null;

    // Assign bye to lowest-ranked player who has not yet received one
    if (activePlayers.length % 2 !== 0) {
      const byeCandidate = [...activePlayers]
        .reverse()
        .find((p) => p.byeRound === null);
      if (byeCandidate) {
        byePlayerId = byeCandidate.userId;
        activePlayers = activePlayers.filter((p) => p.userId !== byePlayerId);
        await this.prisma.tournamentPlayer.update({
          where: { tournamentId_userId: { tournamentId, userId: byePlayerId } },
          data: { byeRound: roundNumber, points: { increment: 1 } },
        });
      }
    }

    // Pair remaining players
    const paired = new Set<string>();
    const games: { tournamentId: string; round: number; whiteId: string; blackId: string }[] = [];

    for (const player of activePlayers) {
      if (paired.has(player.userId)) continue;
      paired.add(player.userId);

      // Find highest-ranked unpaired opponent not yet faced
      const opponent =
        activePlayers.find(
          (p) =>
            !paired.has(p.userId) &&
            !faced.get(player.userId)?.has(p.userId),
        ) ??
        // Fallback: allow rematch if no other option
        activePlayers.find((p) => !paired.has(p.userId));

      if (opponent) {
        paired.add(opponent.userId);
        games.push({
          tournamentId,
          round: roundNumber,
          whiteId: player.userId,
          blackId: opponent.userId,
        });
      }
    }

    if (games.length > 0) {
      await this.prisma.tournamentGame.createMany({ data: games });
    }

    await this.prisma.tournament.update({
      where: { id: tournamentId },
      data: { currentRound: roundNumber },
    });

    return { games, byePlayerId };
  }

  // ─── Record Result ────────────────────────────────────────────────────────────

  /**
   * Called by GameService when a game ends. winnerId=null means draw.
   * Updates points and recomputes Buchholz tiebreak for both players.
   */
  async recordResult(gameId: string, winnerId: string | null) {
    const tGame = await this.prisma.tournamentGame.findUnique({
      where: { gameId },
      include: { tournament: true },
    });
    if (!tGame) return; // not a tournament game

    const { tournamentId, whiteId, blackId } = tGame;

    if (winnerId === null) {
      // Draw
      await this.prisma.tournamentPlayer.updateMany({
        where: { tournamentId, userId: { in: [whiteId, blackId ?? ''] } },
        data: { points: { increment: 0.5 } },
      });
    } else {
      const loserId = winnerId === whiteId ? blackId : whiteId;
      await this.prisma.tournamentPlayer.update({
        where: { tournamentId_userId: { tournamentId, userId: winnerId } },
        data: { points: { increment: 1 } },
      });
      if (loserId) {
        await this.prisma.tournamentPlayer.update({
          where: { tournamentId_userId: { tournamentId, userId: loserId } },
          data: { points: { increment: 0 } }, // no-op, but keeps audit trail
        });
      }
    }

    // Recompute Buchholz: sum of all opponents' current scores
    await this.recomputeBuchholz(tournamentId);
  }

  // ─── Standings ────────────────────────────────────────────────────────────────

  async getStandings(tournamentId: string) {
    const players = await this.prisma.tournamentPlayer.findMany({
      where: { tournamentId },
      include: { user: { select: { id: true, username: true } } },
      orderBy: [{ points: 'desc' }, { tiebreak: 'desc' }],
    });
    return players.map((p, i) => ({
      rank: i + 1,
      userId: p.userId,
      username: p.user.username,
      points: p.points,
      tiebreak: p.tiebreak,
      byeRound: p.byeRound,
      eliminated: p.eliminated,
    }));
  }

  // ─── Get / List ───────────────────────────────────────────────────────────────

  async getTournament(id: string) {
    const t = await this.prisma.tournament.findUnique({
      where: { id },
      include: {
        organizer: { select: { id: true, username: true } },
        players: { include: { user: { select: { id: true, username: true } } } },
      },
    });
    if (!t) throw new NotFoundException('Tournament not found');
    return t;
  }

  async listTournaments(status?: string) {
    return this.prisma.tournament.findMany({
      where: status ? { status: status as any } : undefined,
      orderBy: { createdAt: 'desc' },
      include: { organizer: { select: { id: true, username: true } } },
    });
  }

  // ─── Admin: Complete / Cancel / Disqualify ────────────────────────────────────

  async completeTournament(tournamentId: string) {
    await this.prisma.tournament.update({
      where: { id: tournamentId },
      data: { status: 'COMPLETED' },
    });
    this.io.emit('tournamentCompleted', { tournamentId });
  }

  async cancelTournament(tournamentId: string, requesterId: string, requesterRole: string) {
    const t = await this.prisma.tournament.findUnique({ where: { id: tournamentId } });
    if (!t) throw new NotFoundException('Tournament not found');
    if (t.organizerId !== requesterId && requesterRole !== 'ADMIN') {
      throw new ForbiddenException('Only the organizer or an admin can cancel');
    }
    await this.prisma.tournament.update({
      where: { id: tournamentId },
      data: { status: 'CANCELLED' },
    });
    this.io.emit('tournamentCancelled', { tournamentId });
  }

  async disqualifyPlayer(tournamentId: string, userId: string, requesterId: string, requesterRole: string) {
    const t = await this.prisma.tournament.findUnique({ where: { id: tournamentId } });
    if (!t) throw new NotFoundException('Tournament not found');
    if (t.organizerId !== requesterId && requesterRole !== 'ADMIN') {
      throw new ForbiddenException('Insufficient permissions');
    }
    await this.prisma.tournamentPlayer.update({
      where: { tournamentId_userId: { tournamentId, userId } },
      data: { eliminated: true },
    });
    // Forfeit any active game for this player in the current round
    const activeGame = await this.prisma.tournamentGame.findFirst({
      where: {
        tournamentId,
        round: t.currentRound,
        OR: [{ whiteId: userId }, { blackId: userId }],
        gameId: null, // game not yet linked means it's pending/active
      },
    });
    if (activeGame) {
      const opponentId = activeGame.whiteId === userId ? activeGame.blackId : activeGame.whiteId;
      if (opponentId) {
        await this.recordResult(activeGame.gameId ?? activeGame.id, opponentId);
      }
    }
  }

  // ─── Private Helpers ──────────────────────────────────────────────────────────

  private async recomputeBuchholz(tournamentId: string) {
    const allPlayers = await this.prisma.tournamentPlayer.findMany({
      where: { tournamentId },
    });
    const allGames = await this.prisma.tournamentGame.findMany({
      where: { tournamentId },
    });
    const scoreMap = new Map(allPlayers.map((p) => [p.userId, p.points]));

    for (const player of allPlayers) {
      const opponentIds = allGames
        .filter((g) => g.whiteId === player.userId || g.blackId === player.userId)
        .map((g) => (g.whiteId === player.userId ? g.blackId : g.whiteId))
        .filter(Boolean) as string[];
      const buchholz = opponentIds.reduce((sum, id) => sum + (scoreMap.get(id) ?? 0), 0);
      await this.prisma.tournamentPlayer.update({
        where: { tournamentId_userId: { tournamentId, userId: player.userId } },
        data: { tiebreak: buchholz },
      });
    }
  }

  private estimateRoundDurationMs(timeControl: string): number {
    // Parse "M+I" format (minutes + increment per move)
    const match = timeControl.match(/^(\d+)\+(\d+)$/);
    if (!match) return 30 * 60 * 1000; // default 30 min
    const minutes = parseInt(match[1], 10);
    const increment = parseInt(match[2], 10);
    // 2 players × (minutes × 60 + 40 moves × increment) + 5 min buffer
    const seconds = 2 * (minutes * 60 + 40 * increment) + 300;
    return seconds * 1000;
  }
}
```

---

### Step 5: RoundAdvancementProcessor

**round-advancement.processor.ts**
```typescript
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Inject } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TournamentsService } from './tournaments.service';
import { Server } from 'socket.io';

interface RoundCheckJobData {
  tournamentId: string;
  round: number;
}

@Processor('tournament-rounds', { concurrency: 1 })
export class RoundAdvancementProcessor extends WorkerHost {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tournamentsService: TournamentsService,
    @Inject('SOCKET_IO') private readonly io: Server,
  ) {
    super();
  }

  async process(job: Job<RoundCheckJobData>): Promise<void> {
    const { tournamentId, round } = job.data;

    const tournament = await this.prisma.tournament.findUnique({
      where: { id: tournamentId },
    });
    if (!tournament || tournament.status !== 'ACTIVE') return;

    // Idempotency: only process if this job's round matches the current round
    if (tournament.currentRound !== round) return;

    const totalGames = await this.prisma.tournamentGame.count({
      where: { tournamentId, round },
    });
    const completedGames = await this.prisma.tournamentGame.count({
      where: {
        tournamentId,
        round,
        game: { status: 'COMPLETED' },
      },
    });

    if (completedGames < totalGames) return; // Not all games done yet

    const nextRound = round + 1;
    if (nextRound > tournament.rounds) {
      await this.tournamentsService.completeTournament(tournamentId);
      return;
    }

    await this.tournamentsService.pairRound(tournamentId, nextRound);
    this.io.emit('tournamentRoundStarted', { tournamentId, round: nextRound });

    const delayMs = 30 * 60 * 1000; // 30 min fallback; real value from timeControl
    await job.queue.add(
      'check-round-complete',
      { tournamentId, round: nextRound },
      { delay: delayMs, jobId: `${tournamentId}-round-${nextRound}` },
    );
  }
}
```

---

### Step 6: TournamentOrganizerGuard

**tournament-organizer.guard.ts**
```typescript
import { CanActivate, ExecutionContext, Injectable, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TournamentOrganizerGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const tournamentId: string = req.params.id;
    const user = req.user;

    if (!user) throw new ForbiddenException('Not authenticated');
    if (user.role === 'ADMIN') return true; // admins bypass check

    const tournament = await this.prisma.tournament.findUnique({
      where: { id: tournamentId },
      select: { organizerId: true },
    });
    if (!tournament) throw new ForbiddenException('Tournament not found');
    if (tournament.organizerId !== user.id) {
      throw new ForbiddenException('Only the organizer can perform this action');
    }
    return true;
  }
}
```

---

### Step 7: TournamentsController

```typescript
import {
  Controller, Get, Post, Delete, Param, Body, Query,
  UseGuards, Req, HttpCode, HttpStatus,
} from '@nestjs/common';
import { TournamentsService } from './tournaments.service';
import { CreateTournamentDto } from './dto/create-tournament.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TournamentOrganizerGuard } from './tournament-organizer.guard';

@Controller('tournaments')
export class TournamentsController {
  constructor(private readonly service: TournamentsService) {}

  @Get()
  list(@Query('status') status?: string) {
    return this.service.listTournaments(status);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.service.getTournament(id);
  }

  @Get(':id/standings')
  standings(@Param('id') id: string) {
    return this.service.getStandings(id);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateTournamentDto, @Req() req: any) {
    return this.service.createTournament(dto, req.user.id);
  }

  @Post(':id/join')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  join(@Param('id') id: string, @Req() req: any) {
    return this.service.joinTournament(id, req.user.id);
  }

  @Post(':id/start')
  @UseGuards(JwtAuthGuard, TournamentOrganizerGuard)
  @HttpCode(HttpStatus.OK)
  start(@Param('id') id: string, @Req() req: any) {
    return this.service.startTournament(id, req.user.id);
  }

  @Post(':id/advance-round')
  @UseGuards(JwtAuthGuard, TournamentOrganizerGuard)
  @HttpCode(HttpStatus.OK)
  advanceRound(@Param('id') id: string, @Req() req: any) {
    // Admin/organizer force-advances regardless of game completion
    return this.service.forceAdvanceRound(id, req.user.id);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  cancel(@Param('id') id: string, @Req() req: any) {
    return this.service.cancelTournament(id, req.user.id, req.user.role);
  }

  @Delete(':id/players/:userId')
  @UseGuards(JwtAuthGuard, TournamentOrganizerGuard)
  @HttpCode(HttpStatus.OK)
  disqualify(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @Req() req: any,
  ) {
    return this.service.disqualifyPlayer(id, userId, req.user.id, req.user.role);
  }
}
```

---

### Step 8: TournamentsModule

```typescript
import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TournamentsController } from './tournaments.controller';
import { TournamentsService } from './tournaments.service';
import { RoundAdvancementProcessor } from './round-advancement.processor';
import { TournamentOrganizerGuard } from './tournament-organizer.guard';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [
    PrismaModule,
    BullModule.registerQueue({ name: 'tournament-rounds' }),
  ],
  controllers: [TournamentsController],
  providers: [TournamentsService, RoundAdvancementProcessor, TournamentOrganizerGuard],
  exports: [TournamentsService],
})
export class TournamentsModule {}
```

Register `TournamentsModule` in `AppModule`.

---

### Error Cases Summary

| Condition | Exception | HTTP |
|---|---|---|
| Tournament not found | NotFoundException | 404 |
| Not WAITING when joining | BadRequestException | 400 |
| Tournament full | ConflictException | 409 |
| Already joined | ConflictException | 409 |
| Start with < 2 players | BadRequestException | 400 |
| Non-organizer start | ForbiddenException | 403 |

---

### Verification

1. Run migration: `npx prisma migrate dev --name add-tournaments`
2. `POST /tournaments` with valid body → 201 with `id` and `status: "WAITING"`
3. `POST /tournaments/:id/join` (authenticated) → 200
4. `POST /tournaments/:id/join` (same user again) → 409
5. `POST /tournaments/:id/start` (non-organizer) → 403
6. `POST /tournaments/:id/start` (organizer, ≥2 players) → 200, DB status = "ACTIVE"
7. `GET /tournaments/:id/standings` → array with `rank`, `points`, `tiebreak`

## END PROMPT
