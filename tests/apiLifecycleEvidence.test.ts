import type { IncomingMessage, ServerResponse } from "node:http";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { afterEach, describe, expect, test } from "vitest";
import { handleApiRoute } from "../src/api/index.js";
import { enforceResourceManifestRef, writeEnforceResourceManifest } from "../src/enforce/resourceManifest.js";
import { getAgentPaths } from "../src/fleet/paths.js";
import { writeDecisionReceipts } from "../src/lifecycle/decisionReceipt.js";
import { writeEpisodeRecord } from "../src/lifecycle/episodeRecord.js";
import { writeFindingProofs } from "../src/lifecycle/findingProof.js";
import { writeLifecycleChangeReceipts } from "../src/lifecycle/changeReceipt.js";
import { writeLifecycleRunArtifact } from "../src/lifecycle/lifecycleRunArtifact.js";
import { writeObservabilityLaneRecord } from "../src/lifecycle/observabilityLane.js";
import type { DiagnosticReport } from "../src/types.js";

const roots: string[] = [];

function workspace(): string {
  const dir = mkdtempSync(join(tmpdir(), "amc-api-lifecycle-"));
  roots.push(dir);
  return dir;
}

function mockReq(method: string, url: string, body?: unknown): IncomingMessage {
  const payload = body === undefined ? "" : JSON.stringify(body);
  const req = Readable.from(payload.length > 0 ? [Buffer.from(payload, "utf8")] : []) as unknown as IncomingMessage;
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
    },
  } as unknown as ServerResponse;
  return { res, state };
}

async function callApi(params: {
  pathname: string;
  method?: string;
  url?: string;
  body?: unknown;
  workspace: string;
}): Promise<{ status: number; json: { ok: boolean; data?: any; error?: string } }> {
  const method = params.method ?? "GET";
  const req = mockReq(method, params.url ?? params.pathname, params.body);
  const { res, state } = mockRes();
  const handled = await handleApiRoute(params.pathname, method, req, res, params.workspace);
  expect(handled).toBe(true);
  return { status: state.statusCode, json: JSON.parse(state.body) as { ok: boolean; data?: any; error?: string } };
}

function sampleReport(): DiagnosticReport {
  return {
    agentId: "default",
    runId: "22222222-2222-4222-8222-222222222222",
    ts: Date.UTC(2026, 4, 22, 12, 0, 0),
    windowStartTs: Date.UTC(2026, 4, 22, 11, 58, 0),
    windowEndTs: Date.UTC(2026, 4, 22, 12, 0, 0),
    status: "VALID",
    verificationPassed: true,
    trustBoundaryViolated: false,
    trustBoundaryMessage: null,
    integrityIndex: 0.92,
    trustLabel: "HIGH TRUST",
    targetProfileId: null,
    layerScores: [{ layerName: "Strategic Agent Operations", avgFinalLevel: 3, confidenceWeightedFinalLevel: 3 }],
    questionScores: [
      {
        questionId: "AMC-1.1",
        claimedLevel: 2,
        supportedMaxLevel: 2,
        finalLevel: 2,
        confidence: 0.8,
        evidenceEventIds: ["ev-1"],
        flags: ["missing-policy"],
        narrative: "Policy evidence is incomplete.",
      },
    ],
    inflationAttempts: [],
    unsupportedClaimCount: 0,
    contradictionCount: 0,
    correlationRatio: 1,
    invalidReceiptsCount: 0,
    correlationWarnings: [],
    evidenceCoverage: 0.6,
    evidenceTrustCoverage: { observed: 1, attested: 0, selfReported: 0 },
    targetDiff: [{ questionId: "AMC-1.1", current: 2, target: 4, gap: 2 }],
    prioritizedUpgradeActions: ["Add runtime policy evidence."],
    evidenceToCollectNext: ["Capture approval gate evidence for sensitive actions."],
    runSealSig: "sig",
    reportJsonSha256: "sha",
  };
}

afterEach(() => {
  while (roots.length > 0) {
    const dir = roots.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

describe("lifecycle evidence API parity", () => {
  test("exposes canonical surfaces, lifecycle runs, episodes, decisions, and Enforce resources", async () => {
    const ws = workspace();
    mkdirSync(join(ws, ".amc"), { recursive: true });
    writeFileSync(join(ws, ".amc", "agent.config.yaml"), "agentId: default\n");
    writeFileSync(join(ws, ".amc", "guardrails.yaml"), "rules: []\n");

    const report = sampleReport();
    mkdirSync(getAgentPaths(ws, "default").runsDir, { recursive: true });
    writeFileSync(join(getAgentPaths(ws, "default").runsDir, `${report.runId}.json`), `${JSON.stringify(report, null, 2)}\n`);
    const manifestResult = writeEnforceResourceManifest({ workspace: ws, agentId: "default" });
    const manifestRef = enforceResourceManifestRef(manifestResult);
    const episodeId = `episode-${report.runId}`;
    const decisions = writeDecisionReceipts({
      workspace: ws,
      report,
      command: "amc",
      resourceManifestIds: [manifestRef.manifestId],
    });
    const findingProofs = writeFindingProofs({
      workspace: ws,
      report,
      command: "amc",
      episodeIds: [episodeId],
      resourceManifestIds: [manifestRef.manifestId],
      decisionReceipts: decisions.receipts,
    });
    const lifecycleReceipts = writeLifecycleChangeReceipts({
      workspace: ws,
      report,
      command: "amc",
      resourceManifestIds: [manifestRef.manifestId],
      decisionReceipts: decisions.receipts,
      findingProofs: [findingProofs.proofSetRef],
    });
    const observability = writeObservabilityLaneRecord({
      workspace: ws,
      report,
      source: "cli",
      command: "amc",
      episodeIds: [episodeId],
      lifecycleReceiptIds: lifecycleReceipts.receipts.map((receipt) => receipt.receiptId),
      resourceManifests: [manifestRef],
      decisionReceipts: decisions.receipts,
    });
    const episode = writeEpisodeRecord({
      workspace: ws,
      report,
      source: "cli",
      command: "amc",
      resourceManifestIds: [manifestRef.manifestId],
      observabilityRecords: [observability.ref],
    });
    writeLifecycleRunArtifact({
      workspace: ws,
      report,
      source: "cli",
      command: "amc",
      episodeRecords: [{ episodeId: episode.episode.episodeId, path: episode.episodePath }],
      decisionReceipts: decisions.receipts.map((receipt) => ({ receiptId: receipt.receiptId, path: decisions.receiptsPath })),
      lifecycleReceipts: lifecycleReceipts.refs,
      findingProofs: [findingProofs.proofSetRef],
      observabilityRecords: [observability.ref],
      resourceManifests: [manifestRef],
    });

    const surfaces = await callApi({ pathname: "/api/v1/lifecycle/surfaces", workspace: ws });
    expect(surfaces.status).toBe(200);
    expect(surfaces.json.data.order).toEqual(["Score", "Shield", "Enforce", "Vault", "Watch", "Comply", "Fleet", "Passport"]);
    expect(surfaces.json.data.surfaces[0].headline).toBe("Score trust before you ship");

    const lifecycleRuns = await callApi({ pathname: "/api/v1/lifecycle/runs", workspace: ws });
    expect(lifecycleRuns.status).toBe(200);
    expect(lifecycleRuns.json.data.total).toBe(1);

    const latest = await callApi({ pathname: "/api/v1/lifecycle/latest", workspace: ws });
    expect(latest.status).toBe(200);
    expect(latest.json.data.run.lifecycleRunId).toBe(`lifecycle-${report.runId}`);

    const latestRedacted = await callApi({
      pathname: "/api/v1/lifecycle/latest",
      url: "/api/v1/lifecycle/latest?redacted=true",
      workspace: ws,
    });
    expect(latestRedacted.status).toBe(200);
    expect(latestRedacted.json.data.run.workspace).toBe("$WORKSPACE");

    const lifecycleInspect = await callApi({ pathname: `/api/v1/lifecycle/runs/${report.runId}`, workspace: ws });
    expect(lifecycleInspect.status).toBe(200);
    expect(lifecycleInspect.json.data.evidence.resourceManifests[0].manifestId).toBe(manifestRef.manifestId);
    expect(lifecycleInspect.json.data.evidence.findingProofs[0].proofSetId).toBe(findingProofs.proofSetRef.proofSetId);
    expect(lifecycleInspect.json.data.evidence.lifecycleReceipts.length).toBeGreaterThan(0);

    const episodes = await callApi({ pathname: "/api/v1/evidence/episodes", workspace: ws });
    expect(episodes.status).toBe(200);
    expect(episodes.json.data.episodes[0].episodeId).toBe(episode.episode.episodeId);

    const episodeInspect = await callApi({ pathname: `/api/v1/evidence/episodes/${episode.episode.episodeId}`, workspace: ws });
    expect(episodeInspect.status).toBe(200);
    expect(episodeInspect.json.data.resourceManifestIds).toEqual([manifestRef.manifestId]);

    const episodeRedacted = await callApi({
      pathname: `/api/v1/evidence/episodes/${episode.episode.episodeId}`,
      url: `/api/v1/evidence/episodes/${episode.episode.episodeId}?redacted=true`,
      workspace: ws,
    });
    expect(episodeRedacted.status).toBe(200);
    expect(episodeRedacted.json.data.workspace).toBe("$WORKSPACE");

    const decisionList = await callApi({ pathname: "/api/v1/evidence/decisions", workspace: ws });
    expect(decisionList.status).toBe(200);
    expect(decisionList.json.data.receipts.length).toBeGreaterThan(0);

    const decisionInspect = await callApi({ pathname: `/api/v1/evidence/decisions/${decisions.receipts[0]!.receiptId}`, workspace: ws });
    expect(decisionInspect.status).toBe(200);
    expect(decisionInspect.json.data.subject.resourceManifestIds).toEqual([manifestRef.manifestId]);
    expect(decisionInspect.json.data.subject.componentIds.length).toBeGreaterThan(0);

    const observedReport: DiagnosticReport = {
      ...report,
      runId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      ts: Date.UTC(2026, 4, 23, 12, 0, 0),
      questionScores: report.questionScores.map((score) => ({
        ...score,
        finalLevel: 3,
        confidence: 0.8,
        evidenceEventIds: ["ev-observed"]
      })),
      evidenceCoverage: 0.8,
      unsupportedClaimCount: 0
    };
    writeFileSync(join(getAgentPaths(ws, "default").runsDir, `${observedReport.runId}.json`), `${JSON.stringify(observedReport, null, 2)}\n`);
    const decisionObserve = await callApi({
      pathname: "/api/v1/evidence/decisions/observe",
      method: "POST",
      body: { agentId: "default", runId: observedReport.runId },
      workspace: ws,
    });
    expect(decisionObserve.status).toBe(200);
    expect(decisionObserve.json.data.updatedCount).toBeGreaterThan(0);

    const observabilityList = await callApi({ pathname: "/api/v1/evidence/observability", workspace: ws });
    expect(observabilityList.status).toBe(200);
    expect(observabilityList.json.data.records[0].summary.componentCount).toBeGreaterThan(0);

    const observabilityInspect = await callApi({ pathname: `/api/v1/evidence/observability/${observability.record.observabilityId}`, workspace: ws });
    expect(observabilityInspect.status).toBe(200);
    expect(observabilityInspect.json.data.decisionChain.length).toBeGreaterThan(0);

    const proofList = await callApi({ pathname: "/api/v1/evidence/finding-proofs", workspace: ws });
    expect(proofList.status).toBe(200);
    expect(proofList.json.data.proofs[0].evidenceEpisodeIds).toEqual([episode.episode.episodeId]);
    expect(proofList.json.data.proofs[0].recommendationIds.length).toBeGreaterThan(0);

    const proofInspect = await callApi({ pathname: `/api/v1/evidence/finding-proofs/${findingProofs.proofs[0]!.proofId}`, workspace: ws });
    expect(proofInspect.status).toBe(200);
    expect(proofInspect.json.data.resourceManifestIds).toEqual([manifestRef.manifestId]);

    const lifecycleReceiptList = await callApi({ pathname: "/api/v1/evidence/lifecycle-receipts", workspace: ws });
    expect(lifecycleReceiptList.status).toBe(200);
    expect(lifecycleReceiptList.json.data.receipts.some((receipt: { receiptType: string }) => receipt.receiptType === "validation")).toBe(true);

    const lifecycleReceiptInspect = await callApi({ pathname: `/api/v1/evidence/lifecycle-receipts/${lifecycleReceipts.receipts[0]!.receiptId}`, workspace: ws });
    expect(lifecycleReceiptInspect.status).toBe(200);
    expect(lifecycleReceiptInspect.json.data.subject.resourceManifestIds).toEqual([manifestRef.manifestId]);

    const resourceList = await callApi({ pathname: "/api/v1/enforce/resources", workspace: ws });
    expect(resourceList.status).toBe(200);
    expect(resourceList.json.data.total).toBeGreaterThan(0);

    const resourcePath = ".amc/agent.config.yaml";
    const resourceInspect = await callApi({
      pathname: "/api/v1/enforce/resources/inspect",
      url: `/api/v1/enforce/resources/inspect?resource=${encodeURIComponent(resourcePath)}`,
      workspace: ws,
    });
    expect(resourceInspect.status).toBe(200);
    expect(resourceInspect.json.data.path).toBe(resourcePath);

    const resourceGet = await callApi({
      pathname: "/api/v1/enforce/resources/get",
      url: `/api/v1/enforce/resources/get?resource=${encodeURIComponent(resourcePath)}`,
      workspace: ws,
    });
    expect(resourceGet.status).toBe(200);
    expect(resourceGet.json.data.path).toBe(resourcePath);

    const verify = await callApi({ pathname: "/api/v1/enforce/resources/verify", workspace: ws });
    expect(verify.status).toBe(200);
    expect(verify.json.data.valid).toBe(true);
    expect(verify.json.data.signature.valid).toBe(true);

    const diff = await callApi({ pathname: "/api/v1/enforce/resources/diff", workspace: ws });
    expect(diff.status).toBe(200);
    expect(diff.json.data.changed).toEqual([]);

    const contract = await callApi({ pathname: "/api/v1/enforce/resources/contract", workspace: ws });
    expect(contract.status).toBe(200);
    expect(contract.json.data.surface).toBe("Enforce");
    expect(contract.json.data.verbs).toContain("rollback");

    const validate = await callApi({ pathname: "/api/v1/enforce/resources/validate", workspace: ws });
    expect(validate.status).toBe(200);
    expect(validate.json.data.status).toBe("valid");
    expect(validate.json.data.gates.some((gate: { id: string }) => gate.id === "manifest-signature-valid")).toBe(true);

    const propose = await callApi({ pathname: "/api/v1/enforce/resources/propose", workspace: ws });
    expect(propose.status).toBe(200);
    expect(propose.json.data.dryRun).toBe(true);

    const evaluate = await callApi({ pathname: "/api/v1/enforce/resources/evaluate", workspace: ws });
    expect(evaluate.status).toBe(200);
    expect(evaluate.json.data.decision).toBe("accept");

    const applyDryRun = await callApi({
      pathname: "/api/v1/enforce/resources/apply",
      method: "POST",
      body: { agentId: "default", dryRun: true },
      workspace: ws,
    });
    expect(applyDryRun.status).toBe(200);
    expect(applyDryRun.json.data.applied).toBe(false);

    const history = await callApi({ pathname: "/api/v1/enforce/resources/history", workspace: ws });
    expect(history.status).toBe(200);
    expect(history.json.data.entries.some((entry: { kind: string }) => entry.kind === "snapshot")).toBe(true);
  });
});
