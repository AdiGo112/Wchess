import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { PrismaModule } from './common/prisma/prisma.module';
import { RedisModule } from './common/redis/redis.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { GamesModule } from './games/games.module';
import { MatchmakingModule } from './matchmaking/matchmaking.module';
import { LeaderboardModule } from './leaderboard/leaderboard.module';
import { AnalysisModule } from './analysis/analysis.module';
import { loggerModule } from './common/logging';
import { HealthController } from './health.controller';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { clientIp } from './common/http-security';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    loggerModule,

    // Serve the built frontend (frontend/dist) from this same server, so the
    // whole app is ONE origin on ONE port — production-style, and a zero-deploy
    // demo needs only `npm run build` (frontend) then one tunnel on this port.
    // API + socket paths are excluded so they route to Nest, not the SPA index.
    // In dev you use Vite on :5173 instead and this just serves whatever's in
    // dist (harmless if absent).
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', '..', 'frontend', 'dist'),
      // Express 5 / path-to-regexp v8 syntax (NestJS 11): named wildcards, no regex groups.
      exclude: ['/api/{*path}', '/socket.io/{*path}'],
      // index.html keeps the default max-age=0, so a deploy is picked up on the next load.
      serveStaticOptions: {
        setHeaders: (res, path) => {
          // Vite puts a content hash in every /assets file name: a changed file is a new URL,
          // so the old one can be cached forever, by the browser and Cloudflare's edge.
          if (/[\\/]assets[\\/]/.test(path)) {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          } else if (/[\\/]engine[\\/]/.test(path)) {
            // Engine names carry the Stockfish version, not a content hash: a week, then revalidate.
            res.setHeader('Cache-Control', 'public, max-age=604800');
          }
        },
      },
    }),

    ThrottlerModule.forRoot({
      throttlers: [
        { name: 'short', ttl: 1000, limit: 10 },
        { name: 'medium', ttl: 10000, limit: 50 },
        { name: 'long', ttl: 60000, limit: 300 },
      ],
      getTracker: (req) => clientIp(req as Parameters<typeof clientIp>[0]),
      // Shown as-is by the login/signup forms; the default is "ThrottlerException: Too Many Requests".
      errorMessage: 'Too many attempts. Please wait a minute and try again.',
    }),

    PrismaModule,
    RedisModule,
    AuthModule,
    UsersModule,
    GamesModule,
    MatchmakingModule,
    LeaderboardModule,
    AnalysisModule,
  ],
  controllers: [HealthController],
  providers: [
    // Actually enforce the ThrottlerModule config above on every HTTP route.
    // (Global guards don't bind to WS gateways, so sockets are unaffected.)
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    // Deny by default: routes opt out with @Public() (ship-plan 1.2). After the
    // throttler, so unauthenticated floods are still counted.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AppModule {}
