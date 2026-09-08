import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { openLedger, verifyLedgerIntegrity } from "../src/ledger/ledger.js";
import { lockVault } from "../src/vault/vault.js";

test("malformed target configuration fails governance without blaming verified evidence", () => {
  const workspace = mkdtempSync(join(tmpdir(), "amc-governance-classification-"));
  try {
    const ledger = openLedger(workspace);
    try {
      ledger.startSession({ sessionId: "valid-evidence", runtime: "unknown", binaryPath: "test", binarySha256: "fixture" });
      ledger.appendEvidence({ sessionId: "valid-evidence", runtime: "unknown", eventType: "stdout", payload: "signed event remains intact", inline: true });
      ledger.sealSession("valid-evidence");
    } finally {
      ledger.close();
    }
    expect(verifyLedgerIntegrity(workspace).ok).toBe(true);
    writeFileSync(join(workspace, ".amc", "targets", "malformed.target.json"), "{invalid configuration");

    const result = verifyLedgerIntegrity(workspace);
    expect(result.ok).toBe(false);
    expect(result.chain).toEqual({ ok: true, errors: [] });
    expect(result.governance.ok).toBe(false);
    expect(result.governance.errors.join(" ")).toMatch(/Governance verification could not complete/);
    expect(result.errors).toEqual(result.governance.errors);
  } finally {
    lockVault(workspace);
    rmSync(workspace, { recursive: true, force: true });
  }
});
