# 04-Stockfish — Increment 4 Prompt

Self-contained. Copy-paste to AI assistant.

---

Implement Increment 4 of Stockfish: wire computer game moves into GamePage.

## Current state
- Increments 1-3 complete
- useStockfish hook exists and returns { findBestMove, isThinking }
- GamePage exists with useGameSocket providing { gameState, makeMove }
- gameState includes: fen, turn, whiteId, blackId (null for computer games), difficulty

## What to build
Add computer move logic to GamePage. When it's the computer's turn (blackId === null AND turn === 'black'), call findBestMove and then makeMove.

## Changes to `frontend/src/pages/GamePage.tsx`

Add to existing GamePage component:
```typescript
const { findBestMove, isThinking } = useStockfish();
const depthByDifficulty = [1, 3, 5, 10, 15];

useEffect(() => {
  if (!gameState) return;
  const isComputerGame = gameState.blackId === null;
  const isComputerTurn = gameState.turn === 'black' && isComputerGame;
  
  if (isComputerTurn && !isThinking && !gameOver) {
    const depth = depthByDifficulty[(gameState.difficulty ?? 3) - 1];
    findBestMove(gameState.fen, depth).then((uciMove) => {
      if (!uciMove || uciMove === '(none)') return;
      const from = uciMove.slice(0, 2);
      const to = uciMove.slice(2, 4);
      const promotion = uciMove.length === 5 ? uciMove[4] : undefined;
      makeMove(from, to, promotion);
    });
  }
}, [gameState?.fen, gameState?.turn, gameState?.blackId]);
```

## Create `frontend/src/components/EngineThinking.tsx`
```typescript
interface Props { isThinking: boolean; difficulty: number; }
const labels = ['', 'Beginner', 'Easy', 'Medium', 'Hard', 'Expert'];

export function EngineThinking({ isThinking, difficulty }: Props) {
  if (!isThinking) return null;
  return (
    <div className="flex items-center gap-2 text-gray-400 text-sm py-2">
      <div className="flex gap-1">
        {[0,1,2].map(i => (
          <div key={i} className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
        ))}
      </div>
      <span>Engine thinking ({labels[difficulty]})...</span>
    </div>
  );
}
```

Add `<EngineThinking isThinking={isThinking} difficulty={gameState?.difficulty ?? 3} />` to GamePage between the board and the clocks.

## Verification
1. Create a computer game at difficulty 2 (Easy, depth 3)
2. Navigate to /game/:gameId
3. Make white's first move (e.g., e4)
4. See "Engine thinking (Easy)..." indicator
5. Within ~500ms, Stockfish responds with a legal move
6. Board updates with computer's move
7. Clocks are correct throughout
