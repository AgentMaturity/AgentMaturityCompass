# Track S2 — report (round 1 by the worker; repair round 1 on 2026-10-03)

- Status: **COMPLETE** after repair round 1 (monitor verdict REJECTED at 314d9de6; every required fix addressed below)
- Branch: `worktree-wf_5210e2f4-3ea-2`; base `8f57ce63d8331f1bef1c2a18fde82a7e8f4511da`; round 1 HEAD `314d9de6`; repair code HEAD `ddfda721` (this receipt is committed on top)
- Worktree: /Users/sid/AgentMaturityCompass/.claude/worktrees/wf_5210e2f4-3ea-2 (the root checkout was not touched)
- Environment: darwin 25.6.0 arm64, Node v25.5.0, pnpm 10.33.0, vitest 4.1.11

## Repair round 1

Commits: `327c712d` fix (renames + presence contract), `e94ec4ea` feat (platform config check),
`895d7fb5` test (runbook gates), `ddfda721` chore (prose reword so the no-publish/deploy grep stays 0).

### Fix 1 — paths inside the claimed globs
- `git mv scripts/release-credentials-check.mjs scripts/credentials-presence-check.mjs`
- `git mv tests/releaseCredentialsCheck.test.ts tests/credentialPresence.test.ts`
- `git mv docs/DEPLOYMENT_VERIFICATION.md docs/DEPLOYMENT_CONFIRMATION_RUNBOOK.md` (retitled; adds a "What to show before each confirmation" table for B1/B3/B4 and the post-deploy record fields)
- References updated: docs/RELEASE_RUNBOOK.md (B1 commands, deploy-verify credential line, cross-link), result.json, this report, the test's script path.
- `git diff --name-only 8f57ce63..HEAD` → 13 paths, all inside the claims: tracks/S2/{report.md,result.json}, docs/DEPLOYMENT_CONFIRMATION_RUNBOOK.md, docs/RELEASE_RUNBOOK.md, railway.json, scripts/credentials-presence-check.mjs, scripts/deploy-verify.mjs, src/deployVerify/platformDeployConfig.ts, tests/credentialPresence.test.ts, tests/deployVerify.test.ts, tests/deployVerifyConfig.test.ts, tests/deploymentConfirmationRunbook.test.ts, tests/platformDeployConfig.test.ts.
- `pnpm vitest run tests/deployVerify.test.ts tests/credentialPresence.test.ts tests/deployVerifyConfig.test.ts` → 3 files, **18/18** passed. The brief for this round said 19/19; the count is 18 because fix 2 replaced the 8-test presence suite with a 7-test suite for the planner's contract (9 + 7 + 2). All five S2 suites together: 5 files, **25/25**.

### Fix 2 — presence check now satisfies the planner's command
- `HOME=$(mktemp -d) NPM_TOKEN= CHANGESETS_GITHUB_TOKEN= node scripts/credentials-presence-check.mjs --json; echo exit=$?` → exit=1; NPM_TOKEN, CHANGESETS_GITHUB_TOKEN, RAILWAY_TOKEN, VERCEL_TOKEN, GHCR_TOKEN, NPMRC_AUTH_TOKEN_LINE each have exactly the keys `present, requiredFor, configureAt`, all `present:false`. Three more entries with the same shape cover the other credentials the runbook uses (AMC_RELEASE_SIGNING_KEY, HOMEBREW_TAP_TOKEN, AMC_DEPLOY_VERIFY_LEASE). The JSON has no other top-level keys and no value fields.
- NPMRC_AUTH_TOKEN_LINE = some non-comment line of `$HOME/.npmrc` contains `_authToken` (the `grep -c _authToken` presence test, with `;`/`#` comment lines ignored). The line is never returned.
- Canary: `HOME=$(mktemp -d) NPM_TOKEN=s2-canary-value-9f3 node scripts/credentials-presence-check.mjs --json | grep -c s2-canary-value-9f3` → **0**.
- Without `--for` every listed credential is required (exit 1 if any absent); `--for <action>` narrows it (publish, publish-local, sign-release, homebrew, push-image, deploy-railway, deploy-vercel, deploy-verify, all). Exit 2 on usage errors.
- GHCR_TOKEN: GitHub documents that ghcr.io accepts a personal access token (classic) with write:packages from a local shell, and recommends the provisioned GITHUB_TOKEN inside Actions (source below). The runtime scan of `.github/workflows` moved into a test: every `secrets.NAME` there (except the provisioned GITHUB_TOKEN) must be an entry.
- B1 in this worktree shell (2026-10-03T17:53:13Z, presence only): NPMRC_AUTH_TOKEN_LINE=true; NPM_TOKEN, CHANGESETS_GITHUB_TOKEN, AMC_RELEASE_SIGNING_KEY, HOMEBREW_TAP_TOKEN, GHCR_TOKEN, RAILWAY_TOKEN, VERCEL_TOKEN, AMC_DEPLOY_VERIFY_LEASE=false; exit 1. So `~/.npmrc` on this machine has an `_authToken` line. Whether it is valid or has publish rights was not checked (that would need the value).

### Fix 3 — tests/deploymentConfirmationRunbook.test.ts
Asserts in docs/RELEASE_RUNBOOK.md: the `### B3 — Publish — **CONFIRM WITH SID FIRST**` heading; the B3 "Do not run it until you have shown Sid ..." sentence inside the B3 section; the `### B4 — Live deployment — **CONFIRM WITH SID FIRST**` heading; "wait for an explicit yes" inside the B4 section (section = heading to next `##`/`###`). It also checks the link to DEPLOYMENT_CONFIRMATION_RUNBOOK.md and that the file exists. 3/3 pass. Per the brief (plans/2026-09-09-amc-execution-brief.md:355-371), "explicit yes" appears under B4 only, so the planner's "both B3 and B4" mutation reads B4 here. `pnpm check:docs-drift` → passed (327 files scanned).

### Fix 4 — tests/platformDeployConfig.test.ts over src/deployVerify/platformDeployConfig.ts
`checkRepoPlatformDeployConfig(root)` reads package.json, railway.json and vercel.json read-only. The test also confirms package.json's sha256 is unchanged. On the committed files it reports exactly two findings:
- `devDependency-only-start-binary`: `api:start` runs `tsx`, declared only in devDependencies (package.json:172);
- `undocumented-builder`: railway.json `NIXPACKS` is not in Railway's documented set [RAILPACK, DOCKERFILE].
`healthcheckPath` is present (`/api/health`), so there is no missing-healthcheckPath finding. Synthetic cases cover missing healthcheckPath, an unresolved start script, an undeclared binary, a missing vercel build src, and a build src without `export default`. 4/4 pass. railway.json and vercel.json were not changed this round: the check reports, and root decision B4 (retire or keep these targets) is still open.

### Mutations this round (each restored from a scratch backup, then cmp-verified and re-run GREEN)
- `buildReport` adds `value: env[name]` → RED: credentialPresence 2 failed / 5 passed ("--json names each contract credential…" and "never prints a value…") → restored 7/7.
- npmrc detector drops the comment filter → RED: 1 failed / 6 passed ("detects an _authToken line … ignoring comments") → restored 7/7.
- `classifyBinary` reads dependencies only (devDependencies branch deleted) → RED: platformDeployConfig 3 failed / 1 passed ("tsx is devDependency-only…" and two more) → restored 4/4.
- builder guard `!RAILWAY_DOCUMENTED_BUILDERS.includes(builder)` → `false` → RED: 3 failed / 1 passed → restored 4/4.
- Delete "wait for an explicit yes" under B4 → RED: runbook 1 failed / 2 passed → restored 3/3. Also tried: move the phrase out of B4 into B3 → RED (the check is scoped to the section) → restored.
- Process note: the first restore used `git checkout --`. That restored the staged rename (the round 1 content), not the rewrite. The rewrite was restored from the scratch backup, cmp-verified, and re-run 7/7 before committing.

### Other checks this round
- `pnpm typecheck` exit 0; `pnpm typecheck:tests` 0 `error TS` lines.
- `node scripts/architecture-boundaries-check.mjs` → failures []; no new file over 800 lines (largest new: credentials-presence-check.mjs 152, platformDeployConfig.ts 126).
- `git diff 8f57ce63...HEAD --stat -- package.json api/index.ts deploy docker .github | wc -l` → 0; the publish/deploy invocation grep → 0 (it had briefly hit 3 on prose, which `ddfda721` reworded).
- Dirty-list grep (codex-dirty-root-20261003.txt) → 0; no path in codex-dirty-paths.json; no forbidden path; package.json/pnpm-lock.yaml untouched; no new dependency.
- `node scripts/deploy-verify.mjs --target http://127.0.0.1:1` → exit 1 (fails closed; unchanged).

### Accepted-divergence request (monitor defect, low)
The governed turn is a leased gateway chat completion with an Ed25519 receipt (src/gateway/server.ts:1638-1662), not the planner's native-task + `/verify`. No public /api/v1 route mints a receipt. The orchestrator should record this as an accepted divergence or ask for the native-task probe in a later round. This round did not change it.

---

# Round 1 record (paths updated to the renamed files)

## Commits
- fa7b6f38 feat: add post-deploy governed-turn verifier and credentials presence check
- a89508b2 refactor: drop deploy-verify guards that mutation showed were already covered
- d6a0beec docs: add B0-B4 release gates and deployment verification record
- 1d67aecf docs: add S2 track result receipt

## Files changed
- `scripts/deploy-verify.mjs`
- `scripts/credentials-presence-check.mjs (round 1 schema, since replaced)`
- `railway.json`
- `docs/RELEASE_RUNBOOK.md`
- `docs/DEPLOYMENT_CONFIRMATION_RUNBOOK.md`
- `tests/deployVerify.test.ts`
- `tests/deployVerifyConfig.test.ts`
- `tests/credentialPresence.test.ts (round 1 suite, since replaced)`
- `AMC_OS/RESEARCH/2026-10-03-regulated-platform-program/tracks/S2/result.json`

## Commands run
- `pnpm vitest run tests/deployVerify.test.ts tests/credentialPresence.test.ts (round 1 suite, since replaced) tests/deployVerifyConfig.test.ts (before implementation)` → RED: 3 files failed, 18 failed / 1 passed. The one pass was the vercel config test, which already holds at HEAD.
- `same 3 files after implementation and the railway.json healthcheckPath change` → GREEN: 19/19 passed
- `pnpm vitest run tests/deployVerify.test.ts tests/credentialPresence.test.ts (round 1 suite, since replaced) (final)` → 2 files, 17/17 passed
- `pnpm vitest run tests/deployVerifyConfig.test.ts (final)` → 2/2 passed
- `node scripts/deploy-verify.mjs --target http://127.0.0.1:49159 --gateway http://127.0.0.1:49160 --monitor-pubkey <copy of the temp workspace's monitor_ed25519.pub> --lease-file <scratch lease> (local Studio from dist/cli.js plus a fake OpenAI-compatible upstream)` → exit 0, pass=true. Checks: health 43ms, readiness 54ms, governed-turn 46ms, receipt-signature 1ms, receipt-binding 0ms; total 147ms. llm_response receipt e7d04b9a-52cc-41c2-983b-7cf0e15e1cde commits to the 228 response bytes received. The lease does not appear in the result.
- `same, with --monitor-pubkey .amc/keys/monitor_ed25519.pub (a different workspace's key)` → exit 1. receipt-signature FAIL (pinned fpr c2bb9066186cc14e, target claims c3b625da0192c0d9); receipt-binding FAIL
- `PORT=43213 npm run api:start, then node scripts/deploy-verify.mjs --target http://127.0.0.1:43213` → /api/health returned 200. The verifier exited 1: healthz and readyz returned 404, and there is no lease or gateway. This is expected, because the Railway/Vercel lite API has no governed path.
- `gh secret list --repo AgentMaturity/AgentMaturityCompass --json name,updatedAt (at 2026-10-03T16:22:54Z, token with admin permission)` → [] (no repository Actions secrets). The github-pages environment also returned []. The org listing returned 404 because AgentMaturity is a User account.

## Typecheck
pnpm typecheck: exit 0. pnpm typecheck:tests: exit 0, with 0 'error TS' lines.

## Acceptance self-report
- [x] pnpm vitest run tests/deployVerify.test.ts tests/credentialPresence.test.ts (round 1 suite, since replaced): all pass — `pnpm vitest run tests/deployVerify.test.ts tests/credentialPresence.test.ts (round 1 suite, since replaced)` → Test Files 2 passed (2), Tests 17 passed (17)
- [x] NPM_TOKEN=sentinel-value: output contains 'NPM_TOKEN: SET' and never the sentinel — `env -u NPM_TOKEN -u CHANGESETS_GITHUB_TOKEN NPM_TOKEN=sentinel-value node scripts/credentials-presence-check.mjs (round 1 schema, since replaced) --for publish` → The output contains '  NPM_TOKEN: SET  - repo secret; ...' and has no 'sentinel' substring. Exit is 1 because publish also requires CHANGESETS_GITHUB_TOKEN, which was unset ('missing for publish: CHANGESETS_GITHUB_TOKEN').
- [x] With NPM_TOKEN unset: exit 1 and NPM_TOKEN named — `env -u NPM_TOKEN -u CHANGESETS_GITHUB_TOKEN node scripts/credentials-presence-check.mjs (round 1 schema, since replaced) --for publish` → exit=1, 'NPM_TOKEN: UNSET', 'missing for publish: NPM_TOKEN, CHANGESETS_GITHUB_TOKEN'
- [x] deploy-verify against http://127.0.0.1:1: non-zero exit with fail-closed JSON — `node scripts/deploy-verify.mjs --target http://127.0.0.1:1` → exit=1. The stdout JSON has pass=false and all 5 required checks FAIL; health detail is 'fetch failed: bad port'.
- [x] docs/RELEASE_RUNBOOK.md names the B3 and B4 confirmation gates verbatim from the brief — `node string-inclusion check of 4 strings from the brief against docs/RELEASE_RUNBOOK.md` → All 4 strings are present verbatim: '### B3 — Publish — **CONFIRM WITH SID FIRST**', '### B4 — Live deployment — **CONFIRM WITH SID FIRST**', the B3 'Do not run it until you have shown Sid ...' sentence, and the B4 'Then show Sid the target, the digest, the rollback, and wait for an explicit yes.' sentence.

## Mutation checks
- A receipt signature failure must fail the run (verifyReceiptSignature in scripts/deploy-verify.mjs) — mutation: `return ok ? {ok:true,...}` changed to `return ok || true ? ...` — RED: tests/deployVerify.test.ts: 1 failed / 8 passed. The failing test was 'fails closed when the receipt signature does not verify against the pinned key' (expected 'PASS' to be 'FAIL'). — restored: git checkout -- scripts/deploy-verify.mjs, then 9/9 passed
- The credentials check never prints a value (renderText in scripts/credentials-presence-check.mjs (round 1 schema, since replaced)) — mutation: appended `${process.env[c.name] ?? ""}` to each required-credential line — RED: tests/credentialPresence.test.ts (round 1 suite, since replaced): 2 failed / 6 passed. The failing tests were 'reports SET ... never prints its value' and 'never prints any value ... for every name'. — restored: git checkout -- scripts/credentials-presence-check.mjs (round 1 schema, since replaced), then 8/8 passed
- A missing required check fails the run (evaluateChecks) — mutation: removed `missingChecks.length === 0 &&` — RED: 1 failed / 8 passed ('a missing required check fails the run even when every present check passed') — restored: restored, then 9/9 passed
- Rule-7 probe: the explicit 'no pinned monitor key' early return — mutation: deleted the guard — RED: Stayed GREEN at 9/9: `[].some()` is already false, so the guard was decoration — restored: The guard was removed rather than restored (commit a89508b2). The redundant `checks.length > 0` clause was removed too, since evaluateChecks([]) already fails on missing checks.

## Sources
- Railway Config as Code reference (deploy.healthcheckPath exists; builders listed are RAILPACK (default) and DOCKERFILE; NIXPACKS is not listed) <https://docs.railway.com/reference/config-as-code> retrieved 2026-10-03 verified=True
- Railway Healthchecks guide (any 2xx passes; default timeout 300s; uses the injected PORT) <https://docs.railway.com/guides/healthchecks> retrieved 2026-10-03 verified=True
- Railway Nixpacks reference (did not state deprecation status; unverified) <https://docs.railway.com/reference/nixpacks> retrieved 2026-10-03 verified=False

## Not exercised
- No deploy to Railway, Vercel or any live host, and no image build or push. B3 and B4 need owner confirmation.
- vercel.json was never built or run with @vercel/node; only the existence of its build and route entries is tested.
- The receipt's event_hash is not checked against the target's ledger, because an HTTP probe has no ledger access.
- Streaming or trailer receipts (x-amc-receipt-trailer), tool execution, approvals and the dashboard were not exercised.
- Gateway response redaction was not exercised. If the gateway redacts a body, body_sha256 will not match and receipt-binding fails closed.
- The other session's standalone API build (scripts/build-standalone-api.mjs, scripts/standalone-api-smoke.mjs) is uncommitted in root. It was not read or run, and is documented as a pending dependency.
- Results were not reproduced in a fresh clone. They are worktree results at the commits listed.
- Whether Railway still honours the NIXPACKS builder is unverified, as is whether it keeps the tsx devDependency at runtime.

## Blockers
- Brief step B1 (measured 2026-10-03T16:22:54Z): the GitHub repository has zero Actions secrets. NPM_TOKEN, CHANGESETS_GITHUB_TOKEN, AMC_RELEASE_SIGNING_KEY and HOMEBREW_TAP_TOKEN are all absent, and all 8 checked names are UNSET in the local shell. Per B1, stop and ask Sid for them. This also explains the stalled Changesets automation.
- The track report.md was not written: the subagent harness refused to create a report .md file. Its content is in notesForMonitor, and result.json was committed as the receipt.

## Ready-to-wire diff
```
package.json, not applied because package.json is unclaimable:
   "scripts": {
+    "deploy:verify": "node scripts/deploy-verify.mjs",
+    "check:credentials-presence": "node scripts/credentials-presence-check.mjs",
Nothing depends on this. The runbook calls both scripts as `node scripts/...`.
```

## Notes for monitor
WHAT CHANGED (file:line):
- scripts/deploy-verify.mjs (250 lines). Five required checks: health :127 (GET /healthz), readiness :135 (GET /readyz), governed-turn :144 (a leased POST <gateway><route>/v1/chat/completions that must return x-amc-receipt), receipt-signature :163 (Ed25519 check against a monitor key pinned with --monitor-pubkey; the key is never fetched from the target) and receipt-binding :175 (kind=llm_response, body_sha256 equals sha256 of the bytes received, agentId matches, ts within the request window ±5min).
  - evaluateChecks :33 passes only when every REQUIRED_CHECK is present and exactly PASS. verifyReceiptSignature :44 mirrors src/receipts/receipt.ts verifyReceipt.
  - The lease comes from AMC_DEPLOY_VERIFY_LEASE or --lease-file and is never output. The result JSON records verifierCommit, tree-dirty, targetReportedVersion, node/platform/arch, per-check durationMs, the receipt id and sha256, and a notExercised list.
  - Exit codes: 0 pass, 1 fail, 2 usage. Node built-ins only.
- scripts/credentials-presence-check.mjs (round 1 schema, since replaced) (127 lines). ACTIONS :27 covers publish, sign-release, push-image, deploy-railway, deploy-vercel, homebrew and deploy-verify, plus all. presence :49 tests only whether a value is non-blank. workflowSecretNames :55 scans .github/workflows at runtime for secrets.NAME.
- railway.json:8 adds healthcheckPath /api/health. startCommand `npm run api:start` already matched package.json at HEAD. vercel.json is unchanged; its entries exist.
- docs/RELEASE_RUNBOOK.md:9-96 adds a Phase B gates (B0-B4) section with commands and the verbatim B3/B4 gates. A tag push is marked as a B3 action (release.yml publishes to npm).
- docs/DEPLOYMENT_CONFIRMATION_RUNBOOK.md covers what the verifier proves and does not, which targets can pass, the pending standalone-API dependency, open questions, and the local run record.
- tests/deployVerify.test.ts (9 tests) uses an in-process stand-in target whose receipts are minted by the real mintReceipt. tests/credentialPresence.test.ts (round 1 suite, since replaced) has 8 tests. tests/deployVerifyConfig.test.ts has 2 tests: the railway script and entry exist, healthcheckPath is served, and the vercel entries exist.

WHY THE GATEWAY: no public /api/v1 route mints a receipt. The gateway (src/gateway/server.ts:1638-1662) sets x-amc-receipt and x-amc-monitor-pub-fpr on an llm_response receipt, the same cycle src/e2e/smoke.ts exercises.

PROCESS CLOSURE: every process started for the local runs was stopped and confirmed gone.
- Lite API PIDs 60640/60711/60757 on port 43213 were killed. pgrep finds nothing and the port is not listening.
- Harness PID 70120 and Studio PID 70263 were stopped with SIGTERM; the harness logged CLOSED. pgrep finds nothing, and ports 49159-49163 and 49165 are not listening.
- The temp workspace and the scratch lease file were deleted.
- The scratch harness is at /private/tmp/claude-501/-Users-sid-AgentMaturityCompass/39a2e918-fc29-48df-9148-bb8801c84571/scratchpad/s2/local-target.mjs and is not committed. Result JSONs are in the same directory: verify-local-studio.json, verify-local-studio-wrongkey.json, verify-lite-api.json.

FINDINGS FOR ROOT:
(1) The B1 credentials gap is listed under blockers.
(2) railway.json and vercel.json deploy only the lightweight api/index.ts. It has no governed turn or receipts and can never pass deploy-verify; only the Docker Studio+gateway image can.
(3) api/index.ts (the other session's file) returns hard-coded health values: version '1.0.0' while the package is 1.2.0, plus fixed counts (questions 240, modules 75, assurancePacks 147, sectorPacks 40). Under evidence rule 1 these are unmeasured numbers. The server also binds all interfaces.
(4) railway.json pins builder NIXPACKS, which Railway's current reference does not list.

The worktree is clean (git status --porcelain is empty). .amc/keys was not modified. Linear AMC-483 and AMC-7: report only.