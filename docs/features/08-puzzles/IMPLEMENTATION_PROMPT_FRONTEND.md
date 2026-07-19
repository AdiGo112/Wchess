# Feature 08 — Puzzles: Frontend Implementation Prompt (Increments 4–5)

Copy and paste the following prompt into a fresh AI conversation. It is fully self-contained. This covers both frontend increments (4 and 5) in one shot.

---

You are implementing the complete frontend for the Puzzles feature of ChessWeb, a NestJS + React chess application. The backend is fully complete — all seven API endpoints work (`GET /puzzles/daily`, `GET /puzzles/next`, `GET /puzzles/themes`, `GET /puzzles/stats`, `GET /puzzles/:id`, `GET /puzzles`, `POST /puzzles/:id/attempt`). This prompt is frontend-only.

## Tech Stack

- React 18, TypeScript, Vite
- TanStack Query v5 (`@tanstack/react-query`)
- Zustand (`zustand`)
- React Router v6
- `react-chessboard` — interactive chessboard component
- `chess.js` — move validation and FEN parsing
- API base URL: `import.meta.env.VITE_API_URL ?? 'http://localhost:3000'`
- Auth: JWT stored in Zustand auth store; access via `useAuthStore((s) => s.accessToken)`
- Frontend source root: `frontend/src/`

## What This Prompt Builds

**Increment 4 — Interactive Puzzle Solving:**
- `/puzzles/:id` page with interactive `react-chessboard`
- Opponent's first move auto-plays at 500 ms; opponent responses auto-play at 300 ms
- Correct moves advance the puzzle; wrong moves flash board red (800 ms) and allow retry
- "Give Up" button marks puzzle as failed
- On completion: POST attempt to backend, show rating delta and next review date
- Zustand `puzzleSlice` for attempt state

**Increment 5 — Browse and Discovery:**
- `/puzzles` — paginated, filterable puzzle list (theme dropdown + rating range sliders)
- `/puzzles/daily` — redirects to today's puzzle page
- `DailyPuzzleWidget` — embeddable preview board for the dashboard with "Solve Today's Puzzle" CTA
- `StreakDisplay` and `PuzzleRatingDisplay` — auth-gated stats shown on the list page

Install dependencies:
```bash
cd frontend && npm install react-chessboard chess.js date-fns
```

---

## Part 1: API Client

Create `frontend/src/api/puzzles.ts`:
```typescript
const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

export async function fetchPuzzleById(id: string) {
  const res = await fetch(`${API_URL}/puzzles/${id}`);
  if (!res.ok) throw new Error(`Puzzle not found: ${id}`);
  return res.json();
}

export async function fetchDailyPuzzle() {
  const res = await fetch(`${API_URL}/puzzles/daily`);
  if (!res.ok) throw new Error('Daily puzzle unavailable');
  return res.json();
}

export async function fetchNextPuzzle(token: string) {
  const res = await fetch(`${API_URL}/puzzles/next`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('No puzzles available');
  return res.json();
}

export interface PuzzleListParams {
  theme?: string;
  minRating?: number;
  maxRating?: number;
  page?: number;
  limit?: number;
}

export async function fetchPuzzleList(params: PuzzleListParams = {}) {
  const query = new URLSearchParams();
  if (params.theme) query.set('theme', params.theme);
  if (params.minRating !== undefined) query.set('minRating', String(params.minRating));
  if (params.maxRating !== undefined) query.set('maxRating', String(params.maxRating));
  if (params.page) query.set('page', String(params.page));
  if (params.limit) query.set('limit', String(params.limit));
  const res = await fetch(`${API_URL}/puzzles?${query}`);
  if (!res.ok) throw new Error('Failed to fetch puzzles');
  return res.json() as Promise<{
    data: any[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }>;
}

export async function fetchPuzzleThemes() {
  const res = await fetch(`${API_URL}/puzzles/themes`);
  if (!res.ok) throw new Error('Failed to fetch themes');
  return res.json() as Promise<{ themes: { name: string; count: number }[] }>;
}

export async function fetchPuzzleStats(token: string) {
  const res = await fetch(`${API_URL}/puzzles/stats`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Failed to fetch puzzle stats');
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
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ solved, timeTaken }),
  });
  if (!res.ok) { const err = await res.json(); throw new Error(err.message ?? 'Attempt failed'); }
  return res.json();
}
```

---

## Part 2: Zustand Puzzle Slice

Create `frontend/src/store/puzzleSlice.ts`:
```typescript
import { create } from 'zustand';

interface PuzzleState {
  currentPuzzleId: string | null;
  puzzleSolved: boolean | null;
  movesPlayed: string[];
  attemptStartTime: number | null;
  attemptSubmitted: boolean;
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
    set({ currentPuzzleId: puzzleId, puzzleSolved: null, movesPlayed: [], attemptStartTime: Date.now(), attemptSubmitted: false }),
  playMove: (move) => set((s) => ({ movesPlayed: [...s.movesPlayed, move] })),
  finishPuzzle: (solved) => set({ puzzleSolved: solved }),
  markSubmitted: () => set({ attemptSubmitted: true }),
  resetPuzzle: () =>
    set({ currentPuzzleId: null, puzzleSolved: null, movesPlayed: [], attemptStartTime: null, attemptSubmitted: false }),
}));
```

---

## Part 3: TanStack Query Hooks

Create `frontend/src/hooks/usePuzzle.ts`:
```typescript
import { useQuery } from '@tanstack/react-query';
import { fetchPuzzleById } from '../api/puzzles';

export function usePuzzle(id: string) {
  return useQuery({ queryKey: ['puzzle', id], queryFn: () => fetchPuzzleById(id), staleTime: Infinity });
}
```

Create `frontend/src/hooks/useAttemptPuzzle.ts`:
```typescript
import { useMutation } from '@tanstack/react-query';
import { submitAttempt } from '../api/puzzles';
import { useAuthStore } from '../store/authStore'; // adjust to your auth store path

export function useAttemptPuzzle() {
  const token = useAuthStore((s) => s.accessToken);
  return useMutation({
    mutationFn: ({ puzzleId, solved, timeTaken }: { puzzleId: string; solved: boolean; timeTaken: number }) =>
      submitAttempt(puzzleId, solved, timeTaken, token!),
  });
}
```

Create `frontend/src/hooks/useDailyPuzzle.ts`:
```typescript
import { useQuery } from '@tanstack/react-query';
import { fetchDailyPuzzle } from '../api/puzzles';

export function useDailyPuzzle() {
  return useQuery({ queryKey: ['puzzle', 'daily'], queryFn: fetchDailyPuzzle, staleTime: 60 * 60 * 1000 });
}
```

Create `frontend/src/hooks/usePuzzleList.ts`:
```typescript
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { fetchPuzzleList, PuzzleListParams } from '../api/puzzles';

export function usePuzzleList(params: PuzzleListParams) {
  return useQuery({ queryKey: ['puzzles', 'list', params], queryFn: () => fetchPuzzleList(params), placeholderData: keepPreviousData, staleTime: 5 * 60 * 1000 });
}
```

Create `frontend/src/hooks/usePuzzleThemes.ts`:
```typescript
import { useQuery } from '@tanstack/react-query';
import { fetchPuzzleThemes } from '../api/puzzles';

export function usePuzzleThemes() {
  return useQuery({ queryKey: ['puzzles', 'themes'], queryFn: fetchPuzzleThemes, staleTime: Infinity });
}
```

Create `frontend/src/hooks/usePuzzleStats.ts`:
```typescript
import { useQuery } from '@tanstack/react-query';
import { fetchPuzzleStats } from '../api/puzzles';
import { useAuthStore } from '../store/authStore';

export function usePuzzleStats() {
  const token = useAuthStore((s) => s.accessToken);
  return useQuery({ queryKey: ['puzzles', 'stats', token], queryFn: () => fetchPuzzleStats(token!), enabled: !!token, staleTime: 60 * 1000 });
}
```

---

## Part 4: PuzzleBoard Component

Create `frontend/src/components/puzzle/PuzzleBoard.tsx`:
```typescript
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Chessboard } from 'react-chessboard';
import { Chess } from 'chess.js';
import { usePuzzleStore } from '../../store/puzzleSlice';

interface PuzzleBoardProps {
  puzzleId: string;
  fen: string;
  moves: string;
  onComplete: (solved: boolean) => void;
}

function uciToMove(uci: string) {
  return { from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci.length === 5 ? uci[4] : undefined };
}

export function PuzzleBoard({ puzzleId, fen, moves, onComplete }: PuzzleBoardProps) {
  const moveList = moves.split(' ').filter(Boolean);
  const gameRef = useRef(new Chess(fen));
  const [boardPosition, setBoardPosition] = useState(fen);
  const [moveIndex, setMoveIndex] = useState(0);
  const [flashError, setFlashError] = useState(false);
  const [isOpponentTurn, setIsOpponentTurn] = useState(false);
  const { startPuzzle, playMove } = usePuzzleStore();

  // Orientation: user plays the side that moves after the opponent's opening
  const fenTurn = fen.split(' ')[1]; // 'w' or 'b' — whose turn it is in the FEN
  const boardOrientation: 'white' | 'black' = fenTurn === 'w' ? 'white' : 'black';

  const applyMove = useCallback((index: number) => {
    if (index >= moveList.length) return;
    const result = gameRef.current.move(uciToMove(moveList[index]));
    if (!result) return;
    setBoardPosition(gameRef.current.fen());
    setMoveIndex(index + 1);
  }, [moveList]);

  useEffect(() => {
    startPuzzle(puzzleId);
    gameRef.current = new Chess(fen);
    setBoardPosition(fen);
    setMoveIndex(0);
    setFlashError(false);
    setIsOpponentTurn(false);
    const t = setTimeout(() => applyMove(0), 500);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puzzleId, fen, moves]);

  const handlePieceDrop = useCallback(
    (sourceSquare: string, targetSquare: string, piece: string): boolean => {
      if (isOpponentTurn || moveIndex >= moveList.length) return false;
      const expectedUCI = moveList[moveIndex];
      const isPromotion = piece[1] === 'P' && (targetSquare[1] === '8' || targetSquare[1] === '1');
      const droppedUCI = `${sourceSquare}${targetSquare}${isPromotion ? 'q' : ''}`;

      if (droppedUCI !== expectedUCI) {
        setFlashError(true);
        setTimeout(() => setFlashError(false), 800);
        return false;
      }

      const result = gameRef.current.move(uciToMove(expectedUCI));
      if (!result) return false;

      setBoardPosition(gameRef.current.fen());
      playMove(expectedUCI);
      const nextIndex = moveIndex + 1;
      setMoveIndex(nextIndex);

      if (nextIndex >= moveList.length) { onComplete(true); return true; }

      setIsOpponentTurn(true);
      setTimeout(() => {
        applyMove(nextIndex);
        setIsOpponentTurn(false);
        if (nextIndex + 1 >= moveList.length) onComplete(true);
      }, 300);

      return true;
    },
    [moveIndex, moveList, isOpponentTurn, applyMove, playMove, onComplete],
  );

  return (
    <div
      data-testid="chess-board"
      style={{
        width: 500,
        border: flashError ? '4px solid #e53e3e' : '4px solid transparent',
        transition: 'border-color 0.1s',
        borderRadius: 8,
      }}
    >
      <Chessboard
        position={boardPosition}
        onPieceDrop={handlePieceDrop}
        boardOrientation={boardOrientation}
        arePiecesDraggable={!isOpponentTurn}
        boardWidth={492}
      />
    </div>
  );
}
```

---

## Part 5: PuzzleResult Component

Create `frontend/src/components/puzzle/PuzzleResult.tsx`:
```typescript
import React from 'react';

interface AttemptResult {
  solved: boolean;
  quality: number;
  nextReview: string;
  ratingDelta: { userRatingBefore: number; userRatingAfter: number; puzzleRatingBefore: number; puzzleRatingAfter: number; };
  sm2State: { easeFactor: number; interval: number; repetitions: number; };
}

interface PuzzleResultProps { result: AttemptResult; onNext: () => void; }

export function PuzzleResult({ result, onNext }: PuzzleResultProps) {
  const ratingChange = result.ratingDelta.userRatingAfter - result.ratingDelta.userRatingBefore;
  const daysUntil = Math.round((new Date(result.nextReview).getTime() - Date.now()) / 86400000);

  return (
    <div data-testid="puzzle-result" style={{ marginTop: 24, textAlign: 'center' }}>
      <h2 style={{ color: result.solved ? '#38a169' : '#e53e3e', fontSize: 24, margin: '0 0 12px' }}>
        {result.solved ? 'Puzzle Solved!' : 'Puzzle Failed'}
      </h2>
      <p data-testid="rating-delta" style={{ fontSize: 18, margin: '0 0 8px' }}>
        {ratingChange >= 0 ? '+' : ''}{ratingChange} puzzle rating
        <span style={{ color: '#718096', fontSize: 14, marginLeft: 8 }}>
          ({result.ratingDelta.userRatingBefore} → {result.ratingDelta.userRatingAfter})
        </span>
      </p>
      {result.solved && (
        <p style={{ color: '#4a5568', marginBottom: 16 }}>
          Next review in <strong>{daysUntil} day{daysUntil !== 1 ? 's' : ''}</strong>
        </p>
      )}
      <button onClick={onNext} style={{ padding: '10px 28px', backgroundColor: '#3182ce', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 16, fontWeight: 600 }}>
        Next Puzzle
      </button>
    </div>
  );
}
```

---

## Part 6: PuzzleControls Component

Create `frontend/src/components/puzzle/PuzzleControls.tsx`:
```typescript
import React from 'react';

export function PuzzleControls({ onGiveUp, disabled }: { onGiveUp: () => void; disabled?: boolean; }) {
  return (
    <div style={{ marginTop: 12 }}>
      <button onClick={onGiveUp} disabled={disabled} style={{ padding: '8px 20px', backgroundColor: disabled ? '#feb2b2' : '#e53e3e', color: 'white', border: 'none', borderRadius: 4, cursor: disabled ? 'not-allowed' : 'pointer', fontSize: 14 }}>
        Give Up
      </button>
    </div>
  );
}
```

---

## Part 7: PuzzlePage

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
  const { puzzleSolved, attemptStartTime, attemptSubmitted, finishPuzzle, markSubmitted, resetPuzzle } = usePuzzleStore();

  const handleComplete = useCallback((solved: boolean) => {
    if (attemptSubmitted) return;
    finishPuzzle(solved);
    markSubmitted();
    submitAttempt({ puzzleId: id!, solved, timeTaken: attemptStartTime ? Date.now() - attemptStartTime : 0 });
  }, [attemptSubmitted, finishPuzzle, markSubmitted, attemptStartTime, id, submitAttempt]);

  const handleNext = useCallback(() => { resetPuzzle(); navigate('/puzzles'); }, [resetPuzzle, navigate]);

  if (isLoading) return <div style={{ padding: 40 }}>Loading puzzle...</div>;
  if (error) return <div style={{ padding: 40 }}>Puzzle not found.</div>;
  if (!puzzle) return null;

  return (
    <div style={{ maxWidth: 560, margin: '40px auto', padding: '0 16px' }}>
      <div style={{ marginBottom: 16 }}>
        <span style={{ fontWeight: 700, fontSize: 18 }}>Puzzle #{puzzle.id}</span>
        <span style={{ color: '#718096', fontSize: 14, marginLeft: 12 }}>Rating: {Math.round(puzzle.rating)}</span>
        <div style={{ fontSize: 13, color: '#718096', marginTop: 4 }}>Themes: {puzzle.themes.join(', ')}</div>
      </div>

      {puzzleSolved === null && (
        <>
          <PuzzleBoard puzzleId={puzzle.id} fen={puzzle.fen} moves={puzzle.moves} onComplete={handleComplete} />
          <PuzzleControls onGiveUp={() => handleComplete(false)} />
        </>
      )}

      {puzzleSolved !== null && attemptResult && <PuzzleResult result={attemptResult} onNext={handleNext} />}
      {puzzleSolved !== null && !attemptResult && <div style={{ marginTop: 24, color: '#718096' }}>Saving result...</div>}
    </div>
  );
}
```

---

## Part 8: Browse Components

Create `frontend/src/components/puzzle/PuzzleCard.tsx`:
```typescript
import React from 'react';
import { useNavigate } from 'react-router-dom';

export function PuzzleCard({ id, rating, themes }: { id: string; rating: number; themes: string[] }) {
  const navigate = useNavigate();
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid #e2e8f0' }}>
      <div>
        <span style={{ fontWeight: 600, marginRight: 12 }}>#{id}</span>
        <span style={{ color: '#718096', fontSize: 13 }}>{themes.slice(0, 3).join(', ')}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ backgroundColor: '#ebf4ff', color: '#2b6cb0', padding: '2px 10px', borderRadius: 12, fontSize: 13, fontWeight: 500 }}>
          {Math.round(rating)}
        </span>
        <button onClick={() => navigate(`/puzzles/${id}`)} style={{ padding: '6px 14px', backgroundColor: '#3182ce', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 13 }}>
          Solve
        </button>
      </div>
    </div>
  );
}
```

Create `frontend/src/components/puzzle/PuzzleListFilters.tsx`:
```typescript
import React from 'react';
import { usePuzzleThemes } from '../../hooks/usePuzzleThemes';

interface FiltersProps { theme: string; minRating: number; maxRating: number; onThemeChange: (t: string) => void; onRatingChange: (min: number, max: number) => void; }

export function PuzzleListFilters({ theme, minRating, maxRating, onThemeChange, onRatingChange }: FiltersProps) {
  const { data } = usePuzzleThemes();
  return (
    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 20, padding: 16, backgroundColor: '#f7fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ fontSize: 13, fontWeight: 500 }}>Theme</span>
        <select value={theme} onChange={(e) => onThemeChange(e.target.value)} style={{ padding: '6px 12px', border: '1px solid #cbd5e0', borderRadius: 4, fontSize: 14 }}>
          <option value="">All themes</option>
          {data?.themes.map((t) => <option key={t.name} value={t.name}>{t.name} ({t.count.toLocaleString()})</option>)}
        </select>
      </label>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ fontSize: 13, fontWeight: 500 }}>Min Rating: {minRating}</span>
        <input type="range" min={600} max={3000} step={50} value={minRating} onChange={(e) => onRatingChange(Number(e.target.value), maxRating)} />
      </label>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ fontSize: 13, fontWeight: 500 }}>Max Rating: {maxRating}</span>
        <input type="range" min={600} max={3000} step={50} value={maxRating} onChange={(e) => onRatingChange(minRating, Number(e.target.value))} />
      </label>
    </div>
  );
}
```

Create `frontend/src/components/puzzle/StreakDisplay.tsx`:
```typescript
import React from 'react';
import { usePuzzleStats } from '../../hooks/usePuzzleStats';

export function StreakDisplay() {
  const { data, isLoading } = usePuzzleStats();
  if (isLoading) return null;
  if (!data) return <span style={{ color: '#718096', fontSize: 14 }}>Log in to track streak</span>;
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 14px', backgroundColor: data.streak > 0 ? '#fefcbf' : '#f7fafc', border: '1px solid #f6e05e', borderRadius: 20, fontSize: 14, fontWeight: 600 }}>
      <span>🔥</span><span>{data.streak} day streak</span>
    </div>
  );
}
```

Create `frontend/src/components/puzzle/PuzzleRatingDisplay.tsx`:
```typescript
import React from 'react';
import { usePuzzleStats } from '../../hooks/usePuzzleStats';

export function PuzzleRatingDisplay() {
  const { data } = usePuzzleStats();
  if (!data) return null;
  return (
    <div style={{ fontSize: 14, color: '#4a5568' }}>
      Puzzle Rating: <strong style={{ fontSize: 17 }}>{Math.round(data.currentRating)}</strong>
      <span style={{ color: '#718096', marginLeft: 4 }}>±{Math.round(data.ratingDeviation)}</span>
    </div>
  );
}
```

Create `frontend/src/components/puzzle/DailyPuzzleWidget.tsx`:
```typescript
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useDailyPuzzle } from '../../hooks/useDailyPuzzle';
import { Chessboard } from 'react-chessboard';

export function DailyPuzzleWidget() {
  const navigate = useNavigate();
  const { data: puzzle, isLoading } = useDailyPuzzle();
  if (isLoading) return <div style={{ width: 260, padding: 16 }}>Loading...</div>;
  if (!puzzle) return null;
  return (
    <div style={{ width: 260, padding: 16, border: '1px solid #e2e8f0', borderRadius: 8, backgroundColor: 'white' }}>
      <h3 style={{ margin: '0 0 8px', fontSize: 15 }}>Daily Puzzle</h3>
      <p style={{ margin: '0 0 10px', fontSize: 12, color: '#718096' }}>
        Rating: {Math.round(puzzle.rating)} · {puzzle.themes[0]}
      </p>
      <div style={{ pointerEvents: 'none', marginBottom: 12 }}>
        <Chessboard position={puzzle.fen} boardWidth={228} arePiecesDraggable={false} />
      </div>
      <button onClick={() => navigate('/puzzles/daily')} style={{ width: '100%', padding: '8px 0', backgroundColor: '#38a169', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 600, fontSize: 14 }}>
        Solve Today's Puzzle
      </button>
    </div>
  );
}
```

---

## Part 9: Pages

Create `frontend/src/pages/PuzzleListPage.tsx`:
```typescript
import React, { useState } from 'react';
import { usePuzzleList } from '../hooks/usePuzzleList';
import { PuzzleCard } from '../components/puzzle/PuzzleCard';
import { PuzzleListFilters } from '../components/puzzle/PuzzleListFilters';
import { StreakDisplay } from '../components/puzzle/StreakDisplay';
import { PuzzleRatingDisplay } from '../components/puzzle/PuzzleRatingDisplay';

export default function PuzzleListPage() {
  const [theme, setTheme] = useState('');
  const [minRating, setMinRating] = useState(600);
  const [maxRating, setMaxRating] = useState(3000);
  const [page, setPage] = useState(1);

  const { data, isLoading, isFetching } = usePuzzleList({
    theme: theme || undefined,
    minRating: minRating > 600 ? minRating : undefined,
    maxRating: maxRating < 3000 ? maxRating : undefined,
    page, limit: 20,
  });

  const handleThemeChange = (t: string) => { setTheme(t); setPage(1); };
  const handleRatingChange = (min: number, max: number) => { setMinRating(min); setMaxRating(max); setPage(1); };

  return (
    <div style={{ maxWidth: 720, margin: '40px auto', padding: '0 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h1 style={{ fontSize: 24, margin: 0 }}>Puzzles</h1>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <StreakDisplay />
          <PuzzleRatingDisplay />
        </div>
      </div>
      <PuzzleListFilters theme={theme} minRating={minRating} maxRating={maxRating} onThemeChange={handleThemeChange} onRatingChange={handleRatingChange} />
      {isLoading && <div>Loading puzzles...</div>}
      {data && (
        <>
          <div style={{ opacity: isFetching ? 0.6 : 1, border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
            {data.data.map((p) => <PuzzleCard key={p.id} id={p.id} rating={p.rating} themes={p.themes} />)}
            {data.data.length === 0 && <div style={{ padding: 24, textAlign: 'center', color: '#718096' }}>No puzzles match your filters.</div>}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 }}>
            <span style={{ fontSize: 13, color: '#718096' }}>
              {data.total.toLocaleString()} puzzles · Page {data.page} of {data.totalPages}
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} style={{ padding: '6px 14px', border: '1px solid #cbd5e0', borderRadius: 4, cursor: page <= 1 ? 'not-allowed' : 'pointer', opacity: page <= 1 ? 0.5 : 1, backgroundColor: 'white' }}>
                Previous
              </button>
              <button onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))} disabled={page >= data.totalPages} style={{ padding: '6px 14px', border: '1px solid #cbd5e0', borderRadius: 4, cursor: page >= data.totalPages ? 'not-allowed' : 'pointer', opacity: page >= data.totalPages ? 0.5 : 1, backgroundColor: 'white' }}>
                Next
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
```

Create `frontend/src/pages/PuzzleDailyPage.tsx`:
```typescript
import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDailyPuzzle } from '../hooks/useDailyPuzzle';

export default function PuzzleDailyPage() {
  const navigate = useNavigate();
  const { data: puzzle, isLoading } = useDailyPuzzle();
  useEffect(() => {
    if (puzzle?.id) navigate(`/puzzles/${puzzle.id}`, { replace: true });
  }, [puzzle?.id, navigate]);
  if (isLoading) return <div style={{ padding: 40 }}>Loading today's puzzle...</div>;
  return <div style={{ padding: 40 }}>Redirecting...</div>;
}
```

---

## Part 10: Routes

In `frontend/src/router/index.tsx`, add (ensure `/puzzles/daily` comes before `/puzzles/:id`):
```typescript
import React, { lazy, Suspense } from 'react';
const PuzzlePage = lazy(() => import('../pages/PuzzlePage'));
const PuzzleListPage = lazy(() => import('../pages/PuzzleListPage'));
const PuzzleDailyPage = lazy(() => import('../pages/PuzzleDailyPage'));

// In Routes component:
<Route path="/puzzles" element={<Suspense fallback={<div>Loading...</div>}><PuzzleListPage /></Suspense>} />
<Route path="/puzzles/daily" element={<Suspense fallback={<div>Loading...</div>}><PuzzleDailyPage /></Suspense>} />
<Route path="/puzzles/:id" element={<Suspense fallback={<div>Loading...</div>}><PuzzlePage /></Suspense>} />
```

---

## Verification Checklist

```bash
cd frontend && npm run dev
```

1. `/puzzles` renders puzzle list with cards showing ID, rating, themes
2. Selecting a theme from dropdown refetches filtered list
3. Adjusting rating sliders refetches with new range
4. "Next" / "Previous" buttons paginate without flash (placeholderData)
5. Clicking "Solve" on a card navigates to `/puzzles/:id`
6. On `/puzzles/:id`: board renders, opponent move plays at 500ms
7. Dragging correct move: accepted, opponent responds at 300ms
8. Dragging wrong move: red border flashes for 800ms, position unchanged
9. Completing all moves: "Puzzle Solved!" with rating delta shown
10. "Give Up": "Puzzle Failed" shown
11. `/puzzles/daily` redirects to `/puzzles/<dailyPuzzleId>`
12. `DailyPuzzleWidget` renders a preview board when added to dashboard
13. Logged-in user sees streak and rating in puzzle list header
14. Logged-out user sees "Log in to track streak" placeholder
