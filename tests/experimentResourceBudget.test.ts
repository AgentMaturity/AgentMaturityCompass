import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { initWorkspace } from "../dist/workspace.js";
import { SessionService } from "../dist/session/sessionService.js";
import { openLedger } from "../dist/ledger/ledger.js";
import {
  analyzeArchitectureExperiment, createArchitectureExperiment, createArchitectureSpec, createProbe,
  renderArchitectureComparisonMarkdown, runArchitectureExperiment, simulateProbeOutcomes,
  type ArchitectureSpec, type ArchitectureProbe
} from "../dist/experiments/architectureExperiment.js";

let workspace: string;
const activeSessions: SessionService[] = [];
beforeAll(() => {
  workspace = mkdtempSync(join(tmpdir(), "amc-experiment-resource-"));
  initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
});
afterAll(() => {
  for (const session of activeSessions) session.close({ reason: "completed" });
  rmSync(workspace, { recursive: true, force: true });
});

function experiment() {
  const spec = (name: string) => createArchitectureSpec({ name, kind: "POLICY_FRAME", modelId: "gpt-4o",
    artifactContent: name, description: name });
  return createArchitectureExperiment({ name: "Resource fixture", baselineSpec: spec("baseline"), candidateSpec: spec("candidate"),
    probes: [createProbe({ category: "fixture", promptText: "fixture", measureDimension: "fixture" })] });
}
function outcomes(spec: ArchitectureSpec, probes: ArchitectureProbe[], seed: number) {
  return simulateProbeOutcomes(spec, probes, seed);
}
function evidence(options: { input?: number; reported?: boolean; complete?: boolean; cost?: number; pending?: boolean; sessionId?: string; requests?: number; active?: boolean } = {}) {
  const session = new SessionService(workspace);
  session.open({ sessionId: options.sessionId, agentId: "default", harnessVersion: "resource-fixture", compositionDigest: "a".repeat(64), policyDigest: "b".repeat(64) });
  for (let request = 0; request < (options.requests ?? 1); request++) {
    const prepared = session.recordRequestHeader({ providerId: "openai", model: "gpt-4o", params: {}, encoderId: "openai-chat",
      encoderVersion: 4, systemPromptEventId: "prompt", toolSchema: null, projectionCutoffEventId: "cutoff",
      projectionDigest: "projection", sourceEventIds: [], requestBytes: "fixture-wire" });
    if (!options.pending) {
      const usage = { reported: options.reported ?? true, complete: options.complete ?? true,
        inputTokens: options.input ?? 10, outputTokens: 5, cacheReadTokens: 2, cacheWriteTokens: 0, reasoningTokens: 3,
        ...(options.cost === undefined ? {} : { costUsd: options.cost }) };
      session.recordRequestOutcome({ headerEventId: prepared.headerEventId, requestDigest: prepared.requestDigest,
        providerId: "openai", adapterId: "openai-chat", adapterVersion: 4, httpStatus: 200, durationMs: 1,
        blocks: [], dispatchAttempted: true, outcome: "completed", finishReason: "stop", usage });
    }
  }
  if (options.active) activeSessions.push(session);
  else session.close({ reason: "completed" });
  return { workspace, sessionId: session.sessionId };
}
const budget = () => ({ maxCalls: 2, maxTokens: 40, timeoutMs: 1000,
  planned: { baseline: { maxCalls: 1, maxTokens: 20 }, candidate: { maxCalls: 1, maxTokens: 20 } } });

describe("experiment role usage and whole-run admission (H2-12/H2-43)", () => {
  test("rejects maximum work exceeding the whole envelope before baseline dispatch", () => {
    const runner = vi.fn(outcomes);
    expect(() => runArchitectureExperiment(experiment(), { probeRunner: runner, budget: { ...budget(), maxTokens: 39 } }))
      .toThrow(/planned.*token.*envelope/i);
    expect(runner).not.toHaveBeenCalled();
  });

  test("preflights calls as well as tokens and rejects invalid budget numbers", () => {
    for (const extra of [{ maxCalls: 1 }, { maxCalls: -1 }, { maxTokens: Number.NaN }, { timeoutMs: 0 }]) {
      const runner = vi.fn(outcomes);
      expect(() => runArchitectureExperiment(experiment(), { probeRunner: runner, budget: { ...budget(), ...extra } })).toThrow();
      expect(runner).not.toHaveBeenCalled();
    }
  });

  test("rejects hard USD and token caps for an unbounded injected runner before dispatch", () => {
    for (const extra of [{ maxCostUsd: 1 }, { requireHardCeiling: true }]) {
      const runner = vi.fn(outcomes);
      expect(() => runArchitectureExperiment(experiment(), { probeRunner: runner, budget: { ...budget(), ...extra } }))
        .toThrow(/hard.*(ceiling|cap)|bounded.*contract/i);
      expect(runner).not.toHaveBeenCalled();
    }
  });

  test("attributes signed native usage per execution stage and keeps reported USD separate from estimates", () => {
    const run = experiment();
    const result = runArchitectureExperiment(run, { budget: budget(), probeRunner: (spec, probes, seed) => ({
      outcomes: outcomes(spec, probes, seed), usageEvidence: evidence({ cost: spec.name === "baseline" ? 0.2 : 0 })
    }) });
    expect(result.resourceUsage).toMatchObject({ scope: "caller-bound-experiment", enforcementState: "between-stage-admission",
      hardCeilingEnforced: false, startedStages: 2, settledStages: 2 });
    const [baseline, candidate] = result.resourceUsage.stages;
    expect(baseline).toMatchObject({ stage: "baseline", role: "executor", state: "settled", observedTokens: 17,
      tokensComplete: true, usage: { requests: 1, completeRequests: 1 }, cost: { reportedSubtotalUsd: 0.2 } });
    expect(candidate).toMatchObject({ stage: "candidate", observedTokens: 17, cost: { reportedSubtotalUsd: 0 } });
    expect(baseline?.cost?.estimatedSubtotalUsd).toBeGreaterThan(0);
    expect(baseline?.cost?.estimatedSubtotalUsd).not.toBe(0.2);
    for (const stage of result.resourceUsage.stages.slice(2)) {
      expect(stage).toMatchObject({ state: "not-run", observedTokens: null, usage: null, cost: null });
    }
    expect(result.resourceUsage.stages.map(stage => stage.stage)).toEqual([
      "baseline", "candidate", "proposer", "repair", "selector", "judge", "reflection"
    ]);
    const report = analyzeArchitectureExperiment(run, result.baselineOutcomes, result.candidateOutcomes);
    expect(report.resourceUsage).toEqual(result.resourceUsage);
    const markdown = renderArchitectureComparisonMarkdown(report);
    expect(markdown).toContain("## Resource attribution");
    expect(markdown).toContain("Provider-reported cost");
    expect(markdown).toContain("Catalog estimate");
    expect(markdown).toContain("judge: not-run");
  });

  test("legacy outcome tokenCount is not measured native usage and blocks later budgeted stages", () => {
    const run = experiment(), runner = vi.fn(outcomes);
    expect(() => runArchitectureExperiment(run, { probeRunner: runner, budget: budget() })).toThrow(/unknown.*usage/i);
    expect(runner).toHaveBeenCalledTimes(1);
    expect(run.resourceUsage?.stages[0]).toMatchObject({ state: "settled", observedTokens: null, usage: null, cost: null });
    expect(run.resourceUsage?.stages[1]?.state).toBe("not-run");
  });

  test("an overrun halts candidate dispatch and retains the measured baseline", () => {
    const run = experiment();
    const runner = vi.fn((spec: ArchitectureSpec, probes: ArchitectureProbe[], seed: number) => ({
      outcomes: outcomes(spec, probes, seed), usageEvidence: evidence({ input: 50 })
    }));
    expect(() => runArchitectureExperiment(run, { probeRunner: runner, budget: budget() })).toThrow(/token.*(exceed|exhaust)/i);
    expect(runner).toHaveBeenCalledTimes(1);
    expect(run.resourceUsage?.stages[0]?.observedTokens).toBe(57);
    expect(run.status).toBe("FAILED");
  });

  test("measured request count reserves the next stage against the same call envelope", () => {
    const run = experiment();
    const runner = vi.fn((spec: ArchitectureSpec, probes: ArchitectureProbe[], seed: number) => ({
      outcomes: outcomes(spec, probes, seed), usageEvidence: evidence({ requests: 2 })
    }));
    expect(() => runArchitectureExperiment(run, { probeRunner: runner,
      budget: { ...budget(), maxTokens: 100, planned: { baseline: { maxCalls: 1, maxTokens: 40 }, candidate: { maxCalls: 1, maxTokens: 40 } } }
    })).toThrow(/call.*envelope/i);
    expect(runner).toHaveBeenCalledTimes(1);
    expect(run.resourceUsage?.stages[0]?.usage?.requests).toBe(2);
  });

  test("pending native requests stay unknown and prevent a later stage", () => {
    const run = experiment();
    const runner = vi.fn((spec: ArchitectureSpec, probes: ArchitectureProbe[], seed: number) => ({
      outcomes: outcomes(spec, probes, seed), usageEvidence: evidence({ pending: true })
    }));
    expect(() => runArchitectureExperiment(run, { probeRunner: runner, budget: budget() })).toThrow(/unknown.*usage/i);
    expect(runner).toHaveBeenCalledTimes(1);
    expect(run.resourceUsage?.stages[0]?.usage?.pendingRequests).toBe(1);
    expect(run.resourceUsage?.stages[0]?.cost?.reportedSubtotalUsd).toBeNull();
  });

  test("an open native session retains its reservation after currently complete requests", () => {
    const run = experiment();
    const runner = vi.fn((spec: ArchitectureSpec, probes: ArchitectureProbe[], seed: number) => ({
      outcomes: outcomes(spec, probes, seed), usageEvidence: evidence({ active: true })
    }));
    expect(() => runArchitectureExperiment(run, { probeRunner: runner, budget: budget() })).toThrow(/unknown.*usage/i);
    expect(runner).toHaveBeenCalledTimes(1);
    expect(run.resourceUsage?.stages[0]).toMatchObject({ observedTokens: 17, tokensComplete: false, reservedCalls: 1, reservedTokens: 20 });
  });

  test("unknown final-stage usage cannot complete a budgeted experiment", () => {
    const run = experiment();
    const runner = vi.fn((spec: ArchitectureSpec, probes: ArchitectureProbe[], seed: number) => ({
      outcomes: outcomes(spec, probes, seed), usageEvidence: evidence({ complete: spec.name === "baseline" })
    }));
    expect(() => runArchitectureExperiment(run, { probeRunner: runner, budget: budget() })).toThrow(/unknown.*usage/i);
    expect(runner).toHaveBeenCalledTimes(2);
    expect(run.resourceUsage?.stages[1]).toMatchObject({ tokensComplete: false, reservedCalls: 1, reservedTokens: 20 });
  });

  test("one native session cannot be counted as both baseline and candidate", () => {
    const selector = evidence();
    expect(() => runArchitectureExperiment(experiment(), { probeRunner: (spec, probes, seed) => ({
      outcomes: outcomes(spec, probes, seed), usageEvidence: selector
    }) })).toThrow(/multiple.*stages/i);
  });

  test("unsafe combined token totals are unavailable even without an envelope", () => {
    expect(() => runArchitectureExperiment(experiment(), { probeRunner: (spec, probes, seed) => ({
      outcomes: outcomes(spec, probes, seed), usageEvidence: evidence({ input: Number.MAX_SAFE_INTEGER - 2 })
    }) })).toThrow(/token.*overflow/i);
  });

  test("signed but malformed native usage cannot establish stage measurements", () => {
    expect(() => runArchitectureExperiment(experiment(), { probeRunner: (spec, probes, seed) => ({
      outcomes: outcomes(spec, probes, seed), usageEvidence: evidence({ input: -1 })
    }) })).toThrow(/native usage evidence is invalid/i);
  });

  test("withholds unsafe native session display labels while keeping verified usage", () => {
    const result = runArchitectureExperiment(experiment(), { probeRunner: (spec, probes, seed) => ({
      outcomes: outcomes(spec, probes, seed), usageEvidence: evidence({ sessionId: `sk-private-${spec.name}` })
    }) });
    expect(result.resourceUsage?.stages[0]).toMatchObject({ sessionId: null, observedTokens: 17 });
    expect(JSON.stringify(result.resourceUsage)).not.toContain("sk-private-");
  });

  test("a thrown callback retains an unknown started stage instead of releasing it as free", () => {
    const run = experiment();
    expect(() => runArchitectureExperiment(run, { probeRunner: () => { throw new Error("dispatch failed"); }, budget: budget() }))
      .toThrow("dispatch failed");
    expect(run.resourceUsage).toMatchObject({ startedStages: 1, settledStages: 0 });
    expect(run.resourceUsage?.stages[0]).toMatchObject({ state: "unknown", observedTokens: null, usage: null, cost: null });
  });

  test("whole-run deadline is checked before the next dispatch", () => {
    const run = experiment(), clock = vi.spyOn(Date, "now").mockReturnValue(100);
    const runner = vi.fn((spec: ArchitectureSpec, probes: ArchitectureProbe[], seed: number) => {
      const result = outcomes(spec, probes, seed);
      clock.mockReturnValue(1200);
      return result;
    });
    try {
      expect(() => runArchitectureExperiment(run, { probeRunner: runner, budget: budget() })).toThrow(/deadline/i);
      expect(runner).toHaveBeenCalledTimes(1);
    } finally { clock.mockRestore(); }
  });

  test("reads and verifies authoritative evidence instead of trusting caller-supplied event bodies", () => {
    const selector = evidence({ cost: 0.1 });
    const ledger = openLedger(workspace);
    let saved: string;
    try {
      ledger.db.exec("DROP TRIGGER IF EXISTS protect_evidence_immutable; DROP TRIGGER IF EXISTS no_update_evidence;");
      const row = ledger.getAllEvents().find(event => event.session_id === selector.sessionId && event.event_type === "request/response")!;
      saved = row.meta_json;
      ledger.db.prepare("UPDATE evidence_events SET meta_json = ? WHERE id = ?").run(saved.replace('"costUsd":0.1', '"costUsd":0'), row.id);
      expect(() => runArchitectureExperiment(experiment(), { probeRunner: (spec, probes, seed) => ({
        outcomes: outcomes(spec, probes, seed), usageEvidence: selector
      }) })).toThrow(/signature|hash/i);
      ledger.db.prepare("UPDATE evidence_events SET meta_json = ? WHERE id = ?").run(saved, row.id);
    } finally { ledger.close(); }
  });
});
