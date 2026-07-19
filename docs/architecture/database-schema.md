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
  openingEco      String?
  openingName     String?
  tournamentId    String?
  createdAt       DateTime    @default(now())
}

enum GameResult { WHITE BLACK DRAW ABORTED }
enum GameReason {
  CHECKMATE RESIGNATION TIMEOUT STALEMATE AGREEMENT
  INSUFFICIENT_MATERIAL THREEFOLD_REPETITION FIFTY_MOVE ABANDONED
}
```

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

## MongoDB (Mongoose)

### Message (chat-service)
```typescript
{
  roomId:   String,   // "game:{roomId}" | "lobby" | "dm:{userId}"
  roomType: String,   // "game" | "lobby" | "dm"
  senderId: String,
  username: String,
  text:     String,   // max 500 chars
  createdAt: Date,    // TTL index: 30 days for game chat
}
// index: { roomId: 1, createdAt: -1 }
```

### Notification
```typescript
{
  userId:   String,
  type:     String,   // "game_result" | "friend_request" | "tournament_start" | ...
  data:     Mixed,    // type-specific payload
  read:     Boolean,  // default false
  createdAt: Date,
}
// index: { userId: 1, read: 1, createdAt: -1 }
```

### Analysis
```typescript
{
  gameId:   String,
  status:   String,   // "pending" | "complete"
  positions: [{
    fen:       String,
    eval:      Number,  // centipawns
    bestMove:  String,
    depth:     Number,
    class:     String,  // "brilliant"|"good"|"inaccuracy"|"mistake"|"blunder"
  }],
  accuracy: { white: Number, black: Number },
  createdAt: Date,
}
```

### Study
```typescript
{
  ownerId:       String,
  title:         String,
  isPublic:      Boolean,
  collaborators: [String],
  chapters: [{
    name:        String,
    fen:         String,
    pgn:         String,
    orientation: String,
    mode:        String,
  }],
  createdAt: Date,
  updatedAt: Date,
}
```

### ActivityFeed
```typescript
{
  userId:    String,
  actorId:   String,
  type:      String,  // "game_played"|"puzzle_solved"|"tournament_joined"
  data:      Mixed,
  createdAt: Date,
}
// TTL index: 90 days
```

---

## Redis Keys

### Active Game Rooms
```
KEY   game:room:{roomId}        TYPE: string (JSON)   TTL: 86400
VALUE: {
  id, whitePlayer, blackPlayer,
  fen, moves, timers: {white: ms, black: ms},
  lastMoveAt, status, timeControl, increment,
  startedAt, drawOfferedBy, spectators
}
```

### Matchmaking Queues
```
KEY   queue:bullet              TYPE: List (LPUSH/RPOP)
KEY   queue:blitz               TYPE: List
KEY   queue:rapid               TYPE: List
KEY   queue:classical           TYPE: List

Element: { userId, username, rating, socketId, joinedAt }
```

### Leaderboards
```
KEY   leaderboard:bullet        TYPE: ZSET  score=rating  member=userId
KEY   leaderboard:blitz         TYPE: ZSET
KEY   leaderboard:rapid         TYPE: ZSET
KEY   leaderboard:classical     TYPE: ZSET
KEY   leaderboard:week:blitz    TYPE: ZSET  (weekly snapshot)
KEY   leaderboard:month:blitz   TYPE: ZSET  (monthly snapshot)
```

### Presence & Caching
```
KEY   online:{userId}           TYPE: string "1"    TTL: 30s (heartbeat refresh)
KEY   session:{userId}          TYPE: string (JSON) TTL: 300s
KEY   socket:{socketId}         TYPE: string → userId
KEY   user:socket:{userId}      TYPE: string → socketId
KEY   spectators:{roomId}       TYPE: Set of socketIds
KEY   ratelimit:{ip}:{endpoint} TYPE: ZSET (sliding window)
```

### BullMQ Queues (Redis-backed)
```
bull:stockfish      — { fen, movetime, depth, roomId, userId }
bull:notifications  — { userId, type, data }
bull:analysis       — { gameId, userId }
bull:email          — { to, template, data }
bull:rating-update  — { gameId, whiteId, blackId, result }
```
