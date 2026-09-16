import { Readable } from "node:stream";
import type { IncomingMessage, ServerResponse } from "node:http";
import { describe, expect, test } from "vitest";
import {
  HELM_PROVIDER_DRIFT_SOURCE_REFS,
  runHelmProviderDrift,
  type HelmProviderDriftMetadata,
  type RunHelmProviderDriftInput,
} from "../src/benchmarks/helmProviderDrift.js";
import type { ProviderDriftCanaryRow } from "../src/benchmarks/providerDriftBenchmark.js";
import { handleBenchmarkRoute } from "../src/api/benchmarkRouter.js";
import { handleScoreRoute } from "../src/api/scoreRouter.js";
import { handleShieldRoute } from "../src/api/shieldRouter.js";
import { handleWatchRoute } from "../src/api/watchRouter.js";

const hash = (seed: string): string => seed.repeat(64).slice(0, 64);

const baseline: ProviderDriftCanaryRow = {
  provider: "openai",
  model: "gpt-4.1",
  version: "2026-06-01",
  canaryId: "helm-transparency-canary",
  benchmarkFamily: "llmops-provider-drift",
  capabilityId: "provider-regression-canary",
  sampleSize: 48,
  scoreMean0to1: 0.91,
  refusalRate0to1: 0.03,
  latencyMsP95: 1420,
  costUsdMean: 0.0052,
  evaluatorCoverage0to1: 0.985,
  guardrailPassRate0to1: 0.976,
  evidenceRefs: ["helm:canary:baseline"],
  signedEvidenceRefs: ["ledger:helm:baseline"],
};

const candidate: ProviderDriftCanaryRow = {
  ...baseline,
  version: "2026-06-18",
  scoreMean0to1: 0.902,
  refusalRate0to1: 0.034,
  latencyMsP95: 1445,
  costUsdMean: 0.0053,
  evaluatorCoverage0to1: 0.982,
  guardrailPassRate0to1: 0.972,
  evidenceRefs: ["helm:canary:candidate"],
  signedEvidenceRefs: ["ledger:helm:candidate"],
};

function metadata(
  row: ProviderDriftCanaryRow,
  side: "baseline" | "candidate",
  overrides: Partial<HelmProviderDriftMetadata> = {},
): HelmProviderDriftMetadata {
  return {
    provider: row.provider,
    model: row.model,
    canaryId: row.canaryId,
    providerVersion: row.version ?? "unknown",
    helmVersion: "site-snapshot-2026-06-15T22:23:03Z",
    scenarioSuiteId: "helm-metadata-only-provider-regression-suite",
    runId: `helm-canary-run-${side}`,
    providerRouteId: `${row.provider}:${row.model}:helm-provider-drift`,
    sourceRefHash: hash("a"),
    websiteSnapshotHash: hash("b"),
    benchmarkCatalogHash: hash("c"),
    scenarioSuiteManifestHash: hash("d"),
    modelRegistrySnapshotHash: hash("e"),
    runSpecHash: hash("f"),
    adapterConfigHash: hash("1"),
    metricSuiteHash: hash("2"),
    leaderboardSnapshotHash: hash("3"),
    canaryResultHash: hash(side === "baseline" ? "4" : "5"),
    driftStatisticHash: hash("6"),
    alertOrWaiverHash: hash("7"),
    signedEvidenceBundleHash: hash("8"),
    noSourceCopyProofHash: hash("9"),
    metricIds: ["score", "refusal_rate", "latency", "cost", "guardrail_pass"],
    metricCount: 5,
    ...overrides,
  };
}

function requestBody(overrides: Partial<RunHelmProviderDriftInput> = {}): RunHelmProviderDriftInput {
  return {
    agentId: "support-agent",
    baseline: [baseline],
    candidate: [candidate],
    helm: {
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
  body: RunHelmProviderDriftInput = requestBody(),
): Promise<any> {
  const req = mockReq("POST", pathname, body);
  const { res, state } = mockRes();
  const handled = await handler(pathname, "POST", req, res, process.cwd());
  expect(handled).toBe(true);
  expect(state.statusCode).toBe(200);
  return JSON.parse(state.body);
}

describe("runHelmProviderDrift", () => {
  test("approves complete metadata-only HELM canaries across Score, Shield, and Watch", () => {
    const result = runHelmProviderDrift(requestBody());

    expect(result.report.providerVersions).toEqual([
      "openai/gpt-4.1@2026-06-01",
      "openai/gpt-4.1@2026-06-18",
    ]);
    expect(result.report.recommendation).toBe("approve");
    expect(result.report.failClosed).toBe(false);
    expect(result.report.comparisons[0]?.driftStatistic).toBeGreaterThan(0);
    expect(result.helmEvidence).toHaveLength(2);
    expect(result.helmEvidence.every((proof) => proof.missingReasons.length === 0)).toBe(true);
    expect(result.helmEvidence.every((proof) => proof.providerVersion && proof.canaryResultHash && proof.driftStatisticHash && proof.alertOrWaiverHash)).toBe(true);
    expect(result.score.canaryResults[0]).toMatchObject({ canaryId: "helm-transparency-canary", status: "passed" });
    expect(result.score.driftStatistics[0]?.driftStatistic).toBeGreaterThan(0);
    expect(result.shield.gate.passed).toBe(true);
    expect(result.watch.alertCount).toBe(0);
    expect(result.watchAlerts).toEqual([]);
    expect(result.evalPack.sourceRefs).toEqual([...HELM_PROVIDER_DRIFT_SOURCE_REFS]);
  });

  test("fails closed when provider version, canary result, drift statistic, and alert-or-waiver evidence are missing", () => {
    const result = runHelmProviderDrift(requestBody({
      helm: {
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

  test("accepts explicit waiver evidence for incomplete HELM metadata without Watch alert emission", () => {
    const result = runHelmProviderDrift(requestBody({
      helm: {
        baseline: [metadata(baseline, "baseline")],
        candidate: [],
      },
      waivers: [{
        waiverId: "waive-helm-export-gap",
        provider: candidate.provider,
        model: candidate.model,
        canaryId: candidate.canaryId,
        metricIds: ["evaluationFrameworkEvidence"],
        reason: "Historical HELM run manifest is queued; accept one run with signed owner waiver.",
        approvedBy: "eval-owner@example.com",
        expiresAt: "2026-07-20T00:00:00.000Z",
        evidenceRefs: ["waiver:signed:helm-export-gap"],
      }],
    }));

    expect(result.report.recommendation).toBe("waive");
    expect(result.report.failClosed).toBe(false);
    expect(result.report.alerts[0]).toMatchObject({ waived: true, waiverId: "waive-helm-export-gap" });
    expect(result.shield.gate.passed).toBe(true);
    expect(result.shield.waivedAlertIds).toContain("pdrift:openai:gpt-4.1:helm-transparency-canary:helmMetadataEvidence");
    expect(result.watch.alertCount).toBe(0);
  });

  test("rejects copied content payloads and provider-version mismatches", () => {
    const result = runHelmProviderDrift(requestBody({
      helm: {
        baseline: [metadata(baseline, "baseline")],
        candidate: [metadata(candidate, "candidate", {
          providerVersion: "2026-06-17",
          leaderboardRows: "do not copy HELM result rows",
        } as Partial<HelmProviderDriftMetadata>)],
      },
    }));

    expect(result.report.failClosed).toBe(true);
    expect(result.helmEvidence[1]?.missingReasons).toEqual(expect.arrayContaining([
      "candidate:metadataOnly:leaderboardRows",
      "candidate:providerVersionMismatch",
    ]));
  });

  test("serves HELM provider drift through Benchmark, Score, Shield, and Watch APIs", async () => {
    const benchmark = await callRoute(handleBenchmarkRoute, "/api/v1/benchmarks/helm-provider-drift");
    expect(benchmark.data.helmEvidenceHash).toMatch(/^[a-f0-9]{64}$/);
    expect(benchmark.data.score.providerVersions).toContain("openai/gpt-4.1@2026-06-18");

    const score = await callRoute(handleScoreRoute, "/api/v1/score/helm-provider-drift");
    expect(score.data.providerVersions).toContain("openai/gpt-4.1@2026-06-18");
    expect(score.data.canaryResults[0]).toMatchObject({ canaryId: "helm-transparency-canary", status: "passed" });
    expect(score.data.driftStatistics[0].driftStatistic).toBeGreaterThan(0);
    expect(score.data.helmEvidenceHash).toMatch(/^[a-f0-9]{64}$/);

    const shield = await callRoute(handleShieldRoute, "/api/v1/shield/helm-provider-drift/verify");
    expect(shield.data.verification).toBe("passed");
    expect(shield.data.ciGate.passed).toBe(true);
    expect(shield.data.activeAlerts).toEqual([]);

    const watch = await callRoute(handleWatchRoute, "/api/v1/watch/helm-provider-drift");
    expect(watch.data.helmEvidenceHash).toMatch(/^[a-f0-9]{64}$/);
    expect(watch.data.watch.alertCount).toBe(0);
    expect(watch.data.watchAlerts).toEqual([]);
    expect(watch.data.sourceRefs).toEqual(expect.arrayContaining(["https://crfm.stanford.edu/helm/"]));
  });
});
