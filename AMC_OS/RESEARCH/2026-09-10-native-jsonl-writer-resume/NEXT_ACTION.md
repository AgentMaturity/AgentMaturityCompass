# Native JSONL writer resume — completed bounded handoff

**Runtime source:** `b516869eeaa275fe31248024a02596d71255add0` on
`amc/gap-register-execution`. Implementation parent:
`96accade0821eaf730d30218dfc5851b667f98f0`. CoS was the serial implementer,
source reviewer and validator; no Codex execution or workers.

## Delivered

Actual authenticated same-session JSONL writer recovery now reaches the existing
core, public SDK/ACP CLI and managed Studio. Exclusive local coordination does not
replace JSONL evidence. Original identity, controls and accounting authenticate
before append rights; live/unknown owners refuse. Recovery preserves prior bytes,
acknowledged effects, pending usage and admitted IDs. Unknown outcomes stay unknown.
The operator submits a new explicit turn; no automatic prompt/effect replay.
Eligible Studio sessions offer Resume and public recovery status. Observation or
control loss still requires explicit refresh. Closed/archived and controller-
dependent unsafe states remain non-resumable; see `docs/SESSION_RESUME.md` and ADR007.

## Exact evidence

Scratch prefix: `tmp/cos-native-jsonl-writer-resume-01/`.

| Boundary | Result | Receipt under the scratch prefix |
| --- | --- | --- |
| Fresh source build at final runtime pin | **23/23 new scoped tests passed**, including actual Chromium | `candidate02/receipts/receipt.json` |
| Four changed guards: mutex, configuration, accounting, parent stop | Each mutation detected; exact source restored; **20/20 core positives** | `shipping01/receipts/receipt.json` |
| New installed public root/native SDK, actual packaged ACP CLI and admin HTTP | Actual writer death/restart/resume, same history/session, current control negatives passed | `shipping03/receipts/receipt.json` and `shipping03/installed-fixtures/receipt.json` |

Artifact: `shipping03/artifact/agent-maturity-compass-1.2.0.tgz`, 6,023,292 bytes,
SHA256 `28990ad17b8b7f1b8d0fc6c6f5e47795ceb4dde8a5308be740b17a4186249ec8`.
Installed payload hashes match the freshly built final candidate. Consumer lock
SHA256 `5db579b954a41240845fc5e7ecdd6532998cb4ba7e4e186877d04ab2c7265af2`.
Normal registry resolution followed by frozen-lockfile confirmation was exercised.
Packing used `npm pack --ignore-scripts`, **not prepack or release gates**.

Environment: Darwin25.6.0 arm64, Nodev25.5.0, pnpm10.33.0. Real Chromium measured
147.0.7727.15. Browser screenshot/receipt:
`candidate02/public-fixtures/public-task-jsonl-success-LUdHq4/`.
Browser qualification is fresh built source; installed qualification is SDK/ACP/
admin HTTP, not installed cookie/browser/tool-approval scenarios. All model output
is a deterministic local stub, not provider or human evidence.

## Retained failures and blockers

Candidate01 at `96accade` built but passed19/23. The actual Studio dead-writer
shutdown defect was corrected at the final pin; two test mistakes and absent
default Chromium were fixed or explicitly pinned. Its receipt is intact.
Shipping01's pnpm pack flag failed; independent mutations succeeded. Shipping02
packed successfully but its offline dependency cache was incomplete. Both remain
intact; shipping03 is the successful, separately recorded installed attempt.

Central status refresh was denied before and again after qualification. **Its old
timestamp is not current.** Exact proposals/refusals remain in `REVIEW_BLOCKERS.md`;
do not replay, split or route them to another executor. Current local ownership
is in this batch's `ownership.json`; process closure is `process-closure.json`.
Prior exact erasure denial, helper-repin staging denial, checkpoint and uncertain
comment bodies remain unchanged. No erasure or post-erasure test occurred. Prior
installed retained-output JSONL130c/SQLite33481 were at different pins; their
aggregate installed qualification is still false.

## Tracker, vault and release

Existing Linear issueAMC-1511 underAMC-1505 was reused and not closed. Latest
delivered comment: `07dba626-264f-4a7c-9739-14868149fd42`; earlier actual comments
and untouched pending bodies are mapped in `TRACKER_PENDING.md`/`linear-sync.json`.
Only `/amc/Evidence/2026-09-10 Native JSONL Writer Resume.md` was created/appended;
older notes/checkpoints are unchanged. No material rewrite of those notes occurred.

All **40 owned command groups**, **31 recorded fixture-owner PIDs**, **six fixture
ports**, and the browser were observed closed. No unrelated process was killed.
The batch releases its declared source/research/scratch/vault paths after saving
this handoff. Manifest history and unrelated dirty files remain unstaged; the three
old helper-repin files and shared stash remain untouched. No background continuation
or next batch is started. Native Loop and global Sessionfinish remain OFF.

## Next bounded work, not executed here

No implementation remains for this local standalone writer-resume boundary as
defined and scoped above. Controller-reconstruction, cross-host/network filesystem
coordination, older concurrent writer protocols and independent whole-snapshot
rollback evidence are not silently claimed by it. Preserve those refusal boundaries.
The monitor may choose the next existing PhaseA/B/C implementation gap; do not redo
this audit or historical lanes. AMC-1512/1518/1530, measured10x, real human/provider,
full-suite/release/platform and production secret/key rotation gates remain open.
Publication, deployment and production-secret actions still need explicit user
approval. No parity, superiority, released package or whole-goal claim is made.
