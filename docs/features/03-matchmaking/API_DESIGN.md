# 03-Matchmaking — API Design

## Socket.io events (/matchmaking namespace)

### Client → Server

| Event       | Payload                                              | Description                    |
|-------------|------------------------------------------------------|--------------------------------|
| join_queue  | { variant, timeControl, increment }                  | Join matchmaking queue         |
| leave_queue | { variant, timeControl }                             | Leave queue                    |

### Server → Client

| Event          | Payload                                              | Description                    |
|----------------|------------------------------------------------------|--------------------------------|
| match_found    | { gameId, color, opponent: { username, rating } }    | Match found, game created      |
| queue_position | { position, estimatedWait: seconds }                 | Position update (every 5s)     |
| error          | { code, message }                                    | Queue error                    |

## REST endpoints

| Method | Path                              | Auth | Request body                            | Response                        |
|--------|-----------------------------------|------|-----------------------------------------|---------------------------------|
| POST   | /matchmaking/challenge            | JWT  | { variant, timeControl, increment }      | { token, expiresAt, shareUrl }  |
| POST   | /matchmaking/challenge/:token/accept | JWT | {}                                   | { gameId, color }               |
| POST   | /matchmaking/computer             | JWT  | { difficulty, variant, timeControl }    | { gameId }                      |
| GET    | /matchmaking/queue-status         | JWT  | —                                       | { inQueue, position, variant }  |

## DTOs

```typescript
export class JoinQueueDto {
  @IsString()
  @IsIn(['standard', 'blitz', 'bullet', 'rapid'])
  variant: string;

  @IsInt()
  @Min(30)
  @Max(3600)
  timeControl: number; // seconds

  @IsInt()
  @Min(0)
  @Max(30)
  increment: number;
}

export class CreateChallengeDto {
  @IsString()
  variant: string;

  @IsInt()
  timeControl: number;

  @IsInt()
  increment: number;

  @IsOptional()
  @IsIn(['white', 'black', 'random'])
  creatorColor?: string;
}

export class CreateComputerGameDto {
  @IsInt()
  @Min(1)
  @Max(5)
  difficulty: number; // maps to Stockfish depth 1/3/5/10/15

  @IsString()
  variant: string;

  @IsInt()
  timeControl: number;
}
```

## Error codes

| Code                    | When                                       |
|-------------------------|--------------------------------------------|
| ALREADY_IN_QUEUE        | Player tries to join queue while queued    |
| CHALLENGE_NOT_FOUND     | Token not in Redis                         |
| CHALLENGE_EXPIRED       | Token TTL elapsed                          |
| CHALLENGE_ALREADY_ACCEPTED | Token already used                      |
| CANNOT_ACCEPT_OWN_CHALLENGE | Creator tries to accept their own link |
