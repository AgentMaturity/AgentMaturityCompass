import { Readable } from "node:stream";
import type { IncomingMessage, ServerResponse } from "node:http";
import { describe, expect, test } from "vitest";
import {
  INSPECT_PROVIDER_DRIFT_SOURCE_REFS,
  runInspectProviderDrift,
  type InspectProviderDriftMetadata,
  type RunInspectProviderDriftInput,
} from "../src/benchmarks/inspectProviderDrift.js";
import type { ProviderDriftCanaryRow } from "../src/benchmarks/providerDriftBenchmark.js";
import { handleBenchmarkRoute } from "../src/api/benchmarkRouter.js";
import { handleScoreRoute } from "../src/api/scoreRouter.js";
import { handleShieldRoute } from "../src/api/shieldRouter.js";
import { handleWatchRoute } from "../src/api/watchRouter.js";

const hash = (seed: string): string => seed.repeat(64).slice(0, 64);

const baseline: ProviderDriftCanaryRow = {
  provider: "anthropic",
  model: "claude-sonnet-4",
  version: "2026-06-01",
  canaryId: "inspect-support-eval",
  benchmarkFamily: "llmops-provider-drift",
  capabilityId: "provider-regression-canary",
  sampleSize: 40,
  scoreMean0to1: 0.94,
  refusalRate0to1: 0.025,
  latencyMsP95: 1280,
  costUsdMean: 0.004,
  evaluatorCoverage0to1: 0.99,
  guardrailPassRate0to1: 0.985,
  evidenceRefs: ["inspect:canary:baseline"],
  signedEvidenceRefs: ["ledger:inspect:baseline"],
};

const candidate: ProviderDriftCanaryRow = {
  ...baseline,
  version: "2026-06-18",
  scoreMean0to1: 0.935,
  refusalRate0to1: 0.028,
  latencyMsP95: 1305,
  costUsdMean: 0.0041,
  evaluatorCoverage0to1: 0.985,
  guardrailPassRate0to1: 0.982,
  evidenceRefs: ["inspect:canary:candidate"],
  signedEvidenceRefs: ["ledger:inspect:candidate"],
};

function metadata(
  row: ProviderDriftCanaryRow,
  side: "baseline" | "candidate",
  overrides: Partial<InspectProviderDriftMetadata> = {},
): InspectProviderDriftMetadata {
  return {
    provider: row.provider,
    model: row.model,
    canaryId: row.canaryId,
    providerVersion: row.version ?? "unknown",
    taskId: "support-provider-regression-task",
    evalRunId: `inspect-eval-run-${side}`,
    inspectVersion: "0.3.96",
    providerRouteId: "amc-provider-route-primary",
    sourceRefHash: hash("a"),
    websiteSnapshotHash: hash("b"),
    docsIndexHash: hash("c"),
    taskManifestHash: hash("d"),
    datasetManifestHash: hash("e"),
    solverConfigHash: hash("f"),
    scorerConfigHash: hash("1"),
    evalLogManifestHash: hash("2"),
    scoreReportHash: hash("3"),
    canaryResultHash: hash(side === "baseline" ? "4" : "5"),
    driftStatisticHash: hash("6"),
    alertOrWaiverHash: hash("7"),
    signedEvidenceBundleHash: hash("8"),
    noSourceCopyProofHash: hash("9"),
    metricIds: ["score", "refusal_rate", "latency", "cost", "guardrail_pass"],
    metricCount: 5,
    scorerIds: ["model_graded_qa", "guardrail_pass_rate"],
    ...overrides,
  };
}

function requestBody(overrides: Partial<RunInspectProviderDriftInput> = {}): RunInspectProviderDriftInput {
  return {
    agentId: "support-agent",
    baseline: [baseline],
    candidate: [candidate],
    inspect: {
      baseline: [metadata(baseline, "baseline")],
      candidate: [metadata(candidate, "candidate")],
    },
    now: "2026-06-20T00:00:00.000Z",
    ...overrides,
  };
}

function mockReq(method: string, url: string, body?: unknown): IncomingMessage {
  const payload = body === undefined ? "" : JSON.stringify(body);
  const req = Readable.from(payload.length > 0 ? [Buffer.from(payload, "utf8")] : []) as unknown as IncomingMessage;
  (req as any).method = method;
  (req as any).url = url;
  return req;
}

function mockRes(): { res: ServerResponse; state: { statusCode: number; headers: Record<string, string>; body: string } } {
  const state = { statusCode: 0, headers: {} as Record<string, string>, body: "" };
  const res = {
    writeHead: (statusCode: number, headers?: Record<string, string>) => {
      state.statusCode = statusCode;
      state.headers = headers ?? {};
      return res;
    },
    end: (chunk?: string | Buffer) => {
      if (chunk !== undefined) state.body += chunk.toString();
    },
  } as unknown as ServerResponse;
  return { res, state };
}

async function callRoute(
  handler: (pathname: string, method: string, req: IncomingMessage, res: ServerResponse, workspace?: string) => Promise<boolean>,
  pathname: string,
  body: RunInspectProviderDriftInput = requestBody(),
): Promise<any> {
  const req = mockReq("POST", pathname, body);
  const { res, state } = mockRes();
  const handled = await handler(pathname, "POST", req, res, process.cwd());
  expect(handled).toBe(true);
  expect(state.statusCode).toBe(200);
  return JSON.parse(state.body);
}

describe("runInspectProviderDrift", () => {
  test("approves complete metadata-only Inspect canaries across Score, Shield, and Watch", () => {
    const result = runInspectProviderDrift(requestBody());

    expect(result.report.providerVersions).toEqual([
      "anthropic/claude-sonnet-4@2026-06-01",
      "anthropic/claude-sonnet-4@2026-06-18",
    ]);
    expect(result.report.recommendation).toBe("approve");
    expect(result.report.failClosed).toBe(false);
    expect(result.report.comparisons[0]?.driftStatistic).toBeGreaterThan(0);
    expect(result.inspectEvidence).toHaveLength(2);
    expect(result.inspectEvidence.every((proof) => proof.missingReasons.length === 0)).toBe(true);
    expect(result.inspectEvidence.every((proof) => proof.providerVersion && proof.canaryResultHash && proof.driftStatisticHash && proof.alertOrWaiverHash)).toBe(true);
    expect(result.score.canaryResults[0]).toMatchObject({ canaryId: "inspect-support-eval", status: "passed" });
    expect(result.score.driftStatistics[0]?.driftStatistic).toBeGreaterThan(0);
    expect(result.shield.gate.passed).toBe(true);
    expect(result.watch.alertCount).toBe(0);
    expect(result.watchAlerts).toEqual([]);
    expect(result.evalPack.sourceRefs).toEqual([...INSPECT_PROVIDER_DRIFT_SOURCE_REFS]);
  });

  test("fails closed when canary result, drift statistic, and alert-or-waiver evidence are missing", () => {
    const result = runInspectProviderDrift(requestBody({
      inspect: {
        baseline: [metadata(baseline, "baseline")],
        candidate: [metadata(candidate, "candidate", {
          canaryResultHash: undefined,
          driftStatisticHash: undefined,
          alertOrWaiverHash: undefined,
        })],
      },
    }));

    expect(result.report.recommendation).toBe("alert");
    expect(result.report.failClosed).toBe(true);
    expect(result.report.alerts[0]).toMatchObject({
      metricId: "evaluationFrameworkEvidence",
      waived: false,
    });
    expect(result.report.alerts[0]?.message).toContain("candidate:canaryResultHash");
    expect(result.report.alerts[0]?.message).toContain("candidate:driftStatisticHash");
    expect(result.report.alerts[0]?.message).toContain("candidate:alertOrWaiverHash");
    expect(result.shield.blocked).toBe(true);
    expect(result.watch.alertCount).toBe(1);
  });

  test("accepts explicit waiver evidence for incomplete Inspect metadata without Watch alert emission", () => {
    const result = runInspectProviderDrift(requestBody({
      inspect: {
        baseline: [metadata(baseline, "baseline")],
        candidate: [],
      },
      waivers: [{
        waiverId: "waive-inspect-log-gap",
        provider: candidate.provider,
        model: candidate.model,
        canaryId: candidate.canaryId,
        metricIds: ["evaluationFrameworkEvidence"],
        reason: "Historical Inspect eval-log manifest is queued; accept one run with signed owner waiver.",
        approvedBy: "eval-owner@example.com",
        expiresAt: "2026-07-20T00:00:00.000Z",
        evidenceRefs: ["waiver:signed:inspect-log-gap"],
      }],
    }));

    expect(result.report.recommendation).toBe("waive");
    expect(result.report.failClosed).toBe(false);
    expect(result.report.alerts[0]).toMatchObject({ waived: true, waiverId: "waive-inspect-log-gap" });
    expect(result.shield.gate.passed).toBe(true);
    expect(result.watch.alertCount).toBe(0);
  });

  test("rejects copied content payloads and provider-version mismatches", () => {
    const result = runInspectProviderDrift(requestBody({
      inspect: {
        baseline: [metadata(baseline, "baseline")],
        candidate: [metadata(candidate, "candidate", {
          providerVersion: "2026-06-17",
          evalLog: "do not copy Inspect eval log contents",
        } as Partial<InspectProviderDriftMetadata>)],
      },
    }));

    expect(result.report.failClosed).toBe(true);
    expect(result.inspectEvidence[1]?.missingReasons).toEqual(expect.arrayContaining([
      "candidate:metadataOnly:evalLog",
      "candidate:providerVersionMismatch",
    ]));
  });

  test("serves Inspect provider drift through Benchmark, Score, Shield, and Watch APIs", async () => {
    const benchmark = await callRoute(handleBenchmarkRoute, "/api/v1/benchmarks/inspect-provider-drift");
    expect(benchmark.data.inspectEvidenceHash).toMatch(/^[a-f0-9]{64}$/);
    expect(benchmark.data.score.providerVersions).toContain("anthropic/claude-sonnet-4@2026-06-18");

    const score = await callRoute(handleScoreRoute, "/api/v1/score/inspect-provider-drift");
    expect(score.data.providerVersions).toContain("anthropic/claude-sonnet-4@2026-06-18");
    expect(score.data.canaryResults[0]).toMatchObject({ canaryId: "inspect-support-eval", status: "passed" });
    expect(score.data.driftStatistics[0].driftStatistic).toBeGreaterThan(0);
    expect(score.data.inspectEvidenceHash).toMatch(/^[a-f0-9]{64}$/);

    const shield = await callRoute(handleShieldRoute, "/api/v1/shield/inspect-provider-drift/verify");
    expect(shield.data.verification).toBe("passed");
    expect(shield.data.ciGate.passed).toBe(true);
    expect(shield.data.activeAlerts).toEqual([]);

    const watch = await callRoute(handleWatchRoute, "/api/v1/watch/inspect-provider-drift");
    expect(watch.data.inspectEvidenceHash).toMatch(/^[a-f0-9]{64}$/);
    expect(watch.data.watch.alertCount).toBe(0);
    expect(watch.data.watchAlerts).toEqual([]);
    expect(watch.data.sourceRefs).toEqual(expect.arrayContaining(["https://inspect.aisi.org.uk/"]));
  });
});
