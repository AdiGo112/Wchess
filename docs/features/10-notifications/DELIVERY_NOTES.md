# Feature 10 — Notifications: Delivery Notes

## "Done" Definition

The feature is done when:
- All four increments pass their acceptance criteria.
- A user online in one browser tab receives a `new_notification` socket event within 500ms of another user triggering the relevant action (friend request or game end).
- The unread count badge updates without a page reload.
- The email queue is visible in the BullMQ dashboard (Bull Board) and jobs progress from `waiting` → `active` → `completed` for GAME_RESULT and FRIEND_REQUEST events.
- SendGrid activity log shows the email delivered (or bounced with a reason) for the test user.
- MongoDB TTL index is confirmed via `db.notifications.getIndexes()` showing `expireAfterSeconds: 0` on the `createdAt` field.

## Acceptance Criteria

1. `GET /notifications/unread-count` returns the correct integer for a user with 3 unread and 2 read notifications.
2. `PATCH /notifications/:id/read` returns 403 when called by a different logged-in user.
3. `PATCH /notifications/read-all` sets all `read` fields to `true` and returns `{ updated: N }` matching the previously unread count.
4. Socket room `notifications:{userId}` receives `new_notification` event immediately after `NotificationsService.create()` is called server-side.
5. After 3 emails are sent within one hour for a user, a 4th `GAME_RESULT` notification creates a MongoDB document and delivers a socket event but does NOT trigger a SendGrid API call within the same hour window.
6. `GET /notifications` respects `?page=2&limit=20` and returns the correct slice.
7. The bell badge shows `9+` when unread count is 10 or more (not the raw number).
8. Clicking a notification navigates to the correct route based on `type`:
   - `GAME_RESULT` → `/history`
   - `FRIEND_REQUEST` → `/friends`
   - `TOURNAMENT_START` → `/tournaments/:tournamentId`
   - `ACHIEVEMENT` / `RATING_MILESTONE` → `/profile/:username`

## Explicitly Out of Scope in v1

- Push notifications (Web Push API / service workers) — in-app and email only.
- Notification preferences UI (users cannot opt out of specific notification types in v1).
- `TOURNAMENT_START`, `ACHIEVEMENT`, and `RATING_MILESTONE` email templates — only in-app for these types.
- Pagination in the bell dropdown — shows last 10 only.
- Read receipts or delivery confirmations fed back to the triggering service.

## Known Edge Cases

- **User offline when notification arrives**: The socket event goes to an empty room. The notification is still in MongoDB. When the user next loads the app, the 30-second poll picks it up, or `GET /notifications` on dropdown open returns it.
- **Rate limit window timing**: BullMQ's rate limiter uses a rolling 1-hour window keyed by userId. If a user triggers exactly 3 emails at 11:59 PM, the 4th attempt at 12:01 AM will still be blocked until 12:59 AM (the first email's window expires). This is acceptable behavior documented in ADR-0025.
- **SendGrid temporary failure**: BullMQ retries failed jobs 3 times with exponential backoff (5s, 30s, 5m). If all retries fail, the job moves to the `failed` queue. The notification was already delivered in-app; only the email is lost.
- **Duplicate notifications**: If `NotificationsService.create()` is called twice for the same event (due to a retry in the calling service), two notifications will be stored. No deduplication logic exists in v1. Callers must ensure idempotency.
