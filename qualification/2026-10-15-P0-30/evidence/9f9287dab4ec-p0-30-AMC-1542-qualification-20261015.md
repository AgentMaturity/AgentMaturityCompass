# AMC-1542 bounded core qualification

The unchanged current two-file source-mode corpus passed all 35 cases. Two private source guard controls completed with the exact original assertions, setup, cleanup, fixtures and 30-second deadlines:

| Current guard | Baseline | Mutant | Restored |
| --- | --- | --- | --- |
| Current catch-refusal → empty set | 35 passed | 15 passed, 20 failed | 35 passed |
| Verified revoke snapshot → raw load | 10 passed | 5 passed, 5 failed | 10 passed |

Every phase had zero pending/todo cases. All 25 mutant failures are genuine original AssertionErrors, with no setup, transport or compiler failure counted as a kill. The writer10 is a subset of the same 35 cases, and repeated runs are not additional distinct cases. Actual loopback HTTP remained enabled. There was no compiler, import adaptation, compiled mutation or new consumer fixture.

The first guard demonstrates missing reader refusals, a CLI admission, and managed-status failures. Its six writer cases fail only their final reader assertion, after writer refusal and exact list/signature preservation have passed. The eight managed cases stop at status, so later forwarding/reinstall/effect assertions are not independently reached in that mutant. The two CLI/Bridge cases stop at CLI, so no separate mutant Bridge conclusion follows. Original router and gateway cases still pass. The snapshot guard yields four missing writer refusals and one failed ordinary-revoke versus deliberate-repair distinction; those assertions stop before later byte/effect checks. No unexecuted effect assertion is claimed as evidence.

All 7,739 accepted source files, 4,529 baseline compiled files and the complete 12,268-file private closure are byte-exact after restoration. All 92 readiness and 31 protected pins, native bytes/device/inode/nlink, and prior qualification packages remain unchanged. The root worktree is clean at source 58e91dcef111bf02f773dcbfd1921d428cf75e34. The separate launcher fingerprint observes Node v22.23.3 and ABI127; it does not invent a direct ABI observation for each worker.

This lane used a fresh private filesystem copy, not a literal Git clone. Hook dist CLI paths are serialized configuration metadata and are not executed by this corpus. Current35, historical46, held newer consumer15, historical nine IDs/eight primary results, Node25.5 and P1-08 drift remain separate. The original setup pair, including its corrected read-path observer mistake, is frozen at independent paths. Seven-consumer qualification remains a separate future assignment. This is bounded source-mode guard sensitivity, not a production repair, whole P0-30, race/cross-process, old held batch, Node24, full suite, coverage, hosted CI, G0, release or Done claim.
