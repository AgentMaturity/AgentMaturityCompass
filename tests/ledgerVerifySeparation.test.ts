import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { verifyLedgerIntegrity, openLedger } from "../src/ledger/ledger.js";

/**
 * A misconfigured gateway and a rewritten evidence event both surfaced as
 * "ledger integrity failed". One is an operational problem, the other is a
 * breach; reporting them identically devalues the alarm that matters, and it
 * made verifyLedgerIntegrity fail for reasons that had nothing to do with the
 * evidence it was asked about.
 */
describe("evidence-chain verification is separate from config governance", () => {
  const withWorkspace = async (fn: (workspace: string) => Promise<void> | void) => {
    const workspace = mkdtempSync(join(tmpdir(), "amc-verify-split-"));
    initWorkspace({ workspacePath: workspace, agentId: "default" });
    try {
      await fn(workspace);
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  };

  it("a clean workspace passes both halves", async () => {
    await withWorkspace(async (workspace) => {
      const result = await verifyLedgerIntegrity(workspace);
      expect(result.chain.ok).toBe(true);
      expect(result.governance.ok).toBe(true);
      expect(result.ok).toBe(true);
    });
  });

  it("a broken gateway config does not report the evidence chain as failed", async () => {
    await withWorkspace(async (workspace) => {
      const configPath = join(workspace, ".amc", "gateway.yaml");
      const sigPath = `${configPath}.sig`;
      writeFileSync(configPath, "gateway:\n  enabled: true\n");
      // A signature that exists but does not match the config: what
      // verification treats as "edited after signing".
      writeFileSync(
        sigPath,
        JSON.stringify({
          configSha256: "0".repeat(64),
          signature: "not-a-valid-signature",
          signedTs: 1,
          signer: "auditor"
        })
      );

      const result = await verifyLedgerIntegrity(workspace);
      expect(result.governance.ok, "the config problem must be reported").toBe(false);
      expect(result.chain.ok, "but not as evidence tampering").toBe(true);
      // The combined verdict stays conjunctive, so no caller silently gets a
      // weaker answer than before the split.
      expect(result.ok).toBe(false);
      expect(result.errors).toEqual([...result.chain.errors, ...result.governance.errors]);
    });
  });

  it("a rewritten evidence event does fail the chain half", async () => {
    // Positive control: without this, the assertion above would hold simply
    // because chain.ok is never false.
    await withWorkspace(async (workspace) => {
      const ledger = openLedger(workspace);
      const id = ledger.appendEvidence({
        sessionId: "session-1",
        runtime: "generic",
        eventType: "TOOL_CALL",
        payload: "original payload",
        inline: true
      });
      // The immutability trigger is the first line of defence; verification is
      // the second, and it is the one under test here.
      ledger.db.exec("DROP TRIGGER IF EXISTS protect_evidence_immutable");
      ledger.db.prepare("UPDATE evidence_events SET meta_json = ? WHERE id = ?").run(
        JSON.stringify({ tampered: true }),
        id
      );
      ledger.close();

      const result = await verifyLedgerIntegrity(workspace);
      expect(result.chain.ok, "an altered event is exactly what this half is for").toBe(false);
      expect(result.ok).toBe(false);
    });
  });

  it("still reports the whole set of errors in one list", async () => {
    await withWorkspace(async (workspace) => {
      const result = await verifyLedgerIntegrity(workspace);
      expect(result.errors).toEqual([...result.chain.errors, ...result.governance.errors]);
    });
  });
});
