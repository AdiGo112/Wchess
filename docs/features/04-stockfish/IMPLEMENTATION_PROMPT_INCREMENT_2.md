# 04-Stockfish — Increment 2 Prompt

Self-contained. Copy-paste to AI assistant.

---

Implement Increment 2 of Stockfish: post-game analysis BullMQ worker and REST API.

## Current state
- Increment 1 complete: StockfishService exists with getBestMove()
- MongoDB connected (use MongoClient or Mongoose — whichever is set up)
- BullMQ installed
- Game model in PostgreSQL has: id, pgn, status fields

## What to build
AnalysisProcessor BullMQ worker + REST controller for requesting and retrieving game analysis.

## MongoDB document structure
Collection: `analysis_results`
```typescript
{
  gameId: string,           // unique
  status: 'pending' | 'done' | 'failed',
  requestedAt: Date,
  completedAt?: Date,
  accuracy: { white: number, black: number },
  opening: { name: string, eco: string, moves: string },
  moves: [{
    moveNumber: number, color: 'white'|'black', san: string,
    from: string, to: string, fen: string,
    evaluation: number,     // centipawns
    bestMove: string,       // SAN of best move
    centipawnLoss: number,
    classification: string  // brilliant|good|inaccuracy|mistake|blunder
  }],
  error?: string
}
```

## StockfishService: add analyzePosition
```typescript
async analyzePosition(fen: string, depth: number): Promise<{ score: number; bestMove: string }> {
  return new Promise((resolve, reject) => {
    const proc = spawn(this.stockfishPath);
    let score = 0;
    let bestMove = '';
    const timeout = setTimeout(() => { proc.kill(); resolve({ score, bestMove }); }, 15000);

    proc.stdout.on('data', (data: Buffer) => {
      const lines = data.toString().split('\n');
      for (const line of lines) {
        // Parse: "info depth 18 seldepth 25 multipv 1 score cp 32 ... pv e2e4 ..."
        if (line.includes(`depth ${depth}`) && line.includes('score cp')) {
          const cpMatch = line.match(/score cp (-?\d+)/);
          const pvMatch = line.match(/\bpv\s+(\S+)/);
          if (cpMatch) score = parseInt(cpMatch[1]);
          if (pvMatch) bestMove = pvMatch[1];
        }
        if (line.startsWith('bestmove')) {
          clearTimeout(timeout);
          proc.kill();
          resolve({ score, bestMove });
          break;
        }
      }
    });
    proc.on('error', () => { clearTimeout(timeout); resolve({ score: 0, bestMove: '' }); });

    proc.stdin.write('uci\n');
    proc.stdin.write('isready\n');
    proc.stdin.write(`position fen ${fen}\n`);
    proc.stdin.write(`go depth ${depth}\n`);
  });
}
```

## StockfishService: add classification helpers
```typescript
classifyMove(centipawnLoss: number): string {
  if (centipawnLoss < 0) return 'brilliant';
  if (centipawnLoss < 20) return 'good';
  if (centipawnLoss < 50) return 'inaccuracy';
  if (centipawnLoss <= 100) return 'mistake';
  return 'blunder';
}

calculateAccuracy(losses: number[]): number {
  if (losses.length === 0) return 100;
  const avg = losses.reduce((a, b) => a + Math.max(0, b), 0) / losses.length;
  return Math.max(0, Math.min(100, Math.round(100 - avg / 10)));
}
```

## AnalysisProcessor
`backend/src/stockfish/workers/analysis.processor.ts`:

Process the job by iterating through all game moves:
1. Parse PGN with chess.js to get all positions
2. For each move: analyzePosition(fenBeforeMove, 18) to get best move and score
3. Apply the actual move: get evaluation after actual move
4. centipawnLoss = evalAfterBest - evalAfterActual (adjusted for color)
5. Classify move
6. Update job progress: job.updateProgress(moveIndex / totalMoves * 100)
7. After all moves: calculateAccuracy for white and black separately
8. Look up opening: import ecoData from '../data/eco.json'; find matching move sequence
9. Upsert MongoDB document

## AnalysisController
`backend/src/stockfish/analysis.controller.ts`:

```typescript
@Post('request')
async requestAnalysis(@Body() dto: { gameId: string }, @Request() req) {
  const game = await this.prisma.game.findUnique({ where: { id: dto.gameId } });
  if (!game) throw new NotFoundException();
  if (game.status === 'ongoing') throw new BadRequestException('Game is not complete');

  // Check if already exists
  const existing = await this.mongoDb.collection('analysis_results').findOne({ gameId: dto.gameId });
  if (existing) return { jobId: existing._id, status: existing.status };

  // Create pending document
  await this.mongoDb.collection('analysis_results').insertOne({
    gameId: dto.gameId, status: 'pending', requestedAt: new Date(), moves: [],
  });

  const job = await this.analysisQueue.add('analyze', { gameId: dto.gameId, pgn: game.pgn, depth: 18 });
  return { jobId: job.id, estimatedSeconds: 30 };
}

@Get(':gameId')
async getAnalysis(@Param('gameId') gameId: string) {
  const result = await this.mongoDb.collection('analysis_results').findOne({ gameId, status: 'done' });
  if (!result) throw new NotFoundException();
  return result;
}

@Get(':gameId/status')
async getStatus(@Param('gameId') gameId: string) {
  const result = await this.mongoDb.collection('analysis_results').findOne({ gameId });
  if (!result) throw new NotFoundException();
  return { status: result.status, progress: result.progress };
}
```

## Verification
1. Complete a game (or use a known completed game ID)
2. POST /analysis/request { gameId } → should return jobId, estimatedSeconds
3. GET /analysis/:gameId/status → should show 'pending' then 'done' after ~30s
4. GET /analysis/:gameId → should return full analysis with move classifications
