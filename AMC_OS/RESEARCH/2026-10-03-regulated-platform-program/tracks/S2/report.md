# Track S2 — worker report (backfilled by the root session from the structured return; the harness refused the subagent's .md write)

- Status (self-report): **COMPLETE**
- Branch: `worktree-wf_5210e2f4-3ea-2`; HEAD before `8f57ce63d8331f1bef1c2a18fde82a7e8f4511da` → after `1d67aecfb96429a9867defae718a2fd3dcec3097`
- Environment: darwin 25.6.0 arm64, Node v25.5.0, pnpm 10.33.0, vitest 4.1.11. Work was done in an isolated worktree at base 8f57ce63; the root checkout was not touched.
- Receipt path (as reported): /Users/sid/AgentMaturityCompass/.claude/worktrees/wf_5210e2f4-3ea-2/AMC_OS/RESEARCH/2026-10-03-regulated-platform-program/tracks/S2/result.json

## Commits
- fa7b6f38 feat: add post-deploy governed-turn verifier and credentials presence check
- a89508b2 refactor: drop deploy-verify guards that mutation showed were already covered
- d6a0beec docs: add B0-B4 release gates and deployment verification record
- 1d67aecf docs: add S2 track result receipt

## Files changed
- `scripts/deploy-verify.mjs`
- `scripts/release-credentials-check.mjs`
- `railway.json`
- `docs/RELEASE_RUNBOOK.md`
- `docs/DEPLOYMENT_VERIFICATION.md`
- `tests/deployVerify.test.ts`
- `tests/deployVerifyConfig.test.ts`
- `tests/releaseCredentialsCheck.test.ts`
- `AMC_OS/RESEARCH/2026-10-03-regulated-platform-program/tracks/S2/result.json`

## Commands run
- `pnpm vitest run tests/deployVerify.test.ts tests/releaseCredentialsCheck.test.ts tests/deployVerifyConfig.test.ts (before implementation)` → RED: 3 files failed, 18 failed / 1 passed. The one pass was the vercel config test, which already holds at HEAD.
- `same 3 files after implementation and the railway.json healthcheckPath change` → GREEN: 19/19 passed
- `pnpm vitest run tests/deployVerify.test.ts tests/releaseCredentialsCheck.test.ts (final)` → 2 files, 17/17 passed
- `pnpm vitest run tests/deployVerifyConfig.test.ts (final)` → 2/2 passed
- `node scripts/deploy-verify.mjs --target http://127.0.0.1:49159 --gateway http://127.0.0.1:49160 --monitor-pubkey <copy of the temp workspace's monitor_ed25519.pub> --lease-file <scratch lease> (local Studio from dist/cli.js plus a fake OpenAI-compatible upstream)` → exit 0, pass=true. Checks: health 43ms, readiness 54ms, governed-turn 46ms, receipt-signature 1ms, receipt-binding 0ms; total 147ms. llm_response receipt e7d04b9a-52cc-41c2-983b-7cf0e15e1cde commits to the 228 response bytes received. The lease does not appear in the result.
- `same, with --monitor-pubkey .amc/keys/monitor_ed25519.pub (a different workspace's key)` → exit 1. receipt-signature FAIL (pinned fpr c2bb9066186cc14e, target claims c3b625da0192c0d9); receipt-binding FAIL
- `PORT=43213 npm run api:start, then node scripts/deploy-verify.mjs --target http://127.0.0.1:43213` → /api/health returned 200. The verifier exited 1: healthz and readyz returned 404, and there is no lease or gateway. This is expected, because the Railway/Vercel lite API has no governed path.
- `gh secret list --repo AgentMaturity/AgentMaturityCompass --json name,updatedAt (at 2026-10-03T16:22:54Z, token with admin permission)` → [] (no repository Actions secrets). The github-pages environment also returned []. The org listing returned 404 because AgentMaturity is a User account.

## Typecheck
pnpm typecheck: exit 0. pnpm typecheck:tests: exit 0, with 0 'error TS' lines.

## Acceptance self-report
- [x] pnpm vitest run tests/deployVerify.test.ts tests/releaseCredentialsCheck.test.ts: all pass — `pnpm vitest run tests/deployVerify.test.ts tests/releaseCredentialsCheck.test.ts` → Test Files 2 passed (2), Tests 17 passed (17)
- [x] NPM_TOKEN=sentinel-value: output contains 'NPM_TOKEN: SET' and never the sentinel — `env -u NPM_TOKEN -u CHANGESETS_GITHUB_TOKEN NPM_TOKEN=sentinel-value node scripts/release-credentials-check.mjs --for publish` → The output contains '  NPM_TOKEN: SET  - repo secret; ...' and has no 'sentinel' substring. Exit is 1 because publish also requires CHANGESETS_GITHUB_TOKEN, which was unset ('missing for publish: CHANGESETS_GITHUB_TOKEN').
- [x] With NPM_TOKEN unset: exit 1 and NPM_TOKEN named — `env -u NPM_TOKEN -u CHANGESETS_GITHUB_TOKEN node scripts/release-credentials-check.mjs --for publish` → exit=1, 'NPM_TOKEN: UNSET', 'missing for publish: NPM_TOKEN, CHANGESETS_GITHUB_TOKEN'
- [x] deploy-verify against http://127.0.0.1:1: non-zero exit with fail-closed JSON — `node scripts/deploy-verify.mjs --target http://127.0.0.1:1` → exit=1. The stdout JSON has pass=false and all 5 required checks FAIL; health detail is 'fetch failed: bad port'.
- [x] docs/RELEASE_RUNBOOK.md names the B3 and B4 confirmation gates verbatim from the brief — `node string-inclusion check of 4 strings from the brief against docs/RELEASE_RUNBOOK.md` → All 4 strings are present verbatim: '### B3 — Publish — **CONFIRM WITH SID FIRST**', '### B4 — Live deployment — **CONFIRM WITH SID FIRST**', the B3 'Do not run it until you have shown Sid ...' sentence, and the B4 'Then show Sid the target, the digest, the rollback, and wait for an explicit yes.' sentence.

## Mutation checks
- A receipt signature failure must fail the run (verifyReceiptSignature in scripts/deploy-verify.mjs) — mutation: `return ok ? {ok:true,...}` changed to `return ok || true ? ...` — RED: tests/deployVerify.test.ts: 1 failed / 8 passed. The failing test was 'fails closed when the receipt signature does not verify against the pinned key' (expected 'PASS' to be 'FAIL'). — restored: git checkout -- scripts/deploy-verify.mjs, then 9/9 passed
- The credentials check never prints a value (renderText in scripts/release-credentials-check.mjs) — mutation: appended `${process.env[c.name] ?? ""}` to each required-credential line — RED: tests/releaseCredentialsCheck.test.ts: 2 failed / 6 passed. The failing tests were 'reports SET ... never prints its value' and 'never prints any value ... for every name'. — restored: git checkout -- scripts/release-credentials-check.mjs, then 8/8 passed
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
+    "release:credentials": "node scripts/release-credentials-check.mjs",
Nothing depends on this. The runbook calls both scripts as `node scripts/...`.
```

## Notes for monitor
WHAT CHANGED (file:line):
- scripts/deploy-verify.mjs (250 lines). Five required checks: health :127 (GET /healthz), readiness :135 (GET /readyz), governed-turn :144 (a leased POST <gateway><route>/v1/chat/completions that must return x-amc-receipt), receipt-signature :163 (Ed25519 check against a monitor key pinned with --monitor-pubkey; the key is never fetched from the target) and receipt-binding :175 (kind=llm_response, body_sha256 equals sha256 of the bytes received, agentId matches, ts within the request window ±5min).
  - evaluateChecks :33 passes only when every REQUIRED_CHECK is present and exactly PASS. verifyReceiptSignature :44 mirrors src/receipts/receipt.ts verifyReceipt.
  - The lease comes from AMC_DEPLOY_VERIFY_LEASE or --lease-file and is never output. The result JSON records verifierCommit, tree-dirty, targetReportedVersion, node/platform/arch, per-check durationMs, the receipt id and sha256, and a notExercised list.
  - Exit codes: 0 pass, 1 fail, 2 usage. Node built-ins only.
- scripts/release-credentials-check.mjs (127 lines). ACTIONS :27 covers publish, sign-release, push-image, deploy-railway, deploy-vercel, homebrew and deploy-verify, plus all. presence :49 tests only whether a value is non-blank. workflowSecretNames :55 scans .github/workflows at runtime for secrets.NAME.
- railway.json:8 adds healthcheckPath /api/health. startCommand `npm run api:start` already matched package.json at HEAD. vercel.json is unchanged; its entries exist.
- docs/RELEASE_RUNBOOK.md:9-96 adds a Phase B gates (B0-B4) section with commands and the verbatim B3/B4 gates. A tag push is marked as a B3 action (release.yml publishes to npm).
- docs/DEPLOYMENT_VERIFICATION.md covers what the verifier proves and does not, which targets can pass, the pending standalone-API dependency, open questions, and the local run record.
- tests/deployVerify.test.ts (9 tests) uses an in-process stand-in target whose receipts are minted by the real mintReceipt. tests/releaseCredentialsCheck.test.ts has 8 tests. tests/deployVerifyConfig.test.ts has 2 tests: the railway script and entry exist, healthcheckPath is served, and the vercel entries exist.

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