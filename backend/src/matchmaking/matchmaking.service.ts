import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { Server } from 'socket.io';
import { RedisService } from '../common/redis/redis.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { GamesService } from '../games/games.service';
import { variantFromTimeControl } from '../common/utils/elo';
import { QueueEntry } from './types/queue-entry.interface';
import { CreateChallengeDto } from './dto/create-challenge.dto';
import { CreateComputerGameDto } from './dto/create-computer-game.dto';

const CHALLENGE_TTL_MS = 10 * 60 * 1000; // 10 minutes

/** Sorted-by-wait candidate paired with its exact Redis payload (for LREM). */
interface Candidate {
  entry: QueueEntry;
  raw: string;
}

@Injectable()
export class MatchmakingService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MatchmakingService.name);
  private server: Server | null = null;
  private pollTimer: NodeJS.Timeout | null = null;
  private positionTimer: NodeJS.Timeout | null = null;

  /** Queue keys that have had at least one entry since startup. */
  private readonly activeKeys = new Set<string>();

  private static readonly POLL_INTERVAL_MS = 500;
  private static readonly POSITION_INTERVAL_MS = 5000;
  private static readonly EST_WAIT_PER_POSITION_SEC = 15;
  // ADR-0008: tolerance = min(50 + waitSeconds * 12, 400)
  private static readonly BASE_TOLERANCE = 50;
  private static readonly TOLERANCE_PER_SEC = 12;
  private static readonly MAX_TOLERANCE = 400;

  constructor(
    private readonly redis: RedisService,
    private readonly prisma: PrismaService,
    private readonly gamesService: GamesService,
  ) {}

  onModuleInit() {
    this.pollTimer = setInterval(() => {
      this.poll().catch((err) =>
        this.logger.error('Matchmaking poll cycle failed', err),
      );
    }, MatchmakingService.POLL_INTERVAL_MS);

    this.positionTimer = setInterval(() => {
      this.broadcastPositions().catch((err) =>
        this.logger.error('Queue position broadcast failed', err),
      );
    }, MatchmakingService.POSITION_INTERVAL_MS);
  }

  onModuleDestroy() {
    if (this.pollTimer) clearInterval(this.pollTimer);
    if (this.positionTimer) clearInterval(this.positionTimer);
  }

  /** Wired by the gateway in afterInit so the service can emit match_found. */
  setServer(server: Server) {
    this.server = server;
  }

  variantOf(timeControl: number): string {
    return variantFromTimeControl(timeControl).toLowerCase();
  }

  queueKey(variant: string, timeControl: number): string {
    return `queue:${variant}:${timeControl}`;
  }

  /** ADR-0008: start at ±50, widen 12/sec, cap at ±400 (reached ~29s). */
  toleranceForWait(waitMs: number): number {
    const waitSeconds = Math.max(0, waitMs) / 1000;
    return Math.min(
      MatchmakingService.BASE_TOLERANCE +
        waitSeconds * MatchmakingService.TOLERANCE_PER_SEC,
      MatchmakingService.MAX_TOLERANCE,
    );
  }

  async enqueue(entry: QueueEntry): Promise<void> {
    const key = this.queueKey(entry.variant, entry.timeControl);
    // DOMAIN rule 1: a player is only ever in one queue — joining any queue
    // leaves every other (and dedupes this one).
    await this.leaveAllQueues(entry.userId);
    await this.redis.lpush(key, JSON.stringify(entry));
    this.activeKeys.add(key);
    this.logger.log(`${entry.username} (${entry.rating}) joined ${key}`);
  }

  async dequeue(
    userId: string,
    variant: string,
    timeControl: number,
  ): Promise<void> {
    await this.removeUser(this.queueKey(variant, timeControl), userId);
  }

  /** Remove the user from every active queue (single-queue invariant + cleanup). */
  async leaveAllQueues(userId: string): Promise<void> {
    for (const key of [...this.activeKeys]) {
      await this.removeUser(key, userId);
    }
  }

  /** Remove every queued entry for a user from a specific queue key. */
  private async removeUser(key: string, userId: string): Promise<void> {
    const raw = await this.redis.lrange(key, 0, -1);
    for (const item of raw) {
      const entry = this.parse(item);
      if (entry && entry.userId === userId) {
        await this.redis.lrem(key, 0, item);
      }
    }
  }

  private parse(raw: string): QueueEntry | null {
    try {
      return JSON.parse(raw) as QueueEntry;
    } catch {
      return null;
    }
  }

  /** One sweep across all active queues; pairs at most one match per queue. */
  private async poll(): Promise<void> {
    for (const key of [...this.activeKeys]) {
      const raw = await this.redis.lrange(key, 0, -1);
      if (raw.length === 0) {
        this.activeKeys.delete(key);
        continue;
      }
      if (raw.length < 2) continue;

      const candidates: Candidate[] = [];
      for (const item of raw) {
        const entry = this.parse(item);
        if (entry) candidates.push({ entry, raw: item });
      }
      // Longest-waiting players get first shot at a partner.
      candidates.sort((a, b) => a.entry.enqueuedAt - b.entry.enqueuedAt);

      const now = Date.now();
      let paired = false;
      for (let i = 0; i < candidates.length && !paired; i++) {
        for (let j = i + 1; j < candidates.length && !paired; j++) {
          const a = candidates[i];
          const b = candidates[j];
          // Stricter of the two players' tolerances must be satisfied.
          const tolerance = Math.min(
            this.toleranceForWait(now - a.entry.enqueuedAt),
            this.toleranceForWait(now - b.entry.enqueuedAt),
          );
          if (Math.abs(a.entry.rating - b.entry.rating) <= tolerance) {
            await this.pairAndNotify(key, a, b);
            paired = true;
          }
        }
      }
    }
  }

  /**
   * Every 5s, tell each queued player their position (1 = next in line) and a
   * rough wait estimate. API_DESIGN `queue_position` event. (ADR-0008 governs
   * the actual pairing; this is purely a UX hint.)
   */
  private async broadcastPositions(): Promise<void> {
    if (!this.server) return;
    for (const key of [...this.activeKeys]) {
      const raw = await this.redis.lrange(key, 0, -1);
      if (raw.length === 0) continue;
      const entries = raw
        .map((r) => this.parse(r))
        .filter((e): e is QueueEntry => e !== null)
        .sort((a, b) => a.enqueuedAt - b.enqueuedAt);
      entries.forEach((entry, idx) => {
        const position = idx + 1;
        this.server!.to(entry.socketId).emit('queue_position', {
          position,
          estimatedWait: position * MatchmakingService.EST_WAIT_PER_POSITION_SEC,
        });
      });
    }
  }

  private async pairAndNotify(
    key: string,
    a: Candidate,
    b: Candidate,
  ): Promise<void> {
    // Claim both entries atomically; if either is already gone, abort cleanly.
    const removedA = await this.redis.lrem(key, 1, a.raw);
    if (!removedA) return;
    const removedB = await this.redis.lrem(key, 1, b.raw);
    if (!removedB) {
      // Partner vanished after we pulled A — put A back so they keep waiting.
      await this.redis.lpush(key, a.raw);
      return;
    }

    const aIsWhite = Math.random() < 0.5;
    const white = aIsWhite ? a.entry : b.entry;
    const black = aIsWhite ? b.entry : a.entry;

    const room = await this.gamesService.createRoom(
      { id: white.userId, username: white.username, rating: white.rating },
      { id: black.userId, username: black.username, rating: black.rating },
      white.timeControl,
      white.increment,
    );

    this.logger.log(
      `Match: ${white.username} (W) vs ${black.username} (B) → room ${room.id}`,
    );

    this.emitMatchFound(white.socketId, room.id, 'white', black);
    this.emitMatchFound(black.socketId, room.id, 'black', white);
  }

  private emitMatchFound(
    socketId: string,
    roomId: string,
    color: 'white' | 'black',
    opponent: QueueEntry,
  ): void {
    if (!this.server) return;
    this.server.to(socketId).emit('match_found', {
      roomId,
      color,
      opponent: {
        id: opponent.userId,
        username: opponent.username,
        rating: opponent.rating,
      },
    });
  }

  // ---------------------------------------------------------------------------
  // Increment 2 — friend challenges & computer games (REST-driven)
  // ---------------------------------------------------------------------------

  /** Emit to a user's live socket using GameGateway's `user:socket:` mapping. */
  async notifyUser(
    userId: string,
    event: string,
    payload: unknown,
  ): Promise<void> {
    if (!this.server) return;
    const socketId = await this.redis.get(`user:socket:${userId}`);
    if (socketId) this.server.to(socketId).emit(event, payload);
  }

  /** Build a game-room player from a user id, rated for the given time control. */
  private async buildPlayer(userId: string, timeControl: number) {
    const variant = variantFromTimeControl(timeControl);
    const [user, ratingRow] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { username: true },
      }),
      this.prisma.userRating.findUnique({
        where: { userId_variant: { userId, variant: variant as any } },
      }),
    ]);
    return {
      id: userId,
      username: user?.username ?? 'Player',
      rating: ratingRow?.rating ?? 1200,
    };
  }

  async createChallenge(creatorId: string, dto: CreateChallengeDto) {
    const token = randomBytes(16).toString('hex');
    const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MS);

    await this.prisma.challenge.create({
      data: {
        token,
        creatorId,
        variant: dto.variant,
        timeControl: dto.timeControl,
        increment: dto.increment ?? 0,
        creatorColor: dto.creatorColor ?? 'random',
        status: 'pending',
        expiresAt,
      },
    });

    const base =
      process.env.FRONTEND_URL ||
      process.env.CORS_ORIGIN ||
      'http://localhost:5173';
    return { token, shareUrl: `${base}/challenge/${token}`, expiresAt };
  }

  async acceptChallenge(token: string, accepterId: string) {
    const challenge = await this.prisma.challenge.findUnique({
      where: { token },
    });
    if (!challenge) {
      throw new NotFoundException({
        code: 'CHALLENGE_NOT_FOUND',
        message: 'Challenge not found',
      });
    }
    if (new Date() > challenge.expiresAt) {
      // Best-effort mark; expired challenges are treated as gone (404).
      await this.prisma.challenge
        .update({ where: { token }, data: { status: 'expired' } })
        .catch(() => undefined);
      throw new NotFoundException({
        code: 'CHALLENGE_EXPIRED',
        message: 'Challenge has expired',
      });
    }
    if (challenge.status !== 'pending') {
      throw new ConflictException({
        code: 'CHALLENGE_ALREADY_ACCEPTED',
        message: 'Challenge already accepted',
      });
    }
    if (challenge.creatorId === accepterId) {
      throw new ForbiddenException({
        code: 'CANNOT_ACCEPT_OWN_CHALLENGE',
        message: 'You cannot accept your own challenge',
      });
    }

    // Atomically claim the pending challenge so two simultaneous accepts
    // can't both create a game (TOCTOU guard). Only the winner proceeds.
    const claimed = await this.prisma.challenge.updateMany({
      where: { token, status: 'pending' },
      data: { status: 'accepted' },
    });
    if (claimed.count === 0) {
      throw new ConflictException({
        code: 'CHALLENGE_ALREADY_ACCEPTED',
        message: 'Challenge already accepted',
      });
    }

    // Resolve colors per creatorColor preference.
    let whiteId: string;
    let blackId: string;
    if (challenge.creatorColor === 'white') {
      whiteId = challenge.creatorId;
      blackId = accepterId;
    } else if (challenge.creatorColor === 'black') {
      whiteId = accepterId;
      blackId = challenge.creatorId;
    } else {
      [whiteId, blackId] =
        Math.random() < 0.5
          ? [challenge.creatorId, accepterId]
          : [accepterId, challenge.creatorId];
    }

    const [whitePlayer, blackPlayer] = await Promise.all([
      this.buildPlayer(whiteId, challenge.timeControl),
      this.buildPlayer(blackId, challenge.timeControl),
    ]);

    let room: { id: string };
    try {
      room = await this.gamesService.createRoom(
        whitePlayer,
        blackPlayer,
        challenge.timeControl,
        challenge.increment,
      );
    } catch (err) {
      // Room creation failed after we claimed it — release the claim so the
      // link works again rather than being permanently stuck on 'accepted'.
      await this.prisma.challenge
        .update({ where: { token }, data: { status: 'pending' } })
        .catch(() => undefined);
      throw err;
    }

    await this.prisma.challenge.update({
      where: { token },
      data: { gameId: room.id },
    });

    const creatorColor =
      whiteId === challenge.creatorId ? 'white' : 'black';
    const accepterColor = whiteId === accepterId ? 'white' : 'black';

    // Notify the (waiting) creator so they can navigate into the game.
    await this.notifyUser(challenge.creatorId, 'challenge_accepted', {
      roomId: room.id,
      color: creatorColor,
    });

    this.logger.log(
      `Challenge ${token} accepted → room ${room.id} ` +
        `(creator=${creatorColor}, accepter=${accepterColor})`,
    );

    return { gameId: room.id, color: accepterColor };
  }

  async createComputerGame(userId: string, dto: CreateComputerGameDto) {
    const player = await this.buildPlayer(userId, dto.timeControl);
    const room = await this.gamesService.createComputerRoom(
      player,
      dto.difficulty,
      dto.timeControl,
      dto.increment ?? 0,
    );
    this.logger.log(
      `Computer game ${room.id} for ${player.username} (difficulty ${dto.difficulty})`,
    );
    return { gameId: room.id };
  }

  /** Best-effort: is this user sitting in any active queue right now? */
  async getQueueStatus(userId: string) {
    for (const key of [...this.activeKeys]) {
      const raw = await this.redis.lrange(key, 0, -1);
      const idx = raw.findIndex((r) => this.parse(r)?.userId === userId);
      if (idx !== -1) {
        const [, variant, timeControl] = key.split(':');
        return {
          inQueue: true,
          variant,
          timeControl: Number(timeControl),
          position: idx + 1,
        };
      }
    }
    return { inQueue: false, variant: null, timeControl: null, position: null };
  }
}
