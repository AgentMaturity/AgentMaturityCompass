import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerAgentCommands } from "../src/cli-agent-commands.js";
import { getPublicKeyPem } from "../src/crypto/keys.js";
import { sha256Hex } from "../src/utils/hash.js";
import { startAcpStdio } from "../src/acp/acpStdioMain.js";
import { initProcessorRegistry, type ProcessorRegistryV1 } from "../src/dataflow/processorRegistry.js";
import { EXECUTION_API_VERSION } from "../src/execution/executionContract.js";
import { openLedger } from "../src/ledger/ledger.js";
import { readEventPayload } from "../src/session/eventPayload.js";
import { readNativeSessionEvents } from "../src/session/readNativeSessionEvents.js";
import { lockVault } from "../src/vault/vault.js";
import { initWorkspace } from "../src/workspace.js";

/**
 * P2-13 at the ACP runtime every SDK drives (`amc acp`, in-process over memory pipes): the execution API version, the
 * phases on every settled prompt, and `_amc/session/fork`, the CLI's --fork-from: a child whose signed open row names the
 * verified parent, refused with the same coded reason as every other surface, and redaction-wrapped like any session.
 */
type Frame = { id?: number; result?: Record<string, unknown>; error?: { code: number; message: string; data?: Record<string, unknown> } };
const AMC = "dev.agentmaturity.amc";
let workspace: string, home: string;

beforeEach(() => {
  vi.stubEnv("AMC_VAULT_PASSPHRASE", `p213-acp-${randomUUID()}`);
  workspace = realpathSync(mkdtempSync(join(tmpdir(), "amc-p213-acp-")));
  home = realpathSync(mkdtempSync(join(tmpdir(), "amc-p213-acp-home-")));
  initWorkspace({ workspacePath: workspace, agentId: "default", trustBoundaryMode: "isolated" });
}, 60_000);
afterEach(() => {
  lockVault(workspace);
  rmSync(workspace, { recursive: true, force: true }); rmSync(home, { recursive: true, force: true });
  vi.unstubAllEnvs();
});

function acp() {
  const stdin = new EventEmitter();
  const frames: Frame[] = [];
  const handle = startAcpStdio({ workspace, agentId: "default", providerId: "stub", systemPrompt: "s", tools: "none",
    credentialsMode: "operator-only", credentialsHome: home, stdin,
    stdout: { write: (bytes) => { frames.push(JSON.parse(bytes.toString("utf8")) as Frame); return true; } },
    stderr: { write: () => true } });
  let next = 1;
  const call = async (method: string, params: unknown): Promise<Frame> => {
    const id = next++;
    stdin.emit("data", Buffer.from(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`));
    await vi.waitFor(() => expect(frames.find((frame) => frame.id === id)).toBeDefined(), { timeout: 60_000, interval: 20 });
    return frames.find((frame) => frame.id === id)!;
  };
  return { call, close: () => handle.close() };
}
const scope = () => ({ cwd: workspace, mcpServers: [] });
const prompt = (sessionId: string, text: string) => ({ sessionId, prompt: [{ type: "text", text }] });
const sessionRows = () => { const ledger = openLedger(workspace, { readonly: true }); try { return ledger.getAllSessions().length; } finally { ledger.close(); } };

describe("the native ACP runtime under the execution contract (P2-13)", () => {
  it("advertises the execution API and lineage forks, and reports the phases of every settled prompt", async () => {
    const client = acp();
    try {
      const init = await client.call("initialize", { protocolVersion: 1, clientCapabilities: {} });
      const meta = ((init.result!.agentCapabilities as Record<string, unknown>)._meta as Record<string, Record<string, unknown>>)[AMC]!;
      expect(meta.executionApi).toBe(EXECUTION_API_VERSION);
      expect(meta.lineageFork).toBe("verified-parent-reference");
      const parent = (await client.call("session/new", scope())).result!.sessionId as string;
      const answered = await client.call("session/prompt", prompt(parent, "first turn"));
      expect(answered.result?.stopReason).toBe("end_turn");
      expect((answered.result!._meta as Record<string, Record<string, unknown>>)[AMC]!.execution).toEqual({ sessionId: parent,
        phases: { admission: "succeeded", "model-completion": "succeeded", "side-effect-completion": "succeeded", "evidence-verification": "pending" },
        receiptStates: [] });

      const forked = await client.call("_amc/session/fork", { sessionId: parent, ...scope() });
      expect(forked.error).toBeUndefined();
      const child = forked.result!.sessionId as string;
      expect(child).not.toBe(parent);
      expect((forked.result!._meta as Record<string, Record<string, unknown>>)[AMC]).toMatchObject({ forkContext: "lineage-only",
        parentSession: { sessionId: parent } });
      const opening = readNativeSessionEvents(workspace, child)[0]!;
      expect(opening.event_type).toBe("session/open");
      expect((JSON.parse(opening.meta_json) as { parentSession: { sessionId: string } }).parentSession.sessionId).toBe(parent);
      const childTurn = await client.call("session/prompt", prompt(child, "child turn"));
      expect((childTurn.result!._meta as Record<string, Record<string, Record<string, unknown>>>)[AMC]!.execution!.phases)
        .toMatchObject({ "model-completion": "succeeded", "evidence-verification": "pending" });
    } finally { await client.close(); }
  }, 120_000);

  it("refuses a lineage fork of an unverifiable parent with the coded reason, before any session row", async () => {
    const client = acp();
    try {
      await client.call("initialize", { protocolVersion: 1, clientCapabilities: {} });
      const before = sessionRows();
      const refused = await client.call("_amc/session/fork", { sessionId: randomUUID(), ...scope() });
      expect(refused.error?.message).toBe("verified session fork was refused");
      expect(refused.error?.data?.reason).toBe("MISSING");
      expect(sessionRows()).toBe(before);
    } finally { await client.close(); }
  }, 120_000);

  it("redacts a forked child's input like any session's in an opted-in workspace (P2-02)", async () => {
    const registry = JSON.parse(readFileSync(join("catalog", "fixtures", "L0-DAT-01", "positive", "declared-class.json"), "utf8"))
      .setup.registry as ProcessorRegistryV1;
    initProcessorRegistry(workspace, registry);
    const client = acp();
    try {
      await client.call("initialize", { protocolVersion: 1, clientCapabilities: {} });
      const parent = (await client.call("session/new", scope())).result!.sessionId as string;
      const child = (await client.call("_amc/session/fork", { sessionId: parent, ...scope() })).result!.sessionId as string;
      await client.call("session/prompt", prompt(child, "reach me at jane.roe@example.com"));
      const committed = readNativeSessionEvents(workspace, child).filter((row) => row.event_type === "user/message");
      expect(committed.length).toBeGreaterThan(0);
      for (const row of committed) {
        const payload = readEventPayload(workspace, row);
        expect(payload.status).toBe("ok");
        expect(payload.status === "ok" && payload.bytes.toString("utf8")).not.toContain("jane.roe@example.com");
      }
    } finally { await client.close(); }
  }, 120_000);
});

describe("the CLI's --json reports carry the same phases (P2-13)", () => {
  async function cli(args: string[]): Promise<{ json: Record<string, unknown>; failed: boolean }> {
    const output: string[] = [];
    let failed = false;
    const program = new Command().exitOverride();
    registerAgentCommands(program, { log: (line) => output.push(line), error: () => {}, fail: () => { failed = true; } });
    const cwd = process.cwd();
    process.chdir(workspace);
    try { await program.parseAsync(args, { from: "user" }); } finally { process.chdir(cwd); }
    return { json: JSON.parse(output.at(-1)!) as Record<string, unknown>, failed };
  }

  it("run reports evidence pending; verify reports the verifier's verdict without touching the model phase", async () => {
    const run = await cli(["agent-loop", "run", "hello", "--provider", "stub", "--tools", "none", "--credentials-home", home, "--json"]);
    expect(run.failed).toBe(false);
    const sessionId = run.json.sessionId as string;
    expect(run.json.execution).toEqual({ sessionId, receiptStates: [],
      phases: { admission: "succeeded", "model-completion": "succeeded", "side-effect-completion": "succeeded", "evidence-verification": "pending" } });
    const verified = await cli(["agent-loop", "verify", sessionId, "--json", "--expect-monitor", sha256Hex(getPublicKeyPem(workspace, "monitor"))]);
    expect(verified.json.ok).toBe(true);
    expect((verified.json.execution as { phases: unknown }).phases).toEqual({ admission: "succeeded", "model-completion": "succeeded",
      "side-effect-completion": "succeeded", "evidence-verification": "succeeded" });
    const unknown = await cli(["agent-loop", "verify", randomUUID(), "--json", "--expect-monitor", sha256Hex(getPublicKeyPem(workspace, "monitor"))]);
    expect(unknown.failed).toBe(true);
    expect((unknown.json.execution as { phases: Record<string, string> }).phases).toMatchObject({ admission: "pending", "evidence-verification": "failed" });
  }, 120_000);
});
