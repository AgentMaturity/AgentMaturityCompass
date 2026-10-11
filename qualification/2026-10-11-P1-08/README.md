# P1-08 receipt: key lifecycle

Environment: local macOS arm64 (Darwin 25.6.0), Node v22.23.0, pnpm 10.33.0. Not CI. Homebrew's Node 25.5.0 stopped loading mid-session (its libsimdjson.29 was replaced by version 34), so every run here used a separate Node 22 install. No Linux run was evaluated. Load average was 9 to 22 during the runs.

Branch `rtd/p1-08-key-lifecycle`, from `int` at `42dfa8375`. The full-suite run was at `11e9fb9e5`. The receipt commit adds only this folder.

## What was checked

- Spec focused command (`npx vitest run tests/keys tests/leases/revocationListAtomic.test.ts tests/score/crossAgentTrustHmac.test.ts tests/crypto/keyHistoryAdmission.test.ts tests/crypto/keyHistoryForgery.test.ts`): 10 files, 120 tests passed.
- Rollback-attack tests (`rollback-attack-tests.txt`): tests/keys/antiRollback, tests/leases/revocationListAtomic, tests/trust/rootRotation and tests/trust/trustList, 59 tests passed. They cover:
  - replaying an older signed list;
  - deleting both files, and deleting the anchor;
  - a symlinked anchor;
  - a fork at an accepted sequence;
  - a trust list at sequence 6 after 7;
  - root-set replay, a fork, a threshold decrease and a cross-set replay.
- Checks (`checks.txt`), all exit 0: build, typecheck, typecheck:tests, lint, check:counts, check:docs-drift, check:freeze, check:architecture-boundaries, check:gates, check:schemas, check:api-ref, check:threat-model, check:duplicates and check:dead-code. The D-15 snapshot check (`needs-snapshot.mjs int`) printed `none`.
- RED evidence (`red/`): each security fix's new tests were run against the commit before the fix, and they failed there.
- Mutations (`mutations.txt`): every recorded mutation failed at least one test, including the spec's three: removing the high-water comparison, accepting `previous`-only key-compromise statements, and skipping the key-set digest check. One mutation first survived because its test also lacked a manifest. The test now plants one, and the rerun failed the test.

## Full suite (`full-suite.txt`)

23,377 passed, 41 failed and 10 skipped, in 1,640 files. Every failure was looked at.

- **Fail on the branch base `42dfa8375` too** (run on an archive of that commit):
  - jsonlWriterResume (19): residency `registry_unverifiable`, fixed by the later P2-02 hotfix on `int`;
  - publicDocsGraph: DEPLOYMENT edges;
  - publicDocsArtifact;
  - privateModuleHelperVisibility: the spillStore hash;
  - llmResponsesCapabilities;
  - dataResidencyPersistence;
  - compliance/evidenceBinding.
- **Known baseline:** studioNativeTaskService (8). The base archive has no build, so it could not run there.
- **Timeouts and throughput floors under load:**
  - atomicRotation crash loop, sessionStoreConformance, assuranceLabV2, leaseRevocationConsumers hook, nativeManagedRecovery, assuranceRunNoSign, releaseEngineeringPack, releaseSecretScanCoverage and sessionSpine performance;
  - each of these passed when rerun alone (spine and release pack also at the base).

Not evaluated: CI, a fresh clone, a real rotation of the project's keys (P0-37 stays with Sid), and any KMS or HSM backend (P2-08).
