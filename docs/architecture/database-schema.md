# Database Schema

## PostgreSQL (Prisma) — `backend/prisma/schema.prisma`

### User
```prisma
model User {
  id            String      @id @default(cuid())
  email         String      @unique
  username      String      @unique
  name          String
  passwordHash  String?
  oauthProvider String?     // "google" | "github"
  oauthId       String?
  emailVerified Boolean     @default(false)
  avatarUrl     String?
  bio           String?
  country       String?
  role          Role        @default(USER)
  isBanned      Boolean     @default(false)
  createdAt     DateTime    @default(now())
  updatedAt     DateTime    @updatedAt
  lastSeenAt    DateTime?

  ratings       UserRating[]
  gamesAsWhite  Game[]      @relation("WhitePlayer")
  gamesAsBlack  Game[]      @relation("BlackPlayer")
  refreshTokens RefreshToken[]
  puzzleAttempts PuzzleAttempt[]
  tournaments   TournamentPlayer[]
}

enum Role { USER MODERATOR ADMIN }
```

### UserRating (per variant — Glicko-2)
```prisma
model UserRating {
  id               String      @id @default(cuid())
  userId           String
  variant          TimeVariant
  rating           Int         @default(1200)
  ratingDeviation  Float       @default(350)   // Glicko-2 RD
  volatility       Float       @default(0.06)  // Glicko-2 σ
  wins             Int         @default(0)
  losses           Int         @default(0)
  draws            Int         @default(0)
  provisional      Boolean     @default(true)  // true when RD > 110
  updatedAt        DateTime    @updatedAt
  user             User        @relation(...)

  @@unique([userId, variant])
}

enum TimeVariant { BULLET BLITZ RAPID CLASSICAL CORRESPONDENCE PUZZLE }
```

### Game
```prisma
model Game {
  id              String      @id @default(cuid())
  whiteId         String?
  blackId         String?
  whiteUsername   String
  blackUsername   String
  whiteRating     Int
  blackRating     Int
  whiteRatingDiff Int         @default(0)
  blackRatingDiff Int         @default(0)
  result          GameResult
  reason          GameReason
  variant         TimeVariant
  timeControl     Int         // seconds per side
  increment       Int         @default(0)
  pgn             String      // full PGN string
  fen             String?     // final position FEN
  moves           String[]    // SAN array ["e4","e5",...]
  duration        Int?        // actual game seconds
  openingEco      String?     // "C20", filled at save from the SAN list
  openingName     String?     // "King's Pawn Game"; null on games saved before 2026-09-08
  tournamentId    String?
  createdAt       DateTime    @default(now())
}

enum GameResult { WHITE BLACK DRAW ABORTED }
enum GameReason {
  CHECKMATE RESIGNATION TIMEOUT STALEMATE AGREEMENT
  INSUFFICIENT_MATERIAL THREEFOLD_REPETITION FIFTY_MOVE ABANDONED
}
```

### GameAnalysis
Post-game Stockfish analysis, one row per game (Stockfish Increment 2).

```prisma
model GameAnalysis {
  gameId        String   @id       // also the FK to Game, ON DELETE CASCADE
  depth         Int                // 18
  moves         Json               // AnalysedMove[], one entry per ply
  accuracyWhite Float              // 0-100
  accuracyBlack Float
  engine        String   @default("stockfish-18-lite")
  createdAt     DateTime @default(now())
}
```

Each entry in `moves`:

```ts
{
  ply: 7, san: "Nf6", color: "w" | "b",
  evalCp: -250,        // AFTER the move, White's point of view. +/-10000 = mate on the board
  mate: null,          // moves to mate, White's point of view, when the engine sees one
  bestMove: "d7d5",    // engine's choice in the position BEFORE the move (UCI)
  playedMove: "g8f6",
  cpLoss: 280,         // centipawns given away, clamped at +/-1000 either side
  accuracy: 12.4,
  classification: "BEST" | "EXCELLENT" | "GOOD" | "INACCURACY" | "MISTAKE" | "BLUNDER",
}
```

Written once and kept: the same moves at the same depth always score the same,
so a second viewer costs no engine time. Deleting the game deletes the row.
### Tournament
```prisma
model Tournament {
  id          String            @id @default(cuid())
  name        String
  format      TournamentFormat
  status      TournamentStatus  @default(UPCOMING)
  variant     TimeVariant
  timeControl Int
  increment   Int               @default(0)
  rounds      Int               @default(7)
  maxPlayers  Int               @default(64)
  minRating   Int?
  maxRating   Int?
  startAt     DateTime
  createdBy   String
  createdAt   DateTime          @default(now())

  players     TournamentPlayer[]
  roundPairings TournamentRound[]
  games       Game[]
}

enum TournamentFormat  { SWISS ROUND_ROBIN KNOCKOUT ARENA }
enum TournamentStatus  { UPCOMING ONGOING COMPLETED CANCELLED }
```

### Puzzle
```prisma
model Puzzle {
  id         String   @id @default(cuid())
  fen        String
  moves      String[] // correct solution moves (UCI)
  rating     Int      @default(1500)
  themes     String[] // ["fork","pin","discoveredAttack"]
  openingEco String?
  plays      Int      @default(0)
  createdAt  DateTime @default(now())

  attempts   PuzzleAttempt[]
}

model PuzzleAttempt {
  id        String   @id @default(cuid())
  userId    String
  puzzleId  String
  solved    Boolean
  timeMs    Int
  createdAt DateTime @default(now())
}
```

### Social
```prisma
model Friendship {
  id          String           @id @default(cuid())
  requesterId String
  addresseeId String
  status      FriendshipStatus @default(PENDING)
  createdAt   DateTime         @default(now())
  updatedAt   DateTime         @updatedAt

  @@unique([requesterId, addresseeId])
}

enum FriendshipStatus { PENDING ACCEPTED BLOCKED }

model Follow {
  followerId  String
  followingId String
  createdAt   DateTime @default(now())
  @@id([followerId, followingId])
}

model RefreshToken {
  id        String   @id @default(cuid())
  userId    String
  token     String   @unique
  expiresAt DateTime
  createdAt DateTime @default(now())
}
```

---

## MongoDB — removed

Mongo left the stack on 2026-07-19. Its only consumers were chat and
notifications, both cut by ADR-0032, so the `Message`, `Notification`,
`Analysis`, `Study` and `ActivityFeed` collections this file used to document
no longer exist anywhere - neither in code nor in a running database.

**Analysis is Postgres now**, not a Mongo collection: see `GameAnalysis` above.
The old sketch stored one entry per *position*; the shipped table stores one per
*ply*, which is what a move list and an eval graph both want.

See `docs/FUTURE_SCOPE.md` for what the cut features would need if they return.

---
## Redis Keys

### Active Game Rooms
```
KEY   game:room:{roomId}        TYPE: string (JSON)   TTL: 86400
VALUE: {
  id, whitePlayer, blackPlayer,
  fen, moves, timers: {white: ms, black: ms},
  lastMoveAt, status, timeControl, increment, variant,
  startedAt, drawOfferedBy, rematchRequestedBy,
  difficulty,   // 1-5 on computer games only
  version       // optimistic-concurrency counter, bumped by every casSaveRoom
}

KEY   clock:deadlines           TYPE: ZSET  score=epoch-ms member=roomId
```

No `spectators` field: the spectate handler was cut by ADR-0032. `version` is
read-modify-written through a Lua compare-and-set, so two concurrent moves
cannot both win. `clock:deadlines` is the single sorted-set sweeper that ADR-0004
runs instead of one `setInterval` per game - one timer for every live game, and
deadlines that survive a restart.

### Matchmaking Queues
```
KEY   queue:{variant}:{timeControl}   TYPE: List (LPUSH/RPOP)
                                      e.g. queue:blitz:300, queue:rapid:600

Element: { userId, username, rating, socketId, joinedAt }
```

### Leaderboards
```
KEY   leaderboard:{variant}                 TYPE: ZSET  score=rating member=userId  (all-time, no TTL)
KEY   leaderboard:week:{isoWeek}:{variant}  TYPE: ZSET  TTL 14d   e.g. leaderboard:week:2026-W30:blitz
KEY   leaderboard:month:{yyyy-mm}:{variant} TYPE: ZSET  TTL 62d   e.g. leaderboard:month:2026-07:blitz
KEY   cache:leaderboard:{period}:{variant}:{limit}  TYPE: string(JSON) TTL 60s  (enriched top-N)
```
`updateScore` (on every rated game end) ZADDs to all-time + the current week + the
current month bucket, re-arming each bucket's TTL. Old buckets self-expire — no cron.

**Live boards, not snapshots.** The `docs` originally said "weekly/monthly snapshot"
(rating *gained* over the period), which needs period-boundary baselines + a cron. These
buckets instead hold the *current* rating of players who played in the period — the
Lichess-weekly semantic. Simpler, cron-free, and correct for "who's hot this week."
The 60s `cache:` entry avoids re-hitting Postgres for usernames on every board load;
empty boards are never cached (so a first game shows up immediately).

### Socket Identity
```
KEY   socket:{socketId}         TYPE: string -> userId
KEY   user:socket:{userId}      TYPE: string -> socketId
```

That is the whole set. `online:{userId}`, `session:{userId}`, `spectators:{roomId}`
and `ratelimit:{ip}:{endpoint}` were documented but never written by any code;
the `online:` key was deleted outright in the pre-Increment-2 hardening pass.
Rate limiting is `@nestjs/throttler` in process memory, not Redis.

### BullMQ — removed

Bull and its five queues went with the v1 scope cut (ADR-0032). Nothing in
`backend/src` enqueues a job. Analysis, the one job-shaped workload that
survived, runs as a promise chain over a single out-of-process engine instead
- see `AnalysisService`. That is a deliberate single-instance choice, and it is
listed in ADR-0032 under "Before adding a second instance".
