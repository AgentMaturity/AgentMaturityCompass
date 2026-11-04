# P0-47 controlled native fixture diagnosis — 14 October 2026

Status: `DIAGNOSTIC_COMPLETE`. Fixture `/Users/sid/.codex/worktrees/p0-47-node24-qualification/AgentMaturityCompass` at `7a81b5aa7316471e841f4ae0ea684a64c85ae4a1`.

Node v24.21.0; pnpm 10.33.0; GIT_NO_LAZY_FETCH=1.

Only operatorHome placement and its paired teardown changed. Every current main test assertion and verdict stayed intact.

```diff
--- a/tests/studioNativeTaskService.test.ts
+++ b/tests/studioNativeTaskService.test.ts
@@ -34,12 +34,12 @@
 beforeEach(() => {
   prior = process.env.AMC_VAULT_PASSPHRASE; process.env.AMC_VAULT_PASSPHRASE = pass;
   root = mkdtempSync(join(tmpdir(), "amc-studio-service-"));
-  credentialHome = join(root, "operator-home"); mkdirSync(credentialHome, { mode: 0o700 });
+  credentialHome = mkdtempSync(join(tmpdir(), "amc-studio-operator-home-"));
   initWorkspace({ workspacePath: root, trustBoundaryMode: "isolated" });
 });
 afterEach(async () => {
   const outcomes = await Promise.allSettled(services.splice(0).map(service => service.close()));
-  lockVault(root); rmSync(root, { recursive: true, force: true });
+  lockVault(root); rmSync(root, { recursive: true, force: true }); rmSync(credentialHome, { recursive: true, force: true });
   if (prior === undefined) delete process.env.AMC_VAULT_PASSPHRASE; else process.env.AMC_VAULT_PASSPHRASE = prior;
   expect(outcomes.filter(outcome => outcome.status === "rejected")).toEqual([]);
 });
```

| Phase | Exit | Passed | Failed | Pending | Seconds |
|---|---:|---:|---:|---:|---:|
| unchanged-selected | 1 | 0 | 1 | 9 | 5.748 |
| outside-home-selected | 0 | 1 | 0 | 9 | 6.411 |
| outside-home-whole-file | 0 | 10 | 0 | 0 | 18.105 |

Filtered selected-case runs retain intentional pending cases and do not establish whole-file qualification.

Selected case passed with only this change: True.
Entire current file passed with only this change: True.

Test bytes restored: True. Production unchanged: True. Final Git status: `clean`.

Raw logs, actual JSON and per-phase commands/hashes remain in `tmp/p0-47-native-fixture-diagnosis/`. Detailed failures are in the JSON summary.

Observed Node 24 case/file diagnosis only. No production edit, current Node 22 candidate change, full-suite qualification, commit, push or cleanup of preexisting artifacts.

## Confirmed cause at the observed scope

The original fixture puts `HOME` inside the governed workspace. The real child then defaults its control checkpoints to `HOME/.amc/control-checkpoints`, which the current signed-control journal refuses inside that workspace. Moving only that owned operator home outside the workspace made the same selected case pass and all 10 existing file cases pass. No production or verdict assertion changed. This is Node 24/file evidence, not an active Node 22 whole-run result.
