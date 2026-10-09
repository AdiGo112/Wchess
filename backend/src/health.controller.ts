import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { PrismaService } from './common/prisma/prisma.service';
import { RedisService } from './common/redis/redis.service';

/**
 * For the host's health check and uptime pingers (ship-plan 0.11): 200 when
 * Postgres and Redis both answer, 503 naming the one that didn't.
 */
@Controller('health')
@SkipThrottle() // pingers hit this on a schedule; they must never be the ones throttled
export class HealthController {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
  ) {}

  @Get()
  async check() {
    const [db, redis] = await Promise.all([
      this.prisma.$queryRaw`SELECT 1`.then(() => 'ok', () => 'down'),
      this.redis.getClient().ping().then(() => 'ok', () => 'down'),
    ]);
    const body = { status: db === 'ok' && redis === 'ok' ? 'ok' : 'down', db, redis };
    if (body.status !== 'ok') throw new ServiceUnavailableException(body);
    return body;
  }
}
