# P1-14 qualification receipt: Layer 0 Agent Control Baseline v0.1

Environment: local run on macOS arm64 (darwin), not CI. No network access: no citation was fetched or hashed.

- `receipt.json`: commit, toolchain, every command with its exit code and duration, and the full-suite totals.
- `counts.json`: the G1 metric inputs. Controls in Layer 0, controls with an executed test against a real enforcement
  point, controls waiting for a producer, and the negative fixtures run with the number that passed.
- `mutations.txt`: the mutation checks the spec asks for, and the two that survived because a second guard catches the
  same fault.
- `checks.json`: each check's command, exit code, duration and last output lines.

What the counts mean: a control counts as executed when one of its fixtures names a harness that drives the real
enforcement point in a temporary workspace (`tests/catalog/l0/`). Most executed tests cover only part of the control's
statement; `docs/catalog/LAYER0.md` says which part per control. An executed test shows how the enforcement point
behaves on the fixtures; it is not a result for any deployment. Every control is `experimental`, agent-drafted and not
independently reviewed; expert sign-off waits for D-08.
