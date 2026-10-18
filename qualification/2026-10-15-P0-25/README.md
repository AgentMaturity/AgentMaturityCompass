# P0-25 bounded qualification

The existing citation and mapping tests pass **32/32** on source `2d552741d727aaf3a26759b9df9343f7804d157a` (production code equivalent to `58e91dcef111bf02f773dcbfd1921d428cf75e34`). A separate corpus of **22/22** injected release-executor contracts passes. These are separate runs, not one 54-test run.

The actual built collector and actual `npm run check:citations -- --json` both exit 0 with `ok: true`, **0 blocking errors**, **623 ratcheted findings**, and baseline 623. CIT002 contributes 3 findings and CIT004 contributes 620. Their structured outputs match exactly. Earlier informal wording calling these 623 findings errors is corrected here. Three real invalid CLI argument combinations exit 1 with the expected refusals; the project baseline remains unchanged. None is a test registration or a reasoned baseline update.

The 32 original cases include 21 linter tests, 9 in-process CLI contracts with injected findings, and 2 tests of mappings against actual registered packs. The 22 release tests inject an executor and simulate step results. They do not execute a full release gate, hosted workflow or deployment.

Prior 30-case causal evidence remains attributed to source `75cbdf8a1b83ed6b3851ecce3a069940352a40cd`: resolver 30→26→30 and ratchet 30→29→30. Its 2,471 protected inputs and 4,529 compiled files match the current files exactly. That evidence used a private compiled import-prefix adaptation; it is reused here, not rerun or relabelled as a current mutation of all 32 cases.

Fresh normal install, build and ordinary real-Git freeze checks pass on Node 22.23.3, ABI 127. An owned native SQLite binary completes an in-memory query and has an independent inode from the preserved P0-30 binary. All 7,888 prior tracked files and 4,529 compiled files remain exact. No production code, test, data, baseline, reference table, workflow, guard or counter changed. The private observer reports run-end facts; it does not prove universal child teardown or filesystem isolation. Command wrappers inherit the environment and set a private HOME and Node 22 PATH.

The separate strict ISO failure, empty ISO table, 31 empty expert cells and literal single-host-list requirement remain open. The register checker still reads a separate JSON policy list. Required duplicate (1,269) and dead-code (2,751) failures remain unwaived; exact-source prior checks are reused with their original attribution. Full-suite, Node 24, coverage, hosted CI, full release, PR/merge, G0, formal dependencies and Done are not claimed. Earlier unresolved decisions, skipped work, reservations and pending transfers remain intact.

`receipt.json` identifies the primary 32-case run; `outcomes.json` keeps the separate 22-case run, three operational refusals and historical causal evidence distinct. The independent review and root outcome are copied under `evidence/`. The current plan routes next to P0-21 after this bounded handoff.

The canonical receipt check passes. The staged whitespace check reports one blank EOF line in the byte-exact copied successful build log; that immutable evidence remains unchanged and the exit 2 diagnostic is retained in `validation-summary.json`. No freeze or quality guard is weakened.
