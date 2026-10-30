import { copyFileSync, mkdtempSync, readFileSync, readdirSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { saveWorkspaceRecord, updateWorkspaceRecord, verifyWorkspaceRecords, readTrustedWorkspaceRecords } from "../src/storage/workspaceRecordStore.js";
import {
  computeFPCostSummary, fpReportEvidence, generateFPTuningReport, listFPReports, renderFPTuningReportMarkdown, resetFPTrackerState,
  resolveFPReport, submitFPReport
} from "../src/assurance/falsePositiveTracker.js";
import { createLabExperiment, generateLabReport, labRecordEvidence, recordLabProbeResult, renderLabReportMarkdown, resetLabState } from "../src/lab/cognitionLab.js";
import { readVerified } from "../src/crypto/signing/verifiedArtifacts.js";
import { latestAssuranceCertificateSummary } from "../src/assurance/assuranceStore.js";
import { assuranceLatestCertificatePath, initAssurancePolicy, loadAssurancePolicy, saveAssurancePolicy } from "../src/assurance/assurancePolicyStore.js";
import { issueAssuranceCertificate } from "../src/assurance/assuranceCertificates.js";
import { runAssurance } from "../src/assurance/assuranceRunner.js";
import { workspaceSelfTrust } from "../src/trust/trustContext.js";
import { initWorkspace } from "../src/workspace.js";
import { startFakeAgentServer, useFakeAgentEnv } from "./helpers/fakeAgentServer.js";

const roots: string[] = [];
const previousPassphrase = process.env.AMC_VAULT_PASSPHRASE;
beforeEach(() => { process.env.AMC_VAULT_PASSPHRASE = "wp37-remainders"; resetFPTrackerState(); resetLabState(); });
afterEach(() => {
  resetFPTrackerState(); resetLabState();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  if (previousPassphrase === undefined) delete process.env.AMC_VAULT_PASSPHRASE;
  else process.env.AMC_VAULT_PASSPHRASE = previousPassphrase;
});

function scratch(prefix: string): string {
  const root = mkdtempSync(join(tmpdir(), prefix));
  roots.push(root);
  return root;
}

/** A workspace with keys, so records are signed and an intact register reads MEASURED. */
function keyed(prefix: string): string {
  const root = scratch(prefix);
  initWorkspace({ workspacePath: root, trustBoundaryMode: "isolated" });
  return root;
}

const AT = { area: ["compliance", "residency"], kind: "tenants" };
const recordFile = (ws: string, id: string) => join(ws, ".amc", "compliance", "residency", "tenants", `${id}.json`);
const codes = (ws: string) => verifyWorkspaceRecords(ws, AT).findings.map((row) => row.code);
const editJson = (file: string, edit: (row: Record<string, unknown>) => void) => {
  const row = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
  edit(row);
  writeFileSync(file, JSON.stringify(row, null, 2));
};

describe("deleted newest workspace record (WP37)", () => {
  test("an intact chain has no head finding", () => {
    const ws = scratch("amc-wp37r-head-");
    saveWorkspaceRecord(ws, AT, "a", { tenantId: "a" }, 1);
    saveWorkspaceRecord(ws, AT, "b", { tenantId: "b" }, 2);
    expect(codes(ws).filter((code) => code.startsWith("HEAD_"))).toEqual([]);
  });

  test("deleting the newest record is HEAD_MISSING, and a later write does not hide it", () => {
    const ws = scratch("amc-wp37r-head-");
    saveWorkspaceRecord(ws, AT, "a", { tenantId: "a" }, 1);
    saveWorkspaceRecord(ws, AT, "b", { tenantId: "b" }, 2);
    unlinkSync(recordFile(ws, "b"));
    expect(codes(ws)).toContain("HEAD_MISSING");
    expect(readTrustedWorkspaceRecords(ws, AT).unverified.join("\n")).toMatch(/UNVERIFIED: tenants HEAD_MISSING/);

    saveWorkspaceRecord(ws, AT, "c", { tenantId: "c" }, 3);
    expect(verifyWorkspaceRecords(ws, AT).findings.filter((row) => row.code === "HEAD_MISSING").map((row) => row.detail))
      .toEqual([expect.stringMatching(/already missing when a later record was written/)]);
  });

  test("rolling the newest record back to its kept revision is HEAD_MISSING", () => {
    const ws = scratch("amc-wp37r-head-");
    saveWorkspaceRecord(ws, AT, "a", { tenantId: "a", region: "eu" }, 1);
    updateWorkspaceRecord(ws, AT, "a", { tenantId: "a", region: "us" }, 2);
    const revisions = join(ws, ".amc", "compliance", "residency", "tenants", "revisions");
    copyFileSync(join(revisions, readdirSync(revisions)[0]!), recordFile(ws, "a"));
    expect(codes(ws)).toContain("HEAD_MISSING");
  });

  test("records with their head anchor deleted are HEAD_UNANCHORED, never clean", () => {
    const ws = scratch("amc-wp37r-head-");
    saveWorkspaceRecord(ws, AT, "a", { tenantId: "a" }, 1);
    saveWorkspaceRecord(ws, AT, "b", { tenantId: "b" }, 2);
    unlinkSync(recordFile(ws, "b"));
    unlinkSync(join(ws, ".amc", "compliance", "residency", "tenants.head.json"));
    expect(codes(ws)).toContain("HEAD_UNANCHORED");
  });
});

describe("false-positive reports read through the verifying reader (DXB-11)", () => {
  const input = (scenarioId: string) => ({ scenarioId, packId: "pack", assuranceRunId: "run-1", response: "", justification: "benign", reportedBy: "dev" });

  test("an intact register is MEASURED; a tuning report with no resolved report is not_evaluated", () => {
    const ws = keyed("amc-wp37r-fp-");
    submitFPReport(input("s1"), ws);
    resetFPTrackerState();
    const report = generateFPTuningReport(undefined, ws);
    expect(report).toMatchObject({ totalFPReports: 1, outcome: "not_evaluated", evidenceStatus: "MEASURED", unverifiedRecords: [] });
    expect(computeFPCostSummary(undefined, ws)[0]?.outcome).toBe("not_evaluated");
    expect(renderFPTuningReportMarkdown(report)).toMatch(/^\*\*Claim:\*\* Self-reported/m);
  });

  test("a tampered stored report is left out of lists and costs and labels the outputs INSUFFICIENT_EVIDENCE", () => {
    const ws = keyed("amc-wp37r-fp-");
    const kept = submitFPReport(input("s1"), ws);
    const edited = submitFPReport(input("s2"), ws);
    resolveFPReport(kept.reportId, { status: "confirmed", reason: "agreed" }, ws);
    resetFPTrackerState();
    editJson(join(ws, ".amc", "assurance", "false-positives", `${edited.reportId}.json`), (row) => { row.status = "confirmed"; });

    expect(listFPReports(undefined, ws).map((row) => row.reportId)).toEqual([kept.reportId]);
    expect(computeFPCostSummary(undefined, ws)[0]).toMatchObject({ totalFPReports: 1, confirmedFPs: 1, outcome: "measured" });
    const evidence = fpReportEvidence(ws);
    expect(evidence.evidenceStatus).toBe("INSUFFICIENT_EVIDENCE");
    expect(evidence.unverifiedRecords.join("\n")).toMatch(/HASH_MISMATCH/);
    const report = generateFPTuningReport(undefined, ws);
    expect(report).toMatchObject({ totalFPReports: 1, outcome: "measured", evidenceStatus: "INSUFFICIENT_EVIDENCE" });
    expect(renderFPTuningReportMarkdown(report)).toMatch(/\*\*Evidence:\*\* INSUFFICIENT_EVIDENCE\n- UNVERIFIED: false-positives HASH_MISMATCH/);
  });
});

describe("cognition lab reads through the verifying reader (DXB-11)", () => {
  const probe = (experimentId: string, probeId: string, score: number) =>
    ({ experimentId, probeId, responseText: "", scores: { accuracy: score }, latencyMs: 1, tokenCount: 1, metadata: {} });

  test("a report with no probe result is not_evaluated; an intact one is MEASURED", () => {
    const ws = keyed("amc-wp37r-lab-");
    const experiment = createLabExperiment({ kind: "custom", name: "x", description: "x", modelId: "m" }, ws);
    expect(generateLabReport(experiment.experimentId, ws)).toMatchObject({ outcome: "not_evaluated", evidenceStatus: "MEASURED" });
    recordLabProbeResult(probe(experiment.experimentId, "p1", 0.4), ws);
    expect(generateLabReport(experiment.experimentId, ws)).toMatchObject({ outcome: "measured", evidenceStatus: "MEASURED", aggregateScores: { accuracy: 0.4 } });
  });

  test("a tampered probe result does not move the aggregate and is reported", () => {
    const ws = keyed("amc-wp37r-lab-");
    const experiment = createLabExperiment({ kind: "custom", name: "x", description: "x", modelId: "m" }, ws);
    recordLabProbeResult(probe(experiment.experimentId, "p1", 0.4), ws);
    recordLabProbeResult(probe(experiment.experimentId, "p2", 0.4), ws);
    resetLabState();
    const dir = join(ws, ".amc", "lab", "probe-results");
    const victim = readdirSync(dir).find((name) => name.endsWith(".json"))!;
    editJson(join(dir, victim), (row) => { row.scores = { accuracy: 1 }; });

    const report = generateLabReport(experiment.experimentId, ws)!;
    expect(report.probeResults).toHaveLength(1);
    expect(report.aggregateScores).toEqual({ accuracy: 0.4 });
    expect(report.evidenceStatus).toBe("INSUFFICIENT_EVIDENCE");
    expect(labRecordEvidence(ws).unverifiedRecords.join("\n")).toMatch(/probe-results HASH_MISMATCH/);
    expect(renderLabReportMarkdown(report)).toMatch(/Evidence: INSUFFICIENT_EVIDENCE\n- UNVERIFIED: probe-results HASH_MISMATCH/);
  });
});

function tar(args: string[]): void {
  const result = spawnSync("tar", args, { encoding: "utf8" });
  if (result.status !== 0) throw new Error(`tar failed: ${result.stderr}`);
}

describe("verified-artifact registry (AXE-35)", () => {
  test("reads a genuine assurance certificate, refuses a tampered one and an unknown kind, and passports embed only the verified one", async () => {
    const ws = keyed("amc-wp37r-cert-");
    const agent = await startFakeAgentServer();
    const restoreEnv = useFakeAgentEnv(agent.baseUrl);
    try {
      const run = await runAssurance({ workspace: ws, agentId: "default", mode: "supervise", window: "14d", packId: "injection", noSign: true });
      initAssurancePolicy(ws);
      const policy = loadAssurancePolicy(ws);
      policy.assurancePolicy.gates = { ...policy.assurancePolicy.gates, minIntegrityIndex: 0, minCorrelationRatio: 0, minObservedShare: 0 };
      saveAssurancePolicy(ws, policy);
      await issueAssuranceCertificate({ workspace: ws, runId: run.assuranceRunId });
    } finally {
      restoreEnv();
      await agent.close();
    }
    const file = assuranceLatestCertificatePath(ws), trust = workspaceSelfTrust(ws);
    const genuine = readVerified("assurance-certificate", { file, trust });
    expect(genuine).toMatchObject({ status: "verified", label: "VERIFIED" });
    expect(latestAssuranceCertificateSummary(ws)?.cert).toEqual(genuine.status === "verified" ? genuine.artifact : null);

    const tree = scratch("amc-wp37r-cert-x-");
    tar(["-xzf", file, "-C", tree]);
    const certJson = readdirSync(tree, { recursive: true }).map(String).find((name) => name.endsWith("cert.json"))!;
    editJson(join(tree, certJson), (row) => { row.riskAssuranceScore = 100; });
    tar(["-czf", file, "-C", tree, "."]);

    const tampered = readVerified("assurance-certificate", { file, trust });
    expect(tampered).toMatchObject({ status: "refused", label: "UNVERIFIED" });
    expect(tampered.status === "refused" ? tampered.reasons.join("; ") : "").toMatch(/cert digest mismatch/);
    expect(latestAssuranceCertificateSummary(ws)).toBeNull();
    expect(readVerified("trust-me", { file, trust })).toMatchObject({ status: "refused", label: "UNKNOWN_KIND" });
  }, 120_000);
});
