import {
  MATE_CP,
  centipawnLoss,
  classify,
  invert,
  moveAccuracy,
  scoreGame,
  toCp,
  winPercent,
} from './classify';

describe('analysis scoring', () => {
  it('folds mate scores onto the centipawn scale, keeping mate-in-1 best', () => {
    expect(toCp({ cp: null, mate: 1 })).toBeGreaterThan(toCp({ cp: null, mate: 5 }));
    expect(toCp({ cp: null, mate: 5 })).toBeGreaterThan(toCp({ cp: 900, mate: null }));
    expect(toCp({ cp: null, mate: -1 })).toBeLessThan(toCp({ cp: null, mate: -5 }));
    // `mate 0` is how a finished position is recorded: the side to move is mated.
    expect(toCp({ cp: null, mate: 0 })).toBeLessThan(-9000);
  });

  it('reads 0cp as an even game and clamps beyond +/-10 pawns', () => {
    expect(winPercent(0)).toBeCloseTo(50, 5);
    expect(winPercent(5000)).toBeCloseTo(winPercent(1000), 5);
    expect(winPercent(-5000)).toBeCloseTo(winPercent(-1000), 5);
  });

  it('charges nothing for a move that keeps the best evaluation', () => {
    expect(centipawnLoss({ cp: 30, mate: null }, { cp: 30, mate: null })).toBe(0);
    expect(centipawnLoss({ cp: 30, mate: null }, { cp: 45, mate: null })).toBe(0);
    expect(centipawnLoss({ cp: 30, mate: null }, { cp: -270, mate: null })).toBe(300);
  });

  it('does not call a move a blunder for going from winning to winning', () => {
    // +25 pawns down to +12 is still completely won; without the clamp this
    // would score as a 1300cp catastrophe.
    expect(centipawnLoss({ cp: 2500, mate: null }, { cp: 1200, mate: null })).toBe(0);
  });

  it('classifies by centipawns lost, with the engine move always BEST', () => {
    expect(classify(400, true)).toBe('BEST');
    expect(classify(0, false)).toBe('EXCELLENT');
    expect(classify(30, false)).toBe('GOOD');
    expect(classify(80, false)).toBe('INACCURACY');
    expect(classify(150, false)).toBe('MISTAKE');
    expect(classify(600, false)).toBe('BLUNDER');
  });

  it('gives a perfect move ~100% accuracy and a blunder far less', () => {
    expect(moveAccuracy(50, 50)).toBeCloseTo(100, 0);
    expect(moveAccuracy(50, 10)).toBeLessThan(30);
    // Gaining ground never scores above perfect.
    expect(moveAccuracy(50, 90)).toBeCloseTo(100, 0);
  });

  describe('scoreGame', () => {
    // 1. e4 e5 2. Ke2?? — White's own king walk. Engine scores, each from the
    // point of view of the side to move in that position:
    //   p0 (W to move) +30, p1 (B) -30, p2 (W) +30, p3 (B) +250
    // p3 being +250 for BLACK is what makes ply 3 the blunder.
    const played = [
      { san: 'e4', uci: 'e2e4', color: 'w' as const },
      { san: 'e5', uci: 'e7e5', color: 'b' as const },
      { san: 'Ke2', uci: 'e1e2', color: 'w' as const },
    ];
    const scores = [
      { cp: 30, mate: null },
      { cp: -30, mate: null },
      { cp: 30, mate: null },
      { cp: 250, mate: null },
    ];
    const bestMoves = ['e2e4', 'e7e5', 'g1f3', 'd7d5'];
    const result = scoreGame(played, scores, bestMoves);

    it('marks the moves the engine picked as BEST and the king walk as a blunder', () => {
      expect(result.moves.map((m) => m.classification)).toEqual(['BEST', 'BEST', 'BLUNDER']);
      expect(result.moves[2].cpLoss).toBe(280);
    });

    it("stores the evaluation after each move in White's point of view", () => {
      // After 1. e4 White stands +30; after 2. Ke2 White stands -250.
      expect(result.moves[0].evalCp).toBe(30);
      expect(result.moves[1].evalCp).toBe(30);
      expect(result.moves[2].evalCp).toBe(-250);
    });

    it('attributes accuracy to the player who actually moved', () => {
      // Black played only engine moves; White threw a game away on ply 3.
      expect(result.accuracyBlack).toBeCloseTo(100, 0);
      expect(result.accuracyWhite).toBeLessThan(result.accuracyBlack);
    });

    it('is symmetric: inverting every score swaps the two players verbatim', () => {
      const mirrored = scoreGame(
        played.map((m) => ({ ...m, color: m.color === 'w' ? ('b' as const) : ('w' as const) })),
        scores,
        bestMoves,
      );
      expect(mirrored.accuracyWhite).toBeCloseTo(result.accuracyBlack, 5);
      expect(mirrored.accuracyBlack).toBeCloseTo(result.accuracyWhite, 5);
    });
  });

  it('invert leaves nulls alone', () => {
    expect(invert({ cp: null, mate: null })).toEqual({ cp: null, mate: null });
    expect(invert({ cp: 40, mate: null })).toEqual({ cp: -40, mate: null });
    expect(invert({ cp: null, mate: 3 })).toEqual({ cp: null, mate: -3 });
  });

  describe('a delivered checkmate', () => {
    // The mated position scores `mate: 0` for the side to move. Negating 0 gives
    // 0, so before this case was written out the mating move came back as the
    // worst blunder in the game and cost the winner ~40 accuracy points.
    const mated = { cp: null, mate: 0 };

    it('is a win from the point of view of the player who gave it', () => {
      expect(toCp(mated)).toBeLessThan(-9000);
      expect(toCp(invert(mated))).toBe(MATE_CP);
    });

    it('costs the mating player nothing', () => {
      expect(centipawnLoss({ cp: null, mate: 1 }, invert(mated))).toBe(0);
      expect(moveAccuracy(winPercent(toCp({ cp: null, mate: 1 })), winPercent(toCp(invert(mated)))))
        .toBeCloseTo(100, 0);
    });

    it('scores the mating move BEST and the eval as White winning', () => {
      const scored = scoreGame(
        [{ san: 'Qxf7#', uci: 'h5f7', color: 'w' }],
        [{ cp: null, mate: 1 }, mated],
        ['h5f7'],
      );
      expect(scored.moves[0].classification).toBe('BEST');
      expect(scored.moves[0].cpLoss).toBe(0);
      expect(scored.moves[0].evalCp).toBe(MATE_CP);
      expect(scored.accuracyWhite).toBeCloseTo(100, 0);
    });
  });
});
