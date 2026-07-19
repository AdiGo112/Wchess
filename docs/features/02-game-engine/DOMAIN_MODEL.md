# 02-Game-Engine — Domain Model

## Entities (Prisma schema)

```prisma
model Game {
  id          String   @id @default(uuid())
  whiteId     String
  blackId     String?  // null for computer games
  white       User     @relation("WhiteGames", fields: [whiteId], references: [id])
  black       User?    @relation("BlackGames", fields: [blackId], references: [id])
  variant     String   // 'standard' | 'blitz' | 'bullet' | 'rapid'
  timeControl Int      // initial clock in seconds (e.g., 300 for 5min)
  increment   Int      @default(0)  // seconds added after each move
  status      String   // 'ongoing' | 'white_wins' | 'black_wins' | 'draw'
  result      String?  // 'checkmate' | 'timeout' | 'resignation' | 'stalemate' | 'agreement' | 'insufficient'
  pgn         String?  // full PGN string
  whiteRatingBefore Int
  blackRatingBefore Int?
  whiteRatingAfter  Int?
  blackRatingAfter  Int?
  startedAt   DateTime @default(now())
  endedAt     DateTime?
  moves       Move[]

  @@index([whiteId])
  @@index([blackId])
}

model Move {
  id         String   @id @default(uuid())
  gameId     String
  game       Game     @relation(fields: [gameId], references: [id], onDelete: Cascade)
  moveNumber Int
  color      String   // 'white' | 'black'
  san        String   // Standard Algebraic Notation e.g. 'e4', 'Nf3', 'O-O'
  from       String   // e.g. 'e2'
  to         String   // e.g. 'e4'
  promotion  String?  // 'q' | 'r' | 'b' | 'n'
  fen        String   // FEN after this move
  timeTaken  Int      // ms taken for this move
  createdAt  DateTime @default(now())

  @@index([gameId])
}
```

## In-memory game state (Redis, not persisted to DB until game ends)

```typescript
export interface GameRoom {
  gameId: string;
  whiteId: string;
  blackId: string | null;      // null = computer
  fen: string;                  // current board position
  moves: MoveRecord[];
  whiteTime: number;            // ms remaining
  blackTime: number;            // ms remaining
  increment: number;            // ms added per move
  turn: 'white' | 'black';
  status: 'active' | 'finished';
  variant: string;
  timeControl: number;          // initial time in ms
  pendingDraw: 'white' | 'black' | null;  // who offered draw
  disconnectedAt: Record<string, number>; // userId -> timestamp of disconnect
}

export interface MoveRecord {
  san: string;
  from: string;
  to: string;
  promotion?: string;
  fen: string;
  timeTaken: number;
  timestamp: number;
}
```

## Business rules

1. Only the player whose turn it is may submit a move.
2. All moves are validated by chess.js server-side; illegal moves are rejected with ILLEGAL_MOVE error.
3. A draw offer is only valid for one move. If the opponent moves, the draw offer is automatically cancelled.
4. A player who disconnects has a 30-second grace period before being auto-resigned.
5. If a player's clock reaches 0ms, they lose on time — unless the opponent has insufficient material to checkmate, in which case the game is a draw.
6. Rating changes are calculated using Glicko-2 and stored on the Game record. They are applied to User.rating immediately on game end.
7. A game with `blackId = null` is a computer game; clock and rating rules apply only to the human player.
