# P0-47 current-main parity baseline diagnosis — 14 October 2026

The baseline has 62 failures in 4 suites; none is a timeout. All 8 relevant production files are byte-identical on main 5ea, preserved P0-33 candidate 7d5d8335 and Claude 990cb586. The failures are inherited parity integration debt.

| Suite | Failures | Owner | Root cause and bounded existing repair |
| --- | ---: | --- | --- |
| archiveFilesParity.test.ts | 1 | P1-16 | P1-16 changed binderArtifact under an existing whole-source freeze without registering its D-15 snapshot on main. The preserved follow-up archives exact pre-P1-16 base bytes; no assertion/body change is needed. Import only the already-authored historical archive plus its single manifest row; preserve current binder production behavior and original parity assertion. |
| privateModuleHelperVisibility.test.ts | 1 | P2-01 | Its heldContractSources pins spillStore to de1469cf, while accepted-main live source is1351dd56 after P2-01 legal-hold changes. Main lacks the preserved D-15 entry. Import only the exact e89f48428 historical .landed file and row; keep the expected held-contract hash and live deletion/legal-hold source unchanged. |
| explainabilityContractParity.test.ts | 28 | P1-07 | Main repairHintFor now returns a Not evaluated target/reason when the next level is unmeasurable (P1-07). The historical harness compiles the old advice unchanged and compares full JSON; repairHint-derived rowHash/manifestHash/packHash then legitimately diverge. Reuse the two literal recorded forward edits and full strengthened harness; keep full JSON parity, exact original hashes, once-only text guards, delta restriction to repairHint/rowHash/manifestHash and tests retaining archived advice at evaluable levels. |
| signedArtifactVerificationParity.test.ts | 32 | P1-26 (compatibility); P0-09 (strict live trust contract) | P1-26 makes proof algorithm and size come from carried signed-root state. Archived verifiers pass merkleRoot:null into the actual live proof checker; without a root the checker uses amc-legacy-v1 and refuses new rfc9162-sha256 proof fixtures. Main current verifiers pass signed roots through P0-09 admission, producing true-vs-false and error-array parity differences. Reuse archived-verifier forward compatibility adapters and strengthened harness as one unit with its map. Preserve full original result-field equality, actual live current verifier and proof checker, P0-09 signature/root/pin validation, original .original files, unedited-archive refusal test, and wrong-algorithm negative proof. |

## Reuse boundary

Six file bodies can be reused from preserved authored work, plus a merge of only two D-15 manifest rows:

- `tests/explainabilityContractParity.test.ts`
- `tests/signedArtifactVerificationParity.test.ts`
- `unused-code/2026-10-02-native/explainability-contracts/restoration.json`
- `unused-code/2026-10-02-native/signed-artifacts/restoration-map.json`
- `unused-code/plan-edits/P1-16/src/audit/binderArtifact.ts.landed`
- `unused-code/plan-edits/P2-01/src/session/spill/spillStore.ts.landed`

Both added archives equal the exact blobs at real accepted-main ancestor bases. The spill archive retains the expected de1469cf hash. Preserve every original .original file and existing expectation. Never overlay the full candidate manifest or production checkout.

The P1-07 forward changes match exactly once in both archived and current text. P1-26 changes are scoped compatibility adapters on archived verifiers; the recorded def0955fa commit changes the proof-checker/tree contract, not literal binder/passport verifier source. Current P0-09 verifiers still validate signed root digest, pinned issuer admission and root binding. The preserved harness adds unedited-archive refusal and wrong-tree refusal cases and keeps exact parity for all other original fields.

## Execution evidence and honest limits

The preserved P0-33 report records these four affected suites passing: archiveFilesParity 50, explainability 42, privateModuleHelperVisibility 229, signedArtifactVerification 61 assertions, each with 0 failed and 0 pending. Its overall run was 24335 total, 24324 passed, 11 failed; P0-33’s receipt remains Blocked. These are prior scoped passing results, not a green release or proof that current main passes. Rerun the current-main parity corpus after any bounded transplant.

Current failing report: `/private/tmp/p0-47-current-parity-20261014.json` (SHA-256 `edf01d678127d5d80a12b9b27d7496c6b3bfbbd896a2e8c10d4191c1415593fd`). Main: `5ea5e866a42acd5c8228a712e9b8c1d9f18c745c`. Candidate: `7d5d8335bf973900fb9a9d9d331471b1b366ef8b`. Claude: `990cb586fb481bb7db75977a4e5d332c6fd1ddb4`.

Full 62 failure inventory, version comparisons, exact snapshots, forward metadata and source evidence: `/private/tmp/p0-47-parity-baseline-diagnosis-20261014.json`.

This reviewer ran no tests/builds and changed no repository or preserved checkout. The separate dist ancestry guard is outside these 62 failures.

## Final seven-path review boundary

The six listed file bodies have exact SHA-256 values in the JSON and match both preserved candidates; the seventh touched path is `unused-code/plan-edits/manifest.json`, limited to the two verified rows. No production overlay or whole-manifest replacement is reviewed.

P1-26 changes are archived verifier compatibility adapters, not literal current verifier edits. The added cases retain explicit unedited-archive refusal with no carried root and current wrong-tree refusal. All original tamper, privacy, checksum, missing-proof, proof-order, revocation and expiry cases remain. Current signed-root digest, signature, issuer admission and root binding still execute on live unchanged code.

No authoritative exact active reservation for these paths was available in the inspected current handoff/Claude files. Clean committed Claude work is not reservation clearance. Copying the reviewed authored slice into the root’s own isolated worktree must preserve original branches, archives and author/commit provenance; it must not resume or modify another session.
