import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { PrismaService } from './common/prisma/prisma.service';
import { RedisService } from './common/redis/redis.service';
import { Public } from './auth/jwt-auth.guard';

/**
 * Two checks, the liveness/readiness split (ADR-0035):
 *   GET /health       readiness: 200 when Postgres and Redis both answer, 503 naming
 *                     the one that didn't. For humans and occasional alerting.
 *   GET /health/live  liveness: the process is up, touches nothing. For Render's
 *                     health check and the keep-awake pinger, which fire often enough
 *                     that a SELECT 1 each time would keep Neon from ever sleeping
 *                     and burn its free compute hours.
 */
@Controller('health')
@Public()
@SkipThrottle() // pingers hit this on a schedule; they must never be the ones throttled
export class HealthController {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
  ) {}

  @Get('live')
  live() {
    return { status: 'ok' };
  }

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
