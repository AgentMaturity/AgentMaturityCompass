import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { openLedger, verifyLedgerIntegrity } from "../src/ledger/ledger.js";
import { eventMeta } from "../src/claims/evidenceProvenance.js";

/**
 * An interrupted assurance or red-team run (Ctrl-C, a CI timeout's SIGTERM) seals its runner session before dying of
 * the signal. Runner sessions are legacy sessions, which whole-ledger verification requires to carry a seal: left
 * open, one interruption would make every later signed run in the workspace INVALID, with no CLI path to seal it.
 * The signal path can only be exercised in a child process, so the child does what both runners do around a session.
 */
const PASS = "signal-seal-passphrase";
const roots: string[] = [];
afterEach(() => { while (roots.length > 0) rmSync(roots.pop() as string, { recursive: true, force: true }); });

const child = String.raw`
import { pathToFileURL } from "node:url";
const [dist, workspace, signal, install] = process.argv.slice(1);
const m = (rel) => pathToFileURL(dist + "/" + rel).href;
const { openLedger } = await import(m("ledger/ledger.js"));
const { startAssuranceSession, sealAbortedSessionOnSignal } = await import(m("assurance/evidenceWriters.js"));
const ledger = openLedger(workspace);
const sessionId = startAssuranceSession({ ledger, mode: "supervise", agentId: "default", packIds: ["injection"], trustTier: "OBSERVED", source: "redteam" });
if (install === "yes") sealAbortedSessionOnSignal({ ledger, sessionId, runId: "run-interrupted", agentId: "default" });
console.log(sessionId);
setTimeout(() => { console.error("still alive"); process.exit(99); }, 20_000);
process.kill(process.pid, signal);
`;

function run(signal: "SIGINT" | "SIGTERM", install: "yes" | "no") {
  const ws = mkdtempSync(join(tmpdir(), "amc-signal-seal-"));
  roots.push(ws);
  process.env.AMC_VAULT_PASSPHRASE = PASS;
  initWorkspace({ workspacePath: ws, trustBoundaryMode: "isolated" });
  const out = spawnSync(process.execPath, ["--input-type=module", "-e", child, resolve(process.cwd(), "dist"), ws, signal, install],
    { env: { ...process.env, AMC_VAULT_PASSPHRASE: PASS }, encoding: "utf8", timeout: 60_000 });
  const sessionId = out.stdout.trim().split("\n").at(-1)!;
  expect(sessionId, out.stderr).toMatch(/[0-9a-f-]{36}/);
  return { ws, out, sessionId };
}

describe("runner sessions are sealed when the run is interrupted", () => {
  test.each(["SIGINT", "SIGTERM"] as const)("%s seals the session, records the interruption, and the process dies of the same signal", async (signal) => {
    const { ws, out, sessionId } = run(signal, "yes");
    expect(out.signal, out.stderr).toBe(signal);
    const ledger = openLedger(ws);
    try {
      const session = ledger.getSessionById(sessionId);
      expect(session?.binary_path).toBe("amc-redteam-runner");
      expect(session?.ended_ts).not.toBeNull();
      expect(session?.session_seal_sig).toBeTruthy();
      const aborted = ledger.getAllEvents().filter((event) => event.session_id === sessionId && eventMeta(event).auditType === "ASSURANCE_RUN_ABORTED");
      expect(aborted).toHaveLength(1);
      expect(eventMeta(aborted[0]!)).toMatchObject({ runId: "run-interrupted", reason: "RunInterrupted" });
    } finally { ledger.close(); }
    expect((await verifyLedgerIntegrity(ws)).ok).toBe(true);
  }, 90_000);

  test("without the handler the interruption leaves the session open and the whole ledger fails to verify (the exposure)", async () => {
    const { ws, out, sessionId } = run("SIGTERM", "no");
    expect(out.signal).toBe("SIGTERM");
    const ledger = openLedger(ws);
    try { expect(ledger.getSessionById(sessionId)?.session_seal_sig).toBeNull(); } finally { ledger.close(); }
    const integrity = await verifyLedgerIntegrity(ws);
    expect(integrity.ok).toBe(false);
    expect(integrity.errors.join(" ")).toMatch(new RegExp(`Session ${sessionId} missing seal`));
  }, 90_000);
});
