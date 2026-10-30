import { existsSync, mkdtempSync, mkdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { agentToolset } from "../src/agent/agentToolset.js";
import { initBudgets } from "../src/budgets/budgets.js";
import { openLedger, verifyLedgerIntegrity } from "../src/ledger/ledger.js";
import { writeRuntimeFirewallPolicy } from "../src/runtime/firewall.js";
import { SessionService } from "../src/session/sessionService.js";
import { initWorkspace } from "../src/workspace.js";
import { removeActionPolicy } from "./helpers/actionPolicyFixtures.js";

/**
 * Tool evidence must name a session that exists.
 *
 * `agentToolset` used to default to `toolset-${agentId}`, which nothing ever
 * created, so any run that actually CALLED a tool wrote rows referencing a
 * missing session and `verifyLedgerIntegrity` failed. Nothing caught it: no test
 * in the repository executed a tool and then verified the ledger, and the type
 * made the id optional so every call site looked correct.
 *
 * These two tests are the pair that closes it — one that a real tool call leaves
 * the ledger sound, and one that the failure is detectable at all.
 */

const dirs: string[] = [];
const open: { close(): void }[] = [];

function workspace(): string {
  process.env["AMC_VAULT_PASSPHRASE"] = "toolset-session-passphrase";
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "amc-toolsess-")));
  dirs.push(dir);
  initWorkspace({ workspacePath: dir, agentId: "default", trustBoundaryMode: "isolated" });
  removeActionPolicy(dir); // AXR-02: no Action Policy configured, as before; this file is not about it (amc init signs one).
  initBudgets(dir, "default");
  mkdirSync(join(dir, "workspace"), { recursive: true });
  writeFileSync(join(dir, "workspace", "n.txt"), "hello");
  return dir;
}

const call = (name: string, args: unknown, sessionId: string) => ({
  callId: `c-${name}`,
  toolName: name,
  rawArguments: JSON.stringify(args),
  sessionId,
  turn: 1,
  step: 1,
  parentToken: null,
  dispatch: "native" as const,
  signal: new AbortController().signal
});

afterEach(() => {
  for (const handle of open.splice(0)) {
    try { handle.close(); } catch { /* already closed */ }
  }
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("tool evidence names a session that exists", () => {
  it("leaves the ledger verifiable after a real tool call", async () => {
    const dir = workspace();
    const ledger = openLedger(dir);
    const sessionId = "run-under-test";
    ledger.startSession({ sessionId, runtime: "amc", binaryPath: "test", binarySha256: "abc" });

    const toolset = agentToolset({ workspace: dir, agentId: "default", sessionId });
    open.push(toolset);
    await toolset.seam.execute(call("fs.read", { path: "workspace/n.txt" }, sessionId));
    toolset.close();
    // Sealed AFTER the work, not before: a seal commits to the session's final
    // event hash, so sealing first and then appending reports a hash mismatch.
    ledger.sealSession(sessionId);

    const verdict = await verifyLedgerIntegrity(dir);
    expect(verdict.errors).toEqual([]);
  });

  // P1-78: these rows used to be written and then failed verification ("references missing session"). A writer-less
  // toolset now refuses to write a row its session cannot make verifiable, so the call is refused and nothing is written.
  for (const [state, prepare] of [
    ["a session nobody started", (_dir: string) => undefined],
    ["a session already sealed", (dir: string) => {
      const ledger = openLedger(dir);
      ledger.startSession({ sessionId: "toolset-default", runtime: "amc", binaryPath: "test", binarySha256: "abc" });
      ledger.sealSession("toolset-default");
      ledger.close();
    }]
  ] as const) {
    it(`refuses, and writes nothing, for a tool call recorded against ${state}`, async () => {
      const dir = workspace();
      prepare(dir);
      const toolset = agentToolset({ workspace: dir, agentId: "default", sessionId: "toolset-default" });
      open.push(toolset);
      const result = await toolset.seam.execute(call("fs.read", { path: "workspace/n.txt" }, "toolset-default"));
      toolset.close();

      expect(JSON.stringify(result)).not.toContain('"outcome":"OK"');
      expect(JSON.stringify(result)).toContain("UNVERIFIABLE_TOOL_EVIDENCE");
      const ledger = openLedger(dir);
      try {
        expect(ledger.getAllEvents().filter((event) => event.session_id === "toolset-default")).toEqual([]);
      } finally {
        ledger.close();
      }
      expect((await verifyLedgerIntegrity(dir)).errors).toEqual([]);
    });
  }
});

/**
 * Fail-closed evidence (P1-78): a call whose rows cannot be written verifiably never reaches its body. A writer that
 * cannot append refuses the call; a writer closed mid-session refuses the next one; a write that fails after a body ran
 * (an in-flight effect that cannot be undone) fails the toolset, so every later call is refused.
 */
describe("a tool call whose evidence cannot be written does not run", () => {
  const write = (name: string) => call("fs.write", { path: `workspace/output/${name}.txt`, content: "x" }, "writer-session");
  const ready = (): string => {
    const dir = workspace();
    writeRuntimeFirewallPolicy({ workspace: dir, mode: "observe" });
    mkdirSync(join(dir, "workspace", "output"), { recursive: true });
    return dir;
  };
  const ran = (dir: string, name: string): boolean => existsSync(join(dir, "workspace", "output", `${name}.txt`));

  it("refuses the call when the writer throws on append, and nothing happens", async () => {
    const dir = ready();
    const toolset = agentToolset({ workspace: dir, agentId: "default", sessionId: "writer-session",
      recorder: { recordProjectedEvidence: () => { throw new Error("disk full"); } } });
    open.push(toolset);
    const result = JSON.stringify(await toolset.seam.execute(write("a")));
    expect(result).not.toContain('"outcome":"OK"');
    expect(result).toContain("UNVERIFIABLE_TOOL_EVIDENCE");
    expect(ran(dir, "a"), "the body never ran").toBe(false);
  });

  it("refuses the next call once the writer is closed mid-session, and nothing happens", async () => {
    const dir = ready();
    const session = new SessionService(dir);
    session.open({ sessionId: "writer-session", agentId: "default", harnessVersion: "1", compositionDigest: "0".repeat(64), policyDigest: "0".repeat(64) });
    session.startTurn({ trigger: "user" });
    session.startStep();
    const toolset = agentToolset({ workspace: dir, agentId: "default", sessionId: "writer-session", recorder: session });
    open.push(toolset);
    expect(JSON.stringify(await toolset.seam.execute(write("first")))).toContain('"outcome":"OK"');
    session.endStep({ stopReason: "end_turn", usage: null });
    session.endTurn({ reason: "complete" });
    session.sealTurn();
    session.close({ reason: "done" });
    const result = JSON.stringify(await toolset.seam.execute(write("second")));
    expect(result).not.toContain('"outcome":"OK"');
    expect(result).toContain("UNVERIFIABLE_TOOL_EVIDENCE");
    expect(ran(dir, "second"), "the body never ran").toBe(false);
  });

  it("refuses every later call once a row is lost after a body ran", async () => {
    const dir = ready();
    let appends = 0;
    // Accepts the session's effective-policy receipt, then fails: the first call's body runs, its rows are lost.
    const toolset = agentToolset({ workspace: dir, agentId: "default", sessionId: "writer-session",
      recorder: { recordProjectedEvidence: () => { appends += 1; if (appends > 1) throw new Error("writer lost its fence"); return null; } } });
    open.push(toolset);
    await toolset.seam.execute(write("first"));
    expect(ran(dir, "first"), "the in-flight effect happened").toBe(true);
    const result = JSON.stringify(await toolset.seam.execute(write("second")));
    expect(result).toContain("UNVERIFIABLE_TOOL_EVIDENCE");
    expect(ran(dir, "second"), "no call runs after a lost row").toBe(false);
  });
});
