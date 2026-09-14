## IMPL-3 — subagent hook-control inheritance

**Commit:** 2eed9bee49587e1e7a2197d3b2c1c973b0e61728 (amc/gap-register-execution) + uncommitted edits in worktree `/Users/sid/AgentMaturityCompass/.claude/worktrees/wf_453236ab-c47-1`
**Environment:** Darwin 25.6.0 arm64, Node v25.5.0, pnpm 10.33.0, vitest 4.1.11; `pnpm install --frozen-lockfile --prefer-offline` exit 0.
**Worktree note:** the worktree was handed over at 3d6b8d4a (scoped files absent). Fast-forwarded my own worktree branch to 2eed9bee with `git merge --ff-only` (ancestor confirmed). No commit, no other tree touched.

### What changed
- `src/agent/loopTypes.ts` (+13): `export type LoopHookControl = Pick<LoopHooks, "preStep" | "turnStopping">` with a note on why `notify` is excluded.
- `src/agent/subagentRunner.ts` (+87/−1): `DriverRunnerInit.hookControl?`; `childHooks(control)` builds the child's `LoopHooks` and the `inherited` list from one snapshot; `recordHookControl(...)` writes one signed `audit` row (`kind: "delegation/hook-control"`, `version: 1`) into the child's session before the driver exists; `new AgentDriver({... hooks ...})`.
- `src/kernel/agentLoopRunner.ts` (+5): `hookControl: hooks` on the native `createDriverRunner` call — the same object the root loop runs under.
- `tests/subagentHookInheritance.test.ts` (new, 6 tests).
- `src/agent/delegateTool.ts`: in scope, unchanged (control flows via the runner).

### Row shape (child session, before `turn/start`)
`{kind, version:1, source:"parent-loop"|"none", inherited:["preStep","turnStopping"]|[], approvalGate:{actionClass,riskTier,toolNames|null}|null, stopConditions, descendantStopConditions, delegationScope, descendantDelegationScope, governedAs, runAs, depth}` — the signed declaration the child was spawned under plus the narrower limits it passes on (extends AMC-1545's `descendantStopConditions`).

### Evidence (all produced this session)
| Run | Result |
|---|---|
| New file before implementation | 6 failed / 0 passed (RED for the right reasons: child called the model, turnStopping not called, no row) |
| New file after implementation | 6 passed |
| Related set: `vitest run subagent delegat Delegat kernelDelegationGrant nativeChildStopOutput nativeDelegationInheritance agentLoop composedTurn` (26 files, enumerated) | 279 passed, 0 failed, 0 skipped, 34.5 s |
| Baseline at 2eed9bee before edits (13-file subset) | 142 passed |
| `pnpm typecheck` / `pnpm typecheck:tests` | exit 0 / exit 0 |

**Mutations (each applied, run, restored byte-identical — `diff` against backup empty):**
M1 drop `hooks` from AgentDriver → 2 RED; M2 drop the record → 4 RED; M3 drop `hookControl: hooks` in kernel → 1 RED; M4 record claims inheritance when none → 1 RED; M5 preStep passes through to `next()` → 1 RED.

### Not exercised / open
- Foreign runners (`options.delegation.runner`, `ledger/monitor.ts spawnGovernedChild`) bypass `createDriverRunner`: no inherited control and no absence row on that path (out of scope; next step in `subagentSpawn.ts`).
- The inherited `contextPreStep` refreshes plugins with the parent's sessionId when running under the child; plugin attribution not tested.
- Full suite, `pnpm build`, e2e, real provider transport, package/platform qualification: not run.