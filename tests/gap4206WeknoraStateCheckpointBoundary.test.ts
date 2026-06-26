import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { verifyArtifactFileSignature } from "../src/lifecycle/artifactSignature.js";
import { appendRuntimeRunEvent, createRuntimeRun } from "../src/runtime/runManager.js";
import {
  createRuntimeStateCheckpoint,
  proveRuntimeStateRestore,
  renderRuntimeStateCheckpointAuditExport,
  verifyRuntimeStateCheckpoint,
  verifyRuntimeStateRestoreProof,
  type RuntimeStateCheckpointSourceCitation
} from "../src/runtime/stateCheckpoint.js";

const DOC = "docs/source-reviews/GAP-4206-weknora-state-checkpointing.md";
const GITHUB_REPO = "https://github.com/Tencent/WeKnora";
const GITHUB_API = "https://api.github.com/repos/Tencent/WeKnora";
const README = "https://raw.githubusercontent.com/Tencent/WeKnora/main/README.md";
const LICENSE = "https://raw.githubusercontent.com/Tencent/WeKnora/main/LICENSE";
const HOMEPAGE = "https://weknora.weixin.qq.com";
const TITLE = "Open-source LLM knowledge platform: turn raw documents into a queryable RAG, an autonomous reasoning agent, and a self-maintaining Wiki.";
const IDENTIFIER = "weknora_state_checkpointing";
const IMPLEMENTATION_FILES = [
  "src/runtime/stateCheckpoint.ts",
  "src/runtime/index.ts",
  "src/lifecycle/artifactSignature.ts"
];

const sourceCitations: RuntimeStateCheckpointSourceCitation[] = [
  {
    sourceId: "github-tencent-weknora",
    title: TITLE,
    url: GITHUB_REPO,
    retrievedAt: "2026-06-25T16:18:00.000Z"
  },
  {
    sourceId: "weknora-readme",
    title: "WeKnora README",
    url: README,
    retrievedAt: "2026-06-25T16:18:00.000Z"
  }
];

const roots: string[] = [];

function workspace(): string {
  const dir = mkdtempSync(join(tmpdir(), "amc-gap4206-weknora-checkpoint-"));
  roots.push(dir);
  return dir;
}

function createRagMemoryRun(ws: string): void {
  createRuntimeRun({
    workspace: ws,
    runId: "rag-memory-state-1",
    agentId: "rag-memory-agent",
    source: "fleet",
    stage: "rag.refresh.planned",
    episodeId: "episode-rag-memory-1",
    lifecycleRunId: "lifecycle-rag-memory-1"
  });
  appendRuntimeRunEvent({
    workspace: ws,
    runId: "rag-memory-state-1",
    agentId: "rag-memory-agent",
    source: "watch",
    type: "stage.changed",
    stage: "rag.memory-transition",
    severity: "high",
    message: "Risky RAG corpus and reasoning-memory transition reached.",
    links: {
      receiptId: "rag-grounding-receipt-1",
      traceId: "memory-writeback-trace-1"
    },
    payload: {
      transitionId: "rag-memory-refresh-1",
      corpusVersion: "kb-2026.06.25",
      memoryPolicyId: "reasoning-memory-policy-v1"
    }
  });
}

afterEach(() => {
  while (roots.length > 0) {
    const dir = roots.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

describe("GAP-4206 WeKnora state checkpoint boundary", () => {
  it("documents live WeKnora metadata and no-bloat relevance decision", () => {
    expect(existsSync(DOC)).toBe(true);
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-4206");
    expect(doc).toContain("Tencent/WeKnora");
    expect(doc).toContain(GITHUB_REPO);
    expect(doc).toContain(GITHUB_API);
    expect(doc).toContain(README);
    expect(doc).toContain(LICENSE);
    expect(doc).toContain(HOMEPAGE);
    expect(doc).toContain("Go");
    expect(doc).toContain("MIT License");
    expect(doc).toContain("NOASSERTION");
    expect(doc).toContain("RAG-based Quick Q&A");
    expect(doc).toContain("ReAct Agent");
    expect(doc).toContain("Wiki Mode");
    expect(doc).toContain("Langfuse");
    expect(doc).toContain("tenant RBAC");
    expect(doc).toContain("checkpoint hash, restore test, state diff, and retention policy");
    expect(doc).toContain("metadata-only");
    expect(doc).toContain("No WeKnora adapter");
  });

  it("reuses signed checkpoints for RAG and memory state transitions with Score and Enforce projection", () => {
    const ws = workspace();
    createRagMemoryRun(ws);

    const checkpoint = createRuntimeStateCheckpoint({
      workspace: ws,
      runId: "rag-memory-state-1",
      agentId: "rag-memory-agent",
      transitionId: "rag-memory-refresh-1",
      reason: "Checkpoint before RAG corpus refresh and reasoning-memory writeback.",
      riskLevel: "high",
      sourceCitations,
      evidenceRefs: ["rag-grounding-receipt-1", "memory-writeback-policy-receipt-1"],
      retentionPolicy: {
        retentionClass: "regulated",
        retainUntil: "2026-07-25T16:18:00.000Z",
        maxAgeDays: 30,
        deleteAfterRestore: false
      },
      state: {
        knowledgeBaseId: "kb-enterprise-policy",
        retrievalCorpusVersion: "kb-2026.06.25",
        memoryCursor: "reasoning-memory-offset-42",
        memoryPolicyId: "reasoning-memory-policy-v1",
        wikiGraphHash: "a".repeat(64),
        citationProvenanceReceiptId: "rag-citation-provenance-1",
        pendingMutationId: "memory-writeback-17"
      }
    });

    const restore = proveRuntimeStateRestore({
      workspace: ws,
      runId: "rag-memory-state-1",
      agentId: "rag-memory-agent",
      checkpointId: checkpoint.checkpointId,
      restoredState: checkpoint.stateSnapshot,
      restoreTestEvidenceRefs: ["restore-rag-memory-test-1", "restore-memory-policy-log-1"]
    });

    expect(verifyRuntimeStateCheckpoint(checkpoint).valid).toBe(true);
    expect(verifyRuntimeStateRestoreProof(restore).valid).toBe(true);
    expect(verifyArtifactFileSignature({ workspace: ws, path: checkpoint.checkpointPath }).valid).toBe(true);
    expect(verifyArtifactFileSignature({ workspace: ws, path: restore.proofPath }).valid).toBe(true);
    expect(restore.stateDiff).toHaveLength(0);
    expect(restore.restoreTest.passed).toBe(true);
    expect(restore.assurance.surfaceBinding).toEqual(["Score", "Watch", "Enforce"]);
    expect(restore.assurance.enforcementAction).toBe("allow");
    expect(restore.assurance.scoreImpact.penalty0to100).toBe(0);
    expect(restore.assurance.scoreImpact.evidenceRefs).toEqual(expect.arrayContaining([
      "restore-rag-memory-test-1",
      "restore-memory-policy-log-1"
    ]));

    const audit = renderRuntimeStateCheckpointAuditExport(checkpoint, restore);
    expect(audit).toContain("RESTORE_VERIFIED");
    expect(audit).toContain("rag-memory-refresh-1");
    expect(audit).toContain("Enforcement action: allow");
    expect(audit).toContain("Score impact: 0/100");
  });

  it("fails closed and blocks enforcement when RAG or memory restore diverges", () => {
    const ws = workspace();
    createRagMemoryRun(ws);

    const checkpoint = createRuntimeStateCheckpoint({
      workspace: ws,
      runId: "rag-memory-state-1",
      agentId: "rag-memory-agent",
      transitionId: "rag-memory-refresh-1",
      reason: "Checkpoint before risky RAG memory mutation.",
      riskLevel: "critical",
      sourceCitations,
      evidenceRefs: ["rag-grounding-receipt-1"],
      retentionPolicy: {
        retentionClass: "regulated",
        retainUntil: "2026-07-25T16:18:00.000Z",
        maxAgeDays: 30,
        deleteAfterRestore: true
      },
      state: {
        knowledgeBaseId: "kb-enterprise-policy",
        retrievalCorpusVersion: "kb-2026.06.25",
        memoryCursor: "reasoning-memory-offset-42",
        memoryPolicyId: "reasoning-memory-policy-v1",
        wikiGraphHash: "b".repeat(64)
      }
    });

    const divergent = proveRuntimeStateRestore({
      workspace: ws,
      runId: "rag-memory-state-1",
      agentId: "rag-memory-agent",
      checkpointId: checkpoint.checkpointId,
      restoredState: {
        knowledgeBaseId: "kb-enterprise-policy",
        retrievalCorpusVersion: "kb-2026.06.26",
        memoryCursor: "reasoning-memory-offset-99",
        memoryPolicyId: "reasoning-memory-policy-v1",
        wikiGraphHash: "c".repeat(64)
      },
      restoreTestEvidenceRefs: []
    });

    expect(divergent.failClosed).toBe(true);
    expect(divergent.restoreTest.passed).toBe(false);
    expect(divergent.assurance.surfaceBinding).toEqual(["Score", "Watch", "Enforce"]);
    expect(divergent.assurance.enforcementAction).toBe("block");
    expect(divergent.assurance.scoreImpact.penalty0to100).toBeGreaterThan(0);
    expect(divergent.failClosedReasons).toEqual(expect.arrayContaining([
      "runtime-state-restore:state-hash:mismatch",
      "runtime-state-restore:test-evidence:missing"
    ]));
    expect(divergent.stateDiff.map((entry) => entry.path)).toEqual(expect.arrayContaining([
      "memoryCursor",
      "retrievalCorpusVersion",
      "wikiGraphHash"
    ]));
    expect(verifyRuntimeStateRestoreProof(divergent).valid).toBe(false);

    const metadataOnly = verifyRuntimeStateCheckpoint({
      ...checkpoint,
      checkpointPath: null,
      signaturePath: null,
      stateSnapshot: null,
      sourceCitations
    });
    expect(metadataOnly.valid).toBe(false);
    expect(metadataOnly.failClosedReasons).toEqual(expect.arrayContaining([
      "runtime-state-checkpoint:state-snapshot:missing",
      "runtime-state-checkpoint:signature:missing",
      "runtime-state-checkpoint:path:missing"
    ]));
  });

  it("does not add WeKnora-specific identifiers to generic runtime checkpoint implementation files", () => {
    const combined = IMPLEMENTATION_FILES.map((file) => readFileSync(file, "utf8")).join("\n");
    expect(combined).not.toContain("Tencent/WeKnora");
    expect(combined).not.toContain("WeKnora");
    expect(combined).not.toContain("weknora");
    expect(combined).not.toContain(IDENTIFIER);
  });
});
