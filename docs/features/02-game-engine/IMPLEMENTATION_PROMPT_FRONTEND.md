# 02-Game-Engine — Frontend Implementation Prompt

---

You are implementing the chess game board frontend for ChessWeb using React 18 + TypeScript + Socket.io client + chess.js (client-side for display, not validation).

## What already exists
- AuthContext with accessToken
- React Router v6
- Tailwind CSS
- react-chessboard library (or implement board with CSS grid)

## Task: Build the game UI frontend

### Components to create

#### `frontend/src/hooks/useGameSocket.ts`
- Connects to Socket.io /game namespace with auth.token = accessToken
- Manages events: game_state, move_made, game_over, draw_offered, clock_update, error
- Returns: { gameState, makeMove, offerDraw, acceptDraw, declineDraw, resign, isConnected }

#### `frontend/src/components/ChessBoard.tsx`
- Renders chess board using react-chessboard or custom implementation
- Board orientation based on player color (white on bottom for white, black on bottom for black)
- Pieces locked to player's own color (cannot move opponent pieces)
- On piece move: emit move event to socket. Wait for server confirmation before updating board.
- Highlight last move squares (from/to)
- Show check indicator (highlight king square in red)

#### `frontend/src/components/GameClock.tsx`
- Props: { time: number (ms), isActive: boolean, color: string }
- Display: MM:SS or H:MM:SS
- Clock runs from clock_update events (server-authoritative)
- Low time warning: turn red when < 30 seconds
- Uses local interpolation between server updates to appear smooth

#### `frontend/src/components/GameOver.tsx`
- Modal that appears on game_over event
- Shows: result (Win/Loss/Draw), reason (checkmate/timeout/etc.), rating change (+/- points)
- Buttons: Analyze, New Game, Return to Dashboard

#### `frontend/src/components/DrawControls.tsx`
- Offer Draw button (disabled if draw already offered)
- Shows "Draw offered" banner when opponent offered
- Accept / Decline buttons when draw is offered to you
- Resign button with confirmation dialog

#### `frontend/src/pages/GamePage.tsx`
- Route: /game/:gameId
- Orchestrates: ChessBoard, GameClock (×2), DrawControls, GameOver
- On mount: connect socket, emit join_room

Write all components. Use Tailwind for styling. The board should be responsive (max 600px on desktop, full width on mobile).
