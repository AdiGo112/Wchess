# Feature 03 — Matchmaking

**Branch:** `feature/matchmaking`
**Depends on:** `feature/game-engine`

## Goal
Automatically pair players of similar rating. Quick match via queue, or invite a friend via room link.

---

## Backend

### Files
```
backend/src/matchmaking/
├── matchmaking.module.ts
├── matchmaking.service.ts    — Redis queue operations
├── matchmaking.gateway.ts    — Socket.io events
└── matchmaking.processor.ts  — BullMQ repeatable job (500ms)
```

### Queue Structure (Redis)
```
queue:bullet   LIST  — LPUSH to add, RPOP to dequeue
queue:blitz    LIST
queue:rapid    LIST
queue:classical LIST

Each element (JSON string):
{
  userId, username, rating, socketId,
  joinedAt, ratingTolerance (starts 100, grows)
}
```

### Pairing Algorithm
BullMQ repeatable job fires every 500ms:
1. For each variant, pop 2 players from the queue
2. Check `|ratingA - ratingB| ≤ tolerance`
3. If within tolerance: create room → emit `match_found` to both
4. If not: push both back, increase their `ratingTolerance` by +50
5. Tolerance cap: ±400. After 5 minutes: match regardless

### Rating tolerance relaxation
```
tolerance = min(100 + 50 * floor(waitSeconds / 10), 400)
```

### Direct Challenge
- `POST /api/v1/games/challenge { targetUsername, timeControl, variant }`
- Creates a room with `status: "pending"`
- Sends notification to target user
- Target opens link → `join_room` → game starts

---

## Frontend

### Pages
```
frontend/src/pages/Lobby.tsx
```

### Lobby Layout
```
┌─────────────────────────────────────────┐
│             Choose how to play          │
│                                         │
│  ┌──────────┐  ┌──────────────────────┐ │
│  │  Quick   │  │   Play with Friend   │ │
│  │  Match   │  │  [Create Room Link]  │ │
│  │          │  │  [Join with Code]    │ │
│  │ [Bullet] │  └──────────────────────┘ │
│  │ [Blitz ] │                           │
│  │ [Rapid ] │  ┌──────────────────────┐ │
│  │[Classical│  │   vs Computer        │ │
│  └──────────┘  │  Difficulty: [Easy ▾]│ │
│                └──────────────────────┘ │
│                ┌──────────────────────┐ │
│                │   Local (2 players)  │ │
│                └──────────────────────┘ │
└─────────────────────────────────────────┘
```

### Queue waiting screen
- Shows "Searching for opponent..." with spinner
- Shows estimated wait time
- Cancel button → `leave_queue`
- On `match_found` → redirect to `/game/:roomId`

---

## Checklist
- [ ] MatchmakingService: `joinQueue()` — LPUSH to Redis
- [ ] MatchmakingService: `leaveQueue()` — LREM from Redis
- [ ] MatchmakingService: `findMatch()` — pairing algorithm
- [ ] BullMQ repeatable job: pair players every 500ms
- [ ] Rating tolerance relaxation over time
- [ ] MatchmakingGateway: `join_queue`, `leave_queue`
- [ ] MatchmakingGateway: emit `queued`, `match_found`
- [ ] Direct challenge endpoint
- [ ] Frontend: Lobby page (4 modes)
- [ ] Frontend: Queue waiting screen
- [ ] Frontend: Room link sharing (copy to clipboard)
- [ ] Frontend: Join room by code input

## Verify
1. Two tabs → Quick Match (blitz) → both see "Searching..."
2. Matched within seconds → both redirect to `/game/:roomId`
3. Leave queue → confirmed removed
4. Tab A creates room → copies link → Tab B joins → game starts
5. Rating tolerance widens after 10s of waiting
