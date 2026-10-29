import { runInNewContext } from "node:vm";
import ts from "typescript";
import { expect, test } from "vitest";
import * as hashes from "../src/utils/hash.js";
import * as json from "../src/utils/json.js";
import * as fields from "../src/watch/liveDriftEvidenceFields.js";
import * as receipts from "../src/watch/liveDriftReceiptValidation.js";
import * as references from "../src/watch/evidenceRefs.js";
import * as math from "../src/watch/driftMath.js";
import { verifyLiveDriftReceipt, type LiveDriftReceipt } from "../src/watch/liveDriftAlerts.js";
import { landedText } from "./helpers/landedSource.js";
import { migrateLegacyCoreExpectations } from "./helpers/liveDriftEmptyExpectations.js";

const dependencies: Record<string, unknown> = {
  "./liveDriftEvidenceFields.js": fields, "./liveDriftReceiptValidation.js": receipts,
  "../utils/hash.js": hashes, "../utils/json.js": json,
  "./evidenceRefs.js": references, "./driftMath.js": math,
};
const preserved = landedText("src/watch/liveDriftAlerts.ts");
function evaluate(source: string): Record<string, unknown> {
  const exports: Record<string, unknown> = {};
  runInNewContext(ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText, {
    exports, Buffer, Date,
    require: (name: string) => {
      if (!(name in dependencies)) throw new Error(`Unexpected archived dependency: ${name}`);
      return dependencies[name];
    },
  }, { timeout: 10_000 });
  return exports;
}
const original = evaluate(preserved);
const updated = evaluate(migrateLegacyCoreExpectations(preserved));
function legacyReceipt(extra: Record<string, unknown> = {}, oracle = original, empty?: "baseline" | "live" | "both"): LiveDriftReceipt {
  const rows = [0, 1, 2].map(index => ({
    traceId: `expectation-${index}`, scenarioId: "fixture", timestamp: "2026-10-29T00:00:00Z",
    score0to1: 0.75, behaviorSignature: "stable", ollamaMetricsModelLoaded: true,
    evidenceRefs: ["fixture-evidence"], signedEvidenceRefs: ["fixture-signed"], ...extra,
  }));
  if (typeof oracle.runLiveScoreBehaviorDrift !== "function") throw new Error("Missing archived engine");
  return Reflect.apply(oracle.runLiveScoreBehaviorDrift, undefined, [{
    agentId: "expectation-fixture", now: new Date("2026-10-29T00:00:00Z"),
    baselineWindow: { windowId: "baseline", startedAt: "2026-10-28T00:00:00Z", endedAt: "2026-10-28T01:00:00Z", rows: empty === "baseline" || empty === "both" ? [] : rows },
    liveWindow: { windowId: "live", startedAt: "2026-10-29T00:00:00Z", endedAt: "2026-10-29T01:00:00Z", rows: empty === "live" || empty === "both" ? [] : rows },
    thresholds: empty ? { minBaselineSampleSize: 0, minLiveSampleSize: 0 } : undefined,
  }]) as LiveDriftReceipt;
}

test("AXE-23 expectation migration changes only empty defaults, dependent deltas, outcomes and their generated hash", () => {
  const legacy = legacyReceipt();
  const migrated = legacyReceipt({}, updated);
  for (const key of ["baselineDistribution", "liveDistribution"] as const) {
    const before = legacy[key] as unknown as Record<string, unknown>;
    const after = migrated[key] as unknown as Record<string, unknown>;
    expect(after.evidenceOutcome).toBe("measured");
    expect(after.ollamaMetricsRowCount).toBe(3);
    expect(after.ollamaMetricsModelLoadedRate0to1).toBe(before.ollamaMetricsModelLoadedRate0to1);
    expect(after.ollamaMetricsEvidenceCoverage0to1).toBe(before.ollamaMetricsEvidenceCoverage0to1);
    expect(after.agentSecurityEvidenceCoverage0to1).toBeNull();
    for (const field of ["ragPassageGroundingCoverage0to1", "ragHumanVerificationCoverage0to1", "ragCitationCoverage0to1", "ragAnswerSupportCoverage0to1"]) {
      expect(before[field], field).toBe(1);
      expect(after[field], field).toBeNull();
    }
    for (const field of Object.keys(before)) {
      if (after[field] === null) expect(before[field], field).toBe(1);
      else expect(after[field], field).toEqual(before[field]);
    }
  }
  for (const [field, value] of Object.entries(legacy.scoreDrift)) {
    const changed = Reflect.get(migrated.scoreDrift, field);
    if (changed === null) expect(value, field).toBe(0);
    else expect(changed, field).toEqual(value);
  }
  expect(migrated.scoreDrift.agentSecurityEvidenceCoverageDrop0to1).toBeNull();
  const { baselineDistribution: _baseline, liveDistribution: _live, scoreDrift: _drift, receiptHash: _hash, ...unchanged } = migrated;
  const { baselineDistribution: _oldBaseline, liveDistribution: _oldLive, scoreDrift: _oldDrift, receiptHash: _oldHash, ...oldUnchanged } = legacy;
  expect(unchanged).toEqual(oldUnchanged);
  const { receiptHash, ...payload } = migrated;
  expect(receiptHash).toBe(hashes.sha256Hex(json.canonicalize(payload)));
  expect(receiptHash).not.toBe(legacy.receiptHash);
  expect(verifyLiveDriftReceipt(migrated).valid).toBe(true);
  migrated.liveDistribution.scoreMean0to1 = 0.25;
  expect(verifyLiveDriftReceipt(migrated).valid).toBe(false);
});

test("AXE-23 expectation migration retains measured RAG builder coverage", () => {
  const legacy = legacyReceipt({ ragBuilderStage: "generate_basic" });
  const migrated = legacyReceipt({ ragBuilderStage: "generate_basic" }, updated);
  expect(migrated.liveDistribution.ragDatasetBuilderRowCount).toBe(3);
  for (const field of ["ragPassageGroundingCoverage0to1", "ragHumanVerificationCoverage0to1", "ragCitationCoverage0to1", "ragAnswerSupportCoverage0to1"] as const) {
    expect(legacy.liveDistribution[field], field).toBe(0);
    expect(migrated.liveDistribution[field], field).toBe(legacy.liveDistribution[field]);
  }
});

test("AXE-23 expectation migration refuses altered archived empty defaults", () => {
  const changedFallback = preserved.replace("ragPassageGroundingCoverageScores, 1", "ragPassageGroundingCoverageScores, 0");
  expect(changedFallback).not.toBe(preserved);
  expect(() => migrateLegacyCoreExpectations(changedFallback)).toThrow("Changed archived RAG coverage fallback");
  const changedConditional = preserved.replace(/(\w+\.length\s*===\s*0\s*\?\s*)1/, (_match, prefix: string) => `${prefix}0`);
  expect(changedConditional).not.toBe(preserved);
  expect(() => migrateLegacyCoreExpectations(changedConditional)).toThrow("Changed archived AXE-23 scope");
});

test.each(["both", "baseline", "live"] as const)("AXE-23 archived expectation keeps %s empty sample alerts unevaluated", empty => {
  const receipt = legacyReceipt({}, updated, empty);
  const alerts = receipt.alerts.filter(alert => alert.metricId === "sampleSize");
  expect(alerts).toHaveLength(empty === "both" ? 2 : 1);
  expect(alerts.every(alert => alert.observed === null)).toBe(true);
  for (const distribution of [receipt.baselineDistribution, receipt.liveDistribution]) {
    expect(distribution.evidenceOutcome).toBe(distribution.sampleSize === 0 ? "not_evaluated" : "measured");
  }
  expect(receipt.failClosed).toBe(true);
  expect(receipt.recommendation).toBe("alert");
  const { receiptHash, ...payload } = receipt;
  expect(receiptHash).toBe(hashes.sha256Hex(json.canonicalize(payload)));
  expect(verifyLiveDriftReceipt(receipt).valid).toBe(true);
});
