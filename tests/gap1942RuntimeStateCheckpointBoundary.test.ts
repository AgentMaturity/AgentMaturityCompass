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

const DOC = "docs/source-reviews/GAP-1942-sta-runtime-state-checkpointing.md";
const OPENALEX = "https://openalex.org/W7160493853";
const DOI = "https://doi.org/10.5281/zenodo.20063055";
const ZENODO = "https://zenodo.org/records/20063055";
const TITLE = "STA Conditional Commitment Architecture for Output-Mediated and Multi-Agent AI Systems: A Future Extension Note for the Signal-Time-Authority Framework";
const IDENTIFIER = "sta_runtime_state_checkpointing";
const IMPLEMENTATION_FILES = [
  "src/runtime/stateCheckpoint.ts",
  "src/runtime/index.ts",
  "src/index.ts",
  "src/lifecycle/artifactSignature.ts"
];

const sourceCitations: RuntimeStateCheckpointSourceCitation[] = [
  {
    sourceId: "openalex-w7160493853",
    title: TITLE,
    url: OPENALEX,
    retrievedAt: "2026-06-25T09:12:00.000Z"
  },
  {
    sourceId: "doi-10-5281-zenodo-20063055",
    title: "Zenodo DOI landing page",
    url: DOI,
    retrievedAt: "2026-06-25T09:12:00.000Z"
  }
];

const roots: string[] = [];

function workspace(): string {
  const dir = mkdtempSync(join(tmpdir(), "amc-gap1942-state-checkpoint-"));
  roots.push(dir);
  return dir;
}

function createRunWithRiskyTransition(ws: string): void {
  createRuntimeRun({
    workspace: ws,
    runId: "runtime-state-risk-1",
    agentId: "commitment-agent",
    source: "fleet",
    stage: "plan.created",
    episodeId: "episode-state-risk-1",
    lifecycleRunId: "lifecycle-state-risk-1"
  });
  appendRuntimeRunEvent({
    workspace: ws,
    runId: "runtime-state-risk-1",
    agentId: "commitment-agent",
    source: "watch",
    type: "stage.changed",
    stage: "release.gate",
    severity: "high",
    message: "Risky state transition reached before output release gate.",
    links: { receiptId: "receipt-release-gate" },
    payload: { transitionId: "release-gate-1", authorityGate: "human-review" }
  });
}

afterEach(() => {
  while (roots.length > 0) {
    const dir = roots.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

describe("GAP-1942 runtime state checkpoint and rollback proof boundary", () => {
  it("documents the live STA source review and no-bloat relevance decision", () => {
    expect(existsSync(DOC)).toBe(true);
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-1942");
    expect(doc).toContain("State checkpoint and rollback proof");
    expect(doc).toContain(OPENALEX);
    expect(doc).toContain(DOI);
    expect(doc).toContain(ZENODO);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("Zenodo");
    expect(doc).toContain("conditional commitment");
    expect(doc).toContain("state contamination");
    expect(doc).toContain("multi-agent commitment cascades");
    expect(doc).toContain("pre-commitment intervention gates");
    expect(doc).toContain("checkpoint hash, restore test, state diff, and retention policy");
    expect(doc).toContain("metadata-only");
    expect(doc).toContain("No STA subsystem");
  });

  it("creates signed checkpoints before risky transitions and verifies restore proof", () => {
    const ws = workspace();
    createRunWithRiskyTransition(ws);

    const checkpoint = createRuntimeStateCheckpoint({
      workspace: ws,
      runId: "runtime-state-risk-1",
      agentId: "commitment-agent",
      transitionId: "release-gate-1",
      reason: "Checkpoint before output release gate.",
      riskLevel: "high",
      sourceCitations,
      evidenceRefs: ["receipt-release-gate", "trace-output-buffer"],
      retentionPolicy: {
        retentionClass: "standard",
        retainUntil: "2026-07-25T09:12:00.000Z",
        maxAgeDays: 30,
        deleteAfterRestore: false
      },
      state: {
        planId: "plan-commitment-1",
        stage: "release.gate",
        outputBufferHash: "a".repeat(64),
        memoryCursor: "memory-42",
        authorityGate: "human-review",
        pendingHandoffs: ["reviewer-agent"]
      }
    });

    expect(existsSync(checkpoint.checkpointPath)).toBe(true);
    expect(checkpoint.signaturePath).toBeTruthy();
    expect(checkpoint.checkpointHash).toMatch(/^[a-f0-9]{64}$/);
    expect(checkpoint.stateHash).toMatch(/^[a-f0-9]{64}$/);
    expect(checkpoint.surfaceBinding).toEqual(["Fleet", "Watch", "Vault", "Studio"]);
    expect(checkpoint.retentionPolicy.maxAgeDays).toBe(30);
    expect(checkpoint.evidenceRefs).toEqual(expect.arrayContaining(["receipt-release-gate", "trace-output-buffer"]));
    expect(verifyRuntimeStateCheckpoint(checkpoint).valid).toBe(true);
    expect(verifyArtifactFileSignature({ workspace: ws, path: checkpoint.checkpointPath }).valid).toBe(true);

    const restore = proveRuntimeStateRestore({
      workspace: ws,
      runId: "runtime-state-risk-1",
      agentId: "commitment-agent",
      checkpointId: checkpoint.checkpointId,
      restoredState: checkpoint.stateSnapshot,
      restoreTestEvidenceRefs: ["restore-test-run-1", "restore-log-1"]
    });

    expect(existsSync(restore.proofPath)).toBe(true);
    expect(restore.signaturePath).toBeTruthy();
    expect(restore.failClosed).toBe(false);
    expect(restore.restoreTest.passed).toBe(true);
    expect(restore.stateDiff).toHaveLength(0);
    expect(restore.retentionPolicy).toEqual(checkpoint.retentionPolicy);
    expect(verifyRuntimeStateRestoreProof(restore).valid).toBe(true);
    expect(verifyArtifactFileSignature({ workspace: ws, path: restore.proofPath }).valid).toBe(true);

    const auditExport = renderRuntimeStateCheckpointAuditExport(checkpoint, restore);
    expect(auditExport).toContain("AMC Runtime State Checkpoint Export");
    expect(auditExport).toContain("runtime-state-risk-1");
    expect(auditExport).toContain("RESTORE_VERIFIED");
    expect(auditExport).toContain("release-gate-1");
    expect(auditExport).toContain("checkpoint hash");
    expect(auditExport).toContain("retention policy");
  });

  it("fails closed when restored state diverges or metadata replaces checkpoint evidence", () => {
    const ws = workspace();
    createRunWithRiskyTransition(ws);

    const checkpoint = createRuntimeStateCheckpoint({
      workspace: ws,
      runId: "runtime-state-risk-1",
      agentId: "commitment-agent",
      transitionId: "release-gate-1",
      reason: "Checkpoint before state mutation.",
      riskLevel: "critical",
      sourceCitations,
      evidenceRefs: ["receipt-release-gate"],
      retentionPolicy: {
        retentionClass: "regulated",
        retainUntil: "2026-08-25T09:12:00.000Z",
        maxAgeDays: 61,
        deleteAfterRestore: true
      },
      state: {
        planId: "plan-commitment-1",
        stage: "release.gate",
        outputBufferHash: "b".repeat(64),
        authorityGate: "human-review",
        commitmentDistance: 0.42
      }
    });

    const divergent = proveRuntimeStateRestore({
      workspace: ws,
      runId: "runtime-state-risk-1",
      agentId: "commitment-agent",
      checkpointId: checkpoint.checkpointId,
      restoredState: {
        planId: "plan-commitment-1",
        stage: "release.gate",
        outputBufferHash: "c".repeat(64),
        authorityGate: "auto-release",
        commitmentDistance: 0.9
      },
      restoreTestEvidenceRefs: []
    });

    expect(divergent.failClosed).toBe(true);
    expect(divergent.restoreTest.passed).toBe(false);
    expect(divergent.failClosedReasons).toEqual(expect.arrayContaining([
      "runtime-state-restore:state-hash:mismatch",
      "runtime-state-restore:test-evidence:missing"
    ]));
    expect(divergent.stateDiff.map((entry) => entry.path)).toEqual(expect.arrayContaining([
      "authorityGate",
      "commitmentDistance",
      "outputBufferHash"
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

  it("does not add source-specific STA identifiers to generic runtime, lifecycle, or signing implementation files", () => {
    const combined = IMPLEMENTATION_FILES.map((file) => readFileSync(file, "utf8")).join("\n");
    expect(combined).not.toContain("10.5281/zenodo.20063055");
    expect(combined).not.toContain("W7160493853");
    expect(combined).not.toContain("Signal-Time-Authority");
    expect(combined).not.toContain("Conditional Commitment Architecture");
    expect(combined).not.toContain(IDENTIFIER);
  });
});
