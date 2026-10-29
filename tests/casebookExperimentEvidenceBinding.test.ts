import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import YAML from "yaml";
import { afterEach, describe, expect, test } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { initBudgets, openLedger, runDiagnostic, exportEvidenceBundle, runBundleGate, writeSignedGatePolicy } from "../src/index.js";
import { appendToolEvidenceWithReceipt } from "../src/toolhub/toolhubReceipts.js";
import { getPrivateKeyPem, getSigningKey, signHexDigest } from "../src/crypto/keys.js";
import { sha256Hex } from "../src/utils/hash.js";
import { initCasebook } from "../src/casebooks/casebookStore.js";
import { runCasebook, type CaseExecutionRef } from "../src/casebooks/casebookRunner.js";
import {
  createExperiment,
  gateExperiment,
  runExperiment,
  setExperimentBaseline,
  setExperimentCandidate
} from "../src/experiments/experimentRunner.js";
import { evaluateExperimentGate } from "../src/experiments/experimentGatePolicy.js";
import { meanDifference, pairedBootstrapCI, pairedStandardizedEffect, bootstrapDifferenceCI } from "../src/experiments/stats.js";

const roots: string[] = [];
const savedPass = process.env.AMC_VAULT_PASSPHRASE;
afterEach(() => {
  while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true });
  if (savedPass === undefined) delete process.env.AMC_VAULT_PASSPHRASE; else process.env.AMC_VAULT_PASSPHRASE = savedPass;
});

function newWorkspace(): string {
  const dir = mkdtempSync(join(tmpdir(), "amc-case-binding-"));
  roots.push(dir);
  process.env.AMC_VAULT_PASSPHRASE = "case-binding-tests-passphrase";
  initWorkspace({ workspacePath: dir, trustBoundaryMode: "isolated" });
  initBudgets(dir, "default");
  return dir;
}

const casebookDir = (ws: string, id: string) => join(ws, ".amc", "casebooks", id);

function signConfig(ws: string, file: string): void {
  const digest = sha256Hex(readFileSync(file));
  writeFileSync(`${file}.sig`, JSON.stringify({ digestSha256: digest, signature: signHexDigest(digest, getSigningKey(ws, "config-signature")), signedTs: Date.now(), signer: "auditor" }));
}

function signAuditor(ws: string, file: string): void {
  const digest = sha256Hex(readFileSync(file));
  writeFileSync(`${file}.sig`, JSON.stringify({ digestSha256: digest, signature: signHexDigest(digest, getPrivateKeyPem(ws, "auditor")), signedTs: Date.now(), signer: "auditor" }));
}

/** A signed casebook of tool-requiring cases (no correlation requirement unless asked). */
function writeCasebook(ws: string, id: string, caseIds: string[], minCorrelationRatio = 0): void {
  initCasebook(ws, "default", id);
  const dir = casebookDir(ws, id);
  const index = YAML.parse(readFileSync(join(dir, "casebook.yaml"), "utf8")) as { casebook: { caseIds: string[] } };
  index.casebook.caseIds = caseIds;
  writeFileSync(join(dir, "casebook.yaml"), YAML.stringify(index));
  signConfig(ws, join(dir, "casebook.yaml"));
  for (const caseId of caseIds) {
    const file = join(dir, "cases", `${caseId}.json`);
    writeFileSync(file, JSON.stringify({
      v: 1, caseId, title: `Case ${caseId}`, description: "reads a file", riskTier: "low", requestedMode: "SIMULATE",
      allowedActionClasses: ["READ_ONLY"], inputs: { prompt: "read" },
      validators: { requiredToolActions: ["fs.read"], forbiddenAudits: [], minCorrelationRatio, requireReceipts: true },
      scoring: { successPoints: 60, valuePoints: 100 }
    }, null, 2));
    signConfig(ws, file);
  }
}

function ref(ws: string, casebookId: string, caseId: string, trialId: string, configDigest: string): CaseExecutionRef {
  return { v: 1, casebookId, caseId, caseSha256: sha256Hex(readFileSync(join(casebookDir(ws, casebookId), "cases", `${caseId}.json`))), trialId, configDigest };
}

/** One case execution: a receipted tool action and an llm_response, both stamped with the execution identity. */
function execute(ws: string, execution: CaseExecutionRef | null, options: { tool?: string; usage?: Record<string, unknown> } = {}): void {
  const ledger = openLedger(ws);
  const sessionId = `case-${Math.random().toString(16).slice(2)}`;
  try {
    ledger.startSession({ sessionId, runtime: "unknown", binaryPath: "vitest", binarySha256: "vitest" });
    const stamp = execution ? { caseExecution: execution } : {};
    appendToolEvidenceWithReceipt({ ledger, workspace: ws, sessionId, agentId: "default", toolName: options.tool ?? "fs.read",
      eventType: "tool_action", payload: { path: "/tmp/x" }, extraMeta: stamp });
    ledger.appendEvidence({ sessionId, runtime: "unknown", eventType: "llm_response", payload: "{}", payloadExt: "json", inline: true,
      meta: { agentId: "default", trustTier: "OBSERVED", usage: options.usage ?? { total_tokens: 100, input_tokens: 60, output_tokens: 40, totalTokens: 100 }, ...stamp } });
    ledger.sealSession(sessionId);
  } finally {
    ledger.close();
  }
}

const DIGEST_A = "a".repeat(64);

describe("casebook results are bound to case, trial and configuration identity (WP03)", () => {
  test("unrelated same-agent and other-case events cannot satisfy a case; usage counts once and only for its case", () => {
    const ws = newWorkspace();
    writeCasebook(ws, "bound", ["case_a", "case_b"]);
    execute(ws, ref(ws, "bound", "case_a", "trial-1", DIGEST_A));
    execute(ws, null); // same agent, same window, no identity
    execute(ws, ref(ws, "bound", "case_b", "trial-other", DIGEST_A)); // other trial
    execute(ws, ref(ws, "bound", "case_b", "trial-1", "b".repeat(64))); // other config

    const run = runCasebook({ workspace: ws, agentId: "default", casebookId: "bound", mode: "sandbox", window: "1d", trial: { trialId: "trial-1", configDigest: DIGEST_A } });
    const [a, b] = run.results;
    expect(a!.status).toBe("passed");
    expect(a!.costTokens).toBe(100); // total wins over components and aliases
    expect(a!.execution?.eventIds).toHaveLength(2);
    expect(b!.status).toBe("unavailable");
    expect(b!.success).toBe(false);
    expect(b!.costTokens).toBeNull();
    expect(b!.reasons).toContain("no execution evidence for case");
  });

  test("named tools match exactly, receipts are verified, and an empty window never passes", () => {
    const ws = newWorkspace();
    writeCasebook(ws, "tools", ["case_a", "case_b"]);
    execute(ws, ref(ws, "tools", "case_a", "t", DIGEST_A), { tool: "fs.write" });
    // A forged receipt string on an unreceipted tool action.
    const ledger = openLedger(ws);
    try {
      ledger.startSession({ sessionId: "forged", runtime: "unknown", binaryPath: "vitest", binarySha256: "vitest" });
      ledger.appendEvidence({ sessionId: "forged", runtime: "unknown", eventType: "tool_action", payload: "{}", payloadExt: "json", inline: true,
        meta: { agentId: "default", trustTier: "OBSERVED", toolName: "fs.read", receipt: "forged.receipt.string", caseExecution: ref(ws, "tools", "case_b", "t", DIGEST_A) } });
      ledger.sealSession("forged");
    } finally { ledger.close(); }

    const run = runCasebook({ workspace: ws, agentId: "default", casebookId: "tools", mode: "sandbox", window: "1d", trial: { trialId: "t", configDigest: DIGEST_A } });
    expect(run.results[0]!.status).toBe("failed");
    expect(run.results[0]!.reasons).toContain("required tool action missing: fs.read");
    expect(run.results[1]!.status).toBe("failed");
    expect(run.results[1]!.reasons.some((reason) => reason.includes("receipt did not verify"))).toBe(true);

    const empty = newWorkspace();
    writeCasebook(empty, "none", ["case_a"]);
    const legacy = runCasebook({ workspace: empty, agentId: "default", casebookId: "none", mode: "sandbox", window: "1d" });
    expect(legacy.results[0]!.status).toBe("unavailable");
    expect(legacy.results[0]!.reasons).toEqual(["no execution evidence for case"]);
    expect(legacy.results[0]!.execution).toBeNull();
  });

  test("missing correlation is unavailable, not 1; partial usage stays unknown; a legacy window divides no cost", () => {
    const ws = newWorkspace();
    writeCasebook(ws, "corr", ["case_a"], 0.9);
    execute(ws, ref(ws, "corr", "case_a", "t", DIGEST_A), { usage: { input_tokens: 5 } });
    const bound = runCasebook({ workspace: ws, agentId: "default", casebookId: "corr", mode: "sandbox", window: "1d", trial: { trialId: "t", configDigest: DIGEST_A } });
    expect(bound.results[0]!.correlationRatio).toBeNull();
    expect(bound.results[0]!.status).toBe("unavailable");
    expect(bound.results[0]!.reasons).toContain("correlation ratio unavailable");
    expect(bound.results[0]!.costTokens).toBeNull();
    const legacy = runCasebook({ workspace: ws, agentId: "default", casebookId: "corr", mode: "sandbox", window: "1d" });
    expect(legacy.results[0]!.costTokens).toBeNull();
  });
});

describe("security review: unattributed audits and missing usage (WP03)", () => {
  test("an unstamped forbidden audit in the trial window fails the case; no usage row is unknown cost, not zero", () => {
    const ws = newWorkspace();
    writeCasebook(ws, "audit", ["case_a"]);
    const casePath = join(casebookDir(ws, "audit"), "cases", "case_a.json");
    const kase = JSON.parse(readFileSync(casePath, "utf8")) as { validators: { forbiddenAudits: string[] } };
    kase.validators.forbiddenAudits = ["TOOLHUB_BYPASS_ATTEMPTED"];
    writeFileSync(casePath, JSON.stringify(kase, null, 2));
    signConfig(ws, casePath);
    const execution = ref(ws, "audit", "case_a", "t", DIGEST_A);
    const ledger = openLedger(ws);
    try {
      ledger.startSession({ sessionId: "nousage", runtime: "unknown", binaryPath: "vitest", binarySha256: "vitest" });
      appendToolEvidenceWithReceipt({ ledger, workspace: ws, sessionId: "nousage", agentId: "default", toolName: "fs.read",
        eventType: "tool_action", payload: { path: "/tmp/x" }, extraMeta: { caseExecution: execution } });
      ledger.sealSession("nousage");
    } finally { ledger.close(); }
    const trial = { trialId: "t", configDigest: DIGEST_A };
    const clean = runCasebook({ workspace: ws, agentId: "default", casebookId: "audit", mode: "sandbox", window: "1d", trial });
    expect(clean.results[0]!.status).toBe("passed");
    expect(clean.results[0]!.costTokens).toBeNull();

    const audit = openLedger(ws);
    try {
      audit.startSession({ sessionId: "bypass", runtime: "unknown", binaryPath: "vitest", binarySha256: "vitest" });
      audit.appendEvidence({ sessionId: "bypass", runtime: "unknown", eventType: "audit", payload: "{}", payloadExt: "json", inline: true,
        meta: { agentId: "default", trustTier: "OBSERVED", auditType: "TOOLHUB_BYPASS_ATTEMPTED" } });
      audit.sealSession("bypass");
    } finally { audit.close(); }
    const dirty = runCasebook({ workspace: ws, agentId: "default", casebookId: "audit", mode: "sandbox", window: "1d", trial });
    expect(dirty.results[0]!.status).toBe("failed");
    expect(dirty.results[0]!.reasons.some((reason) => reason.includes("TOOLHUB_BYPASS_ATTEMPTED"))).toBe(true);
  });
});

describe("paired statistics (WP05)", () => {
  test("paired bootstrap keeps pairs, is deterministic, and reports insufficiency instead of [0, 0]", () => {
    const pairs = [[10, 12], [50, 51], [90, 93], [30, 31]] as const;
    const first = pairedBootstrapCI({ pairs, seed: 7 });
    expect(first).toEqual(pairedBootstrapCI({ pairs, seed: 7 }));
    expect(first.status).toBe("estimated");
    // Deltas are 2, 1, 3, 1: every resampled mean lies in [1, 3].
    expect(first.interval![0]).toBeGreaterThanOrEqual(1);
    expect(first.interval![1]).toBeLessThanOrEqual(3);
    const unpaired = bootstrapDifferenceCI({ baseline: pairs.map((p) => p[0]), candidate: pairs.map((p) => p[1]), seed: 7 });
    expect(first.interval![1] - first.interval![0]).toBeLessThan(unpaired[1] - unpaired[0]);
    expect(pairedBootstrapCI({ pairs: [[1, 2]], seed: 7 })).toMatchObject({ status: "insufficient", interval: null, pairs: 1 });
    expect(() => pairedBootstrapCI({ pairs: [[1, Number.NaN], [1, 2]], seed: 7 })).toThrow(/finite/);
    expect(meanDifference([10, 50, 90, 30], [12, 51, 93, 31])).toBe(1.75);
    expect(pairedStandardizedEffect([[0, 1], [0, 1]])).toBeNull(); // zero variance: undefined, not infinite
    expect(pairedStandardizedEffect(pairs)).toBeCloseTo(1.75 / Math.sqrt(0.916667), 4);
  });

  test("the shared gate never passes legacy, small, cost-unknown or zero-baseline-cost reports", () => {
    const bound = {
      schemaVersion: 2, baseline: { trialId: "b" }, candidate: { trialId: "c" }, counts: { pairedCases: 5 },
      upliftSuccessRate: 0.2, upliftValuePoints: 20, baselineCostPerSuccess: 10, candidateCostPerSuccess: 10,
      confidenceInterval95: [5, 30], confidenceStatus: "estimated"
    };
    const policy = { minUpliftSuccessRate: 0, minUpliftValuePoints: 0, maxCostIncreaseRatio: 1.1, denyIfRegression: true };
    expect(evaluateExperimentGate(bound, policy).status).toBe("pass");
    const { schemaVersion: _drop, ...legacy } = bound;
    expect(evaluateExperimentGate(legacy, policy).status).toBe("inconclusive");
    expect(evaluateExperimentGate({ ...bound, counts: { pairedCases: 2 } }, policy).status).toBe("inconclusive");
    // No paired case: below-threshold numbers computed from nothing are inconclusive, not a failure.
    expect(evaluateExperimentGate({ ...legacy, counts: undefined, cases: [], upliftSuccessRate: 0 }, { ...policy, minUpliftSuccessRate: 0.5 }).status).toBe("inconclusive");
    expect(evaluateExperimentGate({ ...legacy, counts: undefined, cases: [{}], upliftSuccessRate: 0 }, { ...policy, minUpliftSuccessRate: 0.5 }).status).toBe("fail");
    expect(evaluateExperimentGate({ ...bound, candidate: { trialId: "b" } }, policy).status).toBe("inconclusive");
    expect(evaluateExperimentGate({ ...bound, candidateCostPerSuccess: null }, policy).reasons).toContain("cost evidence unavailable");
    expect(evaluateExperimentGate({ ...bound, baselineCostPerSuccess: 0 }, policy).status).toBe("fail");
    expect(evaluateExperimentGate({ ...bound, confidenceInterval95: null, confidenceStatus: "insufficient" }, policy).status).toBe("inconclusive");
    expect(evaluateExperimentGate({ ...bound, confidenceInterval95: [-1, 30] }, { ...policy, requireIntervalAboveZero: true }).status).toBe("inconclusive");
    expect(evaluateExperimentGate({ ...bound, upliftValuePoints: -1 }, { ...policy, minUpliftValuePoints: -5 }).status).toBe("fail");
  });
});

describe("experiment promotion verifies its inputs and keeps the baseline eligible (WP07)", () => {
  function setup(candidateWins: boolean) {
    const ws = newWorkspace();
    const caseIds = ["case_a", "case_b", "case_c", "case_d"];
    writeCasebook(ws, "exp", caseIds);
    const created = createExperiment({ workspace: ws, agentId: "default", name: "bound", casebookId: "exp" });
    const baselineFile = join(ws, "baseline.yaml");
    writeFileSync(baselineFile, "baseline: true\n");
    setExperimentBaseline({ workspace: ws, agentId: "default", experimentId: created.experimentId, config: { path: baselineFile } });
    const candidateFile = join(ws, "candidate.yaml");
    writeFileSync(candidateFile, "candidate: true\n");
    signAuditor(ws, candidateFile);
    const candidateDigest = setExperimentCandidate({ workspace: ws, agentId: "default", experimentId: created.experimentId, candidateFile }).digestSha256;
    const baselineDigest = sha256Hex(readFileSync(baselineFile));
    caseIds.forEach((caseId, index) => {
      const strong = { tool: "fs.read" }, weak = { tool: candidateWins && index === 0 ? "fs.read" : "fs.write" };
      execute(ws, ref(ws, "exp", caseId, "base-1", baselineDigest), candidateWins ? weak : strong);
      execute(ws, ref(ws, "exp", caseId, "cand-1", candidateDigest), candidateWins ? strong : weak);
    });
    const policyPath = join(ws, "policy.json");
    writeFileSync(policyPath, JSON.stringify({ minUpliftSuccessRate: 0.1, minUpliftValuePoints: 1, maxCostIncreaseRatio: 1.5, denyIfRegression: true }));
    const run = runExperiment({ workspace: ws, agentId: "default", experimentId: created.experimentId, mode: "sandbox",
      candidateWindow: "1d", baselineTrialId: "base-1", candidateTrialId: "cand-1" });
    return { ws, created, run, policyPath, candidateFile, gate: () => gateExperiment({ workspace: ws, agentId: "default", experimentId: created.experimentId, policyPath }) };
  }

  test("a verified, bound, improving report promotes; tampering, stale candidate or casebook changes abstain", () => {
    const { ws, run, gate, candidateFile } = setup(true);
    expect(run.report).toMatchObject({ schemaVersion: 2, counts: { cases: 4, pairedCases: 4, excludedCases: 0 }, confidenceStatus: "estimated",
      baseline: { trialId: "base-1" }, candidate: { trialId: "cand-1" }, upliftSuccessRate: 0.75 });
    expect(run.report.candidateCostPerSuccess).toBe(100);
    expect(run.report.baselineCostPerSuccess).toBe(400); // 4 cases x 100 tokens over 1 success
    const passed = gate();
    expect(passed.reasons).toEqual([]);
    expect(passed).toMatchObject({ pass: true, status: "pass", decision: "promote-candidate" });

    const original = readFileSync(run.jsonPath, "utf8");
    writeFileSync(run.jsonPath, original.replace('"upliftValuePoints": 75', '"upliftValuePoints": 76'));
    // The latest-run reader (WP38) refuses a tampered report before the gate can decide anything.
    expect(gate).toThrow(/report hash does not match/);
    writeFileSync(run.jsonPath, original);
    expect(gate().decision).toBe("promote-candidate");

    const caseFile = join(casebookDir(ws, "exp"), "cases", "case_d.json");
    const caseBytes = readFileSync(caseFile, "utf8");
    writeFileSync(caseFile, caseBytes.replace("reads a file", "reads another file"));
    signConfig(ws, caseFile);
    expect(gate()).toMatchObject({ pass: false, decision: "abstain" });
    expect(gate().reasons).toContain("report admission: casebook changed since the report was computed");
    writeFileSync(caseFile, caseBytes);
    signConfig(ws, caseFile);

    writeFileSync(candidateFile, "candidate: changed\n");
    signAuditor(ws, candidateFile);
    expect(gate()).toMatchObject({ pass: false, decision: "abstain" });
    expect(gate().reasons.some((reason) => reason.includes("candidate configuration is no longer admitted"))).toBe(true);
  });

  test("a candidate that regresses keeps the baseline; bundle gate and experiment gate share one rule set", async () => {
    const { ws, created, run, gate } = setup(false);
    expect(run.report.upliftSuccessRate).toBe(-1);
    expect(run.report.candidateCostPerSuccess).toBeNull(); // zero successes: no finite cost per success
    expect(run.report.baselineCostPerSuccess).toBe(100);
    const kept = gate();
    expect(kept).toMatchObject({ pass: false, status: "fail", decision: "keep-baseline" });

    const diagnostic = await runDiagnostic({ workspace: ws, agentId: "default", window: "14d", targetName: "default", claimMode: "auto" });
    const bundlePath = join(ws, ".amc", "agents", "default", "bundles", "exp.amcbundle");
    exportEvidenceBundle({ workspace: ws, runId: diagnostic.runId, outFile: bundlePath, agentId: "default" });
    const policyPath = join(ws, ".amc", "agents", "default", "gate-exp.json");
    const zero = { "Strategic Agent Operations": 0, "Leadership & Autonomy": 0, "Culture & Alignment": 0, Resilience: 0, Skills: 0 };
    writeSignedGatePolicy({ workspace: ws, policyPath, policy: { minIntegrityIndex: 0, minOverall: 0, minLayer: zero, requireObservedForLevel5: false,
      denyIfLowTrust: false, maxCostIncreaseRatio: 1.5,
      requireExperimentPass: { enabled: true, experimentId: created.experimentId, minUpliftSuccessRate: 0.1, minUpliftValuePoints: 1, denyIfRegression: true } } });
    const bundled = await runBundleGate({ workspace: ws, bundlePath, policyPath });
    expect(bundled.pass).toBe(false);
    const experimentReasons = bundled.reasons.filter((reason) => reason.startsWith("Experiment fail: ")).map((reason) => reason.slice("Experiment fail: ".length, -1));
    expect(experimentReasons).toEqual(kept.reasons);
  }, 60_000);

  test("same-agent legacy windows are disjoint: evidence in the candidate window cannot also be the baseline", () => {
    const ws = newWorkspace();
    writeCasebook(ws, "legacy", ["case_a"]);
    const created = createExperiment({ workspace: ws, agentId: "default", name: "legacy", casebookId: "legacy" });
    const candidateFile = join(ws, "candidate.yaml");
    writeFileSync(candidateFile, "candidate: true\n");
    signAuditor(ws, candidateFile);
    setExperimentCandidate({ workspace: ws, agentId: "default", experimentId: created.experimentId, candidateFile });
    execute(ws, null);
    expect(() => runExperiment({ workspace: ws, agentId: "default", experimentId: created.experimentId, mode: "sandbox", candidateWindow: "1d" }))
      .toThrow(/determinate evidence on both sides/);
    expect(readdirSync(join(ws, ".amc", "experiments", created.experimentId)).includes("runs")).toBe(false);

    writeCasebook(ws, "empty", []);
    const emptyExperiment = createExperiment({ workspace: ws, agentId: "default", name: "empty", casebookId: "empty" });
    setExperimentCandidate({ workspace: ws, agentId: "default", experimentId: emptyExperiment.experimentId, candidateFile });
    expect(() => runExperiment({ workspace: ws, agentId: "default", experimentId: emptyExperiment.experimentId, mode: "sandbox", candidateWindow: "1d" }))
      .toThrow(/no cases/);
    expect(() => runExperiment({ workspace: ws, agentId: "default", experimentId: created.experimentId, mode: "sandbox", candidateWindow: "1d",
      baselineTrialId: "same", candidateTrialId: "same" })).toThrow(/distinct/);
  });
});
