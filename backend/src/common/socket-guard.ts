/**
 * Per-socket checks that run before any gateway handler (ship-plan 0.7, 0.8).
 * ThrottlerGuard and ValidationPipe only cover HTTP, so without this a client could
 * flood `move`/`offer_draw` or send any shape it likes.
 */

/** A human plays at most a few events a second; 20 leaves room for premoves and reconnect bursts. */
export const SOCKET_EVENTS_PER_SEC = 20;

const ROOM_ID = /^[A-Z0-9]{6}$/; // games.service createRoom: nanoid, 6 chars of [A-Z0-9]
const SQUARE = /^[a-h][1-8]$/;
const PROMOTION = /^[qrbn]$/;

/** Fixed-window counter: true while the caller is within `limit` events per `windowMs`. */
export function createRateLimiter(limit: number, windowMs: number, now: () => number = Date.now) {
  let windowStart = -Infinity;
  let count = 0;
  return () => {
    const t = now();
    if (t - windowStart >= windowMs) {
      windowStart = t;
      count = 0;
    }
    return ++count <= limit;
  };
}

/** Why a socket payload is malformed, or null if it's fine to hand to a handler. */
export function payloadProblem(event: string, data: unknown): string | null {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return 'payload is not an object';
  const d = data as Record<string, unknown>;
  if ('roomId' in d && !(typeof d.roomId === 'string' && ROOM_ID.test(d.roomId))) return 'bad roomId';
  if (event === 'move' || event === 'computer_move') {
    if (typeof d.from !== 'string' || !SQUARE.test(d.from)) return 'bad from square';
    if (typeof d.to !== 'string' || !SQUARE.test(d.to)) return 'bad to square';
    if (d.promotion !== undefined && !(typeof d.promotion === 'string' && PROMOTION.test(d.promotion))) {
      return 'bad promotion';
    }
  }
  return null;
}
