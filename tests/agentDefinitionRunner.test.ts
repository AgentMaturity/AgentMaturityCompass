import { mkdtempSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { initWorkspace } from "../src/workspace.js";
import { initBudgets } from "../src/budgets/budgets.js";
import { writeRuntimeFirewallPolicy } from "../src/runtime/firewall.js";
import { SessionService } from "../src/session/sessionService.js";
import { AdapterRegistry } from "../src/llm/adapter/adapterRegistry.js";
import { LlmRuntime } from "../src/llm/adapter/llmRuntime.js";
import { rootIdentity } from "../src/agent/delegationIdentity.js";
import { spawnSubagent } from "../src/agent/subagentSpawn.js";
import { createDriverRunner } from "../src/agent/subagentRunner.js";
import { applyAgentDefinition, type AgentDefinition } from "../src/agent/agentDefinitions.js";
import { createForeignRunner } from "../src/agent/foreignSubagentRunner.js";
import { credentialRef } from "../src/credentials/credentialRef.js";
import { FixedCredentials, LOOP_MODEL, LOOP_PROVIDER, scriptedAdapter, silentTransport, textStep, toolStep } from "./helpers/agentLoopHarness.js";

/**
 * A real child under a definition (SH-ORCH-01): the tool allowlist is applied
 * to the child's registry (fail closed), the step ceiling only lowers the
 * parent's, and the child's own signed session records which definition bound
 * it. A foreign child refuses a definition, because nothing in another process
 * enforces it.
 */
const PASS = "agent-definition-runner-test-passphrase";
const dirs: string[] = [];
afterEach(() => {
  while (dirs.length > 0) {
    const dir = dirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

function workspace(): string {
  process.env["AMC_VAULT_PASSPHRASE"] = PASS;
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "amc-agent-def-runner-")));
  dirs.push(dir);
  initWorkspace({ workspacePath: dir, agentId: "payments-agent", trustBoundaryMode: "isolated" });
  initBudgets(dir, "payments-agent");
  writeRuntimeFirewallPolicy({ workspace: dir, mode: "observe" });
  return dir;
}

function runnerFor(dir: string, scripts: ReturnType<typeof textStep>[], maxStepsPerTurn = 8) {
  const registry = new AdapterRegistry();
  registry.register({ providerId: LOOP_PROVIDER, adapter: scriptedAdapter(scripts), baseUrl: "https://api.anthropic.invalid",
    credentialRef: credentialRef("AMC_LOOP_TEST_KEY"), models: [LOOP_MODEL] });
  let clock = 1_000;
  return createDriverRunner({
    workspace: dir,
    makeLlm: (session) => new LlmRuntime({ session, credentials: new FixedCredentials(), registry, transport: silentTransport,
      now: () => { clock += 5; return clock; } }),
    route: { providerId: LOOP_PROVIDER, model: LOOP_MODEL, params: { max_tokens: 256 } },
    systemPrompt: "You are a careful delegate.", harnessVersion: "3.2.0", compositionDigest: "composition-digest", policyDigest: "policy-digest",
    config: { maxStepsPerTurn }
  });
}

function rows(dir: string, sessionId: string): Array<Record<string, unknown>> {
  const db = new Database(join(dir, ".amc", "evidence.sqlite"), { readonly: true });
  try {
    return (db.prepare("SELECT meta_json FROM evidence_events WHERE session_id = ? ORDER BY rowid").all(sessionId) as Array<{ meta_json: string }>)
      .map(row => JSON.parse(row.meta_json) as Record<string, unknown>);
  } finally { db.close(); }
}

const reviewer: AgentDefinition = { name: "reviewer", description: "reads only", body: "Only read.", sourcePath: "/w/.amc/agents/reviewer.md",
  sha256: "c".repeat(64), tools: ["glob"] };

function parentSession(dir: string): SessionService {
  const session = new SessionService(dir);
  session.open({ agentId: "payments-agent", harnessVersion: "3.2.0", compositionDigest: "c", policyDigest: "p" });
  return session;
}

describe("a real child under a definition", () => {
  it("has every tool outside the allowlist denied, and records the definition in its own session", async () => {
    const dir = workspace();
    const applied = applyAgentDefinition({ runAs: "researcher", goal: "read the ledger" }, reviewer);
    if (!applied.ok) throw new Error(applied.reason);
    const session = parentSession(dir);
    const outcome = await spawnSubagent({ workspace: dir, parent: rootIdentity("payments-agent"), request: applied.request, session,
      runner: runnerFor(dir, [toolStep("t0", "glob", JSON.stringify({ pattern: "*.md" })),
        toolStep("t1", "fs.read", JSON.stringify({ path: "README.md" })), textStep("fs.read was not available to me.")]),
      mintSessionId: () => "child-under-reviewer" });
    expect(outcome.ok, outcome.ok ? "" : outcome.reason).toBe(true);
    const child = rows(dir, "child-under-reviewer");
    const control = child.find(meta => meta["kind"] === "delegation/hook-control")!;
    expect(control["agentDefinition"]).toEqual({ name: "reviewer", sha256: "c".repeat(64), tools: ["glob"], maxSteps: null });
    // Exactly one denial: the allowlisted glob call went through, and fs.read is not even a name the child's registry knows.
    const denials = child.filter(meta => meta["auditType"] === "TOOL_CALL_DENIED").map(meta => ({ stage: meta["denialStage"], reason: meta["denialReason"] }));
    expect(denials).toEqual([{ stage: "visibility", reason: expect.stringMatching(/unknown tool "fs.read"/) }]);
    session.disposeWithoutClosing();
  });

  it("stops the child at the definition's step ceiling when it is lower than the parent's", async () => {
    const dir = workspace();
    const applied = applyAgentDefinition({ runAs: "researcher", goal: "read the ledger" }, { ...reviewer, tools: undefined as never, maxSteps: 1 });
    if (!applied.ok) throw new Error(applied.reason);
    const session = parentSession(dir);
    const outcome = await spawnSubagent({ workspace: dir, parent: rootIdentity("payments-agent"), request: applied.request, session,
      runner: runnerFor(dir, [toolStep("t1", "glob", JSON.stringify({ pattern: "*.md" })), textStep("two steps were needed.")], 8),
      mintSessionId: () => "child-one-step" });
    expect(outcome.ok).toBe(false);
    expect(!outcome.ok && outcome.reason).toMatch(/child turn did not complete/);
    const control = rows(dir, "child-one-step").find(meta => meta["kind"] === "delegation/hook-control")!;
    expect((control["agentDefinition"] as { maxSteps: number }).maxSteps).toBe(1);
    session.disposeWithoutClosing();
  });

  it("is refused by a foreign runner, which cannot enforce the definition", async () => {
    const dir = workspace();
    const runner = createForeignRunner({ workspace: dir, spawn: () => ({ command: "false", args: [] }), governedEnv: () => ({ env: {}, lease: "lease" }) });
    const result = await runner({ continuable: false, toolsetAgentId: "payments-agent", identity: { runAs: "r", governedAs: "payments-agent", parent: "payments-agent", depth: 1 },
      childSessionId: "foreign-child", goal: "g", agentDefinition: { name: "reviewer", sha256: "c".repeat(64) } });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/foreign child cannot run under agent definition "reviewer"/);
  });
});
