# Feature 10 — Increment 3: BullMQ Email Worker + SendGrid Templates

## Scope of Work

Add the asynchronous email sending pipeline. When `NotificationsService.create()` is called with `type === 'GAME_RESULT'` or `type === 'FRIEND_REQUEST'`, a BullMQ job is enqueued. The `NotificationsEmailProcessor` processes the job, renders an HTML template with the notification payload, and sends the email via SendGrid. A per-user rate limit of 3 emails/hour is enforced.

## Files Created

- `backend/src/notifications/notifications-email.processor.ts`
- `backend/src/notifications/templates/game-result.html`
- `backend/src/notifications/templates/friend-request.html`

## Files Modified

- `backend/src/notifications/notifications.service.ts` — inject BullMQ `notifications-email` queue, enqueue job in `create()` when type is GAME_RESULT or FRIEND_REQUEST
- `backend/src/notifications/notifications.module.ts` — add `BullModule.registerQueue({ name: 'notifications-email', limiter: { max: 3, duration: 3600000 } })`, register `NotificationsEmailProcessor`
- `backend/.env` — document `SENDGRID_API_KEY` and `SENDGRID_FROM_EMAIL` env var requirements (do not set values in code)

## Acceptance Criteria

1. Triggering a `GAME_RESULT` notification for a user with a real email address results in a SendGrid API call (confirmed via SendGrid Activity Feed in dashboard or by mocking sgMail in tests).
2. Triggering a `FRIEND_REQUEST` notification sends a friend-request email.
3. Triggering an `ACHIEVEMENT` notification does NOT enqueue an email job.
4. Sending 4 GAME_RESULT notifications for the same user within one minute: only 3 SendGrid calls are made; the 4th job is visible as `delayed` in Bull Board.
5. The game-result email HTML contains the opponent's username and rating change from the payload.
6. The friend-request email HTML contains the sender's username.

## Complexity

**Large** — BullMQ processor setup, rate limiter configuration, SendGrid integration, HTML template rendering, and env var management.
