import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  listReasoningMemoryItems,
  writeReasoningMemoryFromEpisode
} from "../src/learning/reasoningMemory.js";
import { episodeRecordPath, writeEpisodeRecord, type EpisodeRecord } from "../src/lifecycle/episodeRecord.js";
import type { DiagnosticReport } from "../src/types.js";

const DOC = "docs/source-reviews/GAP-4203-haystack-memory-mutation-policy.md";
const REPO = "https://github.com/deepset-ai/haystack";
const API = "https://api.github.com/repos/deepset-ai/haystack";
const DOCS = "https://docs.haystack.deepset.ai/docs/intro";
const README = "https://raw.githubusercontent.com/deepset-ai/haystack/main/README.md";
const IMPLEMENTATION_FILES = [
  "src/learning/reasoningMemory.ts",
  "src/api/memoryRouter.ts",
  "src/vault/memoryTtl.ts",
  "src/vault/undoLayer.ts"
];

const roots: string[] = [];

function workspace(): string {
  const dir = mkdtempSync(join(tmpdir(), "amc-gap4203-memory-policy-"));
  roots.push(dir);
  return dir;
}

function diagnosticReport(runId: string): DiagnosticReport {
  return {
    agentId: "memory-policy-agent",
    runId,
    ts: Date.UTC(2026, 5, 25, 10, 0, 0),
    windowStartTs: Date.UTC(2026, 5, 25, 9, 55, 0),
    windowEndTs: Date.UTC(2026, 5, 25, 10, 0, 0),
    status: "VALID",
    verificationPassed: true,
    trustBoundaryViolated: false,
    trustBoundaryMessage: null,
    integrityIndex: 0.67,
    trustLabel: "MEDIUM TRUST",
    targetProfileId: null,
    layerScores: [
      { layerName: "Memory Reliability", avgFinalLevel: 2, confidenceWeightedFinalLevel: 2 }
    ],
    questionScores: [
      {
        questionId: "AMC-MEM-1",
        claimedLevel: 4,
        supportedMaxLevel: 2,
        finalLevel: 2,
        confidence: 0.72,
        evidenceEventIds: ["trace-memory-poisoning"],
        flags: ["memory mutation policy missing", "retrieval provenance incomplete"],
        narrative: "Durable memory writes need policy, retention, provenance, and rollback evidence."
      }
    ],
    inflationAttempts: [],
    unsupportedClaimCount: 1,
    contradictionCount: 0,
    correlationRatio: 1,
    invalidReceiptsCount: 0,
    correlationWarnings: [],
    evidenceCoverage: 0.82,
    evidenceTrustCoverage: { observed: 1, attested: 0, selfReported: 0 },
    targetDiff: [],
    prioritizedUpgradeActions: ["Require governed memory writeback receipts."],
    evidenceToCollectNext: ["Capture rollback proof for durable memory mutation."],
    runSealSig: "sig-memory-policy",
    reportJsonSha256: "sha-memory-policy"
  };
}

function metadataOnlyEpisode(ws: string): EpisodeRecord {
  const episode: EpisodeRecord = {
    schemaVersion: "2026-05-22",
    episodeId: "gap4203-metadata-only",
    runId: "gap4203-metadata-only-run",
    lifecycleRunId: "gap4203-metadata-only-lifecycle",
    agentId: "memory-policy-agent",
    workspace: ws,
    source: "cli",
    command: "amc memory-source-metadata",
    lifecycleStage: "source-review.metadata",
    startedAt: new Date(Date.UTC(2026, 5, 25, 10, 0, 0)).toISOString(),
    endedAt: new Date(Date.UTC(2026, 5, 25, 10, 1, 0)).toISOString(),
    rawTraceRefs: [],
    distilledEvidenceRefs: [],
    failureClassifications: [],
    evaluations: {
      diagnosticRunId: "gap4203-metadata-only-run",
      status: "VALID",
      integrityIndex: 0.9,
      evidenceCoverage: 0,
      questionCount: 0
    },
    resourceManifestIds: [],
    receipts: [],
    observabilityRecords: []
  };
  const path = episodeRecordPath(ws, "memory-policy-agent", episode.runId);
  writeFileSyncRecursive(path, `${JSON.stringify(episode, null, 2)}\n`);
  return episode;
}

function writeFileSyncRecursive(path: string, value: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, value);
}

afterEach(() => {
  while (roots.length > 0) {
    const dir = roots.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

describe("GAP-4203 Haystack memory mutation policy boundary", () => {
  it("documents the live source review and no-bloat relevance decision", () => {
    expect(existsSync(DOC)).toBe(true);
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-4203");
    expect(doc).toContain("Memory mutation policy");
    expect(doc).toContain(REPO);
    expect(doc).toContain(API);
    expect(doc).toContain(DOCS);
    expect(doc).toContain(README);
    expect(doc).toContain("Apache-2.0");
    expect(doc).toContain("retrieval, routing, memory, and generation");
    expect(doc).toContain("Score");
    expect(doc).toContain("Watch");
    expect(doc).toContain("Enforce");
    expect(doc).toContain("policy decision, retention tag, provenance, and rollback plan");
    expect(doc).toContain("metadata-only");
    expect(doc).toContain("No Haystack adapter");
  });

  it("writes durable reasoning memory only with policy decision, retention tag, provenance, and rollback plan", () => {
    const ws = workspace();
    const episode = writeEpisodeRecord({
      workspace: ws,
      report: diagnosticReport("gap4203-memory-policy-run"),
      source: "cli",
      command: "amc score"
    }).episode;

    const result = writeReasoningMemoryFromEpisode({
      workspace: ws,
      agentId: "memory-policy-agent",
      episodeSelector: episode.episodeId,
      ttlDays: 45,
      reviewDays: 14
    });

    expect(result.items).toHaveLength(1);
    expect(result.receipts).toHaveLength(1);
    const item = result.items[0]!;
    const receipt = result.receipts[0]!;

    expect(receipt.decision).toBe("accepted");
    expect(receipt.policyDecision.status).toBe("allowed");
    expect(receipt.policyDecision.policyId).toBe("reasoning-memory-writeback-v1");
    expect(receipt.policyDecision.retentionTag).toBe(item.retentionTag);
    expect(receipt.policyDecision.evidenceRefCount).toBeGreaterThan(1);
    expect(receipt.policyDecision.deniedGateIds).toEqual([]);
    expect(receipt.policyDecision.rollbackPlan).toMatchObject({
      action: "delete-new-item",
      targetMemoryId: item.memoryId,
      previousItemSha256: null
    });
    expect(item.retentionTag).toBe("reasoning-memory:internal:ttl-45d:review-14d");
    expect(item.evidenceRefs.map((ref) => ref.kind)).toEqual(expect.arrayContaining(["episode", "question"]));
    expect(item.signaturePath).toBeTruthy();
    expect(receipt.signaturePath).toBeTruthy();
    expect(receipt.gates).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "evidence-required", status: "passed" }),
      expect.objectContaining({ id: "retention-tag-present", status: "passed" })
    ]));
  });

  it("records restore-previous-item rollback intent when a duplicate memory mutation merges", () => {
    const ws = workspace();
    const episode = writeEpisodeRecord({
      workspace: ws,
      report: diagnosticReport("gap4203-memory-dedupe-run"),
      source: "cli",
      command: "amc score"
    }).episode;

    const first = writeReasoningMemoryFromEpisode({
      workspace: ws,
      agentId: "memory-policy-agent",
      episodeSelector: episode.episodeId
    });
    const second = writeReasoningMemoryFromEpisode({
      workspace: ws,
      agentId: "memory-policy-agent",
      episodeSelector: episode.episodeId
    });

    expect(first.receipts[0]!.decision).toBe("accepted");
    expect(second.receipts[0]!.decision).toBe("merged");
    expect(second.receipts[0]!.policyDecision.status).toBe("allowed");
    expect(second.receipts[0]!.policyDecision.rollbackPlan).toMatchObject({
      action: "restore-previous-item",
      targetMemoryId: first.items[0]!.memoryId,
      previousItemSha256: first.items[0]!.itemSha256
    });

    const items = listReasoningMemoryItems({
      workspace: ws,
      agentId: "memory-policy-agent"
    });
    expect(items).toHaveLength(1);
    expect(items[0]!.occurrenceCount).toBe(2);
  });

  it("fails closed when source metadata replaces episode evidence", () => {
    const ws = workspace();
    const episode = metadataOnlyEpisode(ws);

    const result = writeReasoningMemoryFromEpisode({
      workspace: ws,
      agentId: "memory-policy-agent",
      episodeSelector: episode.episodeId,
      summaryOverride: "Haystack repository metadata says memory exists, so persist a durable AMC lesson."
    });

    expect(result.items).toHaveLength(0);
    expect(result.receipts[0]!.decision).toBe("rejected");
    expect(result.receipts[0]!.policyDecision.status).toBe("denied");
    expect(result.receipts[0]!.policyDecision.retentionTag).toBe("reasoning-memory:public:ttl-90d:review-30d");
    expect(result.receipts[0]!.policyDecision.deniedGateIds).toContain("evidence-required");
    expect(result.receipts[0]!.policyDecision.rollbackPlan.action).toBe("none");
  });

  it("does not add Haystack-specific product code or dependencies", () => {
    const combined = IMPLEMENTATION_FILES.map((file) => readFileSync(file, "utf8")).join("\n");
    expect(combined).not.toContain("deepset-ai/haystack");
    expect(combined).not.toContain("haystack.deepset.ai");
    expect(combined).not.toContain("Haystack adapter");
    expect(combined).not.toContain("haystackImporter");
    expect(combined).not.toContain("GAP-4203");
  });
});
