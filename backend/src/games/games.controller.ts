import { Controller, Get, Param, Query, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { GamesService } from './games.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@ApiTags('games')
@Controller('games')
export class GamesController {
  constructor(private gamesService: GamesService) {}

  @Get('history/:userId')
  getHistory(
    @Param('userId') userId: string,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    return this.gamesService.getHistory(userId, +page, Math.min(+limit, 50));
  }

  @Get(':id')
  getGame(@Param('id') id: string) {
    return this.gamesService.getGame(id);
  }
}
