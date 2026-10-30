---
"agent-maturity-compass": patch
---

Governed optimizer runs now draw each candidate's held-out validation from a seeded partition, stratified by failure class and recorded in the signed run. Validation is drawn from unseen cases of the candidate's own failure class, not from tests of other classes. A failure class with only one regression case is blocked. Duplicate test IDs refuse the partition. A tampered partition or split refuses on read. Ranking uses the search split only.

Candidate workspaces now hold only the proposer view: the search split, redacted search-split trajectories with a per-observation cap (minimum 10,000 characters) and gate outcomes. When no trajectory renders, adaptation is refused. Held-out IDs stay in the operator-owned run record.

`amc bench harness-compare` no longer gives the target the oracle command; the target sees only an opaque judge ID. The oracle runs with its own fresh HOME and TMPDIR, and each trial records separate executor and judge identities and time budgets. Reports state that this evaluation is public, not hidden.

`amc casebook verify`, harness-compare readiness and experiment reports now warn about measurement language (such as graded, rubric or score) in agent-facing task text. These warnings never refuse.
