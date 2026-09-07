import { identifyOpening } from './openings';

describe('identifyOpening', () => {
  it('names a game from its first moves', () => {
    expect(identifyOpening(['e4', 'c5'])).toEqual({ eco: 'B20', name: 'Sicilian Defence' });
    expect(identifyOpening(['d4', 'd5', 'c4', 'e6'])).toEqual({
      eco: 'D30',
      name: "Queen's Gambit Declined",
    });
  });

  it('prefers the most specific line, not the first one listed', () => {
    // Every one of these also prefixes 'Sicilian Defence' (B20) and the
    // 2.Nf3 line (B27); the Najdorf is the longest match and must win.
    const najdorf = ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'a6'];
    expect(identifyOpening(najdorf)?.eco).toBe('B90');
    expect(identifyOpening(['e4', 'c5', 'Nf3', 'd6'])?.eco).toBe('B50');
    expect(identifyOpening(['e4', 'c5', 'Nf3'])?.eco).toBe('B27');
  });

  it('keeps naming the game once it leaves the book', () => {
    // A table this small degrades to a vaguer name; it must never lose the name
    // entirely just because the players kept playing.
    expect(identifyOpening(['e4', 'c5', 'Nf3', 'd6', 'Bb5+', 'Bd7', 'a4', 'h6'])?.name).toBe(
      'Sicilian Defence',
    );
  });

  it('returns null when nothing matches', () => {
    expect(identifyOpening([])).toBeNull();
    expect(identifyOpening(['a3', 'h6'])).toBeNull();
  });

  it('does not match a table entry longer than the game', () => {
    // 'e4 e5 Nf3 Nc6 Bb5 a6 Bxc6' is in the table; three plies in, the answer is
    // the shorter line, never the long one.
    expect(identifyOpening(['e4', 'e5', 'Nf3'])?.eco).toBe('C40');
  });

  it('names the scholar-mate line by its actual opening', () => {
    expect(identifyOpening(['e4', 'e5', 'Bc4', 'Nc6', 'Qh5'])).toEqual({
      eco: 'C23',
      name: "Bishop's Opening",
    });
  });
});
