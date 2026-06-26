import { Readable } from "node:stream";
import type { IncomingMessage, ServerResponse } from "node:http";
import { describe, expect, test } from "vitest";
import {
  TENSORZERO_PROVIDER_DRIFT_SOURCE_REFS,
  runTensorZeroProviderDrift,
  type RunTensorZeroProviderDriftInput,
  type TensorZeroProviderDriftMetadata,
} from "../src/benchmarks/tensorZeroProviderDrift.js";
import type { ProviderDriftCanaryRow } from "../src/benchmarks/providerDriftBenchmark.js";
import { handleScoreRoute } from "../src/api/scoreRouter.js";
import { handleShieldRoute } from "../src/api/shieldRouter.js";
import { handleWatchRoute } from "../src/api/watchRouter.js";

const hash = (seed: string): string => seed.repeat(64).slice(0, 64);

const baseline: ProviderDriftCanaryRow = {
  provider: "anthropic",
  model: "claude-sonnet-4-5",
  version: "2026-06-01",
  canaryId: "tensorzero-routing-canary",
  benchmarkFamily: "llmops-provider-drift",
  capabilityId: "provider-regression-canary",
  sampleSize: 36,
  scoreMean0to1: 0.93,
  refusalRate0to1: 0.02,
  latencyMsP95: 1275,
  costUsdMean: 0.0038,
  evaluatorCoverage0to1: 0.99,
  guardrailPassRate0to1: 0.98,
  evidenceRefs: ["tensorzero:canary:baseline"],
  signedEvidenceRefs: ["ledger:tensorzero:baseline"],
};

const candidate: ProviderDriftCanaryRow = {
  ...baseline,
  version: "2026-06-18",
  scoreMean0to1: 0.915,
  refusalRate0to1: 0.025,
  latencyMsP95: 1300,
  costUsdMean: 0.0039,
  evaluatorCoverage0to1: 0.985,
  guardrailPassRate0to1: 0.975,
  evidenceRefs: ["tensorzero:canary:candidate"],
  signedEvidenceRefs: ["ledger:tensorzero:candidate"],
};

function metadata(
  row: ProviderDriftCanaryRow,
  side: "baseline" | "candidate",
  overrides: Partial<TensorZeroProviderDriftMetadata> = {},
): TensorZeroProviderDriftMetadata {
  return {
    provider: row.provider,
    model: row.model,
    canaryId: row.canaryId,
    providerVersion: row.version ?? "unknown",
    tensorZeroVersion: "2026.6.0@62eb8f63e8ec62018d70420dbf1a8c5d1c026315",
    providerRouteId: `${row.provider}:${row.model}:tensorzero-provider-drift`,
    evaluationRunId: `tensorzero-eval-run-${side}`,
    sourceRefHash: hash("a"),
    repositorySnapshotHash: hash("b"),
    licenseRefHash: hash("c"),
    defaultBranchHash: hash("d"),
    releaseTagHash: hash("e"),
    benchmarkModuleHash: hash("f"),
    watchModuleHash: hash("1"),
    apiModuleHash: hash("2"),
    routingConfigHash: hash("3"),
    canaryDatasetHash: hash("4"),
    evaluatorConfigHash: hash("5"),
    inferenceTraceHash: hash("6"),
    canaryResultHash: hash(side === "baseline" ? "7" : "8"),
    driftStatisticHash: hash("9"),
    alertOrWaiverHash: hash("0"),
    signedEvidenceBundleHash: hash("a"),
    noSourceCopyProofHash: hash("b"),
    metricIds: ["score", "refusal_rate", "latency", "cost", "guardrail_pass"],
    metricCount: 5,
    ...overrides,
  };
}

function requestBody(overrides: Partial<RunTensorZeroProviderDriftInput> = {}): RunTensorZeroProviderDriftInput {
  return {
    agentId: "support-agent",
    baseline: [baseline],
    candidate: [candidate],
    tensorZero: {
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
  body: RunTensorZeroProviderDriftInput = requestBody(),
): Promise<any> {
  const req = mockReq("POST", pathname, body);
  const { res, state } = mockRes();
  const handled = await handler(pathname, "POST", req, res, process.cwd());
  expect(handled).toBe(true);
  expect(state.statusCode).toBe(200);
  return JSON.parse(state.body);
}

describe("runTensorZeroProviderDrift", () => {
  test("approves complete metadata-only provider canaries across Score, Shield, and Watch", () => {
    const result = runTensorZeroProviderDrift(requestBody());

    expect(result.report.providerVersions).toEqual([
      "anthropic/claude-sonnet-4-5@2026-06-01",
      "anthropic/claude-sonnet-4-5@2026-06-18",
    ]);
    expect(result.report.recommendation).toBe("approve");
    expect(result.report.failClosed).toBe(false);
    expect(result.report.comparisons[0]?.driftStatistic).toBeGreaterThan(0);
    expect(result.tensorZeroEvidence).toHaveLength(2);
    expect(result.tensorZeroEvidence.every((proof) => proof.missingReasons.length === 0)).toBe(true);
    expect(result.tensorZeroEvidence.every((proof) => proof.providerVersion && proof.canaryResultHash && proof.driftStatisticHash && proof.alertOrWaiverHash)).toBe(true);
    expect(result.score.canaryResults[0]).toMatchObject({ canaryId: "tensorzero-routing-canary", status: "passed" });
    expect(result.score.driftStatistics[0]?.driftStatistic).toBeGreaterThan(0);
    expect(result.shield.gate.passed).toBe(true);
    expect(result.watch.alertCount).toBe(0);
    expect(result.watchAlerts).toEqual([]);
    expect(result.evalPack.sourceRefs).toEqual([...TENSORZERO_PROVIDER_DRIFT_SOURCE_REFS]);
  });

  test("fails closed when provider version, canary result, drift statistic, and alert-or-waiver evidence are missing", () => {
    const result = runTensorZeroProviderDrift(requestBody({
      tensorZero: {
        baseline: [metadata(baseline, "baseline")],
        candidate: [metadata(candidate, "candidate", {
          providerVersion: "",
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
    expect(result.report.alerts[0]?.message).toContain("candidate:providerVersion");
    expect(result.report.alerts[0]?.message).toContain("candidate:canaryResultHash");
    expect(result.report.alerts[0]?.message).toContain("candidate:driftStatisticHash");
    expect(result.report.alerts[0]?.message).toContain("candidate:alertOrWaiverHash");
    expect(result.shield.blocked).toBe(true);
    expect(result.watch.alertCount).toBe(1);
  });

  test("accepts explicit waiver evidence for incomplete TensorZero metadata without Watch alert emission", () => {
    const result = runTensorZeroProviderDrift(requestBody({
      tensorZero: {
        baseline: [metadata(baseline, "baseline")],
        candidate: [],
      },
      waivers: [{
        waiverId: "waive-tensorzero-export-gap",
        provider: candidate.provider,
        model: candidate.model,
        canaryId: candidate.canaryId,
        metricIds: ["evaluationFrameworkEvidence"],
        reason: "Historical route export is queued; accept one run with signed owner waiver.",
        approvedBy: "eval-owner@example.com",
        expiresAt: "2026-07-20T00:00:00.000Z",
        evidenceRefs: ["waiver:signed:tensorzero-export-gap"],
      }],
    }));

    expect(result.report.recommendation).toBe("waive");
    expect(result.report.failClosed).toBe(false);
    expect(result.report.alerts[0]).toMatchObject({ waived: true, waiverId: "waive-tensorzero-export-gap" });
    expect(result.shield.gate.passed).toBe(true);
    expect(result.shield.waivedAlertIds).toContain("pdrift:anthropic:claude-sonnet-4-5:tensorzero-routing-canary:tensorZeroMetadataEvidence");
    expect(result.watch.alertCount).toBe(0);
  });

  test("rejects copied content payloads and provider-version mismatches", () => {
    const result = runTensorZeroProviderDrift(requestBody({
      tensorZero: {
        baseline: [metadata(baseline, "baseline")],
        candidate: [metadata(candidate, "candidate", {
          providerVersion: "2026-06-17",
          gatewayConfig: "do not copy upstream or deployment config",
        } as Partial<TensorZeroProviderDriftMetadata>)],
      },
    }));

    expect(result.report.failClosed).toBe(true);
    expect(result.tensorZeroEvidence[1]?.missingReasons).toEqual(expect.arrayContaining([
      "candidate:metadataOnly:gatewayConfig",
      "candidate:providerVersionMismatch",
    ]));
  });

  test("serves TensorZero provider drift through Score, Shield, and Watch APIs", async () => {
    const score = await callRoute(handleScoreRoute, "/api/v1/score/tensorzero-provider-drift");
    expect(score.data.providerVersions).toContain("anthropic/claude-sonnet-4-5@2026-06-18");
    expect(score.data.canaryResults[0]).toMatchObject({ canaryId: "tensorzero-routing-canary", status: "passed" });
    expect(score.data.driftStatistics[0].driftStatistic).toBeGreaterThan(0);
    expect(score.data.tensorZeroEvidenceHash).toMatch(/^[a-f0-9]{64}$/);

    const shield = await callRoute(handleShieldRoute, "/api/v1/shield/tensorzero-provider-drift/verify");
    expect(shield.data.verification).toBe("passed");
    expect(shield.data.ciGate.passed).toBe(true);
    expect(shield.data.activeAlerts).toEqual([]);

    const watch = await callRoute(handleWatchRoute, "/api/v1/watch/tensorzero-provider-drift");
    expect(watch.data.tensorZeroEvidenceHash).toMatch(/^[a-f0-9]{64}$/);
    expect(watch.data.watch.alertCount).toBe(0);
    expect(watch.data.watchAlerts).toEqual([]);
    expect(watch.data.sourceRefs).toEqual(expect.arrayContaining(["https://github.com/tensorzero/tensorzero"]));
  });
});
