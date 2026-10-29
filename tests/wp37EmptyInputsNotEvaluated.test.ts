import { mkdtempSync, readdirSync, rmSync, unlinkSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { verifyAll } from "../src/verify/verifyAll.js";
import { verifyAllExit } from "../src/cli-trust-flags.js";
import { registerBuiltInProbes, resetMicroCanaryState, runAllProbes } from "../src/assurance/microCanary.js";
import { trackConfidenceDrift } from "../src/score/confidenceDrift.js";
import { ContinuousRedTeam } from "../src/shield/continuousRedTeam.js";
import { detectHallucinations } from "../src/hallucination/detector.js";
import { runTrustPipeline } from "../src/shield/trustPipeline.js";
import { saveWorkspaceRecord, updateWorkspaceRecord, verifyWorkspaceRecords } from "../src/storage/workspaceRecordStore.js";
import { benchComparisonWithInputs } from "../src/bench/benchComparer.js";
import { generateResidencyReport, registerTenant, resetDataResidencyState } from "../src/compliance/dataResidency.js";
import { workspaceKeyTrust } from "./helpers/trustContext.js";

vi.mock("../src/enforce/evidenceEmitter.js", () => ({ emitGuardEvent: vi.fn() }));

const roots: string[] = [];
const previousPassphrase = process.env.AMC_VAULT_PASSPHRASE;
beforeEach(() => { process.env.AMC_VAULT_PASSPHRASE = "wp37-empty-inputs"; });
afterEach(() => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  if (previousPassphrase === undefined) delete process.env.AMC_VAULT_PASSPHRASE;
  else process.env.AMC_VAULT_PASSPHRASE = previousPassphrase;
});

function workspace(): string {
  const root = mkdtempSync(join(tmpdir(), "amc-wp37-empty-"));
  roots.push(root);
  initWorkspace({ workspacePath: root, trustBoundaryMode: "isolated" });
  return root;
}

describe("WP37: empty inputs are not evaluated, never a pass", () => {
  test("verify all withholds PASS while a critical check was skipped, and the CLI exits non-zero", async () => {
    const ws = workspace();
    const report = await verifyAll({ workspace: ws, trust: workspaceKeyTrust(ws) });
    expect(report.checks.some((check) => check.status === "FAIL")).toBe(false);
    expect(report.status).toBe("INCOMPLETE");
    expect(report.skippedCritical).toContain("passport-policy-signature");

    const exit = vi.spyOn(process, "exit").mockImplementation(((code?: number) => { throw new Error(`exit ${code}`); }) as never);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const anchored = [{ id: "ledger-trust-root", status: "PASS" }];
    expect(() => verifyAllExit({ status: "INCOMPLETE", skippedCritical: ["passport-policy-signature"], checks: anchored },
      workspaceKeyTrust(ws))).toThrow("exit 1");
    exit.mockClear();
    verifyAllExit({ status: "PASS", skippedCritical: [], checks: anchored }, workspaceKeyTrust(ws));
    expect(exit).not.toHaveBeenCalled();
  });

  test("micro-canary on an empty context yields no PASS", () => {
    resetMicroCanaryState();
    registerBuiltInProbes();
    const results = runAllProbes({ ts: Date.now(), agentId: "default", recentEventHashes: [], auditCounts: {}, configSignatures: {}, metadata: {} });
    expect(results.length).toBeGreaterThan(0);
    expect(results.filter((row) => row.result.status === "PASS")).toEqual([]);
    expect(results.find((row) => row.probeId === "mc-injection-markers")?.result.status).toBe("SKIP");
  });

  test("calibration on no data is not_evaluated, not 100%", () => {
    const empty = trackConfidenceDrift([]);
    expect(empty.calibrationScore).toBeNull();
    expect(empty.outcome).toBe("not_evaluated");
    const measured = trackConfidenceDrift([{ id: "p1", timestamp: "t", predictedOutcome: "x", confidenceLevel: 0.9, wasCorrect: true, citationCount: 1 }]);
    expect(measured.outcome).toBe("measured");
    expect(measured.calibrationScore).toBeCloseTo(0.9);
  });

  test("a red-team report over zero attacks is INSUFFICIENT_EVIDENCE with no GOOD verdict", () => {
    const report = new ContinuousRedTeam({ intervalMs: 60_000, attacksPerRound: 5, maxEvolutionDepth: 3, regressionAlertThreshold: 0.2,
      targetProfiles: [], enableAutoEscalation: false, independentRatio: 0.6, mutationRate: 0.3, crossoverRate: 0.2, elitePoolSize: 50 })
      .generateReport();
    expect(report.totalAttacks).toBe(0);
    expect(report.evidenceStatus).toBe("INSUFFICIENT_EVIDENCE");
    expect(report.recommendedRemediations).toEqual([]);
  });

  test("hallucination detection without grounding cannot pass", async () => {
    const ungrounded = await detectHallucinations({ response: "The capital of France is Paris." });
    expect(ungrounded.outcome).toBe("not_evaluated");
    expect(ungrounded.passed).toBeNull();
    const grounded = await detectHallucinations({ response: "The capital of France is Paris.", context: "Paris is the capital of France." });
    expect(grounded.outcome).toBe("measured");
    expect(grounded.passed).toBe(true);
  });

  test("the shield trust pipeline refuses an action whose trust context is missing", async () => {
    const result = await runTrustPipeline({ agentId: "a", action: "read-file", toolName: "file-reader", parameters: {}, sessionId: "s", workspaceId: "w" });
    expect(result.allowed).toBe(false);
    expect(result.stages.shieldGate.checks.credentialFreshness).toBe("expired");
    expect(result.stages.shieldGate.recommendations[0]).toContain("instructionSource, lastVerifiedAt, cumulativeConfidence");
    // Each missing field counts against trust on its own, even with fresh credentials.
    const fresh = await runTrustPipeline({ agentId: "a", action: "read-file", toolName: "file-reader", parameters: {}, sessionId: "s",
      workspaceId: "w", lastVerifiedAt: Date.now() });
    expect(fresh.stages.shieldGate.checks.instructionHierarchyValid).toBe(false);
    expect(fresh.stages.shieldGate.checks.uncertaintyAcceptable).toBe(false);
    expect(fresh.stages.shieldGate.checks.credentialFreshness).toBe("valid");
  });

  test("a bench comparison with no imported population has no percentiles", () => {
    const local = {
      benchId: "local", scope: { type: "WORKSPACE", idHash: "abcdef12" },
      evidence: { integrityIndex: 0.8, correlationRatio: 0.9, trustLabel: "HIGH" },
      metrics: {
        maturity: { overall: 3, fiveLayers: { strategicOps: 3, leadership: 3, culture: 3, resilience: 3, skills: 3 } },
        strategyFailureRisks: { ecosystemFocusRisk: 10, clarityPathRisk: 10, economicSignificanceRisk: 10, riskAssuranceRisk: 10, digitalDualityRisk: 10 },
        valueDimensions: { emotionalValue: 50, functionalValue: 50, economicValue: 50, brandValue: 50, lifetimeValue: 50, valueScore: 50 }
      }
    };
    const weights = { ecosystemAlignment: { ecosystemFocusRisk: 0.4, emotionalValue: 0.3, brandValue: 0.3 },
      riskAssurance: { riskAssuranceRisk: 0.4, integrityIndex: 0.3, correlationRatio: 0.3 },
      digitalDuality: { digitalDualityRisk: 0.5, toolGovernanceMaturity: 0.5 } };
    const comparison = benchComparisonWithInputs({}, local as never, [], { benchPolicy: { weights } } as never);
    expect(Object.values(comparison.percentiles).length).toBeGreaterThan(0);
    expect(Object.values(comparison.percentiles).every((value) => value === null)).toBe(true);
    expect(comparison.warnings).toContain("NO_IMPORTED_POPULATION");
  });
});

describe("WP37: workspace record reads verify chain and signatures", () => {
  const at = { area: ["test", "wp37"], kind: "records" };
  const dir = (ws: string) => join(ws, ".amc", "test", "wp37", "records");

  test("a clean register has no findings, and an update keeps the superseded revision", () => {
    const ws = workspace();
    saveWorkspaceRecord(ws, at, "a", { id: "a", value: 1 }, 1);
    saveWorkspaceRecord(ws, at, "b", { id: "b", value: 2 }, 2);
    updateWorkspaceRecord(ws, at, "a", { id: "a", value: 3 }, 3);
    saveWorkspaceRecord(ws, at, "c", { id: "c", value: 4 }, 4);
    const verified = verifyWorkspaceRecords<{ id: string }>(ws, at);
    expect(verified.findings).toEqual([]);
    expect(verified.records.map((row) => row.id).sort()).toEqual(["a", "b", "c"]);
    expect(readdirSync(join(dir(ws), "revisions"))).toHaveLength(1);
  });

  test("a deleted, corrupted, edited or wrongly signed record produces a finding", () => {
    const ws = workspace();
    saveWorkspaceRecord(ws, at, "a", { id: "a" }, 1);
    saveWorkspaceRecord(ws, at, "b", { id: "b" }, 2);
    saveWorkspaceRecord(ws, at, "c", { id: "c" }, 3);
    saveWorkspaceRecord(ws, at, "d", { id: "d" }, 4);

    unlinkSync(join(dir(ws), "b.json"));
    expect(verifyWorkspaceRecords(ws, at).findings.map((row) => row.code)).toEqual(["CHAIN_GAP"]);

    writeFileSync(join(dir(ws), "c.json"), "{ not json");
    expect(verifyWorkspaceRecords(ws, at).findings.map((row) => row.code).sort()).toEqual(["CHAIN_GAP", "UNREADABLE"]);

    const file = join(dir(ws), "d.json"), record = JSON.parse(readFileSync(file, "utf8"));
    writeFileSync(file, JSON.stringify({ ...record, id: "edited" }));
    expect(verifyWorkspaceRecords(ws, at).findings.map((row) => row.code)).toContain("HASH_MISMATCH");

    writeFileSync(file, JSON.stringify({ ...record, signature: Buffer.from("forged").toString("base64") }));
    expect(verifyWorkspaceRecords(ws, at).findings.map((row) => row.code)).toContain("SIGNATURE_INVALID");
  });

  test("the residency report lists a tampered tenant record as a violation", () => {
    const ws = workspace();
    resetDataResidencyState();
    registerTenant({ tenantId: "acme", workspaceId: "w", region: "eu-west-1" }, ws);
    expect(generateResidencyReport("acme", undefined, ws).violations.filter((v) => v.includes("record integrity"))).toEqual([]);
    const file = join(ws, ".amc", "compliance", "residency", "tenants", "acme.json"), record = JSON.parse(readFileSync(file, "utf8"));
    writeFileSync(file, JSON.stringify({ ...record, region: "us-east-1" }));
    resetDataResidencyState();
    const report = generateResidencyReport("acme", undefined, ws);
    expect(report.compliant).toBe(false);
    expect(report.violations.some((v) => v.includes("HASH_MISMATCH"))).toBe(true);
  });
});
