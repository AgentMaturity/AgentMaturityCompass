# Dependency review: in-toto attestations and the AIBOM (P1-27)

**Status:** no dependency added. Decision pending (needs Sid).

P1-27 asks for Sid's approval before any package is added. This branch therefore adds no package and makes no network call. What each candidate would cover, and what the branch does instead, is below.

## What the code needs

- Sign an in-toto Statement v1 in a DSSE envelope and wrap it in a Sigstore bundle, key-based by default, with keyless signing (Fulcio, Rekor, optionally a TSA) as an option.
- Emit a CycloneDX 1.6 (or 1.7) AI bill of materials and validate it against the CycloneDX JSON schema.
- Verify a key-based bundle offline.

## What this branch does instead

- **DSSE and the Sigstore bundle:** about 60 lines on Node's built-in `crypto` (`src/attest/dsse.ts`, `src/attest/sigstoreBundle.ts`). DSSE v1.0 is small: the pre-authentication encoding is one concatenation, and the signature is Ed25519 over it. The key-based bundle is the JSON form that `@sigstore/bundle` emits for a bundle without a certificate: media type `application/vnd.dev.sigstore.bundle.v0.3+json`, a public-key hint, no log entries and no timestamps. `src/attest/sigstoreBundle.ts` also exposes `sigstoreSigner`, which implements `@sigstore/sign`'s `Signer` interface over an AMC key.
- **Keyless signing:** an opt-in seam (`loadSigstoreKeyless`, `signStatementKeyless`). It loads `@sigstore/sign` and `@sigstore/bundle` only when called. Without them it refuses with a message that names this review. Tests use a mocked backend and never contact Sigstore. The keyless path is **not exercised**, and `amc bundle export` does not offer it yet.
- **CycloneDX:** the AIBOM is written by hand (`src/aibom/aibom.ts`), as `src/release/releaseSbom.ts` already does for the npm SBOM. `tests/aibom/aibom.test.ts` checks the structural rules the AIBOM relies on: format, spec version, component types, unique `bom-ref`s, a dependency graph that resolves, and SHA-256 hashes. It does **not** validate against the official CycloneDX JSON schema, because the schema is not vendored and this branch downloads nothing.

Trade-off: the hand-written DSSE code is small and covered by the DSSE protocol's worked example and by sign, verify and tamper tests. Without the CycloneDX library, a field outside the checked rules could be schema-invalid and go unnoticed.

## Candidates

The npm data below was recorded in the issue on 5 Oct 2026. The local column was read from the copies bundled inside npm 11.10.1 on this machine (offline; not a project dependency).

| Package | Issue (5 Oct 2026) | Local copy read offline | Licence | Runtime dependencies (local copy) | Node engines (local copy) |
|---|---|---|---|---|---|
| `@sigstore/sign` | 4.1.1 | 4.1.0 | Apache-2.0 | `@sigstore/bundle`, `@sigstore/core`, `@sigstore/protobuf-specs`, `make-fetch-happen`, `proc-log`, `promise-retry` | `^20.17.0` or `>=22.9.0` |
| `@sigstore/bundle` | named | 4.0.0 | Apache-2.0 | `@sigstore/protobuf-specs` | `^20.17.0` or `>=22.9.0` |
| `@sigstore/verify` (tests only) | named in the issue's tests | 3.1.0 | Apache-2.0 | `@sigstore/protobuf-specs`, `@sigstore/bundle`, `@sigstore/core` | `^20.17.0` or `>=22.9.0` |
| `@cyclonedx/cyclonedx-library` | 10.3.0, specs up to 1.7, `machine-learning-model` | not available offline | Apache-2.0 (issue) | JSON validation needs the peers `ajv`, `ajv-formats` and `ajv-formats-draft2019` | not checked |

Notes:

- AMC already declares `engines.node >=20`. The Sigstore packages need Node 20.17 or later, so adopting them raises AMC's floor from 20.0 to 20.17.
- `ajv` 8.18.0 is already a devDependency, and `ajv-formats` is already installed through another package. A schema-only check needs `ajv-formats-draft2019` and the CycloneDX schema files.
- `@sigstore/sign` pulls in `make-fetch-happen`, an HTTP client. It is only needed for keyless signing, so it can stay an optional dependency loaded on demand. That is how the seam is written.

Before adopting any of these, record for each: open advisories, the full transitive tree, install size and maintainer activity. Then pin the exact version and run `npm run audit:runtime` and `npm run check:third-party-notices`.

## Offline cross-check (evidence, not a dependency)

`qualification/2026-10-12-P1-27/` records a run of the npm-bundled `@sigstore/sign` 4.1.0, `@sigstore/bundle` 4.0.0 and `@sigstore/verify` 3.1.0 against a fixture workspace's attestation:

- `DSSEBundleBuilder` with `sigstoreSigner` and no witnesses produces the same bundle JSON as `toSigstoreBundle`.
- `@sigstore/verify` checks the DSSE signature offline with the public key alone.

No network was used. Those copies belong to the npm installation and are not a project dependency.

## Recommendation

- Keep the built-in DSSE and key-based bundle code.
- If keyless signing is wanted, approve `@sigstore/sign` and `@sigstore/bundle` as **optional** dependencies, loaded only by `loadSigstoreKeyless`.
- For the AIBOM, approve `@cyclonedx/cyclonedx-library` with its `ajv` peers as **devDependencies** for schema validation in tests, and keep the hand-written emitter.
- Add `@sigstore/verify` as a devDependency only if the in-suite offline check is wanted. The qualification run covers it today.
