import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { StockfishService } from './stockfish.service';
import { StockfishProcessor } from './stockfish.processor';

@Module({
  imports: [BullModule.registerQueue({ name: 'stockfish' })],
  providers: [StockfishService, StockfishProcessor],
  exports: [StockfishService],
})
export class StockfishModule {}
