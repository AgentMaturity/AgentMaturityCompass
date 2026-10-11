# P1-08 receipt: key lifecycle

Environment: local macOS arm64 (Darwin 25.6.0), Node v22.23.0, pnpm 10.33.0. Not CI. Homebrew's Node 25.5.0 stopped loading mid-session (its libsimdjson.29 was replaced by version 34), so every run here used a separate Node 22 install. No Linux run was evaluated. Load average was 9 to 22 during the runs.

Branch `rtd/p1-08-key-lifecycle`, from `int` at `42dfa8375`. The checks and the last full-suite run were at `f26b6557e`, after the fixes for the independent review. The receipt commit adds only this folder.

## What was checked

- Spec focused command (`npx vitest run tests/keys tests/leases/revocationListAtomic.test.ts tests/score/crossAgentTrustHmac.test.ts tests/crypto/keyHistoryAdmission.test.ts tests/crypto/keyHistoryForgery.test.ts`): 12 files, 132 tests passed.
- Rollback-attack tests (`rollback-attack-tests.txt`): tests/keys/antiRollback, tests/keys/workspaceWriter, tests/leases/revocationListAtomic, tests/trust/rootRotation and tests/trust/trustList, 68 tests passed. They cover:
  - replaying an older signed list;
  - deleting both files, and deleting the anchor;
  - a symlinked anchor;
  - a fork at an accepted sequence;
  - a trust list at sequence 6 after 7;
  - root-set replay, a fork, a threshold decrease and a cross-set replay;
  - a workspace-only writer restoring older keys under a rewritten `keyset.json`, swapping a public key, and restoring a pre-scrub key history after this machine's marks were lost.
- Checks (`checks.txt`), all exit 0: build, typecheck, typecheck:tests, lint, check:counts, check:docs-drift, check:freeze, check:architecture-boundaries, check:gates, check:schemas, check:api-ref, check:threat-model, check:duplicates, check:dead-code and check:deploy-pack. The D-15 snapshot check (`needs-snapshot.mjs int`) printed `none`.
- RED evidence (`red/`): each security fix's new tests were run against the commit before the fix, and they failed there. For the independent review, that is all 17 new tests on `ceba29da5` (`red/review.txt`).
- Mutations (`mutations.txt`): every recorded mutation failed at least one test. This includes the spec's three, and one per review finding: 15 mutations, all killed.
  - One self-audit mutation first survived because its test also lacked a manifest. The test now plants one, and the rerun failed the test.
  - One self-audit change was later reversed by review H1. The file notes it.

## Full suite at `f26b6557e` (`full-suite.txt`)

23,399 passed and 43 failed, in 1,642 files.

- **Fail on the branch base `42dfa8375` too** (checked on an archive of that commit):
  - jsonlWriterResume (19): residency `registry_unverifiable`, fixed by the later P2-02 hotfix on `int`;
  - publicDocsGraph: DEPLOYMENT edges;
  - publicDocsArtifact;
  - privateModuleHelperVisibility: the spillStore hash;
  - llmResponsesCapabilities;
  - dataResidencyPersistence;
  - compliance/evidenceBinding.
- **Known baseline:** studioNativeTaskService (8). It needs a build, which the base archive does not have.
- **Timeouts and throughput floors under load:**
  - sessionStoreConformance, releaseEngineeringPack, receiptsCorrelationRuntimeDashboard, leaseRevocationFailClosed (gateway), the atomicRotation crash loop and sessionSpine performance;
  - each passed when rerun alone; sessionSpine passed twice in a row at load 9 to 14.

An earlier full run at `8ffabba85` caught three forgery tests that assumed a swapped public key goes unnoticed (ledgerTrustRootAnchor, ledgerTrustRootAnchorCli, verifyRepairCli). They now model a complete workspace writer that also re-points `keyset.json`: a machine without the key-set mark still cannot tell, and the committing machine refuses it. An earlier run also hung in notaryTrust, because the notary self-admission was logged through an in-process notary. That admission is now marked but not logged, as `docs/KEY_LIFECYCLE.md` states.

Not evaluated: CI, a fresh clone, Helm on a cluster (only `helm template` and `helm lint` ran), a real rotation of the project's keys (P0-37 stays with Sid), and any KMS or HSM backend (P2-08).
