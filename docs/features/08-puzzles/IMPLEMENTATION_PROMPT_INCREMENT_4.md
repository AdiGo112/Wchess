# Feature 08 — Puzzles: Increment 4 Implementation Prompt

Copy and paste the following prompt into a fresh AI conversation. It is fully self-contained.

---

You are implementing Increment 4 of the Puzzles feature for ChessWeb, a NestJS + React chess application. The backend (Increments 1–3) is fully complete: all five API endpoints work (`GET /puzzles/daily`, `GET /puzzles/next`, `GET /puzzles/:id`, `POST /puzzles/:id/attempt`, `GET /puzzles/stats`). This increment is frontend-only.

## What Increment 4 Delivers

An interactive puzzle-solving page at `/puzzles/:id`. The user sees a chessboard with the puzzle position. The opponent's first move auto-plays after 500 ms. The user drags pieces to make moves; correct moves advance the puzzle, incorrect moves flash red. The puzzle ends when all user moves are correct (solved) or the user clicks "Give Up" (failed). On completion, `POST /puzzles/:id/attempt` is called and the rating delta + next review date are shown.

## Project Context

- **Frontend**: React 18, TypeScript, TanStack Query v5, Zustand, react-chessboard, chess.js
- **Router**: React Router v6
- **API base URL**: `http://localhost:3000` (or `VITE_API_URL` env var)
- **Auth**: JWT stored in Zustand auth slice; TanStack Query mutation uses `fetch` with `Authorization: Bearer <token>` header
- **File locations**: `frontend/src/`

## Step 1: API Client

Create `frontend/src/api/puzzles.ts`:
```typescript
const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

export async function fetchPuzzleById(id: string) {
  const res = await fetch(`${API_URL}/puzzles/${id}`);
  if (!res.ok) throw new Error(`Puzzle not found: ${id}`);
  return res.json();
}

export async function fetchNextPuzzle(token: string) {
  const res = await fetch(`${API_URL}/puzzles/next`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('No puzzles available');
  return res.json();
}

export async function submitAttempt(
  puzzleId: string,
  solved: boolean,
  timeTaken: number,
  token: string,
) {
  const res = await fetch(`${API_URL}/puzzles/${puzzleId}/attempt`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ solved, timeTaken }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message ?? 'Attempt failed');
  }
  return res.json();
}
```

## Step 2: Zustand Puzzle Slice

Create `frontend/src/store/puzzleSlice.ts`:
```typescript
import { create } from 'zustand';

interface PuzzleState {
  currentPuzzleId: string | null;
  puzzleSolved: boolean | null; // null = in progress, true = solved, false = failed
  movesPlayed: string[];        // UCI moves played so far
  attemptStartTime: number | null;
  attemptSubmitted: boolean;    // idempotent guard

  startPuzzle: (puzzleId: string) => void;
  playMove: (move: string) => void;
  finishPuzzle: (solved: boolean) => void;
  markSubmitted: () => void;
  resetPuzzle: () => void;
}

export const usePuzzleStore = create<PuzzleState>((set) => ({
  currentPuzzleId: null,
  puzzleSolved: null,
  movesPlayed: [],
  attemptStartTime: null,
  attemptSubmitted: false,

  startPuzzle: (puzzleId) =>
    set({
      currentPuzzleId: puzzleId,
      puzzleSolved: null,
      movesPlayed: [],
      attemptStartTime: Date.now(),
      attemptSubmitted: false,
    }),

  playMove: (move) =>
    set((state) => ({ movesPlayed: [...state.movesPlayed, move] })),

  finishPuzzle: (solved) =>
    set({ puzzleSolved: solved }),

  markSubmitted: () =>
    set({ attemptSubmitted: true }),

  resetPuzzle: () =>
    set({
      currentPuzzleId: null,
      puzzleSolved: null,
      movesPlayed: [],
      attemptStartTime: null,
      attemptSubmitted: false,
    }),
}));
```

## Step 3: usePuzzle Hook

Create `frontend/src/hooks/usePuzzle.ts`:
```typescript
import { useQuery } from '@tanstack/react-query';
import { fetchPuzzleById } from '../api/puzzles';

export function usePuzzle(id: string) {
  return useQuery({
    queryKey: ['puzzle', id],
    queryFn: () => fetchPuzzleById(id),
    staleTime: Infinity, // puzzle FEN never changes
  });
}
```

## Step 4: useAttemptPuzzle Hook

Create `frontend/src/hooks/useAttemptPuzzle.ts`:
```typescript
import { useMutation } from '@tanstack/react-query';
import { submitAttempt } from '../api/puzzles';
import { useAuthStore } from '../store/authStore'; // adjust import to your auth store

export function useAttemptPuzzle() {
  const token = useAuthStore((s) => s.accessToken);

  return useMutation({
    mutationFn: ({
      puzzleId,
      solved,
      timeTaken,
    }: {
      puzzleId: string;
      solved: boolean;
      timeTaken: number;
    }) => submitAttempt(puzzleId, solved, timeTaken, token!),
  });
}
```

## Step 5: PuzzleBoard Component

Create `frontend/src/components/puzzle/PuzzleBoard.tsx`:
```typescript
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Chessboard } from 'react-chessboard';
import { Chess } from 'chess.js';
import { usePuzzleStore } from '../../store/puzzleSlice';

interface PuzzleBoardProps {
  puzzleId: string;
  fen: string;
  moves: string; // space-separated UCI move string
  onComplete: (solved: boolean) => void;
}

// Convert UCI string (e.g. "e2e4") to chess.js move format { from, to, promotion? }
function uciToMove(uci: string) {
  return {
    from: uci.slice(0, 2),
    to: uci.slice(2, 4),
    promotion: uci.length === 5 ? uci[4] : undefined,
  };
}

export function PuzzleBoard({ puzzleId, fen, moves, onComplete }: PuzzleBoardProps) {
  const moveList = moves.split(' ').filter(Boolean);
  // moveList[0] = opponent's opening move (auto-played)
  // moveList[1], [3], [5], ... = user's expected moves
  // moveList[2], [4], [6], ... = opponent's responses (auto-played)

  const gameRef = useRef(new Chess(fen));
  const [boardPosition, setBoardPosition] = useState(fen);
  const [moveIndex, setMoveIndex] = useState(0); // index into moveList
  const [flashError, setFlashError] = useState(false);
  const [isOpponentTurn, setIsOpponentTurn] = useState(false);

  const { startPuzzle, playMove } = usePuzzleStore();

  // Determine board orientation from FEN (whose turn to move after opponent's first move)
  const fenTurn = fen.split(' ')[1]; // 'w' or 'b'
  const userColor = fenTurn === 'w' ? 'black' : 'white'; // user plays the side that moves second
  // Actually: after opponent's move[0], it's the user's turn; user plays the FEN active color
  const boardOrientation: 'white' | 'black' = fenTurn === 'w' ? 'white' : 'black';

  useEffect(() => {
    startPuzzle(puzzleId);
    gameRef.current = new Chess(fen);
    setMoveIndex(0);
    setBoardPosition(fen);

    // Auto-play opponent's first move after 500ms
    const timeout = setTimeout(() => {
      applyMove(0);
    }, 500);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puzzleId, fen, moves]);

  const applyMove = useCallback(
    (index: number) => {
      if (index >= moveList.length) return;
      const uci = moveList[index];
      const move = uciToMove(uci);
      const result = gameRef.current.move(move);
      if (!result) return;
      setBoardPosition(gameRef.current.fen());
      setMoveIndex(index + 1);
    },
    [moveList],
  );

  const handlePieceDrop = useCallback(
    (sourceSquare: string, targetSquare: string, piece: string): boolean => {
      if (isOpponentTurn) return false;
      if (moveIndex >= moveList.length) return false;

      const expectedUCI = moveList[moveIndex];
      const droppedUCI = `${sourceSquare}${targetSquare}`;

      // Check promotion
      const promotion =
        piece[1] === 'P' &&
        (targetSquare[1] === '8' || targetSquare[1] === '1')
          ? 'q' // auto-queen for simplicity
          : undefined;

      const fullDropped = promotion ? `${droppedUCI}${promotion}` : droppedUCI;

      if (fullDropped !== expectedUCI) {
        // Wrong move — flash red
        setFlashError(true);
        setTimeout(() => setFlashError(false), 800);
        return false; // reject move — board stays unchanged
      }

      // Correct move
      const result = gameRef.current.move(uciToMove(expectedUCI));
      if (!result) return false;

      setBoardPosition(gameRef.current.fen());
      playMove(expectedUCI);
      const nextIndex = moveIndex + 1;
      setMoveIndex(nextIndex);

      // Check if puzzle is complete
      if (nextIndex >= moveList.length) {
        onComplete(true);
        return true;
      }

      // Auto-play opponent's response
      setIsOpponentTurn(true);
      setTimeout(() => {
        applyMove(nextIndex);
        setIsOpponentTurn(false);
        // Check if puzzle is now complete after opponent's response
        if (nextIndex + 1 >= moveList.length) {
          onComplete(true);
        }
      }, 300);

      return true;
    },
    [moveIndex, moveList, isOpponentTurn, applyMove, playMove, onComplete],
  );

  const boardStyle = flashError
    ? { border: '4px solid #e53e3e', transition: 'border-color 0.1s' }
    : {};

  return (
    <div data-testid="chess-board" style={{ width: 500, ...boardStyle }}>
      <Chessboard
        position={boardPosition}
        onPieceDrop={handlePieceDrop}
        boardOrientation={boardOrientation}
        arePiecesDraggable={!isOpponentTurn}
        customBoardStyle={{ borderRadius: '4px' }}
      />
    </div>
  );
}
```

## Step 6: PuzzleResult Component

Create `frontend/src/components/puzzle/PuzzleResult.tsx`:
```typescript
import React from 'react';

interface AttemptResult {
  solved: boolean;
  quality: number;
  nextReview: string;
  ratingDelta: {
    userRatingBefore: number;
    userRatingAfter: number;
    puzzleRatingBefore: number;
    puzzleRatingAfter: number;
  };
  sm2State: {
    easeFactor: number;
    interval: number;
    repetitions: number;
  };
}

interface PuzzleResultProps {
  result: AttemptResult;
  onNext: () => void;
}

export function PuzzleResult({ result, onNext }: PuzzleResultProps) {
  const ratingChange = result.ratingDelta.userRatingAfter - result.ratingDelta.userRatingBefore;
  const ratingSign = ratingChange >= 0 ? '+' : '';
  const nextReviewDate = new Date(result.nextReview);
  const daysUntil = Math.round(
    (nextReviewDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24),
  );

  return (
    <div data-testid="puzzle-result" style={{ marginTop: 24, textAlign: 'center' }}>
      <h2 style={{ color: result.solved ? '#38a169' : '#e53e3e' }}>
        {result.solved ? 'Puzzle Solved!' : 'Puzzle Failed'}
      </h2>
      <p data-testid="rating-delta" style={{ fontSize: 18 }}>
        {ratingSign}{ratingChange} puzzle rating
        {' '}({result.ratingDelta.userRatingBefore} → {result.ratingDelta.userRatingAfter})
      </p>
      {result.solved && (
        <p>
          Next review in <strong>{daysUntil} day{daysUntil !== 1 ? 's' : ''}</strong>
        </p>
      )}
      <button
        onClick={onNext}
        style={{
          marginTop: 16,
          padding: '10px 24px',
          backgroundColor: '#3182ce',
          color: 'white',
          border: 'none',
          borderRadius: 4,
          cursor: 'pointer',
          fontSize: 16,
        }}
      >
        Next Puzzle
      </button>
    </div>
  );
}
```

## Step 7: PuzzleControls Component

Create `frontend/src/components/puzzle/PuzzleControls.tsx`:
```typescript
import React from 'react';

interface PuzzleControlsProps {
  onGiveUp: () => void;
  disabled?: boolean;
}

export function PuzzleControls({ onGiveUp, disabled }: PuzzleControlsProps) {
  return (
    <div style={{ marginTop: 16, display: 'flex', gap: 12 }}>
      <button
        onClick={onGiveUp}
        disabled={disabled}
        style={{
          padding: '8px 20px',
          backgroundColor: '#e53e3e',
          color: 'white',
          border: 'none',
          borderRadius: 4,
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.5 : 1,
        }}
      >
        Give Up
      </button>
    </div>
  );
}
```

## Step 8: PuzzlePage

Create `frontend/src/pages/PuzzlePage.tsx`:
```typescript
import React, { useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { usePuzzle } from '../hooks/usePuzzle';
import { useAttemptPuzzle } from '../hooks/useAttemptPuzzle';
import { usePuzzleStore } from '../store/puzzleSlice';
import { PuzzleBoard } from '../components/puzzle/PuzzleBoard';
import { PuzzleResult } from '../components/puzzle/PuzzleResult';
import { PuzzleControls } from '../components/puzzle/PuzzleControls';

export default function PuzzlePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: puzzle, isLoading, error } = usePuzzle(id!);
  const { mutate: submitAttempt, data: attemptResult } = useAttemptPuzzle();

  const {
    puzzleSolved,
    attemptStartTime,
    attemptSubmitted,
    finishPuzzle,
    markSubmitted,
    resetPuzzle,
  } = usePuzzleStore();

  const handleComplete = useCallback(
    (solved: boolean) => {
      if (attemptSubmitted) return; // idempotent guard
      finishPuzzle(solved);
      markSubmitted();

      const timeTaken = attemptStartTime ? Date.now() - attemptStartTime : 0;
      submitAttempt({ puzzleId: id!, solved, timeTaken });
    },
    [attemptSubmitted, finishPuzzle, markSubmitted, attemptStartTime, id, submitAttempt],
  );

  const handleGiveUp = useCallback(() => {
    handleComplete(false);
  }, [handleComplete]);

  const handleNext = useCallback(() => {
    resetPuzzle();
    navigate('/puzzles');
  }, [resetPuzzle, navigate]);

  if (isLoading) return <div>Loading puzzle...</div>;
  if (error) return <div>Puzzle not found.</div>;
  if (!puzzle) return null;

  return (
    <div style={{ maxWidth: 560, margin: '40px auto', padding: '0 16px' }}>
      <h1 style={{ fontSize: 20, marginBottom: 8 }}>
        Puzzle #{puzzle.id}
        <span style={{ fontSize: 14, color: '#718096', marginLeft: 12 }}>
          Rating: {Math.round(puzzle.rating)}
        </span>
      </h1>
      <div style={{ fontSize: 13, color: '#718096', marginBottom: 16 }}>
        Themes: {puzzle.themes.join(', ')}
      </div>

      {puzzleSolved === null && (
        <>
          <PuzzleBoard
            puzzleId={puzzle.id}
            fen={puzzle.fen}
            moves={puzzle.moves}
            onComplete={handleComplete}
          />
          <PuzzleControls onGiveUp={handleGiveUp} />
        </>
      )}

      {puzzleSolved !== null && attemptResult && (
        <PuzzleResult result={attemptResult} onNext={handleNext} />
      )}

      {puzzleSolved !== null && !attemptResult && (
        <div>Saving result...</div>
      )}
    </div>
  );
}
```

## Step 9: Add Route to React Router

In `frontend/src/router/index.tsx` (or wherever routes are defined), add:
```typescript
import React, { lazy, Suspense } from 'react';
const PuzzlePage = lazy(() => import('../pages/PuzzlePage'));

// Inside your Routes:
<Route
  path="/puzzles/:id"
  element={
    <Suspense fallback={<div>Loading...</div>}>
      <PuzzlePage />
    </Suspense>
  }
/>
```

## Verification

```bash
# Start the dev server
cd frontend && npm run dev

# Navigate to a known puzzle
open http://localhost:5173/puzzles/00008

# Checklist:
# 1. Chessboard renders with the correct position
# 2. After ~500ms, the opponent's first move plays automatically
# 3. Dragging a correct piece causes it to land and opponent responds
# 4. Dragging a wrong piece shows red flash for ~800ms
# 5. Completing all moves shows "Puzzle Solved!" with rating change
# 6. Clicking "Give Up" shows "Puzzle Failed"
# 7. "Next Puzzle" navigates to /puzzles
```

Install dependencies if needed:
```bash
npm install react-chessboard chess.js
```
