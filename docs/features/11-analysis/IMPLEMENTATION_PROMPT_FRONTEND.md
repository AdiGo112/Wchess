# Feature 11 — Analysis: Frontend Implementation Prompt

Copy and paste the following prompt into a fresh AI conversation to implement the full frontend for Feature 11.

---

You are implementing the Analysis frontend for ChessWeb, a React + Vite chess web application.

## Stack

- React 18, JavaScript (JSX)
- `react-chessboard` (already installed) for board rendering
- `chess.js` (already installed) for FEN/move parsing
- `react-router-dom` v6 — `useParams`, `useNavigate`
- axios for API calls

## What Already Exists

- `frontend/src/api/axios.js` — axios instance with baseURL and auth interceptor
- React Router routes are in `frontend/src/App.jsx`. You need to ADD the route `/analysis/:gameId` pointing to `Analysis.jsx`.
- `frontend/src/components/ChessGame.jsx` — the game component that shows the game over modal

## Task: Create the Analysis UI

### File 1: `frontend/src/pages/Analysis.jsx`

```jsx
import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import api from '../api/axios';
import AnalysisBoard from '../components/AnalysisBoard';

export default function Analysis() {
  const { gameId } = useParams();
  const [analysis, setAnalysis] = useState(null);
  const [status, setStatus] = useState('loading');

  useEffect(() => {
    let interval;
    const fetchAnalysis = async () => {
      try {
        const res = await api.get(`/analysis/${gameId}`);
        if (res.data.status === 'completed') {
          setAnalysis(res.data);
          setStatus('completed');
          clearInterval(interval);
        } else if (res.data.status === 'failed') {
          setStatus('failed');
          clearInterval(interval);
        } else {
          setStatus('pending');
        }
      } catch (err) {
        if (err.response?.status === 404) setStatus('not_found');
        else setStatus('error');
        clearInterval(interval);
      }
    };
    fetchAnalysis();
    interval = setInterval(fetchAnalysis, 5000);
    return () => clearInterval(interval);
  }, [gameId]);

  if (status === 'loading' || status === 'pending') {
    return (
      <div style={{ textAlign: 'center', padding: 80 }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>♟</div>
        <p style={{ fontSize: 18, color: '#666' }}>Engine analysis in progress…</p>
        <p style={{ fontSize: 14, color: '#999' }}>Stockfish is evaluating each move at depth 18. This takes 10-30 seconds.</p>
      </div>
    );
  }
  if (status === 'failed') return <div style={{ padding: 40 }}>Analysis failed. The engine encountered an error.</div>;
  if (status === 'not_found') return <div style={{ padding: 40 }}>No analysis found for this game.</div>;
  if (status === 'completed') return <AnalysisBoard analysis={analysis} />;
}
```

### File 2: `frontend/src/components/AnalysisBoard.jsx`

Full implementation. The component receives `analysis: AnalysisResultDto` as a prop.

State:
- `currentIndex: number` — starts at -1 (starting position)
- `flipped: boolean` — board orientation

Board FEN: when `currentIndex === -1`, use the starting FEN (`rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1`). Otherwise use `analysis.moves[currentIndex].fen`.

Layout: side-by-side grid (desktop).
- Left side: `react-chessboard` with `position={fen}` and `boardOrientation={flipped ? 'black' : 'white'}`, EvalBar above or beside.
- Right side:
  - Header showing accuracy: "White: 82.3% | Black: 74.1%"
  - Opening: "B20 — Sicilian Defence"
  - Scrollable move list table: columns [#, White, Black]. Each cell shows the SAN with a color-coded left border. Clicking a move sets `currentIndex`.
  - "Flip Board" button.

Move classification colors:
- `brilliant`: `#00bcd4` (cyan) with ★ prefix
- `good`: `#4caf50` (green)
- `inaccuracy`: `#ff9800` (yellow-orange)
- `mistake`: `#f44336` (orange-red)
- `blunder`: `#b71c1c` (dark red) with ✗ prefix

Keyboard handling with `useEffect`:
```jsx
useEffect(() => {
  const handler = (e) => {
    if (e.key === 'ArrowRight') setCurrentIndex(i => Math.min(analysis.moves.length - 1, i + 1));
    if (e.key === 'ArrowLeft') setCurrentIndex(i => Math.max(-1, i - 1));
    if (e.key === 'f') setFlipped(f => !f);
  };
  window.addEventListener('keydown', handler);
  return () => window.removeEventListener('keydown', handler);
}, [analysis.moves.length]);
```

The currently selected move should be highlighted in the move list (e.g., bold background).

### File 3: `frontend/src/components/EvalBar.jsx`

```jsx
export default function EvalBar({ evalCp }) {
  // evalCp is centipawns from white's perspective
  // Clamp between -1000 and 1000, map to 0-100% white
  const clampedEval = Math.max(-1000, Math.min(1000, evalCp ?? 0));
  const whitePercent = 50 + (clampedEval / 1000) * 50;
  const label = evalCp >= 9999 ? 'M' : evalCp <= -9999 ? 'M' : 
    Math.abs(evalCp) < 1000 ? (evalCp > 0 ? `+${(evalCp/100).toFixed(1)}` : `${(evalCp/100).toFixed(1)}`) : `+${(evalCp/100).toFixed(0)}`;

  return (
    <div style={{ width: 20, height: 400, background: '#1a1a1a', borderRadius: 4, overflow: 'hidden', display: 'flex', flexDirection: 'column-reverse', position: 'relative' }}>
      <div style={{ height: `${whitePercent}%`, background: '#f0d9b5', transition: 'height 0.3s ease' }} />
      <div style={{ position: 'absolute', bottom: whitePercent > 50 ? 'auto' : 4, top: whitePercent > 50 ? 4 : 'auto', left: 0, right: 0, textAlign: 'center', fontSize: 9, fontWeight: 'bold', color: whitePercent > 50 ? '#222' : '#fff' }}>
        {label}
      </div>
    </div>
  );
}
```

### File 4: Update `frontend/src/components/ChessGame.jsx`

In the game over handler (where the game over modal is shown):
1. Fire-and-forget: `api.post('/analysis/request', { gameId }).catch(() => {})` — do this immediately when the modal opens.
2. Begin polling: every 5 seconds, call `api.get('/analysis/' + gameId)`. When status is 'completed', update modal state to show `White Accuracy: ${analysis.accuracy.white}% | Black Accuracy: ${analysis.accuracy.black}%`.
3. Add a "View Full Analysis" button in the modal that navigates to `/analysis/${gameId}`. Initially disabled with spinner while pending; enabled once completed.

### File 5: Add route in `frontend/src/App.jsx`

Add:
```jsx
import { lazy } from 'react';
const Analysis = lazy(() => import('./pages/Analysis'));
// In the router:
<Route path="/analysis/:gameId" element={<Suspense fallback={<div>Loading...</div>}><Analysis /></Suspense>} />
```

## Verification Steps

1. `npm run dev` — no console errors
2. Navigate to `/analysis/some-game-id` that has `status: 'pending'` → see spinner
3. Navigate to `/analysis/some-game-id` with completed analysis → see board + move list
4. Press right arrow 5 times → board advances 5 moves, eval bar updates
5. Press left arrow → board goes back
6. Click "Flip Board" → board flips orientation
7. Find a blunder move in the list → it has dark red left border
8. Click a move in the list → board jumps to that position
