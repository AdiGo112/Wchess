# 04-Stockfish — Frontend Implementation Prompt

---

Implement the Stockfish WASM frontend integration for ChessWeb.

## What exists
- Game engine frontend complete (GamePage, useGameSocket, ChessBoard)
- Vite project (supports Web Workers natively with ?worker suffix)
- stockfish.js package installed (provides stockfish.wasm)

## Build

### Stockfish Web Worker (`frontend/src/workers/stockfish.worker.ts`)
```typescript
import Stockfish from 'stockfish.js';

let engine: any = null;
let resolveMove: ((move: string) => void) | null = null;

function initEngine() {
  if (engine) return;
  engine = Stockfish();
  engine.onmessage = (event: MessageEvent) => {
    const line = typeof event === 'string' ? event : event.data;
    if (line.startsWith('bestmove') && resolveMove) {
      const parts = line.split(' ');
      resolveMove(parts[1]); // e.g. 'e2e4'
      resolveMove = null;
    }
  };
  engine.postMessage('uci');
  engine.postMessage('isready');
}

self.onmessage = (event: MessageEvent) => {
  const { type, fen, depth } = event.data;
  if (type === 'findBestMove') {
    initEngine();
    resolveMove = (move: string) => self.postMessage({ type: 'bestMove', move });
    engine.postMessage(`position fen ${fen}`);
    engine.postMessage(`go depth ${depth}`);
  }
};
```

### useStockfish hook (`frontend/src/hooks/useStockfish.ts`)
```typescript
import StockfishWorker from '../workers/stockfish.worker?worker';

export function useStockfish() {
  const workerRef = useRef<Worker | null>(null);
  const [isThinking, setIsThinking] = useState(false);

  useEffect(() => {
    workerRef.current = new StockfishWorker();
    return () => workerRef.current?.terminate();
  }, []);

  const findBestMove = useCallback((fen: string, depth: number): Promise<string> => {
    return new Promise((resolve) => {
      setIsThinking(true);
      workerRef.current!.onmessage = (event) => {
        if (event.data.type === 'bestMove') {
          setIsThinking(false);
          resolve(event.data.move);
        }
      };
      workerRef.current!.postMessage({ type: 'findBestMove', fen, depth });
    });
  }, []);

  return { findBestMove, isThinking };
}
```

### Integration in GamePage
After move_made event, check if it's the computer's turn:
```typescript
const { findBestMove, isThinking } = useStockfish();
const depthMap = [1, 3, 5, 10, 15]; // difficulty 1-5

useEffect(() => {
  if (gameState?.turn !== playerColor && gameState?.blackId === null) {
    // Computer's turn
    const depth = depthMap[(gameState.difficulty ?? 3) - 1];
    findBestMove(gameState.fen, depth).then((move) => {
      const from = move.slice(0, 2);
      const to = move.slice(2, 4);
      const promotion = move.length === 5 ? move[4] : undefined;
      makeMove(from, to, promotion);
    });
  }
}, [gameState?.fen, gameState?.turn]);
```

Also add "Engine thinking..." indicator when isThinking is true.

Write all files now.
