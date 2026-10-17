# P1-18 qualification receipt: the US register as data and the Wealth overlay v0.1

Environment: local run on macOS arm64 (darwin), Node 22, not CI. No network access: P1-18 fetched and hashed nothing.
The five hashed register entries reuse the fetches P1-17 recorded on 2026-10-07 (`qualification/2026-10-07-P1-17/`).

- `receipt.json`: commit, toolchain, every command with its exit code and duration, and the full-suite totals.
- `counts.json`: register entries (verified, unverified, awaiting a legal reviewer), overlay controls with an executed
  test and those waiting for a producer, and the negative fixtures run with the number that passed.
- `mutations.txt`: the spec's two mutation checks (host rule, litigation rule) and the review-gate check.
- `currency-check.txt`: `node scripts/check-regulatory-currency.mjs` on the committed S5 register, and the dated run that
  fails by design once the 2026-10-03 reviews lapse.
- `checks.json`: each check's command, exit code, duration and last output lines.

What the counts mean. A register entry is verified when it carries a content hash of bytes fetched on its
`retrievedAt` and its clause was read from those bytes; that is a statement about the source, not a legal review. All
33 entries await a legal reviewer (D-08). An overlay control counts as executed when one of its fixtures drives a real
enforcement point in a temporary workspace (`tests/catalog/l0/`); most executed tests cover part of the statement, and
`docs/catalog/WEALTH_US.md` says which part. Every control and entry is experimental, agent-drafted and not
independently reviewed.

Full suite: 24,489 tests, 24,469 passed, 20 failed in 10 files, none in a catalog, register or overlay file. The machine's
load average stayed between 12 and 23. Rerun serially with long timeouts, all but three files pass; the three are a
throughput floor (`sessionSpine.performance`), a crash-matrix test that exceeds a 480 s timeout (`keys/atomicRotation`)
and `publicDocsArtifact`, which fails in any git worktree. `receipt.json` notes give the detail.

Not done here: the regulatory calendar step (no `docs/industries/_data/regulatory-milestones.json` or calendar
generator exists on `int`; the four dated events are data in the S5 register), the fetch and hash of the 28 unverified
sources, the legal reviewers' sign-off and Sid's approval of the three new official hosts.
