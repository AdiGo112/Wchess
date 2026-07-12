import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { Chess } from 'chess.js';

@Processor('stockfish')
export class StockfishProcessor {
  private readonly logger = new Logger(StockfishProcessor.name);

  // ponytail: no computer-move job here — per ADR-0009 computer games run Stockfish
  // WASM in the player's browser and relay the move over the 'computer_move' socket
  // event. This processor is analysis-only.

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
}
