import { spawnSync } from "node:child_process";
import { verify } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import { initWorkspace } from "../../src/workspace.js";
import type { DiagnosticReport } from "../../src/types.js";
import { questionBank } from "../../src/diagnostic/questionBank.js";
import { initBenchPolicy } from "../../src/bench/benchPolicyStore.js";
import { createBenchArtifact } from "../../src/bench/benchArtifact.js";
import { verifyBenchArtifactFile } from "../../src/bench/benchVerifier.js";
import { createBackup, verifyBackup } from "../../src/ops/backup/backupEngine.js";
import { buildPromptPackForApi } from "../../src/prompt/promptPackApi.js";
import { promptLatestPackPath } from "../../src/prompt/promptPolicyStore.js";
import { verifyPromptPackFile } from "../../src/prompt/promptPackVerifier.js";
import { createAuditBinderArtifact } from "../../src/audit/binderArtifact.js";
import { verifyAuditBinderFile } from "../../src/audit/binderVerifier.js";
import { runAssurance } from "../../src/assurance/assuranceRunner.js";
import { initAssurancePolicy, loadAssurancePolicy, saveAssurancePolicy } from "../../src/assurance/assurancePolicyStore.js";
import { issueAssuranceCertificate } from "../../src/assurance/assuranceCertificates.js";
import { verifyAssuranceCertificateFile } from "../../src/assurance/assuranceVerifier.js";
import { appendTransparencyEntry } from "../../src/transparency/logChain.js";
import { extractValidatedTarGzipArchive } from "../../src/security/safeTarArchive.js";
import type { SignatureEnvelope } from "../../src/crypto/signing/signerTypes.js";
import type { VerifierReportV1 } from "../../src/trust/index.js";
import { sha256Hex } from "../../src/utils/hash.js";
import { lockVault } from "../../src/vault/vault.js";
import { startFakeAgentServer, useFakeAgentEnv } from "../helpers/fakeAgentServer.js";
import { workspaceKeyPem, workspaceKeyTrust } from "../helpers/trustContext.js";

const roots: string[] = [];
const PASS = "synthetic-envelope-backup-passphrase";
afterEach(() => { vi.unstubAllEnvs(); for (const root of roots.splice(0)) { lockVault(root); rmSync(root, { recursive: true, force: true }); } });
// Existing publicBenchmarkRegistry fixture declarations, used only to satisfy the real producer's four-run/two-day export gate.
function seedBenchRun(workspacePath: string, runId: string, tsOffsetDays = 0): void {
  const ts = Date.now() - tsOffsetDays * 86_400_000;
  const report: DiagnosticReport = {
    agentId: "default",
    runId,
    ts,
    windowStartTs: ts - 86_400_000,
    windowEndTs: ts,
    status: "VALID",
    verificationPassed: true,
    trustBoundaryViolated: false,
    trustBoundaryMessage: null,
    integrityIndex: 0.96,
    trustLabel: "HIGH TRUST",
    targetProfileId: "default",
    layerScores: [
      { layerName: "Strategic Agent Operations", avgFinalLevel: 4.8, confidenceWeightedFinalLevel: 4.8 },
      { layerName: "Leadership & Autonomy", avgFinalLevel: 4.7, confidenceWeightedFinalLevel: 4.7 },
      { layerName: "Culture & Alignment", avgFinalLevel: 4.6, confidenceWeightedFinalLevel: 4.6 },
      { layerName: "Resilience", avgFinalLevel: 4.7, confidenceWeightedFinalLevel: 4.7 },
      { layerName: "Skills", avgFinalLevel: 4.8, confidenceWeightedFinalLevel: 4.8 }
    ],
    questionScores: questionBank.map((question) => ({
      questionId: question.id,
      claimedLevel: 5,
      supportedMaxLevel: 5,
      finalLevel: 5,
      confidence: 0.95,
      evidenceEventIds: ["ev1", "ev2"],
      flags: [],
      narrative: "fixture"
    })),
    inflationAttempts: [],
    unsupportedClaimCount: 0,
    contradictionCount: 0,
    correlationRatio: 0.97,
    invalidReceiptsCount: 0,
    correlationWarnings: [],
    evidenceCoverage: 0.9,
    evidenceTrustCoverage: { observed: 0.9, attested: 0.1, selfReported: 0 },
    targetDiff: [],
    prioritizedUpgradeActions: [],
    evidenceToCollectNext: [],
    runSealSig: "sig",
    reportJsonSha256: "hash"
  };
  const runDir = join(workspacePath, ".amc", "agents", "default", "runs");
  mkdirSync(runDir, { recursive: true });
  writeFileSync(join(runDir, `${runId}.json`), JSON.stringify(report, null, 2));
}
interface Outcome { ok: boolean; errors: readonly unknown[]; report: VerifierReportV1 }
type Family = "bench" | "backup" | "prompt" | "binder" | "assurance";
async function fixture(family: Family): Promise<{ workspace: string; source: string; directory: string; publicKeyPem: string; check(file: string): Outcome }> {
  const workspace = mkdtempSync(join(tmpdir(), "amc-envelope-forwarding-")); roots.push(workspace);
  initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
  // Record the operator's key/pins before reading or creating the artifact. These are owned temporary vault keys.
  const publicKeyPem = workspaceKeyPem(workspace, "auditor"); const trust = workspaceKeyTrust(workspace);
  // This exact kind is allowed by benchCollector.determineIncludedEventKinds. ORG_SCORECARD would produce no bench proof.
  appendTransparencyEntry({ workspace, type: "ORG_SCORECARD_UPDATED", agentId: "default",
    artifact: { kind: "policy", sha256: sha256Hex("synthetic proof-bearing event"), id: "synthetic" } });
  if (family === "bench") {
    initBenchPolicy(workspace);
    for (const [index, days] of [7, 6, 5, 4].entries()) seedBenchRun(workspace, `synthetic-${index}`, days);
    const source = createBenchArtifact({ workspace, scope: "workspace", outFile: "forwarding.amcbench", windowDays: 30 }).outFile;
    return { workspace, source, directory: "amc-bench", publicKeyPem, check: file => verifyBenchArtifactFile({ file, trust }) };
  }
  if (family === "backup") {
    vi.stubEnv("AMC_BACKUP_PASSPHRASE", PASS);
    const source = createBackup({ workspace, outFile: "forwarding.amcbackup" }).outFile;
    return { workspace, source, directory: "", publicKeyPem, check: file => verifyBackup({ backupFile: file, passphrase: PASS, trust }) };
  }
  if (family === "prompt") {
    buildPromptPackForApi({ workspace, agentId: "default" });
    return { workspace, source: promptLatestPackPath(workspace, "default"), directory: "amc-prompt", publicKeyPem,
      check: file => verifyPromptPackFile({ file, trust }) };
  }
  if (family === "binder") {
    const source = (await createAuditBinderArtifact({ workspace, scopeType: "WORKSPACE", scopeId: "workspace", outFile: "forwarding.amcaudit" })).outFile;
    return { workspace, source, directory: "amc-audit", publicKeyPem, check: file => verifyAuditBinderFile({ file, workspace, trust }) };
  }
  // Reuse tests/trust/embeddedKeyForgery.test.ts's real issuer fixture: a local fake endpoint, actual assurance run,
  // and signed zero evidence gates. This establishes certificate crypto, not a positive assurance/satisfaction claim.
  const agent = await startFakeAgentServer(); const restoreEnv = useFakeAgentEnv(agent.baseUrl);
  try {
    const run = await runAssurance({ workspace, agentId: "default", mode: "supervise", window: "14d", packId: "injection", noSign: true });
    initAssurancePolicy(workspace); const policy = loadAssurancePolicy(workspace);
    policy.assurancePolicy.gates = { ...policy.assurancePolicy.gates, minIntegrityIndex: 0, minCorrelationRatio: 0, minObservedShare: 0 };
    saveAssurancePolicy(workspace, policy);
    const source = (await issueAssuranceCertificate({ workspace, runId: run.assuranceRunId, outFile: "forwarding.amccert" })).outFile;
    return { workspace, source, directory: "amc-cert", publicKeyPem, check: file => verifyAssuranceCertificateFile({ file, trust }) };
  } finally { restoreEnv(); await agent.close(); }
}
const cases = [
  { name: "bench outer", family: "bench", path: "bench.sig", mode: "fingerprint", error: "bench signature verification failed" },
  { name: "bench signed proof root fingerprint", family: "bench", path: "proofs/merkle.root.sig", mode: "fingerprint", error: "signed merkle root signature invalid" },
  { name: "bench signed proof root duplicate signature", family: "bench", path: "proofs/merkle.root.sig", mode: "duplicate", error: "signed merkle root signature invalid" },
  { name: "backup manifest", family: "backup", path: "manifest.sig", mode: "fingerprint", error: "manifest signature invalid" },
  { name: "prompt outer", family: "prompt", path: "pack.sig", mode: "fingerprint", error: "pack signature verification failed" },
  { name: "prompt lint", family: "prompt", path: "lint/lint.sig", mode: "fingerprint", error: "lint signature verification failed" },
  { name: "binder outer", family: "binder", path: "binder.sig", mode: "fingerprint", error: "binder signature verification failed" },
  { name: "assurance outer", family: "assurance", path: "cert.sig", mode: "fingerprint", error: "certificate signature verification failed" }
] as const;

test.each(cases)("$name forwards the actual artifact envelope; removing that argument must resurrect a false accept", async target => {
  const made = await fixture(target.family);
  const baseline = made.check(made.source); expect(baseline.ok, JSON.stringify(baseline)).toBe(true);
  expect(baseline.report.integrity.status).toBe("pass");
  const unpack = join(made.workspace, "unpacked"); mkdirSync(unpack);
  extractValidatedTarGzipArchive({ file: made.source, destination: unpack, label: "owned envelope mutation artifact",
    limits: { maxEntries: 10_000, maxCompressedBytes: 128 * 1024 * 1024, maxEntryBytes: 128 * 1024 * 1024,
      maxTotalBytes: 512 * 1024 * 1024, maxPathBytes: 1024 } });
  const root = join(unpack, made.directory); const path = join(root, target.path);
  const original = JSON.parse(readFileSync(path, "utf8")) as { digestSha256: string; signature: string; envelope?: SignatureEnvelope };
  expect(original.envelope?.alg).toBe("ed25519");
  expect(verify(null, Buffer.from(original.digestSha256, "hex"), made.publicKeyPem, Buffer.from(original.signature, "base64"))).toBe(true);
  if (target.path.startsWith("proofs/")) {
    expect(readdirSync(join(root, "proofs", "inclusion")).filter(name => name.endsWith(".json")).length).toBeGreaterThan(0);
    expect(baseline.report.anchoring.status).toBe("anchored");
  }
  function pack(label: string, value: unknown): string {
    writeFileSync(path, JSON.stringify(value, null, 2));
    const output = join(made.workspace, `${label}.tgz`);
    const result = spawnSync("tar", ["-czf", output, "-C", unpack, "."], { encoding: "utf8" });
    expect(result.status, `${result.stdout ?? ""}${result.stderr ?? ""}`).toBe(0);
    // Keep prompt's public checksum flow meaningful; this is the archive hash, not a signature preimage.
    if (target.family === "prompt") writeFileSync(`${output}.sha256`, `${sha256Hex(readFileSync(output))}\n`);
    return output;
  }
  const envelope = target.mode === "fingerprint" ? { ...original.envelope!, fingerprint: "0".repeat(64) }
    : { ...original.envelope!, sigB64: Buffer.alloc(64, 1).toString("base64") };
  expect(original.envelope!.fingerprint).not.toBe("0".repeat(64));
  const bad = made.check(pack("bad-envelope", { ...original, envelope }));
  expect(bad.ok, JSON.stringify(bad)).toBe(false); expect(bad.report.integrity.status).toBe("fail");
  expect(bad.report.integrity.errors.some(error => error.includes(target.error)), JSON.stringify(bad)).toBe(true);
  expect(bad.report.integrity.errors.filter(error => !error.includes(target.error))).toEqual([]);
  // The same original signature still works, and the artifact's payload/proof/root bytes were never edited.
  expect(verify(null, Buffer.from(original.digestSha256, "hex"), made.publicKeyPem, Buffer.from(original.signature, "base64"))).toBe(true);
  const { envelope: _absent, ...legacy } = original;
  const old = made.check(pack("legacy-without-envelope", legacy));
  expect(old.ok, JSON.stringify(old)).toBe(true); expect(old.report.integrity.status).toBe("pass");
  if (target.path.startsWith("proofs/")) expect(old.report.anchoring.status).toBe("anchored");
}, 180_000);
