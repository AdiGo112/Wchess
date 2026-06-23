import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';

export interface StockfishJob {
  fen: string;
  movetime?: number;
  depth?: number;
  roomId?: string;
  userId?: string;
}

@Injectable()
export class StockfishService {
  private readonly logger = new Logger(StockfishService.name);

  constructor(@InjectQueue('stockfish') private stockfishQueue: Queue) {}

  async queueMove(params: { fen: string; roomId: string; movetime: number }) {
    await this.stockfishQueue.add('computer-move', {
      fen: params.fen,
      roomId: params.roomId,
      movetime: params.movetime,
    });
  }

  async queueAnalysis(params: { fen: string; depth: number; userId: string }) {
    const job = await this.stockfishQueue.add('analysis', {
      fen: params.fen,
      depth: params.depth,
      userId: params.userId,
    });
    return job.id;
  }
}
