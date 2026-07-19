# Feature 12 — Frontend UI: Implementation Prompt — Increment 6 (Mobile Layout + Accessibility)

Copy and paste this entire prompt into a fresh AI session.

---

## Task

Make ChessWeb fully usable on mobile and fully accessible. This includes a hamburger menu with slide-in drawer, keyboard shortcuts for analysis navigation, ARIA labels on all interactive elements, and focus management in modals.

## Prerequisites (already exist)

- `frontend/src/components/layout/NavBar.tsx` — existing desktop NavBar
- `frontend/src/features/analysis/AnalysisPage.tsx` — post-game analysis page
- `frontend/src/components/ui/Modal.tsx` — existing modal component
- `react-focus-lock` available: `npm install react-focus-lock`
- lucide-react available for icons: Menu, X, ChevronRight

## Create `frontend/src/components/layout/MobileNavDrawer.tsx`

```typescript
import React, { useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import FocusLock from 'react-focus-lock';
import { X, Swords, Trophy, PuzzleIcon, Users, BarChart2, Settings } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';

const NAV_LINKS = [
  { to: '/play',        label: 'Play',        Icon: Swords },
  { to: '/puzzles',     label: 'Puzzles',     Icon: PuzzleIcon },
  { to: '/tournaments', label: 'Tournaments', Icon: Trophy },
  { to: '/leaderboard', label: 'Leaderboard', Icon: BarChart2 },
  { to: '/social',      label: 'Friends',     Icon: Users },
  { to: '/settings',    label: 'Settings',    Icon: Settings },
];

interface MobileNavDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export function MobileNavDrawer({ isOpen, onClose }: MobileNavDrawerProps) {
  const location = useLocation();
  const user = useAuthStore((s) => s.user);

  // Close on route change
  useEffect(() => {
    onClose();
  }, [location.pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  // Lock body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  return (
    <>
      {/* Backdrop overlay */}
      <div
        data-testid="nav-overlay"
        className={`
          fixed inset-0 bg-black/60 z-40 transition-opacity duration-200
          ${isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}
        `}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer panel */}
      <FocusLock disabled={!isOpen} returnFocus>
        <nav
          data-testid="mobile-nav-drawer"
          role="navigation"
          aria-label="Mobile navigation"
          aria-hidden={!isOpen}
          className={`
            fixed top-0 left-0 bottom-0 w-72 bg-white dark:bg-chess-surface z-50
            transform transition-transform duration-250 ease-in-out shadow-2xl
            ${isOpen ? 'translate-x-0' : '-translate-x-full'}
          `}
        >
          {/* Drawer header */}
          <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
            <span className="text-lg font-bold text-gray-900 dark:text-white">ChessWeb</span>
            <button
              onClick={onClose}
              aria-label="Close navigation menu"
              className="p-2 rounded-md text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-chess-surface-2 transition-colors"
            >
              <X className="w-5 h-5" aria-hidden="true" />
            </button>
          </div>

          {/* User info (if logged in) */}
          {user && (
            <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-chess-accent flex items-center justify-center text-white text-sm font-bold">
                  {user.username[0].toUpperCase()}
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">{user.username}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Rating: {user.rating}</p>
                </div>
              </div>
            </div>
          )}

          {/* Nav links */}
          <ul className="py-2" role="list">
            {NAV_LINKS.map(({ to, label, Icon }) => {
              const isActive = location.pathname.startsWith(to);
              return (
                <li key={to}>
                  <Link
                    to={to}
                    className={`
                      flex items-center gap-3 px-4 py-3 text-sm font-medium transition-colors
                      ${isActive
                        ? 'text-chess-accent bg-chess-accent/10'
                        : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-chess-surface-2'
                      }
                    `}
                    aria-current={isActive ? 'page' : undefined}
                  >
                    <Icon className="w-5 h-5 flex-shrink-0" aria-hidden="true" />
                    {label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </FocusLock>
    </>
  );
}
```

## Modify `frontend/src/components/layout/NavBar.tsx`

Add hamburger menu button and wire MobileNavDrawer:

```typescript
import React, { useState } from 'react';
import { Menu } from 'lucide-react';
import { MobileNavDrawer } from './MobileNavDrawer';

export function NavBar() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <header className="bg-white dark:bg-chess-surface border-b border-gray-200 dark:border-gray-700 sticky top-0 z-30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">

          {/* Hamburger button — only on mobile */}
          <button
            data-testid="hamburger-button"
            onClick={() => setMobileNavOpen(true)}
            className="md:hidden p-2 rounded-md text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-chess-surface-2 transition-colors"
            aria-label="Open navigation menu"
            aria-expanded={mobileNavOpen}
            aria-controls="mobile-nav-drawer"
          >
            <Menu className="w-6 h-6" aria-hidden="true" />
          </button>

          {/* Logo */}
          <Link to="/" className="flex items-center gap-2">
            <span className="text-xl font-bold text-gray-900 dark:text-white">ChessWeb</span>
          </Link>

          {/* Desktop nav — hidden on mobile */}
          <nav className="hidden md:flex items-center gap-6" aria-label="Main navigation">
            {/* existing desktop nav links */}
          </nav>

          {/* Right side: notifications, user menu, dark mode toggle */}
          <div className="flex items-center gap-2">
            {/* existing right-side controls */}
          </div>
        </div>
      </div>

      {/* Mobile drawer */}
      <MobileNavDrawer
        isOpen={mobileNavOpen}
        onClose={() => setMobileNavOpen(false)}
      />
    </header>
  );
}
```

## Create `frontend/src/features/analysis/hooks/useAnalysisKeyboard.ts`

```typescript
import { useEffect, useCallback } from 'react';

interface UseAnalysisKeyboardProps {
  onNext: () => void;
  onPrev: () => void;
  onFirst: () => void;
  onLast: () => void;
  onEscape?: () => void;
  enabled?: boolean;
}

export function useAnalysisKeyboard({
  onNext,
  onPrev,
  onFirst,
  onLast,
  onEscape,
  enabled = true,
}: UseAnalysisKeyboardProps) {
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!enabled) return;

      // Do not fire when focus is inside a text input, textarea, or select
      const target = event.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable
      ) {
        return;
      }

      switch (event.key) {
        case 'ArrowRight':
          event.preventDefault();
          onNext();
          break;
        case 'ArrowLeft':
          event.preventDefault();
          onPrev();
          break;
        case 'Home':
          event.preventDefault();
          onFirst();
          break;
        case 'End':
          event.preventDefault();
          onLast();
          break;
        case 'Escape':
          onEscape?.();
          break;
      }
    },
    [enabled, onNext, onPrev, onFirst, onLast, onEscape]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}
```

## Modify `frontend/src/features/analysis/AnalysisPage.tsx`

```typescript
import { useState, useCallback } from 'react';
import { useAnalysisKeyboard } from './hooks/useAnalysisKeyboard';

export function AnalysisPage() {
  const { data: game } = useGame(gameId);
  const [currentMoveIndex, setCurrentMoveIndex] = useState(0);

  const moves = game?.moveHistory ?? [];
  const currentFen = moves[currentMoveIndex]?.fen ?? game?.fen ?? DEFAULT_FEN;

  const goToNext = useCallback(() => {
    setCurrentMoveIndex((i) => Math.min(i + 1, moves.length - 1));
  }, [moves.length]);

  const goToPrev = useCallback(() => {
    setCurrentMoveIndex((i) => Math.max(i - 1, 0));
  }, []);

  const goToFirst = useCallback(() => {
    setCurrentMoveIndex(0);
  }, []);

  const goToLast = useCallback(() => {
    setCurrentMoveIndex(Math.max(0, moves.length - 1));
  }, [moves.length]);

  // Keyboard navigation
  useAnalysisKeyboard({
    onNext: goToNext,
    onPrev: goToPrev,
    onFirst: goToFirst,
    onLast: goToLast,
  });

  return (
    <PageLayout>
      <div className="flex flex-col lg:flex-row gap-6">
        {/* Board */}
        <ChessBoard
          fen={currentFen}
          arePiecesDraggable={false}
          orientation={game?.myColor ?? 'white'}
        />

        {/* Move list with keyboard navigation hint */}
        <div className="flex-1">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-gray-900 dark:text-white">Moves</h2>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              Use ← → arrow keys to navigate
            </span>
          </div>

          {/* Navigation buttons (touch-friendly) */}
          <div className="flex gap-2 mb-4" role="group" aria-label="Board navigation">
            <button
              onClick={goToFirst}
              aria-label="Go to first move"
              className="px-3 py-2 text-sm bg-gray-100 dark:bg-chess-surface-2 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            >
              ⏮
            </button>
            <button
              onClick={goToPrev}
              aria-label="Previous move"
              className="px-3 py-2 text-sm bg-gray-100 dark:bg-chess-surface-2 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            >
              ◀
            </button>
            <button
              onClick={goToNext}
              aria-label="Next move"
              className="px-3 py-2 text-sm bg-gray-100 dark:bg-chess-surface-2 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            >
              ▶
            </button>
            <button
              onClick={goToLast}
              aria-label="Go to last move"
              className="px-3 py-2 text-sm bg-gray-100 dark:bg-chess-surface-2 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            >
              ⏭
            </button>
          </div>

          {/* Move list */}
          <ol className="space-y-1 text-sm font-mono">
            {moves.map((move, idx) => (
              <li
                key={idx}
                onClick={() => setCurrentMoveIndex(idx)}
                className={`
                  px-2 py-1 rounded cursor-pointer transition-colors
                  ${idx === currentMoveIndex
                    ? 'bg-chess-accent text-white'
                    : 'hover:bg-gray-100 dark:hover:bg-chess-surface-2 text-gray-700 dark:text-gray-300'
                  }
                `}
                aria-current={idx === currentMoveIndex ? 'step' : undefined}
              >
                {Math.floor(idx / 2) + 1}. {move.san}
              </li>
            ))}
          </ol>
        </div>
      </div>
    </PageLayout>
  );
}
```

## Update `frontend/src/components/ui/Modal.tsx` — Focus Trap + ESC Key

```typescript
import React, { useEffect, useRef } from 'react';
import FocusLock from 'react-focus-lock';
import { X } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  className?: string;
}

export function Modal({ isOpen, onClose, title, children, className = '' }: ModalProps) {
  const titleId = `modal-title-${Math.random().toString(36).slice(2)}`;

  // ESC key closes modal
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 dark:bg-black/70"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <FocusLock returnFocus>
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          className={`
            bg-white dark:bg-chess-surface rounded-xl shadow-2xl max-w-md w-full p-6
            ${className}
          `}
        >
          <div className="flex items-center justify-between mb-4">
            <h2 id={titleId} className="text-lg font-bold text-gray-900 dark:text-white">
              {title}
            </h2>
            <button
              onClick={onClose}
              aria-label="Close dialog"
              className="p-1 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
            >
              <X className="w-5 h-5" aria-hidden="true" />
            </button>
          </div>
          {children}
        </div>
      </FocusLock>
    </div>
  );
}
```

## ARIA Audit — Apply to All Interactive Elements

### Notification badge in NavBar:

```typescript
// Replace:
<span className="badge">{unreadCount}</span>
// With:
<span
  className="badge"
  aria-label={`${unreadCount} unread notification${unreadCount !== 1 ? 's' : ''}`}
  aria-live="polite"
>
  {unreadCount}
</span>
```

### Chess board wrapper:

```typescript
// Already handled in Increment 4 ChessBoard component:
<div data-testid="chess-board" data-fen={fen} aria-label="Chess board">
```

### Skeleton loaders:

```typescript
// Already handled in Increment 5:
<div aria-busy="true" aria-label="Loading..." />
```

### Dark mode toggle button:

```typescript
<button
  onClick={toggleDarkMode}
  aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
  aria-pressed={darkMode}
>
  {darkMode ? <Sun /> : <Moon />}
</button>
```

## Responsive Breakpoints Reference

ChessWeb uses Tailwind's default breakpoints:

| Breakpoint | Width | Usage |
|---|---|---|
| (default) | 0–767px | Mobile: hamburger nav, stacked layout |
| `md:` | 768px+ | Tablet/Desktop: sidebar nav, side-by-side layout |
| `lg:` | 1024px+ | Desktop: wider boards, more whitespace |
| `xl:` | 1280px+ | Large desktop: max content width |

Key responsive patterns:
```typescript
// NavBar: hide desktop nav on mobile
<nav className="hidden md:flex ...">

// Hamburger: show only on mobile
<button className="md:hidden ...">

// Board + sidebar layout
<div className="flex flex-col lg:flex-row gap-6">

// Board size
<ChessBoard boardWidth={windowWidth < 768 ? windowWidth - 32 : 560} />
```

## Verification Steps

1. Open on iPhone 13 viewport (375px) — hamburger button visible, desktop nav hidden
2. Tap hamburger — drawer slides in from left
3. Tap overlay — drawer closes
4. Tab key when drawer is open — focus stays inside drawer (focus trap)
5. Press ESC — drawer closes, focus returns to hamburger button
6. Navigate to a route from drawer — drawer auto-closes
7. On `/analysis/:id`, press ArrowRight — board advances to next move
8. Press ArrowLeft — board goes back
9. Press Home — board goes to starting position
10. Press End — board goes to final position
11. Focus a text input, then press ArrowRight — does NOT advance the board
12. Press ESC while a modal is open — modal closes
13. Tab inside a modal — focus stays inside (does not reach background)
14. All buttons on the page have visible focus rings when tabbed to
15. Run `axe` or Lighthouse accessibility audit — score ≥ 90
