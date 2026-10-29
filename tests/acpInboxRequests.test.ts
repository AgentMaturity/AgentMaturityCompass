import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAcpAgent, type AcpAgent } from "../src/acp/acpAgentServer.js";
import type { AgentPromptOptions, AgentSession } from "../src/agent/agentSession.js";
import { LoopInbox } from "../src/agent/inbox.js";
import { SessionService } from "../src/session/sessionService.js";
import { todoTool } from "../src/tools/builtin/todoTool.js";
import { initWorkspace } from "../src/workspace.js";

type Frame = { method?: string; params?: { update?: { sessionUpdate?: string } }; id?: number; result?: Record<string, unknown>; error?: { code: number; message: string } };
let workspace: string;
const agents: AcpAgent[] = [];
beforeEach(() => {
  vi.stubEnv("AMC_VAULT_PASSPHRASE", "wp20-acp-inbox-requests");
  workspace = realpathSync(mkdtempSync(join(tmpdir(), "amc-wp20-acp-inbox-")));
  initWorkspace({ workspacePath: workspace, agentId: "default", trustBoundaryMode: "isolated" });
});
afterEach(async () => {
  for (const agent of agents.splice(0)) await agent.close();
  rmSync(workspace, { recursive: true, force: true }); vi.unstubAllEnvs();
});
function peer(supportsRequestIds = true, planOnPrompt = false) {
  const frames: Frame[] = [], prompts: Array<AgentPromptOptions | undefined> = [];
  let writer!: SessionService, inbox!: LoopInbox;
  const queued: string[] = [];
  const agent = createAcpAgent({ workspace, agentId: "default", write: bytes => frames.push(JSON.parse(bytes.toString("utf8")) as Frame),
    sessionFactory: ({ sessionId }): AgentSession => {
      writer = new SessionService(workspace);
      writer.open({ sessionId, agentId: "default", harnessVersion: "fixture", compositionDigest: "fixture", policyDigest: "fixture" });
      inbox = new LoopInbox(writer, () => {});
      for (const text of ["first", "second", "third"]) queued.push(inbox.insert("next-turn", text, "followup", { wake: false, demotedFrom: null }).messageId);
      return { sessionId,
        ...(supportsRequestIds ? { submissionReceipt: (id: string) => inbox.requestReceipt(id) } : {}),
        withdraw: id => inbox.withdraw(id),
        prompt: async (_text, _images, options) => {
          prompts.push(options);
          writer.startTurn({ trigger: "user" });
          if (planOnPrompt) await todoTool({ sessionId, record: (execution, receipt) => {
            const meta = { ...receipt, agentId: execution.agentId, sessionId, callId: execution.callId };
            writer.recordProjectedEvidence({ eventType: "audit", payload: JSON.stringify(meta), meta });
          } }).body({ name: "todo", token: "plan", callId: "plan", rootCallId: "plan", parentToken: null,
            agentId: "default", workspace, actionClass: "READ_ONLY", requestedMode: "EXECUTE", effectiveMode: "EXECUTE",
            arguments: { items: [{ id: "one", content: "Signed current plan.", status: "pending" }] } });
          writer.endTurn({ reason: "complete" }); writer.sealTurn();
          return { ok: true, text: "", status: "idle", validation: { status: "not-requested", turn: null, configSha256: null, checks: [] } };
        },
        cancel() {}, readEvents: () => writer.readEvents(),
        close: () => { try { writer.close({ reason: "completed" }); } finally { writer.disposeWithoutClosing(); } }
      };
    } });
  agents.push(agent); let sequence = 0;
  return { queued, prompts, get updates() { return frames.filter(frame => frame.method === "session/update"); }, get inbox() { return inbox; }, get writer() { return writer; }, async call(method: string, params: unknown) {
    const id = ++sequence; agent.connection.ingest(Buffer.from(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`));
    await vi.waitFor(() => expect(frames.find(frame => frame.id === id)).toBeDefined(), { timeout: 5000, interval: 5 });
    return frames.find(frame => frame.id === id)!;
  } };
}
async function ready(supportsRequestIds = true, negotiatePlans = false, planOnPrompt = false) {
  const client = peer(supportsRequestIds, planOnPrompt);
  await client.call("initialize", { protocolVersion: 1, clientCapabilities: negotiatePlans
    ? { _meta: { "dev.agentmaturity.amc": { currentPlanUpdates: "amc-current-plan-v1" } } } : {} });
  const sessionId = (await client.call("session/new", { cwd: workspace, mcpServers: [] })).result!.sessionId as string;
  return { client, sessionId };
}

describe("WP20 ACP inbox ownership and request-id forwarding", () => {
  it.each([false, true])("emits current plan updates only when negotiated: %s", async negotiated => {
    const { client, sessionId } = await ready(true, negotiated, true);
    expect((await client.call("session/prompt", { sessionId, prompt: [{ type: "text", text: "task" }] })).error).toBeUndefined();
    expect(client.updates.filter(frame => frame.params?.update?.sessionUpdate === "plan")).toHaveLength(negotiated ? 1 : 0);
  });

  it("passes the admitted request id to the native prompt option", async () => {
    const { client, sessionId } = await ready();
    expect((await client.call("session/prompt", { sessionId, prompt: [{ type: "text", text: "task" }],
      _meta: { "dev.agentmaturity.amc": { clientRequestId: "request-1" } } })).error).toBeUndefined();
    expect(client.prompts).toEqual([{ clientRequestId: "request-1" }]);
  });

  it("refuses unsupported factories and malformed ids before calling prompt", async () => {
    const { client, sessionId } = await ready(false);
    for (const clientRequestId of ["request-1", "", "\n", "x".repeat(129)]) {
      expect((await client.call("session/prompt", { sessionId, prompt: [{ type: "text", text: "task" }],
        _meta: { "dev.agentmaturity.amc": { clientRequestId } } })).error).toMatchObject({ code: -32602 });
    }
    expect(client.prompts).toEqual([]);
  });

  it("refuses malformed request ids on supported factories before prompt admission", async () => {
    const { client, sessionId } = await ready();
    for (const clientRequestId of ["", "line\nbreak", "x".repeat(129)]) {
      expect((await client.call("session/prompt", { sessionId, prompt: [{ type: "text", text: "task" }],
        _meta: { "dev.agentmaturity.amc": { clientRequestId } } })).error).toMatchObject({ code: -32602 });
    }
    expect(client.prompts).toEqual([]);
  });

  it("refuses malformed withdrawal identities before invoking the owned inbox", async () => {
    const { client, sessionId } = await ready();
    for (const messageId of ["", "line\nbreak", "x".repeat(129), 1]) {
      expect((await client.call("_amc/session/withdraw", { sessionId, messageId })).error).toMatchObject({ code: -32602 });
    }
    expect(client.inbox.nextTurn).toHaveLength(3);
  });

  it("withdraws the selected owned queued message and refuses unknown sessions or extra fields", async () => {
    const { client, sessionId } = await ready();
    expect((await client.call("_amc/session/withdraw", { sessionId: "another-session", messageId: client.queued[1] })).error).toMatchObject({ code: -32602 });
    expect((await client.call("_amc/session/withdraw", { sessionId, messageId: client.queued[1], all: true })).error).toMatchObject({ code: -32602 });
    expect(client.inbox.nextTurn).toHaveLength(3);
    expect((await client.call("_amc/session/withdraw", { sessionId, messageId: client.queued[1] })).result).toEqual({ withdrawn: true });
    expect(client.inbox.nextTurn.map(message => message.messageId)).toEqual([client.queued[0], client.queued[2]]);
    expect(new LoopInbox(client.writer, () => {}).nextTurn).toEqual(client.inbox.nextTurn);
    expect((await client.call("_amc/session/withdraw", { sessionId, messageId: client.queued[1] })).result).toEqual({ withdrawn: false });
  });
});
