# 02-Game-Engine — Implementation Prompt: Increment 3

Copy and paste to an AI coding assistant. Self-contained.

---

You are implementing Increment 3 of the chess game engine: the React frontend game board and game page.

## Current state
Backend increments 1 and 2 are complete. All Socket.io events work:
- Server emits: game_state, move_made, game_over, draw_offered, draw_declined, clock_update, opponent_disconnected, opponent_reconnected, error
- Client emits: join_room, move, offer_draw, accept_draw, decline_draw, resign

## What you are building
React components for the game UI: board, clocks, draw controls, game over modal.

## Step 1: useGameSocket hook
`frontend/src/hooks/useGameSocket.ts`

```typescript
export function useGameSocket(gameId: string) {
  const { accessToken } = useAuth(); // from AuthContext
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [gameOver, setGameOver] = useState<GameOverResult | null>(null);
  const [drawOffered, setDrawOffered] = useState<string | null>(null); // userId who offered
  const [error, setError] = useState<string | null>(null);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    const socket = io(`${import.meta.env.VITE_API_URL}/game`, {
      auth: { token: accessToken },
    });
    socketRef.current = socket;

    socket.emit('join_room', { gameId });
    socket.on('game_state', (state) => setGameState(state));
    socket.on('move_made', (data) => setGameState(prev => prev ? { ...prev, fen: data.fen, clocks: data.clocks, turn: data.turn, moves: [...prev.moves, data.move] } : prev));
    socket.on('game_over', (data) => setGameOver(data));
    socket.on('draw_offered', (data) => setDrawOffered(data.byUserId));
    socket.on('draw_declined', () => setDrawOffered(null));
    socket.on('clock_update', (clocks) => setGameState(prev => prev ? { ...prev, clocks } : prev));
    socket.on('error', (err) => setError(err.message));

    return () => { socket.disconnect(); };
  }, [gameId, accessToken]);

  const makeMove = (from: string, to: string, promotion?: string) => {
    socketRef.current?.emit('move', { gameId, from, to, promotion });
  };
  const offerDraw = () => socketRef.current?.emit('offer_draw', { gameId });
  const acceptDraw = () => socketRef.current?.emit('accept_draw', { gameId });
  const declineDraw = () => socketRef.current?.emit('decline_draw', { gameId });
  const resign = () => socketRef.current?.emit('resign', { gameId });

  return { gameState, gameOver, drawOffered, error, makeMove, offerDraw, acceptDraw, declineDraw, resign };
}
```

## Step 2: ChessBoard component
`frontend/src/components/ChessBoard.tsx`

Use `react-chessboard` package (npm install react-chessboard chess.js).

```typescript
import { Chessboard } from 'react-chessboard';

interface ChessBoardProps {
  fen: string;
  playerColor: 'white' | 'black';
  onMove: (from: string, to: string, promotion?: string) => void;
  lastMove?: { from: string; to: string };
}

export function ChessBoard({ fen, playerColor, onMove, lastMove }: ChessBoardProps) {
  // Custom square styles for last move highlight
  const customSquareStyles: Record<string, CSSProperties> = {};
  if (lastMove) {
    customSquareStyles[lastMove.from] = { backgroundColor: 'rgba(255, 255, 0, 0.4)' };
    customSquareStyles[lastMove.to] = { backgroundColor: 'rgba(255, 255, 0, 0.4)' };
  }

  function onDrop(sourceSquare: string, targetSquare: string, piece: string) {
    // Check if promotion needed
    const isPromotion = piece[1] === 'P' && (targetSquare[1] === '8' || targetSquare[1] === '1');
    if (isPromotion) {
      // For v1, always promote to queen
      onMove(sourceSquare, targetSquare, 'q');
    } else {
      onMove(sourceSquare, targetSquare);
    }
    return true; // Optimistically accept; server will reject if illegal
  }

  return (
    <Chessboard
      position={fen}
      onPieceDrop={onDrop}
      boardOrientation={playerColor}
      customSquareStyles={customSquareStyles}
      arePiecesDraggable={true}
    />
  );
}
```

## Step 3: GameClock component
`frontend/src/components/GameClock.tsx`

```typescript
interface GameClockProps { time: number; isActive: boolean; label: string; }

export function GameClock({ time, isActive, label }: GameClockProps) {
  const totalSeconds = Math.ceil(time / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const display = `${minutes}:${seconds.toString().padStart(2, '0')}`;
  const isLow = time < 30000;

  return (
    <div className={`flex items-center justify-between p-3 rounded-lg font-mono text-2xl font-bold
      ${isActive ? 'bg-white text-black' : 'bg-gray-700 text-gray-300'}
      ${isLow && isActive ? 'text-red-500 animate-pulse' : ''}`}>
      <span className="text-sm font-normal text-gray-400">{label}</span>
      <span>{display}</span>
    </div>
  );
}
```

## Step 4: GameOver modal
`frontend/src/components/GameOver.tsx`

Show a centered modal overlay with: result message (You Win / You Lose / Draw), reason (checkmate, timeout, etc.), rating change (+12 or -8 etc.). Buttons: Analyze Game (→ /analysis/:gameId), New Game (→ /dashboard), Close.

## Step 5: DrawControls
`frontend/src/components/DrawControls.tsx`

Show three buttons: Offer Draw, Resign, and (conditionally) Accept Draw / Decline Draw when drawOffered is set. Resign requires a window.confirm. Offer Draw is disabled if drawOffered is already set by this player.

## Step 6: GamePage
`frontend/src/pages/GamePage.tsx`

```typescript
export default function GamePage() {
  const { gameId } = useParams<{ gameId: string }>();
  const { user } = useAuth();
  const { gameState, gameOver, drawOffered, makeMove, offerDraw, acceptDraw, declineDraw, resign } = useGameSocket(gameId!);

  if (!gameState) return <div>Connecting...</div>;

  const playerColor = gameState.whiteId === user?.id ? 'white' : 'black';
  const myTime = playerColor === 'white' ? gameState.clocks.white : gameState.clocks.black;
  const opponentTime = playerColor === 'white' ? gameState.clocks.black : gameState.clocks.white;

  return (
    <div className="flex min-h-screen bg-gray-900 text-white">
      <div className="flex flex-col items-center justify-center flex-1 p-4">
        <GameClock time={opponentTime} isActive={gameState.turn !== playerColor} label="Opponent" />
        <div className="my-4 w-full max-w-[560px]">
          <ChessBoard
            fen={gameState.fen}
            playerColor={playerColor}
            onMove={makeMove}
            lastMove={gameState.moves[gameState.moves.length - 1]}
          />
        </div>
        <GameClock time={myTime} isActive={gameState.turn === playerColor} label="You" />
        <DrawControls
          onOfferDraw={offerDraw}
          onAcceptDraw={acceptDraw}
          onDeclineDraw={declineDraw}
          onResign={resign}
          drawOffered={drawOffered}
          myUserId={user?.id}
        />
      </div>
      {gameOver && <GameOver result={gameOver} gameId={gameId!} />}
    </div>
  );
}
```

## Verification
1. Open two browser tabs, log in as different users
2. Create a game (use the matchmaking feature or manually set a gameId in Redis)
3. Both tabs navigate to /game/:gameId
4. Make moves alternately — board updates in both tabs
5. Offer draw from tab 1 — tab 2 sees accept/decline buttons
6. Let clock run out — game_over modal appears

Write all files now.
