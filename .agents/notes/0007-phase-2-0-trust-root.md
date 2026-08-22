# ADR-0007 — Phase 2.0: harden the trust root

Status: accepted · Date: 2026-08-22 · Supersedes nothing

## Context

P2.0 is the plan's prerequisite gate: every "signed & provable" claim in
Phases 2, 9 and 10 rests on the signing stack being sound. The plan listed nine
suspected weaknesses. Each was verified against the code before being acted on,
and two of the nine turned out to be already closed by earlier gap work.

## What was actually wrong

**Key history was built and never wired in** (commit `5bf774c5`). The chained
writer existed, but a second unchained writer in `vault.ts` ran first on every
`amc init`, so every workspace was entirely "legacy"; unchained entries were
accepted anywhere rather than only as a prefix; and nothing consulted the chain
during verification. All three closed.

**Blobs were encrypted with a constant in the source** (commit `3a7c4752`).
`amc-no-sign-fallback-key-32bytes!` protected every blob written without a
vault, and blob files travel: `exportEvidenceBundle` copies them into the
portable `.amcbundle`. Unvaulted workspaces now get a random per-workspace key
at 0600, stamped `keyVersion 0` so the weaker protection is visible in the
index. The constant is retained read-only.

**Notary admission was ordered before persistence.** `enableNotaryTrust`
admitted the pinned key into the auditor trust set before saving the config it
belonged to. There is no revocation path, so a failure in between widened the
trust set permanently for a notary that was never enabled.

**The vault's test passphrase keyed off NODE_ENV.** That variable is set by CI
images and application frameworks; `amc init` under it minted a workspace whose
private keys were recoverable from a passphrase published in the source. Now
gated on `VITEST`, which only the runner sets. No test depended on the old
branch.

**Delegation chains could not be traced.** The store was a process-local `Map`,
so both consumers ran in processes that had minted nothing.

**`zkPrivacy.ts` was not a zero-knowledge proof system.** Measured, not
inferred: `schnorrVerify` rejects 299 of 300 proofs from `schnorrProve`;
`verifyZKRangeProof` returns false for an honest in-range claim; the one
function named "verify" checked that two numbers were positive and two strings
non-empty. Verification then gated on a boolean the prover writes.

## Two items were already closed

Tar extraction already routes through `src/security/safeTarArchive.ts`
everywhere; the migration had left 17 dead stubs (`const out = { status: 0 }`
followed by an unreachable throw) that read as error handling, now removed.
`amc.config.yaml` is already signed and `ledger.ts` already rejects an
`isolated` trust-boundary claim on an unsigned config.

## One item was assessed and deliberately not "fixed"

`AMC_NO_SIGN=1` still writes the literal string `"unsigned"` into signature
columns. Verification never special-cases it — every row goes through
`verifyHexDigestAny` — so an unsigned ledger fails integrity verification
rather than passing it. The behaviour is fail-closed and the mode is disclosed
in both human and JSON output, so the emission was left as-is.

## Consequences

The ZK feature is now labelled as unsound rather than repaired. Making it real
needs a vetted library, which is a product decision, not one to take silently
here. Until it is taken, `amc vault zk-range-proof` prints a warning and the API
returns `zeroKnowledge: false`.

Receipt-chain persistence makes the command *capable* of succeeding; nothing in
production mints a chained receipt yet, so delegation tracing is not useful
until P2.2 wires the session model. The command says so rather than reporting an
empty store as a missing id.
