# Feature 10 — Notifications: API Design

## REST Endpoints

| Method | Path | Auth | Request Body | Response | Error Codes |
|---|---|---|---|---|---|
| GET | `/notifications` | JWT | `?page=1&limit=20` (query) | `NotificationListResponse` | 401 |
| GET | `/notifications/unread-count` | JWT | — | `{ count: number }` | 401 |
| PATCH | `/notifications/:id/read` | JWT | — | `NotificationDto` | 401, 403, 404 |
| PATCH | `/notifications/read-all` | JWT | — | `{ updated: number }` | 401 |

## Key DTOs

```typescript
// Stored in MongoDB — returned by all read endpoints
interface NotificationDto {
  id: string;                        // MongoDB _id as string
  userId: string;                    // PostgreSQL user UUID
  type: NotificationType;
  title: string;                     // e.g., "Game Over", "Friend Request"
  body: string;                      // e.g., "You won against Magnus"
  read: boolean;
  payload: NotificationPayload;      // type-specific metadata
  createdAt: string;                 // ISO 8601
}

type NotificationType =
  | 'GAME_RESULT'
  | 'FRIEND_REQUEST'
  | 'TOURNAMENT_START'
  | 'ACHIEVEMENT'
  | 'RATING_MILESTONE';

// Payload shapes per type
interface GameResultPayload {
  gameId: string;
  opponent: string;        // username
  result: 'win' | 'loss' | 'draw';
  variant: string;         // 'standard' | 'blitz' | etc.
  ratingChange: number;    // e.g., +12 or -8
}

interface FriendRequestPayload {
  requestId: string;
  fromUserId: string;
  fromUsername: string;
  fromAvatarUrl: string;
}

interface TournamentStartPayload {
  tournamentId: string;
  tournamentName: string;
  startsAt: string;        // ISO 8601
}

interface AchievementPayload {
  achievementKey: string;  // e.g., 'first_win', 'ten_games'
  achievementName: string;
  iconUrl: string;
}

interface RatingMilestonePayload {
  variant: string;
  milestone: number;       // e.g., 1000, 1200, 1500, 1800, 2000
  newRating: number;
}

// GET /notifications response
interface NotificationListResponse {
  data: NotificationDto[];
  total: number;
  page: number;
  limit: number;
}
```

## Socket Events

| Event | Direction | Payload | Room |
|---|---|---|---|
| `new_notification` | Server → Client | `NotificationDto` | `notifications:{userId}` |

The client joins this room on socket connect by sending the JWT. The gateway extracts `userId` from the token and calls `socket.join('notifications:' + userId)`.

## Error Response Shape

```typescript
interface ErrorResponse {
  statusCode: number;
  message: string;
  error: string;
}
```

- **401**: Missing or invalid JWT
- **403**: Notification exists but belongs to a different user
- **404**: Notification with given `:id` not found in MongoDB
