# Native history capability batch — 2026-09-09

Owner: `cos-native-public-history-20260909T163519Z`, Chat on Steroids prime.
The bounded implementation and scoped verification are finished. No workers or
runtime/check processes remain owned. Do not enable Loop/session_finish or
restart the completed worktree audit. The full Phase A/B/C program remains open.

## Source delivered

Integration branch: `amc/gap-register-execution`. Source candidate:
`130c2d0087cf574016411fdc7d91067d3eddd637`.

- `5e6cd45ea8a997a942ff2b3691bc9921ddf73315`: public complete persisted-history
  loader, root/native SDK exports, selected-backend Studio cold projection,
  authenticated stale-observer refresh for exact lost-ack retries, strict JSONL
  decoding, docs and regressions.
- `80d35c9c864fa43720f0f82f025ce270aa59a48c`: explicit operator control-checkpoint
  directory inheritance into managed children and truthful stub-call accounting
  in the validation fixtures.
- `130c2d0087cf574016411fdc7d91067d3eddd637`: private credential fixture setup and
  a negative test preserving the actual unsafe-home refusal.

`loadSessionEventHistory` is supported from `agent-maturity-compass` and
`agent-maturity-compass/sdk/native`. It reads the actual selected store, verifies
the complete available event chain before session selection, checks identities,
and returns explicit metadata/payload/retained-output boundaries. It does not
invent missing history, substitute operations SQLite for JSONL, initialize a
writer or automatically decrypt retained private output. See
`docs/SESSION_EVENT_HISTORY.md` and `docs/NATIVE_SDK.md`.

## Verified scope

Fresh clone `tmp/cos-native-history-batch-01/candidate-03/source`, independently
installed at the exact source candidate. Observed environment: macOS 26.6.2,
arm64, Node v25.5.0, pnpm 10.33.0. This is not the older Node v22.22.0 environment.

Types, build, architecture boundaries and **193/193 tests in 16 focused files**
passed. This includes all 12 success/nonzero/denied/budget CLI/SDK/Studio cases,
an unsafe-credential-home refusal, 32 public-history cases, and managed
lost-ack/restart/archive plus affected storage and retained-output regressions.
Studio service/projection/rendering was exercised, not a new real-browser or
HTTP-auth acceptance. Automated fixture approvals are not human approvals.

Five deliberate loader guard removals each made its targeted regression fail;
restoration passed 32/32 and left tracked source clean. A newly packed and
independently installed 1.2.0 tarball loaded **28 exact persisted JSONL rows from
two sequential sessions** in a separate reader process without the vault
passphrase, through public exports only. Six negative cases refused. Tar SHA256:
`3ce7c636ec4fc8fbb38caa567ada1587752dd2ffd26635ecc45dca4ca5ebf730`.

Receipts: `disposition.json` in this folder indexes the source, mutation,
installed-package and prior failed-candidate receipts. Full logs/helpers remain
under `tmp/cos-native-history-batch-01/`. Candidate-01 (98 passed/12 failed) and
candidate-02 (188 passed/4 failed) remain preserved, not relabeled successful.
All recorded owned execution groups closed normally; no cleanup signal was
needed after a parent exited in the final source/mutation/package checks.

## Boundaries and pending work

No new full-suite/release-gate/platform-breadth/publish/deployment qualification.
The local package smoke explicitly used `npm pack --ignore-scripts`; prepack
release gates were NOT run or passed. It is not full installed spill-lifecycle
acceptance. Historical a598 attempts 01/02/03 and the 8bef source/docs receipt
remain unchanged with their original boundaries. JSONL writer-resume ownership
is still a distinct unsupported operation; read-after-restart is not resume.

Linear remains unavailable; no successful tracker mutation or issue closure is
claimed. See `TRACKER_PENDING.md`. New Obsidian checkpoint/update and one later
status-preparation command were blocked before execution, not replayed. See
`REVIEW_BLOCKERS.md`; previous five vault notes and old checkpoint blocker remain
intact. Prior evidence staging is still not counted as committed.

**NEXT IMPLEMENTATION TASK:** replace the installed retained-output harness's
missing history seam with the supported complete public loader, using a new
distinct run and a package pinned to this source or an explicitly newer source.
Exercise actual encrypted retained output, range reads, inventory/export/restore,
reviewed exact-scope erasure and cold verification across required backends;
implement any real failures without relaxing accounting, provenance or privacy.
Do not rerun old a598 lanes or swap a new package under an old label. Reconcile
remaining AMC-1538 transport/browser/cancellation contracts from live issue
evidence before any closure. AMC-1512, AMC-1518 and AMC-1530 stay open, as do all
production-secret/key-rotation, publication, deployment and human gates.
