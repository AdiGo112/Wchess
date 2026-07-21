import { Injectable } from '@nestjs/common';
import { RedisService } from '../common/redis/redis.service';
import { PrismaService } from '../common/prisma/prisma.service';

export type Period = 'all' | 'week' | 'month';

export interface RankedEntry {
  userId: string;
  rating: number;
  rank: number;
  username: string;
  name: string;
  avatarUrl: string | null;
}

// Period boards self-expire so old buckets never accumulate; TTL comfortably
// outlives the bucket it covers.
const WEEK_TTL = 14 * 24 * 3600;
const MONTH_TTL = 62 * 24 * 3600;
const CACHE_TTL = 60; // enriched top-N cache (avoids re-hitting Postgres for names)

@Injectable()
export class LeaderboardService {
  constructor(
    private redis: RedisService,
    private prisma: PrismaService,
  ) {}

  /** ISO-8601 week bucket, e.g. "2026-W30" (weeks start Monday). */
  private isoWeek(d = new Date()): string {
    const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    // Thursday of this week decides the ISO year.
    const day = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
    return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
  }

  /** Year-month bucket, e.g. "2026-07". */
  private monthBucket(d = new Date()): string {
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  }

  /** Redis key for the given variant + period's current bucket. */
  private boardKey(variant: string, period: Period): string {
    if (period === 'week') return `leaderboard:week:${this.isoWeek()}:${variant}`;
    if (period === 'month') return `leaderboard:month:${this.monthBucket()}:${variant}`;
    return `leaderboard:${variant}`;
  }

  private ttlFor(period: Period): number | undefined {
    if (period === 'week') return WEEK_TTL;
    if (period === 'month') return MONTH_TTL;
    return undefined; // all-time board never expires
  }

  /**
   * Record a player's new rating on the all-time board and on the current
   * week/month buckets. Called on every rated game end (games.service).
   * The period buckets thus hold the current rating of players active in the
   * period — a live board, not a start-of-period snapshot (documented variance).
   */
  async updateScore(userId: string, variant: string, rating: number) {
    const periods: Period[] = ['all', 'week', 'month'];
    for (const period of periods) {
      const key = this.boardKey(variant, period);
      await this.redis.zadd(key, rating, userId);
      const ttl = this.ttlFor(period);
      // Re-arm the TTL on each write so an active bucket never expires under load;
      // once writes stop, it lapses TTL seconds after the last game.
      if (ttl) await this.redis.expire(key, ttl);
    }
  }

  async getTopPlayers(variant: string, period: Period = 'all', limit = 100): Promise<RankedEntry[]> {
    const cacheKey = `cache:leaderboard:${period}:${variant}:${limit}`;
    const cached = await this.redis.getJson<RankedEntry[]>(cacheKey);
    if (cached) return cached;

    const raw = await this.redis.zrevrange(this.boardKey(variant, period), 0, limit - 1, true);

    const entries: { userId: string; rating: number; rank: number }[] = [];
    for (let i = 0; i < raw.length; i += 2) {
      entries.push({ userId: raw[i], rating: parseInt(raw[i + 1]), rank: i / 2 + 1 });
    }
    if (entries.length === 0) return [];

    const users = await this.prisma.user.findMany({
      where: { id: { in: entries.map((e) => e.userId) } },
      select: { id: true, username: true, name: true, avatarUrl: true },
    });
    const userMap = Object.fromEntries(users.map((u) => [u.id, u]));

    const result: RankedEntry[] = entries.map((e) => ({
      ...e,
      username: userMap[e.userId]?.username ?? 'Unknown',
      name: userMap[e.userId]?.name ?? '',
      avatarUrl: userMap[e.userId]?.avatarUrl ?? null,
    }));

    await this.redis.setJson(cacheKey, result, CACHE_TTL);
    return result;
  }

  async getUserRank(userId: string, variant: string, period: Period = 'all') {
    const key = this.boardKey(variant, period);
    const rank = await this.redis.zrevrank(key, userId);
    const score = await this.redis.zscore(key, userId);
    return { rank: rank !== null ? rank + 1 : null, rating: score ? parseInt(score) : null };
  }

  async seedFromDatabase() {
    const ratings = await this.prisma.userRating.findMany();
    for (const r of ratings) {
      await this.updateScore(r.userId, r.variant.toLowerCase(), r.rating);
    }
  }
}
