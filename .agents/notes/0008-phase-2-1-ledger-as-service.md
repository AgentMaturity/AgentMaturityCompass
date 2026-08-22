# ADR-0008 — Phase 2.1: the ledger and crypto as composed services

Status: accepted · Date: 2026-08-22 · Follows ADR-0007

## Context

P2.1 has four parts: sever the config-governance coupling from evidence-chain
verification, expose the evidence spine as Cordis services, decompose
`ledger.ts`, and consolidate the databases that sit outside `evidence.sqlite`.
ADR-2's strangler rule governs all of them — wrap before decomposing, and never
a one-way migration.

## Verification reports two claims, not one

`verifyLedgerIntegrity` checked the evidence chain and the configuration
signatures into a single error list. An edited gateway config therefore
surfaced as "Ledger verification FAILED", indistinguishable from a rewritten
event. One is an operational problem and the other is a breach; reporting them
identically devalues the alarm that matters.

`VerifyResult` now carries `chain` and `governance` alongside the conjoined
`ok`/`errors`, which keep their exact previous meaning. No caller silently gets
a weaker answer, and every caller can now tell the two apart. The test drives
both directions: an edited gateway signature fails governance while `chain.ok`
stays true, and a rewritten evidence event fails `chain.ok`. Without that second
case the first would pass merely because `chain.ok` were never false.

## The services are facades, deliberately

`ctx.amcLedger`, `ctx.amcCrypto`, `ctx.amcReceipts` and `ctx.amcBlobs` delegate
to the existing implementations with the same open/close handle lifetime the
direct callers already use. The ledger service does *not* hold a connection
across calls: pooling belongs with the consolidation below, and changing
connection lifetime here would prejudge a staged decision.

What the wrap buys is not convenience. A consumer declaring
`inject: ["amcLedger"]` stays PENDING when no ledger is provided, rather than
importing a module that is always present whether or not it should be. That is
what makes evidence capture replaceable.

Writing the test surfaced that `append` is not usable alone — an event whose
session was never opened fails verification with "references missing session",
and an unsealed session fails with "missing seal" — so the service exposes
`startSession` and `sealSession` rather than handing a consumer a ledger it
could fill with evidence that never verifies.

## Decomposition: 2,423 → 1,349 lines

Verification moved to `ledgerVerification.ts` and the schema and migrations to
`ledgerSchema.ts`. Existing importers keep their paths via re-exports: the split
is about where the code lives and what it reports, not about churning call
sites. Both ratchet baselines were lowered so the improvement is locked in
rather than left as headroom.

## Consolidation is staged because it must be reversible

`guard_events.sqlite` is the first of nine. Being outside `evidence.sqlite` is
why retention could not reach it — every ops engine opens a workspace through
`openLedger()` — and it reached 97,045 rows in this repository's own workspace.

DUAL_WRITE is the default and CUTOVER is opt-in, because a consolidation that
flips on upgrade is a one-way migration wearing a staged migration's clothes. In
DUAL_WRITE the legacy file stays authoritative for reads, so the stage cannot
change any answer. Cutover redirects the emitter's own connection to
`evidence.sqlite`, so readers, the chain verifier and the retention prune follow
without knowing about the move, and the legacy file is left untouched and
complete — reverting is a setting change, not a restore.

The consolidated write cannot throw. The emitter it sits in is on the guard
decision path and documents that it never throws; a consolidation that could
take down enforcement would be a worse failure than the duplication it removes.

## Open

The backfill on any real workspace is the operator's call — it is additive and
idempotent, but it is their evidence store. The other eight stores
(`corrections`, `score_sessions`, `score_history`, `prompt_modules`,
`scratchpad`, `integration-delivery`, `amc_product_queues`, and the
`guard_events` variants) follow the same three-stage path.
