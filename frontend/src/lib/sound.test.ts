import { afterEach, describe, expect, it, vi } from "vitest";
import { getPack, getVolume, moveSoundFor, sanToWords, setPack, setVolume } from "./sound";

describe("moveSoundFor (chess.com precedence)", () => {
  it.each([
    ["e4", "move"],
    ["Nxe5", "capture"],
    ["O-O", "castle"],
    ["O-O-O", "castle"],
    ["e8=Q", "promote"],
    ["exd8=Q", "promote"], // promotion outranks capture
    ["Qh5+", "check"],
    ["O-O+", "check"], // check outranks castle
    ["exd8=Q#", "check"], // and promotion
  ])("%s → %s", (san, sound) => expect(moveSoundFor(san)).toBe(sound));
});

describe("sanToWords (Voice pack)", () => {
  it.each([
    ["e4", "e 4"],
    ["Nxe5+", "Knight takes e 5, check"],
    ["Nbd2", "Knight b d 2"],
    ["O-O-O", "Castles long"],
    ["O-O#", "Castles short, checkmate"],
    ["exd8=Q+", "e takes d 8, promotes to Queen, check"],
  ])("%s → %s", (san, words) => expect(sanToWords(san)).toBe(words));
});

describe("settings storage", () => {
  afterEach(() => vi.unstubAllGlobals());

  const memoryStorage = () => {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
  };

  it("falls back to defaults when storage is missing (private mode)", () => {
    vi.stubGlobal("localStorage", undefined);
    expect(getPack()).toBe("brut");
    expect(getVolume()).toBe(0.7);
    expect(() => setVolume(0.2)).not.toThrow();
  });

  it("round-trips valid values and rejects junk", () => {
    const store = memoryStorage();
    vi.stubGlobal("localStorage", store);
    setPack("wood");
    setVolume(0.3);
    expect(getPack()).toBe("wood");
    expect(getVolume()).toBe(0.3);

    store.setItem("wchess.soundPack", "not-a-pack");
    store.setItem("wchess.volume", "7");
    expect(getPack()).toBe("brut");
    expect(getVolume()).toBe(0.7);
  });
});
