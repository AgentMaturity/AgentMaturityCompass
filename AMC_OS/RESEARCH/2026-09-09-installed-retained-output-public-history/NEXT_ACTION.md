# Installed retained output / public history — 2026-09-09

Task: `installed-retained-output-public-history-batch`.
CoS prime: `cos-native-public-history-20260909T163519Z` (local conversation label;
bridge Unattributed, recording ID unavailable). No GPT workers were started.
This bounded batch ends with a real tool-review blocker, not full acceptance.

## Delivered source

Branch `amc/gap-register-execution`.
- `a7482626`: new installed helper uses both supported public history exports,
  genuine selected-store rows, locked-vault refusals, ciphertext transport and
  separate exact-fixture erasure review. No internal runtime imports or invented
  history. Its original runtime pin was 130c2d00.
- `33481a72aba1b11d4f3d63f14c8ab4f7ea1f7afd`: fixes the actual cold SQLite loader
  failure uncovered by this run. Only a newly created zero-byte WAL is permitted;
  existing/populated WAL, database, backend-marker and trust changes stay fenced.
  Includes `tests/sessionHistoryColdSqlite.test.ts` and public guide correction.

Helper files currently pin 33481a72. Their later staging/check/commit request was
blocked and not retried: **these repin edits are saved but uncommitted**. The
corrected execution records their actual byte digests. Do not replay that denied
commit operation or claim it succeeded. Unrelated dirty files remain untouched.

## Actual verification

Fresh clone at 33481a72, Darwin 25.6.0 / macOS 26.6.2 ARM64, Node v25.5.0,
pnpm 10.33.0, npm 11.10.1: types, build, architecture and **37/37 focused tests**
passed. Three changed-reader mutations each failed its selected assertion;
restoration passed **5/5** cold-SQLite tests. Tracked source was clean afterwards.
The previous 193-test/native-history result remains a separate older receipt.

Initial installed run at 130c2d00: SQLite captured both real fixture outputs but
the public history loader refused `CHANGED` on first read. A separate copied-DB
diagnostic proved an empty WAL appeared without changing the database. JSONL
passed native capture/cold verification, origin inventory, exact public/CLI reads,
locked-vault refusal, ciphertext export, overwrite/tamper/missing refusal and
native restore. Its erasure gate ended **blocked**, not passed.

Corrected installed run at 33481a72 selected **SQLite only**, deliberately not
repeating the unchanged JSONL lane. All groups through restore passed with no
runtime assertion failure. Exact-scope/stale-plan refusal and review preparation
also passed; no approval was supplied and no object was erased. Post-erasure
audit/cold verification code is authored but **not exercised** in either run.

Tar SHA256 at 130c2d00:
`889258079cd7ec94644f6e2b2c3cb0c2f31226597ddb06ec22cd0de24b52fb35`.
Tar SHA256 at 33481a72:
`cddd6be614fef3a7d34910fd10d5b73654ed59e9b9ef8ee6cad31160f0da65e9`.
Both local packs used `npm pack --ignore-scripts`: **no prepack/release-gate pass**.
These are distinct source/artifact/backend scopes, not a combined final-candidate
qualification. Aggregate installed qualification remains false.

## Receipts and closure

`disposition.json` indexes exact inputs, helper hashes, source/mutation results,
package locks, actual checks and failures. Private full records remain under
`tmp/cos-installed-retained-output-public-history-01/`: initial `run/`, `outer/`,
`preparation/`, `cold-sqlite-open-diagnostic.json`, and corrected `candidate-02/`.
Raw workspaces, transcripts, secrets and payload pages are not committed.

All recorded command groups and observed descendants closed. Final observation
at 2026-09-09T18:36:16Z found no remaining owned identities or groups; see
`final-process-closure.json`. No owned servers, workers, VMs or check processes
remain. Source ownership is released at this handoff; Loop/session_finish stay off.

## Remaining blockers and next task

The exact JSONL approval proposal was blocked by automatic tool review. No file
was written, no deletion was attempted, and it was not replayed via another tool
or a different path. The corrected SQLite run intentionally supplied no approval.
`REVIEW_BLOCKERS.md` preserves all denied requests verbatim, including the
helper repin commit and status proposals. Existing historical blockers remain.
Resolve review-gated actions only through normal authorized review; do not ask
Codex to execute them, relaunch a consumer or change the wording/path as a bypass.

Linear discovery remains unavailable. `TRACKER_PENDING.md` contains exact new
proposed comments and references the preserved earlier pending bodies. The old
uncertain AMC-1547 comment requires live readback before any retry; nothing was
posted or closed. The new dated Obsidian evidence note was updated successfully;
Home/Now/Roadmap and prior five notes/checkpoints were not rewritten.

Next independent implementation: read current AMC-1538 public transport/browser
contracts and their existing receipts once, then implement remaining real gaps.
Do not rerun completed cancellation VMs or historical a598 lanes. Full installed
erasure, single-final-candidate both-backend proof, full suite/release, real-human/
provider evidence and AMC-1512/1518/1530 remain open. No JSONL writer-resume,
key-rotation, production-secret, publish/deploy or superiority gate is waived.
