/**
 * P2-09a security review follow-ups. (1) Payload verification fails closed: only an unreachable provider or a locked
 * vault makes an encrypted payload "not evaluated", reported as such; a missing key file or a column that does not
 * match is an error. (2) The signed data-key file cannot be rolled back: a high-water mark outside the workspace refuses
 * an older signed file, and the ledger refuses to encrypt under a key version older than its own ciphertexts.
 */
import { copyFileSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import YAML from "yaml";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openLedger, verifyLedgerIntegrity } from "../src/ledger/ledger.js";
import { closeLedgerDataKeys, ledgerDekPath, rotateDataKey } from "../src/ledger/encryption/dataKeys.js";
import { encryptField, inlinePayloadAad } from "../src/ledger/encryption/ledgerCipher.js";
import { loadOpsPolicy, opsPolicyPath, signOpsPolicy } from "../src/ops/policy.js";
import { lockVault } from "../src/vault/vault.js";
import { initWorkspace } from "../src/workspace.js";

const roots: string[] = [];
let workspace: string;
beforeEach(async () => {
  const root = mkdtempSync(join(tmpdir(), "amc-ledger-enc-sec-"));
  roots.push(root);
  vi.stubEnv("AMC_HOME", join(root, "home"));
  workspace = join(root, "ws");
  initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
  const policy = loadOpsPolicy(workspace);
  policy.opsPolicy.encryption.ledgerEncryptionEnabled = true;
  writeFileSync(opsPolicyPath(workspace), YAML.stringify(policy));
  signOpsPolicy(workspace);
  await rotateDataKey(workspace);
});
afterEach(() => {
  vi.unstubAllEnvs();
  closeLedgerDataKeys();
  for (const root of roots.splice(0)) { lockVault(join(root, "ws")); rmSync(root, { recursive: true, force: true }); }
});

function append(payload: string): string {
  const ledger = openLedger(workspace);
  try {
    if (!ledger.getSessionById("sec")) ledger.startSession({ sessionId: "sec", runtime: "unknown", binaryPath: "test", binarySha256: "fixture" });
    return ledger.appendEvidence({ sessionId: "sec", runtime: "unknown", eventType: "stdout", payload, inline: true });
  } finally {
    ledger.close();
  }
}

const verdictFor = (id: string) => {
  const result = verifyLedgerIntegrity(workspace);
  return { errors: result.chain.errors.filter((error) => error.includes(id)), notEvaluated: (result.payloadsNotEvaluated ?? []).filter((row) => row.includes(id)) };
};

function keyless(): void {
  closeLedgerDataKeys();
  lockVault(workspace);
  vi.stubEnv("AMC_VAULT_PASSPHRASE", "");
}

describe("payload verification fails closed (P2-09a review, finding 1)", () => {
  it("reports a missing data-key file as an error, not a skipped payload", () => {
    const id = append("needs its key");
    closeLedgerDataKeys();
    unlinkSync(ledgerDekPath(workspace));
    unlinkSync(`${ledgerDekPath(workspace)}.sig`);
    expect(verdictFor(id).errors).toContain(`Event ${id} payload authentication failed`);
  });

  it("reports a locked vault as not evaluated, never as verified or as an error", () => {
    const id = append("vault locked");
    keyless();
    expect(verdictFor(id)).toEqual({ errors: [], notEvaluated: [`Event ${id} payload not evaluated: the ledger key is unavailable here`] });
  });

  it("fails a payload_inline that differs from canonical_payload_inline, even without the key", () => {
    const id = append("original");
    const forged = encryptField(workspace, "substituted", inlinePayloadAad(id));
    const ledger = openLedger(workspace);
    ledger.db.prepare("UPDATE evidence_events SET payload_inline = ? WHERE id = ?").run(forged, id);
    ledger.close();
    keyless();
    expect(verdictFor(id).errors).toContain(`Event ${id} payload_inline differs from canonical_payload_inline and cannot be compared without the ledger key`);
  });
});

describe("data-key file anti-rollback (P2-09a review, finding 2)", () => {
  it("refuses an older validly signed key file after a rotation", async () => {
    const saved = join(roots[0]!, "dek-v1");
    copyFileSync(ledgerDekPath(workspace), `${saved}.json`);
    copyFileSync(`${ledgerDekPath(workspace)}.sig`, `${saved}.sig`);
    await rotateDataKey(workspace);
    append("under version 2");
    copyFileSync(`${saved}.json`, ledgerDekPath(workspace));
    copyFileSync(`${saved}.sig`, `${ledgerDekPath(workspace)}.sig`);
    closeLedgerDataKeys();
    expect(() => append("after rollback")).toThrow(/ROLLBACK_DETECTED/);
  });

  it("refuses to encrypt under a key version older than the ledger's ciphertexts when no mark exists", async () => {
    const saved = join(roots[0]!, "dek-v1");
    copyFileSync(ledgerDekPath(workspace), `${saved}.json`);
    copyFileSync(`${ledgerDekPath(workspace)}.sig`, `${saved}.sig`);
    await rotateDataKey(workspace);
    append("under version 2");
    vi.stubEnv("AMC_HOME", join(roots[0]!, "fresh-home"));
    copyFileSync(`${saved}.json`, ledgerDekPath(workspace));
    copyFileSync(`${saved}.sig`, `${ledgerDekPath(workspace)}.sig`);
    closeLedgerDataKeys();
    expect(() => append("after rollback")).toThrow(/version 1 is older than version 2 already in the ledger/);
  });
});
