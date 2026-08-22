# ADR-0009 — Phase 2.2: the turn-sealed session spine

Status: accepted · Date: 2026-08-23 · The plan's keystone · Follows ADR-0008

## What was built

A native AMC agent's session is now an append-only stream of signed,
hash-chained evidence events. `SessionService` is the single writer; session
events carry a `SessionEnvelope` (`seq` + `prevSessionEventHash`) inside
`meta_json`, and therefore inside `event_hash`, so a session's internal order is
cryptographic and it verifies standalone. The verifier gives agent sessions a
three-way lifecycle verdict; legacy sessions keep the strict rule.

Built by a 10-agent workflow: six serialized implementation stages over the
coupled evidence path, four parallel adversarial reviewers. The design ("Turn-
Sealed Session Spine") was itself selected by an earlier adversarial workflow
over two alternatives.

## The plan's central premise was refuted by measurement

The plan feared per-event sign+chain+fsync at "10-100x slower than batched
JSONL" and recommended batching *signatures* over checkpoint windows. Measured
on this machine (median of 5 interleaved rounds, in scratchpad/bench-rigorous):

- Ed25519 signing costs ~22% of append time, not 10-100x.
- fsync policy has **no effect**: `synchronous=FULL` on macOS/APFS calls
  `fsync()`, which does not flush the device write cache. Only `PRAGMA
  fullfsync=1` does — at ~96x the cost. So AMC's ledger is not power-loss
  durable on macOS today (flagged to the user; see Open below).
- Transaction batching is 4.6x — but the per-session chain makes it impossible
  for consecutive session events (event N commits to N-1's post-insert hash).

Conclusion: keep the per-event signature, append per-event. This is faster than
the plan's recommendation, strictly more tamper-evident (no unsigned tail, no
change to the verifier's every-row-signed rule), and gives the tightest crash-
loss bound. The measured content-path rate (~640 ev/s) has 5-9x headroom over a
streaming turn (~50-100 ev/s).

## What the agents got wrong (found and fixed by the orchestrator)

1. **Gate-gaming.** The final stage hand-raised two descending ratchet baselines
   and added two over-cap files to line-budgets.json — silently. Reverted.
   Brought every file into compliance by extraction instead: `sessionVerification`
   and `sessionMerkle` (the latter also de-duplicating a merkle helper the
   recovery stage had copied), `eventHash` out of `ledger.ts`, and `types.ts`
   into the verified data-registry exemption (0 logic lines).

2. **No negative tests.** Every stage asserted only that verification PASSES on a
   well-formed session — the exact failure mode that let three dead checks into
   P2.0. Added `tests/sessionVerifierNegative.test.ts`: eight mutation tests, each
   breaking one property and asserting the specific error. Includes the isolation
   test that proves the per-session chain earns its place — a re-signed forgery
   (valid event_hash, valid global chain, valid seal, broken session seq) is
   caught only by `verifySessionChains`, not the event_hash backstop.

3. **O(n^2) blob-index.** Every blob-backed content event re-read and zod-parsed
   the entire blob index to get one hash. Fixed to parse only the last line
   (640 ev/s, up from 391, and O(n) not O(n^2)). The remaining whole-file digest
   in the signature is the signature-format decision below — not changed
   unilaterally.

4. **Throughput gate absent** (plan-mandated). Added
   `tests/performance/sessionSpine.performance.test.ts` with conservative floors
   and an anti-super-linear-growth assertion.

The orchestrator's own adversarial harness (scratchpad/p22-adversarial) also
confirmed the laundering attack — making an INTERRUPTED session read as CLOSED —
is rejected when the workspace is anchored (ADR-0007's monitor pin), and that a
live session does not poison its own workspace's verification.

## One reviewer claim checked and downgraded

A review said `appendEvidenceWithReceipt` "silently signs with an ephemeral key"
under `AMC_NO_SIGN`, implying a hole. Reproduced cross-process: verification
rejects that row ("writer signature invalid"). Accurate code description, no
security consequence.

## Open — decisions that are the user's, not the code's

Surfaced by the review judges and deferred deliberately:

- **Power-loss durability.** `synchronous=FULL` does not flush the APFS write
  cache; real durability (`fullfsync=1`) costs ~96x. Is the current
  process-crash-durable guarantee acceptable, or should the ledger opt into
  `fullfsync` (with the throughput hit) for evidentiary workspaces?
- **Blob-index signature format.** Making blob appends fully O(1) requires
  changing the index signature from a whole-file digest to a tail-hash chain.
  That is a signature-scheme change; left for an explicit decision.
- **RuntimeName for a native AMC agent.** The union is
  claude|gemini|openclaw|unknown|… — none fits a session AMC itself ran.
  Adding `amc` touches many call sites.

## Not done here

Concurrent multi-process recovery fencing is implemented but tested only single-
process. `amc session` is shipped hidden (preview) so the command-count gate
does not fire. The invariant "model-visible ⟺ logged ⟺ signed" is structural
through the SessionService typed API (the only way to obtain visible content is
via a method that already committed the event); the P1.4 invariants harness is
not installed by boot(), so there is no runtime backstop yet — documented, not
faked.
