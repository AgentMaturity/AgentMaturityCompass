# P1-10 follow-up (P1-10F) qualification: compiled visible tools from the signed tools.yaml

Recorded on a local macOS arm64 machine (darwin 25.6.0, macOS 26.6.2), not in CI, at AMC commit
`5ce0d67844f711f98ae200876c87d11f43465855` (branch `rtd/p1-10f-delegate-visible-tools` after merging `int`
737c8738c and the independent review's fixes), Node 22.23.3. Other worktrees' runs were active on the machine
(load average about 20 to 35).

- Change: `compilePlan` takes an optional `signedTools` (`{ config, sha256 }`) that its caller verified, and
  `toolPipeline.visibleTools` is its tools narrowed by the plan's `toolPipeline.visibleTools` parameter; the plan
  records `toolPipeline.toolsConfigSha256`. `verifiedSignedTools` (`src/catalog/signedTools.ts`) is the one reader both
  `amc catalog compile` and A4 Adapt use: no tools.yaml gives the built-in default list; one that does not verify
  refuses with `TOOLS_CONFIG_UNVERIFIED`. A plan that drops the binding is a weakening. A native session reads and
  verifies tools.yaml once per guard pass, and the plan's digest check, egress, the allowlist and the native tool
  identity decide from those bytes.
- Byte stability (`plan-digests.json`): without `signedTools`, the seven station plans and the L0-IDN-01 fixture plan
  have the same plan digest, policy digest and visible tools at int `d03e63daf` and at this commit.
- Focused and covering tests (`focused-tests.json`, four workers): 1011/1012 in 49 files,
  `tests/compiledVisibleTools.test.ts` 17/17 included (P1-46's golden station tests, the L0 harnesses, the P1-79
  run-lease tests and every test file importing the changed guards, toolset, CLI or Adapt module). The one failure,
  `tests/nativeShellComposition.test.ts` "Studio's operator-only opt-in", is the 30 s test timeout (52 s under load,
  31 s alone): it starts five Studio task services with `tools: "none"` and reaches no changed code. Alone with
  `--testTimeout 180000` the file passes 17/17. The full suite was not run.
- Mutations (`mutations.json`): nine, each killed by `tests/compiledVisibleTools.test.ts` and then restored; M6 to M9
  cover the review's three findings and the A4 Adapt wiring.
- The review's repros (`p110f-review`, outside the repository): W7 (a dropped binding) is now flagged, and F1, K1 and
  Y1 (a tools.yaml that does not verify) now refuse the compile with `TOOLS_CONFIG_UNVERIFIED` instead of falling back
  to the default list. RT1-4 still refuses a missing file, a removed signature and a signed rollback without naming a
  host path; its missing-file text is now "cannot be read or verified (tools config missing)" instead of "(ENOENT)".
- Checks: build, typecheck, typecheck:tests, lint, check:counts, check:docs-drift, check:freeze (base int),
  check:architecture-boundaries, check:gates, check:schemas, check:api-ref, check:threat-model, check:duplicates,
  check:dead-code, `release:notes -- --check` and check:qualification exit 0.

What this supports: under an activated plan compiled from a verified signed tools.yaml that lists `delegate`, a native
session offers `delegate`, the call runs, and the child it spawns through P1-79's driver runner reads a file; the
delegate call and the child's call both bind the run's lease and its users.yaml principal. Without `delegate` in
tools.yaml it is hidden and refused; a tools.yaml that does not verify refuses the compile. After any tools.yaml change
every call is refused until the plan is recompiled and reactivated, and a recompiled plan that shows more tools, or
binds no tools.yaml, needs `--allow-weakening`. A4 Adapt's Understand compiles from the same verified tools.yaml; the
A4 test covers Understand and the revision's tools slot, not a full router run. The child runs over a scripted fixture
provider, not a real model. Signatures are checked against the workspace's own keys: a local audit trail, not a
portable verdict.
