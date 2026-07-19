# Feature 10 — Increment 3 Implementation Prompt

Copy and paste this entire prompt into a fresh AI conversation.

---

You are implementing Increment 3 of the Notifications feature for ChessWeb. Increments 1 and 2 are complete. You are adding the BullMQ email worker and SendGrid HTML templates.

## Current Codebase State

These files exist and are working:
- `backend/src/notifications/schemas/notification.schema.ts`
- `backend/src/notifications/notifications.service.ts` — create() saves to MongoDB and calls gateway.sendToUser()
- `backend/src/notifications/notifications.gateway.ts` — pushes new_notification to socket room
- `backend/src/notifications/notifications.controller.ts`
- `backend/src/notifications/notifications.module.ts`

BullMQ is already used in the project for the Stockfish analysis queue. `BullModule.forRoot({ connection: { host: 'localhost', port: 6379 } })` is in `app.module.ts`. The `@nestjs/bullmq` and `bullmq` packages are installed.

## Environment Variables Required

In `backend/.env`, add:
```
SENDGRID_API_KEY=SG.xxxxxxxxxxxx
SENDGRID_FROM_EMAIL=noreply@chessweb.app
```

## What to Create

### File 1: `backend/src/notifications/notifications-email.processor.ts`

```typescript
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import * as sgMail from '@sendgrid/mail';
import * as fs from 'fs';
import * as path from 'path';

@Processor('notifications-email')
export class NotificationsEmailProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationsEmailProcessor.name);

  constructor() {
    super();
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);
  }

  async process(job: Job) {
    const { userId, type, email, payload } = job.data;
    this.logger.log(`Processing email job for userId=${userId} type=${type}`);

    let templateFile: string;
    let subject: string;

    if (type === 'GAME_RESULT') {
      templateFile = 'game-result.html';
      subject = `Game Over — ${payload.result === 'win' ? 'You Won!' : payload.result === 'loss' ? 'Better Luck Next Time' : 'It\'s a Draw'}`;
    } else if (type === 'FRIEND_REQUEST') {
      templateFile = 'friend-request.html';
      subject = `${payload.fromUsername} wants to be your friend on ChessWeb`;
    } else {
      return; // Should not happen — guarded in service
    }

    const templatePath = path.join(__dirname, 'templates', templateFile);
    let html = fs.readFileSync(templatePath, 'utf-8');

    // Replace all {{key}} placeholders with payload values
    html = html.replace(/\{\{(\w+)\}\}/g, (_, key) => String(payload[key] ?? ''));

    try {
      await sgMail.send({ to: email, from: process.env.SENDGRID_FROM_EMAIL, subject, html });
      this.logger.log(`Email sent to ${email} for type=${type}`);
    } catch (err) {
      this.logger.error(`SendGrid error for userId=${userId}: ${err.message}`);
      // Do not rethrow — avoid BullMQ marking as failed for 4xx errors (bad email address, etc.)
      // For 5xx (SendGrid outage), let BullMQ retry
      if (err.code >= 500) throw err;
    }
  }
}
```

### File 2: `backend/src/notifications/templates/game-result.html`

Create a clean HTML email. Use inline styles. Content:
- Header: "ChessWeb" in bold dark text
- Divider
- Body: "Game Over" as H2. Paragraph: "You {{result}} against {{opponent}} in a {{variant}} game." (where result is "won" if result=win, "lost" if result=loss, "drew" if result=draw)
- Rating line: "Rating change: {{ratingChange > 0 ? '+' : ''}}{{ratingChange}}" (the template just uses `{{ratingChange}}` — the +/- is pre-computed in the service when building the payload)
- Button: "View Game History" linking to `https://chessweb.app/history`
- Footer: "You received this email because you have notifications enabled on ChessWeb."

### File 3: `backend/src/notifications/templates/friend-request.html`

Content:
- Header: "ChessWeb"
- Body: "{{fromUsername}} wants to be your friend!" as H2. Paragraph: "Log in to accept or decline the friend request."
- Button: "View Friend Requests" linking to `https://chessweb.app/friends`
- Footer: small unsubscribe note

## What to Modify

### `backend/src/notifications/notifications.service.ts`

1. Inject `@InjectQueue('notifications-email') private emailQueue: Queue` from `bullmq`
2. In `create()`, after calling `gateway.sendToUser()`, add:
```typescript
if (type === NotificationType.GAME_RESULT || type === NotificationType.FRIEND_REQUEST) {
  await this.emailQueue.add(
    'send-notification-email',
    { userId, type, email: userEmail, payload },
    { 
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      rateLimiterKey: userId,  // BullMQ rate limit per user
    }
  );
}
```
Note: `userEmail` must be passed to `create()` or fetched. Update the `create()` signature to accept `userEmail?: string`. All callers in other services must pass the user's email.

### `backend/src/notifications/notifications.module.ts`

Add to imports:
```typescript
BullModule.registerQueue({
  name: 'notifications-email',
  limiter: { max: 3, duration: 3600000 },
})
```
Add `NotificationsEmailProcessor` to providers.

## Verification Steps

1. Set `SENDGRID_API_KEY` to a real key in `.env`
2. `npm run start:dev`
3. Trigger a GAME_RESULT notification via a test curl or by actually finishing a game
4. Check Bull Board (`http://localhost:3000/admin/queues`) — a job should appear in `notifications-email` queue and move to `completed`
5. Check SendGrid Activity Feed — the email should show as delivered
6. Trigger 4 notifications for the same user rapidly — only 3 SendGrid calls should appear; the 4th job should be in `delayed` state in Bull Board
