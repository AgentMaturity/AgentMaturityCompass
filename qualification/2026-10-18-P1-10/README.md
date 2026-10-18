# P1-10 follow-up (P1-10F) qualification: compiled visible tools from the signed tools.yaml

Recorded on a local macOS arm64 machine (darwin 25.6.0, macOS 26.6.2), not in CI, at AMC commit
`8586b7b8732eea7667f16280e4118743ac18f042` (branch `rtd/p1-10f-delegate-visible-tools` after merging `int`
7bc90f324), Node 22.23.3. Other worktrees' runs were active on the machine.

- Change: `compilePlan` takes an optional `signedTools` (`{ config, sha256 }`) that its caller verified, and
  `toolPipeline.visibleTools` is its tools narrowed by the plan's `toolPipeline.visibleTools` parameter; the plan
  records `toolPipeline.toolsConfigSha256`. `amc catalog compile` (`compileCatalogPlan`) passes `.amc/tools.yaml` only
  when bytes, signature and schema verify from one read, else the built-in default list. The `compiled-policy` guard
  denies every call while the live tools.yaml bytes hash to anything but the recorded digest.
- Byte stability (`plan-digests.json`): without `signedTools`, the seven station plans and the L0-IDN-01 fixture plan
  have the same plan digest, policy digest and visible tools at int `d03e63daf` and at this commit.
- Focused and covering tests (`focused-tests.json`): 780/780 in 27 files, `tests/compiledVisibleTools.test.ts` 13/13
  included (P1-46's golden station tests, the L0 harnesses and the P1-79 run-lease tests among them). The full suite
  was not run. A first run at load average about 138 timed out twice in `tests/cliDelegateFlag.test.ts`'s
  workspace setup; the rerun recorded here passed.
- Mutations (`mutations.json`): five, one per guard or rule, each killed by `tests/compiledVisibleTools.test.ts` and
  then restored.
- Checks: build, typecheck, typecheck:tests, lint, check:counts, check:docs-drift, check:freeze (base int),
  check:architecture-boundaries, check:gates, check:schemas, check:api-ref, check:threat-model, check:duplicates and
  check:dead-code exit 0. `npm run release:notes -- --check` exits 1 on four breaking changesets already on int that
  the Migration section does not cite (`claude-code-hooks`, `issuer-admission-at-verification-time`,
  `key-lifecycle-p1-08`, `layer0-enforcement-gaps`); `compiled-visible-tools-signed` is cited.

What this supports: under an activated plan compiled from a verified signed tools.yaml that lists `delegate`, a native
session offers `delegate`, the call runs, and the child it spawns through P1-79's driver runner reads a file; the
delegate call and the child's call both bind the run's lease and its users.yaml principal. Without `delegate` in
tools.yaml, or with a tools.yaml that did not verify at compile, it is hidden and refused. After any tools.yaml change
every call is refused until the plan is recompiled and reactivated, and a recompiled plan that shows more tools needs
`--allow-weakening`. The child runs over a scripted fixture provider, not a real model. Signatures are checked against
the workspace's own keys: a local audit trail, not a portable verdict.
