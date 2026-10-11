# P1-22 qualification: AMC Pi extension at Pi's tool_call hook

Recorded on a local macOS arm64 machine, not in CI. AMC commit `a9e49d49189952fcd493c8663045482571e65e86`.

- Qualified: the `pi` CLI of `@earendil-works/pi-coding-agent` 1.0.2 (gitHead `cd32f772`) and 1.0.4 (gitHead `7c10bd43`), installed from the public npm registry with `--ignore-scripts` into scratch prefixes outside the repository; tarball integrity and the resolved `@earendil-works/*` dependencies are in `pi-conformance.json`, which `receipt.json` hashes. Not qualified: 1.1.0 (AMC denies it) and Pi embedded through its SDK.
- Conformance: `tests/conformance/piToolCall.conformance.test.ts`, 18/18, driven by a local scripted model endpoint on loopback (no live model). Per-case results per version are in `pi-conformance.json` and rendered into `docs/adapters/pi.md`.
- Focused suites 193/193 and suites covering the other changed modules 122/122 at the same commit.
- Mutation checks: 13, one per guard (request binding, receipt signature, input freeze, version gate, server-derived action id, single-use nonce, ask denial, mapping table and its prototype-name guard, event shape, record binding, fail closed); each failed at least one test, then the code was restored.
- Decision latency (extension handler to result through the loopback Bridge): p50 39.3 ms (1.0.2) and 37.0 ms (1.0.4), p95 54.6 ms and 56.0 ms (n = 100 each), above the 50 ms p95 overhead target. Another worktree's test runs were active on the machine.

What this supports: AMC's decisions at Pi's `tool_call` hook were honoured by these two Pi releases in these cases. It does not cover OS containment, effects outside `tool_call`, or a Pi that does not load the extension (the untrusted-project case shows a write running with no AMC decision). Receipts are signed with the workspace's own monitor key: a local audit trail, not a portable verdict.
