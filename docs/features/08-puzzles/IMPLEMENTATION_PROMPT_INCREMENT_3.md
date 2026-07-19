# Feature 08 — Puzzles: Increment 3 Implementation Prompt

Copy and paste the following prompt into a fresh AI conversation. It is fully self-contained.

---

You are implementing Increment 3 of the Puzzles feature for ChessWeb, a NestJS + React chess application. Increments 1 and 2 are complete: the `Puzzle`, `UserPuzzleAttempt`, and `UserPuzzleRating` Prisma models exist; `POST /puzzles/:id/attempt` works and returns Glicko-2 rating deltas; `GET /puzzles/next` exists but uses a placeholder `nextReview` date instead of proper SM-2 scheduling.

## What Increment 3 Delivers

- `SpacedRepetitionService` — pure stateless service implementing the SM-2 algorithm
- `PuzzlesService.recordAttempt` updated to call `SpacedRepetitionService.calculateNextReview` and persist real SM-2 state
- `GET /puzzles/next` updated to use the SM-2 priority queue correctly
- BullMQ cron job at 00:00 UTC to select and cache the daily puzzle in Redis
- `GET /puzzles/stats` endpoint (JWT required) — returns user's puzzle stats and streak
- Unit tests for `SpacedRepetitionService`

## Project Context

- **Backend**: NestJS 10, Prisma ORM, ioredis, BullMQ
- Existing files: `src/puzzles/puzzles.service.ts`, `src/puzzles/puzzles.controller.ts`, `src/puzzles/puzzles.module.ts`, `src/puzzles/puzzle-rating.service.ts`
- Existing interfaces: `src/puzzles/interfaces/sm2-state.interface.ts` (`{ easeFactor, interval, repetitions, nextReview }`)

## Step 1: SpacedRepetitionService

Create `src/puzzles/spaced-repetition.service.ts`:
```typescript
import { Injectable } from '@nestjs/common';
import { SM2State } from './interfaces/sm2-state.interface';
import { addDays } from 'date-fns';

@Injectable()
export class SpacedRepetitionService {
  /**
   * Computes the new SM-2 state after an attempt.
   * @param state  Current SM-2 state for this (user, puzzle) pair
   * @param quality  0 | 2 | 3 | 4 | 5 — quality score from mapQuality()
   * @returns New SM-2 state with updated easeFactor, interval, repetitions, nextReview
   */
  calculateNextReview(state: SM2State, quality: 0 | 2 | 3 | 4 | 5): SM2State {
    let { easeFactor, interval, repetitions } = state;

    if (quality < 3) {
      // Failed or near-failed: reset progression
      repetitions = 0;
      interval = 1;
      // Still update easeFactor (may decrease toward floor)
      easeFactor = Math.max(1.3, easeFactor + 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
    } else {
      // Successful recall: advance progression
      easeFactor = Math.max(1.3, easeFactor + 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));

      if (repetitions === 0) {
        interval = 1;
      } else if (repetitions === 1) {
        interval = 6;
      } else {
        interval = Math.round(interval * easeFactor);
      }

      repetitions += 1;
    }

    // Round easeFactor to 2 decimal places to avoid floating-point drift
    easeFactor = Math.round(easeFactor * 100) / 100;

    const nextReview = addDays(new Date(), interval);

    return { easeFactor, interval, repetitions, nextReview };
  }
}
```

**Important:** Install `date-fns` if not already present:
```bash
npm install date-fns
```

## Step 2: Update PuzzlesService — Wire SM-2 into recordAttempt

Replace the placeholder SM-2 logic in `src/puzzles/puzzles.service.ts`:

```typescript
// Add SpacedRepetitionService to constructor injection:
// constructor(
//   private readonly prisma: PrismaService,
//   @InjectRedis() private readonly redis: Redis,
//   private readonly puzzleRatingService: PuzzleRatingService,
//   private readonly spacedRepetitionService: SpacedRepetitionService, // ADD THIS
// ) {}

// Replace the recordAttempt method's SM-2 placeholder section with:

async recordAttempt(userId: string, puzzleId: string, dto: AttemptPuzzleDto) {
  const puzzle = await this.prisma.puzzle.findUnique({ where: { id: puzzleId } });
  if (!puzzle) throw new NotFoundException('Puzzle not found');

  const quality = this.mapQuality(dto.solved, dto.timeTaken);

  // Load existing SM-2 state or use defaults
  const currentAttempt = await this.prisma.userPuzzleAttempt.findUnique({
    where: { userId_puzzleId: { userId, puzzleId } },
  });

  const currentSM2: SM2State = currentAttempt
    ? {
        easeFactor: currentAttempt.easeFactor,
        interval: currentAttempt.interval,
        repetitions: currentAttempt.repetitions,
        nextReview: currentAttempt.nextReview,
      }
    : { easeFactor: 2.5, interval: 1, repetitions: 0, nextReview: new Date() };

  // Real SM-2 calculation
  const newSM2 = this.spacedRepetitionService.calculateNextReview(currentSM2, quality);

  const ratingDelta = await this.puzzleRatingService.updateRatings(puzzleId, userId, dto.solved);

  const upserted = await this.prisma.userPuzzleAttempt.upsert({
    where: { userId_puzzleId: { userId, puzzleId } },
    update: {
      solved: dto.solved,
      timeTaken: dto.timeTaken,
      attemptedAt: new Date(),
      easeFactor: newSM2.easeFactor,
      interval: newSM2.interval,
      repetitions: newSM2.repetitions,
      nextReview: newSM2.nextReview,
    },
    create: {
      userId,
      puzzleId,
      solved: dto.solved,
      timeTaken: dto.timeTaken,
      easeFactor: newSM2.easeFactor,
      interval: newSM2.interval,
      repetitions: newSM2.repetitions,
      nextReview: newSM2.nextReview,
    },
  });

  // Streak update if this is the daily puzzle
  const dailyId = await this.redis.get('puzzle:daily');
  if (dailyId === puzzleId && dto.solved) {
    await this.updateStreak(userId);
  }

  return {
    attemptId: upserted.id,
    solved: dto.solved,
    quality,
    nextReview: newSM2.nextReview.toISOString(),
    sm2State: {
      easeFactor: newSM2.easeFactor,
      interval: newSM2.interval,
      repetitions: newSM2.repetitions,
    },
    ratingDelta,
  };
}
```

## Step 3: Add getStats Method to PuzzlesService

```typescript
async getStats(userId: string) {
  const [totalAttempts, totalSolved, userRating] = await Promise.all([
    this.prisma.userPuzzleAttempt.count({ where: { userId } }),
    this.prisma.userPuzzleAttempt.count({ where: { userId, solved: true } }),
    this.prisma.userPuzzleRating.findUnique({ where: { userId } }),
  ]);

  const accuracy = totalAttempts > 0 ? Math.round((totalSolved / totalAttempts) * 100) : 0;

  const streakData = await this.redis.hgetall(`user:${userId}:puzzle_streak`);
  const streak = parseInt(streakData?.streak ?? '0');
  const lastSolvedDate = streakData?.lastSolvedDate ?? null;

  return {
    totalAttempts,
    totalSolved,
    accuracy,
    currentRating: userRating?.rating ?? 1500,
    ratingDeviation: userRating?.ratingDeviation ?? 350,
    streak,
    lastSolvedDate,
    ratingByTheme: {}, // future enhancement
  };
}
```

## Step 4: Update PuzzlesController — Add GET /stats

Add to `src/puzzles/puzzles.controller.ts` (before `GET :id`):
```typescript
@Get('stats')
@UseGuards(JwtAuthGuard)
getStats(@User('sub') userId: string) {
  return this.puzzlesService.getStats(userId);
}
```

## Step 5: BullMQ Cron Job

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
      SELECT * FROM "Puzzle"
      WHERE rating BETWEEN 1400 AND 1600
      ORDER BY RANDOM()
      LIMIT 1
    `;

    if (!puzzle) {
      this.logger.error('No puzzle found in 1400–1600 range for daily selection');
      return;
    }

    const now = new Date();
    const midnight = new Date(now);
    midnight.setUTCHours(24, 0, 0, 0);
    const ttl = Math.floor((midnight.getTime() - now.getTime()) / 1000);

    await this.redis.setex('puzzle:daily', ttl, puzzle.id);
    this.logger.log(
      `Daily puzzle set: ${puzzle.id} (rating: ${puzzle.rating}), TTL: ${ttl}s`,
    );
  }
}
```

## Step 6: Update PuzzlesModule — Register BullMQ

Update `src/puzzles/puzzles.module.ts`:
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
      defaultJobOptions: {
        removeOnComplete: true,
        removeOnFail: false,
      },
    }),
  ],
  controllers: [PuzzlesController],
  providers: [
    PuzzlesService,
    PuzzleRatingService,
    SpacedRepetitionService,
    PuzzlesProcessor,
  ],
  exports: [PuzzlesService],
})
export class PuzzlesModule {}
```

In `AppModule`, ensure `BullModule.forRootAsync` is configured with the Redis connection (or it inherits from an existing BullModule setup if already present for other features).

## Step 7: Schedule the Cron Job

In `src/puzzles/puzzles.service.ts` (or a separate bootstrap file), add the cron job when the module initialises:

```typescript
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { OnModuleInit } from '@nestjs/common';

// In the PuzzlesService class:
constructor(
  // ... other injections ...
  @InjectQueue('puzzles') private readonly puzzlesQueue: Queue,
) {}

async onModuleInit() {
  // Register the daily cron job (runs at 00:00 UTC every day)
  await this.puzzlesQueue.add(
    'selectDailyPuzzle',
    {},
    {
      repeat: { cron: '0 0 * * *', tz: 'UTC' },
      removeOnComplete: true,
    },
  );
  this.logger.log('Daily puzzle cron job registered');
}
```

## Verification

```bash
# Solve a puzzle once
TOKEN=<your_jwt>
curl -X POST http://localhost:3000/puzzles/00008/attempt \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"solved":true,"timeTaken":8000}'
# Expected: quality:5, sm2State.repetitions:1, sm2State.interval:1

# Solve it again (second attempt — should show interval:6)
curl -X POST http://localhost:3000/puzzles/00008/attempt \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"solved":true,"timeTaken":8000}'
# Expected: sm2State.repetitions:2, sm2State.interval:6

# GET /puzzles/next now returns source:'due' if first puzzle's nextReview <= now
# (you'd need to manually set nextReview to the past in the DB for this to trigger)

# GET /puzzles/stats
curl -H "Authorization: Bearer $TOKEN" http://localhost:3000/puzzles/stats
# Expected: { totalAttempts, totalSolved, accuracy, currentRating, streak, ... }

# Run unit tests
npx jest src/puzzles/spaced-repetition.service.spec.ts
npx jest src/puzzles/puzzles.service.spec.ts
```
