# 06-Chat — Implementation Plan: Increment 3

## Scope
Frontend: ChatPanel component in game view, message list with sender styling, text input, send button, typing indicator animation.

## Prerequisites
Backend increments 1 and 2 complete (all chat events and REST endpoint working).

## What gets built
- useChatSocket hook (connects to /chat namespace, manages messages/typing state)
- ChatPanel component (full chat UI: message list, input, typing indicator, error banner)
- Integration into GamePage (chat sidebar)

## Exact files created/modified

Created:
- `frontend/src/hooks/useChatSocket.ts`
- `frontend/src/components/ChatPanel.tsx`

Modified:
- `frontend/src/pages/GamePage.tsx` (add ChatPanel as sidebar, adjust layout)

## Acceptance criteria
- [ ] ChatPanel loads 50 most recent messages from GET /chat/:gameId/history on mount
- [ ] Typing in input and pressing Enter emits send_message and clears input
- [ ] Shift+Enter adds newline without sending
- [ ] message_received event appends new message and auto-scrolls to bottom
- [ ] Own messages show on the right (blue); opponent messages on the left (gray)
- [ ] "Opponent is typing..." text appears when typing_indicator { isTyping: true } received
- [ ] Error messages (RATE_LIMIT_EXCEEDED, etc.) shown in red banner that disappears after 3s
- [ ] Chat panel is responsive: hidden on mobile, visible on desktop (game layout adjustment)

## Estimated complexity
M (Medium) — ~3-4 hours
