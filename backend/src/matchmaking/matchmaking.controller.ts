import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { MatchmakingService } from './matchmaking.service';
import { CreateChallengeDto } from './dto/create-challenge.dto';
import { CreateComputerGameDto } from './dto/create-computer-game.dto';

@ApiTags('matchmaking')
@ApiBearerAuth()
@Controller('matchmaking')
@UseGuards(JwtAuthGuard)
export class MatchmakingController {
  constructor(private readonly matchmaking: MatchmakingService) {}

  /** Create a shareable friend-challenge link (valid 10 minutes). */
  @Post('challenge')
  createChallenge(@Body() dto: CreateChallengeDto, @Request() req) {
    return this.matchmaking.createChallenge(req.user.id, dto);
  }

  /** Accept a challenge by token; creates the game room and returns it. */
  @Post('challenge/:token/accept')
  acceptChallenge(@Param('token') token: string, @Request() req) {
    return this.matchmaking.acceptChallenge(token, req.user.id);
  }

  /** Create a vs-computer game immediately (no queue). */
  @Post('computer')
  createComputerGame(@Body() dto: CreateComputerGameDto, @Request() req) {
    return this.matchmaking.createComputerGame(req.user.id, dto);
  }

  /** Whether the caller is currently sitting in a matchmaking queue. */
  @Get('queue-status')
  queueStatus(@Request() req) {
    return this.matchmaking.getQueueStatus(req.user.id);
  }
}
