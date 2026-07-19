# Feature 10 — Notifications

## Goal

Deliver a real-time, persistent notification system that keeps users informed of important chess app events — game results, friend requests, tournament starts, achievements, and rating milestones — both in-app via Socket.io and via email through SendGrid.

## User Story

As a ChessWeb user, I want to receive immediate notifications when a game ends, a friend sends me a request, a tournament I entered is starting, or I hit a rating milestone, so that I never miss important events even when I am not actively watching the relevant page.

## Depends On

- **Feature 01 — Auth**: User identity (`userId`) is required to address notifications. JWT middleware must be in place.
- **Feature 02 — Game Engine**: `GAME_RESULT` notifications are triggered when a game concludes via the game service.
- **Feature 09 — Social**: `FRIEND_REQUEST` notifications are triggered when a friend request is created.
- **Feature 07 — Tournaments**: `TOURNAMENT_START` notifications are triggered by the tournament scheduler.

## Output Artifacts

| Artifact | Location |
|---|---|
| Notification MongoDB schema | `backend/src/notifications/schemas/notification.schema.ts` |
| Notifications NestJS module | `backend/src/notifications/notifications.module.ts` |
| Notifications REST controller | `backend/src/notifications/notifications.controller.ts` |
| Notifications service | `backend/src/notifications/notifications.service.ts` |
| Socket.io gateway | `backend/src/notifications/notifications.gateway.ts` |
| BullMQ email processor | `backend/src/notifications/notifications-email.processor.ts` |
| HTML email templates | `backend/src/notifications/templates/game-result.html`, `friend-request.html` |
| Frontend bell component | `frontend/src/components/NotificationBell.jsx` |
| Frontend dropdown component | `frontend/src/components/NotificationDropdown.jsx` |
| Updated Navbar | `frontend/src/components/Navbar.jsx` |
