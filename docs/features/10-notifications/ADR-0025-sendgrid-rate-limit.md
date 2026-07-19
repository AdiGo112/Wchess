# ADR-0025: Cap Email Sends at 3 per Hour per User via BullMQ Rate Limiter

**Status:** Accepted
**Date:** 2026-06-24

## Context

ChessWeb sends transactional notification emails via SendGrid for GAME_RESULT and FRIEND_REQUEST events. A power user who plays many games per hour could trigger dozens of email sends in a short period. This creates two problems:

1. **User experience**: Receiving 20+ emails in an hour from a chess app is spammy. Users would mark the emails as spam or unsubscribe, reducing deliverability for all users.
2. **SendGrid account health**: High-volume sends from a single sender domain with poor engagement rates (low open rate because users are ignoring repetitive emails) can cause SendGrid to throttle or suspend the account, affecting all email delivery including password reset and verification emails.

BullMQ, which is already used for async job processing in the project (Stockfish analysis queue), provides a built-in `rateLimiter` option per queue. The rate limiter is keyed by a job property (`keyedBy: 'userId'`), allowing per-user rather than global limits.

## Decision

The `notifications-email` BullMQ queue is configured with `rateLimiter: { max: 3, duration: 3600000 }` (3 jobs per 3,600,000 milliseconds = 1 hour) keyed by `userId`. When `NotificationsService.create()` enqueues an email job, it sets `opts.rateLimiterKey = userId`. BullMQ automatically delays jobs that exceed this limit until the rate window resets.

The MongoDB notification document and the socket `new_notification` event are always delivered regardless of the rate limit. Only the email send is rate-limited.

## Consequences

**Positive:**
- Prevents spam: users receive at most 3 notification emails per hour regardless of how many games they play or friend requests they receive.
- Protects SendGrid account reputation from bulk low-engagement sends.
- Delayed jobs are not lost — they remain in the BullMQ queue and are processed once the rate window expires.
- The rate limit is per-user (not global), so prolific users do not affect email delivery for others.

**Negative:**
- A user who triggers exactly 3 emails and then receives an important friend request email within the same hour will not receive that email until the rate window expires. The in-app notification is still delivered.
- There is no user-visible indicator that their email was delayed. If a user wonders why they did not receive a game result email, there is no UI feedback in v1.
- The rate window is rolling based on when the first email job was processed, not a fixed clock hour. This can lead to slightly unintuitive behavior at window boundaries.

**Neutral:**
- The 3/hour limit is arbitrary and can be tuned via environment variable in a future increment without code changes if `duration` is read from config.
