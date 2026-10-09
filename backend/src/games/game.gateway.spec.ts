import { Logger } from '@nestjs/common';
import { GameGateway } from './game.gateway';
import { ActiveRoom, CLOCK_GRACE_MS } from './games.service';

/**
 * In-memory GamesService with the same CAS contract as the Redis one: a save
 * only lands if the stored version still matches what the caller read.
 */
function fakeGames() {
  const rooms = new Map<string, string>();
  const deadlines = new Map<string, number>();
  const saved: { result: string; reason: string }[] = [];
  return {
    rooms,
    deadlines,
    saved,
    put(room: ActiveRoom) { rooms.set(room.id, JSON.stringify(room)); },
    read(id: string): ActiveRoom { return JSON.parse(rooms.get(id)!); },
    getRoom: jest.fn(async (id: string) => (rooms.has(id) ? JSON.parse(rooms.get(id)!) : null)),
    casSaveRoom: jest.fn(async (room: ActiveRoom) => {
      const cur = rooms.get(room.id);
      if (!cur || JSON.parse(cur).version !== room.version) return false;
      room.version++;
      rooms.set(room.id, JSON.stringify(room));
      return true;
    }),
    setDeadline: jest.fn(async (room: ActiveRoom) => {
      const side = room.fen.split(' ')[1] === 'w' ? 'white' : 'black';
      const at = room.lastMoveAt + room.timers[side] + CLOCK_GRACE_MS;
      deadlines.set(room.id, at);
      return at;
    }),
    clearDeadline: jest.fn(async (id: string) => { deadlines.delete(id); }),
    watchedRooms: jest.fn(async () => [...deadlines.keys()]),
    expiredRooms: jest.fn(async (now: number) => [...deadlines].filter(([, at]) => at <= now).map(([id]) => id)),
    nextDeadline: jest.fn(async () => (deadlines.size ? Math.min(...deadlines.values()) : null)),
    saveCompletedGame: jest.fn(async ({ result, reason }) => {
      saved.push({ result, reason });
      return { game: { id: 'g1' }, whiteRatingChange: 8, blackRatingChange: -8, newWhiteRating: 1208, newBlackRating: 1192 };
    }),
    createRoom: jest.fn(async () => ({ id: 'NEW' })),
  };
}

Logger.overrideLogger(false);

const W = { id: 'w', username: 'white', rating: 1200 };
const B = { id: 'b', username: 'black', rating: 1200 };
const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

function room(over: Partial<ActiveRoom> = {}): ActiveRoom {
  return {
    id: 'R', whitePlayer: W, blackPlayer: B, fen: START, moves: [],
    timers: { white: 60_000, black: 60_000 }, lastMoveAt: Date.now(), status: 'active',
    timeControl: 60, increment: 0, startedAt: Date.now(), drawOfferedBy: null,
    rematchRequestedBy: null, variant: 'BULLET', version: 0, ...over,
  };
}

function setup(r: ActiveRoom = room()) {
  const games = fakeGames();
  games.put(r);
  const emitted: { event: string; data: any }[] = [];
  const gw = new GameGateway(games as any, {} as any, {} as any);
  gw.server = { to: () => ({ emit: (event: string, data: any) => emitted.push({ event, data }) }) } as any;
  const client = (userId: string) => {
    const own: { event: string; data: any }[] = [];
    return { data: { userId }, join: jest.fn(), emit: (event: string, data: any) => own.push({ event, data }), own } as any;
  };
  const events = (name: string) => emitted.filter((e) => e.event === name).map((e) => e.data);
  return { gw, games, client, events };
}

describe('GameGateway — moves', () => {
  it('plays a legal move, updates the room and re-arms the clock', async () => {
    const { gw, games, client, events } = setup();
    await gw.handleMove(client('w'), { roomId: 'R', from: 'e2', to: 'e4' });

    const r = games.read('R');
    expect(r.moves).toEqual(['e4']);
    expect(r.fen.split(' ')[1]).toBe('b');
    expect(events('move_made')[0].move.san).toBe('e4');
    expect(games.setDeadline).toHaveBeenCalled();
  });

  it('rejects moving out of turn, spectators, and illegal moves', async () => {
    const { gw, games, client } = setup();
    const black = client('b');
    await gw.handleMove(black, { roomId: 'R', from: 'e7', to: 'e5' });
    expect(black.own[0].data.reason).toBe('Not your turn');

    const spectator = client('x');
    await gw.handleMove(spectator, { roomId: 'R', from: 'e2', to: 'e4' });
    expect(spectator.own[0].data.reason).toBe('Not a player');

    const white = client('w');
    await gw.handleMove(white, { roomId: 'R', from: 'e2', to: 'e5' });
    expect(white.own[0].event).toBe('invalid_move');
    expect(games.read('R').moves).toEqual([]);
  });

  it('adds the increment and charges only the time actually spent', async () => {
    const { gw, games, client } = setup(room({ increment: 2, lastMoveAt: Date.now() - 5_000 }));
    await gw.handleMove(client('w'), { roomId: 'R', from: 'e2', to: 'e4' });
    const white = games.read('R').timers.white;
    // 60s - ~5s spent + 2s increment
    expect(white).toBeGreaterThan(56_500);
    expect(white).toBeLessThanOrEqual(57_000);
  });

  it('a move arriving inside the grace window is still accepted', async () => {
    const { gw, games, client } = setup(room({ timers: { white: 1_000, black: 60_000 }, lastMoveAt: Date.now() - 1_200 }));
    await gw.handleMove(client('w'), { roomId: 'R', from: 'e2', to: 'e4' });
    const r = games.read('R');
    expect(r.status).toBe('active');
    expect(r.timers.white).toBe(0);
  });

  it('a move arriving after flag-fall loses on time instead', async () => {
    const { gw, games, client, events } = setup(
      room({ timers: { white: 1_000, black: 60_000 }, lastMoveAt: Date.now() - 1_000 - CLOCK_GRACE_MS - 100 }),
    );
    await gw.handleMove(client('w'), { roomId: 'R', from: 'e2', to: 'e4' });
    expect(games.read('R').moves).toEqual([]);
    expect(events('game_over')[0]).toMatchObject({ result: 'black', reason: 'timeout' });
  });

  it('checkmate ends the game in the same write as the move', async () => {
    // Fool's mate, one move from the end.
    const fen = 'rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq - 0 2';
    const { gw, games, client, events } = setup(room({ fen }));
    await gw.handleMove(client('b'), { roomId: 'R', from: 'd8', to: 'h4' });
    expect(games.read('R').status).toBe('ended');
    expect(events('game_over')[0]).toMatchObject({ result: 'black', reason: 'checkmate', gameId: 'g1' });
    expect(games.saved).toEqual([{ result: 'BLACK', reason: 'CHECKMATE' }]);
  });

  it('rejects moves once the game is over', async () => {
    const { gw, client } = setup(room({ status: 'ended' }));
    const white = client('w');
    await gw.handleMove(white, { roomId: 'R', from: 'e2', to: 'e4' });
    expect(white.own[0].data.reason).toBe('Game not active');
  });
});

describe('GameGateway — game enders settle exactly once', () => {
  it('resign: the other side wins, and a second resign does nothing', async () => {
    const { gw, games, client, events } = setup();
    await gw.handleResign(client('w'), { roomId: 'R' });
    await gw.handleResign(client('b'), { roomId: 'R' });
    expect(events('game_over')).toHaveLength(1);
    expect(events('game_over')[0]).toMatchObject({ result: 'black', reason: 'resignation' });
    expect(games.saved).toHaveLength(1);
  });

  it('a spectator cannot resign for anyone', async () => {
    const { gw, games, client } = setup();
    await gw.handleResign(client('x'), { roomId: 'R' });
    expect(games.read('R').status).toBe('active');
  });

  it('draw: only the opponent of the offerer can accept', async () => {
    const { gw, games, client, events } = setup();
    await gw.handleOfferDraw(client('w'), { roomId: 'R' });
    expect(events('draw_offered')[0].byColor).toBe('white');

    await gw.handleAcceptDraw(client('w'), { roomId: 'R' });
    expect(games.read('R').status).toBe('active');

    await gw.handleAcceptDraw(client('b'), { roomId: 'R' });
    expect(events('game_over')[0]).toMatchObject({ result: 'draw', reason: 'agreement' });
  });

  it('accepting with no offer on the table does nothing', async () => {
    const { gw, games, client } = setup();
    await gw.handleAcceptDraw(client('b'), { roomId: 'R' });
    expect(games.read('R').status).toBe('active');
  });

  it('a move cancels a pending draw offer', async () => {
    const { gw, games, client } = setup(room({ drawOfferedBy: 'black' }));
    await gw.handleMove(client('w'), { roomId: 'R', from: 'e2', to: 'e4' });
    expect(games.read('R').drawOfferedBy).toBeNull();
  });

  it('claim_timeout: only the opponent of a flagged player can claim', async () => {
    const flagged = room({ timers: { white: 1_000, black: 60_000 }, lastMoveAt: Date.now() - 1_000 - CLOCK_GRACE_MS - 100 });
    const { gw, games, client, events } = setup(flagged);
    await gw.handleClaimTimeout(client('w'), { roomId: 'R' }); // can't claim your own flag
    expect(games.read('R').status).toBe('active');
    await gw.handleClaimTimeout(client('b'), { roomId: 'R' });
    expect(events('game_over')[0]).toMatchObject({ result: 'black', reason: 'timeout' });
  });

  it('claim_timeout before the flag falls is refused', async () => {
    const { gw, games, client } = setup();
    await gw.handleClaimTimeout(client('b'), { roomId: 'R' });
    expect(games.read('R').status).toBe('active');
  });

  it('vs-computer games are announced but never saved or rated', async () => {
    const { gw, games, client, events } = setup(room({ blackPlayer: { id: 'computer', username: 'Stockfish', rating: 1500 } }));
    await gw.handleResign(client('w'), { roomId: 'R' });
    expect(games.saveCompletedGame).not.toHaveBeenCalled();
    expect(events('game_over')[0]).toMatchObject({ gameId: null, ratingChange: null });
  });
});

describe('GameGateway — clock sweeper', () => {
  it('flags the side to move once past deadline + grace', async () => {
    const { gw, games, events } = setup(room({ timers: { white: 1_000, black: 60_000 }, lastMoveAt: Date.now() - 2_000 }));
    games.deadlines.set('R', 0);
    await (gw as any).sweep();
    expect(events('game_over')[0]).toMatchObject({ result: 'black', reason: 'timeout' });
    expect(games.deadlines.has('R')).toBe(false);
  });

  it('reads only expired rooms and never pushes a per-second clock_sync', async () => {
    const { gw, games, events } = setup(room());
    games.deadlines.set('R', Date.now() + 60_000);
    await (gw as any).sweep();
    expect(games.getRoom).not.toHaveBeenCalled();
    expect(events('clock_sync')).toHaveLength(0);
    expect(games.read('R').status).toBe('active');
  });

  it('with no games it schedules nothing (zero idle Redis traffic)', async () => {
    jest.useFakeTimers();
    try {
      const { gw, games } = setup();
      gw.onModuleInit();
      await jest.advanceTimersByTimeAsync(10 * 60_000);
      expect(games.nextDeadline).toHaveBeenCalledTimes(1); // the boot-time arm only
      expect(games.expiredRooms).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it('wakes exactly at the deadline a move sets, with no polling before it', async () => {
    jest.useFakeTimers();
    try {
      const { gw, games, client, events } = setup(room({ timers: { white: 60_000, black: 3_000 } }));
      await gw.handleMove(client('w'), { roomId: 'R', from: 'e2', to: 'e4' }); // black's 3s now runs
      await jest.advanceTimersByTimeAsync(3_000 + CLOCK_GRACE_MS - 100);
      expect(games.expiredRooms).not.toHaveBeenCalled();
      expect(events('game_over')).toHaveLength(0);

      await jest.advanceTimersByTimeAsync(200);
      expect(events('game_over')[0]).toMatchObject({ result: 'white', reason: 'timeout' });
      expect(games.expiredRooms).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it('a restart re-arms from deadlines already in Redis', async () => {
    jest.useFakeTimers();
    try {
      const { gw, games, events } = setup(room({ timers: { white: 2_000, black: 60_000 }, lastMoveAt: Date.now() }));
      games.deadlines.set('R', Date.now() + 2_000 + CLOCK_GRACE_MS);
      gw.onModuleInit();
      await jest.advanceTimersByTimeAsync(2_000 + CLOCK_GRACE_MS + 50);
      expect(events('game_over')[0]).toMatchObject({ result: 'black', reason: 'timeout' });
    } finally {
      jest.useRealTimers();
    }
  });

  it('an earlier deadline pulls a later scheduled wake-up forward', async () => {
    jest.useFakeTimers();
    try {
      const { gw, games, events } = setup(room({ timers: { white: 1_000, black: 60_000 }, lastMoveAt: Date.now() }));
      (gw as any).scheduleSweep(Date.now() + 30_000);
      (gw as any).scheduleSweep(await games.setDeadline(games.read('R')));
      await jest.advanceTimersByTimeAsync(1_000 + CLOCK_GRACE_MS + 50);
      expect(events('game_over')).toHaveLength(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it('drops deadlines for rooms that are gone or no longer active', async () => {
    const { gw, games } = setup(room({ status: 'ended' }));
    games.deadlines.set('R', 0);
    games.deadlines.set('GONE', 0);
    await (gw as any).sweep();
    expect(games.deadlines.size).toBe(0);
  });
});

describe('GameGateway — joining and spectating', () => {
  it('a reconnect snapshot carries the live clock, not the last-move clock', async () => {
    const { gw, client } = setup(room({ lastMoveAt: Date.now() - 10_000 }));
    for (const who of ['w', 'x']) { // a returning player, then a spectator
      const c = client(who);
      await gw.handleJoinRoom(c, { roomId: 'R' });
      const { timers } = c.own.find((e: any) => e.event === 'game_state').data;
      expect(timers.white).toBeLessThanOrEqual(50_000); // white has been thinking 10s
      expect(timers.black).toBe(60_000);
    }
  });

  it('the first player to join starts the game and white\'s clock', async () => {
    const { gw, games, client, events } = setup(room({ status: 'waiting' }));
    await gw.handleJoinRoom(client('w'), { roomId: 'R' });
    expect(games.read('R').status).toBe('active');
    expect(games.setDeadline).toHaveBeenCalled();
    expect(events('game_start')).toHaveLength(1);
  });

  it('a spectator gets a snapshot but never starts a waiting game', async () => {
    const { gw, games, client, events } = setup(room({ status: 'waiting' }));
    const spectator = client('x');
    await gw.handleJoinRoom(spectator, { roomId: 'R' });
    expect(games.read('R').status).toBe('waiting');
    expect(spectator.own[0]).toMatchObject({ event: 'game_state', data: { status: 'waiting' } });
    expect(spectator.data.roomId).toBeUndefined();
    expect(events('game_start')).toHaveLength(0);
  });

  it('a spectator disconnecting never arms the abandonment timer', async () => {
    jest.useFakeTimers();
    try {
      const { gw, games, client } = setup();
      const spectator = client('x');
      spectator.data.roomId = 'R'; // even if it were somehow stamped
      gw['redis'] = { del: jest.fn() } as any;
      await gw.handleDisconnect(spectator);
      jest.advanceTimersByTime(61_000);
      expect(games.read('R').status).toBe('active');
    } finally {
      jest.useRealTimers();
    }
  });

  it('a player who stays gone 60s abandons; reconnecting in time cancels it', async () => {
    jest.useFakeTimers();
    try {
      const { gw, games, client, events } = setup();
      gw['redis'] = { del: jest.fn() } as any;
      const black = client('b');
      black.data.roomId = 'R';

      await gw.handleDisconnect(black);
      await gw.handleJoinRoom(client('b'), { roomId: 'R' });
      expect(events('opponent_reconnected')).toHaveLength(1);
      await jest.advanceTimersByTimeAsync(61_000);
      expect(games.read('R').status).toBe('active');

      await gw.handleDisconnect(black);
      await jest.advanceTimersByTimeAsync(61_000);
      expect(events('game_over')[0]).toMatchObject({ result: 'white', reason: 'abandoned' });
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('GameGateway — rematch', () => {
  it('needs both players, and swaps colors', async () => {
    const { gw, games, client, events } = setup(room({ status: 'ended' }));
    await gw.handleRematchRequest(client('w'), { roomId: 'R' });
    expect(events('rematch_offered')).toHaveLength(1);
    await gw.handleRematchRequest(client('w'), { roomId: 'R' }); // asking twice isn't consent
    expect(games.createRoom).not.toHaveBeenCalled();

    await gw.handleRematchRequest(client('b'), { roomId: 'R' });
    expect(games.createRoom).toHaveBeenCalledWith(B, W, 60, 0);
    expect(events('rematch_ready')[0].roomId).toBe('NEW');
  });
});

describe('GameGateway — computer moves', () => {
  const vsComputer = (over: Partial<ActiveRoom> = {}) =>
    room({ blackPlayer: { id: 'computer', username: 'Stockfish', rating: 1500 }, ...over });
  const afterE4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';

  it('the human may relay the engine\'s move on black\'s turn', async () => {
    const { gw, games, client } = setup(vsComputer({ fen: afterE4 }));
    await gw.handleComputerMove(client('w'), { roomId: 'R', from: 'e7', to: 'e5' });
    expect(games.read('R').moves).toEqual(['e5']);
  });

  it('refuses relays from strangers, on white\'s turn, or in human games', async () => {
    const strangers = setup(vsComputer({ fen: afterE4 }));
    await strangers.gw.handleComputerMove(strangers.client('x'), { roomId: 'R', from: 'e7', to: 'e5' });
    expect(strangers.games.read('R').moves).toEqual([]);

    const wrongTurn = setup(vsComputer());
    await wrongTurn.gw.handleComputerMove(wrongTurn.client('w'), { roomId: 'R', from: 'e2', to: 'e4' });
    expect(wrongTurn.games.read('R').moves).toEqual([]);

    const human = setup(room({ fen: afterE4 }));
    await human.gw.handleComputerMove(human.client('w'), { roomId: 'R', from: 'e7', to: 'e5' });
    expect(human.games.read('R').moves).toEqual([]);
  });
});
