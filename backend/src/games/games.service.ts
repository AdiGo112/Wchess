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
  spectatorCount: number;
  variant: string;
}

const ROOM_TTL = 86400;

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

  async deleteRoom(roomId: string): Promise<void> {
    await this.redis.del(this.roomKey(roomId));
  }

  async createRoom(
    whitePlayer: { id: string; username: string; rating: number },
    blackPlayer: { id: string; username: string; rating: number },
    timeControl: number,
    increment = 0,
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
      spectatorCount: 0,
      variant,
    };

    await this.setRoom(room);
    return room;
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

    const game = await this.prisma.game.create({
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

    if (result !== 'ABORTED') {
      await this.prisma.userRating.upsert({
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
      });

      await this.prisma.userRating.upsert({
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
      });

      await this.leaderboard.updateScore(room.whitePlayer.id, variant.toLowerCase(), newWhite.rating);
      await this.leaderboard.updateScore(room.blackPlayer.id, variant.toLowerCase(), newBlack.rating);
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
