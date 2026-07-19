# 09-Social — API Design

All endpoints require `Authorization: Bearer <accessToken>` (JWT). The `userId` is extracted from the token payload — never trust a userId from the request body for ownership checks.

---

## Friendships — REST Endpoints

### POST /friends/request

Send a friend request to another user.

**Request body:**
```json
{ "addresseeId": "clxabc123" }
```

**Responses:**

| Status | Body | When |
|---|---|---|
| 201 | `{ id, requesterId, addresseeId, status: "PENDING", createdAt }` | Request created |
| 400 | `{ message: "Cannot send friend request to yourself" }` | `addresseeId === requesterId` |
| 404 | `{ message: "User not found" }` | `addresseeId` does not exist |
| 409 | `{ message: "Friend request already exists" }` | Row already exists (any status) |

**Side effect:** emits `friend_request_received` Socket.io event to addressee's active sockets.

```json
// friend_request_received payload
{
  "friendship": { "id": "...", "requesterId": "...", "requesterUsername": "...", "createdAt": "..." }
}
```

---

### POST /friends/:id/accept

Accept an incoming friend request. `:id` is the Friendship row id.

**Responses:**

| Status | Body | When |
|---|---|---|
| 200 | `{ id, requesterId, addresseeId, status: "ACCEPTED", updatedAt }` | Accepted |
| 403 | `{ message: "Only the addressee can accept a request" }` | `currentUserId !== friendship.addresseeId` |
| 404 | `{ message: "Friendship not found" }` | Row doesn't exist |
| 409 | `{ message: "Request is not in PENDING status" }` | Already accepted/declined |

**Side effect:** emits `friend_accepted` Socket.io event to requester's active sockets.

```json
// friend_accepted payload
{
  "friendship": { "id": "...", "addresseeId": "...", "addresseeUsername": "..." }
}
```

---

### POST /friends/:id/decline

Decline an incoming friend request.

**Responses:**

| Status | Body | When |
|---|---|---|
| 200 | `{ id, status: "DECLINED" }` | Declined |
| 403 | `{ message: "Only the addressee can decline a request" }` | Wrong user |
| 404 | `{ message: "Friendship not found" }` | Row doesn't exist |

---

### DELETE /friends/:id

Unfriend an existing friend. Either party can unfriend. Deletes the Friendship row.

**Responses:**

| Status | Body | When |
|---|---|---|
| 200 | `{ message: "Unfriended successfully" }` | Deleted |
| 403 | `{ message: "You are not part of this friendship" }` | Neither requester nor addressee |
| 404 | `{ message: "Friendship not found" }` | Row doesn't exist |

---

### POST /friends/:id/block

Block a user. Sets status to BLOCKED. The current user becomes the blocker.

**Request body:** none

**Responses:**

| Status | Body | When |
|---|---|---|
| 200 | `{ id, status: "BLOCKED" }` | Blocked |
| 403 | `{ message: "You are not part of this friendship" }` | Wrong user |
| 404 | `{ message: "Friendship not found" }` | Row doesn't exist |

**Note:** BLOCKED is unidirectional. Only the blocker sees status BLOCKED. The blocked user's view of the friendship is removed entirely. A blocked user attempting to send a new request receives 409 (the BLOCKED row exists).

---

### GET /friends

List all accepted friends with presence enrichment.

**Response 200:**
```json
{
  "friends": [
    {
      "friendshipId": "clxabc123",
      "id": "clxuser456",
      "username": "ada_lovelace",
      "avatar": "https://cdn.chessweb.com/avatars/default.png",
      "isOnline": true,
      "lastSeen": "2026-06-24T10:30:00.000Z"
    }
  ],
  "total": 1
}
```

`isOnline` is `true` if `user:{id}:online` key exists in Redis. `lastSeen` is the `lastSeen` field from the User table, updated on socket disconnect.

---

### GET /friends/requests/incoming

List pending friend requests where the current user is the addressee.

**Response 200:**
```json
{
  "requests": [
    {
      "id": "clxfr789",
      "requesterId": "clxuser111",
      "requesterUsername": "garry_k",
      "requesterAvatar": "https://...",
      "createdAt": "2026-06-23T08:00:00.000Z"
    }
  ]
}
```

---

### GET /friends/requests/outgoing

List pending friend requests sent by the current user.

**Response 200:**
```json
{
  "requests": [
    {
      "id": "clxfr999",
      "addresseeId": "clxuser222",
      "addresseeUsername": "magnus_c",
      "addresseeAvatar": "https://...",
      "createdAt": "2026-06-23T09:00:00.000Z"
    }
  ]
}
```

---

## User Search — REST Endpoint

### GET /users/search?q=\<query\>

Search users by username prefix. Returns up to 10 results. Excludes the current user.

**Query params:**
- `q` (required) — username substring, case-insensitive, minimum 2 characters

**Response 200:**
```json
{
  "users": [
    {
      "id": "clxuser333",
      "username": "adam_smith",
      "avatar": "https://...",
      "isFriend": false,
      "hasPendingRequest": true
    }
  ]
}
```

`isFriend` is `true` if ACCEPTED friendship exists. `hasPendingRequest` is `true` if a PENDING request exists in either direction.

**Response 400:** `{ "message": "Query must be at least 2 characters" }` if `q.length < 2`.

---

## Activity Feed — REST Endpoint

### GET /feed

Paginated activity feed for the current user. Shows entries from accepted friends only, sorted by `_id` descending (most recent first).

**Query params:**
- `cursor` (optional) — MongoDB ObjectId string of the last seen entry; omit for first page
- `limit` (optional, default 20, max 50) — number of entries per page

**Response 200:**
```json
{
  "entries": [
    {
      "id": "6672a1b2c3d4e5f6a7b8c9d0",
      "actorId": "clxuser456",
      "actorUsername": "ada_lovelace",
      "actorAvatar": "https://...",
      "type": "GAME_WON",
      "targetId": "game_abc",
      "targetName": "garry_k",
      "metadata": { "result": "WIN", "timeControl": "5+0", "ratingChange": 12 },
      "createdAt": "2026-06-24T10:00:00.000Z"
    }
  ],
  "nextCursor": "6672a1b2c3d4e5f6a7b8c9c0",
  "hasMore": true
}
```

`nextCursor` is the `_id` of the last entry in the response. Pass it as `cursor` to get the next page. `hasMore` is `false` when fewer than `limit` entries are returned.

---

## Socket.io — /presence Namespace

**Connection:** Client connects to `/presence` namespace. Must include the JWT in the handshake auth:

```javascript
const socket = io('/presence', {
  auth: { token: accessToken }
});
```

The server validates the JWT on connection via a `WsJwtGuard` or inline in `handleConnection`.

### Client → Server Events

| Event | Payload | Description |
|---|---|---|
| `heartbeat` | none | Refresh online TTL. Client emits every 25s. |

### Server → Client Events

| Event | Payload | Description |
|---|---|---|
| `friend_online` | `{ userId: string }` | A friend just came online |
| `friend_offline` | `{ userId: string }` | A friend just went offline or TTL expired |
| `friend_request_received` | `{ friendship: {...} }` | Someone sent you a friend request |
| `friend_accepted` | `{ friendship: {...} }` | Your outgoing request was accepted |

---

## Error Response Shape

All errors follow NestJS's default HttpException format:

```json
{
  "statusCode": 403,
  "message": "Only the addressee can accept a request",
  "error": "Forbidden"
}
```

---

## DTO Reference

```typescript
// send-friend-request.dto.ts
export class SendFriendRequestDto {
  @IsString()
  @IsNotEmpty()
  addresseeId: string;
}

// GET /feed query params
export class FeedQueryDto {
  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  @Type(() => Number)
  limit?: number = 20;
}

// GET /users/search query params
export class UserSearchDto {
  @IsString()
  @MinLength(2)
  q: string;
}
```
