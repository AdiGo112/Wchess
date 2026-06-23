# Feature 07 — Tournaments

**Branch:** `feature/tournaments`
**Depends on:** `feature/matchmaking`, `feature/game-engine`

## Goal
Structured competitive play with Swiss, Arena, Round Robin, and Knockout formats.

---

## Backend

### Files
```
backend/src/tournaments/
├── tournaments.module.ts
├── tournaments.service.ts
├── tournaments.controller.ts
└── pairing/
    ├── swiss.ts         — Dutch System Swiss pairing
    ├── arena.ts         — Arena-style pairing
    └── roundrobin.ts    — Round-robin schedule generator
```

### PostgreSQL Models (Prisma)
```
Tournament         — metadata, format, status, timing
TournamentPlayer   — registered players + scores + tiebreaks
TournamentRound    — rounds (Swiss/RR) or bracket levels (KO)
TournamentPairing  — individual game pairings within a round
```

### Formats

**Arena (Lichess-style)**
- Open for fixed duration (e.g., 5 min, 1 hour)
- Players join anytime, paired immediately when idle
- Scoring: +2 win, +1 draw, +0 loss
- Berserk: halve time for +1 bonus point on win
- Real-time leaderboard via Redis `ZADD`

**Swiss (Dutch System)**
- Fixed rounds (e.g., 7 rounds of 5 min)
- After each round: pair players by score group, avoid rematches
- Tiebreak: Buchholz, Sonneborn-Berger
- Director starts each round manually or after all games complete

**Round Robin**
- All vs all, for small groups (≤16)
- Schedule pre-generated (Berger tables)

**Knockout**
- Single-elimination bracket
- Generated after registration closes

### State Machine
```
UPCOMING → (startAt reached) → ONGOING
ONGOING  → (all rounds done) → COMPLETED
         → (admin cancels)   → CANCELLED
```

### Endpoints
```
GET    /api/v1/tournaments                  — list with filters
POST   /api/v1/tournaments                  — create [ADMIN]
GET    /api/v1/tournaments/:id              — detail + standings
POST   /api/v1/tournaments/:id/join         — register
POST   /api/v1/tournaments/:id/leave        — withdraw
GET    /api/v1/tournaments/:id/standings    — live scores
GET    /api/v1/tournaments/:id/rounds/:num  — pairings for round
```

---

## Frontend

### Pages
```
frontend/src/pages/
├── Tournaments.tsx        — list: upcoming, ongoing, completed
└── TournamentDetail.tsx   — info, standings, rounds, join button
```

### Features
- Live standings table (updates via Socket.io or polling)
- Countdown to start
- Bracket view for Knockout format
- Current round pairings with board links

---

## Checklist
- [ ] Prisma migration: Tournament, TournamentPlayer, TournamentRound, TournamentPairing
- [ ] CRUD endpoints
- [ ] Swiss pairing algorithm (Dutch System)
- [ ] Arena pairing logic
- [ ] Round Robin schedule generator
- [ ] Tournament lifecycle cron job (auto-start, auto-advance rounds)
- [ ] Real-time standings via Redis ZADD
- [ ] Tournament games linked via `game.tournamentId`
- [ ] Frontend: Tournaments list page
- [ ] Frontend: Tournament detail + standings
- [ ] Frontend: Bracket view (Knockout)

## Verify
1. Admin creates Swiss tournament (7 rounds, blitz)
2. Players register
3. Round 1 auto-starts at scheduled time with valid pairings
4. Players play their games → results recorded → standings update
5. Round 2 pairings generated correctly (no rematches, score-grouped)
6. After 7 rounds → tournament marked COMPLETED
