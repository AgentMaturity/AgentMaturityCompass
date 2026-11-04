# Correction: P0-33 macOS pending counts — 14 October 2026

This note corrects `zero-pending-profile-audit-12a604291e77.md`. The original audit is preserved unchanged.

The original claim that the current single-host full profile cannot meet zero pending on every supported host was too broad and unsupported for macOS. I retract that conclusion and the resulting inference that macOS qualification needs a mandatory-profile or hardware decision. The current macOS data demonstrates zero pending counts.

## Directly inspected report

Report: `/Users/sid/AgentMaturityCompass-worktrees/codex-p0-33-20261014/tmp/p0-33-continuation/full-tests.json`. SHA-256: `465b58cd0f701583b8e12b8be9d83a4e79c31f0a5d69ccf20565519068d7e2f9`.

The completed baseline records total tests 24335, passed 24324, failed 11, pending 0, todo 0, pending test suites 0, and 1687 test-result file rows. Its success is false because of actual failed tests, not pending/todo counts.

Only `tests/conformance/piToolCall.conformance.test.ts` has zero assertion rows. Its file status is `passed` and its message is empty. The opt-in is disabled. The parent reports the CLI displays one skipped file, while this structured JSON has zero pending tests and zero pending suites. These counters are not interchangeable. No skipped assertion was rewritten as passed in this inspection.

The unchanged gate predicate requires overall positive passed tests, total equal passed, zero failed/pending/todo counts, zero failed/pending suite counts, every file status passed with an empty message, and process success. It does not require a positive assertion count in each file. The empty opt-in file therefore does not itself violate the existing structured-report predicate. It also supplies no executed Pi conformance evidence.

The parent independently reports that the subsequent completed macOS rerun also has zero pending/todo/pending-suite counts. This correction independently inspected the baseline counts and empty rows only; it did not rerun tests, read all assertion details, or assume that the currently running full release gate has passed.

## Current boundary

The strict predicate's historical provenance remains `e2f763740` on 8 September, preserved by the October root landing. No source or policy change is needed merely to accommodate the observed empty opt-in file.

Darwin-only tests on a future Linux full run remain a source-derived concern pending an actual Linux structured report. They are not an observed Linux failure and do not establish a decision or hardware blocker for macOS. P0-60's separate recorded Linux confinement qualification requirement is not a blocker inferred from these macOS pending counts.

Retain actual full reports and fix actual evidenced failures. The missing P1-65 allowance on the accepted current-main freeze base remains the independently established main-integration blocker. Full P0-33 acceptance recovery and main CI claims retain their previously stated limits.

No source, policy, ref, tracker, or previous audit note was changed. No build, test, check, or hardware/security-setting operation ran. This unique correction note is the only authored artifact in this correction task.
