import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { lockVault } from "../src/vault/vault.js";
import { loadKeyProvider } from "../src/keys/purposeProviders.js";
import { sha256Hex } from "../src/utils/hash.js";
import { canonicalize } from "../src/utils/json.js";
import {
  buildIncidentRegressionReceipt,
  signIncidentRegressionReceipt,
  verifyIncidentRegressionReceipt,
  type IncidentRegressionValidationRun,
  type IncidentRegressionReceipt,
} from "../src/incidents/incidentRegression.js";

const roots: string[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) {
    lockVault(join(root, "workspace"));
    rmSync(root, { recursive: true, force: true });
  }
  vi.unstubAllEnvs();
});
function workspace() {
  const root = mkdtempSync(join(tmpdir(), "amc-incident-regression-")); roots.push(root);
  vi.stubEnv("AMC_HOME", join(root, "home"));
  vi.stubEnv("AMC_VAULT_PASSPHRASE", "incident-regression-test-passphrase");
  vi.stubEnv("AMC_NO_SIGN", "0");
  const path = join(root, "workspace");
  initWorkspace({ workspacePath: path, trustBoundaryMode: "isolated" });
  return path;
}
function receipt(runs?: IncidentRegressionValidationRun[]) {
  return buildIncidentRegressionReceipt({
    generatedAt: "2026-10-29T00:05:00Z",
    traces: [{ incidentId: "incident", traceId: "trace", agentId: "agent", timestamp: "2026-10-29T00:00:00Z",
      failureMode: "tool_timeout", riskEvent: "escalation", promptBoundary: "prompt", toolBoundary: "tool",
      latencyMs: 100, costUsd: 0.01, remediationState: "mitigated", evidenceRefs: ["trace-receipt"] }],
    generatedTests: [{ testId: "regression", sourceIncidentId: "incident", sourceTraceId: "trace",
      name: "Timeout escalates", assertion: "A timed out call escalates", expectedOutcome: "escalated", evidenceRefs: ["test-receipt"] }],
    validationRuns: runs ?? [
      { runId: "before", testId: "regression", phase: "pre_fix", buildRef: "broken", status: "failed",
        validatedAt: "2026-10-29T00:01:00Z", evidenceRefs: ["before-receipt"] },
      { runId: "after", testId: "regression", phase: "post_fix", buildRef: "fixed", status: "passed",
        validatedAt: "2026-10-29T00:02:00Z", evidenceRefs: ["after-receipt"] },
    ],
    closureEvidenceRefs: ["closure-receipt"],
  });
}

describe("signed incident regression receipts", () => {
  it("signs the exact receipt through the async provider and verifies with workspace trust", async () => {
    const path = workspace(), provider = loadKeyProvider(path, "file"), spy = vi.spyOn(provider, "sign");
    const input = receipt(), signed = await signIncidentRegressionReceipt(path, input);
    expect(input.signature).toBeUndefined();
    expect(signed.signature?.digestSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(spy.mock.calls.map(([ref]) => ref.id)).toEqual(["artifact-seal"]);
    expect(verifyIncidentRegressionReceipt(signed, path)).toEqual({ valid: true, failClosedReasons: [] });
  });

  it("rejects unsigned, tampered, rehashed, and foreign-key receipts", async () => {
    const path = workspace(), input = receipt();
    expect(verifyIncidentRegressionReceipt(input, path).valid).toBe(false);
    const signed = await signIncidentRegressionReceipt(path, input);
    expect(verifyIncidentRegressionReceipt(signed).valid).toBe(false);
    expect(verifyIncidentRegressionReceipt(signed, workspace()).valid).toBe(false);
    expect(verifyIncidentRegressionReceipt({ ...signed, status: "fail_closed" }, path).valid).toBe(false);
    expect(verifyIncidentRegressionReceipt({ ...signed, receiptHash: "0".repeat(64) }, path).valid).toBe(false);
    const { signature, receiptHash: _hash, ...body } = signed;
    const changed = { ...body, generatedAt: "2026-10-29T00:06:00Z" };
    const rehashed = { ...changed, receiptHash: sha256Hex(canonicalize(changed)), signature };
    expect(verifyIncidentRegressionReceipt(rehashed, path).valid).toBe(false);
    expect(verifyIncidentRegressionReceipt({ ...signed, signature: { ...signed.signature!, signature: "forged" } }, path).valid).toBe(false);
  });

  it("signs failures without granting closure and rejects no-sign mode", async () => {
    const path = workspace(), blocked = receipt([]);
    const signed = await signIncidentRegressionReceipt(path, blocked);
    expect(signed.status).toBe("fail_closed");
    expect(verifyIncidentRegressionReceipt(signed, path).valid).toBe(false);
    vi.stubEnv("AMC_NO_SIGN", "1");
    await expect(signIncidentRegressionReceipt(path, receipt())).rejects.toThrow("no-sign");
  });

  it("rechecks semantics after a trusted signer signs a rehashed fabricated success", async () => {
    const path = workspace();
    for (const damage of ["pair", "trace"] as const) {
      const forged = damage === "pair" ? receipt([]) : receipt();
      forged.status = "ready_to_close"; forged.failClosed = false; forged.failClosedReasons = [];
      forged.closureStatus.status = "ready_to_close";
      forged.closureStatus.readyIncidentIds = ["incident"];
      forged.closureStatus.blockedIncidentIds = [];
      forged.closureStatus.validatedTestIds = ["regression"];
      forged.closureStatus.missingValidationTestIds = [];
      if (damage === "trace") {
        const entry = forged.traceIndex.entries[0]!;
        entry.agentId = "";
        const { rowHash: _rowHash, ...row } = entry;
        entry.rowHash = sha256Hex(canonicalize(row));
      }
      const { receiptHash: _receiptHash, ...body } = forged;
      const rehashed: IncidentRegressionReceipt = { ...body, receiptHash: sha256Hex(canonicalize(body)) };
      const signed = await signIncidentRegressionReceipt(path, rehashed);
      const verified = verifyIncidentRegressionReceipt(signed, path);
      expect(verified.valid).toBe(false);
      expect(verified.failClosedReasons).toContain(damage === "pair" ? "validationRuns:missing" : "trace:agentId:missing");
    }
  });

  it.each(["promptBoundary", "toolBoundary"] as const)("rejects a rehashed trusted-signed receipt missing its original %s", async field => {
    const path = workspace(), forged = receipt();
    const entry = forged.traceIndex.entries[0]!;
    delete entry[field];
    const { rowHash: _rowHash, ...row } = entry;
    entry.rowHash = sha256Hex(canonicalize(row));
    const { receiptHash: _receiptHash, ...body } = forged;
    forged.receiptHash = sha256Hex(canonicalize(body));
    const signed = await signIncidentRegressionReceipt(path, forged);
    const verified = verifyIncidentRegressionReceipt(signed, path);
    expect(verified.valid).toBe(false);
    expect(verified.failClosedReasons).toContain(`trace:${field}:missing`);
  });

  it("retains literal slash and sentinel labels when the original boundaries are present", async () => {
    const path = workspace(), input = receipt(), entry = input.traceIndex.entries[0]!;
    entry.promptBoundary = "prompt-unknown/ordinary/path";
    entry.toolBoundary = "ordinary/path/tool-unknown";
    entry.promptToolBoundary = `${entry.promptBoundary}/${entry.toolBoundary}`;
    const { rowHash: _rowHash, ...row } = entry;
    entry.rowHash = sha256Hex(canonicalize(row));
    const { receiptHash: _receiptHash, ...body } = input;
    input.receiptHash = sha256Hex(canonicalize(body));
    const signed = await signIncidentRegressionReceipt(path, input);
    expect(verifyIncidentRegressionReceipt(signed, path)).toEqual({ valid: true, failClosedReasons: [] });
  });

  it("refuses a signed receipt whose per-incident closure status remains blocked", async () => {
    const path = workspace(), input = receipt();
    input.closureStatus.status = "blocked";
    const { receiptHash: _receiptHash, ...body } = input;
    input.receiptHash = sha256Hex(canonicalize(body));
    const signed = await signIncidentRegressionReceipt(path, input);
    const verified = verifyIncidentRegressionReceipt(signed, path);
    expect(verified.valid).toBe(false);
    expect(verified.failClosedReasons).toContain("closure status mismatch");
  });

  it("copies caller receipt before the async provider wait", async () => {
    const path = workspace(), provider = loadKeyProvider(path, "file"), original = provider.sign.bind(provider);
    let entered!: () => void, release!: () => void;
    const waiting = new Promise<void>(resolve => { entered = resolve; });
    const gate = new Promise<void>(resolve => { release = resolve; });
    vi.spyOn(provider, "sign").mockImplementationOnce(async (...args) => {
      const signature = await original(...args); entered(); await gate; return signature;
    });
    const input = receipt(), pending = signIncidentRegressionReceipt(path, input);
    try {
      await waiting;
      input.generatedTests[0]!.assertion = "Caller changed the test while signing";
    } finally { release(); }
    const signed = await pending;
    expect(signed.generatedTests[0]!.assertion).toBe("A timed out call escalates");
    expect(verifyIncidentRegressionReceipt(signed, path).valid).toBe(true);
  });
});
