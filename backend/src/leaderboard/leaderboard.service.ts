import { Injectable } from '@nestjs/common';
import { RedisService } from '../common/redis/redis.service';
import { PrismaService } from '../common/prisma/prisma.service';

@Injectable()
export class LeaderboardService {
  constructor(
    private redis: RedisService,
    private prisma: PrismaService,
  ) {}

  leaderboardKey(variant: string) {
    return `leaderboard:${variant}`;
  }

  async updateScore(userId: string, variant: string, rating: number) {
    await this.redis.zadd(this.leaderboardKey(variant), rating, userId);
  }

  async getTopPlayers(variant: string, limit = 100) {
    const key = this.leaderboardKey(variant);
    const raw = await this.redis.zrevrange(key, 0, limit - 1, true);

    const entries: { userId: string; rating: number; rank: number }[] = [];
    for (let i = 0; i < raw.length; i += 2) {
      entries.push({ userId: raw[i], rating: parseInt(raw[i + 1]), rank: i / 2 + 1 });
    }

    if (entries.length === 0) return [];

    const userIds = entries.map(e => e.userId);
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, username: true, name: true, avatarUrl: true },
    });
    const userMap = Object.fromEntries(users.map(u => [u.id, u]));

    return entries.map(e => ({
      ...e,
      username: userMap[e.userId]?.username ?? 'Unknown',
      name: userMap[e.userId]?.name ?? '',
      avatarUrl: userMap[e.userId]?.avatarUrl ?? null,
    }));
  }

  async getUserRank(userId: string, variant: string) {
    const rank = await this.redis.zrevrank(this.leaderboardKey(variant), userId);
    const score = await this.redis.zscore(this.leaderboardKey(variant), userId);
    return { rank: rank !== null ? rank + 1 : null, rating: score ? parseInt(score) : null };
  }

  async seedFromDatabase() {
    const ratings = await this.prisma.userRating.findMany();
    for (const r of ratings) {
      await this.redis.zadd(
        this.leaderboardKey(r.variant.toLowerCase()),
        r.rating,
        r.userId,
      );
    }
  }
}
