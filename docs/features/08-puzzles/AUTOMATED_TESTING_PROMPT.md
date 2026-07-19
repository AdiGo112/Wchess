# 08-Puzzles — Automated Testing Prompt

You are writing Jest unit and integration tests for the ChessWeb puzzles feature. The backend is NestJS with Prisma (PostgreSQL) and ioredis. The tech stack is TypeScript throughout.

## Test File Paths to Create

1. `src/puzzles/spaced-repetition.service.spec.ts` — unit tests for SM-2 algorithm
2. `src/puzzles/puzzle-rating.service.spec.ts` — unit tests for Glicko-2 rating updates
3. `src/puzzles/puzzles.service.spec.ts` — unit tests for PuzzlesService with mocked Prisma and Redis
4. `test/puzzles.e2e-spec.ts` — integration tests with real Prisma test DB and supertest

---

## File 1: spaced-repetition.service.spec.ts

```typescript
import { SpacedRepetitionService } from './spaced-repetition.service';
import { SM2State } from './interfaces/sm2-state.interface';
import { addDays } from 'date-fns';

describe('SpacedRepetitionService', () => {
  let service: SpacedRepetitionService;

  beforeEach(() => {
    service = new SpacedRepetitionService();
  });

  const defaultState: SM2State = {
    easeFactor: 2.5,
    interval: 1,
    repetitions: 0,
    nextReview: new Date(),
  };

  describe('calculateNextReview', () => {
    it('quality 5 first attempt: interval=1, rep=1, EF=2.6', () => {
      const result = service.calculateNextReview(defaultState, 5);
      expect(result.interval).toBe(1);
      expect(result.repetitions).toBe(1);
      expect(result.easeFactor).toBeCloseTo(2.6, 2);
      expect(result.nextReview.getTime()).toBeGreaterThan(Date.now());
    });

    it('quality 5 second attempt: interval=6, rep=2, EF=2.7', () => {
      const state: SM2State = { easeFactor: 2.6, interval: 1, repetitions: 1, nextReview: new Date() };
      const result = service.calculateNextReview(state, 5);
      expect(result.interval).toBe(6);
      expect(result.repetitions).toBe(2);
      expect(result.easeFactor).toBeCloseTo(2.7, 2);
    });

    it('quality 5 third attempt: interval=round(6*2.7)=16, rep=3, EF=2.8', () => {
      const state: SM2State = { easeFactor: 2.7, interval: 6, repetitions: 2, nextReview: new Date() };
      const result = service.calculateNextReview(state, 5);
      expect(result.interval).toBe(Math.round(6 * 2.7)); // 16
      expect(result.repetitions).toBe(3);
      expect(result.easeFactor).toBeCloseTo(2.8, 2);
    });

    it('quality 4 leaves EF unchanged (0.1 - 1*(0.08+0.02) = 0)', () => {
      const result = service.calculateNextReview(defaultState, 4);
      expect(result.easeFactor).toBeCloseTo(2.5, 2);
    });

    it('quality 3 decreases EF slightly', () => {
      const result = service.calculateNextReview(defaultState, 3);
      expect(result.easeFactor).toBeCloseTo(2.36, 2); // 2.5 + 0.1 - 2*(0.08+2*0.02) = 2.5 - 0.14 = 2.36
    });

    it('quality < 3 resets interval to 1 and repetitions to 0', () => {
      const state: SM2State = { easeFactor: 2.8, interval: 16, repetitions: 3, nextReview: new Date() };
      const result = service.calculateNextReview(state, 0);
      expect(result.interval).toBe(1);
      expect(result.repetitions).toBe(0);
    });

    it('quality 2 resets interval and reps', () => {
      const state: SM2State = { easeFactor: 2.5, interval: 6, repetitions: 2, nextReview: new Date() };
      const result = service.calculateNextReview(state, 2);
      expect(result.interval).toBe(1);
      expect(result.repetitions).toBe(0);
    });

    it('EF is capped at minimum 1.3', () => {
      const state: SM2State = { easeFactor: 1.3, interval: 1, repetitions: 0, nextReview: new Date() };
      const result = service.calculateNextReview(state, 0);
      expect(result.easeFactor).toBeCloseTo(1.3, 2);
    });

    it('EF does not go below 1.3 even when formula produces lower value', () => {
      const state: SM2State = { easeFactor: 1.31, interval: 1, repetitions: 0, nextReview: new Date() };
      const result = service.calculateNextReview(state, 0);
      expect(result.easeFactor).toBeGreaterThanOrEqual(1.3);
    });

    it('nextReview is approximately today+interval days', () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-06-24T12:00:00Z'));
      const state: SM2State = { easeFactor: 2.5, interval: 1, repetitions: 1, nextReview: new Date() };
      const result = service.calculateNextReview(state, 5);
      const expectedDate = addDays(new Date(), 6); // second attempt → interval=6
      expect(result.nextReview.toDateString()).toBe(expectedDate.toDateString());
      jest.useRealTimers();
    });
  });
});
```

---

## File 2: puzzle-rating.service.spec.ts

The Glicko-2 implementation uses the following steps (implement these in PuzzleRatingService):
1. Convert r and RD to Glicko-2 scale: μ = (r - 1500) / 173.7178, φ = RD / 173.7178
2. Compute g(φ_j) = 1 / sqrt(1 + 3 * φ_j^2 / π^2)
3. Compute E(s|μ, μ_j, φ_j) = 1 / (1 + exp(-g(φ_j) * (μ - μ_j)))
4. Compute d^2 = 1 / (g(φ_j)^2 * E * (1 - E))
5. Compute new rating and RD

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { PuzzleRatingService } from './puzzle-rating.service';
import { PrismaService } from '../prisma/prisma.service';

describe('PuzzleRatingService', () => {
  let service: PuzzleRatingService;
  let mockPrisma: any;

  beforeEach(async () => {
    mockPrisma = {
      puzzle: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      userPuzzleRating: {
        findUnique: jest.fn(),
        upsert: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PuzzleRatingService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<PuzzleRatingService>(PuzzleRatingService);
  });

  describe('updateRatings', () => {
    it('user rating increases when they solve a puzzle', async () => {
      mockPrisma.puzzle.findUnique.mockResolvedValue({ id: 'P1', rating: 1500, ratingDeviation: 200, volatility: 0.06 });
      mockPrisma.userPuzzleRating.findUnique.mockResolvedValue({ userId: 'U1', rating: 1500, ratingDeviation: 200, volatility: 0.06 });
      mockPrisma.puzzle.update.mockResolvedValue({});
      mockPrisma.userPuzzleRating.upsert.mockResolvedValue({});

      const delta = await service.updateRatings('P1', 'U1', true);

      expect(delta.userRatingAfter).toBeGreaterThan(delta.userRatingBefore);
    });

    it('user rating decreases when they fail a puzzle', async () => {
      mockPrisma.puzzle.findUnique.mockResolvedValue({ id: 'P1', rating: 1500, ratingDeviation: 200, volatility: 0.06 });
      mockPrisma.userPuzzleRating.findUnique.mockResolvedValue({ userId: 'U1', rating: 1500, ratingDeviation: 200, volatility: 0.06 });
      mockPrisma.puzzle.update.mockResolvedValue({});
      mockPrisma.userPuzzleRating.upsert.mockResolvedValue({});

      const delta = await service.updateRatings('P1', 'U1', false);

      expect(delta.userRatingAfter).toBeLessThan(delta.userRatingBefore);
    });

    it('puzzle rating decreases when user solves it (puzzle was too easy)', async () => {
      mockPrisma.puzzle.findUnique.mockResolvedValue({ id: 'P1', rating: 1500, ratingDeviation: 200, volatility: 0.06 });
      mockPrisma.userPuzzleRating.findUnique.mockResolvedValue({ userId: 'U1', rating: 1500, ratingDeviation: 200, volatility: 0.06 });
      mockPrisma.puzzle.update.mockResolvedValue({});
      mockPrisma.userPuzzleRating.upsert.mockResolvedValue({});

      const delta = await service.updateRatings('P1', 'U1', true);

      expect(delta.puzzleRatingAfter).toBeLessThan(delta.puzzleRatingBefore);
    });

    it('uses default 1500/350 rating for new user with no prior puzzle rating', async () => {
      mockPrisma.puzzle.findUnique.mockResolvedValue({ id: 'P1', rating: 1500, ratingDeviation: 200, volatility: 0.06 });
      mockPrisma.userPuzzleRating.findUnique.mockResolvedValue(null); // new user
      mockPrisma.puzzle.update.mockResolvedValue({});
      mockPrisma.userPuzzleRating.upsert.mockResolvedValue({});

      const delta = await service.updateRatings('P1', 'U1', true);

      expect(delta.userRatingBefore).toBe(1500);
    });

    it('equal ratings, solved: user gains ~10-25 rating points', async () => {
      mockPrisma.puzzle.findUnique.mockResolvedValue({ id: 'P1', rating: 1500, ratingDeviation: 80, volatility: 0.06 });
      mockPrisma.userPuzzleRating.findUnique.mockResolvedValue({ rating: 1500, ratingDeviation: 80, volatility: 0.06 });
      mockPrisma.puzzle.update.mockResolvedValue({});
      mockPrisma.userPuzzleRating.upsert.mockResolvedValue({});

      const delta = await service.updateRatings('P1', 'U1', true);
      const gain = delta.userRatingAfter - delta.userRatingBefore;

      expect(gain).toBeGreaterThan(0);
      expect(gain).toBeLessThan(50); // sanity check: single game can't swing too much with low RD
    });
  });
});
```

---

## File 3: puzzles.service.spec.ts

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { PuzzlesService } from './puzzles.service';
import { PrismaService } from '../prisma/prisma.service';
import { SpacedRepetitionService } from './spaced-repetition.service';
import { PuzzleRatingService } from './puzzle-rating.service';
import { NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { getRedisToken } from '@liaoliaots/nestjs-redis'; // or your Redis provider token

const mockPuzzle = { id: 'TEST001', fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -', moves: 'e2e4 d7d5', rating: 1500, ratingDeviation: 80, themes: ['fork'], openingTags: [] };

describe('PuzzlesService', () => {
  let service: PuzzlesService;
  let mockPrisma: any;
  let mockRedis: any;

  beforeEach(async () => {
    mockPrisma = {
      userPuzzleAttempt: { findFirst: jest.fn(), upsert: jest.fn(), count: jest.fn(), findMany: jest.fn(), aggregate: jest.fn() },
      puzzle: { findUnique: jest.fn(), findFirst: jest.fn(), findMany: jest.fn(), count: jest.fn() },
      $queryRaw: jest.fn(),
    };
    mockRedis = { get: jest.fn(), setex: jest.fn(), hgetall: jest.fn(), hset: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PuzzlesService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: SpacedRepetitionService, useValue: { calculateNextReview: jest.fn().mockReturnValue({ easeFactor: 2.6, interval: 1, repetitions: 1, nextReview: new Date(Date.now() + 86400000) }) } },
        { provide: PuzzleRatingService, useValue: { updateRatings: jest.fn().mockResolvedValue({ userRatingBefore: 1500, userRatingAfter: 1512, puzzleRatingBefore: 1500, puzzleRatingAfter: 1488 }) } },
        { provide: 'default_IORedisModuleConnectionToken', useValue: mockRedis },
      ],
    }).compile();

    service = module.get<PuzzlesService>(PuzzlesService);
  });

  describe('getNextPuzzle', () => {
    it('returns due puzzle from SM-2 queue when one exists', async () => {
      mockPrisma.userPuzzleAttempt.findFirst.mockResolvedValue({ puzzleId: 'TEST001', ...mockPuzzle, puzzle: mockPuzzle });
      mockPrisma.puzzle.findUnique.mockResolvedValue(mockPuzzle);

      const result = await service.getNextPuzzle('user-1');

      expect(result.source).toBe('due');
      expect(result.puzzle.id).toBe('TEST001');
    });

    it('falls back to random unseen puzzle when no due puzzles', async () => {
      mockPrisma.userPuzzleAttempt.findFirst.mockResolvedValue(null); // no due puzzles
      mockPrisma.$queryRaw.mockResolvedValue([mockPuzzle]); // random unseen puzzle

      const result = await service.getNextPuzzle('user-1');

      expect(result.source).toBe('new');
    });

    it('throws NotFoundException when no puzzles available at all', async () => {
      mockPrisma.userPuzzleAttempt.findFirst.mockResolvedValue(null);
      mockPrisma.$queryRaw.mockResolvedValue([]);

      await expect(service.getNextPuzzle('user-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('getDailyPuzzle', () => {
    it('returns puzzle from Redis cache', async () => {
      mockRedis.get.mockResolvedValue('TEST001');
      mockPrisma.puzzle.findUnique.mockResolvedValue(mockPuzzle);

      const result = await service.getDailyPuzzle();

      expect(result.id).toBe('TEST001');
      expect(mockRedis.get).toHaveBeenCalledWith('puzzle:daily');
    });

    it('falls back to random puzzle when Redis is empty', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockPrisma.puzzle.findFirst.mockResolvedValue(mockPuzzle);

      const result = await service.getDailyPuzzle();

      expect(result.id).toBe('TEST001');
      expect(mockRedis.setex).not.toHaveBeenCalled(); // fallback does not set Redis
    });

    it('throws ServiceUnavailableException when no puzzle found', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockPrisma.puzzle.findFirst.mockResolvedValue(null);

      await expect(service.getDailyPuzzle()).rejects.toThrow(ServiceUnavailableException);
    });
  });
});
```

---

## File 4: test/puzzles.e2e-spec.ts

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Puzzles (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let accessToken: string;
  let userId: string;

  const TEST_PUZZLES = [
    { id: 'ETEST01', fen: 'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq -', moves: 'd8f6 f3g5 f6f2', rating: 1200, ratingDeviation: 80, themes: ['fork'], openingTags: [] },
    { id: 'ETEST02', fen: 'rnbqkb1r/pppp1ppp/5n2/4p3/2B1P3/8/PPPP1PPP/RNBQK1NR w KQkq -', moves: 'd1h5 f6e4 h5f7', rating: 1500, ratingDeviation: 80, themes: ['pin'], openingTags: [] },
    { id: 'ETEST03', fen: '6k1/5ppp/8/8/8/8/5PPP/R5K1 w - -', moves: 'a1a8', rating: 1800, ratingDeviation: 80, themes: ['mateIn2'], openingTags: [] },
  ];

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();

    prisma = moduleFixture.get<PrismaService>(PrismaService);

    // Seed test puzzles
    await prisma.puzzle.createMany({ data: TEST_PUZZLES, skipDuplicates: true });

    // Create test user and get JWT
    const registerRes = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: 'puzzle-tester@test.com', username: 'puzzletester', password: 'TestPass123!' });

    userId = registerRes.body.user.id;

    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'puzzle-tester@test.com', password: 'TestPass123!' });

    accessToken = loginRes.body.accessToken;
  });

  afterAll(async () => {
    await prisma.userPuzzleAttempt.deleteMany({ where: { userId } });
    await prisma.puzzle.deleteMany({ where: { id: { in: TEST_PUZZLES.map(p => p.id) } } });
    await prisma.user.delete({ where: { id: userId } });
    await app.close();
  });

  describe('GET /puzzles/daily', () => {
    it('returns 200 with a puzzle (no auth required)', async () => {
      const res = await request(app.getHttpServer()).get('/puzzles/daily');
      expect(res.status).toBe(200);
      expect(res.body.fen).toBeDefined();
      expect(res.body.moves).toBeDefined();
    });
  });

  describe('GET /puzzles/:id', () => {
    it('returns 200 with the correct puzzle', async () => {
      const res = await request(app.getHttpServer()).get('/puzzles/ETEST01');
      expect(res.status).toBe(200);
      expect(res.body.id).toBe('ETEST01');
      expect(res.body.themes).toContain('fork');
    });

    it('returns 404 for unknown puzzle id', async () => {
      const res = await request(app.getHttpServer()).get('/puzzles/NONEXISTENT');
      expect(res.status).toBe(404);
    });
  });

  describe('GET /puzzles?theme=fork', () => {
    it('returns only puzzles with the fork theme (GIN index)', async () => {
      const res = await request(app.getHttpServer()).get('/puzzles?theme=fork');
      expect(res.status).toBe(200);
      expect(res.body.data.every((p: any) => p.themes.includes('fork'))).toBe(true);
      expect(res.body.data.some((p: any) => p.id === 'ETEST01')).toBe(true);
    });
  });

  describe('POST /puzzles/:id/attempt', () => {
    it('returns 401 without JWT', async () => {
      const res = await request(app.getHttpServer())
        .post('/puzzles/ETEST01/attempt')
        .send({ solved: true, timeTaken: 5000 });
      expect(res.status).toBe(401);
    });

    it('records attempt and returns SM-2 state + rating delta (solved)', async () => {
      const res = await request(app.getHttpServer())
        .post('/puzzles/ETEST01/attempt')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ solved: true, timeTaken: 8000 }); // < 10s → quality 5

      expect(res.status).toBe(201);
      expect(res.body.nextReview).toBeDefined();
      expect(res.body.ratingDelta.userRatingAfter).toBeGreaterThan(res.body.ratingDelta.userRatingBefore);
      expect(res.body.quality).toBe(5);
      expect(res.body.sm2State.repetitions).toBe(1);
      expect(res.body.sm2State.interval).toBe(1);
    });

    it('UserPuzzleAttempt row exists in DB after attempt', async () => {
      const attempt = await prisma.userPuzzleAttempt.findUnique({
        where: { userId_puzzleId: { userId, puzzleId: 'ETEST01' } },
      });
      expect(attempt).not.toBeNull();
      expect(attempt!.solved).toBe(true);
      expect(attempt!.repetitions).toBe(1);
      expect(attempt!.nextReview.getTime()).toBeGreaterThan(Date.now());
    });
  });
});
```

---

## Mock Setup Notes

- Use `jest.useFakeTimers()` when testing `nextReview` date precision
- For Glicko-2 math, assert with `toBeCloseTo(expected, 0)` (integer precision)
- For SM-2 easeFactor, assert with `toBeCloseTo(expected, 2)` (2 decimal places)
- Redis mock should be injected via the module token matching your `@InjectRedis()` decorator
- Set `NODE_ENV=test` and use a separate test database via `.env.test`
