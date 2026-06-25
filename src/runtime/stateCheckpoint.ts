import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { artifactSigPath, trySignArtifactFile } from "../lifecycle/artifactSignature.js";
import { ensureDir, readUtf8, writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import { loadRuntimeRun, runtimeRunStatePath, type RuntimeManagedRun } from "./runManager.js";

export type RuntimeStateCheckpointRiskLevel = "medium" | "high" | "critical";
export type RuntimeStateRetentionClass = "ephemeral" | "standard" | "regulated";
export type RuntimeStateDiffChange = "added" | "removed" | "changed";

export interface RuntimeStateCheckpointSourceCitation {
  sourceId: string;
  title: string;
  url: string;
  retrievedAt: string;
}

export interface RuntimeStateRetentionPolicy {
  retentionClass: RuntimeStateRetentionClass;
  retainUntil: string;
  maxAgeDays: number;
  deleteAfterRestore: boolean;
}

export interface RuntimeStateCheckpoint {
  schemaVersion: "2026-06-25";
  checkpointId: string;
  runId: string;
  agentId: string;
  episodeId: string | null;
  lifecycleRunId: string | null;
  transitionId: string;
  reason: string;
  riskLevel: RuntimeStateCheckpointRiskLevel;
  createdAt: string;
  surfaceBinding: ["Fleet", "Watch", "Vault", "Studio"];
  sourceCitations: RuntimeStateCheckpointSourceCitation[];
  evidenceRefs: string[];
  retentionPolicy: RuntimeStateRetentionPolicy;
  stateHash: string;
  stateSnapshot: unknown;
  checkpointHash: string;
  checkpointPath: string | null;
  signaturePath: string | null;
}

export interface PersistedRuntimeStateCheckpoint extends RuntimeStateCheckpoint {
  checkpointPath: string;
}

export interface RuntimeStateCheckpointVerification {
  valid: boolean;
  failClosedReasons: string[];
}

export interface RuntimeStateDiffEntry {
  path: string;
  change: RuntimeStateDiffChange;
  checkpointValueHash: string | null;
  restoredValueHash: string | null;
}

export interface RuntimeStateRestoreProof {
  schemaVersion: "2026-06-25";
  proofId: string;
  checkpointId: string;
  runId: string;
  agentId: string;
  transitionId: string;
  createdAt: string;
  surfaceBinding: ["Fleet", "Watch", "Vault", "Studio"];
  checkpointHash: string;
  checkpointStateHash: string;
  restoredStateHash: string;
  stateDiff: RuntimeStateDiffEntry[];
  retentionPolicy: RuntimeStateRetentionPolicy;
  restoreTest: {
    passed: boolean;
    checkedAt: string;
    evidenceRefs: string[];
  };
  failClosed: boolean;
  failClosedReasons: string[];
  proofHash: string;
  proofPath: string | null;
  signaturePath: string | null;
}

export interface PersistedRuntimeStateRestoreProof extends RuntimeStateRestoreProof {
  proofPath: string;
}

export interface RuntimeStateRestoreProofVerification {
  valid: boolean;
  failClosedReasons: string[];
}

function nowIso(): string {
  return new Date().toISOString();
}

function safeIdPart(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "state";
}

function stateHash(state: unknown): string {
  return sha256Hex(canonicalize(state));
}

function checkpointDigest(checkpoint: RuntimeStateCheckpoint): string {
  return sha256Hex(canonicalize({
    ...checkpoint,
    checkpointHash: "",
    checkpointPath: null,
    signaturePath: null
  }));
}

function restoreProofDigest(proof: RuntimeStateRestoreProof): string {
  return sha256Hex(canonicalize({
    ...proof,
    proofHash: "",
    proofPath: null,
    signaturePath: null
  }));
}

function checkpointRoot(workspace: string, run: Pick<RuntimeManagedRun, "agentId" | "runId">): string {
  return join(dirname(runtimeRunStatePath(workspace, run.agentId, run.runId)), "state-checkpoints");
}

export function runtimeStateCheckpointPath(workspace: string, agentId: string, runId: string, checkpointId: string): string {
  return join(dirname(runtimeRunStatePath(resolve(workspace), agentId, runId)), "state-checkpoints", `${checkpointId}.json`);
}

export function runtimeStateRestoreProofPath(workspace: string, agentId: string, runId: string, checkpointId: string): string {
  return join(dirname(runtimeRunStatePath(resolve(workspace), agentId, runId)), "state-checkpoints", `${checkpointId}.restore-proof.json`);
}

function validateRetention(policy: RuntimeStateRetentionPolicy): string[] {
  const reasons: string[] = [];
  if (!["ephemeral", "standard", "regulated"].includes(policy.retentionClass)) {
    reasons.push("runtime-state-checkpoint:retention-class:invalid");
  }
  if (!Number.isInteger(policy.maxAgeDays) || policy.maxAgeDays <= 0) {
    reasons.push("runtime-state-checkpoint:retention-max-age:invalid");
  }
  if (!Number.isFinite(Date.parse(policy.retainUntil))) {
    reasons.push("runtime-state-checkpoint:retention-until:invalid");
  }
  return reasons;
}

export function verifyRuntimeStateCheckpoint(checkpoint: RuntimeStateCheckpoint): RuntimeStateCheckpointVerification {
  const reasons: string[] = [];
  if (!checkpoint.transitionId) reasons.push("runtime-state-checkpoint:transition-id:missing");
  if (!checkpoint.reason) reasons.push("runtime-state-checkpoint:reason:missing");
  if (!["medium", "high", "critical"].includes(checkpoint.riskLevel)) {
    reasons.push("runtime-state-checkpoint:risk-level:invalid");
  }
  if (checkpoint.evidenceRefs.length === 0) {
    reasons.push("runtime-state-checkpoint:evidence:missing");
  }
  if (checkpoint.stateSnapshot === null || checkpoint.stateSnapshot === undefined) {
    reasons.push("runtime-state-checkpoint:state-snapshot:missing");
  } else if (stateHash(checkpoint.stateSnapshot) !== checkpoint.stateHash) {
    reasons.push("runtime-state-checkpoint:state-hash:mismatch");
  }
  if (checkpoint.checkpointHash !== checkpointDigest(checkpoint)) {
    reasons.push("runtime-state-checkpoint:checkpoint-hash:mismatch");
  }
  if (!checkpoint.checkpointPath) {
    reasons.push("runtime-state-checkpoint:path:missing");
  } else if (!existsSync(checkpoint.checkpointPath)) {
    reasons.push("runtime-state-checkpoint:path:not-found");
  }
  if (!checkpoint.signaturePath) {
    reasons.push("runtime-state-checkpoint:signature:missing");
  } else if (!existsSync(checkpoint.signaturePath)) {
    reasons.push("runtime-state-checkpoint:signature:not-found");
  }
  reasons.push(...validateRetention(checkpoint.retentionPolicy));
  const unique = [...new Set(reasons)];
  return { valid: unique.length === 0, failClosedReasons: unique };
}

export function createRuntimeStateCheckpoint(input: {
  workspace: string;
  runId: string;
  agentId?: string | null;
  transitionId: string;
  reason: string;
  riskLevel: RuntimeStateCheckpointRiskLevel;
  state: unknown;
  retentionPolicy: RuntimeStateRetentionPolicy;
  evidenceRefs?: string[];
  sourceCitations?: RuntimeStateCheckpointSourceCitation[];
  createdAt?: string;
}): PersistedRuntimeStateCheckpoint {
  const workspace = resolve(input.workspace);
  const run = loadRuntimeRun({ workspace, runId: input.runId, agentId: input.agentId });
  const checkpointId = `checkpoint_${safeIdPart(input.transitionId)}_${randomUUID().slice(0, 12)}`;
  const checkpointPath = runtimeStateCheckpointPath(workspace, run.agentId, run.runId, checkpointId);
  const signaturePath = artifactSigPath(checkpointPath);
  const checkpointWithoutHash: RuntimeStateCheckpoint = {
    schemaVersion: "2026-06-25",
    checkpointId,
    runId: run.runId,
    agentId: run.agentId,
    episodeId: run.episodeId,
    lifecycleRunId: run.lifecycleRunId,
    transitionId: input.transitionId,
    reason: input.reason,
    riskLevel: input.riskLevel,
    createdAt: input.createdAt ?? nowIso(),
    surfaceBinding: ["Fleet", "Watch", "Vault", "Studio"],
    sourceCitations: input.sourceCitations ?? [],
    evidenceRefs: [...new Set(input.evidenceRefs ?? [])],
    retentionPolicy: input.retentionPolicy,
    stateHash: stateHash(input.state),
    stateSnapshot: input.state,
    checkpointHash: "",
    checkpointPath,
    signaturePath
  };
  const checkpoint: PersistedRuntimeStateCheckpoint = {
    ...checkpointWithoutHash,
    checkpointHash: checkpointDigest(checkpointWithoutHash),
    checkpointPath
  };
  ensureDir(checkpointRoot(workspace, run));
  writeFileAtomic(checkpointPath, `${JSON.stringify(checkpoint, null, 2)}\n`, 0o600);
  const signed = trySignArtifactFile({ workspace, path: checkpointPath, artifactKind: "runtime-state-checkpoint" });
  return { ...checkpoint, signaturePath: signed?.sigPath ?? signaturePath };
}

export function loadRuntimeStateCheckpoint(input: {
  workspace: string;
  runId: string;
  checkpointId: string;
  agentId?: string | null;
}): PersistedRuntimeStateCheckpoint {
  const workspace = resolve(input.workspace);
  const run = loadRuntimeRun({ workspace, runId: input.runId, agentId: input.agentId });
  const file = runtimeStateCheckpointPath(workspace, run.agentId, run.runId, input.checkpointId);
  return JSON.parse(readUtf8(file)) as PersistedRuntimeStateCheckpoint;
}

function valueHash(value: unknown): string | null {
  return value === undefined ? null : stateHash(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function diffState(checkpointValue: unknown, restoredValue: unknown, path = ""): RuntimeStateDiffEntry[] {
  if (canonicalize(checkpointValue) === canonicalize(restoredValue)) {
    return [];
  }
  if (isRecord(checkpointValue) && isRecord(restoredValue)) {
    const keys = [...new Set([...Object.keys(checkpointValue), ...Object.keys(restoredValue)])].sort();
    return keys.flatMap((key) => {
      const nextPath = path ? `${path}.${key}` : key;
      if (!(key in checkpointValue)) {
        return [{
          path: nextPath,
          change: "added" as const,
          checkpointValueHash: null,
          restoredValueHash: valueHash(restoredValue[key])
        }];
      }
      if (!(key in restoredValue)) {
        return [{
          path: nextPath,
          change: "removed" as const,
          checkpointValueHash: valueHash(checkpointValue[key]),
          restoredValueHash: null
        }];
      }
      return diffState(checkpointValue[key], restoredValue[key], nextPath);
    });
  }
  return [{
    path: path || "$",
    change: "changed",
    checkpointValueHash: valueHash(checkpointValue),
    restoredValueHash: valueHash(restoredValue)
  }];
}

export function proveRuntimeStateRestore(input: {
  workspace: string;
  runId: string;
  checkpointId: string;
  restoredState: unknown;
  agentId?: string | null;
  restoreTestEvidenceRefs?: string[];
  checkedAt?: string;
}): PersistedRuntimeStateRestoreProof {
  const workspace = resolve(input.workspace);
  const checkpoint = loadRuntimeStateCheckpoint({
    workspace,
    runId: input.runId,
    agentId: input.agentId,
    checkpointId: input.checkpointId
  });
  const checkpointVerification = verifyRuntimeStateCheckpoint(checkpoint);
  const restoredStateHash = stateHash(input.restoredState);
  const stateDiff = diffState(checkpoint.stateSnapshot, input.restoredState);
  const restoreTestEvidenceRefs = [...new Set(input.restoreTestEvidenceRefs ?? [])];
  const reasons = [...checkpointVerification.failClosedReasons];
  if (restoredStateHash !== checkpoint.stateHash) {
    reasons.push("runtime-state-restore:state-hash:mismatch");
  }
  if (restoreTestEvidenceRefs.length === 0) {
    reasons.push("runtime-state-restore:test-evidence:missing");
  }
  const uniqueReasons = [...new Set(reasons)];
  const proofPath = runtimeStateRestoreProofPath(workspace, checkpoint.agentId, checkpoint.runId, checkpoint.checkpointId);
  const signaturePath = artifactSigPath(proofPath);
  const checkedAt = input.checkedAt ?? nowIso();
  const proofWithoutHash: RuntimeStateRestoreProof = {
    schemaVersion: "2026-06-25",
    proofId: `restore_${safeIdPart(checkpoint.checkpointId)}_${randomUUID().slice(0, 12)}`,
    checkpointId: checkpoint.checkpointId,
    runId: checkpoint.runId,
    agentId: checkpoint.agentId,
    transitionId: checkpoint.transitionId,
    createdAt: checkedAt,
    surfaceBinding: checkpoint.surfaceBinding,
    checkpointHash: checkpoint.checkpointHash,
    checkpointStateHash: checkpoint.stateHash,
    restoredStateHash,
    stateDiff,
    retentionPolicy: checkpoint.retentionPolicy,
    restoreTest: {
      passed: uniqueReasons.length === 0,
      checkedAt,
      evidenceRefs: restoreTestEvidenceRefs
    },
    failClosed: uniqueReasons.length > 0,
    failClosedReasons: uniqueReasons,
    proofHash: "",
    proofPath,
    signaturePath
  };
  const proof: PersistedRuntimeStateRestoreProof = {
    ...proofWithoutHash,
    proofHash: restoreProofDigest(proofWithoutHash),
    proofPath
  };
  writeFileAtomic(proofPath, `${JSON.stringify(proof, null, 2)}\n`, 0o600);
  const signed = trySignArtifactFile({ workspace, path: proofPath, artifactKind: "runtime-state-restore-proof" });
  return { ...proof, signaturePath: signed?.sigPath ?? signaturePath };
}

export function verifyRuntimeStateRestoreProof(proof: RuntimeStateRestoreProof): RuntimeStateRestoreProofVerification {
  const reasons = [...proof.failClosedReasons];
  if (proof.restoredStateHash !== proof.checkpointStateHash) {
    reasons.push("runtime-state-restore:state-hash:mismatch");
  }
  if (proof.restoreTest.evidenceRefs.length === 0) {
    reasons.push("runtime-state-restore:test-evidence:missing");
  }
  if (proof.proofHash !== restoreProofDigest(proof)) {
    reasons.push("runtime-state-restore:proof-hash:mismatch");
  }
  if (!proof.proofPath) {
    reasons.push("runtime-state-restore:path:missing");
  } else if (!existsSync(proof.proofPath)) {
    reasons.push("runtime-state-restore:path:not-found");
  }
  if (!proof.signaturePath) {
    reasons.push("runtime-state-restore:signature:missing");
  } else if (!existsSync(proof.signaturePath)) {
    reasons.push("runtime-state-restore:signature:not-found");
  }
  if (!proof.restoreTest.passed && proof.failClosedReasons.length === 0) {
    reasons.push("runtime-state-restore:fail-closed-reason:missing");
  }
  if (!proof.failClosed && reasons.length > 0) {
    reasons.push("runtime-state-restore:fail-open:invalid");
  }
  const unique = [...new Set(reasons)];
  return { valid: unique.length === 0 && !proof.failClosed && proof.restoreTest.passed, failClosedReasons: unique };
}

export function renderRuntimeStateCheckpointAuditExport(
  checkpoint: RuntimeStateCheckpoint,
  restoreProof?: RuntimeStateRestoreProof
): string {
  const checkpointVerification = verifyRuntimeStateCheckpoint(checkpoint);
  const restoreVerification = restoreProof ? verifyRuntimeStateRestoreProof(restoreProof) : null;
  const status = checkpointVerification.valid && (!restoreProof || restoreVerification?.valid)
    ? "RESTORE_VERIFIED"
    : "FAIL_CLOSED";
  const lines = [
    "# AMC Runtime State Checkpoint Export",
    "",
    `- Run: ${checkpoint.runId}`,
    `- Agent: ${checkpoint.agentId}`,
    `- Transition: ${checkpoint.transitionId}`,
    `- Risk: ${checkpoint.riskLevel}`,
    `- Status: ${status}`,
    `- Surfaces: ${checkpoint.surfaceBinding.join(", ")}`,
    `- checkpoint hash: ${checkpoint.checkpointHash}`,
    `- state hash: ${checkpoint.stateHash}`,
    `- retention policy: ${checkpoint.retentionPolicy.retentionClass}; retainUntil=${checkpoint.retentionPolicy.retainUntil}; maxAgeDays=${checkpoint.retentionPolicy.maxAgeDays}; deleteAfterRestore=${checkpoint.retentionPolicy.deleteAfterRestore}`,
    "",
    "## Checkpoint Verification",
    checkpointVerification.valid ? "- VALID" : `- FAIL_CLOSED: ${checkpointVerification.failClosedReasons.join("; ")}`
  ];
  if (restoreProof) {
    lines.push(
      "",
      "## Restore Test",
      `- Passed: ${restoreProof.restoreTest.passed ? "yes" : "no"}`,
      `- Evidence: ${restoreProof.restoreTest.evidenceRefs.join(", ") || "none"}`,
      `- State diff count: ${restoreProof.stateDiff.length}`,
      restoreVerification?.valid ? "- VALID" : `- FAIL_CLOSED: ${restoreVerification?.failClosedReasons.join("; ")}`
    );
  }
  return `${lines.join("\n")}\n`;
}
