/**
 * ECO opening identification (Analysis increment 3).
 *
 * `Game.openingEco` and `Game.openingName` have existed as columns since the
 * initial schema with nothing writing them — the same dead-column shape as
 * `Game.pgn` before the hardening pass. This fills them.
 *
 * Longest-prefix match of the game's SAN move list against a static table. No
 * dependency and no data file: the full ECO list is ~3000 lines of transpositions
 * that this codebase has no other use for, and every extra entry only refines a
 * label. The matcher does not change if a full table is dropped in later — the
 * entries below are just data, sorted longest-first at module load.
 */

interface Opening {
  /** SAN moves that must prefix the game, e.g. ['e4', 'c5', 'Nf3']. */
  moves: string[];
  eco: string;
  name: string;
}

/**
 * Main lines only, deliberately. Anything not listed falls back to the closest
 * shorter prefix, so an unusual Sicilian is still "Sicilian Defence" rather than
 * nothing — a shallow table degrades to a vaguer name, never a wrong one.
 */
const OPENINGS: Opening[] = [
  // --- 1. Queen's pawn and flank ---
  { moves: ['d4'], eco: 'A40', name: "Queen's Pawn Opening" },
  { moves: ['Nf3'], eco: 'A04', name: 'Réti Opening' },
  { moves: ['c4'], eco: 'A10', name: 'English Opening' },
  { moves: ['d4', 'f5'], eco: 'A80', name: 'Dutch Defence' },
  { moves: ['d4', 'Nf6'], eco: 'A45', name: 'Indian Defence' },
  { moves: ['d4', 'Nf6', 'Nf3'], eco: 'A46', name: 'Indian Defence, Torre/London complex' },
  { moves: ['d4', 'Nf6', 'c4'], eco: 'E00', name: 'Indian Defence' },
  { moves: ['d4', 'Nf6', 'c4', 'e6'], eco: 'E10', name: 'Indian Defence, East Indian' },
  { moves: ['d4', 'Nf6', 'c4', 'e6', 'Nc3', 'Bb4'], eco: 'E20', name: 'Nimzo-Indian Defence' },
  { moves: ['d4', 'Nf6', 'c4', 'e6', 'Nf3', 'b6'], eco: 'E12', name: "Queen's Indian Defence" },
  { moves: ['d4', 'Nf6', 'c4', 'g6'], eco: 'E60', name: "King's Indian Defence" },
  { moves: ['d4', 'Nf6', 'c4', 'g6', 'Nc3', 'Bg7', 'e4'], eco: 'E90', name: "King's Indian Defence, Classical" },
  { moves: ['d4', 'd5'], eco: 'D00', name: "Queen's Pawn Game" },
  { moves: ['d4', 'd5', 'Nf3'], eco: 'D02', name: "Queen's Pawn Game, London System" },
  { moves: ['d4', 'd5', 'c4'], eco: 'D06', name: "Queen's Gambit" },
  { moves: ['d4', 'd5', 'c4', 'Nc6'], eco: 'D07', name: "Queen's Gambit, Chigorin Defence" },
  { moves: ['d4', 'd5', 'c4', 'c6'], eco: 'D10', name: 'Slav Defence' },
  { moves: ['d4', 'd5', 'c4', 'dxc4'], eco: 'D20', name: "Queen's Gambit Accepted" },
  { moves: ['d4', 'd5', 'c4', 'e6'], eco: 'D30', name: "Queen's Gambit Declined" },

  // --- 1. e4 ---
  { moves: ['e4'], eco: 'B00', name: "King's Pawn Opening" },
  { moves: ['e4', 'd5'], eco: 'B01', name: 'Scandinavian Defence' },
  { moves: ['e4', 'Nf6'], eco: 'B02', name: "Alekhine's Defence" },
  { moves: ['e4', 'g6'], eco: 'B06', name: 'Modern Defence' },
  { moves: ['e4', 'd6'], eco: 'B07', name: 'Pirc Defence' },
  { moves: ['e4', 'c6'], eco: 'B10', name: 'Caro-Kann Defence' },
  { moves: ['e4', 'c6', 'd4', 'd5', 'e5'], eco: 'B12', name: 'Caro-Kann Defence, Advance' },
  { moves: ['e4', 'c6', 'd4', 'd5', 'exd5'], eco: 'B13', name: 'Caro-Kann Defence, Exchange' },

  // Sicilian
  { moves: ['e4', 'c5'], eco: 'B20', name: 'Sicilian Defence' },
  { moves: ['e4', 'c5', 'd4'], eco: 'B21', name: 'Sicilian Defence, Smith-Morra Gambit' },
  { moves: ['e4', 'c5', 'c3'], eco: 'B22', name: 'Sicilian Defence, Alapin' },
  { moves: ['e4', 'c5', 'Nc3'], eco: 'B23', name: 'Sicilian Defence, Closed' },
  { moves: ['e4', 'c5', 'Nf3'], eco: 'B27', name: 'Sicilian Defence' },
  { moves: ['e4', 'c5', 'Nf3', 'Nc6'], eco: 'B30', name: 'Sicilian Defence, Old Sicilian' },
  { moves: ['e4', 'c5', 'Nf3', 'e6'], eco: 'B40', name: 'Sicilian Defence, French Variation' },
  { moves: ['e4', 'c5', 'Nf3', 'd6'], eco: 'B50', name: 'Sicilian Defence' },
  { moves: ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'a6'], eco: 'B90', name: 'Sicilian Defence, Najdorf' },

  // French
  { moves: ['e4', 'e6'], eco: 'C00', name: 'French Defence' },
  { moves: ['e4', 'e6', 'd4', 'd5', 'e5'], eco: 'C02', name: 'French Defence, Advance' },
  { moves: ['e4', 'e6', 'd4', 'd5', 'Nd2'], eco: 'C03', name: 'French Defence, Tarrasch' },
  { moves: ['e4', 'e6', 'd4', 'd5', 'Nc3'], eco: 'C10', name: 'French Defence, Paulsen' },
  { moves: ['e4', 'e6', 'd4', 'd5', 'exd5'], eco: 'C01', name: 'French Defence, Exchange' },

  // 1. e4 e5
  { moves: ['e4', 'e5'], eco: 'C20', name: "King's Pawn Game" },
  { moves: ['e4', 'e5', 'd4'], eco: 'C21', name: 'Centre Game' },
  { moves: ['e4', 'e5', 'Bc4'], eco: 'C23', name: "Bishop's Opening" },
  { moves: ['e4', 'e5', 'Nc3'], eco: 'C25', name: 'Vienna Game' },
  { moves: ['e4', 'e5', 'f4'], eco: 'C30', name: "King's Gambit" },
  { moves: ['e4', 'e5', 'Nf3'], eco: 'C40', name: "King's Knight Opening" },
  { moves: ['e4', 'e5', 'Nf3', 'd6'], eco: 'C41', name: 'Philidor Defence' },
  { moves: ['e4', 'e5', 'Nf3', 'Nf6'], eco: 'C42', name: "Petrov's Defence" },
  { moves: ['e4', 'e5', 'Nf3', 'Nc6'], eco: 'C44', name: "King's Pawn Game" },
  { moves: ['e4', 'e5', 'Nf3', 'Nc6', 'd4'], eco: 'C45', name: 'Scotch Game' },
  { moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Nc3'], eco: 'C46', name: 'Three Knights Game' },
  { moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4'], eco: 'C50', name: 'Italian Game' },
  { moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'b4'], eco: 'C51', name: 'Italian Game, Evans Gambit' },
  { moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'c3'], eco: 'C53', name: 'Italian Game, Giuoco Piano' },
  { moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Nf6'], eco: 'C55', name: 'Italian Game, Two Knights Defence' },
  { moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5'], eco: 'C60', name: 'Ruy Lopez' },
  { moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Bxc6'], eco: 'C68', name: 'Ruy Lopez, Exchange' },
  { moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4'], eco: 'C70', name: 'Ruy Lopez, Morphy Defence' },
];

// Longest first, so the first prefix that matches is the most specific one.
const BY_LENGTH = [...OPENINGS].sort((a, b) => b.moves.length - a.moves.length);

/**
 * The most specific listed opening whose moves prefix this game, or null when
 * the game does not start with any of them (an irregular first move, or no
 * moves at all).
 */
export function identifyOpening(moves: string[]): { eco: string; name: string } | null {
  const found = BY_LENGTH.find(
    (o) => o.moves.length <= moves.length && o.moves.every((san, i) => san === moves[i]),
  );
  return found ? { eco: found.eco, name: found.name } : null;
}
