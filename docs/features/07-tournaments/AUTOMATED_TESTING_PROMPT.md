# Automated Testing Prompt — Feature 07: Tournaments

## Purpose

This document is a self-contained prompt you can paste into a fresh AI session to generate
the full test suite for the Tournaments feature. Paste everything from "BEGIN PROMPT" to
"END PROMPT" into the session, then follow the verification steps at the bottom.

---

## BEGIN PROMPT

You are writing tests for a NestJS + TypeScript chess application. The Tournaments feature
exposes REST endpoints, a BullMQ processor, and Socket.io events. Write all tests described
below using the exact patterns shown. Do not add placeholder comments — write real assertions.

### Tech Stack

- NestJS 10, Jest 29, Supertest, @nestjs/testing createTestingModule
- Prisma Client mocked with jest.fn() (manual mocks via jest.mock)
- Redis mocked with ioredis-mock
- BullMQ Queue mocked via jest.mock('bullmq')
- Socket.io server injected as a NestJS provider named 'SOCKET_IO'

### File Layout

```
backend/src/tournaments/
  tournaments.service.spec.ts          <- unit tests for TournamentsService
  tournaments.controller.spec.ts       <- controller-level unit tests
  round-advancement.processor.spec.ts  <- BullMQ processor unit tests
backend/test/
  tournaments.e2e-spec.ts              <- e2e via Supertest
  tournament-socket.e2e-spec.ts        <- Socket.io event tests
```

---

### 1. Unit Tests — TournamentsService (tournaments.service.spec.ts)

#### Setup

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { TournamentsService } from './tournaments.service';
import { PrismaService } from '../prisma/prisma.service';
import { getQueueToken } from '@nestjs/bullmq';
import { ConflictException, BadRequestException } from '@nestjs/common';

const mockPrisma = {
  tournament: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
  tournamentPlayer: {
    create: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
  tournamentGame: {
    create: jest.fn(),
    createMany: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
  },
};

const mockQueue = { add: jest.fn() };
const mockSocketIo = { emit: jest.fn() };

let service: TournamentsService;

beforeEach(async () => {
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      TournamentsService,
      { provide: PrismaService, useValue: mockPrisma },
      { provide: getQueueToken('tournament-rounds'), useValue: mockQueue },
      { provide: 'SOCKET_IO', useValue: mockSocketIo },
    ],
  }).compile();

  service = module.get<TournamentsService>(TournamentsService);
  jest.clearAllMocks();
});
```

#### Test group: pairRound()

```typescript
describe('pairRound()', () => {
  it('pairs 4 players into 2 games with no bye (even count)', async () => {
    // Players sorted by points desc: p1(3), p2(2), p3(1), p4(0)
    const players = [
      { userId: 'p1', points: 3, tiebreak: 0, byeRound: null, eliminated: false },
      { userId: 'p2', points: 2, tiebreak: 0, byeRound: null, eliminated: false },
      { userId: 'p3', points: 1, tiebreak: 0, byeRound: null, eliminated: false },
      { userId: 'p4', points: 0, tiebreak: 0, byeRound: null, eliminated: false },
    ];
    mockPrisma.tournamentPlayer.findMany.mockResolvedValue(players);
    mockPrisma.tournamentGame.findMany.mockResolvedValue([]); // no prior games
    mockPrisma.tournamentGame.createMany.mockResolvedValue({ count: 2 });

    const result = await service.pairRound('tournament-1', 2);

    expect(result.games).toHaveLength(2);
    expect(result.byePlayerId).toBeNull();
    // Top pairing: p1 vs p2
    expect(result.games[0]).toMatchObject({ whiteId: 'p1', blackId: 'p2', round: 2 });
    // Second pairing: p3 vs p4
    expect(result.games[1]).toMatchObject({ whiteId: 'p3', blackId: 'p4', round: 2 });
    expect(mockPrisma.tournamentGame.createMany).toHaveBeenCalledTimes(1);
  });

  it('assigns bye to lowest-ranked player who has no prior bye (odd count = 3)', async () => {
    const players = [
      { userId: 'p1', points: 2, tiebreak: 0, byeRound: null, eliminated: false },
      { userId: 'p2', points: 1, tiebreak: 0, byeRound: null, eliminated: false },
      { userId: 'p3', points: 0, tiebreak: 0, byeRound: null, eliminated: false },
    ];
    mockPrisma.tournamentPlayer.findMany.mockResolvedValue(players);
    mockPrisma.tournamentGame.findMany.mockResolvedValue([]);
    mockPrisma.tournamentGame.createMany.mockResolvedValue({ count: 1 });
    mockPrisma.tournamentPlayer.update.mockResolvedValue({});

    const result = await service.pairRound('tournament-1', 2);

    expect(result.games).toHaveLength(1);
    expect(result.byePlayerId).toBe('p3');
    // Bye player earns 1 point and their byeRound is recorded
    expect(mockPrisma.tournamentPlayer.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tournamentId_userId: { tournamentId: 'tournament-1', userId: 'p3' } },
        data: expect.objectContaining({
          byeRound: 2,
          points: { increment: 1 },
        }),
      }),
    );
  });

  it('does not assign a second bye to a player who already received one', async () => {
    // p3 already has byeRound=1; bye must go to p2 instead
    const players = [
      { userId: 'p1', points: 2, tiebreak: 0, byeRound: null, eliminated: false },
      { userId: 'p2', points: 1, tiebreak: 0, byeRound: null, eliminated: false },
      { userId: 'p3', points: 1, tiebreak: 0, byeRound: 1,    eliminated: false },
    ];
    mockPrisma.tournamentPlayer.findMany.mockResolvedValue(players);
    mockPrisma.tournamentGame.findMany.mockResolvedValue([]);
    mockPrisma.tournamentGame.createMany.mockResolvedValue({ count: 1 });
    mockPrisma.tournamentPlayer.update.mockResolvedValue({});

    const result = await service.pairRound('tournament-1', 2);

    expect(result.byePlayerId).toBe('p2');
  });

  it('avoids repeat pairings when an alternative exists', async () => {
    // Round 1 already had p1 vs p2. Round 2 should not repeat that pair.
    const players = [
      { userId: 'p1', points: 1, tiebreak: 0, byeRound: null, eliminated: false },
      { userId: 'p2', points: 1, tiebreak: 0, byeRound: null, eliminated: false },
      { userId: 'p3', points: 0, tiebreak: 0, byeRound: null, eliminated: false },
      { userId: 'p4', points: 0, tiebreak: 0, byeRound: null, eliminated: false },
    ];
    const existingGames = [{ whiteId: 'p1', blackId: 'p2', round: 1 }];
    mockPrisma.tournamentPlayer.findMany.mockResolvedValue(players);
    mockPrisma.tournamentGame.findMany.mockResolvedValue(existingGames);
    mockPrisma.tournamentGame.createMany.mockResolvedValue({ count: 2 });

    const result = await service.pairRound('tournament-1', 2);

    const p1game = result.games.find(
      (g: any) => g.whiteId === 'p1' || g.blackId === 'p1',
    );
    const p1opponent =
      p1game?.whiteId === 'p1' ? p1game.blackId : p1game?.whiteId;
    expect(p1opponent).not.toBe('p2');
  });

  it('skips eliminated players when building pairings', async () => {
    const players = [
      { userId: 'p1', points: 2, tiebreak: 0, byeRound: null, eliminated: false },
      { userId: 'p2', points: 1, tiebreak: 0, byeRound: null, eliminated: true }, // eliminated
      { userId: 'p3', points: 0, tiebreak: 0, byeRound: null, eliminated: false },
      { userId: 'p4', points: 0, tiebreak: 0, byeRound: null, eliminated: false },
    ];
    mockPrisma.tournamentPlayer.findMany.mockResolvedValue(players);
    mockPrisma.tournamentGame.findMany.mockResolvedValue([]);
    mockPrisma.tournamentGame.createMany.mockResolvedValue({ count: 1 });

    const result = await service.pairRound('tournament-1', 2);

    const allIds = result.games.flatMap((g: any) =>
      [g.whiteId, g.blackId].filter(Boolean),
    );
    expect(allIds).not.toContain('p2');
  });
});
```

#### Test group: joinTournament()

```typescript
describe('joinTournament()', () => {
  it('throws ConflictException (409) when user already joined', async () => {
    mockPrisma.tournament.findUnique.mockResolvedValue({
      id: 't1', status: 'WAITING', currentPlayers: 3, maxPlayers: 8,
    });
    mockPrisma.tournamentPlayer.findUnique.mockResolvedValue({ id: 'existing-player-row' });

    await expect(service.joinTournament('t1', 'user1')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('throws ConflictException (409) when tournament is full', async () => {
    mockPrisma.tournament.findUnique.mockResolvedValue({
      id: 't1', status: 'WAITING', currentPlayers: 8, maxPlayers: 8,
    });
    mockPrisma.tournamentPlayer.findUnique.mockResolvedValue(null);

    await expect(service.joinTournament('t1', 'user1')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('throws BadRequestException (400) when tournament is not WAITING', async () => {
    mockPrisma.tournament.findUnique.mockResolvedValue({
      id: 't1', status: 'ACTIVE', currentPlayers: 4, maxPlayers: 8,
    });
    mockPrisma.tournamentPlayer.findUnique.mockResolvedValue(null);

    await expect(service.joinTournament('t1', 'user1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('creates TournamentPlayer row and increments currentPlayers on success', async () => {
    mockPrisma.tournament.findUnique.mockResolvedValue({
      id: 't1', status: 'WAITING', currentPlayers: 2, maxPlayers: 8,
    });
    mockPrisma.tournamentPlayer.findUnique.mockResolvedValue(null);
    mockPrisma.tournamentPlayer.create.mockResolvedValue({ id: 'new-tp' });
    mockPrisma.tournament.update.mockResolvedValue({});

    await service.joinTournament('t1', 'user1');

    expect(mockPrisma.tournamentPlayer.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ tournamentId: 't1', userId: 'user1' }),
      }),
    );
    expect(mockPrisma.tournament.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ currentPlayers: { increment: 1 } }),
      }),
    );
  });
});
```

#### Test group: startTournament()

```typescript
describe('startTournament()', () => {
  it('throws BadRequestException when fewer than 2 players have joined', async () => {
    mockPrisma.tournament.findUnique.mockResolvedValue({
      id: 't1', status: 'WAITING', organizerId: 'org1', currentPlayers: 1, rounds: 3,
    });

    await expect(service.startTournament('t1', 'org1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('sets status to ACTIVE, sets currentRound=1, and enqueues BullMQ check job', async () => {
    mockPrisma.tournament.findUnique.mockResolvedValue({
      id: 't1', status: 'WAITING', organizerId: 'org1', currentPlayers: 4, rounds: 3,
    });
    mockPrisma.tournament.update.mockResolvedValue({ id: 't1', status: 'ACTIVE', currentRound: 1 });
    mockPrisma.tournamentPlayer.findMany.mockResolvedValue([
      { userId: 'p1', points: 0, tiebreak: 0, byeRound: null, eliminated: false },
      { userId: 'p2', points: 0, tiebreak: 0, byeRound: null, eliminated: false },
      { userId: 'p3', points: 0, tiebreak: 0, byeRound: null, eliminated: false },
      { userId: 'p4', points: 0, tiebreak: 0, byeRound: null, eliminated: false },
    ]);
    mockPrisma.tournamentGame.findMany.mockResolvedValue([]);
    mockPrisma.tournamentGame.createMany.mockResolvedValue({ count: 2 });

    await service.startTournament('t1', 'org1');

    expect(mockPrisma.tournament.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 't1' },
        data: expect.objectContaining({ status: 'ACTIVE', currentRound: 1 }),
      }),
    );
    expect(mockQueue.add).toHaveBeenCalledWith(
      'check-round-complete',
      expect.objectContaining({ tournamentId: 't1', round: 1 }),
      expect.objectContaining({ delay: expect.any(Number) }),
    );
  });
});
```

---

### 2. E2E Integration Tests (tournaments.e2e-spec.ts)

```typescript
import * as request from 'supertest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { generateJwt } from './helpers/auth.helper'; // signs HS256 with TEST_JWT_SECRET

describe('Tournaments REST API (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let organizerToken: string;
  let player2Token: string;
  let player3Token: string;
  let tournamentId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();
    prisma = moduleFixture.get<PrismaService>(PrismaService);

    const org = await prisma.user.create({
      data: { username: 'org_e2e', email: 'org_e2e@test.com', passwordHash: 'x' },
    });
    const p2 = await prisma.user.create({
      data: { username: 'p2_e2e', email: 'p2_e2e@test.com', passwordHash: 'x' },
    });
    const p3 = await prisma.user.create({
      data: { username: 'p3_e2e', email: 'p3_e2e@test.com', passwordHash: 'x' },
    });

    organizerToken = generateJwt({ sub: org.id, username: org.username });
    player2Token   = generateJwt({ sub: p2.id,  username: p2.username });
    player3Token   = generateJwt({ sub: p3.id,  username: p3.username });
  });

  afterAll(async () => {
    await prisma.tournamentGame.deleteMany();
    await prisma.tournamentPlayer.deleteMany();
    await prisma.tournament.deleteMany();
    await prisma.user.deleteMany({
      where: { email: { in: ['org_e2e@test.com', 'p2_e2e@test.com', 'p3_e2e@test.com'] } },
    });
    await app.close();
  });

  describe('POST /tournaments', () => {
    it('returns 401 without JWT', () =>
      request(app.getHttpServer())
        .post('/tournaments')
        .send({ name: 'Open', timeControl: '5+0', maxPlayers: 8, rounds: 3 })
        .expect(401),
    );

    it('returns 201 with tournament object', async () => {
      const res = await request(app.getHttpServer())
        .post('/tournaments')
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({ name: 'Test Open', timeControl: '5+0', maxPlayers: 8, rounds: 3, variant: 'standard' })
        .expect(201);

      expect(res.body).toMatchObject({
        id: expect.any(String),
        name: 'Test Open',
        status: 'WAITING',
        currentPlayers: 0,
        rounds: 3,
      });
      tournamentId = res.body.id;
    });

    it('returns 400 when rounds field is missing', () =>
      request(app.getHttpServer())
        .post('/tournaments')
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({ name: 'Bad', timeControl: '5+0', maxPlayers: 8 })
        .expect(400),
    );
  });

  describe('POST /tournaments/:id/join', () => {
    it('returns 200 and increments currentPlayers', async () => {
      await request(app.getHttpServer())
        .post(`/tournaments/${tournamentId}/join`)
        .set('Authorization', `Bearer ${player2Token}`)
        .expect(200);

      const t = await prisma.tournament.findUnique({ where: { id: tournamentId } });
      expect(t?.currentPlayers).toBe(1);
    });

    it('returns 409 on duplicate join', () =>
      request(app.getHttpServer())
        .post(`/tournaments/${tournamentId}/join`)
        .set('Authorization', `Bearer ${player2Token}`)
        .expect(409),
    );

    it('allows a second distinct user to join', () =>
      request(app.getHttpServer())
        .post(`/tournaments/${tournamentId}/join`)
        .set('Authorization', `Bearer ${player3Token}`)
        .expect(200),
    );
  });

  describe('POST /tournaments/:id/start', () => {
    it('returns 403 when called by non-organizer', () =>
      request(app.getHttpServer())
        .post(`/tournaments/${tournamentId}/start`)
        .set('Authorization', `Bearer ${player2Token}`)
        .expect(403),
    );

    it('returns 400 when only 1 player has joined (need >= 2)', async () => {
      const solo = await request(app.getHttpServer())
        .post('/tournaments')
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({ name: 'Solo', timeControl: '5+0', maxPlayers: 8, rounds: 3 })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/tournaments/${solo.body.id}/join`)
        .set('Authorization', `Bearer ${organizerToken}`)
        .expect(200);

      return request(app.getHttpServer())
        .post(`/tournaments/${solo.body.id}/start`)
        .set('Authorization', `Bearer ${organizerToken}`)
        .expect(400);
    });

    it('returns 200 and sets status ACTIVE with >= 2 players', async () => {
      // Organizer also joins so we have 3 players
      await request(app.getHttpServer())
        .post(`/tournaments/${tournamentId}/join`)
        .set('Authorization', `Bearer ${organizerToken}`)
        .expect(200);

      await request(app.getHttpServer())
        .post(`/tournaments/${tournamentId}/start`)
        .set('Authorization', `Bearer ${organizerToken}`)
        .expect(200);

      const t = await prisma.tournament.findUnique({ where: { id: tournamentId } });
      expect(t?.status).toBe('ACTIVE');
      expect(t?.currentRound).toBe(1);
    });
  });

  describe('GET /tournaments/:id/standings', () => {
    it('returns standings array with rank, points, tiebreak', async () => {
      const res = await request(app.getHttpServer())
        .get(`/tournaments/${tournamentId}/standings`)
        .set('Authorization', `Bearer ${organizerToken}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
      expect(res.body[0]).toHaveProperty('rank');
      expect(res.body[0]).toHaveProperty('points');
      expect(res.body[0]).toHaveProperty('tiebreak');
    });
  });
});
```

---

### 3. BullMQ Processor Unit Tests (round-advancement.processor.spec.ts)

```typescript
import { Test } from '@nestjs/testing';
import { RoundAdvancementProcessor } from './round-advancement.processor';
import { TournamentsService } from './tournaments.service';
import { PrismaService } from '../prisma/prisma.service';

const mockTournamentsService = {
  pairRound: jest.fn(),
  completeTournament: jest.fn(),
};

const mockPrisma = {
  tournament: { findUnique: jest.fn() },
  tournamentGame: { count: jest.fn() },
};

const mockSocketIo = { emit: jest.fn() };

let processor: RoundAdvancementProcessor;

beforeEach(async () => {
  const module = await Test.createTestingModule({
    providers: [
      RoundAdvancementProcessor,
      { provide: TournamentsService, useValue: mockTournamentsService },
      { provide: PrismaService, useValue: mockPrisma },
      { provide: 'SOCKET_IO', useValue: mockSocketIo },
    ],
  }).compile();

  processor = module.get<RoundAdvancementProcessor>(RoundAdvancementProcessor);
  jest.clearAllMocks();
});

const makeJob = (data: object) => ({ data, id: 'job-1', opts: {} } as any);

describe('RoundAdvancementProcessor.process()', () => {
  it('takes no action when not all round-1 games are complete', async () => {
    mockPrisma.tournament.findUnique.mockResolvedValue({
      id: 't1', status: 'ACTIVE', currentRound: 1, rounds: 3,
    });
    mockPrisma.tournamentGame.count
      .mockResolvedValueOnce(2)  // total games in round
      .mockResolvedValueOnce(1); // completed games in round

    await processor.process(makeJob({ tournamentId: 't1', round: 1 }));

    expect(mockTournamentsService.pairRound).not.toHaveBeenCalled();
    expect(mockTournamentsService.completeTournament).not.toHaveBeenCalled();
  });

  it('calls pairRound(tournamentId, 2) and emits tournamentRoundStarted when round 1 completes', async () => {
    mockPrisma.tournament.findUnique.mockResolvedValue({
      id: 't1', status: 'ACTIVE', currentRound: 1, rounds: 3,
    });
    mockPrisma.tournamentGame.count
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(2);
    mockTournamentsService.pairRound.mockResolvedValue({ games: [], byePlayerId: null });

    await processor.process(makeJob({ tournamentId: 't1', round: 1 }));

    expect(mockTournamentsService.pairRound).toHaveBeenCalledWith('t1', 2);
    expect(mockSocketIo.emit).toHaveBeenCalledWith(
      'tournamentRoundStarted',
      expect.objectContaining({ tournamentId: 't1', round: 2 }),
    );
  });

  it('calls completeTournament() when the final round finishes', async () => {
    mockPrisma.tournament.findUnique.mockResolvedValue({
      id: 't1', status: 'ACTIVE', currentRound: 3, rounds: 3,
    });
    mockPrisma.tournamentGame.count
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(2);

    await processor.process(makeJob({ tournamentId: 't1', round: 3 }));

    expect(mockTournamentsService.completeTournament).toHaveBeenCalledWith('t1');
    expect(mockTournamentsService.pairRound).not.toHaveBeenCalled();
  });

  it('returns early without DB calls when tournament status is not ACTIVE', async () => {
    mockPrisma.tournament.findUnique.mockResolvedValue({
      id: 't1', status: 'CANCELLED', currentRound: 1, rounds: 3,
    });

    await processor.process(makeJob({ tournamentId: 't1', round: 1 }));

    expect(mockPrisma.tournamentGame.count).not.toHaveBeenCalled();
    expect(mockTournamentsService.pairRound).not.toHaveBeenCalled();
  });

  it('is idempotent: returns early when job.round does not match tournament.currentRound', async () => {
    // Job was for round 1, but tournament has already advanced to round 2
    mockPrisma.tournament.findUnique.mockResolvedValue({
      id: 't1', status: 'ACTIVE', currentRound: 2, rounds: 3,
    });

    await processor.process(makeJob({ tournamentId: 't1', round: 1 }));

    expect(mockPrisma.tournamentGame.count).not.toHaveBeenCalled();
  });
});
```

---

### 4. Socket.io Event Tests (tournament-socket.e2e-spec.ts)

```typescript
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { io as ioClient, Socket } from 'socket.io-client';
import { AppModule } from '../src/app.module';
import { generateJwt } from './helpers/auth.helper';

describe('Tournament Socket.io Events', () => {
  let app: INestApplication;
  let client: Socket;
  const PORT = 3099;

  beforeAll(async () => {
    const fixture = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = fixture.createNestApplication();
    await app.listen(PORT);
  });

  afterAll(async () => {
    client?.disconnect();
    await app.close();
  });

  beforeEach((done) => {
    const token = generateJwt({ sub: 'spectator-id', username: 'spectator' });
    client = ioClient(`http://localhost:${PORT}`, {
      auth: { token },
      transports: ['websocket'],
    });
    client.on('connect', done);
  });

  afterEach(() => client.disconnect());

  it('receives tournamentRoundStarted when a new round begins', (done) => {
    client.on('tournamentRoundStarted', (payload: unknown) => {
      expect(payload).toMatchObject({
        tournamentId: expect.any(String),
        round: expect.any(Number),
      });
      done();
    });
    // Trigger via internal test helper
    client.emit('__test:triggerRoundStart', { tournamentId: 'test-t1', round: 2 });
  });

  it('receives tournamentGameStarted with full game context', (done) => {
    client.on('tournamentGameStarted', (payload: unknown) => {
      expect(payload).toMatchObject({
        tournamentId: expect.any(String),
        round: expect.any(Number),
        gameId: expect.any(String),
        whiteId: expect.any(String),
        blackId: expect.any(String),
      });
      done();
    });
    client.emit('__test:triggerGameStart', {
      tournamentId: 'test-t1',
      round: 1,
      gameId: 'game-abc',
      whiteId: 'p1',
      blackId: 'p2',
    });
  });
});
```

---

### Verification Steps

1. `cd backend && npx jest tournaments.service.spec.ts --no-coverage` — all unit tests green.
2. `npx jest round-advancement.processor.spec.ts --no-coverage` — processor tests green.
3. `npx jest --config jest-e2e.json tournaments.e2e-spec.ts` — REST e2e green.
4. Confirm pairRound with 5 players assigns bye to the lowest-ranked player with no prior bye.
5. Confirm 409 on duplicate join, 400 on start-with-one-player, 403 on non-organizer start.

## END PROMPT
