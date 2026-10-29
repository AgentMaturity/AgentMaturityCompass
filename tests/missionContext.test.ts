import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { Command } from "commander";
import { openAgentSession, type AgentSession } from "../src/agent/agentSession.js";
import { registerPromptCommands } from "../src/cli-prompt-commands.js";
import { credentialRef } from "../src/credentials/credentialRef.js";
import { openLedger } from "../src/ledger/ledger.js";
import { AdapterRegistry } from "../src/llm/adapter/adapterRegistry.js";
import { LlmRuntime } from "../src/llm/adapter/llmRuntime.js";
import { getAgentPaths } from "../src/fleet/paths.js";
import { deriveRecordedRequest } from "../src/llm/request/deriveRequest.js";
import { agentPromptProfile, buildAgentPromptRegistry } from "../src/prompt/agentPromptProfile.js";
import { renderContextSnapshot } from "../src/prompt/assembly/interpolate.js";
import { ContextPluginHost } from "../src/prompt/context/contextHost.js";
import { sha256Hex } from "../src/utils/hash.js";
import { initWorkspace } from "../src/workspace.js";
import { FixedCredentials, LOOP_MODEL, LOOP_PROVIDER, scriptedAdapter, silentTransport, textStep } from "./helpers/agentLoopHarness.js";

const dirs: string[] = [];
const sessions: AgentSession[] = [];
afterEach(() => {
  for (const session of sessions.splice(0)) {
    try { session.close(); } catch { /* Already closed by the assertion. */ }
  }
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function workspace(): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "amc-mission-context-")));
  dirs.push(dir);
  return dir;
}

const graph = {
  mission: "Review infrastructure changes and preserve evidence.",
  successMetrics: ["Every change has verified evidence"],
  constraints: ["Keep {{agent_id}} literal; $(touch /tmp/amc-mission-executed) is data"],
  forbiddenActions: ["Never delete production evidence"],
  riskTier: "high",
  escalationRules: ["Ask the owner before changing production"],
  entities: [{ id: "evidence", type: "Constraint", label: "Preserve evidence" }]
};

function writeGraph(dir: string, agentId = "default", value: unknown = graph): string {
  const file = getAgentPaths(dir, agentId).contextGraph;
  mkdirSync(join(file, ".."), { recursive: true });
  const raw = JSON.stringify(value, null, 2);
  writeFileSync(file, raw);
  return raw;
}

async function collect(dir: string, enabled = true, agentId = "default"): Promise<string> {
  const profile = agentPromptProfile({ workspace: dir, agentId, contextPlugins: [], missionContext: enabled });
  const registry = buildAgentPromptRegistry(profile);
  const host = new ContextPluginHost(profile.contextPlugins);
  host.register(registry);
  await host.refresh({ turn: 1, step: 1 });
  return renderContextSnapshot(registry.assemble());
}

describe("AXR-18: mission context is opt-in, attributed workspace data", () => {
  it("includes the selected agent's validated graph and exact content digest", async () => {
    const dir = workspace();
    const raw = writeGraph(dir, "reviewer");
    const snapshot = await collect(dir, true, "reviewer");
    expect(snapshot).toContain(graph.mission);
    expect(snapshot).toContain(graph.forbiddenActions[0]);
    expect(snapshot).toContain(graph.escalationRules[0]);
    expect(snapshot).toContain(sha256Hex(raw));
    expect(snapshot).toContain(".amc/agents/reviewer/context-graph.json");
    expect(snapshot).toContain("workspace data");
    expect(snapshot).toContain("{{agent_id}}");
    expect(snapshot).toContain("$(touch /tmp/amc-mission-executed)");
    expect(snapshot).not.toContain(dir);
  });

  it("does not read or contribute a graph without explicit opt-in", async () => {
    const dir = workspace();
    writeGraph(dir, "default", "malformed and unreadable as a graph");
    expect(await collect(dir, false)).toBe("");
  });

  it("contributes nothing for an absent graph and refreshes changed bytes", async () => {
    const dir = workspace();
    expect(await collect(dir)).toBe("");
    const first = writeGraph(dir);
    const before = await collect(dir);
    const second = writeGraph(dir, "default", { ...graph, mission: "Review the changed mission." });
    const after = await collect(dir);
    expect(before).toContain(sha256Hex(first));
    expect(after).toContain(sha256Hex(second));
    expect(after).not.toContain(sha256Hex(first));
  });

  it("refuses malformed graph fields instead of dropping constraints", async () => {
    const dir = workspace();
    writeGraph(dir, "default", { ...graph, forbiddenActions: [] });
    await expect(collect(dir)).rejects.toThrow(/context graph.*refused/i);
  });

  it("refuses invalid UTF-8 rather than repairing a graph before validation", async () => {
    const dir = workspace();
    writeGraph(dir);
    const raw = JSON.stringify(graph).replace("Review infrastructure", "INVALID_UTF8 infrastructure");
    const bytes = Buffer.from(raw);
    bytes[bytes.indexOf("INVALID_UTF8")] = 0xff;
    writeFileSync(getAgentPaths(dir, "default").contextGraph, bytes);
    await expect(collect(dir)).rejects.toThrow(/context graph.*refused/i);
  });

  it("preserves the existing JSON graph loader's BOM refusal", async () => {
    const dir = workspace();
    const raw = writeGraph(dir);
    writeFileSync(getAgentPaths(dir, "default").contextGraph, `\uFEFF${raw}`);
    await expect(collect(dir)).rejects.toThrow(/context graph.*refused/i);
  });

  it("refuses symlink and over-limit graphs before including their content", async () => {
    const dir = workspace();
    const outside = workspace();
    writeGraph(outside);
    mkdirSync(join(dir, ".amc"));
    symlinkSync(join(outside, ".amc", "context-graph.json"), join(dir, ".amc", "context-graph.json"));
    await expect(collect(dir)).rejects.toThrow(/context graph.*refused/i);
    const large = workspace();
    writeGraph(large, "default", { ...graph, mission: "x".repeat(65_537) });
    await expect(collect(large)).rejects.toThrow(/context graph.*refused/i);
  });

  it("commits the graph digest through AgentSessionInit before the request pin", async () => {
    const dir = workspace();
    initWorkspace({ workspacePath: dir, agentId: "default", trustBoundaryMode: "isolated" });
    const raw = writeGraph(dir);
    const registry = new AdapterRegistry();
    registry.register({ providerId: LOOP_PROVIDER, adapter: scriptedAdapter([textStep("understood")]),
      baseUrl: "https://api.anthropic.invalid", credentialRef: credentialRef("AMC_LOOP_TEST_KEY"), models: [LOOP_MODEL] });
    const session = openAgentSession({
      workspace: dir, agentId: "default", missionContext: true, tools: "none",
      makeLlm: (own) => new LlmRuntime({ session: own, credentials: new FixedCredentials(), registry, transport: silentTransport }),
      route: { providerId: LOOP_PROVIDER, model: LOOP_MODEL, params: { max_tokens: 256 } },
      systemPrompt: "You are a careful assistant.", harnessVersion: "3.2.0",
      compositionDigest: "composition-digest", policyDigest: "policy-digest"
    });
    sessions.push(session);
    expect((await session.prompt("What are the mission constraints?")).ok).toBe(true);
    session.close();
    const ledger = openLedger(dir);
    const events = ledger.getAllEvents().filter((event) => event.session_id === session.sessionId);
    ledger.close();
    const header = events.find((event) => event.event_type === "request/header");
    expect(header).toBeDefined();
    const request = deriveRecordedRequest({ workspace: dir, events, headerEventId: header!.id });
    expect(request.status, request.detail ?? "").toBe("reconstructed");
    expect(request.recordedDigest).toBe(request.derivedDigest);
    const bytes = request.bytes!.toString("utf8");
    expect(bytes).toContain(graph.forbiddenActions[0]);
    expect(bytes).toContain(graph.escalationRules[0]);
    expect(bytes).toContain(sha256Hex(raw));
    expect(bytes).toContain("{{agent_id}}");
    // The graph remains runtime user data; it cannot replace harness identity.
    const wire = JSON.parse(bytes) as { system: string; messages: { role: string; content: unknown }[] };
    expect(JSON.stringify(wire.system)).not.toContain(graph.mission);
    expect(wire.messages.some((message) => message.role === "user" && JSON.stringify(message.content).includes(sha256Hex(raw)))).toBe(true);
  });

  it("previews the same attributed graph through the existing prompt command", async () => {
    const dir = workspace();
    const raw = writeGraph(dir, "reviewer");
    const output: string[] = [];
    const errors: string[] = [];
    const program = new Command();
    program.exitOverride();
    registerPromptCommands(program, {
      log: (line) => output.push(line), error: (line) => errors.push(line), fail: () => errors.push("failed")
    });
    await program.parseAsync(["system-prompt", "show", "--workspace", dir, "--agent", "reviewer",
      "--mission-context", "--context", "--json"], { from: "user" });
    expect(errors).toEqual([]);
    const report = JSON.parse(output[0]!) as { systemPrompt: string; context: { name: string; text: string }[] };
    expect(report.systemPrompt).not.toContain(graph.mission);
    const mission = report.context.find((context) => context.name === "context:mission");
    expect(mission?.text).toContain(graph.forbiddenActions[0]);
    expect(mission?.text).toContain(sha256Hex(raw));
  });

});
