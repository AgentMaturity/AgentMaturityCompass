import { Readable } from "node:stream";
import { describe, expect, test } from "vitest";
import { handleScoreRoute } from "../src/api/scoreRouter.js";
import { handleShieldRoute } from "../src/api/shieldRouter.js";
import { handleWatchRoute } from "../src/api/watchRouter.js";
import type { RunPromptfooProviderDriftInput } from "../src/benchmarks/promptfooProviderDrift.js";

const hash = (seed: string): string => seed.repeat(64).slice(0, 64);

const body: RunPromptfooProviderDriftInput = {
  agentId: "support-agent",
  baseline: [{
    provider: "anthropic",
    model: "claude-sonnet-4-5",
    version: "2026-06-01",
    canaryId: "promptfoo-agent-regression",
    benchmarkFamily: "llmops-provider-drift",
    capabilityId: "promptfoo-provider-canary",
    sampleSize: 24,
    scoreMean0to1: 0.91,
    refusalRate0to1: 0.03,
    latencyMsP95: 1200,
    costUsdMean: 0.004,
    evidenceRefs: ["promptfoo:baseline-canary"],
    signedEvidenceRefs: ["ledger:promptfoo-baseline"],
  }],
  candidate: [{
    provider: "anthropic",
    model: "claude-sonnet-4-5",
    version: "2026-06-14",
    canaryId: "promptfoo-agent-regression",
    benchmarkFamily: "llmops-provider-drift",
    capabilityId: "promptfoo-provider-canary",
    sampleSize: 24,
    scoreMean0to1: 0.90,
    refusalRate0to1: 0.035,
    latencyMsP95: 1210,
    costUsdMean: 0.0041,
    evidenceRefs: ["promptfoo:candidate-canary"],
    signedEvidenceRefs: ["ledger:promptfoo-candidate"],
  }],
  promptfoo: {
    baseline: [{
      provider: "anthropic",
      model: "claude-sonnet-4-5",
      canaryId: "promptfoo-agent-regression",
      providerVersion: "2026-06-01",
      promptfooVersion: "promptfoo-v0.119.13",
      sourceRefHash: hash("a"),
      repositorySnapshotHash: hash("b"),
      packageManifestHash: hash("c"),
      benchmarksModuleHash: hash("d"),
      watchModuleHash: hash("e"),
      apiModuleHash: hash("f"),
      providerRouteHash: hash("1"),
      evalConfigHash: hash("2"),
      canaryResultHash: hash("3"),
      driftStatisticHash: hash("4"),
      alertOrWaiverHash: hash("5"),
      replayCommandHash: hash("6"),
      signedEvidenceBundleHash: hash("7"),
      noSourceCopyProofHash: hash("8"),
      metricIds: ["score", "refusal_rate", "latency", "cost"],
      metricCount: 4,
    }],
    candidate: [{
      provider: "anthropic",
      model: "claude-sonnet-4-5",
      canaryId: "promptfoo-agent-regression",
      providerVersion: "2026-06-14",
      promptfooVersion: "promptfoo-v0.119.13",
      sourceRefHash: hash("a"),
      repositorySnapshotHash: hash("b"),
      packageManifestHash: hash("c"),
      benchmarksModuleHash: hash("d"),
      watchModuleHash: hash("e"),
      apiModuleHash: hash("f"),
      providerRouteHash: hash("1"),
      evalConfigHash: hash("2"),
      canaryResultHash: hash("9"),
      driftStatisticHash: hash("0"),
      alertOrWaiverHash: hash("5"),
      replayCommandHash: hash("6"),
      signedEvidenceBundleHash: hash("7"),
      noSourceCopyProofHash: hash("8"),
      metricIds: ["score", "refusal_rate", "latency", "cost"],
      metricCount: 4,
    }],
  },
};

async function callRoute(
  handler: (pathname: string, method: string, req: any, res: any, workspace?: string) => Promise<boolean>,
  pathname: string,
): Promise<any> {
  const req = Readable.from([JSON.stringify(body)]) as any;
  req.url = pathname;
  req.method = "POST";
  const res: any = {
    statusCode: 0,
    headers: {},
    payload: "",
    writeHead(status: number, headers: Record<string, string>) {
      this.statusCode = status;
      this.headers = headers;
    },
    end(chunk: string) {
      this.payload = chunk;
    },
  };
  const handled = await handler(pathname, "POST", req, res, process.cwd());
  expect(handled).toBe(true);
  expect(res.statusCode).toBe(200);
  return JSON.parse(res.payload);
}

describe("promptfoo provider-drift API surfaces", () => {
  test("Score returns provider versions, canary results, and drift statistics", async () => {
    const response = await callRoute(handleScoreRoute, "/api/v1/score/promptfoo-provider-drift");
    expect(response.data.providerVersions).toEqual([
      "anthropic/claude-sonnet-4-5@2026-06-01",
      "anthropic/claude-sonnet-4-5@2026-06-14",
    ]);
    expect(response.data.canaryResults).toHaveLength(1);
    expect(response.data.driftStatistics[0].driftStatistic).toBeGreaterThan(0);
    expect(response.data.failClosed).toBe(false);
  });

  test("Watch projects promptfoo receipt into watch alerts", async () => {
    const response = await callRoute(handleWatchRoute, "/api/v1/watch/promptfoo-provider-drift");
    expect(response.data.promptfooEvidenceHash).toMatch(/^[a-f0-9]{64}$/);
    expect(response.data.watchAlerts).toEqual([]);
    expect(response.data.failClosed).toBe(false);
  });

  test("Shield verifies promptfoo provider-drift gate", async () => {
    const response = await callRoute(handleShieldRoute, "/api/v1/shield/promptfoo-provider-drift/verify");
    expect(response.data.verification).toBe("passed");
    expect(response.data.ciGate.passed).toBe(true);
    expect(response.data.activeAlerts).toEqual([]);
    expect(response.data.waivedAlerts).toEqual([]);
  });
});
