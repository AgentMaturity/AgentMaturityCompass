# ADR-0010 — Phase 2.3 + 2.4: persistence seam and Merkle anchoring

Status: accepted · Date: 2026-08-24 · Completes Phase 2 · Follows ADR-0009

## What was built

**P2.3.** One `SessionEventStore` contract with two backends (SQLite, JSONL)
behind a shared conformance suite; a projection registry (pure folds, `Object.is`
gating, `stateVersion` invalidation); and spill for oversized tool output.

**P2.4.** The transparency Merkle index became incremental and fail-loud, and
session roots now anchor into the transparency log with inclusion proofs that
verify offline.

Built by an 11-agent workflow as two parallel workstreams with declared-disjoint
file ownership. The boundary held — no collisions, and `line-budgets.json` was
not touched (the gaming caught in P2.2 did not recur).

## The false green

The most serious defect found, and the reason review mattered more than tests
passing: `amc verify` returned `chain.ok = true` with **zero errors** on a JSONL
workspace whose evidence had been openly rewritten. `verifyLedgerIntegrity`
reads the `evidence_events` table; on a JSONL workspace that table is empty, and
finding nothing wrong was reported as success.

This is the same failure shape as three earlier findings this phase — a verifier
reporting a verdict about evidence it cannot see. Fixed by routing JSONL rows
through the backend-independent verifier; pinned by a regression test that
drives the tamper in both directions.

Governing rule, now stated: **a verifier that cannot see the evidence must never
call it verified.** Absence is not a pass.

## Claims verified rather than accepted

- **JSONL is genuinely signed** (AMC's differentiator over dsh, whose logs are
  unsigned). Not taken from the comment: a tampered line is rejected with
  "payload hash mismatch". Same `canonicalMetadataForHash` pre-image as SQLite.
- **Incremental Merkle root == full rebuild root** at 1..6 leaves, odd counts
  included. Compared implementations directly rather than reading the code,
  because odd-node handling is where Merkle code breaks.
- **The offline proof is really offline.** Anchored a session, exported the
  proof, deleted the workspace, verified from a bare directory.
- **Projection cache cannot return a wrong value** across a stateVersion bump.
  A reviewer rated this HIGH; I constructed the specific attack (a second fold
  registering at a taken key) and the isolation holds. Finding DOWNGRADED.

## Fixed from review

- Merkle verification now cross-checks the signed row's `leafCount` and
  `lastEntryHash` against the log. The tree duplicates a lone final node
  (Bitcoin-style), so a root alone is ambiguous between n and n+1 leaves;
  binding both claims closes it.
- Proof issuance is gated on the transparency **log's** chain, not only the
  Merkle index — otherwise a bundle could verify offline while the log it came
  from does not.
- **P2.4 had no production caller.** anchor / export / verify-proof existed with
  zero non-test callers and no CLI, so "sessions are externally verifiable" was
  true of the library and of nobody's workflow. A guarantee nobody can invoke is
  not a guarantee. Added `amc session anchor|proof|verify-proof` (hidden preview,
  so the command-count gate does not fire).
- Added the missing negative tests, notably the forged-root-signature case —
  mutation-checked, so deleting the signature check turns the file red. Without
  it the offline proof was a self-consistent document proving nothing.

## Known, not fixed

- **Spill writes plaintext** protected only by file mode, while the evidence
  blob path it diverts from supports policy-gated encryption at rest. A
  confidentiality downgrade relative to the configured ops policy.
- **Spill is invisible to lifecycle machinery.** Nothing outside
  `src/session/spill/` knows `.amc/spill/` exists, so retention, DSAR, export
  and backup do not reach it.
- **A spill write can precede its signed commitment.** The object lands on disk
  before the caller appends `tool/result`; if that append throws, content sits
  at rest with no signed commitment.
- Concurrent multi-process recovery fencing remains tested single-process only.

These are real and should be closed before spill carries regulated content.
They are recorded rather than quietly shipped.

## Phase 2 is complete

P2.0 trust root · P2.1 services + decomposition · P2.2 session spine ·
P2.3 persistence · P2.4 anchoring. Next is Phase 3, starting with P3.0
(credentials seam) — the plan's stated prerequisite for the LLM adapters in P3.1.
