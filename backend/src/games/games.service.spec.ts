import { ActiveRoom, CLOCK_GRACE_MS, GamesService } from './games.service';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

function room(over: Partial<ActiveRoom> = {}): ActiveRoom {
  return {
    id: 'R', whitePlayer: { id: 'w', username: 'white', rating: 1200 },
    blackPlayer: { id: 'b', username: 'black', rating: 1200 }, fen: START, moves: [],
    timers: { white: 60_000, black: 60_000 }, lastMoveAt: 1_000, status: 'active',
    timeControl: 180, increment: 2, startedAt: Date.UTC(2026, 9, 9), drawOfferedBy: null,
    rematchRequestedBy: null, variant: 'BLITZ', version: 0, ...over,
  };
}

function setup() {
  const store = new Map<string, unknown>();
  const zset = new Map<string, number>();
  const redis = {
    getJson: jest.fn(async (k: string) => store.get(k) ?? null),
    setJson: jest.fn(async (k: string, v: unknown) => { store.set(k, v); }),
    del: jest.fn(async (k: string) => { store.delete(k); }),
    zadd: jest.fn(async (_k: string, score: number, m: string) => { zset.set(m, score); return 1; }),
    zrem: jest.fn(async (_k: string, m: string) => Number(zset.delete(m))),
    zrangebyscore: jest.fn(async () => [...zset.keys()]),
  };
  const prisma: any = {
    userRating: { findUnique: jest.fn(async () => null), upsert: jest.fn((x) => x) },
    game: { create: jest.fn((x) => ({ id: 'g1', ...x.data })) },
    $transaction: jest.fn(async (ops: any[]) => ops),
  };
  const leaderboard = { updateScore: jest.fn() };
  const svc = new GamesService(prisma, redis as any, leaderboard as any);
  return { svc, store, zset, prisma, leaderboard };
}

describe('GamesService — clock deadlines', () => {
  it('deadline = lastMoveAt + the side-to-move\'s budget + grace', async () => {
    const { svc, zset } = setup();
    await svc.setDeadline(room({ timers: { white: 5_000, black: 9_000 } }));
    expect(zset.get('R')).toBe(1_000 + 5_000 + CLOCK_GRACE_MS);

    await svc.setDeadline(room({ fen: START.replace(' w ', ' b '), timers: { white: 5_000, black: 9_000 } }));
    expect(zset.get('R')).toBe(1_000 + 9_000 + CLOCK_GRACE_MS);
  });

  it('deleting a room also stops its clock', async () => {
    const { svc, zset } = setup();
    await svc.setDeadline(room());
    await svc.deleteRoom('R');
    expect(zset.has('R')).toBe(false);
  });
});

describe('GamesService — liveGames', () => {
  it('lists only active rooms, newest first', async () => {
    const { svc, store, zset } = setup();
    const put = (r: ActiveRoom) => { store.set(svc.roomKey(r.id), r); zset.set(r.id, 0); };
    put(room({ id: 'OLD', startedAt: 1 }));
    put(room({ id: 'NEW', startedAt: 2, moves: ['e4'] }));
    put(room({ id: 'DONE', status: 'ended' }));
    zset.set('VANISHED', 0);

    const live = await svc.liveGames();
    expect(live.map((g) => g.id)).toEqual(['NEW', 'OLD']);
    expect(live[0].moveCount).toBe(1);
  });
});

describe('GamesService — saveCompletedGame', () => {
  it('writes the game, both ratings and the leaderboard, then drops the room', async () => {
    const { svc, prisma, leaderboard, store } = setup();
    const r = room({ moves: ['e4', 'e5', 'Nf3'] });
    store.set(svc.roomKey('R'), r);

    const res = await svc.saveCompletedGame({ room: r, result: 'WHITE', reason: 'RESIGNATION' });

    expect(res!.whiteRatingChange).toBeGreaterThan(0);
    expect(res!.blackRatingChange).toBe(-res!.whiteRatingChange);
    expect(prisma.$transaction.mock.calls[0][0]).toHaveLength(3); // game + 2 ratings, atomically
    expect(leaderboard.updateScore).toHaveBeenCalledWith('w', 'blitz', res!.newWhiteRating);
    expect(store.has(svc.roomKey('R'))).toBe(false);
  });

  it('builds a real PGN with headers and the opening', async () => {
    const { svc, prisma } = setup();
    await svc.saveCompletedGame({ room: room({ moves: ['e4', 'c5'] }), result: 'DRAW', reason: 'AGREEMENT' });
    const { pgn, openingEco, openingName } = prisma.game.create.mock.calls[0][0].data;
    expect(pgn).toContain('[White "white"]');
    expect(pgn).toContain('[TimeControl "180+2"]');
    expect(pgn).toContain('[Date "2026.10.09"]');
    expect(pgn).toContain('[Result "1/2-1/2"]');
    expect(pgn).toContain('1. e4 c5');
    expect([openingEco, openingName]).toEqual(['B20', 'Sicilian Defence']);
  });

  it('a corrupt move list still saves (PGN just stops early)', async () => {
    const { svc, prisma } = setup();
    await svc.saveCompletedGame({ room: room({ moves: ['e4', 'Qxz9'] }), result: 'BLACK', reason: 'TIMEOUT' });
    expect(prisma.game.create.mock.calls[0][0].data.pgn).toContain('1. e4 0-1');
  });

  it('aborted games are recorded but never rated', async () => {
    const { svc, prisma, leaderboard } = setup();
    await svc.saveCompletedGame({ room: room(), result: 'ABORTED', reason: 'ABANDONED' });
    expect(prisma.game.create).toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(leaderboard.updateScore).not.toHaveBeenCalled();
  });

  it('does nothing for a room that never had a second player', async () => {
    const { svc, prisma } = setup();
    expect(await svc.saveCompletedGame({ room: room({ blackPlayer: null }), result: 'WHITE', reason: 'X' })).toBeNull();
    expect(prisma.game.create).not.toHaveBeenCalled();
  });
});
