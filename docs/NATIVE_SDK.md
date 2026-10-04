# Native runtime client

For persisted signed evidence after restart, use the exported
[`loadSessionEventHistory`](SESSION_EVENT_HISTORY.md), not the resumed
conversation's projected `history` updates. It is available from both the package
root and `agent-maturity-compass/sdk/native` without starting a runtime child.

Use the Node SDK when your application owns a local AMC runtime process. It launches the CLI from the same installed package and uses ACP over standard input/output. It does not grant execution rights through a gateway lease.

```ts
import { AMCNativeClient } from "agent-maturity-compass/sdk/native";

const agent = await AMCNativeClient.start({
  workspace: process.cwd(),
  provider: "stub", // Explicit local recording demonstration.
});
try {
  const session = await agent.newSession();
  const turn = session.prompt("Check the recording path");
  for await (const event of turn) {
    // Committed response blocks, not unverified provider token deltas.
    console.log(event.update);
  }
  const first = await turn.result;
  console.log(first.stopReason, first.text, first.verification);

  const second = await session.prompt("Continue the same conversation").result;
  console.log(second.text);

  // Closes/reaps this agent, seals its sessions, then starts a fresh verifier.
  const receipt = await session.closeAndVerify();
  console.log(receipt.scope, receipt.report);
} finally {
  await agent.close();
}
```

For a real provider, select `provider: "openai"`, `"openai-responses"` or `"anthropic"`, supply an accessible `model`, and configure a credential reference. Secrets remain in the local credential environment or store; `credential` names a reference, not a value. No provider failure falls back to the stub.

For a custom Responses server, supply its origin as `baseUrl`, for example `"http://127.0.0.1:8080"`. AMC appends `/v1/responses`; omit `/v1` and `/responses` from the supplied value. Python uses the equivalent `base_url` option.

The process startup options include `tools: "workspace"`, `approveTools`, `approveRisk`, `mcpConfig`, `mcpConfigSha256`, `credentialsHome`, `credentialsFile`, `maxTokens` and `maxSteps`. These are explicit operator choices for the spawned runtime; a later session request cannot silently widen them. Workspace tools still require signed policy and exact recorder binding. MCP uses the same [reviewed native configuration](NATIVE_MCP.md); server connections are owned and disposed by the runtime. Installed TypeScript acceptance exercised actual workspace tools and separately qualified stdio/HTTP MCP through this ACP child, including authenticated approvals, cancellation and cold verification.

An explicit `expectedToolsDigest` also gates model-facing tool schemas at each
native step. Changed or unverifiable signed policy refuses the step before another
model request, rather than advertising newly granted tools or silently switching
to no-tools. Review the current scope and start a newly pinned session. This does
not replace execution-time digest, approval or budget checks, and it does not
undo a request or side effect already dispatched. This schema-admission correction
landed on 2026-09-10. Its source regressions (`tests/nativePinnedToolSchemas.test.ts`)
were executed from a source checkout of commit 8f57ce63 on 2026-10-03 (macOS arm64,
Node 25.5.0; receipt: `AMC_OS/RESEARCH/2026-10-03-regulated-platform-program/tracks/S7/result.json`). That is source
qualification only; installed-package qualification remains unexecuted.

`newSession()` establishes an accepted conversation. A turn starts `submitted`, becomes `receiving` if committed updates arrive, and produces a `completed` result or a failure. Submission is not an acknowledgement that a model request has started. ACP `end_turn` is not a task-success verdict: read metadata for lossy mappings. Every response remains `not-verified` until a separate cold verifier returns a consistent receipt. `workspace-key-consistency` proves consistency against the workspace's own key; only `externally-anchored` includes an expected external fingerprint. Neither proves the answer correct.

A failed or rejected prompt does not publish its remaining output tail. Its
authenticated rows are consumed by that prompt's update cursor, so a later prompt
cannot receive them as a new answer. Blocks already delivered while the prompt
ran remain distinct from the failure result; cancellation retains its signed-tail
flush behavior. If committed-row authentication, payload projection or an output
bound fails, that loaded session refuses further prompts before execution. Close
the client and inspect its persisted evidence; a new prompt does not reset that
failure. This failure-boundary correction landed on 2026-09-10. Its source
regressions (`tests/acpFailedTurnUpdates.test.ts`) were executed under the same
boundary as above; installed-package qualification remains unexecuted.

Call `turn.cancel()` or pass an `AbortSignal` to `session.prompt()`. Cancellation is a request until the result confirms its outcome. Breaking out of the update iterator also requests cancellation. `close()` closes the pipe, waits for the child, and escalates termination if the process does not exit. Forced termination can leave incomplete evidence; the verifier must refuse it.

The client validates protocol identity, reply IDs, frame and output limits, stop reasons and verifier structure. It rejects loading or writer release when the installed runtime does not advertise support. `resumeSession()` never silently creates a different session.

The SDK canonicalizes the fixed workspace directory before starting its native child. Filesystem aliases for that same directory, including macOS temporary-directory aliases, share one workspace identity. A session request for a genuinely different directory is still refused.

For a resumable handoff, finish the prompt and call `await session.release()` before closing the first client. This explicitly releases the signed writer without sealing the session. A later client can call `await nextAgent.resumeSession(sessionId)`; its `history` contains the committed replay separately from new turn updates. Ordinary `close()` retains sealing behavior, so a sealed session cannot be resumed as if it were still open. Existing ownership, signature and recovery rules decide admission. Python exposes the same local-process lifecycle in the canonical `amc_sdk` package.

Native continuation checks the recorded ledger prefix and the selected native session while other workspace services may still be running. It validates row hashes, signatures, payloads, receipts and any existing seals, then applies native identity and writer-ownership rules. Missing final seals on unrelated legacy sessions are incomplete evidence for continuation, not a complete archive verdict. The normal cold verifier still requires those final seals; stop and release the relevant writers before requesting a complete archive result.

The packaged TypeScript and Python lifecycle paths have separate local installed-consumer receipts. Python acceptance used a clean wheel with tools disabled; it does not imply Python tool/MCP coverage from the TypeScript result. These exercises cover macOS ARM64 with Node 22 and scripted local providers. Other platforms, real-provider quality and performance are separate qualification scopes.
