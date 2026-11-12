import { existsSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { initBudgets } from "../src/budgets/budgets.js";
import { writeRuntimeFirewallPolicy } from "../src/runtime/firewall.js";
import { registerAgentCommands, type AgentLoopCliIo } from "../src/cli-agent-commands.js";
import { readNativeSessionEvents } from "../src/session/readNativeSessionEvents.js";
import { readEventPayload } from "../src/session/eventPayload.js";
import { renderRunSummary, type AgentRunSummary } from "../src/agent/runReport.js";

/**
 * H-3: on a fresh workspace the signed default Action Policy runs every write as SIMULATE. The tool result must say so
 * and why, and the run summary must say nothing was executed, instead of a silent "complete".
 */
const originalCwd = process.cwd();
let workspace: string;
let home: string;
let priorExitListeners: ReturnType<typeof process.listeners>;

beforeEach(() => {
  process.env.AMC_VAULT_PASSPHRASE = "simulated-notice-test";
  workspace = realpathSync(mkdtempSync(join(tmpdir(), "amc-sim-notice-")));
  home = realpathSync(mkdtempSync(join(tmpdir(), "amc-sim-notice-home-")));
  initWorkspace({ workspacePath: workspace, agentId: "default", trustBoundaryMode: "isolated" });
  initBudgets(workspace, "default");
  writeRuntimeFirewallPolicy({ workspace, mode: "observe" });
  priorExitListeners = process.listeners("exit");
  process.chdir(workspace);
});

afterEach(() => {
  process.chdir(originalCwd);
  for (const listener of process.listeners("exit")) {
    if (!priorExitListeners.includes(listener)) { process.removeListener("exit", listener); listener(0); }
  }
  rmSync(workspace, { recursive: true, force: true });
  rmSync(home, { recursive: true, force: true });
});

describe("a call the Action Policy only simulates", () => {
  it("says why in the tool result and that nothing was executed in the run summary", async () => {
    const out: string[] = [], errors: string[] = [];
    let failed = false;
    const io: AgentLoopCliIo = { log: (line) => out.push(line), error: (line) => errors.push(line), fail: () => { failed = true; } };
    const program = new Command().exitOverride();
    registerAgentCommands(program, io);
    const prompt = JSON.stringify({ tool: "fs.write", arguments: { path: "workspace/output/new.txt", content: "hello" } });
    await program.parseAsync(["agent-loop", "run", prompt, "--provider", "stub", "--credentials-home", home, "--tools", "workspace", "--json"], { from: "user" });
    expect(failed, errors.join("\n")).toBe(false);
    expect(existsSync(join(workspace, "workspace", "output", "new.txt"))).toBe(false);

    const summary = JSON.parse(out.at(-1)!) as AgentRunSummary;
    expect(summary.simulatedToolCalls).toBe(1);
    expect(renderRunSummary(summary)).toMatch(/simulated\s+1 tool call\(s\) ran as SIMULATE: nothing was executed or written/);

    const results = readNativeSessionEvents(workspace, summary.sessionId).filter((row) => row.event_type === "tool/result")
      .map((row) => { const payload = readEventPayload(workspace, row); return payload.status === "ok" ? payload.bytes.toString("utf8") : ""; });
    expect(results.join("\n")).toMatch(/SIMULATE fs\.write[\s\S]*simulated, not executed: the signed Action Policy runs WRITE_LOW as SIMULATE \(.+\); see `amc governor check --agent default --action WRITE_LOW --risk med --mode execute`/);
  });
});
