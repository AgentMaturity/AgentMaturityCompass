import type { IncomingMessage, ServerResponse } from "node:http";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { Readable } from "node:stream";
import { afterEach, describe, expect, test } from "vitest";
import { handleApiRoute } from "../src/api/index.js";
import {
  expireReasoningMemory,
  listReasoningMemoryItems,
  loadReasoningMemoryItem,
  retrieveReasoningMemory,
  writeReasoningMemoryFromEpisode
} from "../src/learning/reasoningMemory.js";
import { episodeRecordPath, writeEpisodeRecord, type EpisodeRecord } from "../src/lifecycle/episodeRecord.js";
import type { DiagnosticReport } from "../src/types.js";

const roots: string[] = [];

function workspace(): string {
  const dir = mkdtempSync(join(tmpdir(), "amc-reasoning-memory-"));
  roots.push(dir);
  return dir;
}

function diagnosticReport(runId = "memory-run-1", failures = true): DiagnosticReport {
  return {
    agentId: "default",
    runId,
    ts: Date.UTC(2026, 4, 22, 12, 0, 0),
    windowStartTs: Date.UTC(2026, 4, 22, 11, 55, 0),
    windowEndTs: Date.UTC(2026, 4, 22, 12, 0, 0),
    status: "VALID",
    verificationPassed: true,
    trustBoundaryViolated: false,
    trustBoundaryMessage: null,
    integrityIndex: failures ? 0.62 : 0.91,
    trustLabel: failures ? "MEDIUM TRUST" : "HIGH TRUST",
    targetProfileId: null,
    layerScores: [{ layerName: "Agent Resilience", avgFinalLevel: failures ? 2 : 4, confidenceWeightedFinalLevel: failures ? 2 : 4 }],
    questionScores: failures
      ? [
          {
            questionId: "AMC-1.1",
            claimedLevel: 4,
            supportedMaxLevel: 1,
            finalLevel: 1,
            confidence: 0.6,
            evidenceEventIds: ["trace-hallucinated"],
            flags: ["unsupported claim"],
            narrative: "Unsupported claim with no source citation.",
          },
          {
            questionId: "AMC-1.2",
            claimedLevel: 4,
            supportedMaxLevel: 2,
            finalLevel: 2,
            confidence: 0.7,
            evidenceEventIds: ["trace-schema"],
            flags: ["invalid json schema"],
            narrative: "Malformed JSON response missing required field.",
          },
        ]
      : [
          {
            questionId: "AMC-1.1",
            claimedLevel: 4,
            supportedMaxLevel: 4,
            finalLevel: 4,
            confidence: 0.9,
            evidenceEventIds: ["trace-success"],
            flags: [],
            narrative: "Evidence-backed success.",
          },
        ],
    inflationAttempts: [],
    unsupportedClaimCount: failures ? 1 : 0,
    contradictionCount: 0,
    correlationRatio: 1,
    invalidReceiptsCount: 0,
    correlationWarnings: [],
    evidenceCoverage: failures ? 0.5 : 0.9,
    evidenceTrustCoverage: { observed: 1, attested: 0, selfReported: 0 },
    targetDiff: [],
    prioritizedUpgradeActions: failures ? ["Fix unsupported claim handling."] : [],
    evidenceToCollectNext: failures ? ["Capture redacted trace snippets."] : [],
    runSealSig: "sig",
    reportJsonSha256: "sha",
  };
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
    }
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

function writeEmptyEpisode(ws: string): EpisodeRecord {
  const episode: EpisodeRecord = {
    schemaVersion: "2026-05-22",
    episodeId: "episode-empty-memory",
    runId: "empty-memory",
    lifecycleRunId: "lifecycle-empty-memory",
    agentId: "default",
    workspace: ws,
    source: "cli",
    command: "amc",
    lifecycleStage: "score.generated",
    startedAt: new Date(Date.UTC(2026, 4, 22, 11, 55, 0)).toISOString(),
    endedAt: new Date(Date.UTC(2026, 4, 22, 12, 0, 0)).toISOString(),
    rawTraceRefs: [],
    distilledEvidenceRefs: [],
    failureClassifications: [],
    evaluations: {
      diagnosticRunId: "empty-memory",
      status: "VALID",
      integrityIndex: 0.9,
      evidenceCoverage: 0,
      questionCount: 0
    },
    resourceManifestIds: [],
    receipts: [],
    observabilityRecords: []
  };
  const path = episodeRecordPath(ws, "default", episode.runId);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(episode, null, 2)}\n`);
  return episode;
}

afterEach(() => {
  while (roots.length > 0) {
    const dir = roots.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

describe("governed reasoning memory", () => {
  test("writes evidence-backed failure lessons and attaches a lifecycle receipt to the episode", () => {
    const ws = workspace();
    const episode = writeEpisodeRecord({
      workspace: ws,
      report: diagnosticReport("memory-run-failure", true),
      source: "cli",
      command: "amc",
    }).episode;

    const result = writeReasoningMemoryFromEpisode({
      workspace: ws,
      agentId: "default",
      episodeSelector: episode.episodeId
    });

    expect(result.items).toHaveLength(1);
    expect(result.receipts).toHaveLength(1);
    expect(result.receipts[0]!.decision).toBe("accepted");
    expect(result.items[0]!.lessonType).toBe("failure_lesson");
    expect(result.items[0]!.evidenceRefs.length).toBeGreaterThan(1);
    expect(result.items[0]!.allowedConsumers).toEqual(["score", "recommendation", "fixer", "studio"]);
    expect(result.items[0]!.summary).not.toContain("sk-");
    expect(result.items[0]!.signaturePath).toBeTruthy();

    const updatedEpisode = JSON.parse(readFileSync(episodeRecordPath(ws, "default", episode.runId), "utf8")) as EpisodeRecord;
    expect(updatedEpisode.receipts).toContain(result.receipts[0]!.receiptId);

    const retrieved = retrieveReasoningMemory({ workspace: ws, agentId: "default", consumer: "score" });
    expect(retrieved.items).toHaveLength(1);
    expect(retrieved.citations[0]!.memoryId).toBe(result.items[0]!.memoryId);
  });

  test("merges duplicate lessons instead of creating duplicate memory items", () => {
    const ws = workspace();
    const episode = writeEpisodeRecord({
      workspace: ws,
      report: diagnosticReport("memory-run-dedupe", true),
      source: "cli",
      command: "amc",
    }).episode;

    const first = writeReasoningMemoryFromEpisode({ workspace: ws, agentId: "default", episodeSelector: episode.episodeId });
    const second = writeReasoningMemoryFromEpisode({ workspace: ws, agentId: "default", episodeSelector: episode.episodeId });

    expect(first.receipts[0]!.decision).toBe("accepted");
    expect(second.receipts[0]!.decision).toBe("merged");
    const items = listReasoningMemoryItems({ workspace: ws, agentId: "default" });
    expect(items).toHaveLength(1);
    expect(items[0]!.occurrenceCount).toBe(2);
  });

  test("redacts secret-like text before storage", () => {
    const ws = workspace();
    const episode = writeEpisodeRecord({
      workspace: ws,
      report: diagnosticReport("memory-run-redaction", false),
      source: "cli",
      command: "amc",
    }).episode;

    const result = writeReasoningMemoryFromEpisode({
      workspace: ws,
      agentId: "default",
      episodeSelector: episode.episodeId,
      summaryOverride: "Successful pattern used bearer abcdefghijklmnop and sk-1234567890abcdef.",
    });

    expect(result.receipts[0]!.decision).toBe("accepted");
    expect(result.items[0]!.summary).toContain("[REDACTED]");
    expect(result.items[0]!.summary).not.toContain("abcdefghijklmnop");
    expect(result.items[0]!.summary).not.toContain("sk-1234567890abcdef");
  });

  test("rejects unsupported writeback without durable evidence", () => {
    const ws = workspace();
    const episode = writeEmptyEpisode(ws);

    const result = writeReasoningMemoryFromEpisode({
      workspace: ws,
      agentId: "default",
      episodeSelector: episode.episodeId
    });

    expect(result.items).toHaveLength(0);
    expect(result.receipts[0]!.decision).toBe("rejected");
    expect(result.receipts[0]!.gates.some((gate) => gate.id === "evidence-required" && gate.status === "blocked")).toBe(true);
    expect(listReasoningMemoryItems({ workspace: ws, agentId: "default" })).toHaveLength(0);
  });

  test("expires memory items and removes them from retrieval", () => {
    const ws = workspace();
    const episode = writeEpisodeRecord({
      workspace: ws,
      report: diagnosticReport("memory-run-expiry", false),
      source: "cli",
      command: "amc",
    }).episode;
    const result = writeReasoningMemoryFromEpisode({
      workspace: ws,
      agentId: "default",
      episodeSelector: episode.episodeId,
      ttlDays: 1
    });

    const expiresAt = result.items[0]!.expiresAt;
    const expired = expireReasoningMemory({
      workspace: ws,
      agentId: "default",
      now: new Date(Date.parse(expiresAt) + 1000).toISOString()
    });

    expect(expired).toContain(result.items[0]!.memoryId);
    const retrieved = retrieveReasoningMemory({
      workspace: ws,
      agentId: "default",
      consumer: "studio",
      now: new Date(Date.parse(expiresAt) + 2000).toISOString()
    });
    expect(retrieved.items).toHaveLength(0);
    expect(loadReasoningMemoryItem({ workspace: ws, agentId: "default", selector: result.items[0]!.memoryId }).status).toBe("expired");
  });

  test("exposes writeback, retrieval, and inspection through the API", async () => {
    const ws = workspace();
    const episode = writeEpisodeRecord({
      workspace: ws,
      report: diagnosticReport("memory-run-api", true),
      source: "api",
      command: "amc",
    }).episode;

    const created = await callApi({
      pathname: "/api/v1/memory/reasoning/writeback",
      method: "POST",
      body: { agentId: "default", episodeSelector: episode.episodeId },
      workspace: ws,
    });
    expect(created.status).toBe(201);
    expect(created.json.data.items).toHaveLength(1);

    const list = await callApi({
      pathname: "/api/v1/memory/reasoning",
      url: "/api/v1/memory/reasoning?agentId=default&consumer=fixer",
      workspace: ws,
    });
    expect(list.status).toBe(200);
    expect(list.json.data.items).toHaveLength(1);

    const itemId = created.json.data.items[0].memoryId;
    const show = await callApi({
      pathname: `/api/v1/memory/reasoning/${itemId}`,
      url: `/api/v1/memory/reasoning/${itemId}?agentId=default`,
      workspace: ws,
    });
    expect(show.status).toBe(200);
    expect(show.json.data.memoryId).toBe(itemId);
    expect(existsSync(join(ws, ".amc", "memory", "reasoning", "receipts"))).toBe(true);
  });
});
