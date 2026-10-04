# Track S8 — worker report (backfilled by the root session from the structured return; the harness refused the subagent's .md write)

- Status (self-report): **PARTIAL**
- Branch: `worktree-wf_5210e2f4-3ea-8`; HEAD before `8f57ce63d8331f1bef1c2a18fde82a7e8f4511da` → after `2b89c614899627ccb7838058b6d035f3ad22e695`
- Environment: Darwin 25.6.0 arm64, Node v25.5.0, pnpm 10.33.0. Worktree source qualification only: not package, platform or deployed-release qualification, and no fresh clone.
- Receipt path (as reported): /Users/sid/AgentMaturityCompass/.claude/worktrees/wf_5210e2f4-3ea-8/AMC_OS/RESEARCH/2026-10-03-regulated-platform-program/tracks/S8/result.json

## Repair round (2026-10-03, after the monitor REJECTED 93d73bdd)

Every required fix has been addressed, in the order given:

1. **actionClass pin.** Added `tests/nativeToolBreadth.test.ts` "action class > web_fetch and web_search are NETWORK_EXTERNAL". It asserts `webFetchTool(...).actionClass === "NETWORK_EXTERNAL"` and `webSearchTool(...).actionClass === "NETWORK_EXTERNAL"`.
   - M14: `webFetchTool.ts:67` mutated to `"READ_ONLY"`. `pnpm vitest run tests/webFetchTool.test.ts tests/nativeToolBreadth.test.ts` went RED with 1 failed and 25 passed (26). After `git checkout`, it was GREEN with 26 passed (26).
   - M15: `webSearchTool.ts:83` mutated the same way. Same command, same RED, then GREEN after restore.
   - The monitor previously reported 24 passed. Under these mutations the result is now RED.
2. **readSessionList binding.** Added "a reader refuses a validly signed record of another kind or session placed at the todo path". It writes a monitor-signed record at `<ws>/.amc/native-tools/<sid>/todo.json` twice:
   - once with kind `amc.native.plan`;
   - once with kind `amc.native.todo` but `sessionId: "sess-other"`.

   In both cases it asserts that `readSessionTodo` throws `native tool record is bound to …`.
   - M16: `sessionListTool.ts:46` mutated to `if (false)`. `pnpm vitest run tests/nativeToolBreadth.test.ts` went RED with 1 failed and 11 passed (12). After restore, it was GREEN with 12 passed (12).
   - The read-side check is now pinned, so it is not recorded as redundant.
3. **Default template and nativeInteractiveSession.** Added the section "Default template: a second change, owned by the root serial step" to `docs/NATIVE_TOOLS.md`, with a pointer from the status banner. It covers two files:
   - **`src/toolhub/toolsSchema.ts`:** reachability in a default-template workspace also needs five entries (`web_fetch`, `web_search`, `ask_user`, `todo`, `plan`) in `defaultToolsConfig()`. They go next to the native-loop built-ins `fs.edit`/`glob`/`grep`/`bash` at `src/toolhub/toolsSchema.ts:118-148`. The monitor cited `:118-140`; the `bash` entry actually closes at `:148`. `.amc/tools.yaml` must also be re-signed. Both are owned by the root serial step and were not edited here. `wiring.diff` is unchanged.
   - **`src/setup/nativeInteractiveSession.ts`:** needs no change. It names no individual tool. It only selects `--tools none|echo|workspace` (`:197-199`) for the child `agent-loop run`, which builds the toolset through `agentToolset(...)` (`src/cli-agent-commands.ts:464-470`).

Re-verification (2026-10-04): M14, M15 and M16 were re-run independently at 4b76dba5 with the monitor's exact commands. Each went RED (1 failed | 25 passed (26); 1 failed | 25 passed (26); 1 failed | 11 passed (12)) and returned GREEN after `git checkout`. The focused suite gave 35 total, 35 passed, 0 failed, 0 pending, 0 todo. `pnpm typecheck` and `pnpm typecheck:tests` both exited 0. The line anchors cited above were re-read and are correct: `toolsSchema.ts:118-148`, `nativeInteractiveSession.ts:197-199` and `cli-agent-commands.ts:464-470`.

Path-discipline defect (low): no code change is implied. The 13 source, test and doc paths match the root ownership manifest's S8 claim exactly, but they lie outside `map/planner-tracks.json`'s S8 globs. The root needs to settle which registry applies.

Final run: `pnpm vitest run tests/nativeToolBreadth.test.ts tests/webFetchTool.test.ts tests/askUserTool.test.ts` gave Test Files 3 passed (3) and Tests 35 passed (35), with 0 skipped. `pnpm typecheck` exited 0. `pnpm typecheck:tests` exited 0.

## Commits
- 15a92e92 test: specify deny-by-default web fetch, search, ask-user, todo and plan tools (AMC-1549)
- 7caecc48 feat: add refuse-by-default web_fetch, web_search, ask_user, todo and plan native tools (AMC-1549)
- fa58d6dd refactor: drop the content-length pre-check a mutation proved redundant with the streaming cap
- 0e0b14d3 feat: bind each web_search provider to the one origin it declares
- c7e64864 fix: resolve native tool session ids at call time so forks and resumes bind correctly
- fb4cd7e7 docs: describe the native web, ask-user, todo and plan tools and their unregistered state (AMC-1549)
- 2b89c614 docs: record S8 native tool breadth receipt, mutations and ready-to-wire diff (AMC-1549)

## Files changed
- `src/tools/builtin/webFetchTool.ts`
- `src/tools/builtin/webSearchTool.ts`
- `src/tools/builtin/askUserTool.ts`
- `src/tools/builtin/todoTool.ts`
- `src/tools/builtin/planTool.ts`
- `src/tools/builtin/nativeToolBreadth/originPolicy.ts`
- `src/tools/builtin/nativeToolBreadth/governedFetch.ts`
- `src/tools/builtin/nativeToolBreadth/signedSessionRecords.ts`
- `src/tools/builtin/nativeToolBreadth/sessionListTool.ts`
- `docs/NATIVE_TOOLS.md`
- `tests/webFetchTool.test.ts`
- `tests/askUserTool.test.ts`
- `tests/nativeToolBreadth.test.ts`
- `AMC_OS/RESEARCH/2026-10-03-regulated-platform-program/tracks/S8/result.json`
- `AMC_OS/RESEARCH/2026-10-03-regulated-platform-program/tracks/S8/wiring.diff`
- `AMC_OS/RESEARCH/2026-10-03-regulated-platform-program/tracks/S8/mutations.log`
- `AMC_OS/RESEARCH/2026-10-03-regulated-platform-program/tracks/S8/s8WiringProof.test.ts.txt`

## Commands run
- `pnpm vitest run tests/nativeToolBreadth.test.ts tests/webFetchTool.test.ts tests/askUserTool.test.ts (RED, before implementation, at 15a92e92)` → Test Files 3 failed (3), no tests: the modules did not exist yet
- `pnpm vitest run tests/nativeToolBreadth.test.ts tests/webFetchTool.test.ts tests/askUserTool.test.ts (final)` → exit 0; Test Files 3 passed (3); Tests 33 passed (33) at 2b89c614; 35 passed (35) after the repair round
- `scratch copy (git archive HEAD + wiring.diff applied, node_modules symlinked): vitest run tests/s8WiringProof.test.ts tests/agentToolsetWiring.test.ts tests/networkEgressGuard.test.ts tests/toolPolicyGuards.test.ts` → Test Files 4 passed (4); Tests 35 passed (35)
- `scratch copy: vitest run tests/studioNativeTaskPolicyPin.test.ts tests/nativeSignedToolSubset.test.ts tests/toolhubPipelineTools.test.ts tests/nativeSandboxPolicyBinding.test.ts plus the 3 S8 test files` → Test Files 7 passed (7); Tests 75 passed (75)
- `git apply --check -v AMC_OS/.../tracks/S8/wiring.diff (at worktree HEAD)` → exit 0; all 3 files check
- `scratch copy: tsc -p tsconfig.json --noEmit with wiring applied` → exit 0

## Typecheck
pnpm typecheck exit 0; pnpm typecheck:tests exit 0 (both run at final code head fb4cd7e7; the receipt commit changes no TypeScript)

## Acceptance self-report
- [x] The three focused test files all pass — `pnpm vitest run tests/nativeToolBreadth.test.ts tests/webFetchTool.test.ts tests/askUserTool.test.ts` → exit 0, Test Files 3 passed (3), Tests 33 passed (33) at 2b89c614; 35 passed (35) after the repair round
- [x] A request to http://127.0.0.1:1/ with an empty allowlist is refused and no socket is opened — `pnpm vitest run tests/webFetchTool.test.ts` → Two tests pass. (1) 'refuses http://127.0.0.1:1/ with an empty signed allowlist and never calls fetch': a stubbed fetch records calls and calls stays []. (2) 'opens no socket for a non-allowlisted origin, with the real fetch': a net server counts connections and stays at 0 while the real global fetch is pointed at it. Mutation M1 (allowlist check removed) turns both RED.
- [ ] The report contains the exact registration diff and states the tools are unreachable until it is applied — `cat AMC_OS/RESEARCH/2026-10-03-regulated-platform-program/tracks/S8/wiring.diff; jq .statusReason result.json` → The exact diff is committed as wiring.diff and is reproduced in notesForMonitor. result.json statusReason and docs/NATIVE_TOOLS.md both say the tools are UNREACHABLE until it is applied. report.md itself was NOT written: the harness refused the Write with 'Subagents should return findings as text, not write report files', so its content is in this structured result instead.
- [x] Worktree is clean — `git status --porcelain` → empty output

## Mutation checks
- Origin allowlist membership check (governedFetch.ts:55) — mutation: Changed `if (!policy.origins.has(url.origin))` to `if (false && ...)` — RED: Tests 4 failed | 10 passed (14): the empty-allowlist 127.0.0.1:1 test, the real-socket connection test, the not-listed/scheme/port test, and the SIMULATE test — restored: Tests 14 passed (14)
- Streaming body-size cap (governedFetch.ts:78) — mutation: Changed `if (total > maxBytes)` to `if (false && ...)` — RED: Tests 3 failed | 11 passed (14): the content-length oversize test, the streamed oversize test, and the narrow-cap test — restored: Tests 14 passed (14)
- Content-length pre-check (earlier revision) — mutation: Disabled the declared content-length refusal — RED: SURVIVED: Tests 14 passed (14). The streaming cap already covers it, so the pre-check was removed as decoration in fa58d6dd. — restored: n/a (code deleted)
- Secret redaction of fetched content (governedFetch.ts:107) — mutation: Returned the unredacted text — RED: 1 failed: 'redacts secret-looking content in the output and the receipt' — restored: 14 passed
- Redirect refusal (governedFetch.ts:94) — mutation: Changed the condition to `if (false)` — RED: 1 failed: the redirect test — restored: 14 passed
- Credentials or secret in the URL (governedFetch.ts:52) — mutation: Changed the condition to `if (false)` — RED: 1 failed: the credentials test — restored: 14 passed
- ask_user auditor signature verification (askUserTool.ts:107) — mutation: Changed the condition to `if (false)` — RED: 3 failed: unsigned or garbage signature, tampered text, monitor-signed answer — restored: 9 passed
- ask_user auditor role (not monitor) — mutation: Accepted a monitor-key signature as well — RED: 1 failed: the monitor-key answer test — restored: 9 passed
- ask_user question, digest and session binding (askUserTool.ts:105) — mutation: Changed the condition to `if (false)` — RED: 1 failed: the different-question replay test — restored: 9 passed
- Signed session record verification (signedSessionRecords.ts:94) — mutation: Changed the condition to `if (false)` — RED: 1 failed: the tampered todo record test — restored: 10 passed
- todo and plan agent binding (sessionListTool.ts:69) — mutation: Removed the agentId comparison — RED: 1 failed: the different-agent test — restored: 10 passed
- web_search has no default provider (webSearchTool.ts:94) — mutation: Changed `if (!provider)` to `if (false)` — RED: 1 failed: the no-provider test — restored: 10 passed
- web_search provider limited to its declared origin (webSearchTool.ts:105) — mutation: Changed the condition to `if (false)` — RED: 1 failed: the declared-origin test — restored: 10 passed
- Receipt is required before content is returned (webFetchTool.ts:98) — mutation: Wrapped options.record in try/catch — RED: 1 failed: the receipt-failure test — restored: 14 passed
- Session id resolved per call (signedSessionRecords.ts:51) — mutation: Captured the resolver result once — RED: 1 failed: the call-time resolver test — restored: 10 passed

- web_fetch actionClass (webFetchTool.ts:67), repair round — mutation: `"NETWORK_EXTERNAL"` changed to `"READ_ONLY"` — RED: 1 failed | 25 passed (26), on the actionClass pin — restored: 26 passed (26)
- web_search actionClass (webSearchTool.ts:83), repair round — mutation: `"NETWORK_EXTERNAL"` changed to `"READ_ONLY"` — RED: 1 failed | 25 passed (26) — restored: 26 passed (26)
- readSessionList kind/session binding (sessionListTool.ts:46), repair round — mutation: `if (false)` — RED: 1 failed | 11 passed (12), on the foreign-record reader test — restored: 12 passed (12)

## Sources


## Not exercised
- Full vitest suite, release gate, and a fresh-clone reproduction at the final commit
- Budget guard metering of these tools (only agentToolset composes it, and only the scratch wiring run used it, with initBudgets defaults; exhaustion was not observed)
- Real HTTPS to any public origin (all network tests used 127.0.0.1 or a stubbed fetch)
- The non-text content-type descriptor path
- A CLI or Studio answerer for ask_user; Studio rendering of the todo and plan record files
- Applying wiring.diff on top of the other session's uncommitted src/agent/nativeToolCapabilities.ts in the root checkout
- Any OS other than macOS 25.6.0 arm64 / Node v25.5.0

## Blockers
- Registration is outside this track's claim. It needs src/agent/nativeToolCapabilities.ts (on the other session's dirty list), plus src/agent/agentToolset.ts and src/tools/guards/policyGuards.ts (not claimed by this track). The ready-to-wire diff is AMC_OS/RESEARCH/2026-10-03-regulated-platform-program/tracks/S8/wiring.diff. The tools are UNREACHABLE until it is applied.
- report.md was not written: the harness refused writing a report .md file. Its content is in notesForMonitor, and result.json, wiring.diff, mutations.log and s8WiringProof.test.ts.txt are committed in the receipt directory.
- ask_user and web_search need a composed answerer and provider to be useful. None exists yet; this is a deliberate refusal, not a defect.

## Ready-to-wire diff
```
--- a/src/agent/nativeToolCapabilities.ts
+++ b/src/agent/nativeToolCapabilities.ts
@@ -14,7 +14,15 @@
   { name: "fs.edit", actionClass: "WRITE_LOW" },
   { name: "glob", actionClass: "READ_ONLY" },
   { name: "grep", actionClass: "READ_ONLY" },
-  { name: "bash", actionClass: "WRITE_HIGH" }
+  { name: "bash", actionClass: "WRITE_HIGH" },
+  // AMC-1549. Each still refuses in its own body until the signed policy grants
+  // it origins (web_*) or the caller composes its dependency (ask_user: an
+  // answerer; web_search: a provider). Listing here is identity, not permission.
+  { name: "web_fetch", actionClass: "NETWORK_EXTERNAL" },
+  { name: "web_search", actionClass: "NETWORK_EXTERNAL" },
+  { name: "ask_user", actionClass: "READ_ONLY" },
+  { name: "todo", actionClass: "READ_ONLY" },
+  { name: "plan", actionClass: "READ_ONLY" }
 ].map(capability => Object.freeze(capability as NativeToolCapability)));
 
 /** These become executable only when a caller also supplies the delegation capability. */
--- a/src/agent/agentToolset.ts
+++ b/src/agent/agentToolset.ts
@@ -9,6 +9,12 @@
 import { fsTools } from "../tools/builtin/fsTools.js";
 import { ReadBeforeEditLedger } from "../tools/builtin/readBeforeEdit.js";
 import { searchTools } from "../tools/builtin/searchTools.js";
+import { webFetchTool } from "../tools/builtin/webFetchTool.js";
+import { webSearchTool, type WebSearchProvider } from "../tools/builtin/webSearchTool.js";
+import { askUserTool, type AskUserAnswerer } from "../tools/builtin/askUserTool.js";
+import { todoTool } from "../tools/builtin/todoTool.js";
+import { planTool } from "../tools/builtin/planTool.js";
+import type { ToolExecution } from "../tools/toolTypes.js";
 import {
   budgetGuard,
   networkEgressGuard,
@@ -56,6 +62,10 @@
    * every run in a chain shares `governedAs` by design.
    */
   readonly subagents?: SubagentCapability;
+  /** Human answerer for `ask_user` (AMC-1549). Absent: every ask_user call refuses. */
+  readonly askUser?: AskUserAnswerer;
+  /** Search provider for `web_search` (AMC-1549). Absent: every web_search call refuses; there is no default. */
+  readonly webSearchProvider?: WebSearchProvider;
   /** Session the evidence rows belong to. Defaults to a per-agent bucket. */
   /**
    * The session tool evidence belongs to. REQUIRED, and deliberately so.
@@ -240,6 +250,24 @@
       }
     }
   }) : bashTool({ scrubValues: options.scrubValues }));
+  // AMC-1549 receipts take the bash receipt's path: the native session writer
+  // when bound, else the raw ledger. A failed write fails the call.
+  const recordNativeReceipt = (receipt: object): void => {
+    const row = { eventType: "audit" as const, payload: JSON.stringify(receipt), meta: { ...receipt } as Record<string, unknown> };
+    if (options.recorder) options.recorder.recordProjectedEvidence(row);
+    else {
+      ledgerHandle ??= openLedger(workspace);
+      ledgerHandle.appendEvidence({ sessionId: options.sessionId, runtime: "amc", ...row, payloadExt: "json" });
+    }
+  };
+  // The session getter is rebound by fork/resume after construction, so these
+  // read it per call rather than capturing it now.
+  const currentSessionId = (): string => options.sessionId;
+  registry.define(webFetchTool({ record: recordNativeReceipt }));
+  registry.define(webSearchTool({ record: recordNativeReceipt, ...(options.webSearchProvider ? { provider: options.webSearchProvider } : {}) }));
+  registry.define(askUserTool({ sessionId: currentSessionId, ...(options.askUser ? { answerer: options.askUser } : {}) }));
+  registry.define(todoTool({ sessionId: currentSessionId }));
+  registry.define(planTool({ sessionId: currentSessionId }));
   if (options.subagents !== undefined) {
     // Both tools, from one capability. `delegate` is one child; `workflow` is a
     // declared plan of them. Each is still gated a second time by the operator's
@@ -258,8 +286,13 @@
   // CLI binds the native writer after constructing the toolset; forks can
   // replace it. Resolve the current session only when the guard executes.
   registry.guard("budgets", execution => budgetGuard(workspace, options.sessionId)(execution));
-  registry.guard("network-egress", networkEgressGuard(workspace));
-  registry.guard("tool-allowlist", toolhubAllowlistGuard(workspace, execution => registry.visible(execution.agentId).get(execution.name), options.expectedToolsDigest));
+  // web_search names no url; both host checks read its composed provider's
+  // declared origin instead. Unconfigured, it carries no url and is denied.
+  const governedArguments = (execution: ToolExecution): Readonly<Record<string, unknown>> =>
+    execution.name === "web_search" && options.webSearchProvider
+      ? { ...execution.arguments, url: options.webSearchProvider.origin } : execution.arguments;
+  registry.guard("network-egress", networkEgressGuard(workspace, governedArguments));
+  registry.guard("tool-allowlist", toolhubAllowlistGuard(workspace, execution => registry.visible(execution.agentId).get(execution.name), options.expectedToolsDigest, governedArguments));
   registry.guard("native-tool-identity", execution => {
     const identity = nativeIdentities.get(execution.name);
     if (!identity) return undefined; // Late reviewed extensions retain their own mount and policy guards.
--- a/src/tools/guards/policyGuards.ts
+++ b/src/tools/guards/policyGuards.ts
@@ -26,6 +26,14 @@
  */
 
 /**
+ * The arguments a host check reads. Defaults to the call's own; a composition
+ * supplies a destination a tool does not take as an argument (AMC-1549:
+ * `web_search` reaches its provider's declared origin, never a model-chosen url).
+ */
+export type GovernedArguments = (execution: ToolExecution) => Readonly<Record<string, unknown>>;
+const ownArguments: GovernedArguments = (execution) => execution.arguments;
+
+/**
  * The Runtime Firewall over the call's arguments.
  *
  * After ADR-0011 an unconfigured workspace blocks, so composing this guard in
@@ -85,7 +93,7 @@
  */
 export function toolhubAllowlistGuard(workspace: string,
   visibleDefinition?: (execution: ToolExecution) => ToolDefinition | undefined,
-  expectedToolsDigest?: string): ToolGuard {
+  expectedToolsDigest?: string, argumentsFor: GovernedArguments = ownArguments): ToolGuard {
   return (execution) => {
     // The Code Mode transport is presentation infrastructure, not a
     // capability, and the allowlist has nothing useful to say about it. What
@@ -114,7 +122,7 @@
     const verdict = validateToolRequest({
       workspace,
       tool: definition,
-      args: execution.arguments as Record<string, unknown>,
+      args: argumentsFor(execution) as Record<string, unknown>,
       nativeSandboxPermit: snapshot.digestSha256
         ? admitNativeSandboxPolicy(visibleDefinition?.(execution), execution, definition, snapshot.digestSha256)
         : undefined
@@ -148,11 +156,11 @@
  * allowlist, and "we could not tell where this was going" is not a reason to
  * let it go.
  */
-export function networkEgressGuard(workspace: string): ToolGuard {
+export function networkEgressGuard(workspace: string, argumentsFor: GovernedArguments = ownArguments): ToolGuard {
   return (execution) => {
     if (execution.actionClass !== "NETWORK_EXTERNAL") return undefined;
 
-    const raw = execution.arguments["url"];
+    const raw = argumentsFor(execution)["url"];
     if (typeof raw !== "string" || raw.length === 0) {
       return `${execution.name} is a network tool but named no url to check against the allowlist`;
     }
```

## Notes for monitor
THE TOOLS ARE UNREACHABLE until readyToWireDiff (also committed at AMC_OS/RESEARCH/2026-10-03-regulated-platform-program/tracks/S8/wiring.diff) is applied. The diff is verified three ways: `git apply --check` exits 0 at HEAD; tsc in a scratch copy with the diff applied exits 0; and the scratch tests pass (35/35 across 4 files, and 75/75 across 7 neighbouring files). It has not been checked against the other session's dirty nativeToolCapabilities.ts.

Observed outcomes of the scratch wiring proof (s8WiringProof.test.ts.txt):
- Shipped signed policy: none of the 5 tools is offered in schemas(), and every call is DENIED.
- After granting the tools in signed policy:
  - todo returns OK.
  - web_fetch with an empty allowlist returns ERROR, "web_fetch refused: the signed tools policy grants no allowlisted origins". The network-egress guard let it through, and the body refused it.
  - ask_user with no answerer returns ERROR, "no human answerer is composed".
  - web_search with no provider is DENIED by network-egress ("named no url").
  - web_search with a provider whose declared origin is allowlisted returns OK.
  - web_search with a provider whose origin is not allowlisted is DENIED ("egress denied: evil.example.test is not on the allowlist for web_search").

Why the governedArguments hook exists: without it, validateToolRequest (in toolhubValidators.ts, which is dirty) returns "url is required" for web_search. I observed this in scratch.

Design:
- Bare host entries grant https on the default port only.
- Explicit-origin entries grant exactly that scheme, host and port.
- An empty list grants nothing. The existing hostAllowedForTool treats an empty list as "any host"; a test proves this, per brief rule 7.
- Redirects are refused, there are no caller headers, and a URL carrying credentials or a secret-looking value is refused.
- The streaming cap refuses rather than truncates. The content-length pre-check was removed after a mutation survived.
- Receipts carry contentSha256, deliveredSha256, redaction counts, a redacted excerpt of up to 512 characters and the policy digest. A receipt is required: if recording fails, the call fails with no content returned.
- ask_user returns answer text only for an answer signed with the AUDITOR key and bound to the question id, digest and session. The monitor key is refused.
- todo and plan are monitor-signed records under <ws>/.amc/native-tools/<sessionId>/, chained by revision and digest, and bound to the session and agent. Session ids are resolved per call because agentToolset.sessionId is a rebindable getter (cli-agent-commands.ts:475).
- A refusal from a tool body is recorded as TOOL_CALL_FAILED, not DENIED, because ToolBody has no denial channel.
- There is no Studio rendering, because no todo or plan session event type exists and src/session is unclaimable.

No regulatory content was encoded, so there are no sources. report.md was refused by the harness's write guard; this field and result.json carry its content.