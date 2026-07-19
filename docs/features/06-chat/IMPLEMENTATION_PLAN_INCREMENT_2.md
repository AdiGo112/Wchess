# 06-Chat — Implementation Plan: Increment 2

## Scope
Backend safeguards: typing_start/stop events, 1 msg/sec Redis rate limit, bad-words profanity filter.

## Prerequisites
Increment 1 complete: send_message and get_history working.

## What gets built
- Rate limiting in ChatService.sendMessage() via Redis INCR + EXPIRE
- Profanity filter via bad-words npm package
- typing_start / typing_stop handlers in ChatGateway
- Auto-timeout for typing indicator (5s server-side timer)

## Exact files modified
- `backend/src/chat/chat.service.ts` (add checkRateLimit, update sendMessage to call it; add cleanContent)
- `backend/src/chat/chat.gateway.ts` (add handleTypingStart, handleTypingStop, typingTimers Map)

New dependency:
- `npm install bad-words` (profanity filter)

## Acceptance criteria
- [ ] Two messages within 1 second → second returns RATE_LIMIT_EXCEEDED error
- [ ] Message with profane content: stored and broadcast with word replaced by *** 
- [ ] typing_start → opponent receives typing_indicator { isTyping: true }
- [ ] typing_stop → opponent receives typing_indicator { isTyping: false }
- [ ] If typing_stop never sent (simulated by not calling it): after 5s, isTyping false broadcast automatically

## Estimated complexity
S (Small) — ~2 hours
