# Feature 10 — Notifications: Domain Model

## MongoDB Schema

```typescript
// backend/src/notifications/schemas/notification.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type NotificationDocument = Notification & Document;

export enum NotificationType {
  GAME_RESULT       = 'GAME_RESULT',
  FRIEND_REQUEST    = 'FRIEND_REQUEST',
  TOURNAMENT_START  = 'TOURNAMENT_START',
  ACHIEVEMENT       = 'ACHIEVEMENT',
  RATING_MILESTONE  = 'RATING_MILESTONE',
}

@Schema({ timestamps: true })
export class Notification {
  @Prop({ required: true, index: true })
  userId: string;           // PostgreSQL user UUID — not a Mongo FK

  @Prop({ required: true, enum: NotificationType })
  type: NotificationType;

  @Prop({ required: true })
  title: string;            // Short heading shown in bell dropdown

  @Prop({ required: true })
  body: string;             // Human-readable sentence

  @Prop({ default: false, index: true })
  read: boolean;

  @Prop({ type: Object, default: {} })
  payload: Record<string, unknown>;  // Type-specific metadata (see API_DESIGN.md)

  @Prop({ type: Date, expires: '90d', default: Date.now })
  createdAt: Date;          // TTL index: document deleted after 90 days
}

export const NotificationSchema = SchemaFactory.createForClass(Notification);

// Compound index for fast per-user unread queries
NotificationSchema.index({ userId: 1, read: 1, createdAt: -1 });
```

## Business Rules and Invariants

- A notification **must** have a `userId` that corresponds to a valid PostgreSQL user. This is not enforced at the DB layer (no FK to Postgres), so the service layer must validate that the user exists before calling `create()`.
- The `type` field **must** be one of the five `NotificationType` enum values. The schema enforces this at the Mongoose level.
- `title` and `body` are **required** strings. They must be pre-rendered human-readable text, not raw keys. The `NotificationsService.create()` method is responsible for building them from the payload.
- `payload` is a free-form object. Its shape depends on `type`. See `API_DESIGN.md` for the expected interface per type. Consumers must not assume fields beyond what is documented.
- `read` defaults to `false`. Once set to `true` by `PATCH /notifications/:id/read` or `PATCH /notifications/read-all`, it **cannot** be set back to `false` by any client-facing API.
- Documents are **automatically deleted** by MongoDB's TTL index after 90 days. No explicit delete endpoint exists in v1.
- Only notifications with `type === 'GAME_RESULT'` or `type === 'FRIEND_REQUEST'` trigger an email. `TOURNAMENT_START`, `ACHIEVEMENT`, and `RATING_MILESTONE` are in-app only in v1.
- Email sends are **rate-limited** to 3 per user per rolling hour via BullMQ. Notifications beyond this limit are still created in MongoDB and delivered via socket; only the email is dropped.
- The `GET /notifications` endpoint returns at most 20 documents per page. The default page is 1. Results are sorted by `createdAt` descending (newest first).
- `GET /notifications/unread-count` returns the count of all documents for the user where `read === false`. This is fast because of the compound index.
- `PATCH /notifications/:id/read` returns 403 if the requesting user's JWT `sub` does not match the notification's `userId`.
