# P1-10 follow-up (P1-10F) qualification: compiled visible tools from the signed tools.yaml

Recorded on a local macOS arm64 machine (darwin 25.6.0, macOS 26.6.2), not in CI, at AMC commit
`9c83b6bed209d7a586a147cc5aa7f5e63e5b02b2` (branch `rtd/p1-10f-delegate-visible-tools` after merging `int`
dc416268d (P1-34) and both independent reviews' fixes), Node 22.23.3. Other worktrees' runs were active on the machine
(load average about 20 to 35).

- Change: `compilePlan` takes an optional `signedTools` (`{ config, sha256 }`) that its caller verified, and
  `toolPipeline.visibleTools` is its tools narrowed by the plan's `toolPipeline.visibleTools` parameter; the plan
  records `toolPipeline.toolsConfigSha256`. `compileInputs` (`src/catalog/compileInputs.ts`) gives `amc catalog compile` and A4
  Adapt the same inputs: no tools.yaml gives the built-in default list; one that does not verify
  refuses with `TOOLS_CONFIG_UNVERIFIED`. A plan that drops the binding is a weakening. A native session reads and
  verifies tools.yaml once per guard pass, and the plan's digest check, egress, the allowlist and the native tool
  identity decide from those bytes.
- Byte stability: without `signedTools`, the seven station plans and the L0-IDN-01 fixture plan match int `d03e63daf`
  (`plan-digests.json`), and after the P1-34 merge every no-tools plan matches int `dc416268d` (`plan-digests-int.json`).
- Focused and covering tests (`focused-tests.json`, four workers): 1347/1347 in 84 files,
  `tests/compiledVisibleTools.test.ts` 23/23 included, with P1-46's golden station tests, the L0 harnesses, the P1-79
  run-lease tests and every test file importing the changed guards, toolset, CLI, Adapt or tools.yaml validator. The full
  suite was not run.
- Mutations (`mutations.json`): thirteen, each killed by `tests/compiledVisibleTools.test.ts` and then restored; M6 to
  M9 cover the first review's findings and the A4 Adapt wiring, M10 to M13 the re-review's (Review's tools.yaml check,
  the tools-binding wording, the path-free unreadable reason, one compile input set for the CLI and Adapt).
- The review's repros (`p110f-review`, outside the repository): W7 (a dropped binding) is now flagged, and F1, K1 and
  Y1 (a tools.yaml that does not verify) now refuse the compile with `TOOLS_CONFIG_UNVERIFIED` instead of falling back
  to the default list. RT1-4 still refuses a missing file, a removed signature and a signed rollback without naming a
  host path; its missing-file text is now "cannot be read or verified (tools config missing)" instead of "(ENOENT)".
  S4 (an unreadable tools.yaml) now reads "tools config unreadable (EACCES)" with no host path. G1 imports the renamed
  `src/catalog/signedTools.js` and calls signPlan directly; the A4 Review check is tested through openPlanReview here.
- Checks: build, typecheck, typecheck:tests, lint, check:counts, check:docs-drift, check:freeze (base int),
  check:architecture-boundaries, check:gates, check:schemas, check:api-ref, check:threat-model, check:duplicates,
  check:dead-code, `release:notes -- --check` and check:qualification exit 0 (after the P1-34 merge).

What this supports: under an activated plan compiled from a verified signed tools.yaml that lists `delegate`, a native
session offers `delegate`, the call runs, and the child it spawns through P1-79's driver runner reads a file; the
delegate call and the child's call both bind the run's lease and its users.yaml principal. Without `delegate` in
tools.yaml it is hidden and refused; a tools.yaml that does not verify refuses the compile. After any tools.yaml change
every call is refused until the plan is recompiled and reactivated, and a recompiled plan that shows more tools, or
binds no tools.yaml, needs `--allow-weakening`. A4 Adapt's Understand compiles with the CLI's inputs (one plan digest), Review refuses a plan whose
tools.yaml changed since Build (`TOOLS_CONFIG_CHANGED`), and the A4 tests drive Understand, Build (signAdaptPlan) and
Review (openPlanReview) on a constructed project state, not a full router run. The child runs over a scripted fixture
provider, not a real model. Signatures are checked against the workspace's own keys: a local audit trail, not a
portable verdict.
