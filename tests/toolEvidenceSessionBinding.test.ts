import { mkdtempSync, mkdirSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { initBudgets } from "../src/budgets/budgets.js";
import { writeRuntimeFirewallPolicy } from "../src/runtime/firewall.js";
import { openLedger } from "../src/ledger/ledger.js";
import { verifyLedgerIntegrity } from "../src/ledger/ledgerVerification.js";
import { registerAgentCommands, type AgentLoopCliIo } from "../src/cli-agent-commands.js";
import type { AgentRunSummary } from "../src/agent/runReport.js";
import type { EvidenceEvent } from "../src/types.js";

/**
 * Tool evidence belongs to the session whose turn produced it.
 *
 * `agentToolset` used to default its evidence rows to `toolset-<agentId>`, a
 * session id nothing ever starts -- `Ledger.startSession` is the only writer of
 * the `sessions` table and no caller called it for that id. Every governed tool
 * call therefore wrote a row referencing a session with no row of its own, and
 * `verifyLedgerIntegrity` reported "references missing session" for each one:
 * a governed run that fails `amc verify` because it used its tools.
 */
const PASS = "tool-evidence-session-binding-pass";

describe("a governed tool call lands in the session that made it", () => {
  let dir: string;
  let home: string;
  let cwd: string;

  beforeEach(() => {
    process.env["AMC_VAULT_PASSPHRASE"] ??= PASS;
    dir = realpathSync(mkdtempSync(join(tmpdir(), "amc-toolsession-")));
    home = realpathSync(mkdtempSync(join(tmpdir(), "amc-toolsession-home-")));
    initWorkspace({ workspacePath: dir, agentId: "default", trustBoundaryMode: "isolated" });
    initBudgets(dir, "default");
    writeRuntimeFirewallPolicy({ workspace: dir, mode: "observe" });
    mkdirSync(join(dir, "workspace", "output"), { recursive: true });
    cwd = process.cwd();
  });

  afterEach(() => {
    process.chdir(cwd);
    rmSync(dir, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  });

  function events(): EvidenceEvent[] {
    const ledger = openLedger(dir);
    try {
      return ledger.getAllEvents();
    } finally {
      ledger.close();
    }
  }

  it("`agent-loop run --tools workspace` leaves a ledger that verifies", async () => {
    process.chdir(dir);
    const out: string[] = [];
    const errors: string[] = [];
    const failures: number[] = [];
    const io: AgentLoopCliIo = {
      log: (line) => out.push(line),
      error: (line) => errors.push(line),
      fail: () => failures.push(1)
    };
    const program = new Command();
    program.exitOverride();
    registerAgentCommands(program, io);

    await program.parseAsync(
      ["agent-loop", "run", "hello", "--tools", "workspace", "--credentials-home", home, "--json"],
      { from: "user" }
    );

    // The error stream carries the readiness blockers, so a workspace this test
    // failed to prepare says so instead of failing on a missing summary.
    expect(failures, errors.join("\n")).toEqual([]);
    const summary = JSON.parse(out[out.length - 1]!) as AgentRunSummary;
    // Non-vacuity: a turn that called no tool writes no tool evidence at all,
    // and the ledger below would then verify for the wrong reason.
    expect(summary.toolCalls).toBeGreaterThan(0);

    const toolRows = events().filter((row) => {
      const meta = JSON.parse(row.meta_json) as { auditType?: string };
      return typeof meta.auditType === "string" && meta.auditType.startsWith("TOOL_CALL_");
    });
    expect(toolRows.length).toBeGreaterThan(0);
    // In THIS run's session, not in a bucket keyed by the agent id.
    expect([...new Set(toolRows.map((row) => row.session_id))]).toEqual([summary.sessionId]);

    const verified = await verifyLedgerIntegrity(dir);
    expect(verified.chain.errors).toEqual([]);
  });
});
