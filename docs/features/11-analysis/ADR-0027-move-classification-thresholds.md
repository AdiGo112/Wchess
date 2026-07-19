# ADR-0027: Adopt Lichess Centipawn Loss Thresholds for Move Classification

**Status:** Accepted
**Date:** 2026-06-24

## Context

Post-game analysis must classify each move into a quality category that players recognize and find meaningful. The two most widely used classification systems are:

**Chess.com classification:**
- Best: < 10 cp loss
- Excellent: < 25 cp loss
- Good: < 50 cp loss
- Inaccuracy: < 100 cp loss
- Mistake: < 200 cp loss
- Blunder: >= 200 cp loss

**Lichess classification:**
- Brilliant: < 0 cp loss (note: Lichess considers this a special detection case, not literally negative loss) + tactical sacrifice
- Good: < 20 cp loss
- Inaccuracy: 20-50 cp loss
- Mistake: 50-100 cp loss
- Blunder: > 100 cp loss

Chess.com's system uses looser thresholds, which results in more moves classified as "Good" or "Excellent" and fewer blunders. This feels more encouraging but is less informative for improvement. Lichess's system is stricter and more meaningful as a learning tool.

ChessWeb's target audience overlaps more with Lichess users (free, improvement-focused, open-source friendly) than with Chess.com's audience. Players who come from Lichess will find ChessWeb's classifications immediately familiar and comparable, reducing confusion.

"Brilliant" detection is the most contentious classification. On Lichess, a brilliant move is not simply a move with < 0 cp loss — it requires the move to be a non-obvious sacrifice (placing a piece on a square attacked by a lower-value piece) where Stockfish confirms it is objectively the best move. Implementing a full tactical heuristic for brilliant detection is complex. In v1, ChessWeb approximates brilliance as: `cpLoss < 5 AND the piece moved to a square that was previously occupied or attacked by a lower-value opposing piece (a capture or sacrifice square)`.

## Decision

Adopt the Lichess centipawn loss thresholds:
- **Brilliant**: cpLoss < 5 AND `isBrilliant === true` (sacrifice heuristic)
- **Good**: cpLoss < 20
- **Inaccuracy**: 20 ≤ cpLoss < 50
- **Mistake**: 50 ≤ cpLoss < 100
- **Blunder**: cpLoss ≥ 100

These thresholds are implemented as a pure function `classify(cpLoss, isBrilliant)` in `backend/src/utils/move-classifier.ts`.

## Consequences

**Positive:**
- Familiar to the large Lichess user base, which is a key target audience for ChessWeb.
- Stricter than Chess.com thresholds, which means classifications are more meaningful as improvement signals.
- The pure function implementation is trivially testable with 100% branch coverage.
- Having a separate `isBrilliant` flag allows future improvement of the sacrifice detection algorithm without changing the threshold logic.

**Negative:**
- Brilliant detection via the sacrifice heuristic is an approximation. Sophisticated players may notice that some genuinely brilliant moves are not classified as brilliant (false negatives), and some routine recaptures on sacrifice squares might be classified as brilliant (false positives). This is explicitly documented as a known limitation in v1.
- Stricter thresholds mean players will see more inaccuracies and mistakes compared to Chess.com analysis, which may feel discouraging. This is an intentional design choice — ChessWeb prioritizes learning over ego.

**Neutral:**
- The boundary between "good" and "inaccuracy" at exactly 20 cp is arbitrary — it is simply the Lichess convention. If data from real users shows it needs tuning, the threshold can be adjusted in `move-classifier.ts` without any schema or API changes.
