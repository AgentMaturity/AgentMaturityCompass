# P0-48 read-only preflight — 14 October 2026

P0-48 is already merged and its relevant source matches accepted main and current P0-47 head. The old runner log stall has primary recovery evidence; current CI is still failing, and the original two-job completion criterion is not established.

Main: `5ea5e866a42acd5c8228a712e9b8c1d9f18c745c`. Current P0-47 head: `7a81b5aa7316471e841f4ae0ea684a64c85ae4a1`. Primary acceptance: [PR40](https://github.com/AgentMaturity/AgentMaturityCompass/pull/40), merged `63081f958d2372b300038176680fe01af4889efa`.

## Scope and existing regression

The fake truncated-answer case emits 5 MiB. A test-only process.stdout.write spy suppresses its tee and restores in finally; recorded-output refusal remains asserted. Both CI full-suite and npm-publish test steps retain full output with tee before cutting runner-console lines to 4096characters. Current GitHub logs confirm explicit bash with pipefail. No product implementation changed.

No dedicated committed workflow regression tests the line cap, full artifact preservation and producer exit status. The 12 foreign-runner cases test runtime-record refusal; direct pipeline qualification remains useful.

## Actual hosted evidence

| Run | Actual result | Interpretation |
| --- | --- | --- |
|37392711874 probe|patched-printing success,12tests; originalredirected reportedexit0 bytes5244733 longest5242903 despite jobfailure|Concrete giant-line isolation/recovery evidence; overall probe status is not green.|
|37395019475 PR40|Node24 full-suite failure with genuine failing tests and uploaded diagnostics; Node22cancelled|Own matrix did not satisfy both-job finish acceptance.|
|37483109284 main8d78504d|Node22 full-suite step success, then per-file coverage failure; diagnostics uploaded; Node24cancelled|Old runner stall recovered; coverage/complete matrix remains distinct.|
|38132701944 currentmain5ea|Node22 full-suite failure:104failed,22972passed,27skipped; foreign-runner12passed; diagnosticsuploaded; Node24cancelled|Current CI and two-node completion are not qualified.|

## Minimal qualification, for the later active task

- Use already-running P0-47 correctness report when available: Inspect tests/foreignSubagentRunner.test.ts outcomes in the existing pinned full report Avoid rerunning equivalent whole suites if this exact test blob already passed; preserve actual SHA/runtime and result provenance.
- Focused foreign runner regression on Node22 and Node24 if not covered by that report: npx vitest run tests/foreignSubagentRunner.test.ts --reporter=default --reporter=json --outputFile.json=/private/tmp/p0-48-foreign-runner-NODE.json > /private/tmp/p0-48-foreign-runner-NODE.log 2>&1 Require all12 cases including truncated output refusal; capture raw output to a file and measure total/maximum line size without echoing a giant line.
- One-off pipeline byte and exit-status qualification: Replay the exact bash -eo pipefail producer | tee FULL_LOG | cut -c1-4096 pipeline with a synthetic5MiB ASCII single line and a producer that exits17; redirect console output to CONSOLE_LOG. Assert full log retains all bytes, console line is4096characters and shell exits17. Repeat with producer exit0. Qualify clipping and failure propagation directly; no product changes or new dependency is needed.
- Reversible stdout-spy mutation: In an owned isolated checkout only, remove the stdout spy for the single truncated-answer case, run only that case with allstdout/stderr redirected to a file, measure the giant line, and restore exact test bytes. Prove the spy matters while preserving recorded-output refusal assertions and avoiding hostile runner-console output.
- Hosted runner acceptance: Read both Node22/24 build-test job results at a fresh explicitly pinned candidate/merged head; confirm full test step reaches its result and diagnostics upload, recording any assertion/coverage failures or matrix cancellations separately. Local pipeline smoke cannot alone establish the original hosted matrix completion criterion. No workflow trigger, PR, push or publication is authorized by this preflight.

Reuse existing pinned full-run results when they cover the exact file/runtime; do not rerun a whole suite merely to repeat them. Preserve failure semantics, raw artifact bytes and every runtime refusal assertion. Product foreign-child stdout limits remain the explicit separate PR40 follow-up.

Full primary PR text, job/step outcomes, source hashes and commands: `/private/tmp/p0-48-readonly-preflight-20261014.json`.

Read-only preparation complete. No edit, build, test, mutation, manifest change, PR, workflow trigger, publication or cross-session action was performed.
