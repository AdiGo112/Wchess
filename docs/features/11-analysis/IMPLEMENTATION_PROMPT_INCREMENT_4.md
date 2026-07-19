# Feature 11 — Increment 4 Implementation Prompt

Copy and paste this entire prompt into a fresh AI conversation.

---

You are implementing Increment 4 of the Analysis feature for ChessWeb. Increments 1, 2, and 3 are complete. You are building the `/analysis/:gameId` frontend page with an interactive analysis board.

## Current Codebase State

These files exist and work:
- `backend/src/analysis/schemas/analysis.schema.ts` — Analysis schema with status: pending|completed|failed, positions array, accuracy, ecoCode, ecoName
- `backend/src/analysis/analysis.service.ts` — requestAnalysis() and getResult()
- `backend/src/analysis/analysis.controller.ts` — POST /analysis/request (202) and GET /analysis/:gameId
- `backend/src/utils/eco-lookup.ts` — ECO identification from UCI move sequence
- `backend/src/stockfish/stockfish.processor.ts` — Processes 'analyze' jobs, evaluates moves at depth 18, classifies them, computes accuracy, and sets ecoCode/ecoName on completion
- `frontend/src/App.jsx` — React Router with existing routes (/, /login, /register, /game/:roomId)
- `frontend/src/pages/` — Contains Home.jsx, Login.jsx, Register.jsx
- `frontend/src/components/` — Contains ChessGame.jsx and other components
- `chess.js` is installed (import { Chess } from 'chess.js')
- `react-chessboard` is installed (import { Chessboard } from 'react-chessboard')
- `axios` is installed

## API Contract

`GET /analysis/:gameId` returns one of:

When pending:
```json
{ "status": "pending", "gameId": "abc123" }
```

When completed:
```json
{
  "status": "completed",
  "gameId": "abc123",
  "ecoCode": "C60",
  "ecoName": "Ruy Lopez",
  "ecoFamily": "Ruy Lopez",
  "accuracy": { "white": 82.3, "black": 74.1 },
  "moves": [
    {
      "moveNumber": 1,
      "color": "white",
      "san": "e4",
      "uci": "e2e4",
      "fen": "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1",
      "eval": 0.3,
      "bestMove": "e2e4",
      "bestMoveEval": 0.3,
      "cpLoss": 0,
      "classification": "good"
    }
  ],
  "completedAt": "2026-01-01T12:00:00.000Z"
}
```

When failed:
```json
{ "status": "failed", "gameId": "abc123", "error": "Stockfish timeout" }
```

## Move Classifications and Colors

| Classification | CSS Color |
|---|---|
| brilliant | `#1baca6` (cyan) |
| good | `#5b8a3c` (green) |
| inaccuracy | `#e6a020` (yellow-orange) |
| mistake | `#d05c22` (orange-red) |
| blunder | `#c41a1a` (dark red) |
| miss | `#c41a1a` (dark red, same as blunder) |

## Eval Bar Math

Convert centipawn score to white win probability for the eval bar height:

```javascript
function cpToWinPercent(cp) {
  // Clamp to avoid extreme values dominating the bar
  const clamped = Math.max(-1000, Math.min(1000, cp));
  return 50 + 50 * (2 / (1 + Math.exp(-0.004 * clamped)) - 1);
}
// cpToWinPercent(0)    → 50   (50/50 split)
// cpToWinPercent(500)  → ~83  (83% white)
// cpToWinPercent(-300) → ~26  (26% white, black advantage)
```

The eval bar is a vertical bar. White's portion = `winPercent`% from the bottom. Black's portion fills the top.

## What to Create

---

### Step 1: `frontend/src/components/EvalBar.jsx`

A vertical eval bar component. White fills from the bottom, black from the top.

```jsx
import React from 'react';

function cpToWinPercent(cp) {
  const clamped = Math.max(-1000, Math.min(1000, cp));
  return 50 + 50 * (2 / (1 + Math.exp(-0.004 * clamped)) - 1);
}

export default function EvalBar({ evalCp = 0 }) {
  const whitePercent = cpToWinPercent(evalCp);
  const blackPercent = 100 - whitePercent;

  const displayEval = Math.abs(evalCp) >= 9000
    ? (evalCp > 0 ? 'M' : '-M')
    : (evalCp / 100).toFixed(1);

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      width: '24px',
      height: '480px',
      border: '1px solid #555',
      borderRadius: '4px',
      overflow: 'hidden',
      flexShrink: 0,
    }}>
      {/* Black portion — top */}
      <div style={{
        height: `${blackPercent}%`,
        backgroundColor: '#1a1a1a',
        transition: 'height 0.3s ease',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: '4px',
      }}>
        {blackPercent > 15 && (
          <span style={{ color: '#ccc', fontSize: '10px', fontWeight: 'bold', writingMode: 'vertical-rl' }}>
            {evalCp < 0 ? displayEval : ''}
          </span>
        )}
      </div>
      {/* White portion — bottom */}
      <div style={{
        height: `${whitePercent}%`,
        backgroundColor: '#f0d9b5',
        transition: 'height 0.3s ease',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        paddingBottom: '4px',
      }}>
        {whitePercent > 15 && (
          <span style={{ color: '#333', fontSize: '10px', fontWeight: 'bold', writingMode: 'vertical-rl' }}>
            {evalCp >= 0 ? displayEval : ''}
          </span>
        )}
      </div>
    </div>
  );
}
```

---

### Step 2: `frontend/src/components/AnalysisBoard.jsx`

The main analysis board component. Receives the full analysis result and manages move navigation state internally.

```jsx
import React, { useState, useEffect, useCallback } from 'react';
import { Chessboard } from 'react-chessboard';
import EvalBar from './EvalBar';

const STARTING_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

const CLASSIFICATION_COLORS = {
  brilliant: '#1baca6',
  good: '#5b8a3c',
  inaccuracy: '#e6a020',
  mistake: '#d05c22',
  blunder: '#c41a1a',
  miss: '#c41a1a',
};

const CLASSIFICATION_SYMBOLS = {
  brilliant: '!!',
  good: '!',
  inaccuracy: '?!',
  mistake: '?',
  blunder: '??',
  miss: '??',
};

export default function AnalysisBoard({ analysis }) {
  // currentIndex: -1 = starting position, 0..n-1 = after move at that index
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [boardOrientation, setBoardOrientation] = useState('white');

  const moves = analysis.moves || [];

  const currentFen = currentIndex === -1
    ? STARTING_FEN
    : moves[currentIndex].fen;

  const currentEval = currentIndex === -1
    ? 0
    : moves[currentIndex].eval;

  const goBack = useCallback(() => {
    setCurrentIndex(prev => Math.max(-1, prev - 1));
  }, []);

  const goForward = useCallback(() => {
    setCurrentIndex(prev => Math.min(moves.length - 1, prev + 1));
  }, [moves.length]);

  const goToStart = useCallback(() => setCurrentIndex(-1), []);
  const goToEnd = useCallback(() => setCurrentIndex(moves.length - 1), [moves.length]);

  // Keyboard navigation
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        goBack();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        goForward();
      } else if (e.key === 'f' || e.key === 'F') {
        setBoardOrientation(prev => prev === 'white' ? 'black' : 'white');
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [goBack, goForward]);

  // Build move pairs for the sidebar (white move + black move per row)
  const movePairs = [];
  for (let i = 0; i < moves.length; i += 2) {
    movePairs.push({
      moveNumber: moves[i].moveNumber,
      white: moves[i],
      whiteIndex: i,
      black: moves[i + 1] || null,
      blackIndex: moves[i + 1] ? i + 1 : null,
    });
  }

  return (
    <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
      {/* Eval Bar */}
      <EvalBar evalCp={currentEval} />

      {/* Board */}
      <div style={{ flexShrink: 0 }}>
        <Chessboard
          position={currentFen}
          boardOrientation={boardOrientation}
          boardWidth={480}
          arePiecesDraggable={false}
        />
        {/* Navigation buttons */}
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          gap: '8px',
          marginTop: '8px',
        }}>
          {[
            { label: '|<', action: goToStart, title: 'First move' },
            { label: '<', action: goBack, title: 'Previous move (←)' },
            { label: '>', action: goForward, title: 'Next move (→)' },
            { label: '>|', action: goToEnd, title: 'Last move' },
            { label: 'Flip', action: () => setBoardOrientation(o => o === 'white' ? 'black' : 'white'), title: 'Flip board (f)' },
          ].map(({ label, action, title }) => (
            <button
              key={label}
              onClick={action}
              title={title}
              style={{
                padding: '6px 12px',
                backgroundColor: '#2a2a2a',
                color: '#e0e0e0',
                border: '1px solid #444',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '14px',
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Move List Sidebar */}
      <div style={{
        width: '220px',
        height: '530px',
        overflowY: 'auto',
        backgroundColor: '#1e1e1e',
        border: '1px solid #333',
        borderRadius: '4px',
        padding: '8px',
      }}>
        {movePairs.map(({ moveNumber, white, whiteIndex, black, blackIndex }) => (
          <div key={moveNumber} style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            marginBottom: '2px',
          }}>
            {/* Move number */}
            <span style={{ color: '#888', fontSize: '12px', width: '28px', flexShrink: 0 }}>
              {moveNumber}.
            </span>
            {/* White move */}
            <MoveToken
              move={white}
              isActive={currentIndex === whiteIndex}
              onClick={() => setCurrentIndex(whiteIndex)}
            />
            {/* Black move */}
            {black && (
              <MoveToken
                move={black}
                isActive={currentIndex === blackIndex}
                onClick={() => setCurrentIndex(blackIndex)}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function MoveToken({ move, isActive, onClick }) {
  const color = CLASSIFICATION_COLORS[move.classification] || '#e0e0e0';
  const symbol = CLASSIFICATION_SYMBOLS[move.classification] || '';

  return (
    <button
      onClick={onClick}
      title={`${move.classification} — cp loss: ${move.cpLoss}`}
      style={{
        flex: 1,
        padding: '3px 6px',
        backgroundColor: isActive ? '#3a3a3a' : 'transparent',
        border: isActive ? '1px solid #666' : '1px solid transparent',
        borderRadius: '3px',
        cursor: 'pointer',
        textAlign: 'left',
        fontSize: '13px',
        color: color,
        fontWeight: isActive ? 'bold' : 'normal',
      }}
    >
      {move.san}
      {symbol && (
        <span style={{ fontSize: '11px', marginLeft: '2px', opacity: 0.85 }}>
          {symbol}
        </span>
      )}
    </button>
  );
}
```

---

### Step 3: `frontend/src/pages/Analysis.jsx`

The page component. Fetches analysis data on mount, polls if pending, and renders the board when complete.

```jsx
import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import AnalysisBoard from '../components/AnalysisBoard';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:3000';
const POLL_INTERVAL_MS = 5000;

export default function Analysis() {
  const { gameId } = useParams();
  const navigate = useNavigate();
  const [analysis, setAnalysis] = useState(null);
  const [error, setError] = useState(null);
  const pollRef = useRef(null);

  useEffect(() => {
    async function fetchAnalysis() {
      try {
        const token = localStorage.getItem('token');
        const res = await axios.get(`${API_BASE}/analysis/${gameId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = res.data;
        setAnalysis(data);

        if (data.status === 'pending' || data.status === 'processing') {
          // Keep polling
          pollRef.current = setTimeout(fetchAnalysis, POLL_INTERVAL_MS);
        }
      } catch (err) {
        if (err.response?.status === 404) {
          setError('Analysis not found. The game may not have been analyzed yet.');
        } else if (err.response?.status === 401) {
          navigate('/login');
        } else {
          setError('Failed to load analysis. Please try again.');
        }
      }
    }

    fetchAnalysis();

    return () => {
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  }, [gameId, navigate]);

  if (error) {
    return (
      <div style={pageStyle}>
        <div style={errorBoxStyle}>
          <p>{error}</p>
          <button onClick={() => navigate(-1)} style={backBtnStyle}>Go Back</button>
        </div>
      </div>
    );
  }

  if (!analysis) {
    return (
      <div style={pageStyle}>
        <div style={spinnerContainerStyle}>
          <div style={spinnerStyle} />
          <p style={{ color: '#aaa', marginTop: '12px' }}>Loading analysis…</p>
        </div>
      </div>
    );
  }

  if (analysis.status === 'pending' || analysis.status === 'processing') {
    return (
      <div style={pageStyle}>
        <div style={spinnerContainerStyle}>
          <div style={spinnerStyle} />
          <p style={{ color: '#aaa', marginTop: '12px' }}>Engine analysis in progress…</p>
          <p style={{ color: '#666', fontSize: '13px' }}>This usually takes 20–60 seconds. This page will update automatically.</p>
        </div>
      </div>
    );
  }

  if (analysis.status === 'failed') {
    return (
      <div style={pageStyle}>
        <div style={errorBoxStyle}>
          <p style={{ color: '#c41a1a' }}>Analysis failed.</p>
          <p style={{ color: '#888', fontSize: '13px' }}>{analysis.error || 'An unknown error occurred during analysis.'}</p>
          <button onClick={() => navigate(-1)} style={backBtnStyle}>Go Back</button>
        </div>
      </div>
    );
  }

  // status === 'completed'
  const { accuracy, ecoCode, ecoName } = analysis;

  return (
    <div style={pageStyle}>
      {/* Header */}
      <div style={headerStyle}>
        <button onClick={() => navigate(-1)} style={backBtnStyle}>← Back</button>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'center' }}>
          {ecoName && (
            <span style={{ color: '#e0e0e0', fontWeight: 'bold', fontSize: '16px' }}>
              {ecoCode ? `${ecoCode} — ` : ''}{ecoName}
            </span>
          )}
          {accuracy && (
            <span style={{ color: '#aaa', fontSize: '14px' }}>
              White: <strong style={{ color: '#f0d9b5' }}>{accuracy.white}%</strong>
              &nbsp;accuracy&nbsp;&nbsp;|&nbsp;&nbsp;
              Black: <strong style={{ color: '#b58863' }}>{accuracy.black}%</strong>
              &nbsp;accuracy
            </span>
          )}
        </div>
        <div style={{ width: '64px' }} /> {/* spacer to center the title */}
      </div>

      {/* Board area */}
      <div style={{ display: 'flex', justifyContent: 'center', marginTop: '24px' }}>
        <AnalysisBoard analysis={analysis} />
      </div>

      {/* Legend */}
      <div style={legendStyle}>
        {[
          { label: 'Brilliant (!!)', color: '#1baca6' },
          { label: 'Good (!)', color: '#5b8a3c' },
          { label: 'Inaccuracy (?!)', color: '#e6a020' },
          { label: 'Mistake (?)', color: '#d05c22' },
          { label: 'Blunder (??)', color: '#c41a1a' },
        ].map(({ label, color }) => (
          <span key={label} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px' }}>
            <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: color, display: 'inline-block' }} />
            <span style={{ color: '#aaa' }}>{label}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

// ---- Styles ----

const pageStyle = {
  minHeight: '100vh',
  backgroundColor: '#121212',
  padding: '24px',
  fontFamily: 'sans-serif',
};

const headerStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  maxWidth: '800px',
  margin: '0 auto',
  paddingBottom: '16px',
  borderBottom: '1px solid #333',
};

const backBtnStyle = {
  padding: '6px 14px',
  backgroundColor: '#2a2a2a',
  color: '#e0e0e0',
  border: '1px solid #444',
  borderRadius: '4px',
  cursor: 'pointer',
  fontSize: '14px',
};

const spinnerContainerStyle = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  paddingTop: '120px',
};

const spinnerStyle = {
  width: '40px',
  height: '40px',
  border: '4px solid #333',
  borderTop: '4px solid #888',
  borderRadius: '50%',
  animation: 'spin 0.8s linear infinite',
};

const errorBoxStyle = {
  textAlign: 'center',
  paddingTop: '80px',
  color: '#aaa',
};

const legendStyle = {
  display: 'flex',
  gap: '16px',
  flexWrap: 'wrap',
  justifyContent: 'center',
  marginTop: '20px',
  padding: '12px',
  backgroundColor: '#1a1a1a',
  borderRadius: '4px',
  maxWidth: '600px',
  margin: '20px auto 0',
};
```

Add this CSS animation to your global stylesheet (e.g., `frontend/src/index.css`):

```css
@keyframes spin {
  to { transform: rotate(360deg); }
}
```

---

### Step 4: Modify `frontend/src/App.jsx`

Add the `/analysis/:gameId` route. Find the existing `<Routes>` block and add the new route. Use lazy loading to keep the bundle lean.

```jsx
// At the top of App.jsx, add:
import React, { Suspense, lazy } from 'react';

// Add this lazy import alongside your other page imports:
const Analysis = lazy(() => import('./pages/Analysis'));

// Inside your <Routes> block, add:
<Route
  path="/analysis/:gameId"
  element={
    <Suspense fallback={<div style={{ color: '#aaa', textAlign: 'center', paddingTop: '80px' }}>Loading…</div>}>
      <Analysis />
    </Suspense>
  }
/>
```

If `App.jsx` does not already use `Suspense`/`lazy`, the simpler direct import is also fine:

```jsx
import Analysis from './pages/Analysis';
// ...
<Route path="/analysis/:gameId" element={<Analysis />} />
```

---

## Verification Steps

1. Start the backend: `npm run start:dev` (from `backend/`)
2. Start the frontend: `npm start` (from `frontend/`)
3. **Pending state**: Manually call `POST /analysis/request` for a game, then immediately navigate to `http://localhost:3001/analysis/<gameId>`. You should see the spinner with "Engine analysis in progress…".
4. **Completed state**: Wait for analysis to finish (or use a gameId that is already completed). Navigate to `/analysis/<gameId>`. Confirm:
   - Header shows ECO name (e.g., "C60 — Ruy Lopez") and accuracy percentages for both players.
   - Board renders at starting position.
   - Move list sidebar shows all moves with correct colors (blunders in dark red, good moves in green, etc.).
5. **Keyboard navigation**:
   - Press right arrow → board advances one move, eval bar updates, the move in the sidebar becomes highlighted.
   - Press left arrow → board goes back one move.
   - Navigate to last move, press right arrow → nothing happens (already at end).
   - Navigate to start, press left arrow → nothing happens (already at start).
6. **Click navigation**: Click any move in the sidebar → board jumps directly to that position, eval bar updates to match.
7. **Board flip**: Press 'f' → board flips orientation. Press 'f' again → flips back.
8. **Eval bar math**: On a position with eval +500 cp, the white (light) portion of the eval bar should fill approximately 83% of the bar height.
9. **Failed state**: Find a gameId with `status: 'failed'`. Navigate to it → shows error message with the error text, no stack trace visible to the user.
10. **404 state**: Navigate to `/analysis/nonexistent-id` → shows "Analysis not found" message with a Go Back button.
