import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiTags, ApiQuery } from '@nestjs/swagger';
import { LeaderboardService, Period } from './leaderboard.service';

const PERIODS: Period[] = ['all', 'week', 'month'];
const toPeriod = (p?: string): Period =>
  PERIODS.includes(p as Period) ? (p as Period) : 'all';

@ApiTags('leaderboard')
@Controller('leaderboard')
export class LeaderboardController {
  constructor(private leaderboard: LeaderboardService) {}

  @Get()
  @ApiQuery({ name: 'variant', required: false, example: 'blitz' })
  @ApiQuery({ name: 'period', required: false, enum: PERIODS })
  @ApiQuery({ name: 'limit', required: false, example: 100 })
  getLeaderboard(
    @Query('variant') variant = 'blitz',
    @Query('period') period?: string,
    @Query('limit') limit = '100',
  ) {
    return this.leaderboard.getTopPlayers(variant, toPeriod(period), Math.min(+limit, 200));
  }

  @Get('rank/:userId')
  @ApiQuery({ name: 'variant', required: false, example: 'blitz' })
  @ApiQuery({ name: 'period', required: false, enum: PERIODS })
  getUserRank(
    @Param('userId') userId: string,
    @Query('variant') variant = 'blitz',
    @Query('period') period?: string,
  ) {
    return this.leaderboard.getUserRank(userId, variant, toPeriod(period));
  }
}
