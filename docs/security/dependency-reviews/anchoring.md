# Dependency review: RFC 9162 tree and public anchoring (P1-26)

**Status:** no dependency added. Decision pending (needs Sid).

## What the code needs

An RFC 9162 Merkle tree with inclusion and consistency proofs, C2SP signed notes and checkpoints, a Rekor v2 `hashedrekord` client, and offline verification of a Rekor v2 reply (canonical entry body, inclusion proof, signed log checkpoint) plus the RFC 3161 token from P1-25.

## What this branch does instead

All of it runs on Node's built-in `crypto` and `http(s)`:

- `src/transparency/rfc9162.ts` (about 150 lines): RFC 9162 §2.1 with SHA-256. It reproduces the RFC 6962 roots and the leaf-0 audit path of the certificate-transparency test leaves, and matched a naive recursive tree for every size 1 to 64, every inclusion index and every consistency pair during development (a scratch cross-check; the unit tests and the transparency-dev/merkle vectors are owed while Sid has testing paused).
- `src/transparency/checkpointNote.ts`: C2SP signed notes (Ed25519 and ECDSA key IDs) and tlog checkpoints. It verifies the `example.com/foo` vector from c2sp.org/signed-note.
- `src/transparency/anchors/rekorV2.ts`: the request and reply shapes from sigstore/rekor-tiles (`api/proto/rekor/v2`, `pkg/types/hashedrekord`, `pkg/note`, `pkg/client/write`, `CLIENTS.md`), read on 8 Oct 2026. The HTTP transport is the P1-25 egress-checked client (`postToConfiguredUrl` in `src/time/tsaClient.ts`).

Trade-off: these are small, strict implementations of public specifications, not maintained libraries. They refuse rather than guess (strict schemas, canonical-JSON entry bodies, bounded inputs), but they have not had the scrutiny of `@sigstore/*` or transparency-dev code.

## Candidates (as recorded in the issue on 5 Oct 2026; not refreshed here because this branch makes no network calls to registries)

| Package | Version | Licence | Would cover | Notes |
|---|---|---|---|---|
| `@sigstore/verify` | 3.1.1 | Apache-2.0 | Sigstore bundle verification (`Verifier`, `toTrustMaterial`, `tlogThreshold`) | Verifies Sigstore bundles, not AMC checkpoint notes; its Rekor v2 support must be confirmed first. AMC would still need its own note and tree code. |
| `@sigstore/tuf` | (not recorded) | Apache-2.0 | Fetching and refreshing Sigstore's trusted root through TUF | Would automate the manual trust-list update in docs/PUBLIC_ANCHORING.md; it makes network calls, so it belongs in an operator command, not in verification. |
| `cose-js` | 0.9.0 | Apache-2.0 | COSE_Sign1 for SCITT | Last published Sep 2023. Not needed: the SCITT backend is deferred. |
| `cbor-x` | 1.6.6 | MIT | CBOR for a hand-written COSE_Sign1 verifier | Not needed until a SCITT service is chosen. |

Before adopting one, record for each: open advisories, transitive dependencies, install size, Node 20 support and maintainer activity, then pin the exact version and run `npm run audit:runtime` and `npm run check:third-party-notices`.

## Recommendation

Keep the built-in code for the tree, notes and the Rekor reply checks: they are short and specification-shaped, and an offline verifier with no dependencies is easier to audit. Consider `@sigstore/tuf` for an operator command that refreshes the pinned Rekor keys. Decide on CBOR/COSE only when a SCITT service is chosen.
