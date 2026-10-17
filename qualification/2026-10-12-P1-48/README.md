# P1-48 qualification: suite infrastructure only

Recorded on a local macOS arm64 machine (darwin 25.6.0), not in CI.

**No AMC attack success rate is claimed.** The suite infrastructure ships; the
AMC adapter and results are pending.

## What shipped

`examples/adversarial-suite/`: 32 attack tasks in 8 classes, a deterministic
generator (25 distinct variants per task, byte-identical for the same seed), an
external observer that imports nothing from AMC and runs as a separate process
with a positive control on every trial, an oracle, a summarizer, a results
schema, an uncontained validity control and a pluggable Pi adapter whose cells
record "not run" without a qualified Pi install. Tests:
`tests/adversarialSuiteGenerator.test.ts`, `tests/adversarialSuiteObserver.test.ts`,
`tests/adversarialSuiteOracle.test.ts`.

## Adapter shake-out (not a result)

One 800-trial run of the draft `amc-native` adapter (32 tasks x 25 variants,
seed `smoke`, concurrency 3, wall 172.2 s, load average about 16) was used only
to shake out the adapter:

- 725 pass, 50 fail, 25 inconclusive.
- The 50 failures were adapter bugs, not AMC findings. In
  `tamper-reordered-rows` the tamper step never changed a record, so a valid
  approval was tested; in `tamper-recorder-failopen` the adapter made the wrong
  directory unwritable, so the consume legitimately succeeded.
- The 25 inconclusive trials are symlink escapes (`path-symlink-escape`), which
  need P1-05 OS containment and are out of scope for P1-48.

That run's adapter has further known defects (listed in
`docs/ADVERSARIAL_SUITE.md`), so none of its numbers are valid or published, and
no follow-up key was opened from it.

## Mutation checks

See `receipt.json` notes.

## Not done (needs a human or a follow-up)

- A corrected `amc-native` adapter. The draft was not finished in this session.
- `pi-amc` and `pi-baseline` need a qualified Pi install (`AMC_PI_CLI`).
- Running the observer as a separate OS user or in a disposable VM, with a
  host-only network, as the issue's production posture requires.
- A live-provider lane needs Sid's credentials and spend cap.
