# Native runtime client

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

The process startup options include `tools: "workspace"`, `approveTools`, `approveRisk`, `mcpConfig`, `mcpConfigSha256`, `credentialsHome`, `credentialsFile`, `maxTokens` and `maxSteps`. These are explicit operator choices for the spawned runtime; a later session request cannot silently widen them. Workspace tools still require signed policy and exact recorder binding. MCP uses the same [reviewed native configuration](NATIVE_MCP.md); server connections are owned and disposed by the runtime. Installed TypeScript acceptance exercised actual workspace tools and stdio MCP through this ACP child, including authenticated approvals, cancellation and cold verification.

`newSession()` establishes an accepted conversation. A turn starts `submitted`, becomes `receiving` if committed updates arrive, and produces a `completed` result or a failure. Submission is not an acknowledgement that a model request has started. ACP `end_turn` is not a task-success verdict: read metadata for lossy mappings. Every response remains `not-verified` until a separate cold verifier returns a consistent receipt. `workspace-key-consistency` proves consistency against the workspace's own key; only `externally-anchored` includes an expected external fingerprint. Neither proves the answer correct.

Call `turn.cancel()` or pass an `AbortSignal` to `session.prompt()`. Cancellation is a request until the result confirms its outcome. Breaking out of the update iterator also requests cancellation. `close()` closes the pipe, waits for the child, and escalates termination if the process does not exit. Forced termination can leave incomplete evidence; the verifier must refuse it.

The client validates protocol identity, reply IDs, frame and output limits, stop reasons and verifier structure. It rejects loading or writer release when the installed runtime does not advertise support. `resumeSession()` never silently creates a different session.

For a resumable handoff, finish the prompt and call `await session.release()` before closing the first client. This explicitly releases the signed writer without sealing the session. A later client can call `await nextAgent.resumeSession(sessionId)`; its `history` contains the committed replay separately from new turn updates. Ordinary `close()` retains sealing behavior, so a sealed session cannot be resumed as if it were still open. Existing ownership, signature and recovery rules decide admission. Python exposes the same local-process lifecycle in the canonical `amc_sdk` package.

The packaged TypeScript and Python lifecycle paths have separate local installed-consumer receipts. Python acceptance used a clean wheel with tools disabled; it does not imply Python tool/MCP coverage from the TypeScript result. These exercises cover macOS ARM64 with Node 22 and scripted local providers. Other platforms, real-provider quality and performance are separate qualification scopes.
