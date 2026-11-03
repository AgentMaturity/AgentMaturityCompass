import { describe, expect, test } from "vitest";
import { createModelMetadataSnapshot } from "../src/llm/modelCatalog.js";
import { projectNativeCost } from "../src/budgets/nativeCostProjection.js";
import { summarizeExperimentRoleCosts } from "../src/experiments/experimentResourceUsage.js";
import type { EvidenceEvent } from "../src/types.js";

function cost(id: string, options: { reportedUsd?: number; pending?: boolean; partial?: boolean; unpriced?: boolean } = {}) {
  const event = (suffix: string, event_type: EvidenceEvent["event_type"], meta: Record<string, unknown>): EvidenceEvent =>
    ({ id: `${id}-${suffix}`, session_id: id, event_type, meta_json: JSON.stringify(meta) }) as EvidenceEvent;
  const header = event("header", "request/header", { providerId: "openai", model: "gpt-4o", encoderId: "openai-chat", encoderVersion: 4,
    params: {}, systemPromptEventId: "prompt", toolSchemaEventId: null, toolSchemaSha256: null,
    projectionCutoffEventId: "message", projectionDigest: "projection", sourceEventIds: ["prompt", "message"],
    requestDigest: `digest-${id}`, modelMetadata: options.unpriced ? null : createModelMetadataSnapshot("openai", "openai-chat-completions", "gpt-4o") });
  const outcome = event("outcome", options.partial ? "request/failure" : "request/response", { headerEventId: header.id,
    requestDigest: `digest-${id}`, providerId: "openai", adapterId: "openai-chat", adapterVersion: 4,
    outcome: options.partial ? "failed" : "completed", dispatchAttempted: true,
    usage: { reported: true, complete: !options.partial, inputTokens: 1000, outputTokens: 100,
      cacheReadTokens: 1000, cacheWriteTokens: 0, reasoningTokens: 50,
      ...(options.reportedUsd === undefined ? {} : { costUsd: options.reportedUsd }) } });
  return projectNativeCost(options.pending ? [header] : [header, outcome], id);
}

const stage = (name: string, role: "proposer" | "executor" | "judge", projection: ReturnType<typeof cost> | null,
  state: "settled" | "started" | "unknown" | "not-run" = "settled") => ({ stage: name, role, state, cost: projection });

describe("experiment role cost attribution (H2-43)", () => {
  test("attributes measured proposer, executor and judge cost while retaining separate indicative estimates", () => {
    const projections = [cost("proposal", { reportedUsd: 0.2 }), cost("baseline", { reportedUsd: 0 }),
      cost("candidate"), cost("judgment", { reportedUsd: 0.1 })];
    const result = summarizeExperimentRoleCosts([
      stage("proposal", "proposer", projections[0]), stage("baseline", "executor", projections[1]),
      stage("candidate", "executor", projections[2]), stage("judgment", "judge", projections[3])
    ]);
    expect(result.evidenceBasis).toBe("native-request-cost-projections-with-caller-selected-roles");
    const proposer = result.roles.find(row => row.role === "proposer")!;
    const executor = result.roles.find(row => row.role === "executor")!;
    const judge = result.roles.find(row => row.role === "judge")!;
    expect(proposer).toMatchObject({ complete: true, totalCostUsd: 0.2, cost: { reportedSubtotalUsd: 0.2 } });
    expect(executor).toMatchObject({ complete: true, cost: { reportedSubtotalUsd: 0,
      estimatedSubtotalUsd: 0.0095, attributedSubtotalUsd: 0.00475, completeRequests: 2 } });
    expect(executor.totalCostUsd).toBeCloseTo(0.00475);
    expect(executor.cost!.requests.map(row => row.costBasis)).toEqual(["provider-reported", "catalog-estimate"]);
    expect(judge).toMatchObject({ complete: true, totalCostUsd: 0.1, cost: { reportedSubtotalUsd: 0.1 } });
    expect(result.total).toMatchObject({ complete: true, cost: { completeRequests: 4 } });
    expect(result.total.cost!.reportedSubtotalUsd).toBeCloseTo(0.3);
    expect(result.total.totalCostUsd).toBeCloseTo(0.30475);
    expect(result.stages.map(row => row.stage)).toEqual(["proposal", "baseline", "candidate", "judgment"]);
  });

  test("missing proposer and judge stages remain null while executor known subtotal survives", () => {
    const result = summarizeExperimentRoleCosts([
      stage("baseline", "executor", cost("baseline", { reportedUsd: 0.2 })),
      stage("candidate", "executor", cost("candidate", { pending: true })),
      stage("proposal", "proposer", null, "not-run"), stage("judgment", "judge", null, "unknown")
    ]);
    expect(result.roles.find(row => row.role === "executor")).toMatchObject({ complete: false, totalCostUsd: null,
      cost: { reportedSubtotalUsd: 0.2, attributedSubtotalUsd: 0.2, completeRequests: 1, unknownRequests: 1 } });
    for (const role of ["proposer", "judge", "repair", "selector", "reflection"]) {
      expect(result.roles.find(row => row.role === role)).toMatchObject({ complete: false, totalCostUsd: null, cost: null });
    }
    expect(result.total).toMatchObject({ complete: false, totalCostUsd: null, unavailableStages: 2 });
  });

  test("unpriced and failed partial stages never become zero or final cost", () => {
    const result = summarizeExperimentRoleCosts([
      stage("unpriced", "proposer", cost("unpriced", { unpriced: true })),
      stage("failed", "executor", cost("failed", { reportedUsd: 0.1, partial: true }), "unknown"),
      stage("judge", "judge", null, "not-run")
    ]);
    expect(result.stages[0]).toMatchObject({ complete: false, totalCostUsd: null,
      cost: { reportedSubtotalUsd: null, estimatedSubtotalUsd: null, attributedSubtotalUsd: null, unknownRequests: 1 } });
    expect(result.stages[1]).toMatchObject({ complete: false, totalCostUsd: null,
      cost: { reportedSubtotalUsd: 0.1, estimatedSubtotalUsd: 0.00475, attributedSubtotalUsd: null, partialRequests: 1 } });
    expect(result.total.totalCostUsd).toBeNull();
  });

  test("an empty role receipt cannot establish measured zero", () => {
    const result = summarizeExperimentRoleCosts([]);
    expect(result.stages).toEqual([]);
    expect(result.roles.map(row => row.role)).toEqual(["proposer", "executor", "judge", "repair", "selector", "reflection"]);
    for (const row of [...result.roles, result.total]) expect(row).toMatchObject({ complete: false, totalCostUsd: null, cost: null });
    const zero = summarizeExperimentRoleCosts([stage("baseline", "executor", cost("zero", { reportedUsd: 0 }))]);
    expect(zero.roles.find(row => row.role === "executor")).toMatchObject({ complete: true, totalCostUsd: 0 });
  });

  test.each(["started", "unknown"] as const)("%s stages retain known usage without declaring a final total", state => {
    const result = summarizeExperimentRoleCosts([stage("unfinished", "executor", cost(`unfinished-${state}`, { reportedUsd: 0.2 }), state)]);
    expect(result.stages[0]).toMatchObject({ complete: false, totalCostUsd: null, cost: { reportedSubtotalUsd: 0.2 } });
    expect(result.roles.find(row => row.role === "executor")).toMatchObject({ complete: false, totalCostUsd: null });
    expect(result.total).toMatchObject({ complete: false, totalCostUsd: null });
  });

  test("refuses attributing one native request to multiple stages or roles", () => {
    const shared = cost("shared", { reportedUsd: 0.2 });
    expect(() => summarizeExperimentRoleCosts([stage("proposal", "proposer", shared), stage("execution", "executor", shared)]))
      .toThrow(/request.*multiple.*stages/i);
    expect(() => summarizeExperimentRoleCosts([stage("same", "executor", null), stage("same", "judge", null)]))
      .toThrow(/distinct.*stage/i);
  });

  test("rejects invalid or inconsistent projections before attributing their USD", () => {
    const valid = cost("valid", { reportedUsd: 0.2 });
    for (const invalid of [{ ...valid, status: "invalid" as const }, { ...valid, reportedSubtotalUsd: 20 }]) {
      expect(() => summarizeExperimentRoleCosts([stage("bad", "executor", invalid)])).toThrow(/invalid.*cost.*projection/i);
    }
    expect(() => summarizeExperimentRoleCosts([stage("not-run", "executor", valid, "not-run")])).toThrow(/not-run.*cost/i);
  });

  test("refuses final USD without linked outcome evidence and inconsistent estimate provenance", () => {
    const valid = cost("linked", { reportedUsd: 0.2 });
    const changes = [
      { outcomeEventId: null }, { outcomeEventId: "sk-private-outcome" },
      { estimateComplete: true, estimatedCostUsd: null }, { estimateComplete: "yes" },
      { freshness: "invented" }
    ];
    for (const change of changes) {
      const request = { ...valid.requests[0], ...change };
      const altered = { ...valid, requests: [request],
        estimatedSubtotalUsd: request.estimatedCostUsd } as typeof valid;
      expect(() => summarizeExperimentRoleCosts([stage("bad-outcome", "executor", altered)]))
        .toThrow(/invalid.*cost.*projection/i);
    }
  });

  test("one outcome cannot substantiate separate role cost claims", () => {
    const proposer = cost("proposal-outcome", { reportedUsd: 0.2 });
    const executor = cost("execution-outcome", { reportedUsd: 0.1 });
    const duplicateOutcome = { ...executor, requests: [{ ...executor.requests[0],
      outcomeEventId: proposer.requests[0].outcomeEventId }] };
    expect(() => summarizeExperimentRoleCosts([
      stage("proposal", "proposer", proposer), stage("executor", "executor", duplicateOutcome)
    ])).toThrow(/request.*multiple.*stages/i);
  });

  test.each([{ role: "invented" }, { state: "invented" }])("refuses invalid role/state labels %j", change => {
    const malformed = { ...stage("bad-label", "executor", null), ...change } as unknown as Parameters<typeof summarizeExperimentRoleCosts>[0][number];
    expect(() => summarizeExperimentRoleCosts([malformed])).toThrow(/invalid.*role.*state/i);
  });

  test("negative request amounts cannot establish native cost", () => {
    const valid = cost("negative", { reportedUsd: 0.2 });
    const negative = { ...valid, reportedSubtotalUsd: -0.2, attributedSubtotalUsd: -0.2,
      requests: [{ ...valid.requests[0], reportedCostUsd: -0.2, attributedCostUsd: -0.2 }] };
    expect(() => summarizeExperimentRoleCosts([stage("negative", "executor", negative)]))
      .toThrow(/invalid.*cost.*projection.*amount/i);
  });

  test("overflow cannot yield an apparently complete aggregate", () => {
    expect(() => summarizeExperimentRoleCosts([
      stage("first", "executor", cost("first", { reportedUsd: Number.MAX_VALUE })),
      stage("second", "executor", cost("second", { reportedUsd: Number.MAX_VALUE }))
    ])).toThrow(/cost.*overflow/i);
  });
});
