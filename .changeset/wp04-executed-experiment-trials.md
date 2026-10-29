---
"agent-maturity-compass": patch
---

`amc experiment run --execute-trials --provider <id> [--model <model>]` (and `executeTrials` on the Studio `POST /experiments/<id>/run` route) now runs the experiment itself. It executes the pinned baseline configuration and the admitted candidate artifact over the casebook's held-out cases through the governed native agent path. The configuration file's text is the trial agent's persona. Runs are bounded by `--max-executions`, `--trial-timeout-ms` and `--concurrency`. Every signed row a trial writes carries its case execution identity (casebook, case, case-file digest, trial and configuration digest), so the report's case results are bound and the experiment gate can pass, keep the baseline or abstain instead of always being inconclusive.

The executor sees only each case's task. The casebook validators, which hold the expected evidence, are the judge, and the report records the two identities separately. A configuration whose bytes no longer match the admitted digest is refused before or during the run. A trial that crashes, times out or does not finish is recorded as unavailable, never as a success, even when it left passing evidence. Without `--execute-trials`, `--candidate-window` is still required.
