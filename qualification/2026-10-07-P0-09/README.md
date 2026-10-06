# P0-09 qualification receipt (PR 2 of 3)

P0-09 pins issuer keys in every verifier and treats an unanchored ledger as a failure. This receipt covers PR 2, branch `rtd/p0-09-verifier-wiring-a`, built on `9b905870` (main `e680f2a6` plus #51). PR 1 (#45) shipped the trust library; PR 3 will extend this folder with the remaining verifiers.

## What PR 2 changes

- `verifyEvidenceBundle`, `verifyCertificate`, `verifyRevocation`, `verifyPassportArtifactFile`, `verifyAssuranceCertificateFile`, `verifyTrustCertificateEnvelope` and `verifyReleaseBundle` take a required `TrustContext` and return a `VerifierReportV1` as `report`; `ok` equals `report.trusted`. Keys the artifact carries (and `--pubkey`) only locate the signer; `admitKey` decides.
- Bundles and certificates are anchored only when their monitor key is admitted for `ledger-row`; a revocation must come from the certificate's own issuer admitted for `revocation-list`; passport and assurance-certificate inclusion proofs must resolve to their signed `proofs/merkle.root.json`, whose signer must be admitted for `artifact-seal`.
- Step 9: `verifyLedgerIntegrity` gains `trust`; `amc verify`, `verify all`, `evidence verify`, `session verify` and `agent-loop verify` fail an unanchored ledger unless `--allow-unanchored` (exit 2).
- Step 10: flags on existing commands only (`check:freeze` still reports 1,228 command paths). Exit codes 0 trusted, 1 failed, 2 integrity-only under an allow flag with stderr starting `UNTRUSTED:`.
- Step 11: the bundle, certificate, revocation, assurance-certificate and passport API routes use `loadTrustContext()` over the server's AMC home, refuse bodies naming a pin or allow flag and return the report.
- Internal round trips (certificate issuance, `runBundleGate`, workspace passport and assurance self-checks, standard validation, unified inspection) use `workspaceSelfTrust`.

## Commit map

| Commit | Content |
|---|---|
| `d9d1ba55` | Failing tests first: `tests/trust/embeddedKeyForgery.test.ts`, `tests/ledgerTrustRootAnchorCli.test.ts`, `tests/helpers/trustContext.ts` |
| `6fdd5fbe` | D-15 snapshots of `src/studio/studioServer.ts`, `src/ci/gate.ts`, `src/passport/passportCli.ts`, `src/assurance/assuranceStore.ts` at 9b905870 |
| `4f97f679` | `src/trust/signatureCheck.ts`, `verdictExitCode`, `untrustedReasons`, `src/trust/requestTrust.ts` |
| `40a4213f` | Verifier wiring, ledger anchoring, CLI flags (`src/cli-trust-flags.ts`), API routes, internal round trips |
| `6b7e7bf5` | Distrust-beats-`--pubkey` CLI test; typing fix in the forgery suite |
| `d0dd7f24` | Existing tests pass operator trust instead of relying on embedded keys |
| `1df14293` | Packed-install, container and crash-recovery checks pin the monitor recorded at init; `release.yml` pins the release key |
| `426a9b18` | Docs, regenerated CLI inventory and API reference, breaking changeset |
| `08edda23` | Regenerated published count literals (two new test files) |
| `0f9e7f77` | This receipt, first version |
| `97aae439` | Review round: failing tests first (forgery suite, ledger CLI, passport public API, agent-loop verify, clean-source orchestration, CI template parity) |
| `cf6f4221` | Review round: monitor distrust, claimed signing times, assurance proof binding, assurance and passport API reports, verify all and ledger messages |
| `bd864ae6` | Review round: pinned bundle verify in the generated CI workflow; clean-source and platform qualification pin the monitor key |
| `f4018409` | Review round: docs and changeset |

## Failing before, passing after

`forgery-before.log` is the forgery suite and the `amc verify` CLI test, taken from `d9d1ba55`/`6b7e7bf5`, run in a worktree of `9b905870` with its own `dist/` build: 28 failed, 9 passed. Every forged bundle, certificate, revocation, passport, assurance certificate, trust certificate and release bundle printed a pass (exit 0); the passport with a fabricated proof root printed "Passport verified"; `amc verify` printed "Ledger verification PASSED" over the swapped monitor key. The 9 passes are cases that also fail closed on the old code for another reason (an unknown flag exits 1). `forgery-after.log` is the same two files on the receipt commit: 37 passed.

## Review round (confirmed findings on `0f9e7f77`)

| Finding | Fix | Regression test |
|---|---|---|
| A distrusted monitor key was anchored by `AMC_EXPECTED_MONITOR_FINGERPRINT` in bundle and `.amccert` verification (high) | `carriedLedgerAnchoring` anchors only when the carried monitor key is admitted | forgery suite, bundle and cert rows: "AMC_EXPECTED_MONITOR_FINGERPRINT does not anchor a distrusted monitor key" |
| `--allow-unanchored` turned a distrusted or revoked monitor key into exit 2 (two findings) | `verifyLedger` reports `trustRoot.monitorAdmission`; `ledgerExitCode`, `verify all` and the bundle and cert reports treat distrusted or revoked as a failure | forgery suite bundle row; `ledgerTrustRootAnchorCli` "fails a distrusted monitor key even when it is pinned and --allow-unanchored is used" |
| No verifier passed the claimed signing time to `admitKey` (step 6 item 3) | `checkSignature` forwards `claimedSignedAt`; each verifier passes its artifact's claim (see `docs/TRUST_LIST.md`) | forgery suite: "an issuer key superseded after it sealed the bundle is admitted on the claimed signing time" |
| Assurance-certificate proofs and roots were not bound to the signed cert | proof ids, `merkleRootSha256` and `transparencyRootSha256` must match `cert.proofBindings`, as for passports | forgery suite: splice of a later signed root into an untouched certificate |
| `POST /api/v1/assurance/cert/verify` only parsed the certificate | it runs `verifyAssuranceCertificateFile` with the server's trust and the request-trust refusal | forgery suite, API describe |
| No test proved the API routes refuse request-supplied pins | route tests for bundle, cert, revocation, assurance and Studio passport verify | forgery suite, API describe (mutation M10) |
| `GET /api/v1/passport/:id/verify` dropped the report and gave no reason | returns `report`, adds `ISSUER_NOT_ADMITTED` with the key id | `passportPublicApiAndCli` |
| `verify all` printed `<file>: ` for an unpinned release bundle | uses `untrustedReasons`; the inventory says release bundles there need a trust list | forgery suite release row |
| Run-report verify did not print the step-9 message; ledger refusals printed a 16-hex prefix | `renderVerifyReport` prints `LEDGER_UNANCHORED_MESSAGE`; both renderers print the full key id | `cliAgentLoopCommands`, `ledgerTrustRootAnchorCli` |
| An upper-case `--expect-monitor` gave a false "substituted key" error | `verifyLedger` lowercases the expected fingerprint, as the trust context does | `ledgerTrustRootAnchorCli` |
| Clean-source check and platform qualification called the verifiers unpinned (high) | both record the monitor fingerprint after `amc init` and pass it | `cleanSourceDocs` synthetic orchestration; `check:clean-source` |
| The workflow `amc ci init` writes ran an unpinned `bundle verify` | the step pins the auditor key and monitor fingerprint from repository variables | `auditEvidenceAccountingParity` (the only byte change from the archived original) |
| The assurance fixture re-implemented the issuer | it now comes from `runAssurance` plus `issueAssuranceCertificate`, with the evidence gates lowered in the signed policy | forgery suite assurance row |
| `TRUST_LIST.md` described claimed-time admission no wired command used | true once the claim is passed; the doc lists the claim each command checks | docs |

`review-before.log` runs the six changed test files on `0f9e7f77` (its own `dist/` build) with the new tests: 15 failed, 212 passed. `review-after.log` is the issue's focused set plus those six files on `f4018409`: 440 passed. `review-mutations.log` holds mutations M6 to M11, each with the tests it broke and a byte-identical restore.

## Mutation checks

`mutations.log` records each mutation, the tests it broke and the byte-identical restore (`git checkout` then `git diff --quiet`). `dist/` was rebuilt for every mutation, because the suites run the shipped CLI.

| Mutation | Failing tests |
|---|---|
| M1 `admitKey` admits the artifact's unpinned embedded key | 14 forgery-suite cases (every "forged copy" case in all seven rows) and 10 admission cases |
| M2 distrust never matches | the new "distrusted key pinned with --pubkey" CLI case, 8 admission cases, the built-in distrust case |
| M3 `amc verify` ignores `anchored` | 3 of 5 `ledgerTrustRootAnchorCli` cases (forgery unanchored, clean unpinned, `--allow-unanchored` exit 2) |
| M4 proofs not compared with the signed root | both fabricated-root cases, and the passport parity case for an added proof |
| M5 (extra) revocation issuer not compared with the certificate issuer | the "revocation signed by a different pinned key" case |
| M6 carried-ledger anchoring ignores the monitor admission | both env-pin distrust cases and the bundle `--allow-unanchored` distrust case |
| M7 `ledgerExitCode` ignores a refused monitor key | the `amc verify` distrusted-monitor case |
| M8 `checkSignature` drops the claimed signing time | the superseded-key case |
| M9 assurance `merkleRootSha256` binding removed | the spliced-root case |
| M10 `requestTrustOverride` never refuses | all five API refusal cases |
| M11 `verify all` reports `verify.errors` | the release key-to-pin case |

## Commands

`commands.tsv` lists every command run on the receipt commit with its exit code and duration; `receipt.json` repeats them. `affected-tests.txt` is the list of test files that call a changed verifier, command, route, script or doc (found with `git grep`), run as one vitest invocation. For the review round, `review-commands.tsv` and `review-affected-tests.txt` are the same on `f4018409`, including `check:packed-install` and `check:clean-source`. The full `npm test`, coverage, per-file floors, performance and the release gate are run by the orchestrator and are not part of this receipt.

## Open items

- PR 3: binder, audit packet README, bench (two verifiers and the `verifyBenchProofBundle` Merkle root), backup, plugin package, plugin registry client, prompt pack, federation, console label, `tests/trust/verifySurfaces.test.ts`.
- `release.yml` pins the public half of `AMC_RELEASE_SIGNING_KEY`, not a published fingerprint, until P0-37/P0-38.
- `scripts/amc-dogfood-8-agents.mjs` (`npm run qa:dogfood-8-agents`, not in CI) still calls `bundle verify` and `passport verify` without pins, so those steps now fail until it records and passes its workspaces' keys.
- Other docs still show unpinned verify examples (`docs/BUNDLES.md`, `docs/CERTIFICATION.md`, `docs/AGENT_PASSPORT.md`, `SECURITY.md` and others); the README, QUICKSTART and the trust docs are updated here.
- Release bundles and the ledger monitor key carry no signing claim, so they are admitted at verification time.
- The generated CI workflow needs the repository variables `AMC_AUDITOR_PUBKEY` and `AMC_MONITOR_FINGERPRINT`; existing generated workflows keep the old unpinned step until `amc ci init` is run again.
- PR 2 exceeds the contract's ~800 changed lines (about 1,240 excluding tests, generated docs and snapshots before the review round, which changed another 214 lines in `src/` and `scripts/`) because the wiring is one breaking change.
