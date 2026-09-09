# Spill mutation baseline refusal — September 9

Source c16492c10592112fe610bd2e59f216f8f7f310b4 in a fresh independently installed clone on macOS ARM64, Node22.22.0 and pnpm10.33.0. Baseline: 79 tests,77 passed,2 failed,0 pending/todo. No mutation was applied. Exact logs/results and process closure are mirrored here; original output /private/tmp/amc-c16492c1-spill-mutations-01 remains preserved. summary.json records finalTrackedCleanAtPin and allProcessGroupsClosed as true.

Failures were sessionSpill.test.ts:472 (unavailable final result did not excuse the signed intention pointing through the fixture's unsafe spill-root file) and spillLifecycle.test.ts:129 (whole-ledger verification after successful erasure; source shows legacy fixture sessions lacked seals). The raw reports contain assertion stacks, not verifier error arrays; the causal explanation is a source inference. Root authored precise fixture/expectation corrections without changing runtime guards. These await the next candidate after the full c164 gate finishes collecting failures.

This is a failed focused baseline, not a killed-mutation result, full suite, package/platform or issue-Done receipt. [AMC-1547](https://linear.app/agentmaturitycompass/issue/AMC-1547) remains In Progress.
