# Feature 10 — Notifications: Workflows

## Workflow 1 — Game Result Notification

1. A chess game concludes in `GameService.endGame()`. The final state includes `winnerId`, `loserId` (or `drawPlayerIds`), `gameId`, `variant`, and rating deltas.
2. `GameService` calls `NotificationsService.create()` for the winner with `type: 'GAME_RESULT'`, `title: 'Game Over — You Won!'`, `body: 'You defeated <opponent> in a Blitz game. +12 rating.'`, and `payload: { gameId, opponent, result: 'win', variant: 'blitz', ratingChange: 12 }`.
3. The same call is made for the loser with `result: 'loss'` and a negative `ratingChange`.
4. `NotificationsService.create()` saves the document to MongoDB.
5. `NotificationsGateway.sendToUser(userId, notification)` emits `new_notification` to the socket room `notifications:{userId}`.
6. If the user is online, their `NotificationBell` component receives the socket event, increments the `unreadCount` in local state, and animates the badge.
7. Simultaneously, `NotificationsService` enqueues a BullMQ job `{ userId, type: 'GAME_RESULT', email: userEmail, payload }` to the `notifications-email` queue.
8. `NotificationsEmailProcessor` dequeues the job. It checks the per-user rate limiter (BullMQ `rateLimiter: { max: 3, duration: 3600000 }`). If under limit, it renders `templates/game-result.html` with the payload and sends via SendGrid. If over limit, the job is delayed until the rate window resets.

## Workflow 2 — Friend Request Notification

1. User A submits `POST /social/friend-requests` with `{ toUserId: userBId }` (Feature 09).
2. `SocialService` saves the friend request to PostgreSQL and then calls `NotificationsService.create()` for user B with `type: 'FRIEND_REQUEST'`, `title: '<UserA> wants to be your friend'`, `body: 'Accept or decline the friend request from <UserA>.'`, and `payload: { requestId, fromUserId: userAId, fromUsername: 'UserA', fromAvatarUrl: '...' }`.
3. `NotificationsService` saves to MongoDB and calls `NotificationsGateway.sendToUser(userBId, notification)`.
4. User B's browser receives the `new_notification` socket event. The bell badge increments to 1.
5. User B clicks the bell. `NotificationDropdown` opens and fetches `GET /notifications?limit=10`. The friend request notification is displayed with the sender's avatar and username.
6. User B clicks the notification. The client calls `PATCH /notifications/:id/read` and navigates to `/friends` (because `payload.requestId` maps to that route). The unread badge decrements.
7. An email job is also enqueued. User B receives an email with a link to accept/decline the friend request on ChessWeb.

## Workflow 3 — Polling Fallback and "Mark All Read"

1. On mount, `NotificationBell` opens a socket connection and also starts a `setInterval` that polls `GET /notifications/unread-count` every 30 seconds.
2. If the socket is disconnected (e.g., the user's network drops briefly), the polling interval ensures the count stays accurate within 30 seconds.
3. The user opens the dropdown and clicks "Mark all read". The client sends `PATCH /notifications/read-all`.
4. `NotificationsService` executes `Notification.updateMany({ userId, read: false }, { $set: { read: true } })` and returns `{ updated: N }`.
5. The frontend sets the badge count to 0 and marks all rendered notifications as read in local state. On the next poll or socket event, the count is reconciled from the server.
