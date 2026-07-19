# Feature 10 — Increment 4 Implementation Prompt

Copy and paste this entire prompt into a fresh AI conversation.

---

You are implementing Increment 4 of the Notifications feature for ChessWeb. The full backend (Increments 1-3) is complete and working. You are now building the frontend React components: the notification bell, the dropdown, and updating the Navbar.

## Current Codebase State

Backend is complete:
- `GET /notifications?page=1&limit=20` returns `{ data: NotificationDto[], total, page, limit }`
- `GET /notifications/unread-count` returns `{ count: number }`
- `PATCH /notifications/:id/read` marks a notification read, returns the updated document
- `PATCH /notifications/read-all` returns `{ updated: number }`
- Socket.io namespace `/notifications` — client connects with `auth: { token }`, receives `new_notification` events

Frontend state:
- React 18, JavaScript (JSX), Vite
- `frontend/src/components/Navbar.jsx` exists and renders logo, nav links, user dropdown/logout
- `frontend/src/api/axios.js` (or `.ts`) exports an axios instance with base URL and auth interceptor
- `socket.io-client` is installed

## What to Create

### File 1: `frontend/src/components/NotificationBell.jsx`

Full implementation:

```jsx
import { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import api from '../api/axios';
import NotificationDropdown from './NotificationDropdown';
import { useNavigate } from 'react-router-dom';

export default function NotificationBell() {
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState([]);
  const [open, setOpen] = useState(false);
  const socketRef = useRef(null);
  const pollRef = useRef(null);
  const navigate = useNavigate();

  const getToken = () => localStorage.getItem('chessweb_token');

  useEffect(() => {
    // Initial fetch
    fetchUnreadCount();
    fetchNotifications();

    // Socket connection
    const socket = io('http://localhost:3000/notifications', {
      auth: { token: getToken() },
      transports: ['websocket'],
    });
    socketRef.current = socket;

    socket.on('new_notification', (notification) => {
      setUnreadCount((c) => c + 1);
      setNotifications((prev) => [notification, ...prev].slice(0, 10));
    });

    // Poll every 30 seconds as fallback
    pollRef.current = setInterval(fetchUnreadCount, 30000);

    return () => {
      socket.disconnect();
      clearInterval(pollRef.current);
    };
  }, []);

  const fetchUnreadCount = async () => {
    try {
      const res = await api.get('/notifications/unread-count');
      setUnreadCount(res.data.count);
    } catch {}
  };

  const fetchNotifications = async () => {
    try {
      const res = await api.get('/notifications?page=1&limit=10');
      setNotifications(res.data.data);
    } catch {}
  };

  const handleNotificationClick = async (notification) => {
    try {
      await api.patch(`/notifications/${notification.id}/read`);
    } catch {}
    setNotifications((prev) =>
      prev.map((n) => (n.id === notification.id ? { ...n, read: true } : n))
    );
    setUnreadCount((c) => Math.max(0, c - (notification.read ? 0 : 1)));
    setOpen(false);
    // Navigate based on type
    const routes = {
      GAME_RESULT: '/history',
      FRIEND_REQUEST: '/friends',
      TOURNAMENT_START: `/tournaments/${notification.payload?.tournamentId}`,
      ACHIEVEMENT: `/profile/${notification.payload?.username}`,
      RATING_MILESTONE: `/profile/${notification.payload?.username}`,
    };
    navigate(routes[notification.type] || '/');
  };

  const handleMarkAllRead = async () => {
    await api.patch('/notifications/read-all');
    setUnreadCount(0);
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={`Notifications, ${unreadCount} unread`}
        style={{ background: 'none', border: 'none', cursor: 'pointer', position: 'relative', padding: 8, borderRadius: '50%' }}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
          <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
        </svg>
        {unreadCount > 0 && (
          <span style={{
            position: 'absolute', top: 2, right: 2,
            background: '#e53e3e', color: 'white',
            fontSize: 10, fontWeight: 'bold',
            minWidth: 18, height: 18, borderRadius: 9,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '0 4px',
          }}>
            {unreadCount >= 10 ? '9+' : unreadCount}
          </span>
        )}
      </button>
      {open && (
        <NotificationDropdown
          notifications={notifications}
          onMarkAllRead={handleMarkAllRead}
          onNotificationClick={handleNotificationClick}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}
```

### File 2: `frontend/src/components/NotificationDropdown.jsx`

Implement a dropdown that:
1. Renders in a `div` positioned absolute, right: 0, top: 44px, width: 360px, max-height: 480px, overflow-y: auto, background white, box-shadow, border-radius 8px, z-index 1000
2. Has a header row: "Notifications" (bold) left side, "Mark all read" button (text-only, blue) right side
3. Maps over `notifications` array. Each item:
   - Border-left: 3px solid #3b82f6 if !read, else transparent
   - Background: #eff6ff if !read, else white
   - Icon based on type: GAME_RESULT='♟', FRIEND_REQUEST='👥', TOURNAMENT_START='🏆', ACHIEVEMENT='🏅', RATING_MILESTONE='📈'
   - Title in bold (14px)
   - Body in gray (12px)
   - Relative time at bottom-right using a helper: `function relativeTime(dateStr) { const diff = Date.now() - new Date(dateStr); if (diff < 60000) return 'just now'; if (diff < 3600000) return Math.floor(diff/60000) + 'm ago'; if (diff < 86400000) return Math.floor(diff/3600000) + 'h ago'; return Math.floor(diff/86400000) + 'd ago'; }`
   - cursor: pointer, onClick calls `onNotificationClick(notification)`
4. Empty state: centered gray text "No notifications yet" when `notifications.length === 0`
5. `useEffect` to close on outside click:
```jsx
useEffect(() => {
  const handler = (e) => { if (!e.target.closest('.notification-dropdown')) onClose(); };
  document.addEventListener('mousedown', handler);
  return () => document.removeEventListener('mousedown', handler);
}, [onClose]);
```
Add `className="notification-dropdown"` to the root div.

### File 3: Update `frontend/src/components/Navbar.jsx`

Import `NotificationBell` and add it to the right side of the navbar, before the user avatar button. Example:
```jsx
import NotificationBell from './NotificationBell';
// In JSX, inside the nav right section:
<NotificationBell />
<UserAvatarDropdown /> {/* existing component */}
```

## Verification Steps

1. `npm run dev` — no console errors
2. Log in. Bell icon appears in navbar with no badge.
3. In MongoDB, insert a notification manually: `db.notifications.insertOne({ userId: '<your-postgres-user-id>', type: 'FRIEND_REQUEST', title: 'Test FR', body: 'UserA wants to be your friend', read: false, payload: { fromUsername: 'UserA' }, createdAt: new Date() })`
4. Wait up to 30 seconds — badge should show `1` (from polling)
5. Open socket connection manually in browser console: `const s = io('http://localhost:3000/notifications', { auth: { token: localStorage.getItem('chessweb_token') } }); s.on('new_notification', console.log)` — insert another document via backend and badge should jump immediately
6. Click bell — dropdown shows both notifications
7. Click the FRIEND_REQUEST notification — navigates to /friends, badge drops
8. Click "Mark all read" — all items appear read, badge = 0
