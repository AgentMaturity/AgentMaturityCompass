import type { IncomingMessage, ServerResponse } from "node:http";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { afterEach, describe, expect, test } from "vitest";
import { handleApiRoute } from "../src/api/index.js";
import {
  detectFleetCascadeFailures,
  loadFleetLifecycleRunArtifact,
  writeFleetLifecycleRunArtifact
} from "../src/fleet/fleetLifecycle.js";
import type { FleetScoringResult } from "../src/fleet/fleetScoring.js";
import type { DiagnosticReport } from "../src/types.js";

const roots: string[] = [];

function workspace(): string {
  const dir = mkdtempSync(join(tmpdir(), "amc-fleet-lifecycle-"));
  roots.push(dir);
  return dir;
}

function report(agentId: string, runId: string): DiagnosticReport {
  return {
    agentId,
    runId,
    ts: Date.UTC(2026, 4, 22, 12, 0, 0),
    windowStartTs: Date.UTC(2026, 4, 22, 11, 55, 0),
    windowEndTs: Date.UTC(2026, 4, 22, 12, 0, 0),
    status: "VALID",
    verificationPassed: true,
    trustBoundaryViolated: false,
    trustBoundaryMessage: null,
    integrityIndex: 0.5,
    trustLabel: "LOW TRUST",
    targetProfileId: null,
    layerScores: [{ layerName: "Resilience", avgFinalLevel: 1, confidenceWeightedFinalLevel: 1 }],
    questionScores: [{
      questionId: "AMC-CASCADE-1",
      claimedLevel: 1,
      supportedMaxLevel: 1,
      finalLevel: 1,
      confidence: 0.7,
      evidenceEventIds: [`event-${agentId}`],
      flags: [],
      narrative: "Shared low-scoring control."
    }],
    inflationAttempts: [],
    unsupportedClaimCount: 0,
    contradictionCount: 0,
    correlationRatio: 1,
    invalidReceiptsCount: 0,
    correlationWarnings: [],
    evidenceCoverage: 0.4,
    evidenceTrustCoverage: { observed: 1, attested: 0, selfReported: 0 },
    targetDiff: [{ questionId: "AMC-CASCADE-1", current: 1, target: 3, gap: 2 }],
    prioritizedUpgradeActions: ["Fix shared cascade control."],
    evidenceToCollectNext: [],
    runSealSig: "sig",
    reportJsonSha256: "sha"
  };
}

function result(): FleetScoringResult {
  const reports = [report("alpha", "run-alpha"), report("bravo", "run-bravo")];
  return {
    runId: "fleet-run-cascade",
    ts: Date.UTC(2026, 4, 22, 12, 1, 0),
    window: "7d",
    agentCount: 2,
    agents: [
      {
        agentId: "alpha",
        overallScore: 1,
        integrityIndex: 0.5,
        trustLabel: "LOW TRUST",
        layerScores: { Resilience: 1 },
        weakestQuestions: [{ questionId: "AMC-CASCADE-1", level: 1, gap: 2 }],
        strongestQuestions: [{ questionId: "AMC-CASCADE-1", level: 1 }],
        evidenceCoverage: 0.4,
        status: "VALID",
        durationMs: 10,
        firstResultMs: 10,
        slaMs: 120_000,
        slaStatus: "met",
        lifecycleArtifactPath: "/tmp/alpha-lifecycle.json",
        episodePath: "/tmp/alpha-episode.json",
        resourceManifestId: "enforce-resources-alpha"
      },
      {
        agentId: "bravo",
        overallScore: 1,
        integrityIndex: 0.5,
        trustLabel: "LOW TRUST",
        layerScores: { Resilience: 1 },
        weakestQuestions: [{ questionId: "AMC-CASCADE-1", level: 1, gap: 2 }],
        strongestQuestions: [{ questionId: "AMC-CASCADE-1", level: 1 }],
        evidenceCoverage: 0.4,
        status: "VALID",
        durationMs: 10,
        firstResultMs: 10,
        slaMs: 120_000,
        slaStatus: "met",
        lifecycleArtifactPath: "/tmp/bravo-lifecycle.json",
        episodePath: "/tmp/bravo-episode.json",
        resourceManifestId: "enforce-resources-bravo"
      }
    ],
    failures: [],
    aggregate: {
      fleetMeanScore: 1,
      fleetMedianScore: 1,
      fleetMinScore: 1,
      fleetMaxScore: 1,
      fleetStdDev: 0,
      layerAverages: { Resilience: 1 },
      layerWorst: { Resilience: { agentId: "alpha", score: 1 } }
    },
    weakLinks: [],
    cascadeFailures: [],
    pairComparisons: [{
      agentA: "alpha",
      agentB: "bravo",
      scoreDelta: 0,
      aLeads: [],
      bLeads: [],
      sharedWeaknesses: ["AMC-CASCADE-1"]
    }],
    diagnosticReports: reports,
    progressEvents: [],
    fleetLifecycle: null,
    reportSha256: "0".repeat(64)
  };
}

function mockReq(method: string, url: string): IncomingMessage {
  const req = Readable.from([]) as unknown as IncomingMessage;
  (req as { method?: string; url?: string }).method = method;
  (req as { method?: string; url?: string }).url = url;
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
    }
  } as unknown as ServerResponse;
  return { res, state };
}

afterEach(() => {
  while (roots.length > 0) {
    const dir = roots.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

describe("fleet lifecycle evidence spine", () => {
  test("classifies cross-agent cascade failures and writes parent artifact with child evidence", () => {
    const ws = workspace();
    const fleetResult = result();
    const failures = detectFleetCascadeFailures(fleetResult);
    expect(failures).toHaveLength(1);
    expect(failures[0]!.type).toBe("shared_question_weakness");
    expect(failures[0]!.agentIds).toEqual(["alpha", "bravo"]);

    fleetResult.cascadeFailures = failures;
    const written = writeFleetLifecycleRunArtifact({ workspace: ws, result: fleetResult });
    expect(existsSync(written.artifactPath)).toBe(true);
    expect(written.signaturePath).toBeTruthy();
    expect(written.artifact.parentRunId).toBe("fleet-parent-fleet-run-cascade");
    expect(written.artifact.childRuns).toHaveLength(2);
    expect(written.artifact.evidenceSummary.childLifecycleRunIds).toEqual(["lifecycle-run-alpha", "lifecycle-run-bravo"]);
    expect(written.artifact.cascadeFailures[0]!.questionIds).toEqual(["AMC-CASCADE-1"]);

    const loaded = loadFleetLifecycleRunArtifact({ workspace: ws, selector: written.artifact.fleetLifecycleRunId, redacted: true });
    expect(loaded.workspace).toBe("$WORKSPACE");
    expect(loaded.childRuns[0]!.episodePath).toBe("/tmp/alpha-episode.json");
  });

  test("exposes fleet lifecycle artifacts through fleet API", async () => {
    const ws = workspace();
    const fleetResult = result();
    fleetResult.cascadeFailures = detectFleetCascadeFailures(fleetResult);
    const written = writeFleetLifecycleRunArtifact({ workspace: ws, result: fleetResult });

    const req = mockReq("GET", "/api/v1/fleet/lifecycle?limit=5");
    const { res, state } = mockRes();
    const handled = await handleApiRoute("/api/v1/fleet/lifecycle", "GET", req, res, ws);
    expect(handled).toBe(true);
    expect(state.statusCode).toBe(200);
    const listed = JSON.parse(state.body) as { ok: boolean; data: { runs: Array<{ fleetLifecycleRunId: string }> } };
    expect(listed.data.runs[0]!.fleetLifecycleRunId).toBe(written.artifact.fleetLifecycleRunId);

    const showReq = mockReq("GET", `/api/v1/fleet/lifecycle/${written.artifact.fleetLifecycleRunId}`);
    const shown = mockRes();
    await handleApiRoute(`/api/v1/fleet/lifecycle/${written.artifact.fleetLifecycleRunId}`, "GET", showReq, shown.res, ws);
    const detail = JSON.parse(shown.state.body) as { ok: boolean; data: { cascadeFailures: unknown[] } };
    expect(detail.data.cascadeFailures).toHaveLength(1);
  });
});
