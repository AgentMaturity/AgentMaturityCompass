import { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { dirname, basename, join, relative, resolve } from "node:path";
import { getAgentPaths, normalizeAgentId } from "../fleet/paths.js";
import { trySignArtifactFile, verifyArtifactFileSignature, type ArtifactSignatureVerification } from "../lifecycle/artifactSignature.js";
import { writeRollbackLifecycleReceipt } from "../lifecycle/changeReceipt.js";
import { typedMultiAgentGraphDigest, typedMultiAgentGraphSchema } from "../fleet/typedGraph.js";
import { ensureDir, readUtf8, writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";

export type EnforceResourceKind =
  | "prompt"
  | "agent"
  | "tool"
  | "environment"
  | "memory"
  | "policy"
  | "guardrail"
  | "evaluator"
  | "dataset"
  | "router"
  | "model_provider"
  | "schema"
  | "code"
  | "graph";

export interface EnforceResource {
  id: string;
  type: EnforceResourceKind;
  kind: EnforceResourceKind;
  path: string;
  exists: boolean;
  digest: string | null;
  owner: "AMC" | "workspace";
  mutable: boolean;
  version: string | null;
  parentVersion: string | null;
  currentVersion: string | null;
  schema: string | null;
  dependencies: string[];
  lastEvaluation: {
    evaluatedAt: string;
    status: EnforceResourceValidationStatus;
    gates: string[];
  } | null;
  validationStatus: EnforceResourceValidationStatus | "unknown";
  lastVerifiedAt: string | null;
  rollbackTarget: string | null;
  rollbackPointer: string | null;
  evidenceRefs: string[];
}

export interface EnforceResourceManifest {
  schemaVersion: "2026-05-22";
  manifestId: string;
  agentId: string;
  workspace: string;
  createdAt: string;
  resourcesSha256: string;
  resourceCount: number;
  resources: EnforceResource[];
}

export interface EnforceResourceManifestRef {
  manifestId: string;
  path: string;
  resourcesSha256: string;
  resourceCount: number;
}

export interface WriteEnforceResourceManifestResult {
  manifest: EnforceResourceManifest;
  manifestPath: string;
  snapshotPath: string;
  snapshotBundlePath: string;
  manifestSigPath: string | null;
  snapshotSigPath: string | null;
}

export interface EnforceResourceDiffEntry {
  id: string;
  kind: EnforceResourceKind;
  path: string;
  beforeDigest?: string | null;
  afterDigest?: string | null;
}

export interface EnforceResourceDiff {
  added: EnforceResourceDiffEntry[];
  removed: EnforceResourceDiffEntry[];
  changed: EnforceResourceDiffEntry[];
  unchanged: number;
}

export interface EnforceResourceVerification {
  valid: boolean;
  manifestPath: string;
  expectedManifestId: string;
  currentManifestId: string;
  diff: EnforceResourceDiff;
  signature: ArtifactSignatureVerification;
}

export interface EnforceResourceRestoreEntry {
  id: string;
  kind: EnforceResourceKind;
  path: string;
  sourcePath: string;
  targetPath: string;
  status: "would-restore" | "restored" | "missing-snapshot" | "immutable-skipped";
}

export interface EnforceResourceRestorePlan {
  manifestId: string;
  manifestPath: string;
  apply: boolean;
  entries: EnforceResourceRestoreEntry[];
  receiptPath: string | null;
  receiptSigPath: string | null;
}

export type EnforceResourceLifecycleVerb =
  | "list"
  | "get"
  | "snapshot"
  | "diff"
  | "validate"
  | "propose"
  | "evaluate"
  | "apply"
  | "restore"
  | "rollback"
  | "history"
  | "contract";

export type EnforceResourceValidationStatus = "valid" | "requires-review" | "blocked";

export interface EnforceResourcePolicyGate {
  id: string;
  surface: "Enforce";
  status: "passed" | "warning" | "failed";
  summary: string;
  evidenceRefs: string[];
}

export interface EnforceResourceValidation {
  schemaVersion: "2026-05-22";
  agentId: string;
  workspace: string;
  manifestPath: string;
  expectedManifestId: string;
  currentManifestId: string;
  evaluatedAt: string;
  valid: boolean;
  canApply: boolean;
  status: EnforceResourceValidationStatus;
  diff: EnforceResourceDiff;
  signature: ArtifactSignatureVerification;
  gates: EnforceResourcePolicyGate[];
}

export interface EnforceResourceProposal {
  schemaVersion: "2026-05-22";
  proposalId: string;
  agentId: string;
  workspace: string;
  createdAt: string;
  manifestPath: string;
  expectedManifestId: string;
  currentManifestId: string;
  dryRun: true;
  diff: EnforceResourceDiff;
  validation: EnforceResourceValidation;
  summary: string;
}

export interface EnforceResourceEvaluation {
  schemaVersion: "2026-05-22";
  proposalId: string;
  agentId: string;
  workspace: string;
  evaluatedAt: string;
  decision: "accept" | "review" | "block";
  canApply: boolean;
  reasons: string[];
  gates: EnforceResourcePolicyGate[];
  diff: EnforceResourceDiff;
  nextCommand: string;
}

export interface EnforceResourceApplyReceipt {
  schemaVersion: "2026-05-22";
  receiptId: string;
  receiptType: "resource.apply";
  agentId: string;
  workspace: string;
  command: string;
  createdAt: string;
  proposalId: string;
  baselineManifestId: string;
  acceptedManifestId: string;
  baselineManifestPath: string;
  acceptedManifestPath: string;
  validationStatus: EnforceResourceValidationStatus;
  force: boolean;
  diff: EnforceResourceDiff;
  gates: EnforceResourcePolicyGate[];
}

export interface EnforceResourceApplyResult {
  dryRun: boolean;
  applied: boolean;
  proposal: EnforceResourceProposal;
  evaluation: EnforceResourceEvaluation;
  acceptedManifest: WriteEnforceResourceManifestResult | null;
  receiptPath: string | null;
  receiptSigPath: string | null;
}

export interface EnforceResourceHistoryEntry {
  id: string;
  kind: "latest-manifest" | "snapshot" | "apply-receipt" | "restore-receipt";
  path: string;
  createdAt: string | null;
  manifestId: string | null;
  signatureValid: boolean;
  signatureReason: string | null;
}

export interface EnforceResourceLifecycleContract {
  schemaVersion: "2026-05-22";
  surface: "Enforce";
  verbs: EnforceResourceLifecycleVerb[];
  resourceKinds: EnforceResourceKind[];
  guarantees: string[];
  gates: string[];
}

interface CandidateResource {
  kind: EnforceResourceKind;
  path: string;
  owner?: EnforceResource["owner"];
  mutable?: boolean;
  schema?: string | null;
}

const RESOURCE_LIFECYCLE_VERBS: EnforceResourceLifecycleVerb[] = [
  "list",
  "get",
  "snapshot",
  "diff",
  "validate",
  "propose",
  "evaluate",
  "apply",
  "restore",
  "rollback",
  "history",
  "contract"
];

const RESOURCE_KINDS: EnforceResourceKind[] = [
  "prompt",
  "agent",
  "tool",
  "environment",
  "memory",
  "policy",
  "guardrail",
  "evaluator",
  "dataset",
  "router",
  "model_provider",
  "schema",
  "code",
  "graph"
];

function enforceResourceDir(workspace: string, agentId?: string): string {
  return join(getAgentPaths(workspace, agentId).rootDir, "enforce", "resources");
}

export function latestEnforceResourceManifestPath(workspace: string, agentId?: string): string {
  return join(enforceResourceDir(workspace, agentId), "manifest.json");
}

function enforceResourceSnapshotPath(workspace: string, agentId: string, manifestId: string): string {
  return join(enforceResourceDir(workspace, agentId), "snapshots", `${manifestId}.json`);
}

export function enforceResourceSnapshotBundlePath(workspace: string, agentId: string, manifestId: string): string {
  return join(enforceResourceDir(workspace, agentId), "snapshots", manifestId);
}

function enforceResourceSnapshotManifestPath(workspace: string, agentId: string, manifestId: string): string {
  return join(enforceResourceSnapshotBundlePath(workspace, agentId, manifestId), "manifest.json");
}

function enforceResourceSnapshotFilesPath(workspace: string, agentId: string, manifestId: string): string {
  return join(enforceResourceSnapshotBundlePath(workspace, agentId, manifestId), "files");
}

function enforceResourceRestoreReceiptsDir(workspace: string, agentId: string): string {
  return join(enforceResourceDir(workspace, agentId), "restore-receipts");
}

function enforceResourceLifecycleReceiptsDir(workspace: string, agentId: string): string {
  return join(enforceResourceDir(workspace, agentId), "lifecycle-receipts");
}

function workspaceRelative(workspace: string, path: string): string {
  const rel = relative(resolve(workspace), resolve(path)).replaceAll("\\", "/");
  return rel.length === 0 ? "." : rel;
}

function resourceId(kind: EnforceResourceKind, relativePath: string): string {
  return `${kind}:${relativePath.replace(/[^A-Za-z0-9._/-]+/g, "-")}`;
}

function resolveWorkspaceResource(workspace: string, relativePath: string): string {
  const root = resolve(workspace);
  const full = resolve(root, relativePath);
  if (full !== root && !full.startsWith(`${root}/`)) {
    throw new Error(`Resource path escapes workspace: ${relativePath}`);
  }
  return full;
}

function digestPath(path: string): string | null {
  if (!existsSync(path)) {
    return null;
  }
  const stat = statSync(path);
  if (stat.isFile()) {
    return sha256Hex(readFileSync(path));
  }
  if (!stat.isDirectory()) {
    return sha256Hex(`${stat.mode}:${stat.size}:${basename(path)}`);
  }

  const files: Array<{ path: string; digest: string }> = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile()) {
        files.push({
          path: relative(path, full).replaceAll("\\", "/"),
          digest: sha256Hex(readFileSync(full))
        });
      }
    }
  };
  walk(path);
  return sha256Hex(canonicalize(files));
}

function candidateResources(workspace: string, agentId: string): CandidateResource[] {
  const paths = getAgentPaths(workspace, agentId);
  const root = paths.rootDir;
  return [
    { kind: "agent", path: paths.agentConfig, schema: "agent.config.yaml" },
    { kind: "agent", path: paths.agentConfigSig, mutable: false, schema: "signature" },
    { kind: "graph", path: paths.contextGraph, schema: "context-graph.json" },
    { kind: "graph", path: join(workspace, ".amc", "fleet", "typed-graphs", "latest.json"), schema: "typed-multi-agent-graph.json" },
    { kind: "prompt", path: paths.promptAddendum, schema: "prompt-addendum.md" },
    { kind: "guardrail", path: paths.guardrails, schema: "guardrails.yaml" },
    { kind: "policy", path: paths.gatePolicy, schema: "gatePolicy.json" },
    { kind: "policy", path: paths.gatePolicySig, mutable: false, schema: "signature" },
    { kind: "evaluator", path: paths.evalHarness, schema: "eval-harness.yaml" },
    { kind: "agent", path: join(workspace, ".amc", "fleet.yaml"), schema: "fleet.yaml" },
    { kind: "tool", path: join(root, "tools") },
    { kind: "memory", path: join(root, "memory") },
    { kind: "policy", path: join(root, "policies") },
    { kind: "dataset", path: join(root, "datasets") },
    { kind: "dataset", path: join(workspace, ".amc", "imports", "runs"), schema: "neutral-imports" },
    { kind: "schema", path: join(root, "schemas") },
    { kind: "router", path: join(root, "routes") },
    { kind: "model_provider", path: join(root, "model-routes.json"), schema: "model-routes.json" },
    { kind: "environment", path: join(root, "env.json"), schema: "env.json" },
    { kind: "code", path: join(root, "code") }
  ];
}

export function buildEnforceResourceManifest(input: {
  workspace: string;
  agentId?: string;
  createdAt?: Date;
}): EnforceResourceManifest {
  const workspace = resolve(input.workspace);
  const agentId = normalizeAgentId(input.agentId ?? "default");
  const resources = candidateResources(workspace, agentId)
    .map((candidate): EnforceResource | null => {
      const absolutePath = resolve(candidate.path);
      const exists = existsSync(absolutePath);
      if (!exists) {
        return null;
      }
      const relativePath = workspaceRelative(workspace, absolutePath);
      const digest = candidate.schema === "typed-multi-agent-graph.json"
        ? typedMultiAgentGraphDigest(typedMultiAgentGraphSchema.parse(JSON.parse(readUtf8(absolutePath)) as unknown))
        : digestPath(absolutePath);
      return {
        id: resourceId(candidate.kind, relativePath),
        type: candidate.kind,
        kind: candidate.kind,
        path: relativePath,
        exists,
        digest,
        owner: candidate.owner ?? (relativePath.startsWith(".amc/") ? "AMC" : "workspace"),
        mutable: candidate.mutable ?? true,
        version: digest ? digest.slice(0, 12) : null,
        parentVersion: null,
        currentVersion: digest ? digest.slice(0, 12) : null,
        schema: candidate.schema ?? null,
        dependencies: [],
        lastEvaluation: null,
        validationStatus: "unknown",
        lastVerifiedAt: null,
        rollbackTarget: null,
        rollbackPointer: null,
        evidenceRefs: []
      };
    })
    .filter((resource): resource is EnforceResource => resource !== null)
    .sort((a, b) => a.id.localeCompare(b.id));

  const resourcesSha256 = sha256Hex(canonicalize(resources));
  return {
    schemaVersion: "2026-05-22",
    manifestId: `enforce-resources-${resourcesSha256.slice(0, 16)}`,
    agentId,
    workspace,
    createdAt: (input.createdAt ?? new Date()).toISOString(),
    resourcesSha256,
    resourceCount: resources.length,
    resources
  };
}

export function writeEnforceResourceManifest(input: {
  workspace: string;
  agentId?: string;
}): WriteEnforceResourceManifestResult {
  const manifest = buildEnforceResourceManifest(input);
  const manifestPath = latestEnforceResourceManifestPath(input.workspace, manifest.agentId);
  const snapshotPath = enforceResourceSnapshotPath(input.workspace, manifest.agentId, manifest.manifestId);
  const snapshotBundlePath = enforceResourceSnapshotBundlePath(input.workspace, manifest.agentId, manifest.manifestId);
  const snapshotManifestPath = enforceResourceSnapshotManifestPath(input.workspace, manifest.agentId, manifest.manifestId);
  const snapshotFilesPath = enforceResourceSnapshotFilesPath(input.workspace, manifest.agentId, manifest.manifestId);
  const bytes = `${JSON.stringify(manifest, null, 2)}\n`;
  ensureDir(enforceResourceDir(input.workspace, manifest.agentId));
  writeFileAtomic(manifestPath, bytes, 0o644);
  writeFileAtomic(snapshotPath, bytes, 0o644);
  writeFileAtomic(snapshotManifestPath, bytes, 0o644);
  for (const resource of manifest.resources) {
    const source = resolveWorkspaceResource(input.workspace, resource.path);
    if (!existsSync(source)) {
      continue;
    }
    const dest = join(snapshotFilesPath, resource.path);
    const stat = statSync(source);
    if (stat.isDirectory()) {
      mkdirSync(dirname(dest), { recursive: true });
      cpSync(source, dest, { recursive: true, force: true });
    } else if (stat.isFile()) {
      mkdirSync(dirname(dest), { recursive: true });
      copyFileSync(source, dest);
    }
  }
  const manifestSignature = trySignArtifactFile({
    workspace: input.workspace,
    path: manifestPath,
    artifactKind: "enforce-resource-manifest"
  });
  const snapshotSignature = trySignArtifactFile({
    workspace: input.workspace,
    path: snapshotPath,
    artifactKind: "enforce-resource-snapshot"
  });
  return {
    manifest,
    manifestPath,
    snapshotPath,
    snapshotBundlePath,
    manifestSigPath: manifestSignature?.sigPath ?? null,
    snapshotSigPath: snapshotSignature?.sigPath ?? null
  };
}

export function enforceResourceManifestRef(result: WriteEnforceResourceManifestResult): EnforceResourceManifestRef {
  return {
    manifestId: result.manifest.manifestId,
    path: result.manifestPath,
    resourcesSha256: result.manifest.resourcesSha256,
    resourceCount: result.manifest.resourceCount
  };
}

export function loadEnforceResourceManifest(path: string): EnforceResourceManifest {
  return JSON.parse(readUtf8(path)) as EnforceResourceManifest;
}

export function listEnforceResources(input: {
  workspace: string;
  agentId?: string;
  manifestPath?: string;
}): EnforceResource[] {
  const manifestPath = input.manifestPath ?? latestEnforceResourceManifestPath(input.workspace, input.agentId);
  return loadEnforceResourceManifest(manifestPath).resources;
}

export function inspectEnforceResource(input: {
  workspace: string;
  selector: string;
  agentId?: string;
  manifestPath?: string;
}): EnforceResource {
  const manifestPath = input.manifestPath ?? latestEnforceResourceManifestPath(input.workspace, input.agentId);
  const manifest = loadEnforceResourceManifest(manifestPath);
  const resource = manifest.resources.find((entry) => entry.id === input.selector || entry.path === input.selector);
  if (!resource) {
    throw new Error(`Enforce resource not found: ${input.selector}`);
  }
  return resource;
}

export function diffEnforceResourceManifests(before: EnforceResourceManifest, after: EnforceResourceManifest): EnforceResourceDiff {
  const beforeById = new Map(before.resources.map((resource) => [resource.id, resource]));
  const afterById = new Map(after.resources.map((resource) => [resource.id, resource]));
  const added: EnforceResourceDiffEntry[] = [];
  const removed: EnforceResourceDiffEntry[] = [];
  const changed: EnforceResourceDiffEntry[] = [];
  let unchanged = 0;

  for (const resource of after.resources) {
    const previous = beforeById.get(resource.id);
    if (!previous) {
      added.push({ id: resource.id, kind: resource.kind, path: resource.path, afterDigest: resource.digest });
    } else if (previous.digest !== resource.digest || previous.path !== resource.path || previous.kind !== resource.kind) {
      changed.push({
        id: resource.id,
        kind: resource.kind,
        path: resource.path,
        beforeDigest: previous.digest,
        afterDigest: resource.digest
      });
    } else {
      unchanged += 1;
    }
  }

  for (const resource of before.resources) {
    if (!afterById.has(resource.id)) {
      removed.push({ id: resource.id, kind: resource.kind, path: resource.path, beforeDigest: resource.digest });
    }
  }

  return { added, removed, changed, unchanged };
}

export function verifyEnforceResourceManifest(input: {
  workspace: string;
  agentId?: string;
  manifestPath?: string;
}): EnforceResourceVerification {
  const manifestPath = input.manifestPath ?? latestEnforceResourceManifestPath(input.workspace, input.agentId);
  const expected = loadEnforceResourceManifest(manifestPath);
  const current = buildEnforceResourceManifest({ workspace: input.workspace, agentId: expected.agentId });
  const diff = diffEnforceResourceManifests(expected, current);
  const signature = verifyArtifactFileSignature({ workspace: input.workspace, path: manifestPath });
  return {
    valid: diff.added.length === 0 && diff.removed.length === 0 && diff.changed.length === 0,
    manifestPath,
    expectedManifestId: expected.manifestId,
    currentManifestId: current.manifestId,
    diff,
    signature
  };
}

function diffTotal(diff: EnforceResourceDiff): number {
  return diff.added.length + diff.changed.length + diff.removed.length;
}

function diffSummary(diff: EnforceResourceDiff): string {
  return `${diff.added.length} added, ${diff.changed.length} changed, ${diff.removed.length} removed, ${diff.unchanged} unchanged`;
}

function gate(
  id: string,
  status: EnforceResourcePolicyGate["status"],
  summary: string,
  evidenceRefs: string[] = []
): EnforceResourcePolicyGate {
  return { id, surface: "Enforce", status, summary, evidenceRefs };
}

export function validateEnforceResourceLifecycle(input: {
  workspace: string;
  agentId?: string;
  manifestPath?: string;
}): EnforceResourceValidation {
  const manifestPath = input.manifestPath ?? latestEnforceResourceManifestPath(input.workspace, input.agentId);
  const expected = loadEnforceResourceManifest(manifestPath);
  const verification = verifyEnforceResourceManifest({ workspace: input.workspace, agentId: expected.agentId, manifestPath });
  const current = buildEnforceResourceManifest({ workspace: input.workspace, agentId: expected.agentId });
  const changedImmutableIds = new Set([
    ...verification.diff.changed.map((entry) => entry.id),
    ...verification.diff.removed.map((entry) => entry.id)
  ]);
  const immutableChanged = expected.resources.filter((resource) => !resource.mutable && changedImmutableIds.has(resource.id));
  const missingOwner = current.resources.filter((resource) => !resource.owner);
  const unsafePaths = current.resources.filter((resource) => resource.path.startsWith("../") || resource.path.includes("/../") || resource.path.startsWith("/"));
  const snapshotFilesPath = enforceResourceSnapshotFilesPath(input.workspace, expected.agentId, expected.manifestId);
  const changedCount = diffTotal(verification.diff);
  const untestedChanges = current.resources.filter((resource) => {
    const changed = verification.diff.added.some((entry) => entry.id === resource.id)
      || verification.diff.changed.some((entry) => entry.id === resource.id);
    return changed && resource.evidenceRefs.length === 0;
  });
  const gates: EnforceResourcePolicyGate[] = [
    gate(
      "manifest-signature-valid",
      verification.signature.valid ? "passed" : "failed",
      verification.signature.valid
        ? "Baseline manifest signature is valid."
        : `Baseline manifest signature is not valid: ${verification.signature.reason ?? "unknown reason"}.`,
      [manifestPath]
    ),
    gate(
      "manifest-diff-computed",
      "passed",
      `Manifest diff computed: ${diffSummary(verification.diff)}.`,
      [expected.manifestId, current.manifestId]
    ),
    gate(
      "owners-present",
      missingOwner.length === 0 ? "passed" : "failed",
      missingOwner.length === 0
        ? "Every governed resource has an owner."
        : `${missingOwner.length} governed resource(s) are missing an owner.`,
      missingOwner.map((resource) => resource.id)
    ),
    gate(
      "paths-contained",
      unsafePaths.length === 0 ? "passed" : "failed",
      unsafePaths.length === 0
        ? "All governed resource paths remain inside the workspace."
        : `${unsafePaths.length} governed resource path(s) are unsafe.`,
      unsafePaths.map((resource) => resource.id)
    ),
    gate(
      "immutable-resources-protected",
      immutableChanged.length === 0 ? "passed" : "failed",
      immutableChanged.length === 0
        ? "Immutable signature resources were not changed or removed."
        : `${immutableChanged.length} immutable resource(s) changed or were removed.`,
      immutableChanged.map((resource) => resource.id)
    ),
    gate(
      "rollback-snapshot-available",
      existsSync(snapshotFilesPath) ? "passed" : "failed",
      existsSync(snapshotFilesPath)
        ? "Rollback snapshot bundle is available."
        : "Rollback snapshot bundle is missing.",
      [expected.manifestId]
    ),
    gate(
      "changes-require-review",
      changedCount === 0 ? "passed" : "warning",
      changedCount === 0
        ? "No resource changes are pending."
        : `${changedCount} resource change(s) need explicit review before acceptance.`,
      [
        ...verification.diff.added.map((entry) => entry.id),
        ...verification.diff.changed.map((entry) => entry.id),
        ...verification.diff.removed.map((entry) => entry.id)
      ]
    ),
    gate(
      "changed-resources-have-evidence",
      untestedChanges.length === 0 ? "passed" : "warning",
      untestedChanges.length === 0
        ? "Changed resources have evidence references or no changes are pending."
        : `${untestedChanges.length} changed resource(s) have no direct test/evidence reference yet.`,
      untestedChanges.map((resource) => resource.id)
    )
  ];

  const hasFailedGate = gates.some((entry) => entry.status === "failed");
  const hasWarningGate = gates.some((entry) => entry.status === "warning");
  const status: EnforceResourceValidationStatus = hasFailedGate ? "blocked" : hasWarningGate ? "requires-review" : "valid";
  return {
    schemaVersion: "2026-05-22",
    agentId: expected.agentId,
    workspace: resolve(input.workspace),
    manifestPath,
    expectedManifestId: expected.manifestId,
    currentManifestId: current.manifestId,
    evaluatedAt: new Date().toISOString(),
    valid: status === "valid",
    canApply: status !== "blocked",
    status,
    diff: verification.diff,
    signature: verification.signature,
    gates
  };
}

export function proposeEnforceResourceLifecycle(input: {
  workspace: string;
  agentId?: string;
  manifestPath?: string;
}): EnforceResourceProposal {
  const validation = validateEnforceResourceLifecycle(input);
  const proposalHash = sha256Hex(canonicalize({
    manifestPath: validation.manifestPath,
    expectedManifestId: validation.expectedManifestId,
    currentManifestId: validation.currentManifestId,
    diff: validation.diff
  }));
  return {
    schemaVersion: "2026-05-22",
    proposalId: `enforce-resource-proposal-${proposalHash.slice(0, 16)}`,
    agentId: validation.agentId,
    workspace: validation.workspace,
    createdAt: new Date().toISOString(),
    manifestPath: validation.manifestPath,
    expectedManifestId: validation.expectedManifestId,
    currentManifestId: validation.currentManifestId,
    dryRun: true,
    diff: validation.diff,
    validation,
    summary: diffSummary(validation.diff)
  };
}

export function evaluateEnforceResourceLifecycle(input: {
  workspace: string;
  agentId?: string;
  manifestPath?: string;
}): EnforceResourceEvaluation {
  const proposal = proposeEnforceResourceLifecycle(input);
  const failed = proposal.validation.gates.filter((entry) => entry.status === "failed");
  const warnings = proposal.validation.gates.filter((entry) => entry.status === "warning");
  const decision: EnforceResourceEvaluation["decision"] = failed.length > 0
    ? "block"
    : warnings.length > 0 ? "review" : "accept";
  const reasons = failed.length > 0 || warnings.length > 0
    ? [...failed, ...warnings].map((entry) => `${entry.id}: ${entry.summary}`)
    : ["All Enforce resource lifecycle gates passed."];
  return {
    schemaVersion: "2026-05-22",
    proposalId: proposal.proposalId,
    agentId: proposal.agentId,
    workspace: proposal.workspace,
    evaluatedAt: new Date().toISOString(),
    decision,
    canApply: decision !== "block",
    reasons,
    gates: proposal.validation.gates,
    diff: proposal.diff,
    nextCommand: decision === "block"
      ? "amc resource rollback --dry-run"
      : "amc resource apply --yes"
  };
}

function writeEnforceResourceApplyReceipt(input: {
  workspace: string;
  proposal: EnforceResourceProposal;
  acceptedManifest: WriteEnforceResourceManifestResult;
  force?: boolean;
}): { receiptPath: string; receiptSigPath: string | null; receipt: EnforceResourceApplyReceipt } {
  const receipt: EnforceResourceApplyReceipt = {
    schemaVersion: "2026-05-22",
    receiptId: `enforce-resource-apply-${Date.now()}`,
    receiptType: "resource.apply",
    agentId: input.proposal.agentId,
    workspace: resolve(input.workspace),
    command: "amc resource apply --yes",
    createdAt: new Date().toISOString(),
    proposalId: input.proposal.proposalId,
    baselineManifestId: input.proposal.expectedManifestId,
    acceptedManifestId: input.acceptedManifest.manifest.manifestId,
    baselineManifestPath: input.proposal.manifestPath,
    acceptedManifestPath: input.acceptedManifest.manifestPath,
    validationStatus: input.proposal.validation.status,
    force: Boolean(input.force),
    diff: input.proposal.diff,
    gates: input.proposal.validation.gates
  };
  const receiptsDir = enforceResourceLifecycleReceiptsDir(input.workspace, input.proposal.agentId);
  const receiptPath = join(receiptsDir, `${receipt.receiptId}.json`);
  writeFileAtomic(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, 0o644);
  const signed = trySignArtifactFile({
    workspace: input.workspace,
    path: receiptPath,
    artifactKind: "enforce-resource-lifecycle-receipt"
  });
  return { receiptPath, receiptSigPath: signed?.sigPath ?? null, receipt };
}

export function applyEnforceResourceLifecycle(input: {
  workspace: string;
  agentId?: string;
  manifestPath?: string;
  dryRun?: boolean;
  force?: boolean;
}): EnforceResourceApplyResult {
  const proposal = proposeEnforceResourceLifecycle(input);
  const evaluation = evaluateEnforceResourceLifecycle(input);
  if (input.dryRun !== false) {
    return { dryRun: true, applied: false, proposal, evaluation, acceptedManifest: null, receiptPath: null, receiptSigPath: null };
  }
  if (!evaluation.canApply && !input.force) {
    throw new Error(`Resource apply blocked by Enforce gates: ${evaluation.reasons.join("; ")}`);
  }
  const acceptedManifest = writeEnforceResourceManifest({ workspace: input.workspace, agentId: proposal.agentId });
  const receipt = writeEnforceResourceApplyReceipt({
    workspace: input.workspace,
    proposal,
    acceptedManifest,
    force: input.force
  });
  return {
    dryRun: false,
    applied: true,
    proposal,
    evaluation,
    acceptedManifest,
    receiptPath: receipt.receiptPath,
    receiptSigPath: receipt.receiptSigPath
  };
}

function readHistoryJson(path: string): Record<string, unknown> {
  try {
    return JSON.parse(readUtf8(path)) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function historyEntry(input: {
  workspace: string;
  id: string;
  kind: EnforceResourceHistoryEntry["kind"];
  path: string;
  manifestId?: string | null;
  createdAt?: string | null;
}): EnforceResourceHistoryEntry {
  const signature = verifyArtifactFileSignature({ workspace: input.workspace, path: input.path });
  return {
    id: input.id,
    kind: input.kind,
    path: input.path,
    createdAt: input.createdAt ?? null,
    manifestId: input.manifestId ?? null,
    signatureValid: signature.valid,
    signatureReason: signature.reason
  };
}

export function listEnforceResourceHistory(input: {
  workspace: string;
  agentId?: string;
}): EnforceResourceHistoryEntry[] {
  const agentId = normalizeAgentId(input.agentId ?? "default");
  const dir = enforceResourceDir(input.workspace, agentId);
  const entries: EnforceResourceHistoryEntry[] = [];
  const latestPath = latestEnforceResourceManifestPath(input.workspace, agentId);
  if (existsSync(latestPath)) {
    const latest = loadEnforceResourceManifest(latestPath);
    entries.push(historyEntry({
      workspace: input.workspace,
      id: latest.manifestId,
      kind: "latest-manifest",
      path: latestPath,
      manifestId: latest.manifestId,
      createdAt: latest.createdAt
    }));
  }

  const snapshotsDir = join(dir, "snapshots");
  if (existsSync(snapshotsDir)) {
    for (const entry of readdirSync(snapshotsDir).sort()) {
      if (!entry.endsWith(".json")) continue;
      const path = join(snapshotsDir, entry);
      const parsed = readHistoryJson(path);
      entries.push(historyEntry({
        workspace: input.workspace,
        id: String(parsed.manifestId ?? entry.replace(/\.json$/, "")),
        kind: "snapshot",
        path,
        manifestId: typeof parsed.manifestId === "string" ? parsed.manifestId : null,
        createdAt: typeof parsed.createdAt === "string" ? parsed.createdAt : null
      }));
    }
  }

  const applyReceiptsDir = enforceResourceLifecycleReceiptsDir(input.workspace, agentId);
  if (existsSync(applyReceiptsDir)) {
    for (const entry of readdirSync(applyReceiptsDir).filter((name) => name.endsWith(".json")).sort()) {
      const path = join(applyReceiptsDir, entry);
      const parsed = readHistoryJson(path);
      entries.push(historyEntry({
        workspace: input.workspace,
        id: String(parsed.receiptId ?? entry.replace(/\.json$/, "")),
        kind: "apply-receipt",
        path,
        manifestId: typeof parsed.acceptedManifestId === "string" ? parsed.acceptedManifestId : null,
        createdAt: typeof parsed.createdAt === "string" ? parsed.createdAt : null
      }));
    }
  }

  const restoreReceiptsDir = enforceResourceRestoreReceiptsDir(input.workspace, agentId);
  if (existsSync(restoreReceiptsDir)) {
    for (const entry of readdirSync(restoreReceiptsDir).filter((name) => name.endsWith(".json")).sort()) {
      const path = join(restoreReceiptsDir, entry);
      const parsed = readHistoryJson(path);
      entries.push(historyEntry({
        workspace: input.workspace,
        id: String(parsed.receiptId ?? entry.replace(/\.json$/, "")),
        kind: "restore-receipt",
        path,
        manifestId: typeof parsed.manifestId === "string" ? parsed.manifestId : null,
        createdAt: typeof parsed.createdAt === "string" ? parsed.createdAt : null
      }));
    }
  }

  return entries.sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
}

export function enforceResourceLifecycleContract(): EnforceResourceLifecycleContract {
  return {
    schemaVersion: "2026-05-22",
    surface: "Enforce",
    verbs: RESOURCE_LIFECYCLE_VERBS,
    resourceKinds: RESOURCE_KINDS,
    guarantees: [
      "One Enforce protocol covers prompts, tools, routes, memory, policies, guardrails, evaluators, datasets, schemas, environments, code, and agent graphs.",
      "Resource changes are diffed and validated before they can be accepted.",
      "Apply is dry-run by default and accepted changes produce signed receipts.",
      "Rollback restores from a prior signed snapshot or explains the exact missing snapshot/resource.",
      "Score lifecycle artifacts carry the active Enforce resource manifest reference for each run."
    ],
    gates: [
      "manifest-signature-valid",
      "manifest-diff-computed",
      "owners-present",
      "paths-contained",
      "immutable-resources-protected",
      "rollback-snapshot-available",
      "changes-require-review",
      "changed-resources-have-evidence"
    ]
  };
}

export function restoreEnforceResourceSnapshot(input: {
  workspace: string;
  agentId?: string;
  manifestPath?: string;
  resource?: string;
  apply?: boolean;
  includeImmutable?: boolean;
}): EnforceResourceRestorePlan {
  const manifestPath = input.manifestPath ?? latestEnforceResourceManifestPath(input.workspace, input.agentId);
  const manifest = loadEnforceResourceManifest(manifestPath);
  const filesPath = enforceResourceSnapshotFilesPath(input.workspace, manifest.agentId, manifest.manifestId);
  const resources = input.resource
    ? manifest.resources.filter((entry) => entry.id === input.resource || entry.path === input.resource)
    : manifest.resources;

  if (input.resource && resources.length === 0) {
    throw new Error(`Enforce resource not found: ${input.resource}`);
  }

  const entries: EnforceResourceRestoreEntry[] = [];
  for (const resource of resources) {
    const sourcePath = join(filesPath, resource.path);
    const targetPath = resolveWorkspaceResource(input.workspace, resource.path);
    if (!resource.mutable && !input.includeImmutable) {
      entries.push({
        id: resource.id,
        kind: resource.kind,
        path: resource.path,
        sourcePath,
        targetPath,
        status: "immutable-skipped"
      });
      continue;
    }
    if (!existsSync(sourcePath)) {
      entries.push({
        id: resource.id,
        kind: resource.kind,
        path: resource.path,
        sourcePath,
        targetPath,
        status: "missing-snapshot"
      });
      continue;
    }
    if (input.apply) {
      const stat = statSync(sourcePath);
      if (stat.isDirectory()) {
        rmSync(targetPath, { recursive: true, force: true });
        mkdirSync(dirname(targetPath), { recursive: true });
        cpSync(sourcePath, targetPath, { recursive: true, force: true });
      } else if (stat.isFile()) {
        mkdirSync(dirname(targetPath), { recursive: true });
        copyFileSync(sourcePath, targetPath);
      }
    }
    entries.push({
      id: resource.id,
      kind: resource.kind,
      path: resource.path,
      sourcePath,
      targetPath,
      status: input.apply ? "restored" : "would-restore"
    });
  }

  let receiptPath: string | null = null;
  let receiptSigPath: string | null = null;
  if (input.apply) {
    const receiptsDir = enforceResourceRestoreReceiptsDir(input.workspace, manifest.agentId);
    const restoredCount = entries.filter((entry) => entry.status === "restored").length;
    const receipt = {
      schemaVersion: "2026-05-22",
      receiptId: `enforce-resource-restore-${Date.now()}`,
      manifestId: manifest.manifestId,
      agentId: manifest.agentId,
      workspace: resolve(input.workspace),
      manifestPath,
      restoredCount,
      createdAt: new Date().toISOString(),
      entries
    };
    receiptPath = join(receiptsDir, `${receipt.receiptId}.json`);
    writeFileAtomic(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, 0o644);
    const signed = trySignArtifactFile({
      workspace: input.workspace,
      path: receiptPath,
      artifactKind: "enforce-resource-restore-receipt"
    });
    receiptSigPath = signed?.sigPath ?? null;
    writeRollbackLifecycleReceipt({
      workspace: input.workspace,
      agentId: manifest.agentId,
      command: "amc enforce resources restore",
      targetManifestId: manifest.manifestId,
      restoreReceiptPath: receiptPath,
      reason: "Enforce resource restore applied.",
      refs: entries.map((entry) => entry.id)
    });
  }

  return {
    manifestId: manifest.manifestId,
    manifestPath,
    apply: Boolean(input.apply),
    entries,
    receiptPath,
    receiptSigPath
  };
}
