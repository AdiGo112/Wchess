import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiTags, ApiQuery } from '@nestjs/swagger';
import { LeaderboardService } from './leaderboard.service';

@ApiTags('leaderboard')
@Controller('leaderboard')
export class LeaderboardController {
  constructor(private leaderboard: LeaderboardService) {}

  @Get()
  @ApiQuery({ name: 'variant', required: false, example: 'blitz' })
  @ApiQuery({ name: 'limit', required: false, example: 100 })
  getLeaderboard(
    @Query('variant') variant = 'blitz',
    @Query('limit') limit = '100',
  ) {
    return this.leaderboard.getTopPlayers(variant, Math.min(+limit, 200));
  }

  @Get('rank/:userId')
  getUserRank(
    @Param('userId') userId: string,
    @Query('variant') variant = 'blitz',
  ) {
    return this.leaderboard.getUserRank(userId, variant);
  }
}
