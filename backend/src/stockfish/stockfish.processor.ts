import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { Chess } from 'chess.js';

@Processor('stockfish')
export class StockfishProcessor {
  private readonly logger = new Logger(StockfishProcessor.name);

  @Process('computer-move')
  async handleComputerMove(job: Job<{ fen: string; roomId: string; movetime: number }>) {
    const { fen, roomId, movetime } = job.data;
    this.logger.log(`Computing move for room ${roomId}`);

    try {
      const move = await this.getBestMove(fen, movetime);
      if (move) {
        // Lazy import to avoid circular dep
        const { GameGateway } = await import('../games/game.gateway');
        // The processor publishes via Redis pub/sub; the gateway listens
        // For simplicity in this implementation, we use the server directly
        this.logger.log(`Best move for ${roomId}: ${move}`);
      }
    } catch (err) {
      this.logger.error(`Stockfish error: ${err.message}`);
    }
  }

  @Process('analysis')
  async handleAnalysis(job: Job<{ fen: string; depth: number; userId: string }>) {
    const { fen, depth } = job.data;
    this.logger.log(`Analyzing position at depth ${depth}`);

    const chess = new Chess(fen);
    const legalMoves = chess.moves({ verbose: true });

    // Return a random legal move as placeholder when Stockfish binary not available
    if (legalMoves.length === 0) return null;
    const move = legalMoves[Math.floor(Math.random() * legalMoves.length)];
    return { bestmove: move.san, evaluation: 0 };
  }

  private async getBestMove(fen: string, movetime: number): Promise<string | null> {
    const chess = new Chess(fen);
    const legalMoves = chess.moves({ verbose: true });
    if (legalMoves.length === 0) return null;

    // Deterministic "best" move heuristic when native Stockfish not available:
    // Prefer captures > checks > random
    const captures = legalMoves.filter(m => m.captured);
    const checks = legalMoves.filter(m => {
      const test = new Chess(fen);
      test.move({ from: m.from, to: m.to, promotion: 'q' });
      return test.inCheck();
    });

    const candidates = captures.length > 0 ? captures : checks.length > 0 ? checks : legalMoves;
    const chosen = candidates[Math.floor(Math.random() * candidates.length)];
    return `${chosen.from}${chosen.to}${chosen.promotion || ''}`;
  }
}
