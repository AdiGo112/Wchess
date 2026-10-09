import { describe, expect, it } from "vitest";
import { describeResult, ratingDelta } from "./gameResult";
import type { GameRecord } from "../types";

const game = (result: GameRecord["result"]): GameRecord => ({
  id: "g", whiteId: "w", blackId: "b", whiteUsername: "W", blackUsername: "B",
  whiteRatingDiff: 8, blackRatingDiff: -8, result, reason: "CHECKMATE",
  variant: "BLITZ", moves: [], createdAt: "",
});

describe("describeResult", () => {
  it("reads a decisive game from each side", () => {
    expect(describeResult(game("WHITE"), "w")).toEqual({ glyph: "▲", label: "Win", win: true });
    expect(describeResult(game("WHITE"), "b")).toEqual({ glyph: "▼", label: "Loss", win: false });
    expect(describeResult(game("BLACK"), "b").win).toBe(true);
    expect(describeResult(game("BLACK"), "w").win).toBe(false);
  });

  it("draws and aborts are neither win nor loss, for both players", () => {
    for (const id of ["w", "b"]) {
      expect(describeResult(game("DRAW"), id).label).toBe("Draw");
      expect(describeResult(game("ABORTED"), id).label).toBe("Aborted");
    }
  });

  it("accepts the lowercase result the socket sends", () => {
    expect(describeResult({ ...game("WHITE"), result: "white" as GameRecord["result"] }, "w").win).toBe(true);
  });
});

describe("ratingDelta", () => {
  it("picks the viewer's own side, and 0 when missing", () => {
    expect(ratingDelta(game("WHITE"), "w")).toBe(8);
    expect(ratingDelta(game("WHITE"), "b")).toBe(-8);
    expect(ratingDelta({ ...game("DRAW"), blackRatingDiff: undefined as unknown as number }, "b")).toBe(0);
  });
});
