# ADR-0003: bcrypt Cost Factor 10

**Status:** Accepted
**Date:** 2026-06-23

## Context

User passwords need to be hashed before storage. The options considered were bcrypt, Argon2id, and scrypt. We needed to choose an algorithm and a cost parameter that balances security against registration/login latency.

Benchmarks were run on commodity cloud hardware (2 vCPU, 4GB RAM — equivalent to a t3.medium AWS instance).

## Decision

Use bcrypt (via the bcryptjs npm package) with cost factor 10.

- Algorithm: bcrypt
- Cost factor: 10
- Library: bcryptjs (pure JS, no native bindings — avoids build complexity)

Benchmark results on t3.medium equivalent:
- Cost 10: ~80-120ms per hash
- Cost 12: ~300-400ms per hash
- Cost 14: ~1200ms per hash

## Consequences

**Positive:**
- 80-120ms is well within acceptable latency for a registration/login endpoint (users tolerate up to 500ms for auth flows).
- bcrypt is battle-tested with decades of production use and extensive auditing.
- bcryptjs (pure JS) avoids native module compilation issues across deployment environments.
- Cost 10 produces hashes that take ~80ms to verify — an attacker doing a brute-force offline attack faces the same cost per guess.

**Negative:**
- Argon2id is considered more modern and memory-hard (resistant to GPU attacks). bcrypt is CPU-only, making GPU attacks more feasible for long-term storage.
- Cost 10 may become insufficient as hardware improves. Plan to re-evaluate and increase to 12 in 2028 (include in password-reset rehash flow).
- bcryptjs is ~3x slower than the native bcrypt binding (node-bcrypt). If login latency becomes a bottleneck, switch to argon2 or node-bcrypt.

**Neutral:**
- bcrypt silently truncates passwords longer than 72 bytes. This is a known limitation documented in DELIVERY_NOTES.md.
