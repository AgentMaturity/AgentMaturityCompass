# IMPL-2 — Studio agent token scopes

**Commit** fa2ffac6733fb67ee525f64c2da436365fa7f697 (detached in worktree `/Users/sid/AgentMaturityCompass/.claude/worktrees/wf_3cc93fba-030-1`; the worktree had been provisioned at main 3d6b8d4a, 409 commits behind, so I detached my own checkout at the named commit — no branch moved, no reset, nothing outside the worktree touched).
**Environment** Darwin 25.6.0 arm64, Node v25.5.0, pnpm 10.33.0. `pnpm install --frozen-lockfile --prefer-offline` OK; `pnpm build` run only because `tests/studioNativeTaskService.test.ts` imports `dist/`.

## What changed
- `src/studio/studioState.ts` (222 → 345 lines): `AGENT_TOKEN_SCOPES`, `AgentTokenGrant`/`AgentTokenGrantSource`, `AgentTokenGrantError`, `agentTokenGrantFromActionPolicy`, `agentTokenGrantFromLease`, `issueAgentToken`, `agentTokenWidenText`; `ensureAgentToken(workspace, agentId, grant?)` derives the grant from the signed action policy when none is given and never widens an existing token; meta v2 records `executeActionClasses` + `grantedBy`; legacy v1 meta fails closed for execute classes; `readAgentToken`/`findAgentByToken` return the grant; token path helpers exported.
- `src/studio/studioServer.ts` (+110/−?): `scopeRefusal` and `agentExecuteClassCheck` helpers next to `hasScope`; the five `missing scope …` sites now return `refusedBy`/`widen` for static-token agents (error strings unchanged); `/toolhub/execute` refuses a static-token execute whose grant excludes the intent's action class after the lease check and before `executeIntent`; `GET /agents` fails closed per agent instead of minting under an invalid policy.
- `tests/studioAgentTokenScopes.test.ts` (new, 288 lines): 6 unit + 4 loopback-HTTP tests against the real Studio server, ToolHub, approvals and fs.write in a temp workspace.

## Results (all measured this run)
- New file: RED first (9 failed / 1 passed — the one pass is the lease-only boundary case, by design), then 10/10 green.
- 14 files (`studioAgentCredentialBinding`, `studioApiAuthorization`, `studioCliBridgeAuthz`, `studioNativeTask*` ×6, `cosProduct10*` ×4, new file): 142 passed, 10 skipped (dist-backed) before build; after `pnpm build` the 10 pass → 152/152, 0 failed.
- Typechecks: `tsc -p tsconfig.json` exit 0; `tsc -p tsconfig.tests.json` exit 0.
- Mutations: 6/6 went RED (see structured list). **M1** is the brief §2 rule-7 proof: with only the new route check disabled and the live policy allowing WRITE_LOW, the execute returned 200 `allowed:true` and wrote the sentinel — the governor's `action-policy-execute` condition does not cover a token grant narrower than the live policy.

## Named limitation
Execute-scope granularity is enforced on the **static token** grant (meta `executeActionClasses`). A **lease** cannot name an action class: `leaseScopeSchema` (`src/leases/leaseSchema.ts`) is a closed enum outside this track's write scope. Lease-only requests are decided by the governor's signed action policy alone; the test file asserts that boundary explicitly and the refusal/grant texts name it.

## Not exercised
Full suite, release gate, packaged/platform qualification, CLI paths, gateway/proxy/wire/hook scopes, browser. Side effect reverted: the 14-file batch rotated tracked `.amc/keys/*` fixtures (not this track's change; restored via `git checkout -- .amc/keys`; not attributed to a single file).

Tool calls used: about 47 of 150.