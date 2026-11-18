import { existsSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { registerAgentCommands } from "../src/cli-agent-commands.js";
import { initWorkspace } from "../src/workspace.js";
import { initBudgets } from "../src/budgets/budgets.js";
import { writeRuntimeFirewallPolicy } from "../src/runtime/firewall.js";
import { openLedger } from "../src/ledger/ledger.js";
import { readEventPayload } from "../src/session/eventPayload.js";
import { extractEnvelope } from "../src/session/sessionTypes.js";
import { verifyAgentRun, type AgentRunSummary } from "../src/agent/runReport.js";
import { initToolsConfig, loadToolsConfig } from "../src/toolhub/toolhubValidators.js";
import { PLAN_READY_AUDIT } from "../src/tools/builtin/planExitTool.js";
import type { EvidenceEvent } from "../src/types.js";

/**
 * HP-08 on the real composed loop and the real toolset: in a `--plan` turn, plan_exit records the plan in a signed
 * NATIVE_PLAN_READY row and the next step boundary is vetoed, so the turn ends; outside plan mode plan_exit is not
 * offered; and nothing the model calls leaves plan mode: a later --plan turn still cannot write.
 */
describe("plan_exit", () => {
  const originalCwd = process.cwd();
  let workspace: string; let home: string;
  let priorExitListeners: ReturnType<typeof process.listeners>;
  beforeEach(() => {
    workspace = realpathSync(mkdtempSync(join(tmpdir(), "amc-plan-exit-")));
    home = realpathSync(mkdtempSync(join(tmpdir(), "amc-plan-exit-home-")));
    initWorkspace({ workspacePath: workspace, agentId: "default", trustBoundaryMode: "isolated" });
    initBudgets(workspace, "default");
    writeRuntimeFirewallPolicy({ workspace, mode: "observe" });
    const config = loadToolsConfig(workspace);
    config.tools.allowedTools.push({ name: "plan_exit", actionClass: "READ_ONLY" } as (typeof config.tools.allowedTools)[number]);
    initToolsConfig(workspace, config);
    priorExitListeners = process.listeners("exit");
    process.chdir(workspace);
  });
  afterEach(() => {
    process.chdir(originalCwd);
    for (const listener of process.listeners("exit")) if (!priorExitListeners.includes(listener)) { process.removeListener("exit", listener); listener(0); }
    rmSync(workspace, { recursive: true, force: true }); rmSync(home, { recursive: true, force: true });
  });

  async function runCli(args: string[]): Promise<AgentRunSummary> {
    const output: string[] = []; const errors: string[] = []; let failed = false;
    const program = new Command().exitOverride();
    registerAgentCommands(program, { log: line => output.push(line), error: line => errors.push(line), fail: () => { failed = true; } });
    await program.parseAsync(["agent-loop", "run", ...args, "--provider", "stub", "--credentials-home", home, "--tools", "workspace", "--json"], { from: "user" });
    const last = output.at(-1);
    if (last === undefined) throw new Error(errors.join("\n"));
    expect(failed && !last.includes("\"blocked\""), errors.join("\n")).toBe(false);
    return JSON.parse(last) as AgentRunSummary;
  }
  const rows = (sessionId: string): EvidenceEvent[] => {
    const ledger = openLedger(workspace, { readonly: true });
    try { return ledger.getAllEvents().filter(row => row.session_id === sessionId); } finally { ledger.close(); }
  };
  const meta = (row: EvidenceEvent) => JSON.parse(row.meta_json) as Record<string, unknown>;
  const offered = (sessionRows: EvidenceEvent[]) => sessionRows.filter(row => row.event_type === "audit" && row.meta_json.includes("offered-tools")).map(row => row.meta_json).join("\n");
  const exit = JSON.stringify({ tool: "plan_exit", arguments: { plan: "1. Edit planned.txt\n2. Run the tests" } });
  const write = JSON.stringify({ tool: "fs.write", arguments: { path: "workspace/output/planned.txt", content: "executed\n" } });

  it("records the plan, ends the turn at the next step boundary, and a later --plan turn still cannot write", async () => {
    // MUTATION: drop the plan-exit veto in planModePreStep and turn 1 takes a second model step with no loop/veto row.
    const planning = await runCli([exit, "--plan", "--keep-open"]);
    const sessionRows = rows(planning.sessionId);
    expect(offered(sessionRows)).toContain("\"plan_exit\"");
    const ready = sessionRows.find(row => row.event_type === "audit" && meta(row).auditType === PLAN_READY_AUDIT)!;
    expect(ready).toBeDefined();
    expect(extractEnvelope(ready.meta_json)?.turn).toBe(1);
    expect(ready.meta_json).not.toContain("Run the tests");
    const payload = readEventPayload(workspace, ready);
    expect(payload.status === "ok" && JSON.parse(payload.bytes.toString("utf8"))).toEqual({ plan: "1. Edit planned.txt\n2. Run the tests" });
    const veto = sessionRows.find(row => row.event_type === "loop/veto");
    expect(veto?.meta_json).toContain("plan-exit");
    expect(sessionRows.filter(row => row.event_type === "request/header")).toHaveLength(1);
    expect(planning.endings?.at(-1)?.reason ?? sessionRows.find(row => row.event_type === "turn/end")?.meta_json).toMatch(/blocked/);
    // The model cannot leave plan mode: the next --plan turn of the same session is still read-only.
    // MUTATION: skip applyPlanMode and turn 2 calls fs.write.
    await runCli([write, "--plan", "--session", planning.sessionId, "--keep-open"]);
    expect(existsSync(join(workspace, "workspace", "output", "planned.txt"))).toBe(false);
    const turnTwoCalls = rows(planning.sessionId).filter(row => row.event_type === "tool/call" && extractEnvelope(row.meta_json)?.turn === 2).map(row => meta(row).toolName);
    expect(turnTwoCalls).not.toContain("fs.write");
    const verified = await verifyAgentRun(workspace, planning.sessionId);
    expect(verified.integrityOk).toBe(true);
  });

  it("is not offered outside plan mode", async () => {
    const plain = await runCli(["hello"]);
    expect(offered(rows(plain.sessionId))).not.toContain("\"plan_exit\"");
  });
});
