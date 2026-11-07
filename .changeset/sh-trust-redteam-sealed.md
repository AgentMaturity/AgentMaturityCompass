---
"agent-maturity-compass": minor
---

Red-team runs are ledgered, sealed and signed (SH-TRUST-03). `amc redteam run` without `--no-sign` writes every attack prompt, reply and graded result into a sealed `amc-redteam-runner` ledger session (`source: "redteam"`), verifies the ledger, and seals the report with the artifact-seal key (`reportJsonSha256`, `runSealSig`, `sessionId`); `verification` reads `signed: true, status: SIGNED_VALID, mode: vault-signed` (or `SIGNED_INVALID` when the ledger did not verify). A locked vault refuses a signed run with the assurance runner's remediation. `--no-sign` (the `amc ci redteam` default) writes rows only under `AMC_NO_SIGN=1`, into the unsigned store, and otherwise records nothing, and says so. New reader `src/redteam/redteamStore.ts` (`verifiedRedTeamReports`, `verifyRedTeamReportFile`) returns only signed runs whose seal and ledger provenance verify (`REDTEAM_UNSIGNED`, `REDTEAM_SEAL_INVALID`, `REDTEAM_PROVENANCE_*`); `amc ci redteam` re-reads a signed run it just wrote and fails with that name. The assurance evidence writers take a `source`, and `REDTEAM_SCENARIO_INCONCLUSIVE` is registered as non-maturity. `amc redteam attack` is unchanged.

freeze-exception: SH-TRUST — Sid asked for signed red-team results; this changes an existing command's evidence, adds no command.
