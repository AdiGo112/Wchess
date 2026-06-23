# Feature 09 — Social

**Branch:** `feature/social`
**Depends on:** `feature/auth`

## Goal
Friend system, follow graph, online presence, and activity feed.

---

## Backend

### Files
```
backend/src/social/
├── social.module.ts
├── social.service.ts
├── social.controller.ts
└── activity.schema.ts   — MongoDB activity feed schema
```

### PostgreSQL Models (Prisma)
```
Friendship  — bidirectional friend requests (requesterId, addresseeId, status)
Follow      — one-directional follow graph
```

### Online Presence (Redis)
```
KEY   online:{userId}   TYPE: string "1"   TTL: 30s
```
- Refreshed by heartbeat every 15 seconds from frontend
- `isOnline(userId)` = `EXISTS online:{userId}`
- Friend list enriched with online status on each load

### Activity Feed (MongoDB)
```typescript
{
  userId:    String,   // who sees this in their feed
  actorId:   String,   // who did the thing
  type:      String,   // "game_played"|"puzzle_solved"|"rating_milestone"|"tournament_joined"
  data:      Mixed,    // e.g. { gameId, result, ratingChange }
  createdAt: Date,
}
// TTL: 90 days
```
Activity items generated after game end, puzzle solve, tournament join.

### Endpoints
```
GET    /api/v1/friends                     — my friends list + online status
GET    /api/v1/friends/requests/pending    — incoming requests
POST   /api/v1/friends/request/:userId     — send request
POST   /api/v1/friends/accept/:requestId   — accept
POST   /api/v1/friends/decline/:requestId  — decline
DELETE /api/v1/friends/:friendId           — unfriend

POST   /api/v1/follow/:userId              — follow
DELETE /api/v1/follow/:userId              — unfollow

GET    /api/v1/activity-feed               — my feed (follows + friends)
```

### Error codes
| Code | Meaning |
|---|---|
| SOCIAL_001 | Friend request already sent |
| SOCIAL_002 | Friend request not found |

---

## Frontend

### Components / Pages
```
frontend/src/
├── pages/Profile.tsx         — user profile with friend/follow buttons
├── components/FriendList.tsx — friends panel (sidebar)
└── components/ActivityFeed.tsx — home page feed
```

### Features
- Friend list shows: avatar, username, rating, online status (green dot), current activity
- "Currently playing" link if friend is in a game
- Activity feed on home page (game results, puzzle streaks, etc.)

---

## Checklist
- [ ] Prisma: Friendship, Follow models + migration
- [ ] SocialService: all friend CRUD
- [ ] SocialService: activity feed (MongoDB)
- [ ] Online presence: heartbeat endpoint + Redis TTL
- [ ] ActivityFeed: write entries after game end, puzzle solve
- [ ] All endpoints
- [ ] Frontend: Profile page with friend/follow buttons
- [ ] Frontend: FriendList component with online status
- [ ] Frontend: ActivityFeed on home page
- [ ] Frontend: heartbeat (ping every 15s while tab active)

## Verify
1. Send friend request → target receives it
2. Accept → both appear in each other's friend list
3. User is online → green dot appears within 15s
4. User goes offline → dot disappears within 30s
5. Play a game → both players' feeds show the game result
6. Activity feed shows events from friends + followed users
