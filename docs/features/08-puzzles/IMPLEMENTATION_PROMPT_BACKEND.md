# Feature 08 — Puzzles: Backend Implementation Prompt (All Increments)

Copy and paste the following prompt into a fresh AI conversation. It is fully self-contained. This covers all three backend increments (1–3) in one shot — use this if you want to implement the entire backend without pausing between increments.

---

You are implementing the complete backend for the Puzzles feature of ChessWeb, a NestJS + React chess application targeting 11M+ users. The backend does not yet have any puzzle-related code.

## Tech Stack

- NestJS 10, TypeScript
- Prisma ORM with PostgreSQL
- ioredis (`@liaoliaots/nestjs-redis`, injected via `@InjectRedis()`)
- BullMQ (`@nestjs/bull`)
- `JwtAuthGuard` at `src/auth/guards/jwt-auth.guard.ts`
- `@User()` decorator at `src/auth/decorators/user.decorator.ts` (extracts `req.user.sub` as `userId`)
- Backend source root: `src/`

## What This Prompt Builds

1. **Prisma models**: `Puzzle`, `UserPuzzleAttempt`, `UserPuzzleRating`
2. **CSV seeder**: imports ~3.3M puzzles from the Lichess open dataset
3. **PuzzlesService**: all service methods (getDailyPuzzle, getById, getList, getThemes, getNextPuzzle, recordAttempt, getStats)
4. **SpacedRepetitionService**: SM-2 algorithm (pure stateless function)
5. **PuzzleRatingService**: Glicko-2 rating updates for both puzzle and user
6. **PuzzlesController**: all 7 endpoints with correct route ordering
7. **PuzzlesProcessor**: BullMQ cron job for daily puzzle selection at 00:00 UTC
8. **PuzzlesModule**: wired together

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | /puzzles/daily | No | Today's puzzle from Redis cache |
| GET | /puzzles/next | JWT | Next puzzle from SM-2 queue |
| GET | /puzzles/themes | No | All themes with counts |
| GET | /puzzles/stats | JWT | User's puzzle stats |
| GET | /puzzles/:id | No | Single puzzle by ID |
| GET | /puzzles | No | Paginated list with filters |
| POST | /puzzles/:id/attempt | JWT | Record attempt, update ratings + SM-2 |

---

## Part 1: Prisma Schema

Add to `prisma/schema.prisma`:

```prisma
model Puzzle {
  id              String              @id  // Lichess puzzle ID, e.g. "00008"
  fen             String
  moves           String              // space-separated UCI moves e.g. "e2e4 d7d5"
  rating          Float               @default(1500)
  ratingDeviation Float               @default(350)
  themes          String[]
  openingTags     String[]
  attempts        UserPuzzleAttempt[]

  @@index([rating])
  @@index([themes], type: Gin)
}

model UserPuzzleAttempt {
  id           String   @id @default(cuid())
  userId       String
  user         User     @relation(fields: [userId], references: [id])
  puzzleId     String
  puzzle       Puzzle   @relation(fields: [puzzleId], references: [id])
  solved       Boolean
  timeTaken    Int      // milliseconds
  attemptedAt  DateTime @default(now())
  easeFactor   Float    @default(2.5)
  interval     Int      @default(1)
  repetitions  Int      @default(0)
  nextReview   DateTime @default(now())

  @@unique([userId, puzzleId])
  @@index([userId, nextReview])
}

model UserPuzzleRating {
  id              String   @id @default(cuid())
  userId          String   @unique
  user            User     @relation(fields: [userId], references: [id])
  rating          Float    @default(1500)
  ratingDeviation Float    @default(350)
  volatility      Float    @default(0.06)
  updatedAt       DateTime @updatedAt
}
```

Also add to `User` model:
```prisma
puzzleAttempts UserPuzzleAttempt[]
puzzleRating   UserPuzzleRating?
```

Run:
```bash
npm install csv-parse date-fns
npx prisma migrate dev --name add_puzzles
```

After migration, verify the GIN index in the generated SQL file reads:
```sql
CREATE INDEX "Puzzle_themes_idx" ON "Puzzle" USING gin ("themes");
```
If it reads `USING btree`, change it to `USING gin` manually before committing.

---

## Part 2: Interfaces and DTOs

### `src/puzzles/interfaces/sm2-state.interface.ts`
```typescript
export interface SM2State {
  easeFactor: number;
  interval: number;
  repetitions: number;
  nextReview: Date;
}
```

### `src/puzzles/interfaces/rating-delta.interface.ts`
```typescript
export interface RatingDelta {
  userRatingBefore: number;
  userRatingAfter: number;
  puzzleRatingBefore: number;
  puzzleRatingAfter: number;
}
```

### `src/puzzles/dto/attempt-puzzle.dto.ts`
```typescript
import { IsBoolean, IsNumber, Min, Max } from 'class-validator';

export class AttemptPuzzleDto {
  @IsBoolean()
  solved: boolean;

  @IsNumber()
  @Min(1)
  @Max(3_600_000)
  timeTaken: number;
}
```

### `src/puzzles/dto/puzzle-list-query.dto.ts`
```typescript
import { IsOptional, IsString, IsNumber, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class PuzzleListQueryDto {
  @IsOptional() @IsString()
  theme?: string;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(0)
  minRating?: number;

  @IsOptional() @Type(() => Number) @IsNumber() @Max(9999)
  maxRating?: number;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(1)
  page?: number = 1;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(1) @Max(100)
  limit?: number = 20;
}
```

---

## Part 3: Seeder Script

Create `src/puzzles/seeds/seed-puzzles.ts`:
```typescript
import { PrismaClient } from '@prisma/client';
import { parse } from 'csv-parse';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

async function main() {
  const csvPath = process.argv[2];
  if (!csvPath) {
    console.error('Usage: ts-node seed-puzzles.ts <path-to-csv>');
    process.exit(1);
  }

  console.log(`Starting import from ${path.resolve(csvPath)}`);
  const startTime = Date.now();
  let batch: any[] = [];
  let total = 0;

  const parser = fs
    .createReadStream(path.resolve(csvPath))
    .pipe(parse({ delimiter: ',', columns: true, skip_empty_lines: true, trim: true }));

  for await (const row of parser) {
    batch.push({
      id: row.PuzzleId,
      fen: row.FEN,
      moves: row.Moves,
      rating: parseFloat(row.Rating),
      ratingDeviation: parseFloat(row.RatingDeviation),
      themes: row.Themes ? row.Themes.split(' ').filter(Boolean) : [],
      openingTags: row.OpeningTags ? row.OpeningTags.split(' ').filter(Boolean) : [],
    });

    if (batch.length >= 1000) {
      await prisma.puzzle.createMany({ data: batch, skipDuplicates: true });
      total += batch.length;
      batch = [];
      if (total % 10000 === 0) console.log(`Imported ${total.toLocaleString()} puzzles...`);
    }
  }

  if (batch.length > 0) {
    await prisma.puzzle.createMany({ data: batch, skipDuplicates: true });
    total += batch.length;
  }

  const duration = Math.round((Date.now() - startTime) / 1000);
  console.log(`Done! Imported ${total.toLocaleString()} puzzles in ${duration}s`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
```

Add to `package.json`:
```json
"seed:puzzles": "ts-node src/puzzles/seeds/seed-puzzles.ts"
```

---

## Part 4: SpacedRepetitionService

Create `src/puzzles/spaced-repetition.service.ts`:
```typescript
import { Injectable } from '@nestjs/common';
import { SM2State } from './interfaces/sm2-state.interface';
import { addDays } from 'date-fns';

@Injectable()
export class SpacedRepetitionService {
  calculateNextReview(state: SM2State, quality: 0 | 2 | 3 | 4 | 5): SM2State {
    let { easeFactor, interval, repetitions } = state;

    if (quality < 3) {
      repetitions = 0;
      interval = 1;
      easeFactor = Math.max(1.3, easeFactor + 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
    } else {
      easeFactor = Math.max(1.3, easeFactor + 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
      if (repetitions === 0) interval = 1;
      else if (repetitions === 1) interval = 6;
      else interval = Math.round(interval * easeFactor);
      repetitions += 1;
    }

    easeFactor = Math.round(easeFactor * 100) / 100;
    return { easeFactor, interval, repetitions, nextReview: addDays(new Date(), interval) };
  }
}
```

---

## Part 5: PuzzleRatingService

Create `src/puzzles/puzzle-rating.service.ts`:
```typescript
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RatingDelta } from './interfaces/rating-delta.interface';

interface Glicko2Player {
  rating: number;
  ratingDeviation: number;
  volatility: number;
}

@Injectable()
export class PuzzleRatingService {
  private readonly SCALE = 173.7178;
  private readonly TAU = 0.5;

  constructor(private readonly prisma: PrismaService) {}

  private computeGlicko2(player: Glicko2Player, opponent: Glicko2Player, score: number): Glicko2Player {
    const mu = (player.rating - 1500) / this.SCALE;
    const phi = player.ratingDeviation / this.SCALE;
    const muJ = (opponent.rating - 1500) / this.SCALE;
    const phiJ = opponent.ratingDeviation / this.SCALE;

    const g = (p: number) => 1 / Math.sqrt(1 + (3 * p * p) / (Math.PI * Math.PI));
    const gPhiJ = g(phiJ);
    const E = 1 / (1 + Math.exp(-gPhiJ * (mu - muJ)));
    const v = 1 / (gPhiJ * gPhiJ * E * (1 - E));
    const delta = v * gPhiJ * (score - E);

    const sigmaPrime = this.computeNewVolatility(phi, player.volatility, delta, v);
    const phiStar = Math.sqrt(phi * phi + sigmaPrime * sigmaPrime);
    const phiPrime = 1 / Math.sqrt(1 / (phiStar * phiStar) + 1 / v);
    const muPrime = mu + phiPrime * phiPrime * gPhiJ * (score - E);

    return {
      rating: Math.round(this.SCALE * muPrime + 1500),
      ratingDeviation: Math.round(this.SCALE * phiPrime),
      volatility: sigmaPrime,
    };
  }

  private computeNewVolatility(phi: number, sigma: number, delta: number, v: number): number {
    const tau = this.TAU;
    const a = Math.log(sigma * sigma);
    const epsilon = 0.000001;

    const f = (x: number) => {
      const ex = Math.exp(x);
      const d2 = phi * phi + v + ex;
      return (ex * (delta * delta - d2)) / (2 * d2 * d2) - (x - a) / (tau * tau);
    };

    let A = a;
    let B = delta * delta > phi * phi + v ? Math.log(delta * delta - phi * phi - v) : (() => {
      let k = 1;
      while (f(a - k * tau) < 0) k++;
      return a - k * tau;
    })();

    let fA = f(A), fB = f(B);
    while (Math.abs(B - A) > epsilon) {
      const C = A + ((A - B) * fA) / (fB - fA);
      const fC = f(C);
      if (fC * fB <= 0) { A = B; fA = fB; } else { fA /= 2; }
      B = C; fB = fC;
    }
    return Math.exp(A / 2);
  }

  async updateRatings(puzzleId: string, userId: string, solved: boolean): Promise<RatingDelta> {
    const puzzle = await this.prisma.puzzle.findUnique({ where: { id: puzzleId } });
    if (!puzzle) throw new Error(`Puzzle ${puzzleId} not found`);

    const existingUserRating = await this.prisma.userPuzzleRating.findUnique({ where: { userId } });

    const userRating: Glicko2Player = existingUserRating
      ? { rating: existingUserRating.rating, ratingDeviation: existingUserRating.ratingDeviation, volatility: existingUserRating.volatility }
      : { rating: 1500, ratingDeviation: 350, volatility: 0.06 };

    const puzzleRating: Glicko2Player = { rating: puzzle.rating, ratingDeviation: puzzle.ratingDeviation, volatility: 0.06 };

    const newUserRating = this.computeGlicko2(userRating, puzzleRating, solved ? 1 : 0);
    const newPuzzleRating = this.computeGlicko2(puzzleRating, userRating, solved ? 0 : 1);

    await this.prisma.userPuzzleRating.upsert({
      where: { userId },
      update: { rating: newUserRating.rating, ratingDeviation: newUserRating.ratingDeviation, volatility: newUserRating.volatility },
      create: { userId, rating: newUserRating.rating, ratingDeviation: newUserRating.ratingDeviation, volatility: newUserRating.volatility },
    });

    await this.prisma.puzzle.update({
      where: { id: puzzleId },
      data: { rating: newPuzzleRating.rating, ratingDeviation: newPuzzleRating.ratingDeviation },
    });

    return {
      userRatingBefore: userRating.rating,
      userRatingAfter: newUserRating.rating,
      puzzleRatingBefore: puzzleRating.rating,
      puzzleRatingAfter: newPuzzleRating.rating,
    };
  }
}
```

---

## Part 6: PuzzlesService

Create `src/puzzles/puzzles.service.ts`:
```typescript
import {
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { InjectRedis } from '@liaoliaots/nestjs-redis';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import Redis from 'ioredis';
import { SpacedRepetitionService } from './spaced-repetition.service';
import { PuzzleRatingService } from './puzzle-rating.service';
import { AttemptPuzzleDto } from './dto/attempt-puzzle.dto';
import { PuzzleListQueryDto } from './dto/puzzle-list-query.dto';
import { SM2State } from './interfaces/sm2-state.interface';

@Injectable()
export class PuzzlesService implements OnModuleInit {
  private readonly logger = new Logger(PuzzlesService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectRedis() private readonly redis: Redis,
    private readonly spacedRepetitionService: SpacedRepetitionService,
    private readonly puzzleRatingService: PuzzleRatingService,
    @InjectQueue('puzzles') private readonly puzzlesQueue: Queue,
  ) {}

  async onModuleInit() {
    await this.puzzlesQueue.add(
      'selectDailyPuzzle',
      {},
      { repeat: { cron: '0 0 * * *', tz: 'UTC' }, removeOnComplete: true },
    );
    this.logger.log('Daily puzzle cron job registered');
  }

  private secondsUntilMidnightUTC(): number {
    const now = new Date();
    const midnight = new Date(now);
    midnight.setUTCHours(24, 0, 0, 0);
    return Math.floor((midnight.getTime() - now.getTime()) / 1000);
  }

  mapQuality(solved: boolean, timeTaken: number): 0 | 2 | 3 | 4 | 5 {
    if (!solved) return 0;
    if (timeTaken < 10_000) return 5;
    if (timeTaken < 30_000) return 4;
    if (timeTaken < 60_000) return 3;
    return 2;
  }

  async getDailyPuzzle() {
    const dailyId = await this.redis.get('puzzle:daily');
    if (dailyId) {
      const puzzle = await this.prisma.puzzle.findUnique({ where: { id: dailyId } });
      if (puzzle) return { ...puzzle, isDaily: true as const };
    }
    const puzzle = await this.prisma.puzzle.findFirst({
      where: { rating: { gte: 1400, lte: 1600 } },
      orderBy: { id: 'asc' },
    });
    if (!puzzle) throw new ServiceUnavailableException('No daily puzzle available');
    return { ...puzzle, isDaily: true as const };
  }

  async getById(id: string) {
    const puzzle = await this.prisma.puzzle.findUnique({ where: { id } });
    if (!puzzle) throw new NotFoundException('Puzzle not found');
    return puzzle;
  }

  async getList(query: PuzzleListQueryDto) {
    const { theme, minRating, maxRating, page = 1, limit = 20 } = query;
    const where: any = {};
    if (theme) where.themes = { has: theme };
    if (minRating !== undefined || maxRating !== undefined) {
      where.rating = {};
      if (minRating !== undefined) where.rating.gte = minRating;
      if (maxRating !== undefined) where.rating.lte = maxRating;
    }
    const [data, total] = await Promise.all([
      this.prisma.puzzle.findMany({ where, skip: (page - 1) * limit, take: limit, orderBy: { rating: 'asc' } }),
      this.prisma.puzzle.count({ where }),
    ]);
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async getThemes() {
    const rows = await this.prisma.$queryRaw<{ theme: string; count: bigint }[]>`
      SELECT unnest(themes) AS theme, COUNT(*) AS count
      FROM "Puzzle"
      GROUP BY theme
      ORDER BY count DESC
    `;
    return { themes: rows.map((r) => ({ name: r.theme, count: Number(r.count) })) };
  }

  async getNextPuzzle(userId: string) {
    const dueAttempt = await this.prisma.userPuzzleAttempt.findFirst({
      where: { userId, nextReview: { lte: new Date() } },
      orderBy: { nextReview: 'asc' },
      include: { puzzle: true },
    });

    if (dueAttempt) {
      return {
        puzzle: dueAttempt.puzzle,
        sm2State: {
          easeFactor: dueAttempt.easeFactor,
          interval: dueAttempt.interval,
          repetitions: dueAttempt.repetitions,
          nextReview: dueAttempt.nextReview.toISOString(),
        },
        source: 'due' as const,
      };
    }

    const [unseen] = await this.prisma.$queryRaw<any[]>`
      SELECT p.* FROM "Puzzle" p
      WHERE p.id NOT IN (
        SELECT upa."puzzleId" FROM "UserPuzzleAttempt" upa WHERE upa."userId" = ${userId}
      )
      ORDER BY RANDOM() LIMIT 1
    `;

    if (!unseen) throw new NotFoundException('No puzzles available');
    return { puzzle: unseen, sm2State: null, source: 'new' as const };
  }

  async recordAttempt(userId: string, puzzleId: string, dto: AttemptPuzzleDto) {
    const puzzle = await this.prisma.puzzle.findUnique({ where: { id: puzzleId } });
    if (!puzzle) throw new NotFoundException('Puzzle not found');

    const quality = this.mapQuality(dto.solved, dto.timeTaken);

    const currentAttempt = await this.prisma.userPuzzleAttempt.findUnique({
      where: { userId_puzzleId: { userId, puzzleId } },
    });

    const currentSM2: SM2State = currentAttempt
      ? { easeFactor: currentAttempt.easeFactor, interval: currentAttempt.interval, repetitions: currentAttempt.repetitions, nextReview: currentAttempt.nextReview }
      : { easeFactor: 2.5, interval: 1, repetitions: 0, nextReview: new Date() };

    const newSM2 = this.spacedRepetitionService.calculateNextReview(currentSM2, quality);
    const ratingDelta = await this.puzzleRatingService.updateRatings(puzzleId, userId, dto.solved);

    const upserted = await this.prisma.userPuzzleAttempt.upsert({
      where: { userId_puzzleId: { userId, puzzleId } },
      update: { solved: dto.solved, timeTaken: dto.timeTaken, attemptedAt: new Date(), easeFactor: newSM2.easeFactor, interval: newSM2.interval, repetitions: newSM2.repetitions, nextReview: newSM2.nextReview },
      create: { userId, puzzleId, solved: dto.solved, timeTaken: dto.timeTaken, easeFactor: newSM2.easeFactor, interval: newSM2.interval, repetitions: newSM2.repetitions, nextReview: newSM2.nextReview },
    });

    const dailyId = await this.redis.get('puzzle:daily');
    if (dailyId === puzzleId && dto.solved) await this.updateStreak(userId);

    return {
      attemptId: upserted.id,
      solved: dto.solved,
      quality,
      nextReview: newSM2.nextReview.toISOString(),
      sm2State: { easeFactor: newSM2.easeFactor, interval: newSM2.interval, repetitions: newSM2.repetitions },
      ratingDelta,
    };
  }

  async getStats(userId: string) {
    const [totalAttempts, totalSolved, userRating] = await Promise.all([
      this.prisma.userPuzzleAttempt.count({ where: { userId } }),
      this.prisma.userPuzzleAttempt.count({ where: { userId, solved: true } }),
      this.prisma.userPuzzleRating.findUnique({ where: { userId } }),
    ]);
    const accuracy = totalAttempts > 0 ? Math.round((totalSolved / totalAttempts) * 100) : 0;
    const streakData = await this.redis.hgetall(`user:${userId}:puzzle_streak`);
    return {
      totalAttempts,
      totalSolved,
      accuracy,
      currentRating: userRating?.rating ?? 1500,
      ratingDeviation: userRating?.ratingDeviation ?? 350,
      streak: parseInt(streakData?.streak ?? '0'),
      lastSolvedDate: streakData?.lastSolvedDate ?? null,
      ratingByTheme: {},
    };
  }

  private async updateStreak(userId: string) {
    const key = `user:${userId}:puzzle_streak`;
    const today = new Date().toISOString().split('T')[0];
    const data = await this.redis.hgetall(key);
    const { streak = '0', lastSolvedDate = '' } = data;
    if (lastSolvedDate === today) return;
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    const newStreak = lastSolvedDate === yesterday ? parseInt(streak) + 1 : 1;
    await this.redis.hset(key, { streak: newStreak.toString(), lastSolvedDate: today });
  }
}
```

---

## Part 7: PuzzlesController

Create `src/puzzles/puzzles.controller.ts`:
```typescript
import {
  Controller, Get, Post, Param, Query, Body, UseGuards,
} from '@nestjs/common';
import { PuzzlesService } from './puzzles.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { User } from '../auth/decorators/user.decorator';
import { AttemptPuzzleDto } from './dto/attempt-puzzle.dto';
import { PuzzleListQueryDto } from './dto/puzzle-list-query.dto';

@Controller('puzzles')
export class PuzzlesController {
  constructor(private readonly puzzlesService: PuzzlesService) {}

  @Get('daily')
  getDaily() {
    return this.puzzlesService.getDailyPuzzle();
  }

  @Get('next')
  @UseGuards(JwtAuthGuard)
  getNext(@User('sub') userId: string) {
    return this.puzzlesService.getNextPuzzle(userId);
  }

  @Get('themes')
  getThemes() {
    return this.puzzlesService.getThemes();
  }

  @Get('stats')
  @UseGuards(JwtAuthGuard)
  getStats(@User('sub') userId: string) {
    return this.puzzlesService.getStats(userId);
  }

  @Get(':id')
  getById(@Param('id') id: string) {
    return this.puzzlesService.getById(id);
  }

  @Get()
  getList(@Query() query: PuzzleListQueryDto) {
    return this.puzzlesService.getList(query);
  }

  @Post(':id/attempt')
  @UseGuards(JwtAuthGuard)
  recordAttempt(
    @Param('id') id: string,
    @Body() dto: AttemptPuzzleDto,
    @User('sub') userId: string,
  ) {
    return this.puzzlesService.recordAttempt(userId, id, dto);
  }
}
```

---

## Part 8: PuzzlesProcessor (BullMQ Cron)

Create `src/puzzles/puzzles.processor.ts`:
```typescript
import { Processor, Process } from '@nestjs/bull';
import { Job } from 'bull';
import { Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { InjectRedis } from '@liaoliaots/nestjs-redis';
import Redis from 'ioredis';

@Processor('puzzles')
export class PuzzlesProcessor {
  private readonly logger = new Logger(PuzzlesProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectRedis() private readonly redis: Redis,
  ) {}

  @Process('selectDailyPuzzle')
  async handleSelectDailyPuzzle(_job: Job) {
    this.logger.log('Selecting daily puzzle...');
    const [puzzle] = await this.prisma.$queryRaw<any[]>`
      SELECT * FROM "Puzzle" WHERE rating BETWEEN 1400 AND 1600 ORDER BY RANDOM() LIMIT 1
    `;
    if (!puzzle) { this.logger.error('No puzzle found for daily selection'); return; }
    const now = new Date();
    const midnight = new Date(now);
    midnight.setUTCHours(24, 0, 0, 0);
    const ttl = Math.floor((midnight.getTime() - now.getTime()) / 1000);
    await this.redis.setex('puzzle:daily', ttl, puzzle.id);
    this.logger.log(`Daily puzzle set: ${puzzle.id} (rating: ${puzzle.rating}), TTL: ${ttl}s`);
  }
}
```

---

## Part 9: PuzzlesModule

Create `src/puzzles/puzzles.module.ts`:
```typescript
import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { PuzzlesController } from './puzzles.controller';
import { PuzzlesService } from './puzzles.service';
import { PuzzleRatingService } from './puzzle-rating.service';
import { SpacedRepetitionService } from './spaced-repetition.service';
import { PuzzlesProcessor } from './puzzles.processor';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'puzzles',
      defaultJobOptions: { removeOnComplete: true, removeOnFail: false },
    }),
  ],
  controllers: [PuzzlesController],
  providers: [PuzzlesService, PuzzleRatingService, SpacedRepetitionService, PuzzlesProcessor],
  exports: [PuzzlesService],
})
export class PuzzlesModule {}
```

Add `PuzzlesModule` to `AppModule` imports.

---

## Verification

```bash
# Seed with a small sample (create a 10-row CSV for quick testing)
npx ts-node src/puzzles/seeds/seed-puzzles.ts data/sample.csv

# Run all puzzle unit tests
npx jest src/puzzles/ --testPathPattern="spec"

# Full integration test suite
npx jest test/puzzles.e2e-spec.ts

# Manual smoke tests
TOKEN=$(curl -s -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"Test123!"}' | jq -r '.accessToken')

curl http://localhost:3000/puzzles/daily
curl http://localhost:3000/puzzles/00008
curl "http://localhost:3000/puzzles?theme=fork&minRating=1200"
curl http://localhost:3000/puzzles/themes
curl -H "Authorization: Bearer $TOKEN" http://localhost:3000/puzzles/next
curl -X POST http://localhost:3000/puzzles/00008/attempt \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"solved":true,"timeTaken":8000}'
curl -H "Authorization: Bearer $TOKEN" http://localhost:3000/puzzles/stats
```
