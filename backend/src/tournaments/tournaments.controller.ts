import { Controller, Get, Post, Delete, Param, Query, Body, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { TournamentsService } from './tournaments.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@ApiTags('tournaments')
@Controller('tournaments')
export class TournamentsController {
  constructor(private tournaments: TournamentsService) {}

  @Get()
  list(@Query('status') status?: string) {
    return this.tournaments.list(status);
  }

  @Get(':id')
  getById(@Param('id') id: string) {
    return this.tournaments.getById(id);
  }

  @Get(':id/standings')
  getStandings(@Param('id') id: string) {
    return this.tournaments.getStandings(id);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  create(@Request() req: any, @Body() body: any) {
    return this.tournaments.create(req.user.id, body);
  }

  @Post(':id/join')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  join(@Request() req: any, @Param('id') id: string) {
    return this.tournaments.join(id, req.user.id);
  }

  @Delete(':id/leave')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  leave(@Request() req: any, @Param('id') id: string) {
    return this.tournaments.leave(id, req.user.id);
  }
}
