# Feature 12 — Frontend UI: Increment 6 Implementation Plan

## Scope

Mobile layout polish and accessibility hardening. This increment makes ChessWeb fully usable on mobile (touch board interaction, responsive navbar with hamburger menu) and accessible to keyboard and screen reader users (ARIA labels, focus management, keyboard shortcuts in analysis). This is the final increment before Feature 12 is considered complete.

## Files Created / Modified

| File | Action |
|---|---|
| `frontend/src/components/layout/NavBar.tsx` | Modify — add hamburger menu button + mobile drawer |
| `frontend/src/components/layout/MobileNavDrawer.tsx` | Create — slide-in nav drawer for mobile |
| `frontend/src/components/layout/NavOverlay.tsx` | Create — semi-transparent backdrop for mobile nav |
| `frontend/src/features/analysis/hooks/useAnalysisKeyboard.ts` | Create — arrow key navigation hook |
| `frontend/src/features/analysis/AnalysisPage.tsx` | Modify — integrate useAnalysisKeyboard |
| `frontend/src/features/game/components/ChessBoard.tsx` | Modify — verify touch interaction works on mobile |
| `frontend/src/components/ui/Modal.tsx` | Modify — ESC key closes modal, focus trap inside modal |
| `frontend/src/components/layout/Sidebar.tsx` | Modify — hide on mobile (md:block), show hamburger trigger |
| `frontend/src/router/index.tsx` | Modify — close mobile nav on route change |

## Mobile Hamburger Menu Requirements

- Hamburger button (`≡`) visible only on `md:hidden` (mobile/tablet)
- Desktop nav links hidden on mobile: `hidden md:flex`
- Mobile drawer slides in from the left with a CSS transition (250ms ease)
- Drawer contains the same nav links as the desktop sidebar
- Overlay backdrop closes the drawer on tap
- `document.body.style.overflow = 'hidden'` while drawer is open (prevents background scroll)
- Focus moves to first nav item when drawer opens (keyboard accessibility)
- Focus returns to hamburger button when drawer closes
- Route navigation auto-closes the drawer (via `useEffect` watching `location.pathname`)

## Keyboard Shortcuts (Analysis Page)

| Key | Action |
|---|---|
| `ArrowRight` | Next move |
| `ArrowLeft` | Previous move |
| `Home` | First move (starting position) |
| `End` | Last move (final position) |
| `Escape` | Close active modal / deselect piece |

Implementation: `useAnalysisKeyboard` hook attaches `keydown` listener to `window`. Must clean up on unmount. Must NOT fire when focus is inside a text input or textarea (check `event.target.tagName`).

## ARIA Requirements

| Component | ARIA additions |
|---|---|
| NavBar hamburger button | `aria-label="Open navigation menu"` / `"Close navigation menu"`, `aria-expanded` |
| Mobile nav drawer | `role="navigation"`, `aria-label="Mobile navigation"` |
| Chess board | `aria-label="Chess board"`, squares have `aria-label="{piece} on {square}"` |
| Piece move buttons | `aria-label="Move {piece} from {from} to {to}"` |
| Mute toggle | `aria-label="Mute sounds"` / `"Unmute sounds"`, `aria-pressed` |
| Theme swatches | `aria-label="{theme} theme"`, `aria-pressed` |
| Notification badge | `aria-label="{n} unread notifications"` |
| Modal | `role="dialog"`, `aria-modal="true"`, `aria-labelledby` pointing to modal title |
| Loading skeleton | `aria-busy="true"`, `aria-label="Loading..."` |

## Focus Trap in Modals

When a modal opens:
1. Focus moves to the first focusable element inside the modal
2. Tab key cycles through focusable elements within the modal (does not escape to background)
3. Shift+Tab cycles backwards
4. ESC closes the modal and returns focus to the trigger element

Use `react-focus-lock` or implement manually with a `useFocusTrap` hook.

## Acceptance Criteria

- [ ] On mobile (375px viewport), desktop nav links are hidden; hamburger button is visible
- [ ] Hamburger button opens the mobile drawer (slide from left)
- [ ] Tapping the overlay closes the drawer
- [ ] Navigating to a route closes the drawer
- [ ] Body scroll is locked while drawer is open
- [ ] Drawer opening moves focus to first nav item
- [ ] Drawer closing returns focus to hamburger button
- [ ] ArrowRight key advances analysis board position
- [ ] ArrowLeft key goes back in analysis
- [ ] Home/End keys work in analysis
- [ ] Keyboard shortcuts do NOT fire when typing in a text input
- [ ] ESC closes modals from the keyboard
- [ ] All interactive elements have visible focus rings (`focus:ring-2`)
- [ ] All buttons have accessible names (aria-label or visible text)
- [ ] Chess board has ARIA label
- [ ] Notification badge reads out count to screen readers
- [ ] Modal has `role="dialog"` and `aria-modal="true"`
- [ ] Focus trap works inside modals (Tab key stays inside)
- [ ] Lighthouse accessibility score ≥ 90 on GamePage and SettingsPage

## Dependencies

- All prior increments complete
- react-focus-lock or equivalent installed: `npm install react-focus-lock`
- react-chessboard touch support is enabled by default — no additional configuration needed

## Complexity

**L** — Mobile drawer requires careful focus management and CSS transitions. Keyboard shortcut hook is straightforward but requires edge case handling (text input focus exclusion, mount/unmount cleanup). ARIA labeling requires reviewing every interactive element across all pages.
