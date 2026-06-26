import { Readable } from "node:stream";
import type { IncomingMessage, ServerResponse } from "node:http";
import { describe, expect, test } from "vitest";
import {
  PATRONUS_PROVIDER_DRIFT_SOURCE_REFS,
  runPatronusProviderDrift,
  type PatronusProviderDriftMetadata,
  type RunPatronusProviderDriftInput,
} from "../src/benchmarks/patronusProviderDrift.js";
import type { ProviderDriftCanaryRow } from "../src/benchmarks/providerDriftBenchmark.js";
import { handleScoreRoute } from "../src/api/scoreRouter.js";
import { handleShieldRoute } from "../src/api/shieldRouter.js";
import { handleWatchRoute } from "../src/api/watchRouter.js";

const hash = (seed: string): string => seed.repeat(64).slice(0, 64);

const baseline: ProviderDriftCanaryRow = {
  provider: "openai",
  model: "gpt-4.1-mini",
  version: "2026-06-01",
  canaryId: "patronus-support-eval",
  benchmarkFamily: "llmops-provider-drift",
  capabilityId: "provider-regression-canary",
  sampleSize: 32,
  scoreMean0to1: 0.92,
  refusalRate0to1: 0.03,
  latencyMsP95: 1180,
  costUsdMean: 0.003,
  evaluatorCoverage0to1: 0.98,
  guardrailPassRate0to1: 0.97,
  evidenceRefs: ["patronus:canary:baseline"],
  signedEvidenceRefs: ["ledger:patronus:baseline"],
};

const candidate: ProviderDriftCanaryRow = {
  ...baseline,
  version: "2026-06-16",
  scoreMean0to1: 0.91,
  refusalRate0to1: 0.035,
  latencyMsP95: 1200,
  costUsdMean: 0.0031,
  evaluatorCoverage0to1: 0.975,
  guardrailPassRate0to1: 0.965,
  evidenceRefs: ["patronus:canary:candidate"],
  signedEvidenceRefs: ["ledger:patronus:candidate"],
};

function metadata(
  row: ProviderDriftCanaryRow,
  side: "baseline" | "candidate",
  overrides: Partial<PatronusProviderDriftMetadata> = {},
): PatronusProviderDriftMetadata {
  return {
    provider: row.provider,
    model: row.model,
    canaryId: row.canaryId,
    providerVersion: row.version ?? "unknown",
    projectId: "provider-drift-canaries",
    evaluationRunId: `patronus-eval-run-${side}`,
    sourceRefHash: hash("a"),
    websiteSnapshotHash: hash("b"),
    docsIndexHash: hash("c"),
    datasetHash: hash("d"),
    evaluatorConfigHash: hash("e"),
    traceExportHash: hash("f"),
    providerRouteHash: hash("1"),
    canaryResultHash: hash(side === "baseline" ? "2" : "3"),
    driftStatisticHash: hash("4"),
    alertOrWaiverHash: hash("5"),
    signedEvidenceBundleHash: hash("6"),
    noSourceCopyProofHash: hash("7"),
    metricIds: ["score", "refusal_rate", "latency", "cost", "guardrail_pass"],
    metricCount: 5,
    ...overrides,
  };
}

function requestBody(overrides: Partial<RunPatronusProviderDriftInput> = {}): RunPatronusProviderDriftInput {
  return {
    agentId: "support-agent",
    baseline: [baseline],
    candidate: [candidate],
    patronus: {
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
  body: RunPatronusProviderDriftInput = requestBody(),
): Promise<any> {
  const req = mockReq("POST", pathname, body);
  const { res, state } = mockRes();
  const handled = await handler(pathname, "POST", req, res, process.cwd());
  expect(handled).toBe(true);
  expect(state.statusCode).toBe(200);
  return JSON.parse(state.body);
}

describe("runPatronusProviderDrift", () => {
  test("approves complete metadata-only provider canaries across Score, Shield, and Watch", () => {
    const result = runPatronusProviderDrift(requestBody());

    expect(result.report.providerVersions).toEqual([
      "openai/gpt-4.1-mini@2026-06-01",
      "openai/gpt-4.1-mini@2026-06-16",
    ]);
    expect(result.report.recommendation).toBe("approve");
    expect(result.report.failClosed).toBe(false);
    expect(result.report.comparisons[0]?.driftStatistic).toBeGreaterThan(0);
    expect(result.patronusEvidence).toHaveLength(2);
    expect(result.patronusEvidence.every((proof) => proof.missingReasons.length === 0)).toBe(true);
    expect(result.patronusEvidence.every((proof) => proof.providerVersion && proof.canaryResultHash && proof.driftStatisticHash && proof.alertOrWaiverHash)).toBe(true);
    expect(result.score.canaryResults[0]).toMatchObject({ canaryId: "patronus-support-eval", status: "passed" });
    expect(result.score.driftStatistics[0]?.driftStatistic).toBeGreaterThan(0);
    expect(result.shield.gate.passed).toBe(true);
    expect(result.watch.alertCount).toBe(0);
    expect(result.watchAlerts).toEqual([]);
    expect(result.evalPack.sourceRefs).toEqual([...PATRONUS_PROVIDER_DRIFT_SOURCE_REFS]);
  });

  test("fails closed when canary result, drift statistic, and alert-or-waiver evidence are missing", () => {
    const result = runPatronusProviderDrift(requestBody({
      patronus: {
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

  test("accepts explicit waiver evidence for incomplete metadata without Watch alert emission", () => {
    const result = runPatronusProviderDrift(requestBody({
      patronus: {
        baseline: [metadata(baseline, "baseline")],
        candidate: [],
      },
      waivers: [{
        waiverId: "waive-patronus-export-gap",
        provider: candidate.provider,
        model: candidate.model,
        canaryId: candidate.canaryId,
        metricIds: ["evaluationFrameworkEvidence"],
        reason: "Historical canary export is queued; accept one run with signed owner waiver.",
        approvedBy: "eval-owner@example.com",
        expiresAt: "2026-07-20T00:00:00.000Z",
        evidenceRefs: ["waiver:signed:patronus-export-gap"],
      }],
    }));

    expect(result.report.recommendation).toBe("waive");
    expect(result.report.failClosed).toBe(false);
    expect(result.report.alerts[0]).toMatchObject({ waived: true, waiverId: "waive-patronus-export-gap" });
    expect(result.shield.gate.passed).toBe(true);
    expect(result.watch.alertCount).toBe(0);
  });

  test("rejects copied content payloads and provider-version mismatches", () => {
    const result = runPatronusProviderDrift(requestBody({
      patronus: {
        baseline: [metadata(baseline, "baseline")],
        candidate: [metadata(candidate, "candidate", {
          providerVersion: "2026-06-15",
          promptText: "do not copy prompt text",
        } as Partial<PatronusProviderDriftMetadata>)],
      },
    }));

    expect(result.report.failClosed).toBe(true);
    expect(result.patronusEvidence[1]?.missingReasons).toEqual(expect.arrayContaining([
      "candidate:metadataOnly:promptText",
      "candidate:providerVersionMismatch",
    ]));
  });

  test("serves provider drift through Score, Shield, and Watch APIs", async () => {
    const score = await callRoute(handleScoreRoute, "/api/v1/score/patronus-provider-drift");
    expect(score.data.providerVersions).toContain("openai/gpt-4.1-mini@2026-06-16");
    expect(score.data.canaryResults[0]).toMatchObject({ canaryId: "patronus-support-eval", status: "passed" });
    expect(score.data.driftStatistics[0].driftStatistic).toBeGreaterThan(0);
    expect(score.data.patronusEvidenceHash).toMatch(/^[a-f0-9]{64}$/);

    const shield = await callRoute(handleShieldRoute, "/api/v1/shield/patronus-provider-drift/verify");
    expect(shield.data.verification).toBe("passed");
    expect(shield.data.ciGate.passed).toBe(true);
    expect(shield.data.activeAlerts).toEqual([]);

    const watch = await callRoute(handleWatchRoute, "/api/v1/watch/patronus-provider-drift");
    expect(watch.data.patronusEvidenceHash).toMatch(/^[a-f0-9]{64}$/);
    expect(watch.data.watch.alertCount).toBe(0);
    expect(watch.data.watchAlerts).toEqual([]);
    expect(watch.data.sourceRefs).toEqual(expect.arrayContaining(["https://www.patronus.ai/"]));
  });
});
