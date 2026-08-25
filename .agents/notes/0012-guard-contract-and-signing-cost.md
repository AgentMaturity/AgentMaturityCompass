# ADR-0012 — The P4.1 guard contract, and the signing cost it exposed

Status: accepted · Date: 2026-08-25 · Precedes P4.1 · Follows [ADR-0011](0011-firewall-deny-by-default.md)

## The question

P4.1 specifies guards as `ToolGuard = (execution) => string | undefined` —
synchronous, side-effect-free, with no `allow` inhabitant so that ordering is
irrelevant by construction. `evaluateRuntimeFirewall` looked like neither:
it resolves paths, loads and verifies a signed policy, reads control state,
and writes a signed decision record.

Either the contract had to bend, or the firewall had to be pre-resolved into a
pure snapshot before the guard fold.

## What measurement showed

**Synchronous: already true.** There is no `async` or `await` anywhere in
`src/runtime/firewall.ts` (1,640 lines). `evaluateRuntimeFirewall` returns a
`RuntimeFirewallDecision`, not a promise. That half of the contract needed
nothing.

**Side effects: real, but already separated.** Recording is gated on
`input.record !== false`. Deciding and recording are two different operations
behind one function, and the caller picks.

So the contract holds unchanged, with one rule: **the guard calls
`evaluateRuntimeFirewall` with `record: false`, and the pipeline records the
decision that actually determined the outcome, once, outside the fold.** No
pre-resolution layer, no async guards, no bending.

## The cost that made this worth measuring rather than assuming

ADR-0011 made the unconfigured case produce a match (`firewall-policy-missing`).
`shouldRecord` is `... || matches.length > 0`. Deny-by-default therefore flipped
recording from off to on-for-every-call in exactly the workspaces that had
configured nothing — about to be true on the tool-execution hot path.

Measured, 200 calls per configuration, before any fix:

| configuration                     | per call | throughput |
|-----------------------------------|---------:|-----------:|
| unconfigured, `record: false`     |  0.29 ms |  3,400/s   |
| unconfigured, `record: true`      | 51.91 ms |     19/s   |
| signed policy, `record: false`    |  0.96 ms |  1,046/s   |
| signed policy, `record: true`     | 53.12 ms |     19/s   |

19 tool calls per second is not a guard, it is a stall. Profiling it:

| operation                          | cost      |
|------------------------------------|----------:|
| `evaluateRuntimeFirewall(record)`  | 50.35 ms  |
| `trySignArtifactFile`              | 24.88 ms  |
| ↳ `ensureSigningKeys`              | 24.14 ms  |
| ↳ `signDigestWithPolicy` (Ed25519) |  0.51 ms  |
| `writeFileAtomic`                  |  0.16 ms  |
| `getPrivateKeyPem` (cached)        |  0.001 ms |

The cryptography was never the cost. `ensureSigningKeys` →
`ensureVaultAndPublicKeys` → `unlockVault` re-ran the passphrase KDF on every
call, while the vault session it was unlocking was **already unlocked in
memory** — which is exactly why reading a private key out of that same session
measures a microsecond.

## Two fixes

**1. `unlockVault` short-circuits when nothing has changed.** The session now
carries a digest of the envelope it was opened from. Unlocking is skipped only
when the passphrase *and* that digest both still match.

Keying it on the passphrase alone would have been faster and wrong: a vault
replaced underneath a live process would keep serving the old keys forever.
`tests/vaultUnlockCaching.test.ts` pins that — a vault file overwritten with a
different one is refused, a wrong passphrase is still rejected while unlocked,
and a `setVaultSecret` rewrite is picked up on the next unlock. `createVault`,
the only writer of the envelope, invalidates the cached digest.

This is not firewall-specific. Every signed artifact in AMC paid this.

**2. The firewall signed each decision twice.** It wrote the record, signed it,
embedded the resulting `signaturePath` into the record — invalidating that
signature by changing the bytes — wrote it again, and signed again. The first
signature was discarded in every case, and the `.sig` path it computed is
deterministic (`${path}.sig`). Now: embed the path, write once, sign once. The
bytes on disk and the signature over them are identical to before. When signing
fails the record is rewritten without the claim, so a decision never advertises
a signature that does not exist.

Measured after both:

| configuration                  | before   | after   | change |
|--------------------------------|---------:|--------:|-------:|
| unconfigured, `record: true`   | 51.91 ms | 3.86 ms | 13.4x  |
| signed policy, `record: true`  | 53.12 ms | 4.60 ms | 11.5x  |
| signed policy, `record: false` |  0.96 ms | 0.96 ms |  —     |

## What is still true and unfixed

`record: false` on a configured workspace costs ~0.96 ms — a policy file read
plus a signature verification, per call. Caching the resolved policy per
pipeline would remove most of it. That is an optimisation, not a correctness
requirement, and it is not needed for P4.1 to be built correctly.
