# Feature 10 — Increment 1: MongoDB Store + REST API

## Scope of Work

Implement the MongoDB notification schema, the `NotificationsService` (without socket or email — those come later), the REST controller, and the NestJS module. After this increment, notifications can be created programmatically and queried via HTTP.

## Files Created

- `backend/src/notifications/schemas/notification.schema.ts`
- `backend/src/notifications/notifications.service.ts`
- `backend/src/notifications/notifications.controller.ts`
- `backend/src/notifications/notifications.module.ts`

## Files Modified

- `backend/src/app.module.ts` — add `NotificationsModule` to imports

## Acceptance Criteria

1. `npm run build` compiles with no TypeScript errors.
2. `GET /notifications/unread-count` with a valid JWT returns `{ "count": 0 }` for a fresh user.
3. After manually inserting a notification document to MongoDB, the unread count returns `{ "count": 1 }`.
4. `GET /notifications?page=1&limit=20` returns an empty `data: []` for a fresh user.
5. `PATCH /notifications/read-all` returns `{ "updated": 0 }` for a fresh user.
6. All endpoints return `401` without a JWT.

## Complexity

**Medium** — Mongoose schema setup, compound index, TTL index, and 4 REST endpoints. No socket or email complexity yet.
