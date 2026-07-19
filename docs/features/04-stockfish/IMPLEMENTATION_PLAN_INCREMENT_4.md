# 04-Stockfish — Increment 4 ✅ DONE (2026-07-12)

## Scope
Frontend integration: computer game flow, engine thinking indicator, and the server-side
entry point the engine's move comes back through.

## Files modified (as built)
- `frontend/src/components/ChessGame.jsx` — the real board component (the plan said
  `GamePage.tsx` / a separate `EngineThinking.tsx`; the actual stack is JSX and the
  indicator is three lines, so it lives inline rather than in its own component).
- `backend/src/games/game.gateway.ts` — new `computer_move` handler.

## How a computer move flows
1. `game_start` (or `game_state` on reconnect) carries `black.id === 'computer'` and `difficulty`.
   `ChessGame` uses that to enable `useStockfish`.
2. Human plays → server broadcasts `move_made` → the new FEN has black to move.
3. A `useEffect` keyed on the FEN sees it is black's turn, sets "Stockfish is thinking…",
   and asks the WASM worker for a move.
4. The client emits **`computer_move`** `{ roomId, from, to, promotion? }`.
5. `GameGateway.handleComputerMove` re-validates and broadcasts the resulting `move_made`.

### Why a separate event and not `move`
`handleMove` rejects any move from a socket that does not own the current turn
(`"Not your turn"`). In a computer game black is `{ id: 'computer' }`, so the human's
socket can never legally submit black's reply through `move`. Hence `computer_move`.

### Trust boundary
The engine runs on the client, so the client supplies the move. The server therefore
re-checks all of: room is active, black is `computer`, the sender is that room's white
player, it is black's turn, and chess.js says the move is legal. A tampered client can
only make *its own opponent* play badly, and computer games are unrated (`endGame` skips
rating when `blackPlayer.id === 'computer'`), so there is nothing to gain.

## Acceptance criteria
- ✅ After a human move, Stockfish responds at the depth/skill for the chosen difficulty
- ✅ Difficulty chosen in the Lobby reaches the engine (persisted on the Redis room →
  emitted in `game_start` → `useStockfish`)
- ✅ "Stockfish is thinking…" indicator shows while the WASM computes
- ✅ The computer's move is validated by chess.js on the server, exactly like a human move

## Verified (live stack: Postgres + Redis + Nest + real engine binary)
13/13 checks pass — 3 full human/engine move pairs (engine replied e5, d5, Bd6), black's
clock ticks down on engine moves, `game_start` carries `difficulty`, and all three guards
hold: refuses `computer_move` on white's turn, refuses an illegal engine move, refuses a
`computer_move` from a socket that is not the room's human player. A legitimate move is
still accepted after the guard probes. Vite serves the worker + wasm (HTTP 200, 7.3MB).
