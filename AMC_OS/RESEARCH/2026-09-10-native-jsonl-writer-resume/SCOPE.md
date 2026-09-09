# Native JSONL writer resume — bounded implementation scope

Task: `native-jsonl-writer-resume-batch`. Serial executor and source reviewer:
`cos-native-jsonl-writer-resume-prime` through Chat on Steroids. No Codex execution,
model workers, recorded-conversation load, Graphify, Loop or session_finish.
Existing Linear coverage: AMC-1511 under AMC-1505; no new issue or state transition.

Implementation `96accade0821eaf730d30218dfc5851b667f98f0`; corrected final runtime
`b516869eeaa275fe31248024a02596d71255add0`, branch `amc/gap-register-execution`.
Input source/handoff remain `d9693bc1b24a5cd17a78ca4b6873075decdb1802` and
`efd29a0d32c98fbdd18df6d02a7f32bc0c944ea4`.

## Implemented boundary

JSONL remains native evidence storage. A dedicated process-lifetime exclusive
kernel mutex uses the existing SQLite binding only for local coordination, not
session history, budgets or authority. Before append descriptors open, original
selected history, trust/workspace/session/agent identity, original execution
configuration, complete line boundaries, signed ownership and actual accounting
are checked again under that mutex. The existing signed owner/head fence and
synthetic recovery semantics are reused. Live/unknown/foreign owners are not stolen.

Recovery appends to the same session without changing its historical prefix.
Acknowledged effects are not rerun; uncertain tool/model outcomes and reservations
remain unresolved. Original admitted/pending IDs and provenance remain recorded.
Continuation requires a new explicit turn, not an implicit replay or new session.

Released completed or user-cancelled turns can continue. Closed/archived sessions
are not widened into resumable ones. Parent/hook-stopped sessions, detached children
and unresolved controlling relationships visibly refuse instead of losing their
controls. Unsupported/tampered/missing history or original accounting also refuses.
Retained-output decryption is separate from authenticated metadata readiness.

The existing SDK and actual ACP CLI reach the same core. Studio's authenticated
operator/revision/body/intent/CSRF rules remain; eligible JSONL sessions now offer
real Resume with public recovery state. Lost observation/control still requires
explicit refresh. Read-only history and eligibility never grant write authority.

## Measured evidence

Fresh source candidate02: 23/23 new scoped tests, including real killed writers,
one-winner contention, unchanged bytes/effects/usage, SDK/actual CLI, HTTP and actual
Chromium. Changed-security checks: four mutated guards detected, then identical
source restoration and 20/20 new core positives. New installed consumer: public
root/native SDK, packaged ACP CLI and admin-authenticated HTTP at the same runtime
pin, with installed payload hashes matched to the fresh build.

Only Darwin 25.6.0 arm64 / Node v25.5.0 / pnpm 10.33.0, measured Chromium
147.0.7727.15, automated fixture identities and deterministic local stub are covered.
Browser evidence is fresh built-source, not installed-browser or human evidence.
The installed consumer does not qualify cookie/CSRF or workspace-tool approval
scenarios; the scoped source HTTP checks cover their existing admission boundary.

`npm pack --ignore-scripts` created an unshipped local test artifact. No prepack,
full-suite, release, real provider/human, platform matrix, production key rotation,
publication/deployment, parity, superiority or measured-10x conclusion follows.

## Preservation and completion

No audit restart, unrelated staging/worktree removal, stash/reset/amend/push,
historical erasure consumer or denied helper-repin staging occurred. Shared stash,
external brief, architecture navigation and unrelated dirty work remain preserved.
Old review blocks and pending exact tracker bodies remain unchanged. Central-status
refresh proposals were refused and are not current; use this batch's ownership and
handoff records. Closure confirmed all 40 command groups, 31 recorded fixture-owner
PIDs and six fixture ports gone/closed, plus actual browser closure, without killing
unrelated processes. See `process-closure.json` for exact observations.
