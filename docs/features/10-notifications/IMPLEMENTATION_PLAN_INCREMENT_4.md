# Feature 10 — Increment 4: Frontend Bell, Dropdown, and Navbar Integration

## Scope of Work

Build the `NotificationBell` and `NotificationDropdown` React components and integrate them into the existing `Navbar.jsx`. The bell shows an unread count badge updated via socket push and 30-second polling. The dropdown lists the last 10 notifications, supports click-to-read-and-navigate, and has a "Mark all read" button.

## Files Created

- `frontend/src/components/NotificationBell.jsx`
- `frontend/src/components/NotificationDropdown.jsx`

## Files Modified

- `frontend/src/components/Navbar.jsx` — import and render `<NotificationBell />` in the right side of the nav

## Acceptance Criteria

1. Bell badge shows `0` (or no badge) for a user with no unread notifications.
2. When the backend calls `NotificationsService.create()` for the logged-in user, the badge increments within 1 second (socket) without a page reload.
3. Clicking the bell opens the dropdown showing the last 10 notifications.
4. Each notification item shows the title, body, relative time, and a visual distinction between read and unread.
5. Clicking a GAME_RESULT notification: calls `PATCH /notifications/:id/read`, navigates to `/history`, badge decrements.
6. Clicking a FRIEND_REQUEST notification: calls `PATCH /notifications/:id/read`, navigates to `/friends`, badge decrements.
7. Clicking "Mark all read" calls `PATCH /notifications/read-all`, all items appear read, badge resets to 0.
8. Badge shows `9+` when unread count is 10 or more.
9. Clicking outside the dropdown closes it.
10. If the socket connection is lost and restored, the badge count is reconciled from the next 30-second poll.

## Complexity

**Medium** — Socket.io client integration, polling interval management, state management for unread count + notification list, conditional routing based on notification type, and outside-click handling.
