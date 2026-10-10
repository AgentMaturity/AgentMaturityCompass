import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { openLedger } from "../src/ledger/ledger.js";
import { initWorkspace } from "../src/workspace.js";

/**
 * The `a4-` session namespace belongs to the A4 store (P1-63): a lease holder could otherwise name an `a4-` session on
 * `/bridge/evidence` and plant a fake A4 project or a later-transition witness that blocks every bundle export.
 */
describe("ledger a4- session namespace", () => {
  it("refuses every writer there but the A4 store's open session", () => {
    const prior = process.env.AMC_VAULT_PASSPHRASE;
    process.env.AMC_VAULT_PASSPHRASE = "a4-session-namespace-passphrase";
    const workspace = mkdtempSync(join(tmpdir(), "amc-a4-ns-"));
    initWorkspace({ workspacePath: workspace, agentId: "default", trustBoundaryMode: "isolated" });
    const ledger = openLedger(workspace);
    try {
      const sessionId = `a4-a4p_${"0".repeat(32)}-0`;
      const append = { sessionId, runtime: "any" as const, eventType: "agent_process_started" as const, payload: "{}", inline: true, meta: { agentId: "default" } };
      const withReceipt = { ...append, receipt: { kind: "guard_check" as const, agentId: "default", providerId: "x", model: null, bodySha256: "0".repeat(64) } };
      expect(() => ledger.startSession({ sessionId, runtime: "any", binaryPath: "amc-wrap", binarySha256: "x" })).toThrow(/A4_SESSION_RESERVED/);
      expect(() => ledger.appendEvidence(append)).toThrow(/A4_SESSION_RESERVED/);
      expect(() => ledger.appendEvidenceWithReceipt(withReceipt)).toThrow(/A4_SESSION_RESERVED/);

      ledger.startSession({ sessionId, runtime: "unknown", binaryPath: "a4-store", binarySha256: "a4-store" });
      expect(ledger.appendEvidence(append)).toEqual(expect.any(String));
      ledger.sealSession(sessionId);
      expect(() => ledger.appendEvidence(append)).toThrow(/A4_SESSION_RESERVED/);
      expect(ledger.db.prepare("SELECT COUNT(*) AS n FROM evidence_events WHERE session_id = ?").get(sessionId)).toEqual({ n: 1 });
    } finally {
      ledger.close();
      rmSync(workspace, { recursive: true, force: true });
      if (prior === undefined) delete process.env.AMC_VAULT_PASSPHRASE;
      else process.env.AMC_VAULT_PASSPHRASE = prior;
    }
  });
});
