# Feature 05 — Leaderboard: API Design

## Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | /leaderboard | JWT (optional) | Top N all-time players for a variant |
| GET | /leaderboard/weekly | JWT (optional) | Top N players for the current week |
| GET | /leaderboard/monthly | JWT (optional) | Top N players for the current month |
| GET | /leaderboard/me | JWT (required) | Authenticated user's own rank and stats |

## Query Parameters

### GET /leaderboard, /leaderboard/weekly, /leaderboard/monthly

| Param | Type | Default | Validation | Description |
|-------|------|---------|-----------|-------------|
| variant | string | 'blitz' | 'bullet'\|'blitz'\|'rapid'\|'classical' | Game variant |
| limit | number | 100 | 1–100 | Number of entries to return |

### GET /leaderboard/me

| Param | Type | Default | Validation | Description |
|-------|------|---------|-----------|-------------|
| variant | string | 'blitz' | 'bullet'\|'blitz'\|'rapid'\|'classical' | Game variant |

## TypeScript DTOs

```typescript
// dto/leaderboard-query.dto.ts
import { IsEnum, IsOptional, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export enum ChessVariant {
  BULLET = 'bullet',
  BLITZ = 'blitz',
  RAPID = 'rapid',
  CLASSICAL = 'classical',
}

export class LeaderboardQueryDto {
  @IsOptional()
  @IsEnum(ChessVariant)
  variant?: ChessVariant = ChessVariant.BLITZ;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit?: number = 100;
}

// dto/leaderboard-entry.dto.ts
export class LeaderboardEntryDto {
  rank: number;
  userId: string;
  username: string;
  rating: number;
  gamesPlayed: number;
  winRate: number;       // 0.0 to 1.0, e.g. 0.65 = 65%
}

export class UserRankDto {
  rank: number | null;   // null if user has no rated games in this variant
  userId: string;
  username: string;
  rating: number | null;
  gamesPlayed: number;
  winRate: number;
}
```

## Response Shapes

### GET /leaderboard (and /weekly, /monthly)

```json
{
  "variant": "blitz",
  "period": "all-time",
  "total": 3842,
  "entries": [
    {
      "rank": 1,
      "userId": "uuid-abc",
      "username": "MagnusBot",
      "rating": 2847,
      "gamesPlayed": 412,
      "winRate": 0.78
    },
    {
      "rank": 2,
      "userId": "uuid-def",
      "username": "AlphaKnight",
      "rating": 2801,
      "gamesPlayed": 289,
      "winRate": 0.74
    }
  ]
}
```

### GET /leaderboard/me

```json
{
  "variant": "blitz",
  "rank": 347,
  "userId": "uuid-xyz",
  "username": "AdiGo",
  "rating": 1540,
  "gamesPlayed": 63,
  "winRate": 0.52
}
```

When user has no rated games in this variant:

```json
{
  "variant": "blitz",
  "rank": null,
  "userId": "uuid-xyz",
  "username": "AdiGo",
  "rating": null,
  "gamesPlayed": 0,
  "winRate": 0
}
```

## Error Codes

| HTTP Status | Code | Trigger |
|-------------|------|---------|
| 400 | INVALID_VARIANT | `variant` not in allowed enum |
| 400 | INVALID_LIMIT | `limit` out of 1–100 range |
| 401 | UNAUTHORIZED | JWT missing on /leaderboard/me |

## Example cURL Commands

```bash
# All-time blitz top 10
curl "http://localhost:3000/leaderboard?variant=blitz&limit=10" \
  -H "Authorization: Bearer $TOKEN"

# Weekly rapid
curl "http://localhost:3000/leaderboard/weekly?variant=rapid" \
  -H "Authorization: Bearer $TOKEN"

# Monthly bullet
curl "http://localhost:3000/leaderboard/monthly?variant=bullet" \
  -H "Authorization: Bearer $TOKEN"

# My own rank in classical
curl "http://localhost:3000/leaderboard/me?variant=classical" \
  -H "Authorization: Bearer $TOKEN"
```
