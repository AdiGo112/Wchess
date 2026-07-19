# Feature 10 — Notifications: Frontend Implementation Prompt

Copy and paste the following prompt into a fresh AI conversation to implement the full frontend for Feature 10.

---

You are implementing the Notifications frontend for ChessWeb, a React + Vite chess web application.

## Stack

- React 18, JavaScript (JSX)
- Socket.io-client (`socket.io-client`)
- axios for REST calls
- React Router v6 (`useNavigate`)
- The app already has a `Navbar.jsx` at `frontend/src/components/Navbar.jsx` that renders the nav links and user avatar. You will add the notification bell to it.
- Auth token is stored in `localStorage` as key `chessweb_token` (or from a Zustand `auth.store.ts` if it exists — check both and use whichever is available)

## What Already Exists

- `frontend/src/components/Navbar.jsx` — renders logo, nav links, user avatar/logout
- `frontend/src/api/axios.ts` (or `.js`) — axios instance with `baseURL` set to `http://localhost:3000` and Authorization header interceptor

## Task: Create the Notification Bell UI

### File 1: `frontend/src/components/NotificationBell.jsx`

A React component that:
1. On mount, opens a socket connection to `http://localhost:3000/notifications` namespace with `auth: { token: getToken() }` where `getToken()` reads from localStorage/Zustand
2. On socket `connect`, no extra action needed (gateway handles room join server-side)
3. Listens for `new_notification` socket event — on receipt, increments `unreadCount` by 1 and prepends the notification to a local `notifications` array (capped at 10)
4. Polls `GET /notifications/unread-count` via axios every 30 seconds as a fallback; stores count in state
5. On unmount, disconnects the socket and clears the interval
6. Renders a `<button>` with a bell SVG icon (Unicode 🔔 or a simple SVG) and a red badge `<span>` showing `unreadCount` when > 0. Show `9+` when count >= 10.
7. On click, toggles the `NotificationDropdown` open/closed

State: `unreadCount: number`, `notifications: NotificationDto[]`, `dropdownOpen: boolean`

### File 2: `frontend/src/components/NotificationDropdown.jsx`

A React component that receives props: `notifications: array`, `onMarkAllRead: function`, `onNotificationClick: function(notification)`, `onClose: function`.

Renders:
- A fixed-positioned (or absolute) dropdown card below the bell button
- Header: "Notifications" title + "Mark all read" button (calls `onMarkAllRead`)
- List of up to 10 notifications, each showing:
  - An icon based on `type` (emoji or SVG): GAME_RESULT=♟, FRIEND_REQUEST=👥, TOURNAMENT_START=🏆, ACHIEVEMENT=🏅, RATING_MILESTONE=📈
  - `title` in bold
  - `body` in smaller text
  - Relative time (e.g., "2 minutes ago") — use a simple helper function, no external library
  - Unread notifications have a blue left border or highlighted background
- Clicking a notification: calls `onNotificationClick(notification)` which marks it read via `PATCH /notifications/:id/read` and navigates to the correct route:
  - GAME_RESULT → `/history`
  - FRIEND_REQUEST → `/friends`
  - TOURNAMENT_START → `/tournaments/{{payload.tournamentId}}`
  - ACHIEVEMENT → `/profile/{{username}}`
  - RATING_MILESTONE → `/profile/{{username}}`
- "No notifications yet" empty state when list is empty
- Clicking outside the dropdown closes it (use a `useEffect` with `document.addEventListener('mousedown', ...)`)

### File 3: Update `frontend/src/components/Navbar.jsx`

Import `NotificationBell` and `NotificationDropdown`. Add `<NotificationBell />` to the right side of the navbar, before the user avatar. The dropdown is rendered inside `NotificationBell` using a portal or absolute positioning.

Pass `onMarkAllRead` which calls `PATCH /notifications/read-all` and sets `unreadCount` to 0.
Pass `onNotificationClick` which calls `PATCH /notifications/:id/read`, updates the local notification to `read: true`, decrements `unreadCount`, and navigates.

## Style Guidelines

- Bell button: no background, border-radius 50%, padding 8px, hover shows light gray background
- Badge: position absolute top-0 right-0, background red (#e53e3e), color white, font-size 10px, min-width 18px, height 18px, border-radius 9px, text-align center, line-height 18px
- Dropdown: width 360px, max-height 480px, overflow-y auto, background white (dark mode: #1a1a2e), box-shadow 0 4px 20px rgba(0,0,0,0.15), border-radius 8px, z-index 1000
- Unread notification item: border-left 3px solid #3b82f6, background #eff6ff (dark: #1e3a5f)
- Read notification item: border-left 3px solid transparent, background white (dark: #0f0f1a)

## Verification Steps

1. Log in as user A. Log in as user B in another browser tab.
2. As user A, send a friend request to user B via `POST /social/friend-requests`.
3. In user B's tab, the bell badge should show `1` within 1 second (socket) or 30 seconds (poll).
4. Click the bell — dropdown shows the friend request notification.
5. Click the notification — navigates to `/friends`, badge drops to 0.
6. As user B, trigger "Mark all read" — badge resets to 0.
