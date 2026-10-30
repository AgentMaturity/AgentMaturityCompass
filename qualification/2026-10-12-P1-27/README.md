# P1-27 qualification: in-toto attestations bound to a CycloneDX AIBOM

Environment: local macOS arm64 (Darwin 25.6.0), Node 25.5.0, pnpm 10.33.0. Not CI. No network was used.

## What was checked

1. **Fixture workspace, end to end.** A fresh isolated workspace was initialised. Its default agent declared one TEST ONLY model, `fixture-model-1`, in the signed adapters configuration. A diagnostic run was exported with `node dist/cli.js bundle export --run <id> --out run.amcbundle --attest` (`bundle-export.txt`). The run is `self_reported` and `not_evaluated`, because a fresh workspace has no evidence events. `amc bundle verify` with the auditor key and the monitor fingerprint pinned passes (`bundle-verify.txt`), so the signed manifest covers both attestation files.
2. **Samples.** `sample-aibom.cdx.json` and `sample-control-results.sigstore.json` are the two files the bundle carried. They were signed by a throwaway workspace key that nobody pins.
3. **P1-06's standalone verifier.** `trust-list.json` pins that workspace's artifact-seal key and is signed by a throwaway TEST ONLY root (no private key kept).
   - `amc-verify-valid.json`, exit 3: integrity, issuer, scope (subject `default`), freshness and completeness pass. Satisfaction is `NOT_RECOMPUTABLE`.
   - `amc-verify-tampered-aibom.json`, exit 1: one byte of the AIBOM was changed, completeness fails with `EVIDENCE_MISSING`, and no supplied bytes match the AIBOM subject.
4. **Normative fixtures.** `conformance-results.json`: `amc-verify` passes all 61 cases in `spec/fixtures/v1`, including the six `dsse-*` cases.
5. **Offline Sigstore cross-check** (`sigstore-crosscheck.json`). These used the copies of `@sigstore/sign` 4.1.0, `@sigstore/bundle` 4.0.0 and `@sigstore/verify` 3.1.0 bundled inside npm 11.10.1, which are not project dependencies.
   - `DSSEBundleBuilder` with AMC's `sigstoreSigner` and no witnesses produced exactly the bundle JSON AMC writes.
   - `@sigstore/verify`, with the public key and thresholds 0, verified the bundle and refused it after one payload byte changed.
6. **Mutation checks** (`mutations.json`). 11 guards were broken one at a time, and each was caught by a test or a conformance case:
   - signing the raw payload instead of the PAE;
   - a PAE without lengths;
   - skipping the subject comparison, in AMC and in the verifier;
   - allowing synthetic evidence;
   - allowing `independently_reviewed` without the key;
   - taking AIBOM facts from unverified files;
   - skipping the payload-type check;
   - checking the signature over the raw payload;
   - ignoring expiry;
   - admitting every statement for artifact-seal.

## Not exercised

- Keyless signing (Fulcio, Rekor, TSA). It is an opt-in seam, tested with a mock only.
- CycloneDX JSON schema validation. The schema is not vendored; see `docs/security/dependency-reviews/attestations.md`.

## Reproduce

Build the branch. Then run the focused tests:

```bash
npx vitest run tests/attest tests/aibom tests/verifier
node packages/verifier/conformance/run.mjs --cmd "node packages/verifier/bin/amc-verify.mjs"
```

The fixture workspace steps are the commands in `receipt.json`.
