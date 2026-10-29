import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { writeEnforceResourceManifest } from "../src/enforce/resourceManifest.js";
import { listExperiments } from "../src/experiments/experimentRunner.js";
import { signArtifactFile } from "../src/lifecycle/artifactSignature.js";
import {
  listGovernedOptimizerRuns,
  loadGovernedOptimizerRun,
  writeGovernedOptimizerRun,
  type GovernedOptimizerRun
} from "../src/experiments/governedOptimizer.js";
import { buildHoldoutPartition } from "../src/experiments/holdoutPartition.js";
import { writeEpisodeRecord } from "../src/lifecycle/episodeRecord.js";
import { writeFixerRcaReport, type FixerRcaReport } from "../src/mechanic/fixerRca.js";
import type { DiagnosticReport } from "../src/types.js";
import { initWorkspace } from "../src/workspace.js";

const roots: string[] = [];
const originalVaultPassphrase = process.env.AMC_VAULT_PASSPHRASE;

function workspace(): string {
  const dir = mkdtempSync(join(tmpdir(), "amc-governed-optimizer-"));
  roots.push(dir);
  return dir;
}

/** Two cases per failure class, so each class can hold one case out (seeded, stratified partition). */
function diagnosticReport(runId = "trace-run-opt-1", questions = 4): DiagnosticReport {
  const questionScores = [
    {
      questionId: "AMC-1.1",
      claimedLevel: 4,
      supportedMaxLevel: 1,
      finalLevel: 1,
      confidence: 0.6,
      evidenceEventIds: ["trace-hallucinated"],
      flags: ["unsupported claim"],
      narrative: "Unsupported claim with no source citation.",
    },
    {
      questionId: "AMC-1.2",
      claimedLevel: 4,
      supportedMaxLevel: 2,
      finalLevel: 2,
      confidence: 0.7,
      evidenceEventIds: ["trace-schema"],
      flags: ["invalid json schema"],
      narrative: "Malformed JSON response missing required field.",
    },
    {
      questionId: "AMC-1.3",
      claimedLevel: 4,
      supportedMaxLevel: 2,
      finalLevel: 2,
      confidence: 0.7,
      evidenceEventIds: ["trace-fabricated"],
      flags: ["fabricated citation"],
      narrative: "Cited a fabricated source.",
    },
    {
      questionId: "AMC-1.4",
      claimedLevel: 4,
      supportedMaxLevel: 2,
      finalLevel: 2,
      confidence: 0.6,
      evidenceEventIds: ["trace-malformed"],
      flags: ["malformed response missing field"],
      narrative: "Response JSON could not be parsed.",
    },
  ].slice(0, questions);
  return {
    agentId: "default",
    runId,
    ts: Date.UTC(2026, 4, 22, 12, 0, 0),
    windowStartTs: Date.UTC(2026, 4, 22, 11, 55, 0),
    windowEndTs: Date.UTC(2026, 4, 22, 12, 0, 0),
    status: "VALID",
    verificationPassed: true,
    trustBoundaryViolated: false,
    trustBoundaryMessage: null,
    integrityIndex: 0.63,
    trustLabel: "DEVELOPING — some evidence, needs more coverage",
    targetProfileId: null,
    layerScores: [{ layerName: "Resilience", avgFinalLevel: 2, confidenceWeightedFinalLevel: 2 }],
    questionScores,
    inflationAttempts: [],
    unsupportedClaimCount: 1,
    contradictionCount: 0,
    correlationRatio: 1,
    invalidReceiptsCount: 0,
    correlationWarnings: [],
    evidenceCoverage: 0.5,
    evidenceTrustCoverage: { observed: 1, attested: 0, selfReported: 0 },
    targetDiff: [],
    prioritizedUpgradeActions: ["Fix unsupported claim handling."],
    evidenceToCollectNext: ["Capture redacted trace snippets."],
    runSealSig: "sig",
    reportJsonSha256: "sha",
  };
}

function writeMutableManifest(ws: string): string {
  process.env.AMC_VAULT_PASSPHRASE = "amc-governed-optimizer-test-passphrase";
  initWorkspace({ workspacePath: ws, trustBoundaryMode: "isolated" });
  const resourcePath = join(ws, ".amc", "prompt-addendum.md");
  writeFileSync(resourcePath, "Always cite evidence.\n");
  writeEnforceResourceManifest({ workspace: ws, agentId: "default" });
  return resourcePath;
}

function writeRca(ws: string, runId: string, questions = 4): { report: FixerRcaReport; path: string } {
  writeEpisodeRecord({
    workspace: ws,
    report: diagnosticReport(runId, questions),
    source: "cli",
    command: "amc",
  });
  return writeFixerRcaReport({ workspace: ws, agentId: "default", selector: runId });
}

afterEach(() => {
  while (roots.length > 0) {
    const dir = roots.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
  if (originalVaultPassphrase === undefined) {
    delete process.env.AMC_VAULT_PASSPHRASE;
  } else {
    process.env.AMC_VAULT_PASSPHRASE = originalVaultPassphrase;
  }
});

describe("governed optimizer", () => {
  test("creates isolated candidates, held-out splits, Pareto ranking, and receipts without mutating live resources", () => {
    const ws = workspace();
    const resourcePath = writeMutableManifest(ws);
    const before = readFileSync(resourcePath, "utf8");
    const rca = writeRca(ws, "trace-run-opt-success");

    const written = writeGovernedOptimizerRun({
      workspace: ws,
      agentId: "default",
      rcaSelector: rca.report.reportId
    });

    expect(existsSync(written.path)).toBe(true);
    expect(written.signaturePath).toBeTruthy();
    expect(readFileSync(resourcePath, "utf8")).toBe(before);
    expect(written.run.candidateCount).toBeGreaterThanOrEqual(2);
    expect(written.run.validationReceipt.status).toBe("passed");
    expect(written.run.acceptedCandidateId).toBeTruthy();
    expect(written.run.receipts).toHaveLength(written.run.candidateCount);

    for (const candidate of written.run.candidates) {
      expect(existsSync(candidate.candidateWorkspace)).toBe(true);
      expect(existsSync(join(candidate.candidateWorkspace, "candidate.json"))).toBe(true);
      expect(candidate.liveResourceMutated).toBe(false);
      expect(candidate.split.validationTestIds.length).toBeGreaterThan(0);
      expect(candidate.split.searchTestIds.some((id) => candidate.split.validationTestIds.includes(id))).toBe(false);
      expect(candidate.leakageChecks.every((check) => check.status === "passed")).toBe(true);
      expect(Number.isFinite(candidate.metrics.scoreGain)).toBe(true);
      expect(Number.isFinite(candidate.metrics.risk)).toBe(true);
      expect(Number.isFinite(candidate.metrics.cost)).toBe(true);
      expect(Number.isFinite(candidate.metrics.latencyMs)).toBe(true);
      expect(Number.isFinite(candidate.metrics.confidence)).toBe(true);
      expect(Number.isFinite(candidate.metrics.regressionImpact)).toBe(true);
      expect(candidate.receiptId).toBeTruthy();
      expect(candidate.decisionReason.length).toBeGreaterThan(0);
    }

    const accepted = written.run.candidates.find((candidate) => candidate.candidateId === written.run.acceptedCandidateId);
    expect(accepted?.decision).toBe("accepted");
    expect(accepted?.paretoFront).toBe(true);
    expect(accepted?.rank).toBe(1);

    const listed = listGovernedOptimizerRuns({ workspace: ws, agentId: "default", redacted: true });
    expect(listed.problems).toEqual([]);
    expect(listed.runs).toHaveLength(1);
    expect(listed.runs[0]!.workspace).toBe("$WORKSPACE");

    const loaded = loadGovernedOptimizerRun({ workspace: ws, agentId: "default", selector: "latest" });
    expect(loaded.optimizerRunId).toBe(written.run.optimizerRunId);
  });

  test("rejects candidates when held-out validation cannot be created", () => {
    const ws = workspace();
    writeMutableManifest(ws);
    const rca = writeRca(ws, "trace-run-opt-one-test", 1);

    const written = writeGovernedOptimizerRun({
      workspace: ws,
      agentId: "default",
      rcaSelector: rca.report.reportId
    });

    expect(written.run.acceptedCandidateId).toBeNull();
    expect(written.run.validationReceipt.status).toBe("blocked");
    expect(written.run.candidates).toHaveLength(1);
    expect(written.run.candidates[0]!.decision).toBe("rejected");
    expect(written.run.candidates[0]!.leakageChecks.some((check) => check.id === "heldout-validation-present" && check.status === "blocked")).toBe(true);
  });

  test("blocks leakage when candidate source references held-out validation cases", () => {
    const ws = workspace();
    writeMutableManifest(ws);
    const rca = writeRca(ws, "trace-run-opt-leak");
    const heldOutId = buildHoldoutPartition({
      population: rca.report.regressionTests.map((test) => ({ id: test.testId, stratum: test.failureClass }))
    }).strata.flatMap((row) => row.validationIds)[0]!;
    const tampered: FixerRcaReport = {
      ...rca.report,
      proposals: rca.report.proposals.map((proposal, index) =>
        index === 0
          ? {
              ...proposal,
              patchSummary: `${proposal.patchSummary} validation ${heldOutId}`
            }
          : proposal
      )
    };
    writeFileSync(rca.path, `${JSON.stringify(tampered, null, 2)}\n`);

    const written = writeGovernedOptimizerRun({
      workspace: ws,
      agentId: "default",
      rcaSelector: rca.report.reportId
    });

    const leakedCandidate = written.run.candidates.find((candidate) => candidate.sourceProposalId === rca.report.proposals[0]!.proposalId);
    expect(leakedCandidate?.decision).toBe("rejected");
    expect(leakedCandidate?.leakageChecks.some((check) => check.id === "heldout-not-in-candidate-source" && check.status === "blocked")).toBe(true);
    expect(written.run.receipts.find((receipt) => receipt.candidateId === leakedCandidate?.candidateId)?.reason).toContain("held-out");
  });

  test("optimizer runs never appear as experiments, and amc experiment list still works after optimize", () => {
    const ws = workspace();
    writeMutableManifest(ws);
    const rca = writeRca(ws, "trace-run-opt-namespace");
    writeGovernedOptimizerRun({ workspace: ws, agentId: "default", rcaSelector: rca.report.reportId });
    expect(listExperiments({ workspace: ws, agentId: "default" })).toEqual([]);
  });

  test("metrics are labelled estimates, the receipt is structural, and nothing claims held-out execution", () => {
    const ws = workspace();
    writeMutableManifest(ws);
    const rca = writeRca(ws, "trace-run-opt-estimates");
    const written = writeGovernedOptimizerRun({ workspace: ws, agentId: "default", rcaSelector: rca.report.reportId });
    expect(written.run.schemaVersion).toBe("2026-10-30");
    expect(written.run.validationReceipt).toMatchObject({ validationKind: "structural", executedValidationRefs: [] });
    for (const candidate of written.run.candidates) {
      expect(candidate).toMatchObject({ metricSource: "estimated", evaluationState: "not-run", observedMetrics: null });
      expect(candidate.decisionReason).not.toMatch(/after held-out validation/);
    }
    const accepted = written.run.candidates.find((candidate) => candidate.decision === "accepted");
    expect(accepted?.decisionReason).toMatch(/estimated metrics/);
    const loaded = loadGovernedOptimizerRun({ workspace: ws, agentId: "default", selector: "latest", redacted: true });
    expect(loaded.candidates.every((candidate) => candidate.metricSource === "estimated" && candidate.observedMetrics === null)).toBe(true);
  });

  test("a signed record whose candidate claims measured evaluation is refused", () => {
    const ws = workspace();
    writeMutableManifest(ws);
    const rca = writeRca(ws, "trace-run-opt-measured");
    const written = writeGovernedOptimizerRun({ workspace: ws, agentId: "default", rcaSelector: rca.report.reportId });
    const forged = { ...written.run, candidates: written.run.candidates.map((candidate) => ({ ...candidate, evaluationState: "measured" })) };
    writeFileSync(written.path, `${JSON.stringify(forged, null, 2)}\n`);
    signArtifactFile({ workspace: ws, path: written.path, artifactKind: "governed-optimizer-run" });
    expect(() => loadGovernedOptimizerRun({ workspace: ws, agentId: "default", selector: written.run.optimizerRunId }))
      .toThrow(/measured evaluation without executed trial receipts/);
    expect(listGovernedOptimizerRuns({ workspace: ws, agentId: "default" }).runs).toEqual([]);
  });

  test("a legacy 2026-05-22 record reads as estimated and not run, without rewriting its signed bytes", () => {
    const ws = workspace();
    writeMutableManifest(ws);
    const rca = writeRca(ws, "trace-run-opt-legacy");
    const written = writeGovernedOptimizerRun({ workspace: ws, agentId: "default", rcaSelector: rca.report.reportId });
    const legacy = {
      ...written.run,
      schemaVersion: "2026-05-22",
      candidates: written.run.candidates.map(({ metricSource: _s, evaluationState: _e, observedMetrics: _o, ...candidate }) => candidate),
      validationReceipt: (({ validationKind: _k, executedValidationRefs: _r, ...receipt }) => receipt)(written.run.validationReceipt)
    };
    writeFileSync(written.path, `${JSON.stringify(legacy, null, 2)}\n`);
    signArtifactFile({ workspace: ws, path: written.path, artifactKind: "governed-optimizer-run" });
    const bytes = readFileSync(written.path);
    const loaded = loadGovernedOptimizerRun({ workspace: ws, agentId: "default", selector: "latest" });
    expect(loaded.schemaVersion).toBe("2026-05-22");
    expect(loaded.candidates.every((candidate) => candidate.metricSource === "estimated" && candidate.evaluationState === "not-run")).toBe(true);
    expect(loaded.validationReceipt.validationKind).toBe("structural");
    expect(readFileSync(written.path).equals(bytes)).toBe(true);
  });

  test("a selector shared by two runs is ambiguous, and a run ID still resolves exactly", () => {
    const ws = workspace();
    writeMutableManifest(ws);
    const rca = writeRca(ws, "trace-run-opt-ambiguous");
    const first = writeGovernedOptimizerRun({ workspace: ws, agentId: "default", rcaSelector: rca.report.reportId });
    const second = writeGovernedOptimizerRun({ workspace: ws, agentId: "default", rcaSelector: rca.report.reportId });
    expect(() => loadGovernedOptimizerRun({ workspace: ws, agentId: "default", selector: rca.report.reportId })).toThrow(/ambiguous/);
    expect(loadGovernedOptimizerRun({ workspace: ws, agentId: "default", selector: first.run.optimizerRunId }).optimizerRunId)
      .toBe(first.run.optimizerRunId);
    expect(loadGovernedOptimizerRun({ workspace: ws, agentId: "default", selector: "latest" }).optimizerRunId).toBe(second.run.optimizerRunId);
    expect(() => loadGovernedOptimizerRun({ workspace: ws, agentId: "default", selector: "../../../etc" })).toThrow(/not found/);
  });

  test("a corrupt or tampered newest run makes latest refuse instead of returning an older run", () => {
    const ws = workspace();
    writeMutableManifest(ws);
    const rca = writeRca(ws, "trace-run-opt-corrupt");
    const older = writeGovernedOptimizerRun({ workspace: ws, agentId: "default", rcaSelector: rca.report.reportId });
    const newer = writeGovernedOptimizerRun({ workspace: ws, agentId: "default", rcaSelector: rca.report.reportId });
    writeFileSync(newer.path, "{ partial");
    expect(() => loadGovernedOptimizerRun({ workspace: ws, agentId: "default", selector: "latest" })).toThrow(/unreadable/);
    const listed = listGovernedOptimizerRuns({ workspace: ws, agentId: "default" });
    expect(listed.runs.map((run) => run.optimizerRunId)).toEqual([older.run.optimizerRunId]);
    expect(listed.problems).toEqual([{ optimizerRunId: newer.run.optimizerRunId, reason: "digest mismatch" }]);

    // A well-formed but edited record fails its signature the same way.
    const edited = { ...newer.run, acceptedCandidateId: "optcand_forged" };
    writeFileSync(newer.path, `${JSON.stringify(edited, null, 2)}\n`);
    expect(() => loadGovernedOptimizerRun({ workspace: ws, agentId: "default", selector: "latest" })).toThrow(/digest mismatch/);
    expect(() => loadGovernedOptimizerRun({ workspace: ws, agentId: "default", selector: "optcand_forged" })).toThrow(/unreadable run/);
  });

  test("keeps the baseline instead of forcing a winner when no candidate gains or the top candidates tie", () => {
    const ws = workspace();
    writeMutableManifest(ws);
    const rca = writeRca(ws, "trace-run-opt-no-gain");
    writeFileSync(rca.path, `${JSON.stringify({ ...rca.report, proposals: rca.report.proposals.map((proposal) => ({ ...proposal, expectedScoreImpact: 0 })) }, null, 2)}\n`);
    const flat = writeGovernedOptimizerRun({ workspace: ws, agentId: "default", rcaSelector: rca.report.reportId });
    expect(flat.run.acceptedCandidateId).toBeNull();
    expect(flat.run.selection).toBe("baseline");
    expect(flat.run.validationReceipt.status).toBe("passed");
    expect(flat.run.candidates.every((candidate) => candidate.decision === "rejected")).toBe(true);
    expect(flat.run.candidates.some((candidate) => candidate.decisionReason.startsWith("Baseline retained"))).toBe(true);

    const twin = rca.report.proposals[0]!;
    writeFileSync(rca.path, `${JSON.stringify({ ...rca.report, proposals: [twin, { ...twin, proposalId: `${twin.proposalId}-twin` }] }, null, 2)}\n`);
    const tied = writeGovernedOptimizerRun({ workspace: ws, agentId: "default", rcaSelector: rca.report.reportId });
    expect(tied.run.candidates.every((candidate) => candidate.leakageChecks.every((check) => check.status === "passed"))).toBe(true);
    expect(tied.run.selection).toBe("baseline");
    expect(tied.run.candidates.some((candidate) => candidate.decisionReason.includes("tie"))).toBe(true);
  });

  test("H2X-04: each proposal's held-out validation is unseen cases of its own failure class, from a reproducible partition", () => {
    const ws = workspace();
    writeMutableManifest(ws);
    const rca = writeRca(ws, "trace-run-opt-stratified");
    const first = writeGovernedOptimizerRun({ workspace: ws, agentId: "default", rcaSelector: rca.report.reportId });
    const second = writeGovernedOptimizerRun({ workspace: ws, agentId: "default", rcaSelector: rca.report.reportId });
    expect(first.run.partition?.digest).toMatch(/^[a-f0-9]{64}$/);
    expect(second.run.partition?.digest).toBe(first.run.partition?.digest);
    expect(writeGovernedOptimizerRun({ workspace: ws, agentId: "default", rcaSelector: rca.report.reportId, partitionSeed: "7" }).run.partition?.seed).toBe("7");
    const classOf = new Map(rca.report.regressionTests.map((test) => [test.testId, test.failureClass]));
    const causeClass = new Map(rca.report.rootCauses.map((cause) => [cause.rootCauseId, cause.failureClass]));
    for (const candidate of first.run.candidates) {
      const proposal = rca.report.proposals.find((row) => row.proposalId === candidate.sourceProposalId)!;
      const own = causeClass.get(proposal.rootCauseId);
      expect(candidate.split.validationTestIds.length).toBeGreaterThan(0);
      expect(candidate.split.validationTestIds.every((id) => classOf.get(id) === own)).toBe(true);
      expect(candidate.split.searchTestIds.every((id) => classOf.get(id) === own)).toBe(true);
      expect(candidate.split.searchTestIds.some((id) => candidate.split.validationTestIds.includes(id))).toBe(false);
    }
    expect(first.run.validationReceipt.status).toBe("passed");
  });

  test("H2-22/H2-23: held-out IDs and canaries never reach the proposer-visible candidate workspace", () => {
    const ws = workspace();
    writeMutableManifest(ws);
    const runId = "trace-run-opt-canary";
    const report = diagnosticReport(runId);
    report.questionScores = report.questionScores.map((question) => ({ ...question, narrative: `${question.narrative} canary-${question.evidenceEventIds[0]}` }));
    writeEpisodeRecord({ workspace: ws, report, source: "cli", command: "amc" });
    const rca = writeFixerRcaReport({ workspace: ws, agentId: "default", selector: runId });
    const { run } = writeGovernedOptimizerRun({ workspace: ws, agentId: "default", rcaSelector: rca.report.reportId });
    const heldOut = new Set(run.partition!.strata.flatMap((row) => row.validationIds));
    const heldOutRefs = rca.report.regressionTests.filter((test) => heldOut.has(test.testId)).map((test) => test.inputRef);
    const searchRefs = rca.report.regressionTests.filter((test) => !heldOut.has(test.testId)).map((test) => test.inputRef);
    expect(heldOutRefs.length).toBe(2);
    for (const candidate of run.candidates) {
      const files = ["candidate.json", "evidence.json", "README.md"].map((name) => readFileSync(join(candidate.candidateWorkspace, name), "utf8")).join("\n");
      for (const id of heldOut) expect(files).not.toContain(id);
      for (const ref of heldOutRefs) expect(files).not.toContain(`canary-${ref}`);
      expect(searchRefs.some((ref) => files.includes(`canary-${ref}`))).toBe(true);
      const evidence = JSON.parse(readFileSync(join(candidate.candidateWorkspace, "evidence.json"), "utf8"));
      expect(evidence).toMatchObject({ split: "search", observationCapChars: 10_000 });
      expect(evidence.trajectories.every((row: { testId: string }) => candidate.split.searchTestIds.includes(row.testId))).toBe(true);
    }
    // The operator-owned run record keeps the held-out split.
    expect(run.candidates.every((candidate) => candidate.split.validationTestIds.every((id) => heldOut.has(id)))).toBe(true);
  });

  test("a re-signed record whose partition or split was edited is refused", () => {
    const ws = workspace();
    writeMutableManifest(ws);
    const rca = writeRca(ws, "trace-run-opt-partition-edit");
    const written = writeGovernedOptimizerRun({ workspace: ws, agentId: "default", rcaSelector: rca.report.reportId });
    const resign = (record: unknown) => {
      writeFileSync(written.path, `${JSON.stringify(record, null, 2)}\n`);
      signArtifactFile({ workspace: ws, path: written.path, artifactKind: "governed-optimizer-run" });
    };
    const partition = written.run.partition!;
    resign({ ...written.run, partition: { ...partition, strata: partition.strata.map((row) => ({ ...row, searchIds: [...row.searchIds, ...row.validationIds].sort(), validationIds: [] })) } });
    expect(() => loadGovernedOptimizerRun({ workspace: ws, agentId: "default", selector: "latest" })).toThrow(/holdout partition is invalid/);
    const [moved, ...rest] = written.run.candidates;
    resign({ ...written.run, candidates: [{ ...moved!, split: { ...moved!.split, searchTestIds: [...moved!.split.searchTestIds, ...moved!.split.validationTestIds] } }, ...rest] });
    expect(() => loadGovernedOptimizerRun({ workspace: ws, agentId: "default", selector: "latest" })).toThrow(/not drawn from the recorded holdout partition/);
    resign({ ...written.run, partition: null });
    expect(() => loadGovernedOptimizerRun({ workspace: ws, agentId: "default", selector: "latest" })).toThrow(/no holdout partition/);
  });

  test("H2X-14: a cap below the minimum is refused, and no rendered trajectory refuses adaptation", () => {
    const ws = workspace();
    writeMutableManifest(ws);
    const rca = writeRca(ws, "trace-run-opt-evidence");
    expect(() => writeGovernedOptimizerRun({ workspace: ws, agentId: "default", rcaSelector: rca.report.reportId, observationCapChars: 9_999 }))
      .toThrow(/Observation cap/);
    writeFileSync(rca.path, `${JSON.stringify({ ...rca.report, callRecords: rca.report.callRecords.map((record) => ({ ...record, outputSnippet: "" })) }, null, 2)}\n`);
    const { run } = writeGovernedOptimizerRun({ workspace: ws, agentId: "default", rcaSelector: rca.report.reportId });
    expect(run.acceptedCandidateId).toBeNull();
    for (const candidate of run.candidates) {
      expect(candidate.leakageChecks.find((check) => check.id === "proposal-evidence-rendered"))
        .toMatchObject({ status: "blocked", reason: "No search-split trajectory rendered; adaptation is refused without execution evidence." });
    }
  });

  test("duplicate regression test IDs refuse the partition before any candidate is written", () => {
    const ws = workspace();
    writeMutableManifest(ws);
    const rca = writeRca(ws, "trace-run-opt-duplicate");
    writeFileSync(rca.path, `${JSON.stringify({ ...rca.report, regressionTests: [...rca.report.regressionTests, rca.report.regressionTests[0]] }, null, 2)}\n`);
    expect(() => writeGovernedOptimizerRun({ workspace: ws, agentId: "default", rcaSelector: rca.report.reportId })).toThrow(/Duplicate case ID/);
    expect(listGovernedOptimizerRuns({ workspace: ws, agentId: "default" }).runs).toEqual([]);
  });
});
