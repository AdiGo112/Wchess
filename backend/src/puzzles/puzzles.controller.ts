import { Controller, Get, Post, Param, Query, Body, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { PuzzlesService } from './puzzles.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { IsString, IsArray, IsNumber } from 'class-validator';

class SubmitAttemptDto {
  @IsArray() @IsString({ each: true }) moves: string[];
  @IsNumber() timeMs: number;
}

@ApiTags('puzzles')
@Controller('puzzles')
export class PuzzlesController {
  constructor(private puzzles: PuzzlesService) {}

  @Get('daily')
  getDaily() {
    return this.puzzles.getDailyPuzzle();
  }

  @Get('next')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  getNext(@Request() req: any) {
    return this.puzzles.getNext(req.user.id);
  }

  @Get(':id')
  getById(@Param('id') id: string) {
    return this.puzzles.getById(id);
  }

  @Post(':id/attempt')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  submitAttempt(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: SubmitAttemptDto,
  ) {
    return this.puzzles.submitAttempt(req.user.id, id, dto.moves, dto.timeMs);
  }

  @Get()
  getByTheme(@Query('theme') theme: string, @Query('limit') limit = '10') {
    return this.puzzles.getByTheme(theme || 'fork', +limit);
  }
}
