import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../common/redis/redis.service';
import { GamesService } from '../games/games.service';
import { Server } from 'socket.io';

interface QueueEntry {
  userId: string;
  username: string;
  rating: number;
  socketId: string;
  joinedAt: number;
  timeControl: number;
}

@Injectable()
export class MatchmakingService {
  private readonly logger = new Logger(MatchmakingService.name);
  private io: Server;

  constructor(
    private redis: RedisService,
    private gamesService: GamesService,
  ) {}

  setServer(io: Server) {
    this.io = io;
  }

  queueKey(timeControl: number) {
    if (timeControl < 180) return 'queue:bullet';
    if (timeControl < 600) return 'queue:blitz';
    if (timeControl < 1800) return 'queue:rapid';
    return 'queue:classical';
  }

  async joinQueue(entry: QueueEntry): Promise<void> {
    const key = this.queueKey(entry.timeControl);

    // Remove any existing entry for this user
    const existing = await this.redis.lrange(key, 0, -1);
    for (const raw of existing) {
      const e = JSON.parse(raw) as QueueEntry;
      if (e.userId === entry.userId) {
        await this.redis.lrem(key, 0, raw);
      }
    }

    await this.redis.lpush(key, JSON.stringify(entry));
    this.logger.log(`${entry.username} joined queue (${key})`);
  }

  async leaveQueue(userId: string, timeControl: number): Promise<void> {
    const key = this.queueKey(timeControl);
    const all = await this.redis.lrange(key, 0, -1);
    for (const raw of all) {
      const e = JSON.parse(raw) as QueueEntry;
      if (e.userId === userId) {
        await this.redis.lrem(key, 0, raw);
        return;
      }
    }
  }

  async tryMatch(timeControl: number): Promise<void> {
    const key = this.queueKey(timeControl);
    const len = await this.redis.llen(key);
    if (len < 2) return;

    const allEntries = await this.redis.lrange(key, 0, -1);
    if (allEntries.length < 2) return;

    const players = allEntries.map(r => JSON.parse(r) as QueueEntry);

    // Find two players with close ratings
    for (let i = 0; i < players.length; i++) {
      const p1 = players[i];
      const waitSeconds = (Date.now() - p1.joinedAt) / 1000;
      const tolerance = Math.min(100 + Math.floor(waitSeconds / 10) * 50, 400);

      for (let j = i + 1; j < players.length; j++) {
        const p2 = players[j];
        if (Math.abs(p1.rating - p2.rating) <= tolerance) {
          // Match found — remove both from queue
          await this.redis.lrem(key, 0, JSON.stringify(p1));
          await this.redis.lrem(key, 0, JSON.stringify(p2));

          const isP1White = Math.random() > 0.5;
          const white = isP1White ? p1 : p2;
          const black = isP1White ? p2 : p1;

          const room = await this.gamesService.createRoom(
            { id: white.userId, username: white.username, rating: white.rating },
            { id: black.userId, username: black.username, rating: black.rating },
            timeControl,
          );

          this.logger.log(`Match found: ${white.username} vs ${black.username} → room ${room.id}`);

          if (this.io) {
            this.io.to(white.socketId).emit('match_found', {
              roomId: room.id,
              opponent: { id: black.userId, username: black.username, rating: black.rating },
              color: 'white',
            });
            this.io.to(black.socketId).emit('match_found', {
              roomId: room.id,
              opponent: { id: white.userId, username: white.username, rating: white.rating },
              color: 'black',
            });
          }

          return;
        }
      }
    }
  }
}
