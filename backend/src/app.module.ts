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

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),

    // Serve the built frontend (frontend/dist) from this same server, so the
    // whole app is ONE origin on ONE port — production-style, and a zero-deploy
    // demo needs only `npm run build` (frontend) then one tunnel on this port.
    // API + socket paths are excluded so they route to Nest, not the SPA index.
    // In dev you use Vite on :5173 instead and this just serves whatever's in
    // dist (harmless if absent).
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', '..', 'frontend', 'dist'),
      exclude: ['/api/(.*)', '/socket.io/(.*)'],
    }),

    ThrottlerModule.forRoot([
      { name: 'short', ttl: 1000, limit: 10 },
      { name: 'medium', ttl: 10000, limit: 50 },
      { name: 'long', ttl: 60000, limit: 300 },
    ]),

    PrismaModule,
    RedisModule,
    AuthModule,
    UsersModule,
    GamesModule,
    MatchmakingModule,
    LeaderboardModule,
    AnalysisModule,
  ],
  providers: [
    // Actually enforce the ThrottlerModule config above on every HTTP route.
    // (Global guards don't bind to WS gateways, so sockets are unaffected.)
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
