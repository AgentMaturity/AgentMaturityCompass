# P2-23 qualification receipt: agent lifecycle, reassessment and retirement

Commit `6efebd13e` on `rtd/p2-23-lifecycle` (base `18b7ead85`). The run was local, on macOS arm64 with Node 22.

- `receipt.json` lists the commands, exit codes and test totals. All 11 checks passed: build, typecheck,
  typecheck:tests, lint, check:gates, check:dead-code, check:duplicates, check:counts, check:api-ref,
  check:docs-drift and check:architecture-boundaries. The 146 related test files (2,277 tests) passed; these are every
  test that imports a changed module, plus the new P2-23 tests.
- `mutations.json` records each guard that was broken, the file it was in, and the test that failed. The source was
  restored after each run. Every mutation was killed:
  - The spec's three: M1 skips the manifest comparison; M2 lets suspended agents pass admission; M3 deletes evidence on
    retirement. M3 was run twice, once with the ledger's append-only trigger in place and once with it dropped, so the
    test's own row-by-row check is what caught the second.
  - M11 (the recheck admission) survived at first, because the bind still denied the call. A test that suspends the agent
    between bind and recheck now kills it.
- `sample-event-trail.json` is the fixture trail: proposed, approved, active, observed manifest, a reassessment
  (model change, `L0-CHG-01` invalidated), suspended (`reassessment_required`), resumed (the reassessment closed as
  `passed`), and retired. It comes from local fixture keys and fixture reviewers. It is evidence that the code path works,
  not of any real deployment.

Red before the fix: none of the new tests can run on the base, because the modules they test do not exist there.
The mutation runs are the regression evidence that each guard is load-bearing.

Pending:

- The full suite run (integrator).
- The `allowedExceptionKeys` entry for P2-23 (integrator).
- Sid's decision on whether never-migrated agents are held under an enforcing plan. See docs/AGENT_LIFECYCLE.md,
  "Migration".
