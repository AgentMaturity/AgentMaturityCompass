import { existsSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ToolRegistry, defineTool } from "../src/tools/toolRegistry.js";
import { ToolPipeline } from "../src/tools/toolPipeline.js";
import { applyPlanMode, PLAN_MODE_DENIAL, PLAN_MODE_GUARD, planModeDenies } from "../src/agent/planMode.js";
import { registerAgentCommands } from "../src/cli-agent-commands.js";
import { initWorkspace } from "../src/workspace.js";
import { initBudgets } from "../src/budgets/budgets.js";
import { writeRuntimeFirewallPolicy } from "../src/runtime/firewall.js";
import { openLedger } from "../src/ledger/ledger.js";
import { verifyAgentRun, type AgentRunSummary } from "../src/agent/runReport.js";
import { runComposedTurn, type ComposedTurnOptions } from "../src/kernel/agentLoopRunner.js";
import { STUB_PROVIDER_ID, STUB_PROVIDER_MODEL, stubProviderRoute, stubProviderTransport } from "../src/agent/stubProvider.js";
import { extractEnvelope } from "../src/session/sessionTypes.js";
import type { EvidenceEvent } from "../src/types.js";

/**
 * SH-LOOP-04: plan mode is a READ_ONLY action-class budget on the root registry (the same mechanism as a
 * `--delegate-scope READ_ONLY` child), backed by a deny-only guard for tools defined later, and a per-turn fact:
 * the executing turn resumes the SAME session without `--plan`.
 */
function tool(name: string, actionClass: Parameters<typeof defineTool>[0]["actionClass"]) {
  return defineTool({ name, actionClass, description: name, body: () => ({ ok: true, output: `${name} ran` }) });
}

describe("applyPlanMode on a registry", () => {
  it("withholds every non-READ_ONLY tool and the three named READ_ONLY ones; a tool defined later is denied by the guard", async () => {
    // MUTATION: make `planModeDenies` return false for WRITE_LOW and the late `late.write` call succeeds.
    const registry = new ToolRegistry();
    for (const entry of [tool("fs.read", "READ_ONLY"), tool("fs.write", "WRITE_LOW"), tool("bash", "WRITE_HIGH"), tool("delegate", "READ_ONLY"), tool("job_kill", "READ_ONLY"), tool("plan", "READ_ONLY")]) registry.define(entry);
    const withheld = applyPlanMode(registry);
    expect(withheld).toEqual(["bash", "delegate", "fs.write", "job_kill"]);
    expect([...registry.visible().keys()].sort()).toEqual(["fs.read", "plan"]);
    registry.define(tool("late.write", "WRITE_LOW"));
    registry.define(tool("late.read", "READ_ONLY"));
    const workspace = mkdtempSync(join(tmpdir(), "amc-plan-mode-"));
    try {
      const pipeline = new ToolPipeline({ registry, workspace });
      const denied = await pipeline.execute({ name: "late.write", agentId: "a", arguments: {}, requestedMode: "EXECUTE" });
      expect(denied.ok).toBe(false);
      expect(denied.denied).toMatchObject({ stage: "guard", guardLabel: PLAN_MODE_GUARD, reason: PLAN_MODE_DENIAL });
      const allowed = await pipeline.execute({ name: "late.read", agentId: "a", arguments: {}, requestedMode: "EXECUTE" });
      expect(allowed.ok).toBe(true);
      expect(planModeDenies("workflow", "READ_ONLY")).toBe(true);
    } finally { rmSync(workspace, { recursive: true, force: true }); }
  });
});

describe("amc agent-loop run --plan", () => {
  const originalCwd = process.cwd();
  let workspace: string;
  let credentialsHome: string;
  let priorExitListeners: ReturnType<typeof process.listeners>;

  beforeEach(() => {
    workspace = realpathSync(mkdtempSync(join(tmpdir(), "amc-cli-plan-mode-")));
    credentialsHome = realpathSync(mkdtempSync(join(tmpdir(), "amc-cli-plan-home-")));
    initWorkspace({ workspacePath: workspace, agentId: "default", trustBoundaryMode: "isolated" });
    initBudgets(workspace, "default");
    writeRuntimeFirewallPolicy({ workspace, mode: "observe" });
    priorExitListeners = process.listeners("exit");
    process.chdir(workspace);
  });
  afterEach(() => {
    process.chdir(originalCwd);
    for (const listener of process.listeners("exit")) if (!priorExitListeners.includes(listener)) { process.removeListener("exit", listener); listener(0); }
    rmSync(workspace, { recursive: true, force: true });
    rmSync(credentialsHome, { recursive: true, force: true });
  });

  async function runCli(args: string[]): Promise<{ summary: AgentRunSummary | null; errors: string[]; failed: boolean }> {
    const output: string[] = []; const errors: string[] = []; let failed = false;
    const program = new Command().exitOverride();
    registerAgentCommands(program, { log: line => output.push(line), error: line => errors.push(line), fail: () => { failed = true; } });
    await program.parseAsync(["agent-loop", "run", ...args, "--provider", "stub", "--credentials-home", credentialsHome, "--json"], { from: "user" });
    const last = output.at(-1);
    return { summary: last === undefined || failed ? null : JSON.parse(last) as AgentRunSummary, errors, failed };
  }
  const rows = (sessionId: string) => { const ledger = openLedger(workspace, { readonly: true }); try { return ledger.getAllEvents().filter(row => row.session_id === sessionId); } finally { ledger.close(); } };
  // Under the default write scope (./workspace/output/**), so the executing turn's write is policy-permitted.
  const planned = () => join(workspace, "workspace", "output", "planned.txt");
  const write = JSON.stringify({ tool: "fs.write", arguments: { path: "workspace/output/planned.txt", content: "executed\n" } });

  const toolCalls = (sessionRows: ReturnType<typeof rows>, turn: number) => sessionRows
    .filter(row => row.event_type === "tool/call" && (JSON.parse(row.meta_json) as { amcSession?: { turn?: number } }).amcSession?.turn === turn)
    .map(row => (JSON.parse(row.meta_json) as { toolName: string }).toolName);

  it("plans without writing, then the same session executes the plan in a turn without --plan", async () => {
    // MUTATION: skip `applyPlanMode` in agentToolset when planMode is set and turn 1 calls fs.write.
    const planning = await runCli([write, "--tools", "workspace", "--plan", "--keep-open"]);
    expect(planning.failed, planning.errors.join("\n")).toBe(false);
    expect(existsSync(planned())).toBe(false);
    const plannedRows = rows(planning.summary!.sessionId);
    expect(toolCalls(plannedRows, 1)).not.toContain("fs.write");
    const audit = plannedRows.find(row => row.event_type === "audit" && (JSON.parse(row.meta_json) as { auditType?: string }).auditType === "NATIVE_PLAN_MODE");
    expect(audit, "a signed per-turn NATIVE_PLAN_MODE row").toBeDefined();
    expect(JSON.parse(audit!.meta_json) as { withheldTools: string[]; turn: number }).toMatchObject({ turn: 1, withheldTools: expect.arrayContaining(["fs.write"]) });
    expect(extractEnvelope(audit!.meta_json)?.turn).toBe(1);
    // The native-composition row names what the model was offered: no fs.write in plan mode.
    const offered = plannedRows.filter(row => row.event_type === "audit" && row.meta_json.includes("offered-tools")).map(row => row.meta_json).join("\n");
    expect(offered).not.toContain("\"fs.write\"");
    expect(planning.errors.join("\n")).toContain("plan mode");
    const executing = await runCli([write, "--tools", "workspace", "--session", planning.summary!.sessionId]);
    expect(executing.failed, executing.errors.join("\n")).toBe(false);
    expect(executing.summary!.sessionId).toBe(planning.summary!.sessionId);
    // The executing turn's directed fs.write runs (under the workspace's action policy, which may simulate it).
    const executed = rows(planning.summary!.sessionId);
    expect(toolCalls(executed, 2)).toContain("fs.write");
    const result = executed.find(row => row.event_type === "tool/result" && (JSON.parse(row.meta_json) as { amcSession?: { turn?: number } }).amcSession?.turn === 2);
    expect((JSON.parse(result!.meta_json) as { outcome: string }).outcome).toBe("OK");
    const verified = await verifyAgentRun(workspace, planning.summary!.sessionId);
    expect(verified.integrityOk).toBe(true);
  });

  it("refuses --plan with --delegate, with --goal-rounds and without workspace tools, before any session row", async () => {
    // MUTATION: drop the --validate refusal and a planning turn runs checks plan mode can only deny.
    const checks = join(credentialsHome, "checks.json");
    writeFileSync(checks, JSON.stringify({ schemaVersion: 1, checks: [{ id: "unit", title: "Unit", command: "printf never > must-not-run", timeoutMs: 1000 }] }));
    for (const extra of [["--tools", "workspace", "--delegate"], ["--tools", "workspace", "--delegate", "--goal-rounds", "2"], ["--tools", "echo"],
      ["--tools", "workspace", "--validation-config", checks, "--validate", "unit"]]) {
      const result = await runCli(["plan something", "--plan", ...extra]);
      expect(result.failed, extra.join(" ")).toBe(true);
      expect(result.errors.join("\n")).toMatch(/--plan/);
    }
    const ledger = openLedger(workspace, { readonly: true });
    try { expect(ledger.getAllEvents().filter(row => row.event_type === "session/open")).toHaveLength(0); } finally { ledger.close(); }
  });
});

describe("the per-turn NATIVE_PLAN_MODE fact through the composed runner", () => {
  let workspace: string; let home: string;
  beforeEach(() => {
    workspace = realpathSync(mkdtempSync(join(tmpdir(), "amc-plan-turns-")));
    home = realpathSync(mkdtempSync(join(tmpdir(), "amc-plan-turns-home-")));
    initWorkspace({ workspacePath: workspace, agentId: "default", trustBoundaryMode: "isolated" });
  });
  afterEach(() => { rmSync(workspace, { recursive: true, force: true }); rmSync(home, { recursive: true, force: true }); });
  const base = (): ComposedTurnOptions => ({
    workspace, agentId: "default", systemPrompt: "You are an AMC-governed agent.", prompt: "plan it", planMode: { withheldTools: ["fs.write"] },
    route: { providerId: STUB_PROVIDER_ID, model: STUB_PROVIDER_MODEL, params: { max_tokens: 256, stream: true } },
    routes: [stubProviderRoute()], transport: stubProviderTransport(), credentials: { homeDir: home, env: {}, watch: false, projectDir: null }
  });
  const all = (): EvidenceEvent[] => { const ledger = openLedger(workspace, { readonly: true }); try { return ledger.getAllEvents(); } finally { ledger.close(); } };
  const planRows = (rows: readonly EvidenceEvent[]) => rows.filter(row => row.event_type === "audit" && (JSON.parse(row.meta_json) as { auditType?: string }).auditType === "NATIVE_PLAN_MODE");

  it("records one row inside every turn the run opens, a queued follow-up included", async () => {
    // MUTATION: record once at session open (the old placement) and turn 2 has no row, while turn 1's row precedes its turn/start.
    const outcome = await runComposedTurn({ ...base(), onReady: handle => { handle.queue("and the second turn"); } });
    const rows = all().filter(row => row.session_id === outcome.sessionId);
    expect(rows.filter(row => row.event_type === "turn/start")).toHaveLength(2);
    const recorded = planRows(rows);
    expect(recorded.map(row => [extractEnvelope(row.meta_json)?.turn, (JSON.parse(row.meta_json) as { turn: number }).turn])).toEqual([[1, 1], [2, 2]]);
    for (const row of recorded) {
      const turn = extractEnvelope(row.meta_json)!.turn;
      const start = rows.findIndex(other => other.event_type === "turn/start" && extractEnvelope(other.meta_json)?.turn === turn);
      expect(rows.indexOf(row)).toBeGreaterThan(start);
    }
  });

  it("leaves no plan-mode claim when composition fails before a turn, and refuses goal rounds before any session row", async () => {
    await expect(runComposedTurn({ ...base(), route: { providerId: "no-such-provider", model: "x", params: { max_tokens: 16, stream: true } } })).rejects.toThrow();
    expect(planRows(all())).toHaveLength(0);
    // MUTATION: drop the plan-mode refusal at the top of runComposedTurn and this reaches the goal-rounds checks instead.
    await expect(runComposedTurn({ ...base(), goalRounds: { maxRounds: 1 } })).rejects.toThrow(/Plan mode narrows the root toolset only/);
  });
});
