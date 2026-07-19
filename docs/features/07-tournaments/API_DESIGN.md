# Feature 07 — Tournaments: API Design

## REST Endpoints

| Method | Path | Auth | Request Body | Response | Error Codes |
|--------|------|------|--------------|----------|-------------|
| GET | `/tournaments` | No | Query: `status?, format?, page?, limit?` | `{ data: TournamentSummaryDto[], total, page, limit }` | — |
| GET | `/tournaments/:id` | No | — | `TournamentDetailDto` | 404 NOT_FOUND |
| POST | `/tournaments` | JWT | `CreateTournamentDto` | `TournamentDetailDto` | 400 VALIDATION_ERROR |
| POST | `/tournaments/:id/join` | JWT | — | `{ message: 'Joined' }` | 404 NOT_FOUND, 409 ALREADY_JOINED, 409 TOURNAMENT_FULL, 400 NOT_UPCOMING |
| DELETE | `/tournaments/:id/leave` | JWT | — | `{ message: 'Left' }` | 404 NOT_FOUND, 400 NOT_UPCOMING, 400 NOT_REGISTERED |
| GET | `/tournaments/:id/standings` | No | — | `StandingsDto[]` | 404 NOT_FOUND |
| GET | `/tournaments/:id/pairings` | No | Query: `round?` | `PairingDto[]` | 404 NOT_FOUND |

## Key TypeScript Interfaces

```typescript
// POST /tournaments body
interface CreateTournamentDto {
  name: string;           // 3-100 chars
  format: 'SWISS' | 'ARENA' | 'ROUND_ROBIN' | 'KNOCKOUT';
  timeControl: string;    // e.g. "5+3" (5 min + 3 sec increment)
  maxPlayers: number;     // 4-256
  startAt: string;        // ISO 8601, must be in the future
  maxRounds?: number;     // Swiss only; defaults to ceil(log2(players))
}

// GET /tournaments response item
interface TournamentSummaryDto {
  id: string;
  name: string;
  format: string;
  status: 'UPCOMING' | 'ONGOING' | 'COMPLETED';
  playerCount: number;
  maxPlayers: number;
  startAt: string;
  timeControl: string;
}

// GET /tournaments/:id response
interface TournamentDetailDto extends TournamentSummaryDto {
  createdById: string;
  currentRound: number;
  totalRounds: number;
  players: TournamentPlayerDto[];
}

interface TournamentPlayerDto {
  userId: string;
  username: string;
  rating: number;
  score: number;
  buchholz: number;
  hasBye: boolean;
}

// GET /tournaments/:id/standings response
interface StandingsDto {
  rank: number;
  userId: string;
  username: string;
  score: number;          // 1 per win, 0.5 per draw, 0 per loss
  buchholz: number;       // Sum of opponents' scores (tiebreak)
  gamesPlayed: number;
}

// GET /tournaments/:id/pairings response
interface PairingDto {
  round: number;
  whitePlayerId: string;
  whiteUsername: string;
  blackPlayerId: string;
  blackUsername: string;
  gameId: string | null;  // null if game not yet created (future round)
  result: 'WHITE_WIN' | 'BLACK_WIN' | 'DRAW' | 'BYE' | null;
}
```

## Error Response Format

```json
{
  "statusCode": 409,
  "error": "TOURNAMENT_FULL",
  "message": "This tournament has reached its maximum player count"
}
```
