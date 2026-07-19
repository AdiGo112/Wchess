# Feature 11 — Increment 5 Implementation Prompt

Copy and paste this entire prompt into a fresh AI conversation.

---

You are implementing Increment 5 of the Analysis feature for ChessWeb. Increments 1–4 are complete. You are integrating analysis into the game-over flow inside `ChessGame.jsx`: fire an analysis request when a game ends, then poll for results and show accuracy in the modal.

## Current Codebase State

These files exist and work:
- `backend/src/analysis/analysis.controller.ts` — POST /analysis/request (202 Accepted, or 409 if already exists) and GET /analysis/:gameId
- `frontend/src/pages/Analysis.jsx` — The full analysis board page at `/analysis/:gameId`
- `frontend/src/components/AnalysisBoard.jsx` — Interactive analysis board component
- `frontend/src/components/EvalBar.jsx` — Vertical eval bar component
- `frontend/src/App.jsx` — Has route `/analysis/:gameId` pointing to `Analysis.jsx`
- `frontend/src/components/ChessGame.jsx` — The main game component. It connects to the backend via WebSocket (socket.io-client), handles move submission, and renders the game over modal when `gameOver` state becomes truthy. The `gameId` is available from the socket room state (e.g., `roomId` from `useParams()` or from a socket event payload).

## API Contract

```
POST /analysis/request
  Authorization: Bearer <token>
  Content-Type: application/json
  Body: { "gameId": "abc123" }
  
  → 202 Accepted: { "status": "pending", "analysisId": "...", "message": "..." }
  → 409 Conflict: analysis already exists (safe to ignore — just means it was already triggered)
  → 403 Forbidden: user was not a player in this game
  → 404 Not Found: game does not exist

GET /analysis/:gameId
  Authorization: Bearer <token>
  
  → 200: { "status": "pending" | "processing" | "completed" | "failed", ... }
  When completed also has: { "accuracy": { "white": 82.3, "black": 74.1 }, "ecoName": "..." }
  When failed also has: { "error": "..." }
```

## What to Modify: `frontend/src/components/ChessGame.jsx`

This is the only file that changes in this increment. Make the following additions:

### 1. Add imports at the top

```jsx
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
```

### 2. Add state variables inside the component (alongside existing state)

```jsx
const navigate = useNavigate();
const [analysisStatus, setAnalysisStatus] = useState('idle');
// 'idle'       — game not yet over
// 'requesting' — POST /analysis/request in flight
// 'polling'    — waiting for analysis to complete
// 'completed'  — analysis done, accuracy available
// 'failed'     — analysis failed or request errored

const [analysisAccuracy, setAnalysisAccuracy] = useState(null);
// { white: 82.3, black: 74.1 } when completed, null otherwise

const analysisPollingRef = useRef(null);
```

Add `useRef` to your existing React import if not already present:
```jsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
```

### 3. Add the API_BASE constant (if not already present)

```jsx
const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:3000';
```

### 4. Add the analysis trigger effect

This effect runs whenever `gameOver` becomes truthy. It fires the POST request (fire-and-forget: 409 is silently ignored), then starts polling.

**Important**: `gameId` in your component may be called `roomId` or retrieved from `useParams()`. Adjust the variable name to match what is already used in your component.

```jsx
useEffect(() => {
  if (!gameOver) return; // game not over yet — do nothing

  async function requestAndPoll() {
    const token = localStorage.getItem('token');

    // Step 1: fire analysis request (fire-and-forget)
    setAnalysisStatus('requesting');
    try {
      await axios.post(
        `${API_BASE}/analysis/request`,
        { gameId: roomId },  // replace roomId with your actual gameId variable
        { headers: { Authorization: `Bearer ${token}` } }
      );
    } catch (err) {
      // 409 = already exists, fine to continue polling
      // 403/404 = problem with game data, show failure
      if (err.response?.status !== 409) {
        setAnalysisStatus('failed');
        return;
      }
    }

    // Step 2: start polling
    setAnalysisStatus('polling');

    async function poll() {
      try {
        const res = await axios.get(
          `${API_BASE}/analysis/${roomId}`,  // replace roomId with your actual gameId variable
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const data = res.data;

        if (data.status === 'completed') {
          setAnalysisAccuracy(data.accuracy);
          setAnalysisStatus('completed');
          // polling stops — no new setTimeout
        } else if (data.status === 'failed') {
          setAnalysisStatus('failed');
          // polling stops
        } else {
          // still pending or processing — poll again in 5s
          analysisPollingRef.current = setTimeout(poll, 5000);
        }
      } catch {
        setAnalysisStatus('failed');
      }
    }

    poll();
  }

  requestAndPoll();

  // Cleanup: stop polling if modal unmounts or component unmounts
  return () => {
    if (analysisPollingRef.current) {
      clearTimeout(analysisPollingRef.current);
    }
  };
}, [gameOver, roomId]); // replace roomId with your actual gameId variable
```

### 5. Update the game-over modal JSX

Find your existing game-over modal render block. It likely looks something like:

```jsx
{gameOver && (
  <div className="modal-overlay">
    <div className="modal">
      <h2>{gameOver.message}</h2>
      {/* existing content */}
      <button onClick={handleRematch}>Rematch</button>
    </div>
  </div>
)}
```

Add the analysis section inside the modal, below the existing game result text and above (or below) the rematch button:

```jsx
{gameOver && (
  <div className="modal-overlay">
    <div className="modal">
      <h2>{gameOver.message}</h2>
      {/* existing content here */}

      {/* ---- Analysis Section ---- */}
      <div style={{ marginTop: '16px', borderTop: '1px solid #444', paddingTop: '16px' }}>
        {(analysisStatus === 'requesting' || analysisStatus === 'polling') && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', justifyContent: 'center' }}>
            <div style={{
              width: '18px',
              height: '18px',
              border: '3px solid #444',
              borderTop: '3px solid #aaa',
              borderRadius: '50%',
              animation: 'spin 0.8s linear infinite',
            }} />
            <span style={{ color: '#aaa', fontSize: '14px' }}>Analyzing…</span>
          </div>
        )}

        {analysisStatus === 'completed' && analysisAccuracy && (
          <div style={{ textAlign: 'center' }}>
            <p style={{ color: '#ccc', fontSize: '14px', margin: '0 0 10px 0' }}>
              White Accuracy:&nbsp;
              <strong style={{ color: '#f0d9b5' }}>{analysisAccuracy.white}%</strong>
              &nbsp;&nbsp;|&nbsp;&nbsp;
              Black Accuracy:&nbsp;
              <strong style={{ color: '#b58863' }}>{analysisAccuracy.black}%</strong>
            </p>
            <button
              onClick={() => navigate(`/analysis/${roomId}`)}
              style={{
                padding: '8px 20px',
                backgroundColor: '#3a6ea5',
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: 'bold',
              }}
            >
              View Full Analysis
            </button>
          </div>
        )}

        {analysisStatus === 'failed' && (
          <p style={{ color: '#888', fontSize: '13px', textAlign: 'center', margin: 0 }}>
            Analysis unavailable.
          </p>
        )}
      </div>
      {/* ---- End Analysis Section ---- */}

      {/* existing buttons like Rematch */}
      <button onClick={handleRematch}>Rematch</button>
    </div>
  </div>
)}
```

Replace `roomId` throughout with whatever variable name holds the game ID in your component. Replace `gameOver.message` and `handleRematch` with the actual names used in your component.

If the `@keyframes spin` animation is not already in your global CSS (`frontend/src/index.css`), add it:

```css
@keyframes spin {
  to { transform: rotate(360deg); }
}
```

---

## Summary of All Changes

Only one file is modified in this increment:

| File | Change |
|---|---|
| `frontend/src/components/ChessGame.jsx` | Add `analysisStatus` + `analysisAccuracy` state, `analysisPollingRef`, trigger effect on `gameOver`, add analysis section to modal JSX |

No new files are created. No backend changes.

---

## Verification Steps

1. Start both backend and frontend (`npm run start:dev`, `npm start`).
2. Open two browser tabs, log in as two different users, and start a game.
3. Play moves until the game ends (checkmate, resignation, or stalemate).
4. **Network tab check**: Immediately after game over, open browser DevTools → Network tab. You should see a `POST /analysis/request` call that returns 202.
5. **Spinner**: The game over modal should show "Analyzing…" with a spinning indicator.
6. **Wait 20–60 seconds**: The modal should update to show:
   ```
   White Accuracy: X%  |  Black Accuracy: Y%
   [View Full Analysis]
   ```
7. **Navigation**: Click "View Full Analysis" → navigates to `/analysis/<gameId>` and shows the full analysis board.
8. **Cleanup test**: Trigger a game end, then immediately close/navigate away from the modal before analysis completes. Reopen the page. Confirm there are no JavaScript errors in the console (the polling timeout was cleaned up on unmount).
9. **Failure case**: Temporarily stop the backend after game end and before analysis completes. The modal should eventually show "Analysis unavailable." (after the GET request fails — may take up to 5s for the next poll attempt).
10. **Duplicate request**: End a second game between the same players. The POST should return 409 (visible in network tab) but the modal should still begin polling and eventually show results. The 409 is silently swallowed.
