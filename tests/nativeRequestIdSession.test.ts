import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openAgentSession, type AgentSession } from "../src/agent/agentSession.js";
import { readAcpSessionUpdatePage } from "../src/acp/acpSessionUpdatePage.js";
import { AdapterRegistry } from "../src/llm/adapter/adapterRegistry.js";
import { LlmRuntime } from "../src/llm/adapter/llmRuntime.js";
import { credentialRef } from "../src/credentials/credentialRef.js";
import { initWorkspace } from "../src/workspace.js";
import { FixedCredentials, LOOP_MODEL, LOOP_PROVIDER, scriptedAdapter, silentTransport, textStep,
  type ScriptedStream } from "./helpers/agentLoopHarness.js";

let workspace: string;
const sessions: AgentSession[] = [];
beforeEach(() => {
  vi.stubEnv("AMC_VAULT_PASSPHRASE", "wp20-native-request-session");
  workspace = realpathSync(mkdtempSync(join(tmpdir(), "amc-wp20-native-request-")));
  initWorkspace({ workspacePath: workspace, agentId: "default", trustBoundaryMode: "isolated" });
});
afterEach(async () => {
  for (const session of sessions.splice(0)) await session.close();
  rmSync(workspace, { recursive: true, force: true }); vi.unstubAllEnvs();
});
function native(scripts: readonly ScriptedStream[]) {
  const registry = new AdapterRegistry();
  registry.register({ providerId: LOOP_PROVIDER, adapter: scriptedAdapter(scripts), baseUrl: "https://api.anthropic.invalid",
    credentialRef: credentialRef("AMC_LOOP_TEST_KEY"), models: [LOOP_MODEL] });
  const session = openAgentSession({ workspace, agentId: "default", tools: "none", makeLlm: session => new LlmRuntime({
    session, credentials: new FixedCredentials(), registry, transport: silentTransport }),
    route: { providerId: LOOP_PROVIDER, model: LOOP_MODEL, params: {} }, systemPrompt: "Request identity fixture.",
    harnessVersion: "fixture", compositionDigest: "fixture", policyDigest: "fixture" });
  sessions.push(session); return session;
}
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(accept => { resolve = accept; });
  return { promise, resolve };
}

describe("WP20 native session request identities and committed reconnect", () => {
  it("refuses a repeated completed request with its original receipt and no second model turn", async () => {
    const session = native([textStep("first"), textStep("second")]);
    expect((await session.prompt("original", undefined, { clientRequestId: "same-id" })).ok).toBe(true);
    const before = session.readEvents();
    const repeated = await session.prompt("original", undefined, { clientRequestId: "same-id" });
    expect(repeated).toMatchObject({ ok: false, reason: expect.stringContaining("duplicate clientRequestId"),
      submission: session.submissionReceipt!("same-id") });
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(session.readEvents()).toEqual(before);
    await expect(session.prompt("changed", undefined, { clientRequestId: "same-id" })).rejects.toThrow(/different submission/);
    expect(session.readEvents()).toEqual(before);
    expect((await session.prompt("new request", undefined, { clientRequestId: "new-id" })).ok).toBe(true);
    expect(session.readEvents().filter(row => row.event_type === "turn/start")).toHaveLength(2);
  });

  it("keeps provider drafts out of history and reconnects to the committed block exactly once", async () => {
    const provisional = deferred(), finish = deferred();
    const session = native([async function* () {
      yield { type: "block-start", index: 0, blockKind: "text" } as const;
      yield { type: "text-delta", index: 0, text: "Committed answer once." } as const;
      provisional.resolve(); await finish.promise;
      yield { type: "block-end", index: 0, block: { kind: "text", text: "Committed answer once." } } as const;
      yield { type: "usage", usage: { inputTokens: 4, outputTokens: 5 } } as const;
      yield { type: "finish", reason: { kind: "stop" } } as const;
    }]);
    const running = session.prompt("Start stream.");
    await provisional.promise;
    const during = readAcpSessionUpdatePage({ workspace, sessionId: session.sessionId, agentId: "default", consumerId: "owner", limit: 256 });
    expect(during.updates.some(row => row.update.sessionUpdate === "agent_message_chunk")).toBe(false);
    expect(JSON.stringify(during)).not.toContain("Committed answer once.");
    // Simulate reconnect: keep only the committed resume token, discard local provider progress.
    const cursor = during.resumeCursor;
    finish.resolve(); expect((await running).ok).toBe(true);
    const after = readAcpSessionUpdatePage({ workspace, sessionId: session.sessionId, agentId: "default", consumerId: "owner", cursor, limit: 256 });
    expect(after.updates.filter(row => row.update.sessionUpdate === "agent_message_chunk").map(row => row.update.content))
      .toEqual([{ type: "text", text: "Committed answer once." }]);
    const drained = readAcpSessionUpdatePage({ workspace, sessionId: session.sessionId, agentId: "default", consumerId: "owner", cursor: after.resumeCursor });
    expect(drained.updates).toEqual([]);
    expect(session.readEvents().filter(row => row.event_type === "request/header")).toHaveLength(1);
  });
});
