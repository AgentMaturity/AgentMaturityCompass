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

const DOC = "docs/source-reviews/GAP-1952-plato-runtime-state-checkpointing.md";
const OPENALEX = "https://openalex.org/W4403708691";
const DOI = "https://doi.org/10.1007/s10846-026-02392-y";
const SPRINGER = "https://link.springer.com/article/10.1007/s10846-026-02392-y";
const TITLE = "PLATO: Planning with LLMs and Affordances for Tool Manipulation";
const IDENTIFIER = "plato_runtime_state_checkpointing";
const IMPLEMENTATION_FILES = [
  "src/runtime/stateCheckpoint.ts",
  "src/runtime/index.ts",
  "src/lifecycle/artifactSignature.ts"
];

const sourceCitations: RuntimeStateCheckpointSourceCitation[] = [
  {
    sourceId: "openalex-w4403708691",
    title: TITLE,
    url: OPENALEX,
    retrievedAt: "2026-06-25T09:20:00.000Z"
  },
  {
    sourceId: "doi-10-1007-s10846-026-02392-y",
    title: "Springer DOI landing page",
    url: DOI,
    retrievedAt: "2026-06-25T09:20:00.000Z"
  }
];

const roots: string[] = [];

function workspace(): string {
  const dir = mkdtempSync(join(tmpdir(), "amc-gap1952-plato-checkpoint-"));
  roots.push(dir);
  return dir;
}

function createToolManipulationRun(ws: string): void {
  createRuntimeRun({
    workspace: ws,
    runId: "runtime-plato-tool-1",
    agentId: "tool-manipulation-agent",
    source: "fleet",
    stage: "plan.created",
    episodeId: "episode-plato-tool-1",
    lifecycleRunId: "lifecycle-plato-tool-1"
  });
  appendRuntimeRunEvent({
    workspace: ws,
    runId: "runtime-plato-tool-1",
    agentId: "tool-manipulation-agent",
    source: "sdk",
    type: "stage.changed",
    stage: "tool.affordance-selected",
    severity: "high",
    message: "Risky tool manipulation transition selected.",
    links: { receiptId: "receipt-tool-affordance", traceId: "trace-tool-plan" },
    payload: { transitionId: "affordance-action-1", selectedTool: "spatula", targetObject: "block-a" }
  });
}

afterEach(() => {
  while (roots.length > 0) {
    const dir = roots.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

describe("GAP-1952 PLATO runtime state checkpoint boundary", () => {
  it("documents the live PLATO source review and no-bloat relevance decision", () => {
    expect(existsSync(DOC)).toBe(true);
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-1952");
    expect(doc).toContain("State checkpoint and rollback proof");
    expect(doc).toContain(OPENALEX);
    expect(doc).toContain(DOI);
    expect(doc).toContain(SPRINGER);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("Journal of Intelligent");
    expect(doc).toContain("affordances");
    expect(doc).toContain("modular agent-based architecture");
    expect(doc).toContain("high-level plan");
    expect(doc).toContain("low-level actions");
    expect(doc).toContain("verify successful execution");
    expect(doc).toContain("checkpoint hash, restore test, state diff, and retention policy");
    expect(doc).toContain("metadata-only");
    expect(doc).toContain("No PLATO adapter");
  });

  it("reuses generic signed checkpoints for tool-manipulation state transitions", () => {
    const ws = workspace();
    createToolManipulationRun(ws);

    const checkpoint = createRuntimeStateCheckpoint({
      workspace: ws,
      runId: "runtime-plato-tool-1",
      agentId: "tool-manipulation-agent",
      transitionId: "affordance-action-1",
      reason: "Checkpoint before a tool-affordance action is executed.",
      riskLevel: "high",
      sourceCitations,
      evidenceRefs: ["receipt-tool-affordance", "trace-tool-plan"],
      retentionPolicy: {
        retentionClass: "standard",
        retainUntil: "2026-07-25T09:20:00.000Z",
        maxAgeDays: 30,
        deleteAfterRestore: false
      },
      state: {
        languageInstructionHash: "a".repeat(64),
        highLevelPlanId: "plan-tool-1",
        lowLevelActionId: "action-push-block-a",
        selectedTool: "spatula",
        affordanceModelHash: "b".repeat(64),
        environmentSnapshotHash: "c".repeat(64),
        verifiedExecution: false
      }
    });

    const restore = proveRuntimeStateRestore({
      workspace: ws,
      runId: "runtime-plato-tool-1",
      agentId: "tool-manipulation-agent",
      checkpointId: checkpoint.checkpointId,
      restoredState: checkpoint.stateSnapshot,
      restoreTestEvidenceRefs: ["restore-tool-sim-1", "restore-affordance-log-1"]
    });

    expect(verifyRuntimeStateCheckpoint(checkpoint).valid).toBe(true);
    expect(verifyRuntimeStateRestoreProof(restore).valid).toBe(true);
    expect(verifyArtifactFileSignature({ workspace: ws, path: checkpoint.checkpointPath }).valid).toBe(true);
    expect(verifyArtifactFileSignature({ workspace: ws, path: restore.proofPath }).valid).toBe(true);
    expect(restore.stateDiff).toHaveLength(0);
    expect(restore.restoreTest.passed).toBe(true);

    const audit = renderRuntimeStateCheckpointAuditExport(checkpoint, restore);
    expect(audit).toContain("RESTORE_VERIFIED");
    expect(audit).toContain("affordance-action-1");
    expect(audit).toContain("checkpoint hash");
  });

  it("fails closed when tool-state restore diverges or PLATO metadata replaces evidence", () => {
    const ws = workspace();
    createToolManipulationRun(ws);

    const checkpoint = createRuntimeStateCheckpoint({
      workspace: ws,
      runId: "runtime-plato-tool-1",
      agentId: "tool-manipulation-agent",
      transitionId: "affordance-action-1",
      reason: "Checkpoint before executing an affordance-driven action.",
      riskLevel: "critical",
      sourceCitations,
      evidenceRefs: ["receipt-tool-affordance"],
      retentionPolicy: {
        retentionClass: "standard",
        retainUntil: "2026-07-25T09:20:00.000Z",
        maxAgeDays: 30,
        deleteAfterRestore: true
      },
      state: {
        selectedTool: "spatula",
        lowLevelActionId: "action-push-block-a",
        affordanceModelHash: "d".repeat(64),
        environmentSnapshotHash: "e".repeat(64),
        verifiedExecution: false
      }
    });

    const divergent = proveRuntimeStateRestore({
      workspace: ws,
      runId: "runtime-plato-tool-1",
      agentId: "tool-manipulation-agent",
      checkpointId: checkpoint.checkpointId,
      restoredState: {
        selectedTool: "tongs",
        lowLevelActionId: "action-pull-block-a",
        affordanceModelHash: "f".repeat(64),
        environmentSnapshotHash: "e".repeat(64),
        verifiedExecution: true
      },
      restoreTestEvidenceRefs: []
    });

    expect(divergent.failClosed).toBe(true);
    expect(divergent.failClosedReasons).toEqual(expect.arrayContaining([
      "runtime-state-restore:state-hash:mismatch",
      "runtime-state-restore:test-evidence:missing"
    ]));
    expect(divergent.stateDiff.map((entry) => entry.path)).toEqual(expect.arrayContaining([
      "affordanceModelHash",
      "lowLevelActionId",
      "selectedTool",
      "verifiedExecution"
    ]));

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

  it("does not add PLATO-specific identifiers to generic runtime checkpoint implementation files", () => {
    const combined = IMPLEMENTATION_FILES.map((file) => readFileSync(file, "utf8")).join("\n");
    expect(combined).not.toContain("10.1007/s10846-026-02392-y");
    expect(combined).not.toContain("W4403708691");
    expect(combined).not.toContain("PLATO");
    expect(combined).not.toContain("Planning with LLMs and Affordances for Tool Manipulation");
    expect(combined).not.toContain(IDENTIFIER);
  });
});
