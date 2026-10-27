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

## Security review fixes (commit `51ab20745`)

- **Lifecycle enforcement.** It is now read from the workspace's verified active plan on every decision, never from a
  caller's context, so ToolHub dispatch and provider hook decisions hold a suspended agent too. A plan that cannot be
  verified denies an agent that could be held.
- **Session manifest.** It is now built from the resolved session (the composed tool surface, the verified tools config
  and the active plan's policy), never from declared pins.
- **Red before the fixes.** `red-before-security-fixes.txt` shows the 4 entry-point tests and the resolved-manifest
  test failing on the previous sources.
- **Mutations.** `mutations-security-review.json` records them (M13 to M17, plus the admission mutations re-run on the
  new code). All were killed. M17 survived until a test for a tools config that does not verify was added.
- **Checks.** All 11 checks passed. The 159 related test files (2,419 tests) passed.

## Held agents (commit `db74b9cef`)

- **Rule.** A suspended or retired agent is now denied every action class, reads included. This holds at the bind
  (provider hooks), for the tool pipeline's unbound calls, and on ToolHub's unjournaled path. Reads stay open only
  before activation.
- **Red before the fix.** `red-before-held-agents.txt` shows 5 tests failing on the previous sources.
- **Mutations.** `mutations-held-agents.json` records M18 to M21; all were killed.
- **Checks.** All 11 checks passed (architecture after fitting ToolHub's line budget).
- **Related tests.** 181 files, 2,575 tests: 3 failed, all from the entry-point test's mock import order, which was
  then fixed. The `tests/lifecycle` and `lifecycleRouter` files were re-run afterwards: 15 files, 56 tests passed.

## Suspension holds in every workspace (commit `0981eff04`)

- **Rule.** A suspended or retired agent is now denied whether or not the plan enforces `L0-CHG-01`. The advisory
  warning-only mode now applies only to agents not yet active.
- **Red before the fix.** `red-before-advisory-hold.txt` shows 2 tests failing on the previous sources.
- **Mutations.** `mutations-advisory-hold.json` records M22 and M23; both were killed.
- **Checks.** All 11 checks passed.
- **Related tests.** The full set of 181 files (2,576 tests) passed.
