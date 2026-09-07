import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AnalysisService } from './analysis.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@ApiTags('analysis')
@Controller('analysis')
export class AnalysisController {
  constructor(private analysis: AnalysisService) {}

  @Post(':gameId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Queue a depth-18 analysis of a finished game',
    description:
      'Returns immediately. Poll GET /analysis/:gameId for the result. ' +
      'Already-analysed games return their stored row instead of re-running. ' +
      'Authed because it is the only route on this server that costs real CPU.',
  })
  request(@Param('gameId') gameId: string) {
    return this.analysis.request(gameId);
  }

  @Get(':gameId')
  @ApiOperation({
    summary: 'Read a game analysis',
    description: "status is 'done', 'running' or 'none'. Public, like GET /games/:id.",
  })
  get(@Param('gameId') gameId: string) {
    return this.analysis.get(gameId);
  }
}
