<!-- SPDX-License-Identifier: MIT -->
# 8. Scoped attestations

Status: normative. Record: `https://agentmaturity.co/spec/schemas/v2/scoped-attestation.schema.json`. The v1 record
(`https://agentmaturity.co/spec/schemas/v1/scoped-attestation.schema.json`) names no tenant, subject or sequence, and a
verifier MUST refuse it as `UNSUPPORTED_VERSION`.

## What an attestation says

A scoped attestation is one sentence with fixed slots:

"Snapshot S in deployment D met profile P, version V, during window W, excluding E."

1. An attestation MUST name exactly one tenant, workspace, subject, deployment snapshot, profile and version, and one
   window. It MUST list its exclusions; a control result it excludes is not covered.
2. Its result MUST be the conjunction of the control results it covers (chapter 5). A declared `fail`, or a `pass`
   that is `synthetic_example` or whose review is `rejected` or `expired`, fails it. A `not_evaluated` result or a
   `self_reported` pass leaves it not evaluated.
3. An attestation MUST be signed by a key a pinned trust list admits for purpose `independent-attestation`. A
   workspace's own keys MUST NOT be admitted for that purpose.
4. Only a registry-issued attestation (P3-04, after Gate G3) MAY use the word "certified", and only within its own
   scope.

## Expiry

1. Every attestation MUST carry `expiresAt`, later than `issuedAt`, which is no earlier than the window's end.
2. A verifier MUST treat an attestation as covering nothing at or after `expiresAt`, and MUST refuse one whose
   `sequence` is below the highest it knows for the same subject.

## Offline verification

A verifier without network access MAY judge an attestation offline against the trust lists and revocation lists it
holds. Its result MUST then say "valid as of T", where T is the newest of those lists' issue times, never "valid". A
revocation issued after T is unknown to it, and the result says so.

Signed bytes, scope, freshness and completeness checks are in [`spec/ACCEPTANCE_RULES.md`](../ACCEPTANCE_RULES.md),
section "scoped-attestation v2".
