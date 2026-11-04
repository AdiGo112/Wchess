# WChess — Literature Survey & References

### Companion to `report.md` — Project Stage 1 (Sem 7)

**BE Computer Engineering · D. Y. Patil College of Engineering, Akurdi, Pune**

> Every source below was verified to exist at the listed venue/URL (checked July 2026).
> Each entry gives: the citation, what the work established, and **exactly where WChess
> uses it** — so any entry can be defended in a viva, not just listed.
> The numbered list at the end is formatted for direct pasting into an IEEE-style
> References chapter.

---

## Survey Organization

| § | Theme | Papers | Used in |
|---|-------|--------|---------|
| 1 | Rating systems under uncertainty | Elo, Glickman ×2, Herbrich et al. | v1 — rating engine |
| 2 | Real-time web communication | RFC 6455, Pimentel & Nickerson, Łasocha & Badurowicz | v1 — game transport |
| 3 | WebAssembly & in-browser compute | Haas et al. | v1 — Stockfish AI |
| 4 | Computer chess | Shannon, Silver et al., Nasu | v1 — AI opponent (context) |
| 5 | Authentication & password security | Provos & Mazières, RFC 7519 | v1 — auth |
| 6 | Distributed game-server architecture | Cronin et al., Fowler, Nygard, empirical microservices studies | v1 — architecture (ADR-0032) |
| 7 | Tournament pairing (Stage 2) | Ólafsson, Kujansuu et al., Biró et al., Sauer et al. | roadmap — Swiss module |
| 8 | Spaced repetition (Stage 2) | Woźniak | roadmap — puzzle trainer |

---

## 1 · Rating Systems Under Uncertainty

The single deepest academic thread in this project. The progression Elo → Glicko →
Glicko-2 → TrueSkill is a 40-year arc of the same statistical question: *how do you
estimate a hidden skill variable from noisy pairwise game outcomes?*

### 1.1 Elo (1978) — the baseline everyone extends

**A. E. Elo, *The Rating of Chessplayers, Past and Present*. New York: Arco, 1978.**
([Internet Archive scan](https://archive.org/details/ratingofchesspla00unse) ·
[PDF mirror](https://gwern.net/doc/statistics/order/comparison/1978-elo-theratingofchessplayerspastandpresent.pdf))

Elo, a physics professor and chess master, formalized the first statistically grounded
rating system adopted by FIDE: player skill as a single number, expected score as a
logistic function of the rating difference, and a fixed K-factor update. Its two known
weaknesses — no notion of *confidence* in a rating, and the hand-tuned K-factor — are
precisely what the next three papers attack.

**In WChess:** the conceptual baseline. Deliberately **not** implemented — the report's
claim "this is not toy Elo" is defined against this book.

### 1.2 Glickman (1999) — add a confidence interval: Glicko

**M. E. Glickman, "Parameter estimation in large dynamic paired comparison experiments,"
*Journal of the Royal Statistical Society: Series C (Applied Statistics)*, vol. 48, no. 3,
pp. 377–394, 1999.**

Glickman's insight: a rating without an error bar is statistically incomplete. Glicko
models each player as a Gaussian *(rating μ, deviation RD)*; RD shrinks with evidence
(games played) and grows with inactivity. A win over an uncertain opponent teaches the
system less than a win over a well-established one — the g(φ) discount factor.

**In WChess:** the `ratingDeviation` column on `UserRating`, the `provisional` flag
(RD > 110), and the g(φ) discounting inside `common/utils/elo.ts`.

### 1.3 Glickman (2001/2022) — add volatility: Glicko-2

**M. E. Glickman, "Dynamic paired comparison models with stochastic variances," *Journal
of Applied Statistics*, vol. 28, no. 6, pp. 673–689, 2001.** Implementation companion:
**M. E. Glickman, "Example of the Glicko-2 system," Boston University, technical note.**
([glicko.net/glicko/glicko2.pdf](https://glicko.net/glicko/glicko2.pdf))

Glicko-2 adds a third parameter, volatility σ — how erratically a player's underlying
skill itself moves — estimated per-update by solving a one-dimensional root-finding
problem. The companion note is the step-by-step reference implementation nearly every
production system (including Lichess) codes against.

**In WChess:** `updateGlicko2()` is a line-for-line implementation of the companion
note: scale conversion (÷173.7178), variance v, improvement Δ, the Illinois-algorithm
volatility solve (τ = 0.5, ε = 10⁻⁶), and the φ*→φ′ recombination. The `volatility`
column and the RD clamp [30, 350] come straight from this system.

### 1.4 Herbrich, Minka & Graepel (2006) — the road not taken: TrueSkill

**R. Herbrich, T. Minka, and T. Graepel, "TrueSkill™: A Bayesian skill rating system,"
in *Advances in Neural Information Processing Systems 19 (NIPS 2006)*, pp. 569–576.**
([NIPS page](https://papers.nips.cc/paper/3079-trueskilltm-a-bayesian-skill-rating-system) ·
[Microsoft Research](https://www.microsoft.com/en-us/research/publication/trueskilltm-a-bayesian-skill-rating-system/))

Microsoft's generalization of Elo for Xbox Live (deployed since 2005): factor-graph
message passing that handles teams and N-player free-for-alls, with explicit draw
modeling. The successor **TrueSkill 2** (Minka et al., 2018) adds experience and
squad effects.

**In WChess:** surveyed and **rejected with a reason** — chess is strictly 1-vs-1 with
simple draws, so TrueSkill's extra machinery (team inference, factor graphs) buys
nothing over Glicko-2 here, while Glicko-2 keeps direct comparability with FIDE/Lichess
rating scales. Being able to say *why not* is the survey's job.

---

## 2 · Real-Time Web Communication

### 2.1 The protocol standard

**I. Fette and A. Melnikov, "The WebSocket Protocol," IETF RFC 6455, Dec. 2011.**
([rfc-editor.org/rfc/rfc6455](https://www.rfc-editor.org/rfc/rfc6455))

The IETF standard defining the full-duplex, single-TCP-connection protocol: the HTTP
Upgrade handshake, frame format, masking, and close semantics. The reason a chess move
can be *pushed* to the opponent instead of polled for.

**In WChess:** the transport under every Socket.io gateway (`move_made`, `match_found`,
`clock` events). Socket.io layers reconnection, rooms, and namespaces on top of RFC 6455.

### 2.2 Empirical comparisons — why WebSocket and not polling

**V. Pimentel and B. G. Nickerson, "Communicating and displaying real-time data with
WebSocket," *IEEE Internet Computing*, vol. 16, no. 4, pp. 45–53, 2012.**

Measured WebSocket against HTTP long-polling for live data over real Internet distances:
WebSocket delivers lower latency and dramatically lower per-message overhead (no repeated
HTTP headers per update).

**W. Łasocha and M. Badurowicz, "Comparison of WebSocket and HTTP protocol performance,"
*Journal of Computer Sciences Institute* (JCSI), vol. 19, pp. 67–74, 2021.**
([ResearchGate](https://www.researchgate.net/publication/352852391_Comparison_of_WebSocket_and_HTTP_protocol_performance))

Newer measurement study: above ~100 repeated transmissions, WebSocket outperforms HTTP
by several hundred percent — the steady-state regime a chess game (dozens of moves +
clock syncs per minute) lives in.

**In WChess:** the documented justification for the REST/WebSocket split in §7 of the
report — request/response traffic (auth, history) goes over REST; anything continuous
(moves, clocks, queue positions) goes over the socket.

---

## 3 · WebAssembly & In-Browser Compute

**A. Haas, A. Rossberg, D. L. Schuff, B. L. Titzer, M. Holman, D. Gohman, L. Wagner,
A. Zakai, and J. F. Bastien, "Bringing the web up to speed with WebAssembly," in *Proc.
38th ACM SIGPLAN Conf. on Programming Language Design and Implementation (PLDI '17)*,
Barcelona, 2017, pp. 185–200.**
([ACM DL](https://dl.acm.org/doi/10.1145/3062341.3062363) ·
[author PDF](https://people.mpi-sws.org/~rossberg/papers/Haas,%20Rossberg,%20Schuff,%20Titzer,%20Gohman,%20Wagner,%20Zakai,%20Bastien,%20Holman%20-%20Bringing%20the%20Web%20up%20to%20Speed%20with%20WebAssembly.pdf))

The design paper for WebAssembly, co-authored by engineers from all four major browser
vendors: a formally specified, validated, sandboxed low-level bytecode with near-native
execution speed. This paper is what makes "run a real chess engine in the browser" an
engineering option instead of a fantasy.

**In WChess:** the entire ADR-0009 decision rests on this capability — Stockfish 18
compiled to WASM runs in a Web Worker in the player's own browser at 5 UCI skill levels,
moving the AI's CPU cost from the server (scales with concurrent games, costs money) to
the client (already idle, already paid for). The server keeps only re-validation.

---

## 4 · Computer Chess — the AI Opponent's Lineage

### 4.1 Shannon (1950) — the founding paper of the entire field

**C. E. Shannon, "Programming a computer for playing chess," *Philosophical Magazine*,
Series 7, vol. 41, no. 314, pp. 256–275, 1950.**

Shannon defined minimax search over a position-evaluation function, the Type A
(brute-force) vs Type B (selective) search distinction, and the ~10¹²⁰ game-tree
estimate ("Shannon number"). Every classical engine since — including Stockfish's
alpha-beta core — is a descendant of this paper.

### 4.2 Silver et al. (2018) — the neural revolution

**D. Silver, T. Hubert, J. Schrittwieser, et al., "A general reinforcement learning
algorithm that masters chess, shogi, and Go through self-play," *Science*, vol. 362,
no. 6419, pp. 1140–1144, 2018.**
([science.org/doi/10.1126/science.aar6404](https://www.science.org/doi/10.1126/science.aar6404) ·
[arXiv preprint 1712.01815](https://arxiv.org/abs/1712.01815))

AlphaZero: tabula-rasa self-play reinforcement learning + Monte-Carlo tree search, no
human knowledge beyond the rules, superhuman in 24 hours, defeating Stockfish 8.

### 4.3 Nasu (2018) — the synthesis that produced today's Stockfish

**Y. Nasu, "Efficiently updatable neural-network-based evaluation functions for computer
shogi" (NNUE), Ziosoft Computer Shogi Club, 2018.**
(context: [Stockfish NNUE announcement](https://stockfishchess.org/blog/2020/introducing-nnue-evaluation/) ·
[Chess Programming Wiki](https://www.chessprogramming.org/Stockfish_NNUE))

NNUE: a shallow, integer-quantized network whose first layer is *incrementally updated*
as pieces move — neural evaluation cheap enough for CPU alpha-beta search. Merged into
Stockfish 12 (Aug 2020) for a ~+100 Elo jump; the engine WChess ships (Stockfish 18
lite, single-threaded WASM, 7.3 MB) is a direct descendant.

**In WChess:** these three papers are the provenance chain of the opponent your users
actually play. WChess *consumes* the engine rather than reimplementing it — the correct
scope decision — but the survey shows the team knows what is inside the black box and
why its difficulty knob (UCI `Skill Level` 0–20 + movetime budget) works.

---

## 5 · Authentication & Password Security

### 5.1 Provos & Mazières (1999) — why bcrypt, specifically

**N. Provos and D. Mazières, "A future-adaptable password scheme," in *Proc. 1999 USENIX
Annual Technical Conference, FREENIX Track*, Monterey, CA, 1999, pp. 81–91.**
([USENIX PDF](https://www.usenix.org/legacy/event/usenix99/provos/provos.pdf))

The bcrypt paper. Core argument: hardware gets faster, so a password hash must have a
*tunable* cost factor that can be raised over time — "future-adaptable." Built on the
deliberately expensive eksblowfish key schedule.

**In WChess:** `bcrypt.hash()` on register, `bcrypt.compare()` in `LocalStrategy` —
chosen over plain SHA-family hashes precisely for the adaptive cost-factor argument this
paper makes.

### 5.2 JWT — the stateless session standard

**M. Jones, J. Bradley, and N. Sakimura, "JSON Web Token (JWT)," IETF RFC 7519,
May 2015.** ([rfc-editor.org/rfc/rfc7519](https://www.rfc-editor.org/rfc/rfc7519))

Defines the compact, signed claims token (header.payload.signature). Statelessness is
the feature *and* the flaw: a JWT cannot be revoked before expiry.

**In WChess:** the known revocation weakness is engineered around, not ignored —
15-minute access tokens bound the damage window, while refresh tokens are **stored
server-side and rotated on every use** (`RefreshToken` table), restoring revocability
(logout = row deletion) exactly where the RFC's model lacks it.

---

## 6 · Distributed Architecture & Real-Time Game Servers

### 6.1 State synchronization in multiplayer games

**E. Cronin, A. R. Kurc, B. Filstrup, and S. Jamin, "An efficient synchronization
mechanism for mirrored game architectures," *Multimedia Tools and Applications*,
vol. 23, no. 1, pp. 7–30, 2004.**
([Springer](https://link.springer.com/article/10.1023/B:MTAP.0000026839.31028.9f) ·
[author PDF](https://www.comp.nus.edu.sg/~bleong/hydra/related/cronin03efficient.pdf))

Analyzes the client-server vs peer-to-peer spectrum for real-time games and proposes
trailing-state synchronization for latency-critical genres. Establishes the trade-off
vocabulary: central authority (consistency, anti-cheat) vs distribution (latency,
no single bottleneck).

**In WChess:** chess is turn-based with clocks — latency tolerance is high, but
*authority* is everything (ratings must be unforgeable). The paper's trade-off framework
is why WChess sits at the fully server-authoritative end: one Redis-resident room state,
every move re-validated server-side, clients as untrusted views.

### 6.2 Monolith-first, and the evidence behind it

**M. Fowler, "MonolithFirst," martinfowler.com, June 2015.**
([martinfowler.com/bliki/MonolithFirst.html](https://martinfowler.com/bliki/MonolithFirst.html))
— the influential argument that successful microservice systems almost always start as
monoliths, because you only learn the correct service boundaries by operating the system.

**Empirical support:** recent measurement studies (e.g., *Monolithic vs. Microservice
Architecture: A Performance and Scalability Evaluation*, 2022
([ResearchGate](https://www.researchgate.net/publication/358721590_Monolithic_vs_Microservice_Architecture_A_Performance_and_Scalability_Evaluation));
comparative analyses reporting a 10–50 ms latency tax per internal network hop and
significantly higher operating cost for premature microservice splits) consistently find
that below thousands of concurrent users, decomposition costs more than it returns.

**In WChess:** ADR-0032 *is* this literature applied: a measured coupling audit (two
cross-module dependencies) → stay a modular monolith → split the socket layer only at a
written trigger (>5k concurrent sockets or deploys interrupting live games), mirroring
Lichess's production `lila`/`lila-ws` split.

### 6.3 Architecture Decision Records

**M. Nygard, "Documenting architecture decisions," Cognitect blog, Nov. 2011.**
([cognitect.com/blog/2011/11/15/documenting-architecture-decisions](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions))

The origin of the ADR format (Context → Decision → Consequences) used by every
`docs/architecture/ADR-*.md` in this repository — including recording *negative*
consequences accepted and the trigger for revisiting.

---

## 7 · Tournament Pairing — Stage 2 (Swiss module)

The tournaments roadmap item is not hand-waving; the pairing problem has a real
literature, and the implementation path runs through graph matching.

**S. Ólafsson, "Weighted matching in chess tournaments," *Journal of the Operational
Research Society*, vol. 41, no. 1, pp. 17–24, 1990.**
([ResearchGate](https://www.researchgate.net/publication/31953571_Weighted_Matching_in_Chess_Tournaments))
— the classical result: encode Swiss pairing rules (equal scores meet, colors alternate,
no rematches) as edge weights and solve a **maximum-weight matching** per round.

**E. Kujansuu, T. Lindberg, and E. Mäkinen, "The stable roommates problem and chess
tournament pairings," *Divulgaciones Matemáticas*, vol. 7, no. 1, pp. 19–28, 1999.**
— an alternative formulation via the stable-roommates problem.

**P. Biró, T. Fleiner, and R. Palincza, "Designing chess pairing mechanisms," 2017.**
([PDF](https://real.mtak.hu/80729/7/jXaio4T11ygd57-77-86.pdf)) — shows FIDE Dutch-system
priority rules can be replaced by polynomial-time matching algorithms.

**J. Sauer, Á. Cseh, and P. Lenzner, "Improving ranking quality and fairness in
Swiss-system chess tournaments," in *Proc. 23rd ACM Conf. on Economics and Computation
(EC '22)*, 2022.** ([ACM DL](https://dl.acm.org/doi/abs/10.1145/3490486.3538298) ·
[arXiv 2112.10522](https://arxiv.org/html/2112.10522v2)) — demonstrates maximum-weight-matching
pairings that measurably beat the official FIDE system on fairness and final-ranking
quality. Related recent evidence: *Most Swiss-system tournaments are unfair: Evidence
from chess* ([arXiv 2410.19333](https://arxiv.org/pdf/2410.19333), 2024).

**In WChess (Stage 2):** the planned Swiss implementation is the Ólafsson/Sauer route —
per-round maximum-weight matching over a graph whose edge weights encode score
difference, color balance, and rematch prohibition — rather than a hand-rolled greedy
pairing loop. The `Tournament`/`TournamentPlayer` schema (score, tiebreak, rounds)
already anticipates it.

---

## 8 · Spaced Repetition — Stage 2 (Puzzle trainer)

**P. A. Woźniak, *Optimization of Learning*, Master's thesis, Poznań University of
Technology, 1990 — the SM-2 algorithm.**
(algorithm spec: [super-memory.com/english/ol/sm2.htm](https://super-memory.com/english/ol/sm2.htm))

SM-2: each item carries an easiness factor EF; inter-repetition intervals grow
geometrically (1, 6, then ×EF days), with EF adjusted per recall-quality grade and
failure resetting the schedule. The ancestor of Anki and virtually all modern
spaced-repetition software.

**In WChess (Stage 2):** the puzzle trainer's designed `nextReviewAt` scheduling maps
puzzle outcomes onto SM-2 grades — a failed tactic resurfaces tomorrow, a mastered one
in weeks — turning the `PuzzleAttempt` log (already in the schema) into a training
scheduler rather than a mere history.

---

## Research Gap & Positioning (for the report's "novelty" section)

No single paper above describes a system like WChess — that is the point of a synthesis
project. The positioning claim to make in the report:

1. **Production chess platforms are studied, not reproducible.** Lichess is open-source
   but is a decade of Scala across two purpose-built services; Chess.com is closed. There
   is no *pedagogically tractable* reference implementation that still takes the hard
   parts seriously.
2. **Academic treatments cover single slices** — a rating-system paper here, a
   matchmaking analysis there, a WebSocket benchmark elsewhere. WChess integrates six of
   these threads (Glicko-2, tolerance-based matchmaking, server-authoritative real-time
   state, WASM compute offload, rotating-token auth, monolith-first architecture) into
   one coherent, verified system — and documents every integration decision as an ADR.
3. **The contribution is therefore architectural synthesis under real constraints**
   (two-person team, one semester): demonstrating that the published algorithms compose
   into a working platform, and recording precisely which simplifications were taken,
   why, and what triggers their removal.

---

## References (IEEE format — paste-ready)

[1] A. E. Elo, *The Rating of Chessplayers, Past and Present*. New York, NY, USA: Arco, 1978.

[2] M. E. Glickman, "Parameter estimation in large dynamic paired comparison experiments," *J. Roy. Statist. Soc. Ser. C (Appl. Statist.)*, vol. 48, no. 3, pp. 377–394, 1999.

[3] M. E. Glickman, "Dynamic paired comparison models with stochastic variances," *J. Appl. Statist.*, vol. 28, no. 6, pp. 673–689, 2001.

[4] M. E. Glickman, "Example of the Glicko-2 system," Boston Univ., Boston, MA, USA, Tech. Note. [Online]. Available: https://glicko.net/glicko/glicko2.pdf

[5] R. Herbrich, T. Minka, and T. Graepel, "TrueSkill™: A Bayesian skill rating system," in *Adv. Neural Inf. Process. Syst. 19 (NIPS)*, 2006, pp. 569–576.

[6] I. Fette and A. Melnikov, "The WebSocket protocol," IETF, RFC 6455, Dec. 2011. [Online]. Available: https://www.rfc-editor.org/rfc/rfc6455

[7] V. Pimentel and B. G. Nickerson, "Communicating and displaying real-time data with WebSocket," *IEEE Internet Comput.*, vol. 16, no. 4, pp. 45–53, Jul./Aug. 2012.

[8] W. Łasocha and M. Badurowicz, "Comparison of WebSocket and HTTP protocol performance," *J. Comput. Sci. Inst. (JCSI)*, vol. 19, pp. 67–74, 2021.

[9] A. Haas et al., "Bringing the web up to speed with WebAssembly," in *Proc. 38th ACM SIGPLAN Conf. Program. Lang. Des. Implement. (PLDI)*, Barcelona, Spain, 2017, pp. 185–200.

[10] C. E. Shannon, "Programming a computer for playing chess," *Philos. Mag.*, ser. 7, vol. 41, no. 314, pp. 256–275, 1950.

[11] D. Silver et al., "A general reinforcement learning algorithm that masters chess, shogi, and Go through self-play," *Science*, vol. 362, no. 6419, pp. 1140–1144, 2018.

[12] Y. Nasu, "Efficiently updatable neural-network-based evaluation functions for computer shogi," Ziosoft Comput. Shogi Club, Tech. Rep., 2018.

[13] N. Provos and D. Mazières, "A future-adaptable password scheme," in *Proc. USENIX Annu. Tech. Conf., FREENIX Track*, Monterey, CA, USA, 1999, pp. 81–91.

[14] M. Jones, J. Bradley, and N. Sakimura, "JSON Web Token (JWT)," IETF, RFC 7519, May 2015. [Online]. Available: https://www.rfc-editor.org/rfc/rfc7519

[15] E. Cronin, A. R. Kurc, B. Filstrup, and S. Jamin, "An efficient synchronization mechanism for mirrored game architectures," *Multimedia Tools Appl.*, vol. 23, no. 1, pp. 7–30, 2004.

[16] M. Fowler, "MonolithFirst," martinfowler.com, Jun. 2015. [Online]. Available: https://martinfowler.com/bliki/MonolithFirst.html

[17] M. Nygard, "Documenting architecture decisions," Cognitect, Nov. 2011. [Online]. Available: https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions

[18] S. Ólafsson, "Weighted matching in chess tournaments," *J. Oper. Res. Soc.*, vol. 41, no. 1, pp. 17–24, 1990.

[19] E. Kujansuu, T. Lindberg, and E. Mäkinen, "The stable roommates problem and chess tournament pairings," *Divulgaciones Matemáticas*, vol. 7, no. 1, pp. 19–28, 1999.

[20] P. Biró, T. Fleiner, and R. Palincza, "Designing chess pairing mechanisms," in *Proc. 10th Japanese-Hungarian Symp. Discrete Math. Appl.*, 2017, pp. 77–86.

[21] J. Sauer, Á. Cseh, and P. Lenzner, "Improving ranking quality and fairness in Swiss-system chess tournaments," in *Proc. 23rd ACM Conf. Econ. Comput. (EC)*, 2022. [Online]. Available: https://arxiv.org/abs/2112.10522

[22] P. A. Woźniak, "Optimization of learning," M.S. thesis, Poznań Univ. Technol., Poznań, Poland, 1990.

---

*Compiled 2026-07-19. Sources verified via web search at compile time; URLs live as of
that date. arXiv/author-PDF links are provided where paywalled venues have free mirrors.*
