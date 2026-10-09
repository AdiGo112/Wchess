import { ConflictException, ForbiddenException, Logger, NotFoundException } from '@nestjs/common';
import { MatchmakingService } from './matchmaking.service';
import { QueueEntry } from './types/queue-entry.interface';

Logger.overrideLogger(false);

/** Just the Redis list ops the queue uses, with real LPUSH/LREM semantics. */
function fakeRedis() {
  const lists = new Map<string, string[]>();
  const list = (k: string) => lists.get(k) ?? (lists.set(k, []), lists.get(k)!);
  return {
    lists,
    lpush: jest.fn(async (k: string, v: string) => list(k).unshift(v)),
    lrange: jest.fn(async (k: string) => [...list(k)]),
    lrem: jest.fn(async (k: string, count: number, v: string) => {
      const l = list(k);
      let removed = 0;
      for (let i = 0; i < l.length && (count === 0 || removed < count); ) {
        if (l[i] === v) { l.splice(i, 1); removed++; } else i++;
      }
      return removed;
    }),
    get: jest.fn(async () => null),
  };
}

function setup() {
  const redis = fakeRedis();
  const games = { createRoom: jest.fn(async (..._args: any[]) => ({ id: 'ROOM' })), createComputerRoom: jest.fn(async () => ({ id: 'CPU' })) };
  const prisma = {
    user: { findUnique: jest.fn(async ({ where }) => ({ username: `user-${where.id}` })) },
    userRating: { findUnique: jest.fn(async () => null) },
    challenge: {
      findUnique: jest.fn(),
      update: jest.fn(async () => ({})),
      updateMany: jest.fn(async () => ({ count: 1 })),
      deleteMany: jest.fn(async () => ({ count: 0 })),
      create: jest.fn(async (..._args: any[]) => ({})),
    },
  };
  const emitted: { to: string; event: string; data: any }[] = [];
  const svc = new MatchmakingService(redis as any, prisma as any, games as any);
  svc.setServer({ to: (to: string) => ({ emit: (event: string, data: any) => emitted.push({ to, event, data }) }) } as any);
  return { svc, redis, games, prisma, emitted };
}

const entry = (userId: string, rating: number, waitedMs = 0, timeControl = 180): QueueEntry => ({
  userId, username: userId, rating, socketId: `sock-${userId}`, enqueuedAt: Date.now() - waitedMs,
  variant: 'blitz', timeControl, increment: 0,
});

describe('MatchmakingService — rating tolerance (ADR-0008)', () => {
  it('starts at ±50, widens 12/s, caps at ±400', () => {
    const { svc } = setup();
    expect(svc.toleranceForWait(0)).toBe(50);
    expect(svc.toleranceForWait(10_000)).toBe(170);
    expect(svc.toleranceForWait(60_000)).toBe(400);
    expect(svc.toleranceForWait(-5_000)).toBe(50); // clock skew never narrows it
  });
});

describe('MatchmakingService — queue', () => {
  it('a player is only ever in one queue', async () => {
    const { svc, redis } = setup();
    await svc.enqueue(entry('a', 1200, 0, 180));
    await svc.enqueue(entry('a', 1200, 0, 600));
    await svc.enqueue(entry('a', 1200, 0, 600)); // rejoining doesn't duplicate
    expect(redis.lists.get('queue:blitz:180')).toEqual([]);
    expect(redis.lists.get('queue:blitz:600')).toHaveLength(1);
    expect(await svc.isQueued('a', 'blitz', 600)).toBe(true);
  });

  it('reports queue status and clears it on dequeue', async () => {
    const { svc } = setup();
    await svc.enqueue(entry('a', 1200));
    expect(await svc.getQueueStatus('a')).toEqual({ inQueue: true, variant: 'blitz', timeControl: 180, position: 1 });
    await svc.dequeue('a', 'blitz', 180);
    expect((await svc.getQueueStatus('a')).inQueue).toBe(false);
  });

  it('pairs two close-rated players and tells both', async () => {
    const { svc, redis, games, emitted } = setup();
    await svc.enqueue(entry('a', 1200));
    await svc.enqueue(entry('b', 1240));
    await (svc as any).poll();

    expect(games.createRoom).toHaveBeenCalledTimes(1);
    expect(redis.lists.get('queue:blitz:180')).toEqual([]);
    const found = emitted.filter((e) => e.event === 'match_found');
    expect(found.map((e) => e.to).sort()).toEqual(['sock-a', 'sock-b']);
    expect(found.map((e) => e.data.color).sort()).toEqual(['black', 'white']);
  });

  it('keeps far-apart players waiting until their tolerance widens', async () => {
    const { svc, games } = setup();
    await svc.enqueue(entry('a', 1200));
    await svc.enqueue(entry('b', 1500));
    await (svc as any).poll();
    expect(games.createRoom).not.toHaveBeenCalled();
  });

  it('uses the stricter of the two tolerances', async () => {
    const { svc, games } = setup();
    await svc.enqueue(entry('a', 1200, 60_000)); // ±400 after a minute
    await svc.enqueue(entry('b', 1500, 0)); // just joined: ±50
    await (svc as any).poll();
    expect(games.createRoom).not.toHaveBeenCalled();
  });

  it('does not pair across time controls', async () => {
    const { svc, games } = setup();
    await svc.enqueue(entry('a', 1200, 0, 180));
    await svc.enqueue(entry('b', 1200, 0, 300));
    await (svc as any).poll();
    expect(games.createRoom).not.toHaveBeenCalled();
  });

  it('puts both players back if the room cannot be created', async () => {
    const { svc, redis, games, emitted } = setup();
    games.createRoom.mockRejectedValueOnce(new Error('redis down'));
    await svc.enqueue(entry('a', 1200));
    await svc.enqueue(entry('b', 1200));
    await (svc as any).poll();
    expect(redis.lists.get('queue:blitz:180')).toHaveLength(2);
    expect(emitted.filter((e) => e.event === 'match_found')).toHaveLength(0);
  });
});

describe('MatchmakingService — friend challenges', () => {
  const pending = (over = {}) => ({
    token: 't', creatorId: 'creator', status: 'pending', creatorColor: 'white',
    timeControl: 300, increment: 0, expiresAt: new Date(Date.now() + 60_000), ...over,
  });

  it('creates a share link with a derived variant', async () => {
    const { svc, prisma } = setup();
    const res = await svc.createChallenge('creator', { timeControl: 60 } as any);
    expect(res.shareUrl).toMatch(/\/challenge\/[0-9a-f]{32}$/);
    expect(prisma.challenge.create.mock.calls[0][0].data.variant).toBe('bullet');
  });

  it('accepting honours the creator\'s color and notifies them', async () => {
    const { svc, prisma, games } = setup();
    prisma.challenge.findUnique.mockResolvedValue(pending({ creatorColor: 'black' }));
    const res = await svc.acceptChallenge('t', 'friend');
    expect(res).toEqual({ gameId: 'ROOM', color: 'white', timeControl: 300 });
    expect(games.createRoom.mock.calls[0][0].id).toBe('friend');
  });

  it.each([
    ['missing', null, 'friend', NotFoundException],
    ['expired', pending({ expiresAt: new Date(Date.now() - 1) }), 'friend', NotFoundException],
    ['already accepted', pending({ status: 'accepted' }), 'friend', ConflictException],
    ['your own', pending(), 'creator', ForbiddenException],
  ])('refuses a %s challenge', async (_label, row, accepter, error) => {
    const { svc, prisma, games } = setup();
    prisma.challenge.findUnique.mockResolvedValue(row);
    await expect(svc.acceptChallenge('t', accepter as string)).rejects.toBeInstanceOf(error);
    expect(games.createRoom).not.toHaveBeenCalled();
  });

  it('loses the race cleanly when someone else claimed it first', async () => {
    const { svc, prisma, games } = setup();
    prisma.challenge.findUnique.mockResolvedValue(pending());
    prisma.challenge.updateMany.mockResolvedValue({ count: 0 });
    await expect(svc.acceptChallenge('t', 'friend')).rejects.toBeInstanceOf(ConflictException);
    expect(games.createRoom).not.toHaveBeenCalled();
  });

  it('releases the claim if the room cannot be created', async () => {
    const { svc, prisma, games } = setup();
    prisma.challenge.findUnique.mockResolvedValue(pending());
    games.createRoom.mockRejectedValueOnce(new Error('boom'));
    await expect(svc.acceptChallenge('t', 'friend')).rejects.toThrow('boom');
    expect(prisma.challenge.update).toHaveBeenCalledWith({ where: { token: 't' }, data: { status: 'pending' } });
  });
});
