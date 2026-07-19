# Feature 08 — Puzzles: Increment 1 Implementation Prompt

Copy and paste the following prompt into a fresh AI conversation. It is fully self-contained.

---

You are implementing Increment 1 of the Puzzles feature for ChessWeb, a NestJS + React chess application. No previous increments exist — this is the first puzzle code in the codebase.

## Project Context

- **Backend**: NestJS 10, Prisma ORM (PostgreSQL), ioredis, BullMQ
- **Frontend**: React 18, TanStack Query, Zustand, react-chessboard, chess.js
- **Backend root**: `src/`
- **Prisma schema**: `prisma/schema.prisma`
- **Redis client**: already configured in the project as `@InjectRedis()` from `@liaoliaots/nestjs-redis`

## What Increment 1 Delivers

- Prisma schema additions: `Puzzle` model, `UserPuzzleAttempt` model (SM-2 fields included now for later use)
- Lichess CSV seeder script that imports ~3.3M puzzles
- `GET /puzzles/daily` — returns today's puzzle from Redis cache (TTL until midnight UTC); falls back to random 1400–1600 rated puzzle if Redis is empty
- `GET /puzzles/:id` — returns a single puzzle by Lichess ID
- `GET /puzzles` — paginated list with optional `theme`, `minRating`, `maxRating`, `page`, `limit` filters
- `GET /puzzles/themes` — list of all unique themes with puzzle counts
- No authentication required on any endpoint in this increment
- No attempt recording, no rating updates, no SM-2 in this increment

## Step 1: Prisma Schema

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
```

Also add `puzzleAttempts UserPuzzleAttempt[]` to the existing `User` model.

Run: `npx prisma migrate dev --name add_puzzles`

**Important:** The GIN index (`@@index([themes], type: Gin)`) may require adding a raw SQL block to the generated migration file if Prisma does not support it natively. After running `prisma migrate dev`, open the generated migration SQL file and verify that the GIN index line reads:
```sql
CREATE INDEX "Puzzle_themes_idx" ON "Puzzle" USING gin ("themes");
```
If it reads `USING btree`, manually change it to `USING gin` before committing the migration.

## Step 2: Install Dependencies

```bash
npm install csv-parse
```

Add to `package.json` scripts:
```json
"seed:puzzles": "ts-node src/puzzles/seeds/seed-puzzles.ts"
```

## Step 3: Interfaces

Create `src/puzzles/interfaces/sm2-state.interface.ts`:
```typescript
export interface SM2State {
  easeFactor: number;
  interval: number;
  repetitions: number;
  nextReview: Date;
}
```

Create `src/puzzles/interfaces/rating-delta.interface.ts`:
```typescript
export interface RatingDelta {
  userRatingBefore: number;
  userRatingAfter: number;
  puzzleRatingBefore: number;
  puzzleRatingAfter: number;
}
```

## Step 4: DTOs

Create `src/puzzles/dto/puzzle-response.dto.ts`:
```typescript
export class PuzzleResponseDto {
  id: string;
  fen: string;
  moves: string;
  rating: number;
  ratingDeviation: number;
  themes: string[];
  openingTags: string[];
}

export class DailyPuzzleResponseDto extends PuzzleResponseDto {
  isDaily: true = true;
}
```

Create `src/puzzles/dto/puzzle-list-query.dto.ts`:
```typescript
import { IsOptional, IsString, IsNumber, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class PuzzleListQueryDto {
  @IsOptional()
  @IsString()
  theme?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minRating?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Max(9999)
  maxRating?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
```

## Step 5: Seeder Script

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

  const fullPath = path.resolve(csvPath);
  console.log(`Starting import from ${fullPath}`);
  const startTime = Date.now();

  let batch: any[] = [];
  let total = 0;
  const BATCH_SIZE = 1000;

  const parser = fs
    .createReadStream(fullPath)
    .pipe(
      parse({
        delimiter: ',',
        columns: true,
        skip_empty_lines: true,
        trim: true,
      }),
    );

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

    if (batch.length >= BATCH_SIZE) {
      await prisma.puzzle.createMany({ data: batch, skipDuplicates: true });
      total += batch.length;
      batch = [];
      if (total % 10000 === 0) {
        console.log(`Imported ${total.toLocaleString()} puzzles...`);
      }
    }
  }

  // Flush remaining rows
  if (batch.length > 0) {
    await prisma.puzzle.createMany({ data: batch, skipDuplicates: true });
    total += batch.length;
  }

  const duration = Math.round((Date.now() - startTime) / 1000);
  console.log(`\nDone! Imported ${total.toLocaleString()} puzzles in ${duration}s`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
```

## Step 6: PuzzlesService

Create `src/puzzles/puzzles.service.ts`:
```typescript
import {
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { InjectRedis } from '@liaoliaots/nestjs-redis';
import Redis from 'ioredis';
import { PuzzleListQueryDto } from './dto/puzzle-list-query.dto';

@Injectable()
export class PuzzlesService {
  constructor(
    private readonly prisma: PrismaService,
    @InjectRedis() private readonly redis: Redis,
  ) {}

  private secondsUntilMidnightUTC(): number {
    const now = new Date();
    const midnight = new Date(now);
    midnight.setUTCHours(24, 0, 0, 0);
    return Math.floor((midnight.getTime() - now.getTime()) / 1000);
  }

  async getDailyPuzzle() {
    const dailyId = await this.redis.get('puzzle:daily');

    if (dailyId) {
      const puzzle = await this.prisma.puzzle.findUnique({
        where: { id: dailyId },
      });
      if (puzzle) return { ...puzzle, isDaily: true as const };
    }

    // Fallback: random puzzle in 1400–1600 range (do NOT cache — let cron handle it)
    const puzzle = await this.prisma.puzzle.findFirst({
      where: { rating: { gte: 1400, lte: 1600 } },
      orderBy: { id: 'asc' }, // deterministic fallback
    });

    if (!puzzle) {
      throw new ServiceUnavailableException('No daily puzzle available');
    }

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

    if (theme) {
      where.themes = { has: theme };
    }
    if (minRating !== undefined || maxRating !== undefined) {
      where.rating = {};
      if (minRating !== undefined) where.rating.gte = minRating;
      if (maxRating !== undefined) where.rating.lte = maxRating;
    }

    const [data, total] = await Promise.all([
      this.prisma.puzzle.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { rating: 'asc' },
      }),
      this.prisma.puzzle.count({ where }),
    ]);

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getThemes() {
    // Use raw SQL for efficient theme aggregation from GIN-indexed array column
    const rows = await this.prisma.$queryRaw<{ theme: string; count: bigint }[]>`
      SELECT unnest(themes) AS theme, COUNT(*) AS count
      FROM "Puzzle"
      GROUP BY theme
      ORDER BY count DESC
    `;
    return {
      themes: rows.map((r) => ({ name: r.theme, count: Number(r.count) })),
    };
  }
}
```

## Step 7: PuzzlesController

Create `src/puzzles/puzzles.controller.ts`:
```typescript
import { Controller, Get, Param, Query } from '@nestjs/common';
import { PuzzlesService } from './puzzles.service';
import { PuzzleListQueryDto } from './dto/puzzle-list-query.dto';

@Controller('puzzles')
export class PuzzlesController {
  constructor(private readonly puzzlesService: PuzzlesService) {}

  // IMPORTANT: literal routes must come before parameterised :id route
  @Get('daily')
  getDaily() {
    return this.puzzlesService.getDailyPuzzle();
  }

  @Get('themes')
  getThemes() {
    return this.puzzlesService.getThemes();
  }

  @Get(':id')
  getById(@Param('id') id: string) {
    return this.puzzlesService.getById(id);
  }

  @Get()
  getList(@Query() query: PuzzleListQueryDto) {
    return this.puzzlesService.getList(query);
  }
}
```

## Step 8: PuzzlesModule

Create `src/puzzles/puzzles.module.ts`:
```typescript
import { Module } from '@nestjs/common';
import { PuzzlesController } from './puzzles.controller';
import { PuzzlesService } from './puzzles.service';

@Module({
  controllers: [PuzzlesController],
  providers: [PuzzlesService],
  exports: [PuzzlesService],
})
export class PuzzlesModule {}
```

## Step 9: Register in AppModule

In `src/app.module.ts`, add `PuzzlesModule` to the `imports` array:
```typescript
import { PuzzlesModule } from './puzzles/puzzles.module';
// ... existing imports ...
@Module({
  imports: [
    // ... existing modules ...
    PuzzlesModule,
  ],
})
export class AppModule {}
```

## Verification

After completing all steps, verify with these curl commands:

```bash
# Daily puzzle (no auth)
curl http://localhost:3000/puzzles/daily
# Expected: 200 { id, fen, moves, rating, themes, openingTags, isDaily: true }

# By ID (use any seeded puzzle ID)
curl http://localhost:3000/puzzles/00008
# Expected: 200 { id, fen, moves, rating, ratingDeviation, themes, openingTags }

# 404
curl http://localhost:3000/puzzles/DOESNOTEXIST
# Expected: 404 { statusCode: 404, message: "Puzzle not found" }

# List with theme filter
curl "http://localhost:3000/puzzles?theme=fork&minRating=1200&maxRating=1800"
# Expected: 200 { data: [...], total, page, limit, totalPages }

# Themes
curl http://localhost:3000/puzzles/themes
# Expected: 200 { themes: [{ name: "fork", count: 123456 }, ...] }
```

Run the unit tests:
```bash
npx jest src/puzzles/puzzles.service.spec.ts
```
