# Feature 02 — Game Engine

**Branch:** `feature/game-engine`
**Depends on:** `feature/auth`

## Goal
Real-time two-player chess over WebSockets. Move validation server-side, game state in Redis, completed games saved to PostgreSQL, Glicko-2 ratings updated.

---

## Backend

### Files
```
backend/src/games/
├── games.module.ts
├── games.service.ts      — save/fetch games (Prisma)
├── games.controller.ts   — GET /games/:id, GET /games/history/:userId
└── game.gateway.ts       — Socket.io gateway (all live game events)
```

### Active Game Room (Redis)
```json
{
  "id": "ABC123",
  "whitePlayer": { "id": "uid1", "username": "alice", "rating": 1420 },
  "blackPlayer":  { "id": "uid2", "username": "bob",   "rating": 1380 },
  "fen": "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1",
  "moves": ["e4"],
  "timers": { "white": 598000, "black": 600000 },
  "lastMoveAt": 1719000000000,
  "status": "active",
  "timeControl": 600,
  "increment": 0,
  "startedAt": 1719000000000,
  "drawOfferedBy": null
}
```
Key: `game:room:{roomId}` — TTL: 24 hours

### Move Processing
1. Client emits `move { roomId, from, to, promotion? }`
2. Gateway reads room JSON from Redis
3. Reconstructs `chess.js` from FEN (not stored in Redis)
4. Validates it's the correct player's turn
5. Ticks the clock: `timers[turn] -= Date.now() - lastMoveAt`
6. Applies move with `chess.js.move()`
7. Updates `fen`, `moves[]`, `timers`, `lastMoveAt` in Redis
8. Broadcasts `move_made` to room
9. Checks `chess.js.isCheckmate()` / `isStalemate()` / etc.
10. If game over: calls `finishGame()`

### Clock Design
- Timers stored as milliseconds remaining (`timers.white`, `timers.black`)
- `lastMoveAt` = timestamp of last move
- **Client** handles countdown display (subtract elapsed since `lastMoveAt`)
- **Server** validates on each move (deducts elapsed from moving player's clock)
- Client emits `claim_timeout` → server validates timer ≤ 0 → ends game

### Game Over Flow
```
finishGame(roomId, result, reason)
  → emit game_over to room
  → GamesService.saveGame() → PostgreSQL (Prisma)
  → Glicko-2 recalculate for both players
  → UPDATE UserRating in PostgreSQL
  → ZADD leaderboard:{variant} in Redis
  → emit rating_update to room
  → DEL game:room:{roomId} from Redis (after 10s delay)
```

### Glicko-2 (utils/elo.ts)
Full Glicko-2 algorithm:
- Parameters: rating `r`, deviation `RD`, volatility `σ`
- Updates immediately after each game
- `provisional = true` when `RD > 110` (first ~20 games)

---

## Frontend

### Components
```
frontend/src/
├── socket/useGameSocket.ts      — socket event hook
├── components/board/
│   ├── ChessBoard.tsx           — react-chessboard wrapper, locks to player's color
│   ├── Timer.tsx                — countdown, flashes red at <30s
│   ├── MoveHistory.tsx          — scrollable SAN list with move numbers
│   ├── EvalBar.tsx              — (added in feature/analysis)
│   └── PlayerInfo.tsx           — avatar, name, rating, flag
├── components/game/
│   ├── GameControls.tsx         — Resign, Draw, Rematch, Abort buttons
│   ├── DrawOfferModal.tsx       — accept/decline draw
│   └── GameOverModal.tsx        — result, reason, rating change, rematch
└── pages/Game.tsx               — full game layout
```

### Game Page Layout
```
┌────────────────────────────────────────────────┐
│  [Black PlayerInfo]              [Black Timer]  │
│  ┌──────────────────────────────┐  ┌──────────┐│
│  │                              │  │   Move   ││
│  │      react-chessboard        │  │ History  ││
│  │   (locked to player color)   │  │          ││
│  │                              │  ├──────────┤│
│  └──────────────────────────────┘  │ Controls ││
│  [White PlayerInfo]              [White Timer]  │
└────────────────────────────────────────────────┘
```

### Board locking
- Online mode: board only accepts moves when it's the player's color's turn
- `onPieceDrop` returns `false` if not player's turn

---

## Checklist
- [ ] GameGateway: `create_room`, `join_room`
- [ ] GameGateway: `move` — validate, tick clock, broadcast
- [ ] GameGateway: `resign`, `offer_draw`, `accept_draw`, `decline_draw`
- [ ] GameGateway: `claim_timeout`
- [ ] GameGateway: `request_takeback`, `accept_takeback`, `decline_takeback`
- [ ] GameGateway: `spectate`
- [ ] GameGateway: `disconnect` handler — 60s grace, then resign
- [ ] GamesService: `saveGame()` → Prisma
- [ ] GamesService: `getHistory()` → Prisma
- [ ] Glicko-2 implementation in `utils/elo.ts`
- [ ] Rating update on game end
- [ ] Redis leaderboard update on game end
- [ ] Prisma migration for Game, UserRating models
- [ ] Frontend: ChessBoard with color locking
- [ ] Frontend: Timer component
- [ ] Frontend: MoveHistory component
- [ ] Frontend: PlayerInfo component
- [ ] Frontend: GameOverModal
- [ ] Frontend: DrawOfferModal
- [ ] Frontend: GameControls (resign, draw)
- [ ] Frontend: Game page layout

## Verify
1. Two browser tabs → `create_room` + `join_room` → game starts
2. Move on white's turn → broadcasts to both tabs
3. Try moving on wrong turn → `invalid_move` received
4. Checkmate → `game_over` with `reason: "checkmate"`
5. Resignation → `game_over` with `reason: "resignation"`
6. Both players' ratings updated in PostgreSQL
7. Game saved to `games` table with PGN and moves array
8. Redis room deleted after game ends
