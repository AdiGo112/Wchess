# ADR-0005: chess.js Server-Side Move Validation

**Status:** Accepted
**Date:** 2026-06-23

## Context
Chess has 20 legal first moves and complex rules (en passant, castling, promotion, check evasion). Every move submitted by a client must be validated. Trusting client-side validation would allow cheating via modified JavaScript.

## Decision
Every move submitted via the move Socket.io event is validated on the server using chess.js before being applied. chess.js is instantiated with the current FEN from Redis, and chess.move({ from, to, promotion }) is called. A null return value means the move is illegal; an error event is emitted to the client.

## Consequences
**Positive:** No illegal moves can be played regardless of client behavior. chess.js is a battle-tested library used in thousands of chess applications. Server is the single source of truth for board state.
**Negative:** chess.js adds ~100KB to the backend bundle (trivial). Each move validation instantiates a Chess object from FEN — measured at <1ms per move, acceptable.
**Neutral:** The client also runs chess.js for legal move highlighting (showing which squares a piece can move to). This is a UX feature only; the server does not trust it.
