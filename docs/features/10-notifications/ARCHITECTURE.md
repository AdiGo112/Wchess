# Feature 10 — Notifications: Architecture

## Service Map

```
┌─────────────────────────────────────────────────────────────────────┐
│  Client Browser                                                     │
│  ┌─────────────────────────┐  ┌────────────────────────────────┐   │
│  │  NotificationBell.jsx   │  │  Socket.io Client              │   │
│  │  NotificationDropdown   │  │  (on mount: connect + join     │   │
│  │                         │  │   notifications:{userId} room) │   │
│  └────────┬────────────────┘  └──────────────┬─────────────────┘   │
│           │ HTTP REST                        │ WS event             │
└───────────┼──────────────────────────────────┼─────────────────────┘
            │                                  │
            ▼                                  ▼
┌──────────────────────────────────────────────────────────────────────┐
│  NestJS Backend                                                      │
│                                                                      │
│  NotificationsController  ◄─── JWT Guard                            │
│  GET /notifications                                                  │
│  GET /notifications/unread-count                                     │
│  PATCH /notifications/:id/read                                       │
│  PATCH /notifications/read-all                                       │
│           │                                                          │
│           ▼                                                          │
│  NotificationsService                                                │
│  create(userId, type, title, body, payload)                          │
│       │                      │                                       │
│       │                      ▼                                       │
│       │            NotificationsGateway                              │
│       │            sendToUser(userId, notification)                  │
│       │            emits → socket room notifications:{userId}        │
│       │                                                              │
│       ▼                                                              │
│  BullMQ Queue: notifications-email                                   │
│  (only for GAME_RESULT and FRIEND_REQUEST types)                     │
│       │                                                              │
│       ▼                                                              │
│  NotificationsEmailProcessor                                         │
│  rateLimiter: 3 emails/hour/user                                     │
│       │                                                              │
│       ▼                                                              │
│  SendGrid API → User's email inbox                                   │
│                                                                      │
│  ┌────────────────────┐                                              │
│  │  MongoDB           │                                              │
│  │  db: chessweb      │                                              │
│  │  collection:       │                                              │
│  │   notifications    │◄── NotificationsService reads/writes        │
│  │  TTL: 90 days      │                                             │
│  │  index: userId +   │                                              │
│  │   read + createdAt │                                              │
│  └────────────────────┘                                              │
└──────────────────────────────────────────────────────────────────────┘
```

## Data Flow

1. **Trigger**: Another service (GameService, SocialService, TournamentService) calls `NotificationsService.create()`.
2. **Persist**: The notification document is saved to MongoDB `notifications` collection.
3. **Real-time**: `NotificationsGateway.sendToUser()` emits `new_notification` to the Socket.io room `notifications:{userId}`. If the user is online, their browser receives the event instantly and the badge count increments.
4. **Email**: For `GAME_RESULT` and `FRIEND_REQUEST` types, a job is enqueued in BullMQ `notifications-email` queue. The `NotificationsEmailProcessor` dequeues it, applies a per-user rate limit (3/hour), renders an HTML template, and sends via SendGrid.
5. **REST Polling**: The frontend also polls `GET /notifications/unread-count` every 30 seconds as a fallback in case the socket is disconnected.

## DB Ownership

| Data | Store | Collection/Table |
|---|---|---|
| Notification documents | MongoDB | `notifications` |
| User identity | PostgreSQL | `users` (FK not enforced, only `userId` string stored) |
| BullMQ job queue | Redis | BullMQ key namespace `bull:notifications-email` |

## Backend File Tree

```
backend/src/notifications/
├── notifications.module.ts
├── notifications.controller.ts
├── notifications.service.ts
├── notifications.gateway.ts
├── notifications-email.processor.ts
├── schemas/
│   └── notification.schema.ts
└── templates/
    ├── game-result.html
    └── friend-request.html
```
