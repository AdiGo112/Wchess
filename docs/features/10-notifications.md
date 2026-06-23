# Feature 10 — Notifications

**Branch:** `feature/notifications`
**Depends on:** `feature/auth`, `feature/social`

## Goal
Real-time in-app notifications delivered via Socket.io, stored in MongoDB. Email delivery via BullMQ + SendGrid.

---

## Backend

### Files
```
backend/src/notifications/
├── notifications.module.ts
├── notifications.service.ts      — create, fetch, mark read
├── notifications.controller.ts   — REST endpoints
├── notifications.processor.ts    — BullMQ worker (email delivery)
├── notifications.gateway.ts      — Socket.io delivery
└── notification.schema.ts        — Mongoose schema
```

### Mongoose Schema
```typescript
{
  userId:    String,    // recipient
  type:      String,    // see types below
  data:      Mixed,     // type-specific payload
  read:      Boolean,   // default false
  delivered: Boolean,   // socket delivery confirmed
  createdAt: Date,
}
// Index: { userId: 1, read: 1, createdAt: -1 }
```

### Notification Types
| Type | Trigger | Data |
|---|---|---|
| `game_result` | Game ends | `{ gameId, result, ratingChange, opponent }` |
| `friend_request` | Friend request sent | `{ fromUserId, fromUsername }` |
| `friend_accepted` | Request accepted | `{ fromUserId, fromUsername }` |
| `challenge_received` | Game challenge | `{ roomId, fromUsername, timeControl }` |
| `tournament_starting` | 5 min before start | `{ tournamentId, name }` |
| `tournament_round` | New round starts | `{ tournamentId, roundNumber, opponentUsername }` |
| `puzzle_streak` | Streak milestone | `{ streakCount }` |
| `rating_milestone` | Rating crosses 100s | `{ rating, variant }` |

### Delivery Flow
```
Event occurs (game ends, friend request, etc.)
  │
  ▼
NotificationsService.create(userId, type, data)
  │
  ├─ Save to MongoDB
  │
  ├─ Is user online? (check Redis online:{userId})
  │   YES → emit notification via NotificationsGateway
  │   NO  → stored, delivered on next login
  │
  └─ Queue email job (BullMQ bull:email)
       NotificationsProcessor handles:
       rate-limit: max 3 emails/hour/user
       send via SendGrid
```

### Endpoints
```
GET   /api/v1/notifications              — list ?unread=true&limit=20
PATCH /api/v1/notifications/:id/read     — mark read
PATCH /api/v1/notifications/read-all     — mark all read
```

### Socket Events (Server → Client)
```
notification        { id, type, data, createdAt }
notification_read   { id }
```

---

## Frontend

### Components
```
frontend/src/components/notifications/
├── NotificationBell.tsx    — icon with unread count badge
└── NotificationDropdown.tsx — list of recent notifications
```

### Features
- Bell icon in Navbar with unread count badge
- Click → dropdown with last 20 notifications
- Unread shown in bold
- Click notification → navigate to relevant page
- "Mark all as read" button
- Real-time delivery via socket

---

## Checklist
- [ ] MongoDB Notification schema
- [ ] NotificationsService: create, getForUser, markRead, markAllRead
- [ ] NotificationsGateway: emit to user's socket on create
- [ ] NotificationsProcessor: BullMQ email worker
- [ ] Email rate limiting (3/hour/user)
- [ ] All REST endpoints
- [ ] Trigger notifications from: game end, friend request, tournament
- [ ] Frontend: NotificationBell with badge
- [ ] Frontend: NotificationDropdown
- [ ] Frontend: real-time socket subscription
- [ ] Frontend: navigate on click (e.g., game result → game history)

## Verify
1. Game ends → both players receive `game_result` notification
2. Bell shows unread count
3. Click notification → navigates to correct page
4. Mark read → badge decrements
5. Offline user → notification stored → delivered on next login
6. Email sent for game_result (check SendGrid dashboard)
