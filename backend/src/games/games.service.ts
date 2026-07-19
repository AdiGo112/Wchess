import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { RedisService } from '../common/redis/redis.service';
import { updateGlicko2, variantFromTimeControl } from '../common/utils/elo';
import { LeaderboardService } from '../leaderboard/leaderboard.service';

export interface ActiveRoom {
  id: string;
  whitePlayer: { id: string; username: string; rating: number };
  blackPlayer: { id: string; username: string; rating: number } | null;
  fen: string;
  moves: string[];
  timers: { white: number; black: number };
  lastMoveAt: number;
  status: 'waiting' | 'active' | 'ended';
  timeControl: number;
  increment: number;
  startedAt: number;
  drawOfferedBy: 'white' | 'black' | null;
  rematchRequestedBy: string | null;
  variant: string;
  /** Stockfish difficulty (1-5) for computer games; undefined for human games. */
  difficulty?: number;
  /** Optimistic-concurrency version, bumped by every casSaveRoom. */
  version: number;
}

const ROOM_TTL = 86400;
/** ADR-0004: a move arriving within this margin of flag-fall is still accepted. */
export const CLOCK_GRACE_MS = 500;
/** ZSET of roomId → epoch-ms deadline for the side to move (ADR-0004 addendum). */
const DEADLINES_KEY = 'clock:deadlines';

/**
 * Compare-and-set on the room JSON: writes only if the stored version still
 * matches what the caller read. Missing key counts as a conflict (room deleted).
 */
const CAS_SCRIPT = `
local cur = redis.call('GET', KEYS[1])
if not cur then return 0 end
local ok, obj = pcall(cjson.decode, cur)
if not ok or tonumber(obj.version) ~= tonumber(ARGV[1]) then return 0 end
redis.call('SET', KEYS[1], ARGV[2], 'EX', ARGV[3])
return 1
`;

@Injectable()
export class GamesService {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private leaderboard: LeaderboardService,
  ) {}

  roomKey(roomId: string) { return `game:room:${roomId}`; }

  async getRoom(roomId: string): Promise<ActiveRoom | null> {
    return this.redis.getJson<ActiveRoom>(this.roomKey(roomId));
  }

  async setRoom(room: ActiveRoom): Promise<void> {
    await this.redis.setJson(this.roomKey(room.id), room, ROOM_TTL);
  }

  /**
   * CAS write: succeeds only if nobody else wrote the room since the caller's
   * getRoom. On success the room's version is bumped; on conflict the room is
   * left untouched and the caller must refetch and redo its read-modify-write.
   */
  async casSaveRoom(room: ActiveRoom): Promise<boolean> {
    const expected = room.version;
    room.version = expected + 1;
    const ok = await this.redis.eval(
      CAS_SCRIPT,
      [this.roomKey(room.id)],
      [expected, JSON.stringify(room), ROOM_TTL],
    );
    if (ok !== 1) {
      room.version = expected;
      return false;
    }
    return true;
  }

  async deleteRoom(roomId: string): Promise<void> {
    await this.redis.del(this.roomKey(roomId));
    await this.clearDeadline(roomId);
  }

  /**
   * Record when the side to move will flag: lastMoveAt + their remaining budget
   * + grace. The sweeper acts only after this moment; every move re-arms it.
   */
  async setDeadline(room: ActiveRoom): Promise<void> {
    const side = room.fen.split(' ')[1] === 'w' ? 'white' : 'black';
    const deadline = room.lastMoveAt + room.timers[side] + CLOCK_GRACE_MS;
    await this.redis.zadd(DEADLINES_KEY, deadline, room.id);
  }

  async clearDeadline(roomId: string): Promise<void> {
    await this.redis.zrem(DEADLINES_KEY, roomId);
  }

  /** Room ids whose deadline has passed (side to move has flagged + grace). */
  async expiredDeadlines(now: number): Promise<string[]> {
    return this.redis.zrangebyscore(DEADLINES_KEY, '-inf', now);
  }

  /** All room ids currently under clock watch (i.e. active games). */
  async watchedRooms(): Promise<string[]> {
    return this.redis.zrangebyscore(DEADLINES_KEY, '-inf', '+inf');
  }

  async createRoom(
    whitePlayer: { id: string; username: string; rating: number },
    blackPlayer: { id: string; username: string; rating: number },
    timeControl: number,
    increment = 0,
    difficulty?: number,
  ): Promise<ActiveRoom> {
    const { customAlphabet } = await import('nanoid');
    const nanoid = customAlphabet('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', 6);
    const id = nanoid();
    const variant = variantFromTimeControl(timeControl);

    const room: ActiveRoom = {
      id,
      whitePlayer,
      blackPlayer,
      fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      moves: [],
      timers: { white: timeControl * 1000, black: timeControl * 1000 },
      lastMoveAt: Date.now(),
      status: 'waiting',
      timeControl,
      increment,
      startedAt: Date.now(),
      drawOfferedBy: null,
      rematchRequestedBy: null,
      variant,
      difficulty,
      version: 0,
    };

    await this.setRoom(room);
    return room;
  }

  /**
   * Create a vs-computer room. Black is the Stockfish engine (id 'computer',
   * which the game gateway recognizes to dispatch engine moves). The chosen
   * difficulty is persisted on the room for the Stockfish worker.
   */
  async createComputerRoom(
    player: { id: string; username: string; rating: number },
    difficulty: number,
    timeControl: number,
    increment = 0,
  ): Promise<ActiveRoom> {
    return this.createRoom(
      player,
      { id: 'computer', username: 'Stockfish', rating: 1500 },
      timeControl,
      increment,
      difficulty,
    );
  }

  async saveCompletedGame(params: {
    room: ActiveRoom;
    result: 'WHITE' | 'BLACK' | 'DRAW' | 'ABORTED';
    reason: string;
  }) {
    const { room, result, reason } = params;
    if (!room.blackPlayer) return null;

    const variant = variantFromTimeControl(room.timeControl) as any;

    const whiteRating = await this.prisma.userRating.findUnique({
      where: { userId_variant: { userId: room.whitePlayer.id, variant } },
    });
    const blackRating = await this.prisma.userRating.findUnique({
      where: { userId_variant: { userId: room.blackPlayer.id, variant } },
    });

    let whiteScore: 0 | 0.5 | 1 = 0.5;
    let blackScore: 0 | 0.5 | 1 = 0.5;
    if (result === 'WHITE') { whiteScore = 1; blackScore = 0; }
    else if (result === 'BLACK') { whiteScore = 0; blackScore = 1; }

    const wR = { rating: whiteRating?.rating ?? 1200, rd: whiteRating?.ratingDeviation ?? 350, sigma: whiteRating?.volatility ?? 0.06 };
    const bR = { rating: blackRating?.rating ?? 1200, rd: blackRating?.ratingDeviation ?? 350, sigma: blackRating?.volatility ?? 0.06 };

    const newWhite = updateGlicko2(wR, bR, whiteScore);
    const newBlack = updateGlicko2(bR, wR, blackScore);

    const whiteDiff = newWhite.rating - wR.rating;
    const blackDiff = newBlack.rating - bR.rating;

    const duration = Math.round((Date.now() - room.startedAt) / 1000);

    const createGame = this.prisma.game.create({
      data: {
        whiteId: room.whitePlayer.id,
        blackId: room.blackPlayer.id,
        whiteUsername: room.whitePlayer.username,
        blackUsername: room.blackPlayer.username,
        whiteRating: wR.rating,
        blackRating: bR.rating,
        whiteRatingDiff: whiteDiff,
        blackRatingDiff: blackDiff,
        result: result as any,
        reason: reason as any,
        variant: variant as any,
        timeControl: room.timeControl,
        increment: room.increment,
        moves: room.moves,
        fen: room.fen,
        duration,
      },
    });

    // Game row + both rating writes commit atomically: a crash mid-sequence
    // can no longer record a game with one side's rating silently unchanged.
    let game;
    if (result !== 'ABORTED') {
      [game] = await this.prisma.$transaction([
        createGame,
        this.prisma.userRating.upsert({
          where: { userId_variant: { userId: room.whitePlayer.id, variant } },
          update: { rating: newWhite.rating, ratingDeviation: newWhite.rd, volatility: newWhite.sigma,
            wins: { increment: result === 'WHITE' ? 1 : 0 },
            losses: { increment: result === 'BLACK' ? 1 : 0 },
            draws: { increment: result === 'DRAW' ? 1 : 0 },
          },
          create: { userId: room.whitePlayer.id, variant, rating: newWhite.rating,
            ratingDeviation: newWhite.rd, volatility: newWhite.sigma,
            wins: result === 'WHITE' ? 1 : 0, losses: result === 'BLACK' ? 1 : 0,
            draws: result === 'DRAW' ? 1 : 0,
          },
        }),
        this.prisma.userRating.upsert({
          where: { userId_variant: { userId: room.blackPlayer.id, variant } },
          update: { rating: newBlack.rating, ratingDeviation: newBlack.rd, volatility: newBlack.sigma,
            wins: { increment: result === 'BLACK' ? 1 : 0 },
            losses: { increment: result === 'WHITE' ? 1 : 0 },
            draws: { increment: result === 'DRAW' ? 1 : 0 },
          },
          create: { userId: room.blackPlayer.id, variant, rating: newBlack.rating,
            ratingDeviation: newBlack.rd, volatility: newBlack.sigma,
            wins: result === 'BLACK' ? 1 : 0, losses: result === 'WHITE' ? 1 : 0,
            draws: result === 'DRAW' ? 1 : 0,
          },
        }),
      ]);

      await this.leaderboard.updateScore(room.whitePlayer.id, variant.toLowerCase(), newWhite.rating);
      await this.leaderboard.updateScore(room.blackPlayer.id, variant.toLowerCase(), newBlack.rating);
    } else {
      game = await createGame;
    }

    await this.deleteRoom(room.id);

    return {
      game,
      whiteRatingChange: whiteDiff,
      blackRatingChange: blackDiff,
      newWhiteRating: newWhite.rating,
      newBlackRating: newBlack.rating,
    };
  }

  async getHistory(userId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [games, total] = await Promise.all([
      this.prisma.game.findMany({
        where: { OR: [{ whiteId: userId }, { blackId: userId }] },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.game.count({
        where: { OR: [{ whiteId: userId }, { blackId: userId }] },
      }),
    ]);
    return { games, total, page, limit };
  }

  async getGame(id: string) {
    const game = await this.prisma.game.findUnique({ where: { id } });
    if (!game) throw new NotFoundException('Game not found');
    return game;
  }
}
