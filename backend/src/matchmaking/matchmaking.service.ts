import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { Server } from 'socket.io';
import { RedisService } from '../common/redis/redis.service';
import { GamesService } from '../games/games.service';
import { variantFromTimeControl } from '../common/utils/elo';
import { QueueEntry } from './types/queue-entry.interface';

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

  /** Queue keys that have had at least one entry since startup. */
  private readonly activeKeys = new Set<string>();

  private static readonly POLL_INTERVAL_MS = 500;
  // ADR-0008: tolerance = min(50 + waitSeconds * 12, 400)
  private static readonly BASE_TOLERANCE = 50;
  private static readonly TOLERANCE_PER_SEC = 12;
  private static readonly MAX_TOLERANCE = 400;

  constructor(
    private readonly redis: RedisService,
    private readonly gamesService: GamesService,
  ) {}

  onModuleInit() {
    this.pollTimer = setInterval(() => {
      this.poll().catch((err) =>
        this.logger.error('Matchmaking poll cycle failed', err),
      );
    }, MatchmakingService.POLL_INTERVAL_MS);
  }

  onModuleDestroy() {
    if (this.pollTimer) clearInterval(this.pollTimer);
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
    // Prevent duplicates: drop any prior entry for this user in this queue.
    await this.removeUser(key, entry.userId);
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
}
