import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { GamesController } from './games.controller';
import { GamesService } from './games.service';
import { GameGateway } from './game.gateway';
import { LeaderboardModule } from '../leaderboard/leaderboard.module';
import { StockfishModule } from '../stockfish/stockfish.module';

@Module({
  imports: [
    LeaderboardModule,
    StockfishModule,
    JwtModule.registerAsync({
      useFactory: () => ({
        secret: process.env.JWT_SECRET || 'fallback-secret',
      }),
    }),
  ],
  controllers: [GamesController],
  providers: [GamesService, GameGateway],
  exports: [GamesService, GameGateway],
})
export class GamesModule {}
