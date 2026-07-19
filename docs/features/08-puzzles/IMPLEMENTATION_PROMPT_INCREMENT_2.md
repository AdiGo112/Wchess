# Feature 08 — Puzzles: Increment 2 Implementation Prompt

Copy and paste the following prompt into a fresh AI conversation. It is fully self-contained.

---

You are implementing Increment 2 of the Puzzles feature for ChessWeb, a NestJS + React chess application. Increment 1 is complete: the `Puzzle` and `UserPuzzleAttempt` Prisma models exist, the Lichess CSV seeder works, and `GET /puzzles/daily`, `GET /puzzles/:id`, `GET /puzzles`, and `GET /puzzles/themes` all return 200 responses.

## What Increment 2 Delivers

- `UserPuzzleRating` Prisma model (stores each user's Glicko-2 puzzle rating)
- `PuzzleRatingService` with full Glicko-2 update logic
- `POST /puzzles/:id/attempt` endpoint (JWT required): maps `(solved, timeTaken)` to quality 0–5, calls Glicko-2, upserts `UserPuzzleAttempt`, returns `{ attemptId, solved, quality, nextReview, sm2State, ratingDelta }`
- `GET /puzzles/next` endpoint (JWT required): returns the next puzzle for the authenticated user — due puzzles (SM-2 queue) first, unseen puzzles as fallback
- SM-2 `nextReview` in Increment 2 is a placeholder (today + `interval` days using default SM-2 state) — full SM-2 scheduling comes in Increment 3

## Project Context

- **Backend**: NestJS 10, Prisma ORM (PostgreSQL), ioredis, BullMQ
- `JwtAuthGuard` exists at `src/auth/guards/jwt-auth.guard.ts`
- `@User()` decorator exists at `src/auth/decorators/user.decorator.ts` — extracts `req.user.sub` as `userId`
- Existing `PuzzlesService` is at `src/puzzles/puzzles.service.ts`
- Existing `PuzzlesModule` is at `src/puzzles/puzzles.module.ts`

## Step 1: Prisma Schema — Add UserPuzzleRating

Add to `prisma/schema.prisma`:

```prisma
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

Also add `puzzleRating UserPuzzleRating?` to the `User` model.

Run: `npx prisma migrate dev --name add_user_puzzle_rating`

## Step 2: AttemptPuzzleDto

Create `src/puzzles/dto/attempt-puzzle.dto.ts`:
```typescript
import { IsBoolean, IsNumber, Min, Max } from 'class-validator';

export class AttemptPuzzleDto {
  @IsBoolean()
  solved: boolean;

  @IsNumber()
  @Min(1)
  @Max(3_600_000)
  timeTaken: number; // milliseconds
}
```

## Step 3: PuzzleRatingService — Full Glicko-2 Implementation

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
  constructor(private readonly prisma: PrismaService) {}

  private readonly SCALE = 173.7178;
  private readonly TAU = 0.5; // system constant; controls volatility change speed

  /**
   * Compute Glicko-2 update for a single game (one attempt).
   * player = the entity being updated; opponent = the other entity.
   * score = 1 if player won (solved), 0 if player lost (failed).
   */
  private computeGlicko2(
    player: Glicko2Player,
    opponent: Glicko2Player,
    score: number, // 1 = win, 0 = loss
  ): Glicko2Player {
    // Step 1: Convert to internal scale
    const mu = (player.rating - 1500) / this.SCALE;
    const phi = player.ratingDeviation / this.SCALE;
    const sigma = player.volatility;

    const muJ = (opponent.rating - 1500) / this.SCALE;
    const phiJ = opponent.ratingDeviation / this.SCALE;

    // Step 2: g(phi_j)
    const g = (p: number) => 1 / Math.sqrt(1 + (3 * p * p) / (Math.PI * Math.PI));
    const gPhiJ = g(phiJ);

    // Step 3: E(s|mu, muJ, phiJ)
    const E = 1 / (1 + Math.exp(-gPhiJ * (mu - muJ)));

    // Step 4: v (estimated variance)
    const v = 1 / (gPhiJ * gPhiJ * E * (1 - E));

    // Step 5: delta
    const delta = v * gPhiJ * (score - E);

    // Step 6: New volatility sigma' (Illinois algorithm)
    const sigmaPrime = this.computeNewVolatility(phi, sigma, delta, v);

    // Step 7: Update phi and mu
    const phiStar = Math.sqrt(phi * phi + sigmaPrime * sigmaPrime);
    const phiPrime = 1 / Math.sqrt(1 / (phiStar * phiStar) + 1 / v);
    const muPrime = mu + phiPrime * phiPrime * gPhiJ * (score - E);

    // Step 8: Convert back to rating scale
    return {
      rating: Math.round(this.SCALE * muPrime + 1500),
      ratingDeviation: Math.round(this.SCALE * phiPrime),
      volatility: sigmaPrime,
    };
  }

  private computeNewVolatility(
    phi: number,
    sigma: number,
    delta: number,
    v: number,
  ): number {
    const tau = this.TAU;
    const a = Math.log(sigma * sigma);
    const epsilon = 0.000001;

    const f = (x: number) => {
      const ex = Math.exp(x);
      const d2 = phi * phi + v + ex;
      return (
        (ex * (delta * delta - d2)) / (2 * d2 * d2) - (x - a) / (tau * tau)
      );
    };

    // Illinois algorithm
    let A = a;
    let B: number;
    if (delta * delta > phi * phi + v) {
      B = Math.log(delta * delta - phi * phi - v);
    } else {
      let k = 1;
      while (f(a - k * tau) < 0) k++;
      B = a - k * tau;
    }

    let fA = f(A);
    let fB = f(B);

    while (Math.abs(B - A) > epsilon) {
      const C = A + ((A - B) * fA) / (fB - fA);
      const fC = f(C);
      if (fC * fB <= 0) {
        A = B;
        fA = fB;
      } else {
        fA /= 2;
      }
      B = C;
      fB = fC;
    }

    return Math.exp(A / 2);
  }

  async updateRatings(
    puzzleId: string,
    userId: string,
    solved: boolean,
  ): Promise<RatingDelta> {
    // Load current ratings
    const puzzle = await this.prisma.puzzle.findUnique({
      where: { id: puzzleId },
    });
    if (!puzzle) throw new Error(`Puzzle ${puzzleId} not found`);

    const existingUserRating = await this.prisma.userPuzzleRating.findUnique({
      where: { userId },
    });

    const userRating: Glicko2Player = existingUserRating
      ? {
          rating: existingUserRating.rating,
          ratingDeviation: existingUserRating.ratingDeviation,
          volatility: existingUserRating.volatility,
        }
      : { rating: 1500, ratingDeviation: 350, volatility: 0.06 };

    const puzzleRating: Glicko2Player = {
      rating: puzzle.rating,
      ratingDeviation: puzzle.ratingDeviation,
      volatility: 0.06, // stored on Puzzle in a later enhancement; default for now
    };

    // User "plays" against puzzle: score = 1 if user solved, 0 if user failed
    const userScore = solved ? 1 : 0;
    const puzzleScore = solved ? 0 : 1;

    const newUserRating = this.computeGlicko2(userRating, puzzleRating, userScore);
    const newPuzzleRating = this.computeGlicko2(puzzleRating, userRating, puzzleScore);

    // Persist updates
    await this.prisma.userPuzzleRating.upsert({
      where: { userId },
      update: {
        rating: newUserRating.rating,
        ratingDeviation: newUserRating.ratingDeviation,
        volatility: newUserRating.volatility,
      },
      create: {
        userId,
        rating: newUserRating.rating,
        ratingDeviation: newUserRating.ratingDeviation,
        volatility: newUserRating.volatility,
      },
    });

    await this.prisma.puzzle.update({
      where: { id: puzzleId },
      data: {
        rating: newPuzzleRating.rating,
        ratingDeviation: newPuzzleRating.ratingDeviation,
      },
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

## Step 4: Update PuzzlesService — recordAttempt and getNextPuzzle

Add these methods to `src/puzzles/puzzles.service.ts` (alongside the existing methods from Increment 1):

```typescript
// Add these imports at the top of puzzles.service.ts:
import { UseGuards } from '@nestjs/common';
import { PuzzleRatingService } from './puzzle-rating.service';
import { AttemptPuzzleDto } from './dto/attempt-puzzle.dto';

// Add PuzzleRatingService to constructor injection:
// constructor(
//   private readonly prisma: PrismaService,
//   @InjectRedis() private readonly redis: Redis,
//   private readonly puzzleRatingService: PuzzleRatingService,  // ADD THIS
// ) {}

mapQuality(solved: boolean, timeTaken: number): 0 | 2 | 3 | 4 | 5 {
  if (!solved) return 0;
  if (timeTaken < 10_000) return 5;  // < 10s
  if (timeTaken < 30_000) return 4;  // < 30s
  if (timeTaken < 60_000) return 3;  // < 60s
  return 2;                          // >= 60s (quality 2 still resets interval)
}

async recordAttempt(userId: string, puzzleId: string, dto: AttemptPuzzleDto) {
  const puzzle = await this.prisma.puzzle.findUnique({ where: { id: puzzleId } });
  if (!puzzle) throw new NotFoundException('Puzzle not found');

  const quality = this.mapQuality(dto.solved, dto.timeTaken);

  // Placeholder SM-2 state (Increment 3 will replace this with SpacedRepetitionService)
  const currentAttempt = await this.prisma.userPuzzleAttempt.findUnique({
    where: { userId_puzzleId: { userId, puzzleId } },
  });

  const easeFactor = currentAttempt?.easeFactor ?? 2.5;
  const interval = currentAttempt?.interval ?? 1;
  const repetitions = currentAttempt?.repetitions ?? 0;

  // Simple placeholder: nextReview = today + interval
  const nextReview = new Date();
  nextReview.setDate(nextReview.getDate() + (quality >= 3 ? Math.max(1, interval) : 1));

  const ratingDelta = await this.puzzleRatingService.updateRatings(puzzleId, userId, dto.solved);

  const upserted = await this.prisma.userPuzzleAttempt.upsert({
    where: { userId_puzzleId: { userId, puzzleId } },
    update: {
      solved: dto.solved,
      timeTaken: dto.timeTaken,
      attemptedAt: new Date(),
      easeFactor,
      interval,
      repetitions,
      nextReview,
    },
    create: {
      userId,
      puzzleId,
      solved: dto.solved,
      timeTaken: dto.timeTaken,
      easeFactor,
      interval,
      repetitions,
      nextReview,
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
    nextReview: nextReview.toISOString(),
    sm2State: { easeFactor, interval, repetitions },
    ratingDelta,
  };
}

async getNextPuzzle(userId: string) {
  // Priority 1: due puzzles from SM-2 queue
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

  // Priority 2: random unseen puzzle
  const [unseen] = await this.prisma.$queryRaw<any[]>`
    SELECT p.*
    FROM "Puzzle" p
    WHERE p.id NOT IN (
      SELECT upa."puzzleId" FROM "UserPuzzleAttempt" upa WHERE upa."userId" = ${userId}
    )
    ORDER BY RANDOM()
    LIMIT 1
  `;

  if (!unseen) {
    throw new NotFoundException('No puzzles available');
  }

  return {
    puzzle: unseen,
    sm2State: null,
    source: 'new' as const,
  };
}

private async updateStreak(userId: string) {
  const key = `user:${userId}:puzzle_streak`;
  const today = new Date().toISOString().split('T')[0];
  const data = await this.redis.hgetall(key);
  const { streak = '0', lastSolvedDate = '' } = data;

  if (lastSolvedDate === today) return; // already counted today

  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  const newStreak = lastSolvedDate === yesterday ? parseInt(streak) + 1 : 1;

  await this.redis.hset(key, {
    streak: newStreak.toString(),
    lastSolvedDate: today,
  });
}
```

## Step 5: Update PuzzlesController

Add these routes to `src/puzzles/puzzles.controller.ts` (before the `GET :id` route):

```typescript
// Add these imports:
import { Post, Body, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { User } from '../auth/decorators/user.decorator';
import { AttemptPuzzleDto } from './dto/attempt-puzzle.dto';

// Add these route handlers (before @Get(':id')):

@Get('next')
@UseGuards(JwtAuthGuard)
getNext(@User('sub') userId: string) {
  return this.puzzlesService.getNextPuzzle(userId);
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
```

**Important controller route order** (NestJS matches top-to-bottom):
```
GET  /puzzles/daily    ← literal, no auth
GET  /puzzles/next     ← literal, JWT
GET  /puzzles/themes   ← literal, no auth
GET  /puzzles/:id      ← parameterised
GET  /puzzles          ← no param
POST /puzzles/:id/attempt
```

## Step 6: Update PuzzlesModule

Update `src/puzzles/puzzles.module.ts` to provide `PuzzleRatingService`:
```typescript
import { Module } from '@nestjs/common';
import { PuzzlesController } from './puzzles.controller';
import { PuzzlesService } from './puzzles.service';
import { PuzzleRatingService } from './puzzle-rating.service';

@Module({
  controllers: [PuzzlesController],
  providers: [PuzzlesService, PuzzleRatingService],
  exports: [PuzzlesService],
})
export class PuzzlesModule {}
```

## Verification

```bash
# Attempt without auth → 401
curl -X POST http://localhost:3000/puzzles/00008/attempt \
  -H "Content-Type: application/json" \
  -d '{"solved":true,"timeTaken":5000}'

# Attempt with auth → 201
TOKEN=$(curl -s -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"Test123!"}' | jq -r '.accessToken')

curl -X POST http://localhost:3000/puzzles/00008/attempt \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"solved":true,"timeTaken":8000}'
# Expected: 201 { attemptId, solved: true, quality: 5, nextReview, sm2State, ratingDelta }

# Verify rating moved
curl http://localhost:3000/puzzles/00008
# puzzle.rating should have decreased (user solved it)

# GET /puzzles/next
curl -H "Authorization: Bearer $TOKEN" http://localhost:3000/puzzles/next
# Expected: 200 { puzzle, sm2State: null, source: 'new' } (first time)

# Validation errors
curl -X POST http://localhost:3000/puzzles/00008/attempt \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"solved":true,"timeTaken":-1}'
# Expected: 400

# Run unit tests
npx jest src/puzzles/puzzle-rating.service.spec.ts
```
