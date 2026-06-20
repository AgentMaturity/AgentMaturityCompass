import { Readable } from "node:stream";
import type { IncomingMessage, ServerResponse } from "node:http";
import { describe, expect, test } from "vitest";
import {
  HUMANLOOP_PROVIDER_DRIFT_SOURCE_REFS,
  runHumanloopProviderDrift,
  type HumanloopProviderDriftMetadata,
  type RunHumanloopProviderDriftInput,
} from "../src/benchmarks/humanloopProviderDrift.js";
import type { ProviderDriftCanaryRow } from "../src/benchmarks/providerDriftBenchmark.js";
import { handleWatchRoute } from "../src/api/watchRouter.js";

const hash = (seed: string): string => seed.repeat(64).slice(0, 64);

const baseline: ProviderDriftCanaryRow = {
  provider: "anthropic",
  model: "claude-sonnet-4-5",
  version: "2026-06-01",
  canaryId: "humanloop-support-eval",
  sampleSize: 32,
  scoreMean0to1: 0.91,
  refusalRate0to1: 0.03,
  latencyMsP95: 1400,
  costUsdMean: 0.004,
  evaluatorCoverage0to1: 0.98,
  guardrailPassRate0to1: 0.97,
  evidenceRefs: ["humanloop:logs:baseline", "humanloop:evaluation:baseline"],
  signedEvidenceRefs: ["ledger:humanloop:baseline"],
};

const candidate: ProviderDriftCanaryRow = {
  ...baseline,
  version: "2026-06-15",
  scoreMean0to1: 0.89,
  refusalRate0to1: 0.04,
  latencyMsP95: 1450,
  costUsdMean: 0.0041,
  evaluatorCoverage0to1: 0.97,
  guardrailPassRate0to1: 0.96,
  evidenceRefs: ["humanloop:logs:candidate", "humanloop:evaluation:candidate"],
  signedEvidenceRefs: ["ledger:humanloop:candidate"],
};

function metadata(row: ProviderDriftCanaryRow, side: "baseline" | "candidate", overrides: Partial<HumanloopProviderDriftMetadata> = {}): HumanloopProviderDriftMetadata {
  return {
    provider: row.provider,
    model: row.model,
    canaryId: row.canaryId,
    providerVersion: row.version ?? "unknown",
    fileVersionId: `file-version-${side}`,
    environmentId: side === "baseline" ? "staging" : "production",
    evaluationRunId: `eval-run-${side}`,
    sourceRefHash: hash("a"),
    websiteSnapshotHash: hash("b"),
    docsIndexHash: hash("c"),
    fileVersionExportHash: hash("d"),
    logsExportHash: hash("e"),
    datasetHash: hash("f"),
    evaluatorConfigHash: hash("1"),
    evaluatorResultsHash: hash("2"),
    providerRouteId: `${row.provider}:${row.model}:humanloop-provider-drift`,
    canaryResultHash: hash("3"),
    driftStatisticHash: hash("4"),
    alertOrWaiverHash: hash("5"),
    signedEvidenceBundleHash: hash("6"),
    noSourceCopyProofHash: hash("7"),
    metricIds: ["correctness", "factuality", "latency", "cost", "guardrail_pass"],
    metricCount: 5,
    ...overrides,
  };
}

function requestBody(overrides: Partial<RunHumanloopProviderDriftInput> = {}): RunHumanloopProviderDriftInput {
  return {
    agentId: "support-agent",
    baseline: [baseline],
    candidate: [candidate],
    humanloop: {
      baseline: [metadata(baseline, "baseline")],
      candidate: [metadata(candidate, "candidate")],
    },
    now: new Date("2026-06-20T00:00:00.000Z"),
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

describe("runHumanloopProviderDrift", () => {
  test("approves complete metadata-only Humanloop provider canaries across Score, Shield, and Watch", () => {
    const result = runHumanloopProviderDrift(requestBody());

    expect(result.report.providerVersions).toEqual([
      "anthropic/claude-sonnet-4-5@2026-06-01",
      "anthropic/claude-sonnet-4-5@2026-06-15",
    ]);
    expect(result.report.recommendation).toBe("approve");
    expect(result.report.failClosed).toBe(false);
    expect(result.report.comparisons[0]?.driftStatistic).toBeGreaterThan(0);
    expect(result.humanloopEvidence).toHaveLength(2);
    expect(result.humanloopEvidence.every((proof) => proof.missingReasons.length === 0)).toBe(true);
    expect(result.humanloopEvidence.every((proof) => proof.canaryResultHash && proof.driftStatisticHash && proof.alertOrWaiverHash)).toBe(true);
    expect(result.score).toMatchObject({ recommendation: "approve", failClosed: false, humanloopEvidenceHash: result.humanloopEvidenceHash });
    expect(result.score.driftStatistics[0]).toMatchObject({ canaryId: "humanloop-support-eval", status: "passed" });
    expect(result.shield.gate.passed).toBe(true);
    expect(result.shield.blocked).toBe(false);
    expect(result.watch.alertCount).toBe(0);
    expect(result.watchAlerts).toEqual([]);
    expect(result.evalPack.sourceRefs).toEqual(expect.arrayContaining([...HUMANLOOP_PROVIDER_DRIFT_SOURCE_REFS]));
  });

  test("fails closed when Humanloop canary result, drift statistic, and alert-or-waiver evidence are missing", () => {
    const result = runHumanloopProviderDrift(requestBody({
      humanloop: {
        baseline: [metadata(baseline, "baseline")],
        candidate: [metadata(candidate, "candidate", {
          providerVersion: "2026-06-15",
          canaryResultHash: undefined,
          driftStatisticHash: undefined,
          alertOrWaiverHash: undefined,
        })],
      },
    }));

    expect(result.report.recommendation).toBe("alert");
    expect(result.report.failClosed).toBe(true);
    expect(result.report.alerts[0]).toMatchObject({
      metricId: "observabilityPipelineEvidence",
      waived: false,
    });
    expect(result.report.alerts[0]?.message).toContain("candidate:canaryResultHash");
    expect(result.report.alerts[0]?.message).toContain("candidate:driftStatisticHash");
    expect(result.report.alerts[0]?.message).toContain("candidate:alertOrWaiverHash");
    expect(result.shield.blocked).toBe(true);
    expect(result.watch.alertCount).toBe(1);
  });

  test("accepts explicit waiver evidence for incomplete Humanloop metadata without Watch alert emission", () => {
    const result = runHumanloopProviderDrift(requestBody({
      humanloop: {
        baseline: [metadata(baseline, "baseline")],
        candidate: [],
      },
      waivers: [{
        waiverId: "waive-humanloop-export-gap",
        provider: candidate.provider,
        model: candidate.model,
        canaryId: candidate.canaryId,
        metricIds: ["observabilityPipelineEvidence"],
        reason: "Historical Humanloop export is queued; accept one run with signed owner waiver.",
        approvedBy: "eval-owner@example.com",
        expiresAt: "2026-07-20T00:00:00.000Z",
        evidenceRefs: ["waiver:signed:humanloop-export-gap"],
      }],
    }));

    expect(result.report.recommendation).toBe("waive");
    expect(result.report.failClosed).toBe(false);
    expect(result.report.alerts[0]).toMatchObject({ waived: true, waiverId: "waive-humanloop-export-gap" });
    expect(result.shield.gate.passed).toBe(true);
    expect(result.shield.waivedAlertIds).toContain("pdrift:anthropic:claude-sonnet-4-5:humanloop-support-eval:humanloopMetadataEvidence");
    expect(result.watch.alertCount).toBe(0);
  });

  test("rejects Humanloop content payloads and provider-version mismatches", () => {
    const result = runHumanloopProviderDrift(requestBody({
      humanloop: {
        baseline: [metadata(baseline, "baseline")],
        candidate: [metadata(candidate, "candidate", {
          providerVersion: "2026-06-14",
          // Deliberately forbidden: Humanloop integration must stay metadata-only.
          promptText: "do not copy prompt text",
        } as Partial<HumanloopProviderDriftMetadata>)],
      },
    }));

    expect(result.report.failClosed).toBe(true);
    expect(result.humanloopEvidence[1]?.missingReasons).toEqual(expect.arrayContaining([
      "candidate:metadataOnly:promptText",
      "candidate:providerVersionMismatch",
    ]));
  });

  test("serves Humanloop provider drift through the Watch API with Score and Shield payloads", async () => {
    const req = mockReq("POST", "/api/v1/watch/humanloop-provider-drift", requestBody());
    const { res, state } = mockRes();
    const handled = await handleWatchRoute("/api/v1/watch/humanloop-provider-drift", "POST", req, res, process.cwd());
    const json = JSON.parse(state.body);

    expect(handled).toBe(true);
    expect(state.statusCode).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.data.humanloopEvidenceHash).toMatch(/^[a-f0-9]{64}$/);
    expect(json.data.score.providerVersions).toContain("anthropic/claude-sonnet-4-5@2026-06-15");
    expect(json.data.shield.gate.passed).toBe(true);
    expect(json.data.watch.alertCount).toBe(0);
    expect(json.data.sourceRefs).toEqual(expect.arrayContaining(["https://humanloop.com/docs/guides/observability/monitoring.md"]));
  });
});
