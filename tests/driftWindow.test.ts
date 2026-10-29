import { readFileSync, writeFileSync } from "node:fs";
import { expect, test, vi } from "vitest";
import { loadAlertsConfig, signAlertsConfig } from "../src/drift/alerts.js";
import { runDriftCheck, runDriftCheckAsync } from "../src/drift/driftDetector.js";
import { activeFreezeStatus, listIncidents, verifyIncidentSignature } from "../src/drift/freezeEngine.js";
import { atFreezeSign, freezeFixture, pauseFreezeSign } from "./helpers/freezePublicationFixture.js";
import { tamperReport, writeSealedReport } from "./helpers/sealedRun.js";

function inputs(scores: number[]) {
  const f = freezeFixture();
  const config = loadAlertsConfig(f.workspace);
  config.alerts.rules[0]!.when = { overallDropGte: 0.4, layerDropGte: 0.4, integrityDropGte: 1, correlationDropBelow: 0, assuranceDropBelow: {} };
  writeFileSync(f.alertsPath, JSON.stringify(config)); signAlertsConfig(f.workspace);
  const files = scores.map((score, index) => writeSealedReport(f.workspace, f.paths.runsDir, `window-${index}`,
    { runId: `window-${index}`, agentId: "default", ts: index + 1, windowStartTs: 0, windowEndTs: 100,
      layerScores: [{ layerName: "Skills", avgFinalLevel: score, confidenceWeightedFinalLevel: score }], integrityIndex: 1, correlationRatio: 1 }));
  return { f, files };
}

test("AXE-09: five-run median and bootstrap interval suppress a noisy drop inside the interval", async () => {
  // Median 4.5 -> current 4 crosses the 0.4 threshold; candidate-minus-baseline CI spans zero.
  const { f } = inputs([3.5, 3.5, 4.5, 4.5, 5, 4]);
  const result = await runDriftCheck({ workspace: f.workspace });
  expect(result.triggered).toBe(false); expect(listIncidents(f.workspace)).toEqual([]);
  expect(activeFreezeStatus(f.workspace).active).toBe(false);
});

test("AXE-09: last five verified runs, rather than an older outlier, form the signed window", async () => {
  const { f } = inputs([0, 5, 5, 5, 5, 4, 4]);
  const result = await runDriftCheck({ workspace: f.workspace });
  expect(result.triggered).toBe(true);
  const incident = listIncidents(f.workspace)[0]!;
  expect(incident).toMatchObject({ comparisonWindow: { requestedSize: 5, runIds: ["window-1", "window-2", "window-3", "window-4", "window-5"],
    startTs: 2, endTs: 6, confirmation: "confirmed" }, deltas: { overallDrop: 1 } });
  expect(verifyIncidentSignature(f.workspace, incident)).toBe(true);
  const edited = JSON.parse(readFileSync(f.incidentPath(incident.incidentId), "utf8"));
  edited.comparisonWindow.runIds[0] = "forged-window";
  expect(verifyIncidentSignature(f.workspace, edited)).toBe(false);
  expect(activeFreezeStatus(f.workspace).actionClasses).toContain("DEPLOY");
});

test("AXE-09: a single baseline keeps its freeze and records unconfirmed evidence", async () => {
  const { f } = inputs([5, 4]);
  expect((await runDriftCheck({ workspace: f.workspace })).triggered).toBe(true);
  const incident = listIncidents(f.workspace)[0]!;
  expect(incident).toMatchObject({ comparisonWindow: { requestedSize: 5, runIds: ["window-0"], confirmation: "unconfirmed" } });
  expect(incident.freeze.reason).toContain("unconfirmed");
  expect(verifyIncidentSignature(f.workspace, incident)).toBe(true);
});

test("AXE-09: an unavailable assurance pack freezes honestly, without inventing a zero score", async () => {
  const { f } = inputs([5, 5]);
  const config = loadAlertsConfig(f.workspace); config.alerts.rules[0]!.when.assuranceDropBelow = { injection: 80 };
  writeFileSync(f.alertsPath, JSON.stringify(config)); signAlertsConfig(f.workspace);
  const result = await runDriftCheck({ workspace: f.workspace });
  expect(result.triggered).toBe(true);
  expect(result.reasons.join("; ")).toContain("assurance injection unavailable");
  expect(result.reasons.join("; ")).not.toContain("score 0.0");
  expect(listIncidents(f.workspace)[0]).toMatchObject({ comparisonWindow: { confirmation: "unconfirmed" } });
});

test("AXE-09: tampered seals are refused, never included in a freeze comparison", async () => {
  const { f, files } = inputs([5, 5, 5, 5, 5, 4]);
  tamperReport(files[0]!, run => { run.ts = -1; });
  const result = await runDriftCheck({ workspace: f.workspace });
  expect(result.triggered).toBe(false); expect(result.reasons.join("; ")).toContain("INSUFFICIENT_EVIDENCE");
  expect(listIncidents(f.workspace)).toEqual([]);
});

test("AXE-09: every window input is rechecked after asynchronous signing", async () => {
  const { f, files } = inputs([5, 5, 5, 5, 5, 4]), paused = pauseFreezeSign(f);
  const pending = runDriftCheckAsync({ workspace: f.workspace }), outcome = pending.then(() => null, error => error);
  try {
    await atFreezeSign(paused, pending);
    // Resealed change remains verified, but it changes the actual selected baseline.
    const report = JSON.parse(readFileSync(files[0]!, "utf8")); report.layerScores[0].avgFinalLevel = 4.9;
    writeSealedReport(f.workspace, f.paths.runsDir, "window-0", report);
    paused.release.resolve(); expect(await outcome).toBeInstanceOf(Error); expect(listIncidents(f.workspace)).toEqual([]);
  } finally { paused.release.resolve(); await Promise.allSettled([pending]); }
});

test.each(["missing layer", "empty run", "nonfinite input"])("AXE-09: %s is insufficient evidence, without a numeric freeze", async kind => {
  const { f, files } = inputs([5, 4]);
  const report = JSON.parse(readFileSync(files[1]!, "utf8"));
  if (kind === "missing layer") report.layerScores[0].layerName = "Resilience";
  if (kind === "empty run") report.layerScores = [];
  if (kind === "nonfinite input") report.integrityIndex = null;
  writeSealedReport(f.workspace, f.paths.runsDir, "window-1", report);
  const result = await runDriftCheck({ workspace: f.workspace });
  expect(result.triggered).toBe(false); expect(result.reasons.join("; ")).toContain("INSUFFICIENT_EVIDENCE");
  expect(listIncidents(f.workspace)).toEqual([]);
});

test("AXE-09: an explicitly empty baseline cannot fall back to fabricated comparison evidence", async () => {
  const { f, files } = inputs([5, 4]);
  const { evaluateDriftRules } = await import("../src/drift/driftRules.js");
  expect(() => evaluateDriftRules({ config: loadAlertsConfig(f.workspace),
    previousRun: JSON.parse(readFileSync(files[0]!, "utf8")), currentRun: JSON.parse(readFileSync(files[1]!, "utf8")),
    baselineRuns: [], assuranceByPack: new Map() })).toThrow("INSUFFICIENT_EVIDENCE");
});

test("AXE-09: an interval the bootstrap cannot estimate keeps the drop but never confirms it", async () => {
  const { f, files } = inputs([5, 5, 5, 4]);
  vi.resetModules();
  vi.doMock("../src/experiments/stats.js", async original => ({ ...(await original<typeof import("../src/experiments/stats.js")>()),
    bootstrapDifferenceCI: () => ({ status: "insufficient", interval: null, reason: "test" }) }));
  try {
    const { evaluateDriftRules } = await import("../src/drift/driftRules.js");
    const [a, b, c, current] = files.map(file => JSON.parse(readFileSync(file, "utf8")));
    const result = evaluateDriftRules({ config: loadAlertsConfig(f.workspace), previousRun: c, baselineRuns: [a, b, c],
      currentRun: current, assuranceByPack: new Map() });
    expect(result).toMatchObject({ triggered: true, confirmation: "unconfirmed", deltas: { overallDrop: 1 } });
    expect(result.reasons.join("; ")).toContain("drift interval insufficient (INSUFFICIENT_EVIDENCE)");
    const quiet = evaluateDriftRules({ config: loadAlertsConfig(f.workspace), previousRun: c, baselineRuns: [a, b, c],
      currentRun: c, assuranceByPack: new Map() });
    expect(quiet).toMatchObject({ triggered: false, confirmation: "unconfirmed" });
  } finally { vi.doUnmock("../src/experiments/stats.js"); vi.resetModules(); }
});
