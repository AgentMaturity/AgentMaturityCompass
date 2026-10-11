# P1-08 receipt: key lifecycle

Environment: local macOS arm64 (Darwin 25.6.0), Node v22.23.0, pnpm 10.33.0. Not CI. Homebrew's Node 25.5.0 stopped loading mid-session (its libsimdjson.29 was replaced by version 34), so every run here used a separate Node 22 install. No Linux run was evaluated. Load average was 9 to 22 during the runs.

Branch `rtd/p1-08-key-lifecycle`, from `int` at `42dfa8375`. The checks were run at `186a0fe24` and the last full-suite run at `ff625ca4e`, after both rounds of the independent review. The receipt commit adds only this folder.

## What was checked

- Spec focused command (`npx vitest run tests/keys tests/leases/revocationListAtomic.test.ts tests/score/crossAgentTrustHmac.test.ts tests/crypto/keyHistoryAdmission.test.ts tests/crypto/keyHistoryForgery.test.ts`): 12 files, 141 tests passed.
- Rollback-attack tests (`rollback-attack-tests.txt`): tests/keys/antiRollback, tests/keys/workspaceWriter, tests/leases/revocationListAtomic, tests/trust/rootRotation and tests/trust/trustList, 77 tests passed. They cover:
  - replaying an older signed list;
  - deleting both files, and deleting the anchor;
  - a symlinked anchor;
  - a fork at an accepted sequence;
  - a trust list at sequence 6 after 7;
  - root-set replay, a fork, a threshold decrease and a cross-set replay;
  - a workspace-only writer restoring older keys under a rewritten `keyset.json`, swapping a public key, and restoring a pre-scrub key history after this machine's marks were lost;
  - round 2: restoring a v1 vault, or planting a legacy key pair, after deleting `keyset.json`; deleting `keyset.json` on a fresh machine; and the visible trust-on-first-use adoption.
- Checks (`checks.txt`), all exit 0: build, typecheck, typecheck:tests, lint, check:counts, check:docs-drift, check:freeze, check:architecture-boundaries, check:gates, check:schemas, check:api-ref, check:threat-model, check:duplicates, check:dead-code and check:deploy-pack. The D-15 snapshot check (`needs-snapshot.mjs int`) printed `none`.
- RED evidence (`red/`): each security fix's new tests were run against the commit before the fix, and they failed there. For the independent review, that is all 17 new tests on `ceba29da5` (`red/review.txt`), and all 9 round-2 tests on `9ac32a5ff` (`red/review2.txt`).
- Mutations (`mutations.txt`): every recorded mutation failed at least one test. This includes the spec's three, and one per review finding: 15 in the first round and 12 in the second, all killed in the end.
  - One self-audit mutation first survived because its test also lacked a manifest. The test now plants one, and the rerun failed the test.
  - One self-audit change was later reversed by review H1. The file notes it.
  - Round 2: two mutations first survived because an earlier guard masked them. A tightened test or mutation then failed; `mutations.txt` lists both runs.

## Full suite at `ff625ca4e` (`full-suite.txt`)

23,337 passed, 43 failed and 71 skipped, in 1,642 files. The load average was 11 to 16, and the run took 29 minutes.

- **Fail on the branch base `42dfa8375` too:**
  - jsonlWriterResume (19), fixed by the later P2-02 hotfix on `int`;
  - publicDocsGraph, publicDocsArtifact, privateModuleHelperVisibility, llmResponsesCapabilities, dataResidencyPersistence and compliance/evidenceBinding.
- **Known baseline:** studioNativeTaskService.
- **Caused by round 2, then fixed:** signedControlJournal (1). Its test re-created a vault after deleting the keys, which round 2 now refuses on purpose. The test now checks that refusal, and the journal's pin on a machine without the mark (`186a0fe24`).
- **Timeouts and throughput floors under load:**
  - sessionStoreConformance, releaseSecretScanCoverage, releaseEngineeringPack, sessionSpine performance, assuranceRunNoSign, the atomicRotation crash loop, signedArtifactVerificationParity, watch/continuousMonitor, nativeValidationOutcomeSurfaces and dogfoodMaturityEvidence;
  - each passed when rerun alone (releaseSecretScanCoverage timed out once more in a grouped rerun at load 16, then passed alone); no P1-08 change touches the release scanner.

Earlier full runs found three forgery tests that assumed a swapped key goes unnoticed. They were updated (see `docs/KEY_LIFECYCLE.md`). They also found a notary self-admission that hung an in-process notary; it is now marked and not logged.

Not evaluated: CI, a fresh clone, Helm on a cluster (only `helm template` and `helm lint` ran), a real rotation of the project's keys (P0-37 stays with Sid), and any KMS or HSM backend (P2-08).
