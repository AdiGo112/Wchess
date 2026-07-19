# Feature 10 — Increment 2: Socket.io Gateway for Real-Time Push

## Scope of Work

Add `NotificationsGateway` — a Socket.io WebSocket gateway — so that when `NotificationsService.create()` is called, the notification is also pushed to the online user's browser in real time. The gateway handles room joining on connect using the JWT from the socket handshake.

## Files Created

- `backend/src/notifications/notifications.gateway.ts`

## Files Modified

- `backend/src/notifications/notifications.service.ts` — inject `NotificationsGateway` and call `gateway.sendToUser()` inside `create()`
- `backend/src/notifications/notifications.module.ts` — declare `NotificationsGateway` as a provider, import `JwtModule`

## Acceptance Criteria

1. Socket.io client connecting to `ws://localhost:3000/notifications` with `auth: { token: <validJwt> }` succeeds and joins the `notifications:{userId}` room (confirmed via NestJS server log or socket room check).
2. Calling `NotificationsService.create()` (via a test endpoint or directly in code) causes the connected socket client to receive a `new_notification` event within 500ms.
3. Socket clients connecting without a valid JWT are disconnected with an error event.
4. Two socket clients connected with different JWTs do NOT receive each other's notifications.

## Complexity

**Medium** — Socket.io gateway with JWT authentication on connect, room management, and injection into the service. No new data model changes.
