/**
 * A single player waiting in a matchmaking queue.
 * Stored as JSON in the Redis List `queue:{variant}:{timeControl}`.
 */
export interface QueueEntry {
  userId: string;
  username: string;
  rating: number;
  socketId: string;
  /** Epoch ms when the player joined the queue — drives tolerance relaxation. */
  enqueuedAt: number;
  /** Derived from timeControl: bullet | blitz | rapid | classical. */
  variant: string;
  /** Base clock per side, in seconds. */
  timeControl: number;
  /** Fischer increment per move, in seconds. */
  increment: number;
}
