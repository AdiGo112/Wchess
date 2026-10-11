import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { GamesService } from './games.service';
import { Public } from '../auth/jwt-auth.guard';

@ApiTags('games')
@Controller('games')
export class GamesController {
  constructor(private gamesService: GamesService) {}

  @Get('history/:userId')
  @ApiBearerAuth()
  getHistory(
    @Param('userId') userId: string,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    return this.gamesService.getHistory(userId, +page, Math.min(+limit, 50));
  }

  // Declared before ':id' so "live" isn't swallowed as a game id.
  @Get('live')
  @ApiBearerAuth()
  getLive() {
    return this.gamesService.liveGames();
  }

  @Public()
  @Get(':id')
  getGame(@Param('id') id: string) {
    return this.gamesService.getGame(id);
  }
}
