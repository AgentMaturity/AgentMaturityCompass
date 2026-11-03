import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { getAgentPaths } from "../src/fleet/paths.js";
import { latestVerifiedRun, listVerifiedRuns, loadVerifiedRunReport, MAX_CACHED_VERDICTS } from "../src/diagnostic/runReportResolution.js";
import { generateTrustCertificate } from "../src/cert/trustCertificate.js";
import { startTrustDriftMonitor } from "../src/monitor/trustDriftMonitor.js";
import { latestAssuranceByPack, scanVerifiedAssuranceByPack } from "../src/assurance/assuranceRunner.js";
import { assuranceRunDetailForApi } from "../src/assurance/assuranceControlPlane.js";
import { inspectLatestAssuranceCertificate, latestAssuranceCertificateSummary } from "../src/assurance/assuranceStore.js";
import { collectAuditBinderData } from "../src/audit/binderCollector.js";
import { loadAuditPolicy } from "../src/audit/auditPolicyStore.js";
import { loadAuditMapActive } from "../src/audit/auditMapStore.js";
import { assuranceLatestCertificatePath } from "../src/assurance/assurancePolicyStore.js";
import { writeFileAtomic, ensureDir } from "../src/utils/fs.js";
import { dirname } from "node:path";
import { questionBank } from "../src/diagnostic/questionBank.js";
import { tamperReport, writeAnchoredRun, writeSealedReport } from "./helpers/sealedRun.js";

/** A parsed-but-unverified certificate: the verifier is stubbed only for the certificate-summary test. */
const certStub = vi.hoisted(() => ({ result: null as null | Record<string, unknown> }));
vi.mock("../src/assurance/assuranceVerifier.js", async (importActual) => {
  const actual = await importActual<typeof import("../src/assurance/assuranceVerifier.js")>();
  return { ...actual, verifyAssuranceCertificateFile: (params: Parameters<typeof actual.verifyAssuranceCertificateFile>[0]) =>
    certStub.result ?? actual.verifyAssuranceCertificateFile(params) };
});

/** Counts seal verifications and file reads so a test can show what a repeated scan redoes. */
const counts = vi.hoisted(() => ({ verifies: 0, reads: [] as string[] }));
vi.mock("../src/diagnostic/reportSeal.js", async (importActual) => {
  const actual = await importActual<typeof import("../src/diagnostic/reportSeal.js")>();
  return { ...actual, sealedRunReportVerifies: (...args: Parameters<typeof actual.sealedRunReportVerifies>) => {
    counts.verifies += 1;
    return actual.sealedRunReportVerifies(...args);
  } };
});
vi.mock("node:fs", async (importActual) => {
  const actual = await importActual<typeof import("node:fs")>();
  const readFileSync = ((...args: Parameters<typeof actual.readFileSync>) => {
    counts.reads.push(String(args[0]));
    return actual.readFileSync(...args);
  }) as typeof actual.readFileSync;
  return { ...actual, default: { ...actual, readFileSync }, readFileSync };
});

const roots: string[] = [];
const previousPassphrase = process.env.AMC_VAULT_PASSPHRASE;

beforeEach(() => { process.env.AMC_VAULT_PASSPHRASE = "wp37-verified-readers"; });
afterEach(() => {
  certStub.result = null;
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  if (previousPassphrase === undefined) delete process.env.AMC_VAULT_PASSPHRASE;
  else process.env.AMC_VAULT_PASSPHRASE = previousPassphrase;
});

function workspace(): string {
  const root = mkdtempSync(join(tmpdir(), "amc-wp37-readers-"));
  roots.push(root);
  initWorkspace({ workspacePath: root, trustBoundaryMode: "isolated" });
  return root;
}

function run(runId: string, ts: number, integrityIndex: number): Record<string, unknown> {
  return {
    runId, agentId: "agent-x", ts, status: "VALID", windowStartTs: ts - 1000, windowEndTs: ts,
    integrityIndex, correlationRatio: 0.9, trustLabel: "HIGH",
    evidenceTrustCoverage: { observed: 0.6, attested: 0.3, selfReported: 0.1 },
    layerScores: [{ layerName: "Skills", avgFinalLevel: integrityIndex * 5 }], questionScores: [], evidenceToCollectNext: []
  };
}

const runsDir = (ws: string) => getAgentPaths(ws, "agent-x").runsDir;

describe("WP37 verified run readers", () => {
  test("listVerifiedRuns and loadVerifiedRunReport return only runs whose seal verifies", () => {
    const ws = workspace();
    writeSealedReport(ws, runsDir(ws), "run-1", run("run-1", 1000, 0.5));
    const edited = writeSealedReport(ws, runsDir(ws), "run-2", run("run-2", 2000, 0.6));
    tamperReport(edited, (report) => { report.integrityIndex = 0.99; });

    expect(listVerifiedRuns(ws, "agent-x").map((row) => row.runId)).toEqual(["run-1"]);
    expect(loadVerifiedRunReport(ws, "run-1", "agent-x")?.runId).toBe("run-1");
    expect(loadVerifiedRunReport(ws, "run-2", "agent-x")).toBeNull();
    expect(loadVerifiedRunReport(ws, "missing", "agent-x")).toBeNull();
  });

  test("a repeated scan re-verifies changed bytes and hands each caller its own report", () => {
    const ws = workspace();
    writeSealedReport(ws, runsDir(ws), "run-1", run("run-1", 1000, 0.5));
    const newest = writeSealedReport(ws, runsDir(ws), "run-2", run("run-2", 2000, 0.6));
    const first = latestVerifiedRun(ws, "agent-x").run!;
    expect(first.runId).toBe("run-2");
    first.integrityIndex = 0.01;
    expect(latestVerifiedRun(ws, "agent-x").run?.integrityIndex).toBe(0.6);
    expect(listVerifiedRuns(ws, "agent-x").map((row) => row.runId)).toEqual(["run-2", "run-1"]);
    tamperReport(newest, (report) => { report.integrityIndex = 0.99; });
    expect(latestVerifiedRun(ws, "agent-x")).toMatchObject({ run: null, blocking: [{ tampered: true }] });
    expect(listVerifiedRuns(ws, "agent-x").map((row) => row.runId)).toEqual(["run-1"]);
  });

  test("a repeated scan reads only the run it returns and re-verifies nothing while stats and bytes are unchanged", () => {
    const ws = workspace();
    for (let index = 1; index <= 5; index += 1) writeSealedReport(ws, runsDir(ws), `run-${index}`, run(`run-${index}`, index * 1000, 0.5));
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      // Past the racy window: the files' stats now vouch for the bytes they were verified with.
      vi.setSystemTime(Date.now() + 10_000);
      expect(latestVerifiedRun(ws, "agent-x").run?.runId).toBe("run-5");
      counts.verifies = 0; counts.reads.length = 0;
      expect(latestVerifiedRun(ws, "agent-x").run?.runId).toBe("run-5");
      expect(counts.verifies).toBe(0);
      expect(counts.reads.filter((file) => file.startsWith(runsDir(ws)))).toEqual([join(runsDir(ws), "run-5.json")]);
    } finally {
      vi.useRealTimers();
    }
  });

  test("a workspace with more run files than the cache holds still reuses the verdicts it kept", () => {
    const ws = workspace();
    const overflow = 20, total = MAX_CACHED_VERDICTS + overflow;
    writeSealedReport(ws, runsDir(ws), "run-0000", run("run-0000", 1000, 0.5));
    for (let index = 1; index < total; index += 1) writeFileSync(join(runsDir(ws), `run-${String(index).padStart(4, "0")}.json`), "{}");
    listVerifiedRuns(ws, "agent-x");
    counts.verifies = 0;
    expect(listVerifiedRuns(ws, "agent-x").map((row) => row.runId)).toEqual(["run-0000"]);
    // An LRU or a cleared cache would re-verify every file on each scan; only the files past the cap are verified again.
    expect(counts.verifies).toBe(overflow);
  });

  test("loadVerifiedRunReport refuses a sealed run of another agent or stored under another run's name", () => {
    const ws = workspace();
    writeSealedReport(ws, runsDir(ws), "run-foreign", { ...run("run-foreign", 1000, 0.5), agentId: "agent-other" });
    writeSealedReport(ws, runsDir(ws), "run-renamed", run("run-original", 1000, 0.5));
    expect(loadVerifiedRunReport(ws, "run-foreign", "agent-x")).toBeNull();
    expect(loadVerifiedRunReport(ws, "run-renamed", "agent-x")).toBeNull();
  });

  test("generateTrustCertificate refuses rather than roll back past a tampered newest run", () => {
    const ws = workspace();
    writeSealedReport(ws, runsDir(ws), "run-1", run("run-1", 1000, 0.5));
    const edited = writeSealedReport(ws, runsDir(ws), "run-2", run("run-2", 2000, 0.6));
    tamperReport(edited, (report) => { report.integrityIndex = 0.99; });

    expect(latestVerifiedRun(ws, "agent-x")).toMatchObject({ run: null, blocking: [{ file: edited, tampered: true }] });
    expect(() => generateTrustCertificate({ workspace: ws, agentId: "agent-x", outputPath: "cert.json", nowTs: 1_700_000_000_000 }))
      .toThrow(/refusing to sign a trust certificate from older evidence/);
  });

  test("generateTrustCertificate signs the newest sealed run; an older unsigned run does not block, a newer one does", () => {
    const ws = workspace();
    // Anchored in the ledger as the runner publishes it: the certificate signs only the agent's trusted run.
    writeAnchoredRun(ws, runsDir(ws), run("run-1", 1000, 0.5) as Parameters<typeof writeAnchoredRun>[2]);
    writeFileSync(join(runsDir(ws), "run-0.json"), JSON.stringify({ ...run("run-0", 500, 0.9), runSealSig: "unsigned" }));
    const out = generateTrustCertificate({ workspace: ws, agentId: "agent-x", outputPath: "cert.json", nowTs: 1_700_000_000_000 });
    expect(out.envelope.payload.scoreSourceRunId).toBe("run-1");
    expect(out.envelope.payload.score).toBe(50);
    expect(out.envelope.payload.scoreSourceRunSha256).toMatch(/^[a-f0-9]{64}$/);

    writeFileSync(join(runsDir(ws), "run-2.json"), JSON.stringify({ ...run("run-2", 2000, 0.9), runSealSig: "unsigned" }));
    expect(() => generateTrustCertificate({ workspace: ws, agentId: "agent-x", outputPath: "cert2.json" })).toThrow(/Unverifiable diagnostic run/);
  });

  test("generateTrustCertificate refuses to sign when no run verifies, but still previews", () => {
    const ws = workspace();
    const edited = writeSealedReport(ws, runsDir(ws), "run-1", run("run-1", 1000, 0.6));
    tamperReport(edited, (report) => { report.integrityIndex = 0.99; });

    expect(() => generateTrustCertificate({ workspace: ws, agentId: "agent-x", outputPath: "cert.json" }))
      .toThrow(/refusing to sign a trust certificate/);
    const preview = generateTrustCertificate({ workspace: ws, agentId: "agent-x", outputPath: "preview.json", preview: true });
    expect(preview.envelope.payload.scoreSourceRunId).toBeNull();
    expect(preview.envelope.payload.score).toBe(0);
  });

  test("trust drift monitor ignores a tampered run", () => {
    const ws = workspace();
    writeAnchoredRun(ws, runsDir(ws), run("run-1", 1000, 0.9) as Parameters<typeof writeAnchoredRun>[2]);
    const edited = writeSealedReport(ws, runsDir(ws), "run-2", run("run-2", 2000, 0.9));
    tamperReport(edited, (report) => { report.integrityIndex = 0.1; });

    const result = startTrustDriftMonitor({ workspace: ws, agentId: "agent-x", alertThreshold: 10, nowTs: 3000 });
    expect(result.analyzedRuns).toBe(1);
    expect(result.alerts).toEqual([]);
    expect(result.evidenceStatus).toBe("INSUFFICIENT_EVIDENCE");
    expect(result.unverifiedRuns).toEqual([edited]);
  });

  test("the audit binder reports insufficient evidence, not the older sealed run, after the newest run was edited", async () => {
    const ws = workspace();
    writeSealedReport(ws, runsDir(ws), "run-1", run("run-1", Date.now() - 2000, 0.5));
    const edited = writeSealedReport(ws, runsDir(ws), "run-2", run("run-2", Date.now() - 1000, 0.6));
    tamperReport(edited, (report) => { report.integrityIndex = 0.99; });

    const { binder } = await collectAuditBinderData({ workspace: ws, scope: { type: "AGENT", id: "agent-x" },
      policy: loadAuditPolicy(ws), map: loadAuditMapActive(ws), nowTs: Date.now() });
    const text = JSON.stringify(binder);
    expect(text).toContain("Unverifiable agent diagnostic runs block the latest result");
    expect(text).not.toContain("0.99");
    expect(text).not.toContain("\"integrityIndex\":0.5");
    // Nothing trusted measured the trust signals: they read not measured (null), never 0.
    expect(binder.trust.integrityIndex).toBeNull();
    expect(binder.trust.correlationRatio).toBeNull();
    expect(binder.trust.evidenceCoverage).toBeNull();
    expect(binder.sections.maturity.status).toBe("INSUFFICIENT_EVIDENCE");
    // No trusted run counted the unknown questions: every question stays unknown, never a measured 0.
    expect(binder.sections.maturity.unknownQuestionsCount).toBe(questionBank.length);
  });
});

describe("WP37 sealed assurance reads", () => {
  function assuranceReport(id: string, ts: number, score: number, extra: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      assuranceRunId: id, agentId: "agent-x", ts, mode: "sandbox", windowStartTs: ts - 1000, windowEndTs: ts, trustTier: "OBSERVED",
      status: "VALID", verificationPassed: true, overallScore0to100: score, integrityIndex: 0.8, trustLabel: "HIGH",
      packResults: [{ packId: "injection", title: "Injection", scenarioCount: 1, passCount: 1, failCount: 0, score0to100: score, trustTier: "OBSERVED",
        scenarioResults: [{ scenarioId: "s1", title: "s1", category: "injection", pass: true, score0to100: score, reasons: [], prompt: "p", response: "r",
          auditEventTypes: [], evidenceEventIds: [], correlatedRequestIds: [] }] }],
      ...extra
    };
  }
  const reportsDir = (ws: string) => join(getAgentPaths(ws, "agent-x").reportsDir, "assurance");

  test("latestAssuranceByPack refuses a newest report whose pack results were edited after sealing", () => {
    const ws = workspace();
    writeSealedReport(ws, reportsDir(ws), "a1", assuranceReport("a1", 1000, 40));
    const edited = writeSealedReport(ws, reportsDir(ws), "a2", assuranceReport("a2", 2000, 45));
    tamperReport(edited, (report) => {
      (report.packResults as Array<{ score0to100: number }>)[0]!.score0to100 = 100;
    });

    const window = { workspace: ws, agentId: "agent-x", windowStartTs: 0, windowEndTs: 5000 };
    // It used to fall back to a1's 40; a refused newest report now blocks instead (security sweep 2026-10-31).
    expect(() => latestAssuranceByPack(window)).toThrow(/INSUFFICIENT_EVIDENCE: assurance report\(s\) a2\.json/);
    expect(scanVerifiedAssuranceByPack(window).unverifiedReports).toEqual([edited]);
  });

  test("the Studio/API projection agrees with the runner on an insufficient-evidence report", () => {
    const ws = workspace();
    // The API reads the default agent's reports.
    writeSealedReport(ws, join(getAgentPaths(ws, "default").reportsDir, "assurance"), "a1",
      assuranceReport("a1", 1000, 0, { agentId: "default", evidenceStatus: "INSUFFICIENT_EVIDENCE" }));

    const detail = assuranceRunDetailForApi({ workspace: ws, runId: "a1" });
    expect(detail.run).not.toBeNull();
    // The runner persists null correlation and 0 observed share for gates it never measured; the projection used to claim 1/1.
    expect(detail.run?.evidenceGates.correlationRatio).toBeNull(); // not measured, never a measured 0
    expect(detail.run?.evidenceGates.observedShare).toBe(0);
    expect(detail.run?.score.status).toBe("INSUFFICIENT_EVIDENCE");
    expect(detail.run?.score.pass).toBe(false);
  });

  test("latestAssuranceCertificateSummary returns nothing for a certificate that fails verification", () => {
    const ws = workspace();
    const file = assuranceLatestCertificatePath(ws);
    ensureDir(dirname(file));
    writeFileAtomic(file, "not a real certificate", 0o644);
    const cert = {
      v: 1, certId: "c1", issuedTs: 1, scope: { type: "AGENT", idHash: "abcdef12" }, runId: "a1", status: "PASS", riskAssuranceScore: 100,
      findingCounts: { critical: 0, high: 0, medium: 0, low: 0, info: 0 }, gates: { integrityIndex: 1, correlationRatio: 1, observedShare: 1 },
      bindings: { assurancePolicySha256: "0".repeat(64), cgxPackSha256: "0".repeat(64), promptPolicySha256: "0".repeat(64), trustMode: "LOCAL_VAULT" },
      proofBindings: { transparencyRootSha256: "0".repeat(64), merkleRootSha256: "0".repeat(64), includedEventProofIds: [] }
    };
    certStub.result = { ok: false, fileSha256: "0".repeat(64), cert, errors: ["certificate signature verification failed"], report: null };

    expect(inspectLatestAssuranceCertificate(ws)?.verify.ok).toBe(false);
    expect(latestAssuranceCertificateSummary(ws)).toBeNull();

    certStub.result = { ...certStub.result, ok: true, errors: [] };
    expect(latestAssuranceCertificateSummary(ws)?.cert.status).toBe("PASS");
  });
});
