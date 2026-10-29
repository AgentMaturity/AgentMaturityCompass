import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import YAML from "yaml";
import { afterEach, describe, expect, it, vi } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { openLedger, verifyEvidenceEventIntegrity, type Ledger } from "../src/ledger/ledger.js";
import { lockVault } from "../src/vault/vault.js";
import * as suite from "../src/redteam/promptInjectionRegressionSuite.js";
import type { PromptInjectionRegressionSuiteInput } from "../src/redteam/promptInjectionRegressionSuite.js";
import { signSerializedPayloadWithAuditorAsync } from "../src/org/orgSigner.js";
import { loadKeyProvider } from "../src/keys/purposeProviders.js";
import { closeLedgerDataKeys, rotateDataKey } from "../src/ledger/encryption/dataKeys.js";
import { loadOpsPolicy, opsPolicyPath, signOpsPolicy } from "../src/ops/policy.js";
import { canonicalize } from "../src/utils/json.js";
import { sha256Hex } from "../src/utils/hash.js";

const roots: string[] = [];
const ledgers: Ledger[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const ledger of ledgers.splice(0)) ledger.close();
  for (const root of roots.splice(0)) { closeLedgerDataKeys(root); lockVault(root); rmSync(root, { recursive: true, force: true }); }
  vi.unstubAllEnvs();
});
function fixture(encrypted = false) {
  const workspace = mkdtempSync(join(tmpdir(), "amc-regression-evidence-")); roots.push(workspace);
  vi.stubEnv("AMC_VAULT_PASSPHRASE", "regression-evidence-passphrase");
  vi.stubEnv("AMC_NO_SIGN", "0");
  initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
  if (encrypted) {
    const policy = loadOpsPolicy(workspace); policy.opsPolicy.encryption.ledgerEncryptionEnabled = true;
    writeFileSync(opsPolicyPath(workspace), YAML.stringify(policy)); signOpsPolicy(workspace);
  }
  const input: PromptInjectionRegressionSuiteInput = {
    suiteId: "behavioral", suiteVersion: "1", agentId: "default", runId: "run-1", requiredVectors: ["direct"],
    sourceRefs: ["fixture:direct"], evidenceRefs: ["trace:direct"], signedEvidenceRefs: [],
    fixtures: [{ fixtureId: "direct-1", vector: "direct", attackTraceRef: "trace:direct", attackTraceHash: "a".repeat(64),
      policyId: "policy-1", policyMappingRef: "mapping-1", expectedDecision: "block", observedDecision: "block",
      observedDecisionReceiptId: "decision-1", regressionStatus: "passed", evidenceRefs: ["trace:direct"], signedEvidenceRefs: [] }],
  };
  const ledger = openLedger(workspace); ledgers.push(ledger);
  ledger.startSession({ sessionId: "regression", runtime: "unknown", binaryPath: "vitest", binarySha256: "test" });
  const append = (payload: string) => ledger.appendEvidence({ sessionId: "regression", runtime: "unknown", eventType: "test",
    payload, inline: true, meta: { agentId: input.agentId } });
  const bind = () => {
    for (const item of input.fixtures) {
      item.signedEvidenceRefs = [`ledger:${append(suite.promptInjectionRegressionEvidencePayload(input, item.fixtureId.trim() || "unknown-fixture"))}`];
    }
    input.signedEvidenceRefs = [`ledger:${append(suite.promptInjectionRegressionEvidencePayload(input))}`];
    const integrity = verifyEvidenceEventIntegrity({ ledger, eventId: input.signedEvidenceRefs[0]!.slice("ledger:".length) });
    expect(integrity.ok, JSON.stringify(integrity)).toBe(true);
  };
  return { workspace, input, ledger, append, bind };
}

describe("WP45 prompt-injection receipts", () => {
  it.each(["skipped", "pending", "custom", "errored"])("blocks an unmeasured %s fixture", status => {
    const input = { suiteId: "s", suiteVersion: "1", agentId: "a", runId: "r", requiredVectors: ["direct"], sourceRefs: ["source"],
      evidenceRefs: ["trace"], signedEvidenceRefs: ["ledger:fake"], fixtures: [{ fixtureId: "f", vector: "direct", attackTraceRef: "trace", attackTraceHash: "a".repeat(64),
        policyId: "p", policyMappingRef: "m", expectedDecision: "block", observedDecision: "block", observedDecisionReceiptId: "d", regressionStatus: status,
        evidenceRefs: ["trace"], signedEvidenceRefs: ["ledger:fake"] }] } as PromptInjectionRegressionSuiteInput;
    const receipt = suite.buildPromptInjectionRegressionSuiteReceipt(input);
    expect(receipt.rows[0]?.status).toBe("missing_evidence");
    expect(receipt.status).toBe("fail_closed");
  });

  it("blocks a nonexistent signed reference even when every fixture claims passed", () => {
    const f = fixture();
    f.input.signedEvidenceRefs = ["ledger:missing"];
    f.input.fixtures[0]!.signedEvidenceRefs = ["ledger:missing-fixture"];
    const receipt = suite.buildPromptInjectionRegressionSuiteReceipt(f.input, f.workspace);
    expect(receipt.status).toBe("fail_closed");
    expect(receipt.rows[0]?.status).toBe("missing_evidence");
    expect(receipt.failClosedReasons.join(" ")).toContain("signed evidence verification missing");
  });

  it("signs real ledger-backed receipts asynchronously and verifies only with trusted workspace keys", async () => {
    const f = fixture(); f.bind();
    const receipt = suite.buildPromptInjectionRegressionSuiteReceipt(f.input, f.workspace);
    expect(receipt.status).toBe("pass");
    expect(suite.verifyPromptInjectionRegressionSuiteReceipt(receipt, f.workspace).valid).toBe(false);
    const provider = loadKeyProvider(f.workspace, "file"); const spy = vi.spyOn(provider, "sign");
    const signed = await suite.signPromptInjectionRegressionSuiteReceipt(f.workspace, receipt);
    expect(spy).toHaveBeenCalled();
    expect(signed.signature?.signer).toBe("auditor");
    expect(suite.verifyPromptInjectionRegressionSuiteReceipt(signed, f.workspace)).toEqual({ valid: true, failClosedReasons: [] });
    expect(suite.verifyPromptInjectionRegressionSuiteReceipt(signed).valid).toBe(false);
    const foreign = fixture();
    expect(suite.verifyPromptInjectionRegressionSuiteReceipt(signed, foreign.workspace).valid).toBe(false);
    const forged = structuredClone(signed); forged.runId = "forged";
    const { receiptHash: _hash, signature: _signature, ...body } = forged; forged.receiptHash = sha256Hex(canonicalize(body));
    expect(suite.verifyPromptInjectionRegressionSuiteReceipt(forged, f.workspace).valid).toBe(false);
  });

  it("rejects a real signed event that does not bind the fixture and run claims", () => {
    const f = fixture(); f.bind();
    f.input.fixtures[0]!.signedEvidenceRefs = [`ledger:${f.append("unrelated evidence")}`];
    expect(suite.buildPromptInjectionRegressionSuiteReceipt(f.input, f.workspace).rows[0]?.status).toBe("missing_evidence");
  });

  it("rejects an invalid ledger writer signature and rechecks it on receipt admission", async () => {
    const f = fixture(); f.bind();
    const signed = await suite.signPromptInjectionRegressionSuiteReceipt(f.workspace, suite.buildPromptInjectionRegressionSuiteReceipt(f.input, f.workspace));
    const eventId = f.input.fixtures[0]!.signedEvidenceRefs![0]!.slice("ledger:".length);
    const triggers = f.ledger.db.prepare("SELECT name FROM sqlite_master WHERE type = 'trigger' AND tbl_name = 'evidence_events'").all() as { name: string }[];
    for (const trigger of triggers) f.ledger.db.exec(`DROP TRIGGER "${trigger.name.replaceAll('"', '""')}"`);
    f.ledger.db.prepare("UPDATE evidence_events SET writer_sig = ? WHERE id = ?").run("forged", eventId);
    expect(suite.buildPromptInjectionRegressionSuiteReceipt(f.input, f.workspace).status).toBe("fail_closed");
    expect(suite.verifyPromptInjectionRegressionSuiteReceipt(signed, f.workspace).valid).toBe(false);
  });

  it.each(["empty", "duplicate", "blank", "source"])("blocks %s fixture coverage", kind => {
    const f = fixture();
    if (kind === "empty") f.input.fixtures = [];
    if (kind === "duplicate") f.input.fixtures.push(structuredClone(f.input.fixtures[0]!));
    if (kind === "blank") f.input.fixtures[0]!.fixtureId = " ";
    if (kind === "source") f.input.sourceRefs = [" "];
    f.bind();
    expect(suite.buildPromptInjectionRegressionSuiteReceipt(f.input, f.workspace).status).toBe("fail_closed");
  });

  it("keeps measured failures regressed and skipped fixtures missing after signing", async () => {
    const f = fixture(); f.input.fixtures[0]!.regressionStatus = "failed"; f.bind();
    const failed = suite.buildPromptInjectionRegressionSuiteReceipt(f.input, f.workspace);
    expect(failed.status).toBe("regressed");
    const signed = await suite.signPromptInjectionRegressionSuiteReceipt(f.workspace, failed);
    expect(signed.status).toBe("regressed");
    expect(suite.verifyPromptInjectionRegressionSuiteReceipt(signed, f.workspace).valid).toBe(false);
    f.input.fixtures[0]!.regressionStatus = "skipped"; f.bind();
    const skipped = await suite.signPromptInjectionRegressionSuiteReceipt(f.workspace, suite.buildPromptInjectionRegressionSuiteReceipt(f.input, f.workspace));
    expect(skipped.status).toBe("fail_closed");
    expect(skipped.rows[0]?.status).toBe("missing_evidence");
  });

  it.each(["skipped", "pending", "custom", "errored"])("blocks a real ledger-backed %s result", status => {
    const f = fixture(); f.input.fixtures[0]!.regressionStatus = status as suite.PromptInjectionRegressionFixtureStatus; f.bind();
    const receipt = suite.buildPromptInjectionRegressionSuiteReceipt(f.input, f.workspace);
    expect(receipt.rows[0]?.status).toBe("missing_evidence");
    expect(receipt.status).toBe("fail_closed");
  });

  it("does not infer missing evidence from a fixture name", () => {
    const f = fixture(); f.input.fixtures[0]!.fixtureId = "missing-data-regression";
    f.input.fixtures[0]!.regressionStatus = "failed"; f.bind();
    expect(suite.buildPromptInjectionRegressionSuiteReceipt(f.input, f.workspace).status).toBe("regressed");
  });

  it("blocks unavailable encrypted payloads", async () => {
    const f = fixture(true); await rotateDataKey(f.workspace); f.bind();
    lockVault(f.workspace); closeLedgerDataKeys(f.workspace); vi.stubEnv("AMC_VAULT_PASSPHRASE", undefined);
    const integrity = verifyEvidenceEventIntegrity({ ledger: f.ledger, eventId: f.input.signedEvidenceRefs![0]!.slice("ledger:".length) });
    expect(integrity.ok).toBe(true);
    expect(integrity.payloadsNotEvaluated?.length).toBeGreaterThan(0);
    expect(suite.buildPromptInjectionRegressionSuiteReceipt(f.input, f.workspace).status).toBe("fail_closed");
  });

  it("rejects trusted signatures over dishonest receipt semantics and missing signatures", async () => {
    const f = fixture(); f.input.fixtures[0]!.regressionStatus = "skipped"; f.bind();
    const blocked = suite.buildPromptInjectionRegressionSuiteReceipt(f.input, f.workspace);
    const dishonest = { ...blocked, status: "pass" as const, failClosedReasons: [] as string[] };
    const { receiptHash: _hash, signature: _signature, ...body } = dishonest;
    dishonest.receiptHash = sha256Hex(canonicalize(body));
    dishonest.signature = await signSerializedPayloadWithAuditorAsync(f.workspace, canonicalize(dishonest));
    expect(suite.verifyPromptInjectionRegressionSuiteReceipt(dishonest, f.workspace).valid).toBe(false);
    f.input.fixtures[0]!.regressionStatus = "passed"; f.bind();
    const signed = await suite.signPromptInjectionRegressionSuiteReceipt(f.workspace, suite.buildPromptInjectionRegressionSuiteReceipt(f.input, f.workspace));
    delete signed.signature;
    expect(suite.verifyPromptInjectionRegressionSuiteReceipt(signed, f.workspace).valid).toBe(false);
    expect(suite.verifyPromptInjectionRegressionSuiteReceipt(null as unknown as suite.PromptInjectionRegressionSuiteReceipt, f.workspace).valid).toBe(false);
  });

  it("propagates signing failures and refuses no-sign mode", async () => {
    const f = fixture(); f.bind();
    const receipt = suite.buildPromptInjectionRegressionSuiteReceipt(f.input, f.workspace);
    vi.spyOn(loadKeyProvider(f.workspace, "file"), "sign").mockRejectedValueOnce(new Error("provider unavailable"));
    await expect(suite.signPromptInjectionRegressionSuiteReceipt(f.workspace, receipt)).rejects.toThrow("provider unavailable");
    vi.stubEnv("AMC_NO_SIGN", "1");
    await expect(suite.signPromptInjectionRegressionSuiteReceipt(f.workspace, receipt)).rejects.toThrow("no-sign");
    expect(receipt.signature).toBeUndefined();
  });
});
