import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { registerAgentCommands } from "../src/cli-agent-commands.js";
import { initWorkspace } from "../src/workspace.js";
import { initBudgets } from "../src/budgets/budgets.js";
import { writeRuntimeFirewallPolicy } from "../src/runtime/firewall.js";
import { openLedger } from "../src/ledger/ledger.js";
import { verifyLedgerIntegrity } from "../src/ledger/ledgerVerification.js";
import { verifyAgentRun, type AgentRunSummary } from "../src/agent/runReport.js";
import { extractEnvelope } from "../src/session/sessionTypes.js";
import { readSessionRootDescriptor } from "../src/transparency/sessionRootDescriptor.js";

const originalCwd = process.cwd();
let workspace: string;
let credentialsHome: string;
let priorPassphrase: string | undefined;
let priorExitListeners: ReturnType<typeof process.listeners>;

beforeEach(() => {
  priorPassphrase = process.env.AMC_VAULT_PASSPHRASE;
  process.env.AMC_VAULT_PASSPHRASE = "cli-native-tool-evidence-test";
  workspace = realpathSync(mkdtempSync(join(tmpdir(), "amc-cli-tool-evidence-")));
  credentialsHome = realpathSync(mkdtempSync(join(tmpdir(), "amc-cli-tool-home-")));
  initWorkspace({ workspacePath: workspace, agentId: "default", trustBoundaryMode: "isolated" });
  initBudgets(workspace, "default");
  writeRuntimeFirewallPolicy({ workspace, mode: "observe" });
  priorExitListeners = process.listeners("exit");
  process.chdir(workspace);
});

afterEach(() => {
  process.chdir(originalCwd);
  // The CLI currently closes its toolset on process exit. A test invokes the
  // registrar in-process, so release only the listeners this invocation added.
  for (const listener of process.listeners("exit")) {
    if (!priorExitListeners.includes(listener)) {
      process.removeListener("exit", listener);
      listener(0);
    }
  }
  if (priorPassphrase === undefined) delete process.env.AMC_VAULT_PASSPHRASE;
  else process.env.AMC_VAULT_PASSPHRASE = priorPassphrase;
  rmSync(workspace, { recursive: true, force: true });
  rmSync(credentialsHome, { recursive: true, force: true });
});

async function runCli(extra: string[]): Promise<AgentRunSummary> {
  const output: string[] = [];
  const errors: string[] = [];
  let failed = false;
  const program = new Command().exitOverride();
  registerAgentCommands(program, {
    log: (line) => output.push(line),
    error: (line) => errors.push(line),
    fail: () => { failed = true; }
  });
  await program.parseAsync([
    "agent-loop", "run", "exercise the workspace tools", "--provider", "stub",
    "--credentials-home", credentialsHome, "--json", ...extra
  ], { from: "user" });
  expect(failed, errors.join("\n")).toBe(false);
  const summary = JSON.parse(output.at(-1)!) as AgentRunSummary;
  expect(summary.driverStatus).toBe("idle");
  return summary;
}

function rows(sessionId: string) {
  const ledger = openLedger(workspace, { readOnly: true });
  try { return ledger.getAllEvents().filter((row) => row.session_id === sessionId); }
  finally { ledger.close(); }
}

describe("CLI workspace tools use the actual native session writer", () => {
  it.each(["fresh", "resume", "fork"] as const)("records governed evidence for a %s run", async (mode) => {
    let seed: AgentRunSummary | null = null;
    if (mode !== "fresh") {
      // No tool result in the seed: the real keyless stub will ask for its first
      // offered workspace tool when the continued/forked turn exposes one.
      seed = await runCli(["--tools", "none", ...(mode === "resume" ? ["--keep-open"] : [])]);
    }
    const seedRows = seed === null ? [] : rows(seed.sessionId);
    const summary = await runCli([
      "--tools", "workspace",
      ...(mode === "resume" ? ["--session", seed!.sessionId] : []),
      ...(mode === "fork" ? ["--fork-from", seed!.sessionId] : [])
    ]);
    if (mode === "resume") expect(summary.sessionId).toBe(seed!.sessionId);
    if (mode === "fork") expect(summary.sessionId).not.toBe(seed!.sessionId);

    const events = rows(summary.sessionId);
    const audits = events.filter((row) => String(JSON.parse(row.meta_json).auditType ?? "").startsWith("TOOL_CALL_"));
    expect(summary.toolCalls, "the CLI really dispatched a workspace tool").toBeGreaterThan(0);
    expect(audits.length, "governed tool evidence must not silently disappear").toBeGreaterThan(0);
    for (const event of audits) {
      expect(event.session_id).toBe(summary.sessionId);
      expect(extractEnvelope(event.meta_json), "tool evidence must participate in the owned spine").not.toBeNull();
      expect(JSON.parse(event.meta_json).agentId).toBe("default");
    }
    expect(readSessionRootDescriptor(workspace, summary.sessionId).eventCount).toBe(events.length);
    const verified = await verifyLedgerIntegrity(workspace);
    expect(verified.ok, JSON.stringify(verified)).toBe(true);
    const reconstructed = await verifyAgentRun(workspace, summary.sessionId);
    expect(reconstructed.ok, JSON.stringify(reconstructed)).toBe(true);
    if (mode === "fork") expect(rows(seed!.sessionId)).toEqual(seedRows);
    if (mode === "resume") expect(events.slice(0, seedRows.length)).toEqual(seedRows);
  });
});
