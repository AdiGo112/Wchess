import type { GameRecord } from "../types";

export interface ResultDisplay {
  glyph: string;
  label: string;
  win: boolean;
}

/**
 * How a finished game reads from one player's side.
 * Strict mono: the result carries through glyph + weight, never color.
 * ▲ win / ▼ loss / = draw
 *
 * Shared by GameHistory and Profile so the two can't drift apart.
 */
export function describeResult(game: GameRecord, userId: string | undefined): ResultDisplay {
  const result = game.result?.toLowerCase();
  if (result === "draw") return { glyph: "=", label: "Draw", win: false };
  if (result === "aborted") return { glyph: "·", label: "Aborted", win: false };

  const isWhite = game.whiteId === userId;
  const won = (result === "white" && isWhite) || (result === "black" && !isWhite);
  return won
    ? { glyph: "▲", label: "Win", win: true }
    : { glyph: "▼", label: "Loss", win: false };
}

/** The rating delta this game produced for the given player. */
export function ratingDelta(game: GameRecord, userId: string | undefined): number {
  const isWhite = game.whiteId === userId;
  return (isWhite ? game.whiteRatingDiff : game.blackRatingDiff) ?? 0;
}
