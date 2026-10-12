# AMC-1506 · Neutral imports stay self-reported and unevaluated: Done

- **Commit on main:** `5eec4d9d` (ancestor of origin/main `5ea5e866a` and of the base `60d0255c4`).
- **Focused tests at `60d0255c4`:** `tests/importProvenance.test.ts` 3/3 and `tests/neutralImporter.test.ts` 10/10, so 13 passed, 0 failed.
- **Remaining item from P0-32 (tracked receipt and one installed `amc import` run):** done, see below.

## Installed import (`installed-import/`)

**Install:**

- **Tarball:** P0-31's release candidate, `agent-maturity-compass-1.2.0.tgz`, sha256 `21190c7d…0340`, RC commit `756bd697`.
- **How:** installed with `npm install --offline` into a new, empty prefix.
- **Installed CLI:** `dist/cli.js` has sha256 `8b9ec221…9165`, the same as in P0-31's receipt.
- **Run setup:** Node 22.23.3, macOS arm64. A fresh workspace with an empty `.amc/`, and HOME pointed at an empty directory.

**Pi v3 import:** `fixture-pi/pi-session.jsonl` is a five-row Pi v3 session with a failed tool call and a model error. `amc import <dir> --agent default --no-retain-original --json` exited 0 (`import-pi.json`).

- **Claim fields:**
  - `claimKind: "self_reported"`
  - `statusDimensions.result: "not_evaluated"`
  - claim label "Claim: Self-reported · Result: not evaluated · Evidence: incomplete"
- **Normalization:** source trust `SELF_REPORTED`, evaluation `NOT_EVALUATED`, confidence meaning `format-classification-only`.
- **Diagnostic report** (`diagnostic-report-pi.json`):
  - status `UNSIGNED`, `verificationPassed: false`, `integrityIndex: 0`
  - `correlationRatio: 0`, `evidenceCoverage: 0`
  - coverage observed 0, attested 0, selfReported 1
  - empty layer and question scores, `importProvenance.evaluationPerformed: false`
- **Readiness:** `UNVERIFIED`, `claimEligible: false`, reason `NO_ACCEPTED_EVIDENCE`.

**Config import:** `fixture-config/agent.config.json`, imported without `--json`, exited 0 (`import-config.txt`). It printed "Imported as SELF_REPORTED evidence. No maturity evaluation was performed."

`environment.json` lists each command with its exit code and duration. Local paths are replaced by `<run>` and `<prefix>`.

## Drift

No commit touches these paths between the RC `756bd697` and the base `60d0255c4`:

- `src/importers`, `src/cli-import-commands.ts`, `src/cli/claimOutput.ts`
- `src/diagnostic/evidenceReadiness.ts`
- `src/lifecycle/episodeRecord.ts`, `src/lifecycle/lifecycleRunArtifact.ts`

So the installed run reflects the code at the base.

## September reconciliation

`reconciliation-summary.json` summarises the 2026-09-14 record from candidate `37c1466b` (blob `cbc197ea…`). Its original is not in main's history.

- It found PARTIAL at `6e7875f2`: 9 claims held, 5 did not.
- Two of its missing items are now met here: a tracked receipt, and an end-to-end `amc import`.
- The rest are a Linear comment and an Obsidian note (Sid's), and receipts that were never committed. Those receipts are not used.

## Residual risk

- The installed run covers macOS arm64 under Node 22, from the 1.2.0-labelled RC. The versioned 2.0.0 tarball is qualified in P0-39.
