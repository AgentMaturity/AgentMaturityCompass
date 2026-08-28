import { mkdtempSync, mkdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { agentToolset } from "../src/agent/agentToolset.js";
import { initBudgets } from "../src/budgets/budgets.js";
import { openLedger, verifyLedgerIntegrity } from "../src/ledger/ledger.js";
import { initWorkspace } from "../src/workspace.js";

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

  it("reports a tool call recorded against a session nobody started", async () => {
    const dir = workspace();
    // Exactly what the old default produced. Kept as a test so the failure this
    // fix removes is a thing the suite can still SEE — otherwise a future change
    // reintroducing an unstarted-session default would look fine.
    const toolset = agentToolset({ workspace: dir, agentId: "default", sessionId: "toolset-default" });
    open.push(toolset);
    await toolset.seam.execute(call("fs.read", { path: "workspace/n.txt" }, "toolset-default"));
    toolset.close();

    const verdict = await verifyLedgerIntegrity(dir);
    expect(verdict.errors.some((e) => e.includes("references missing session"))).toBe(true);
  });
});
