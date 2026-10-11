import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { getPrivateKeyPem } from "../src/crypto/keys.js";
import { verifyOpsReceipt } from "../src/integrations/opsReceipt.js";
import { rotatePurposeKeys } from "../src/keys/purposeKeys.js";
import { mintReceipt } from "../src/receipts/receipt.js";
import { initWorkspace } from "../src/workspace.js";

const roots: string[] = [];
afterEach(() => { while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true }); });

/** A workspace whose receipt and ledger-row purposes hold different keys: rotating each gives each its own. */
function splitKeys(): string {
  const workspace = mkdtempSync(join(tmpdir(), "amc-receipt-pins-"));
  roots.push(workspace);
  process.env.AMC_VAULT_PASSPHRASE = "receipt-pins-test-passphrase";
  initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
  for (const purpose of ["receipt", "ledger-row"] as const) {
    rotatePurposeKeys({ workspace, purposes: [purpose], passphrase: process.env.AMC_VAULT_PASSPHRASE });
  }
  return workspace;
}

const receiptSignedBy = (privateKeyPem: string) => mintReceipt({ kind: "work_accepted", ts: Date.now(), agentId: "a", providerId: "p", model: null,
  eventHash: "0".repeat(64), bodySha256: "1".repeat(64), sessionId: "s", privateKeyPem }).receipt;

// The ledger mints receipts with the `receipt` purpose (docs/KEY_LIFECYCLE.md); the monitor role history also holds ledger-row keys.
describe("receipt verifiers pin the receipt purpose's keys", () => {
  test("ops receipt verification accepts a receipt-purpose signature and refuses a ledger-row one", () => {
    const workspace = splitKeys();
    expect(verifyOpsReceipt({ workspace, receipt: receiptSignedBy(getPrivateKeyPem(workspace, "receipt")) })).toEqual({ ok: true, error: null });
    expect(verifyOpsReceipt({ workspace, receipt: receiptSignedBy(getPrivateKeyPem(workspace, "ledger-row")) }).ok).toBe(false);
  });
});
