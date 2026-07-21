/**
 * Shared contract types — transcribed from docs/architecture/websocket-events.md
 * and api-reference.md so payload mismatches with the NestJS gateway become
 * compile errors instead of runtime surprises.
 */

// ── Auth / users ────────────────────────────────────────────────────────────

export interface User {
  id: string;
  username: string;
  name: string;
  email?: string;
  role?: string;
  avatarUrl?: string | null;
  createdAt?: string;
  // Profile page extras (optional — /auth/me doesn't always include them)
  rating?: number;
  wins?: number;
  losses?: number;
  recentGames?: { opponent: string; result: string; date: string }[];
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: User;
}

/** Machine-readable error envelope every API error carries. */
export interface ApiError {
  code?: string;
  message?: string | string[];
}

// ── Game domain ─────────────────────────────────────────────────────────────

export type Color = 'white' | 'black';

export interface Timers {
  white: number; // ms remaining
  black: number;
}

export interface RoomPlayer {
  id: string; // 'computer' for the engine (ADR-0009)
  username: string;
  rating: number;
}

export interface MoveDto {
  from: string;
  to: string;
  san: string;
  fen: string;
  moveIndex: number;
}

// ── Socket events: server → client ──────────────────────────────────────────

export interface GameStartPayload {
  roomId: string;
  white: RoomPlayer;
  black: RoomPlayer | null;
  fen: string;
  timeControl: number;
  increment: number;
  timers: Timers;
  /** 1-5, present only for vs-computer rooms */
  difficulty?: number;
}

export interface GameStatePayload extends Omit<GameStartPayload, 'timeControl' | 'increment'> {
  moves: string[];
  drawOfferedBy: Color | null;
}

export interface MoveMadePayload {
  roomId: string;
  move: MoveDto;
  fen: string;
  timers: Timers;
  check: boolean;
  drawOfferedBy: null;
}

export interface RatingChangeSide {
  change: number;
  newRating: number;
}

export interface GameOverPayload {
  roomId: string;
  result: 'white' | 'black' | 'draw' | 'aborted';
  reason: string;
  ratingChange: { white: RatingChangeSide; black: RatingChangeSide } | null;
}

/** ADR-0004: authoritative clock correction, pushed every 1s by the sweeper. */
export interface ClockSyncPayload {
  roomId: string;
  timers: Timers;
  serverTime: number;
}

export interface MatchFoundPayload {
  roomId: string;
  color: Color;
  timeControl: number;
  opponent: RoomPlayer;
}

/** Sent to a challenge creator when their link is accepted. */
export interface ChallengeAcceptedPayload {
  roomId: string;
  color: Color;
  timeControl: number;
}

export interface QueuePositionPayload {
  position: number;
  estimatedWait: number;
}

// ── REST responses ──────────────────────────────────────────────────────────

export interface GameRecord {
  id: string;
  whiteId: string | null;
  blackId: string | null;
  whiteUsername: string;
  blackUsername: string;
  whiteRatingDiff: number;
  blackRatingDiff: number;
  result: 'WHITE' | 'BLACK' | 'DRAW' | 'ABORTED';
  reason: string;
  variant: string;
  moves: string[];
  createdAt: string;
}

export interface LeaderboardRow {
  userId: string;
  username: string;
  name?: string;
  rating: number;
  rank: number;
}

export type LeaderboardPeriod = "all" | "week" | "month";

export interface UserRankResponse {
  rank: number | null;
  rating: number | null;
}

export interface ChallengeCreatedResponse {
  token: string;
  shareUrl: string;
  expiresAt: string;
}

export interface ChallengeAcceptResponse {
  gameId: string;
  color: Color;
  timeControl: number;
}
