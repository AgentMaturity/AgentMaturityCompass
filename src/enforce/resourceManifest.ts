import {
  copyFileSync,
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
} from "node:fs";
import { randomUUID } from "node:crypto";
import { dirname, basename, isAbsolute, join, relative, resolve } from "node:path";
import { z } from "zod";
import { getAgentPaths, normalizeAgentId } from "../fleet/paths.js";
import {
  artifactSigPath,
  signArtifactFile,
  trySignArtifactFile,
  verifyArtifactFileSignature,
  type ArtifactSignatureVerification,
} from "../lifecycle/artifactSignature.js";
import { writeRollbackLifecycleReceipt } from "../lifecycle/changeReceipt.js";
import { ControlFileLockError, withControlFileLock } from "../lifecycle/controlFileLock.js";
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
  integrity: EnforceResourceIntegrity;
}

export interface EnforceResourceRestoreEntry {
  id: string;
  kind: EnforceResourceKind;
  path: string;
  sourcePath: string | null;
  targetPath: string;
  status:
    | "would-restore"
    | "restored"
    | "would-remove"
    | "removed"
    | "missing-snapshot"
    | "immutable-skipped";
}

export interface EnforceResourceRestorePlan {
  manifestId: string;
  manifestPath: string;
  baselineManifestId: string;
  targetManifestId: string;
  apply: boolean;
  entries: EnforceResourceRestoreEntry[];
  receiptPath: string | null;
  receiptSigPath: string | null;
  integrity: EnforceResourceIntegrity;
}

export type EnforceResourceLifecycleVerb =
  | "status"
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

export type EnforceResourceIntegrityReasonCode =
  | "MANIFEST_MISSING"
  | "MANIFEST_SCHEMA_INVALID"
  | "MANIFEST_HASH_INVALID"
  | "MANIFEST_ID_INVALID"
  | "MANIFEST_COUNT_INVALID"
  | "MANIFEST_DUPLICATE_RESOURCE"
  | "MANIFEST_SIGNATURE_INVALID"
  | "MANIFEST_SCOPE_INVALID"
  | "MANIFEST_PATH_INVALID"
  | "SNAPSHOT_MISSING"
  | "SNAPSHOT_MANIFEST_INVALID"
  | "SNAPSHOT_SIGNATURE_INVALID"
  | "SNAPSHOT_RESOURCE_INVALID"
  | "ACTIVATION_CONFIRMATION_REQUIRED"
  | "ROLLBACK_CONFIRMATION_REQUIRED"
  | "ROLLBACK_TARGET_MISSING"
  | "ROLLBACK_STATE_CHANGED"
  | "RESOURCE_STATE_CHANGED"
  | "RESOURCE_STATE_BUSY"
  | "RECEIPT_SIGNATURE_INVALID";

export interface EnforceResourceIntegrity {
  valid: boolean;
  reasonCodes: EnforceResourceIntegrityReasonCode[];
}

export interface EnforceResourceVersionRef {
  manifestId: string;
  version: string;
  resourcesSha256: string;
  resourceCount: number;
  createdAt: string;
  ref: string;
}

export interface EnforceResourceLifecycleStatus {
  schemaVersion: "2026-07-11";
  agentId: string;
  state: "NOT_INITIALIZED" | "ACTIVE" | "DRIFTED" | "BLOCKED";
  active: EnforceResourceVersionRef | null;
  previous: EnforceResourceVersionRef | null;
  rollbackTarget: EnforceResourceVersionRef | null;
  pendingDiff: EnforceResourceDiff;
  integrity: EnforceResourceIntegrity;
  nextAction: { label: string; command: string } | null;
  claimBoundary: string;
}

export class EnforceResourceIntegrityError extends Error {
  readonly code: EnforceResourceIntegrityReasonCode;

  constructor(code: EnforceResourceIntegrityReasonCode) {
    super(code);
    this.name = "EnforceResourceIntegrityError";
    this.code = code;
  }
}

export function isEnforceResourceIntegrityError(value: unknown): value is EnforceResourceIntegrityError {
  return value instanceof EnforceResourceIntegrityError;
}

interface CandidateResource {
  kind: EnforceResourceKind;
  path: string;
  owner?: EnforceResource["owner"];
  mutable?: boolean;
  schema?: string | null;
}

const RESOURCE_LIFECYCLE_VERBS: EnforceResourceLifecycleVerb[] = [
  "status",
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

const resourceKindSchema = z.enum([
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
  "graph",
]);
const validationStatusSchema = z.enum(["valid", "requires-review", "blocked"]);
const digestSchema = z.string().regex(/^[a-f0-9]{64}$/);
const relativeResourcePathSchema = z.string().min(1).refine((path) => {
  const segments = path.replaceAll("\\", "/").split("/");
  return !isAbsolute(path)
    && !path.includes("\\")
    && !segments.includes("..")
    && !segments.includes("");
}, "resource path must remain relative and contained");
const resourceSchema = z.object({
  id: z.string().min(1),
  type: resourceKindSchema,
  kind: resourceKindSchema,
  path: relativeResourcePathSchema,
  exists: z.boolean(),
  digest: digestSchema.nullable(),
  owner: z.enum(["AMC", "workspace"]),
  mutable: z.boolean(),
  version: z.string().nullable(),
  parentVersion: z.string().nullable(),
  currentVersion: z.string().nullable(),
  schema: z.string().nullable(),
  dependencies: z.array(z.string()),
  lastEvaluation: z.object({
    evaluatedAt: z.iso.datetime(),
    status: validationStatusSchema,
    gates: z.array(z.string()),
  }).strict().nullable(),
  validationStatus: z.union([validationStatusSchema, z.literal("unknown")]),
  lastVerifiedAt: z.iso.datetime().nullable(),
  rollbackTarget: z.string().nullable(),
  rollbackPointer: z.string().nullable(),
  evidenceRefs: z.array(z.string()),
}).strict().superRefine((resource, context) => {
  if (resource.type !== resource.kind) {
    context.addIssue({ code: "custom", message: "resource type and kind must match" });
  }
  if (resource.exists && resource.digest === null) {
    context.addIssue({ code: "custom", message: "existing resource requires a digest" });
  }
});
const manifestSchema = z.object({
  schemaVersion: z.literal("2026-05-22"),
  manifestId: z.string().regex(/^enforce-resources-[a-f0-9]{16}$/),
  agentId: z.string().min(1),
  workspace: z.string().min(1),
  createdAt: z.iso.datetime(),
  resourcesSha256: digestSchema,
  resourceCount: z.number().int().nonnegative(),
  resources: z.array(resourceSchema),
}).strict();

interface EnforceManifestSelection {
  manifest: EnforceResourceManifest;
  path: string;
  kind: "latest" | "snapshot";
  signature: ArtifactSignatureVerification;
}

function integrityError(code: EnforceResourceIntegrityReasonCode): never {
  throw new EnforceResourceIntegrityError(code);
}

function emptyResourceDiff(): EnforceResourceDiff {
  return { added: [], removed: [], changed: [], unchanged: 0 };
}

function enforceResourceDir(workspace: string, agentId?: string): string {
  return join(getAgentPaths(workspace, agentId).rootDir, "enforce", "resources");
}

function withEnforceResourceLifecycleLock<T>(input: {
  workspace: string;
  agentId: string;
  operation: () => T;
}): T {
  try {
    const root = enforceResourceDir(input.workspace, input.agentId);
    resolveWorkspaceResource(input.workspace, workspaceRelative(input.workspace, root));
    return withControlFileLock({
      root,
      name: "lifecycle",
      operation: input.operation,
    });
  } catch (error) {
    if (error instanceof ControlFileLockError) integrityError("RESOURCE_STATE_BUSY");
    throw error;
  }
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

export function projectEnforceResourcePublicValue(value: unknown, workspace: string): unknown {
  const root = resolve(workspace);
  const project = (current: unknown): unknown => {
    if (typeof current === "string" && isAbsolute(current)) {
      return pathWithin(root, current) ? workspaceRelative(root, current) : "[redacted-path]";
    }
    if (Array.isArray(current)) {
      return current.map((entry) => project(entry));
    }
    if (current && typeof current === "object") {
      const output: Record<string, unknown> = {};
      for (const [key, nested] of Object.entries(current as Record<string, unknown>)) {
        output[key] = key === "workspace" ? "." : project(nested);
      }
      return output;
    }
    return current;
  };
  return project(value);
}

function resourceId(kind: EnforceResourceKind, relativePath: string): string {
  return `${kind}:${relativePath.replace(/[^A-Za-z0-9._/-]+/g, "-")}`;
}

function resolveWorkspaceResource(workspace: string, relativePath: string): string {
  const root = resolve(workspace);
  const full = resolve(root, relativePath);
  if (!pathWithin(root, full)) {
    integrityError("MANIFEST_PATH_INVALID");
  }
  const rootPhysical = existsSync(root) ? realpathSync(root) : root;
  let cursor = full;
  const missing: string[] = [];
  while (!existsSync(cursor)) {
    const parent = dirname(cursor);
    if (parent === cursor) integrityError("MANIFEST_PATH_INVALID");
    missing.unshift(basename(cursor));
    cursor = parent;
  }
  const fullPhysical = join(realpathSync(cursor), ...missing);
  if (!pathWithin(rootPhysical, fullPhysical)) {
    integrityError("MANIFEST_PATH_INVALID");
  }
  return full;
}

function pathWithin(root: string, path: string): boolean {
  const rel = relative(resolve(root), resolve(path));
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

function canonicalExistingPath(path: string): string {
  const absolute = resolve(path);
  return existsSync(absolute) ? realpathSync(absolute) : absolute;
}

function parseEnforceResourceManifestBytes(bytes: string | Buffer): EnforceResourceManifest {
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(Buffer.isBuffer(bytes) ? bytes.toString("utf8") : bytes) as unknown;
  } catch {
    integrityError("MANIFEST_SCHEMA_INVALID");
  }
  const parsed = manifestSchema.safeParse(parsedJson);
  if (!parsed.success) integrityError("MANIFEST_SCHEMA_INVALID");
  const manifest = parsed.data as EnforceResourceManifest;
  const ids = new Set<string>();
  const paths = new Set<string>();
  for (const resource of manifest.resources) {
    if (resource.id !== resourceId(resource.kind, resource.path)) {
      integrityError("MANIFEST_ID_INVALID");
    }
    if (ids.has(resource.id) || paths.has(resource.path)) {
      integrityError("MANIFEST_DUPLICATE_RESOURCE");
    }
    ids.add(resource.id);
    paths.add(resource.path);
  }
  if (manifest.resourceCount !== manifest.resources.length) {
    integrityError("MANIFEST_COUNT_INVALID");
  }
  const resourcesSha256 = sha256Hex(canonicalize(manifest.resources));
  if (manifest.resourcesSha256 !== resourcesSha256) {
    integrityError("MANIFEST_HASH_INVALID");
  }
  if (manifest.manifestId !== `enforce-resources-${resourcesSha256.slice(0, 16)}`) {
    integrityError("MANIFEST_ID_INVALID");
  }
  return manifest;
}

function selectEnforceResourceManifest(input: {
  workspace: string;
  agentId?: string;
  manifestPath?: string;
}): EnforceManifestSelection {
  const workspace = resolve(input.workspace);
  const agentId = normalizeAgentId(input.agentId ?? "default");
  const root = enforceResourceDir(workspace, agentId);
  const latest = latestEnforceResourceManifestPath(workspace, agentId);
  const snapshots = join(root, "snapshots");
  const candidate = resolve(workspace, input.manifestPath ?? latest);
  if (!existsSync(candidate)) integrityError("MANIFEST_MISSING");

  if (!pathWithin(root, candidate)) {
    const defaultRoot = enforceResourceDir(workspace, "default");
    const agentsRoot = join(workspace, ".amc", "agents");
    if (pathWithin(defaultRoot, candidate) || pathWithin(agentsRoot, candidate)) {
      integrityError("MANIFEST_SCOPE_INVALID");
    }
    integrityError("MANIFEST_PATH_INVALID");
  }
  if (lstatSync(candidate).isSymbolicLink()) integrityError("MANIFEST_PATH_INVALID");
  const rootPhysical = existsSync(root) ? realpathSync(root) : resolve(root);
  const workspacePhysical = canonicalExistingPath(workspace);
  if (!pathWithin(workspacePhysical, rootPhysical)) integrityError("MANIFEST_PATH_INVALID");
  const candidatePhysical = realpathSync(candidate);
  if (!pathWithin(rootPhysical, candidatePhysical)) integrityError("MANIFEST_PATH_INVALID");

  const isLatest = resolve(candidate) === resolve(latest);
  const isSnapshot = resolve(dirname(candidate)) === resolve(snapshots)
    && /^enforce-resources-[a-f0-9]{16}\.json$/.test(basename(candidate));
  if (!isLatest && !isSnapshot) integrityError("MANIFEST_PATH_INVALID");

  const manifest = parseEnforceResourceManifestBytes(readFileSync(candidate));
  if (
    manifest.agentId !== agentId
    || canonicalExistingPath(manifest.workspace) !== canonicalExistingPath(workspace)
  ) {
    integrityError("MANIFEST_SCOPE_INVALID");
  }
  for (const resource of manifest.resources) {
    resolveWorkspaceResource(workspace, resource.path);
  }
  const kind = isLatest ? "latest" : "snapshot";
  const signature = verifyArtifactFileSignature({
    workspace,
    path: candidate,
    artifactKind: kind === "latest" ? "enforce-resource-manifest" : "enforce-resource-snapshot",
  });
  return { manifest, path: candidate, kind, signature };
}

function digestPath(path: string): string | null {
  if (!existsSync(path)) {
    return null;
  }
  if (lstatSync(path).isSymbolicLink()) integrityError("MANIFEST_PATH_INVALID");
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
      if (entry.isSymbolicLink()) integrityError("MANIFEST_PATH_INVALID");
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

function writeEnforceResourceManifestUnlocked(input: {
  workspace: string;
  agentId?: string;
  manifest?: EnforceResourceManifest;
  requireSignature?: boolean;
}): WriteEnforceResourceManifestResult {
  const manifest = input.manifest ?? buildEnforceResourceManifest(input);
  const manifestPath = latestEnforceResourceManifestPath(input.workspace, manifest.agentId);
  const snapshotPath = enforceResourceSnapshotPath(input.workspace, manifest.agentId, manifest.manifestId);
  const snapshotBundlePath = enforceResourceSnapshotBundlePath(input.workspace, manifest.agentId, manifest.manifestId);
  const bytes = `${JSON.stringify(manifest, null, 2)}\n`;
  const resourceDir = enforceResourceDir(input.workspace, manifest.agentId);
  ensureDir(resourceDir);
  const transactionRoot = mkdtempSync(join(resourceDir, ".snapshot-txn-"));
  const stagedManifestPath = join(transactionRoot, "manifest.json");
  const stagedSnapshotPath = join(transactionRoot, "snapshot.json");
  const stagedBundlePath = join(transactionRoot, "bundle");
  const stagedBundleManifestPath = join(stagedBundlePath, "manifest.json");
  const stagedFilesPath = join(stagedBundlePath, "files");
  try {
    writeFileAtomic(stagedManifestPath, bytes, 0o644);
    writeFileAtomic(stagedSnapshotPath, bytes, 0o644);
    writeFileAtomic(stagedBundleManifestPath, bytes, 0o644);
    for (const resource of manifest.resources) {
      const source = resolveWorkspaceResource(input.workspace, resource.path);
      if (!existsSync(source) || !resource.digest) integrityError("RESOURCE_STATE_CHANGED");
      const destination = join(stagedFilesPath, resource.path);
      copyPath(source, destination);
      if (digestPath(destination) !== resource.digest) integrityError("RESOURCE_STATE_CHANGED");
    }

    const stagedManifestSignature = trySignArtifactFile({
      workspace: input.workspace,
      path: stagedManifestPath,
      artifactKind: "enforce-resource-manifest",
    });
    const stagedSnapshotSignature = trySignArtifactFile({
      workspace: input.workspace,
      path: stagedSnapshotPath,
      artifactKind: "enforce-resource-snapshot",
    });
    if (input.requireSignature && (!stagedManifestSignature || !stagedSnapshotSignature)) {
      integrityError("MANIFEST_SIGNATURE_INVALID");
    }

    const snapshotSigPath = artifactSigPath(snapshotPath);
    const manifestSigPath = artifactSigPath(manifestPath);
    const previousBundlePath = join(transactionRoot, "previous-bundle");
    const hadBundle = existsSync(snapshotBundlePath);
    if (hadBundle) copyPath(snapshotBundlePath, previousBundlePath);
    const previousSnapshotBytes = existsSync(snapshotPath) ? readFileSync(snapshotPath) : null;
    const previousSnapshotSigBytes = existsSync(snapshotSigPath) ? readFileSync(snapshotSigPath) : null;
    const previousManifestBytes = existsSync(manifestPath) ? readFileSync(manifestPath) : null;
    const previousManifestSigBytes = existsSync(manifestSigPath) ? readFileSync(manifestSigPath) : null;
    try {
      ensureDir(dirname(snapshotPath));
      rmSync(snapshotBundlePath, { recursive: true, force: true });
      renameSync(stagedBundlePath, snapshotBundlePath);
      writeFileAtomic(snapshotPath, bytes, 0o644);
      if (stagedSnapshotSignature) {
        writeFileAtomic(snapshotSigPath, readFileSync(stagedSnapshotSignature.sigPath), 0o644);
      } else {
        rmSync(snapshotSigPath, { force: true });
      }
      writeFileAtomic(manifestPath, bytes, 0o644);
      if (stagedManifestSignature) {
        writeFileAtomic(manifestSigPath, readFileSync(stagedManifestSignature.sigPath), 0o644);
      } else {
        rmSync(manifestSigPath, { force: true });
      }
    } catch (error) {
      try {
        if (hadBundle && existsSync(previousBundlePath)) {
          replacePathAtomic(previousBundlePath, snapshotBundlePath);
        } else {
          rmSync(snapshotBundlePath, { recursive: true, force: true });
        }
        if (previousSnapshotBytes) writeFileAtomic(snapshotPath, previousSnapshotBytes, 0o644);
        else rmSync(snapshotPath, { force: true });
        if (previousSnapshotSigBytes) writeFileAtomic(snapshotSigPath, previousSnapshotSigBytes, 0o644);
        else rmSync(snapshotSigPath, { force: true });
        if (previousManifestBytes) writeFileAtomic(manifestPath, previousManifestBytes, 0o644);
        else rmSync(manifestPath, { force: true });
        if (previousManifestSigBytes) writeFileAtomic(manifestSigPath, previousManifestSigBytes, 0o644);
        else rmSync(manifestSigPath, { force: true });
      } catch {
        // Preserve the publication failure; callers can detect invalid state through status.
      }
      throw error;
    }
    return {
      manifest,
      manifestPath,
      snapshotPath,
      snapshotBundlePath,
      manifestSigPath: stagedManifestSignature ? manifestSigPath : null,
      snapshotSigPath: stagedSnapshotSignature ? snapshotSigPath : null,
    };
  } finally {
    rmSync(transactionRoot, { recursive: true, force: true });
  }
}

export function writeEnforceResourceManifest(input: {
  workspace: string;
  agentId?: string;
}): WriteEnforceResourceManifestResult {
  const workspace = resolve(input.workspace);
  const agentId = normalizeAgentId(input.agentId ?? "default");
  return withEnforceResourceLifecycleLock({
    workspace,
    agentId,
    operation: () => writeEnforceResourceManifestUnlocked({ workspace, agentId }),
  });
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
  if (!existsSync(path)) integrityError("MANIFEST_MISSING");
  return parseEnforceResourceManifestBytes(readFileSync(path));
}

export function loadCanonicalEnforceResourceManifest(input: {
  workspace: string;
  agentId?: string;
  manifestPath?: string;
}): EnforceResourceManifest {
  return requireValidManifestSelection(
    selectEnforceResourceManifest(input),
    "MANIFEST_SIGNATURE_INVALID",
  ).manifest;
}

export function listEnforceResources(input: {
  workspace: string;
  agentId?: string;
  manifestPath?: string;
}): EnforceResource[] {
  return requireValidManifestSelection(
    selectEnforceResourceManifest(input),
    "MANIFEST_SIGNATURE_INVALID",
  ).manifest.resources;
}

export function inspectEnforceResource(input: {
  workspace: string;
  selector: string;
  agentId?: string;
  manifestPath?: string;
}): EnforceResource {
  const manifest = requireValidManifestSelection(
    selectEnforceResourceManifest(input),
    "MANIFEST_SIGNATURE_INVALID",
  ).manifest;
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
  const selected = selectEnforceResourceManifest(input);
  const manifestPath = selected.path;
  const expected = selected.manifest;
  const current = buildEnforceResourceManifest({ workspace: input.workspace, agentId: expected.agentId });
  const diff = diffEnforceResourceManifests(expected, current);
  const signature = selected.signature;
  const reasonCodes: EnforceResourceIntegrityReasonCode[] = signature.valid
    ? []
    : ["MANIFEST_SIGNATURE_INVALID"];
  const currentMatches = diff.added.length === 0 && diff.removed.length === 0 && diff.changed.length === 0;
  return {
    valid: signature.valid && currentMatches,
    manifestPath,
    expectedManifestId: expected.manifestId,
    currentManifestId: current.manifestId,
    diff,
    signature,
    integrity: { valid: reasonCodes.length === 0, reasonCodes },
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
  const selected = selectEnforceResourceManifest(input);
  const manifestPath = selected.path;
  const expected = selected.manifest;
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
    receiptId: `enforce-resource-apply-${randomUUID()}`,
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
  try {
    const signed = signArtifactFile({
      workspace: input.workspace,
      path: receiptPath,
      artifactKind: "enforce-resource-lifecycle-receipt",
    });
    return { receiptPath, receiptSigPath: signed.sigPath, receipt };
  } catch (error) {
    rmSync(receiptPath, { force: true });
    rmSync(artifactSigPath(receiptPath), { force: true });
    throw error;
  }
}

function applyEnforceResourceLifecycleUnlocked(input: {
  workspace: string;
  agentId: string;
  manifestPath?: string;
  dryRun?: boolean;
  force?: boolean;
  confirmManifestId?: string;
}): EnforceResourceApplyResult {
  const proposal = proposeEnforceResourceLifecycle(input);
  const evaluation = evaluateEnforceResourceLifecycle(input);
  if (proposal.proposalId !== evaluation.proposalId) integrityError("RESOURCE_STATE_CHANGED");
  if (input.dryRun !== false) {
    return { dryRun: true, applied: false, proposal, evaluation, acceptedManifest: null, receiptPath: null, receiptSigPath: null };
  }
  if (input.confirmManifestId && input.confirmManifestId !== proposal.currentManifestId) {
    integrityError("ACTIVATION_CONFIRMATION_REQUIRED");
  }
  if (!proposal.validation.signature.valid) {
    integrityError("MANIFEST_SIGNATURE_INVALID");
  }
  if (!evaluation.canApply) {
    throw new Error(`Resource apply blocked by Enforce gates: ${evaluation.reasons.join("; ")}`);
  }
  const current = buildEnforceResourceManifest({ workspace: input.workspace, agentId: proposal.agentId });
  if (current.manifestId !== proposal.currentManifestId) integrityError("RESOURCE_STATE_CHANGED");
  const latestPath = latestEnforceResourceManifestPath(input.workspace, proposal.agentId);
  const latestBytes = readFileSync(latestPath);
  const latestSigPath = artifactSigPath(latestPath);
  const latestSigBytes = existsSync(latestSigPath) ? readFileSync(latestSigPath) : null;
  let acceptedManifest: WriteEnforceResourceManifestResult | null = null;
  try {
    acceptedManifest = writeEnforceResourceManifestUnlocked({
      workspace: input.workspace,
      agentId: proposal.agentId,
      manifest: current,
      requireSignature: true,
    });
    const receipt = writeEnforceResourceApplyReceipt({
      workspace: input.workspace,
      proposal,
      acceptedManifest,
      force: input.force,
    });
    return {
      dryRun: false,
      applied: true,
      proposal,
      evaluation,
      acceptedManifest,
      receiptPath: receipt.receiptPath,
      receiptSigPath: receipt.receiptSigPath,
    };
  } catch (error) {
    if (acceptedManifest) {
      writeFileAtomic(latestPath, latestBytes, 0o644);
      if (latestSigBytes) writeFileAtomic(latestSigPath, latestSigBytes, 0o644);
      else rmSync(latestSigPath, { force: true });
    }
    throw error;
  }
}

export function applyEnforceResourceLifecycle(input: {
  workspace: string;
  agentId?: string;
  manifestPath?: string;
  dryRun?: boolean;
  force?: boolean;
  confirmManifestId?: string;
}): EnforceResourceApplyResult {
  const workspace = resolve(input.workspace);
  const agentId = normalizeAgentId(input.agentId ?? "default");
  return withEnforceResourceLifecycleLock({
    workspace,
    agentId,
    operation: () => applyEnforceResourceLifecycleUnlocked({ ...input, workspace, agentId }),
  });
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

const transitionReceiptSchema = z.object({
  agentId: z.string().min(1),
  createdAt: z.iso.datetime(),
  baselineManifestId: z.string().regex(/^enforce-resources-[a-f0-9]{16}$/),
  acceptedManifestId: z.string().regex(/^enforce-resources-[a-f0-9]{16}$/).optional(),
  targetManifestId: z.string().regex(/^enforce-resources-[a-f0-9]{16}$/).optional(),
}).passthrough();

function signedPreviousManifestId(input: {
  workspace: string;
  agentId: string;
  activeManifestId: string;
}): string | null {
  const candidates: Array<{
    path: string;
    artifactKind: "enforce-resource-lifecycle-receipt" | "enforce-resource-restore-receipt";
  }> = [];
  for (const [dir, artifactKind] of [
    [enforceResourceRestoreReceiptsDir(input.workspace, input.agentId), "enforce-resource-restore-receipt"],
    [enforceResourceLifecycleReceiptsDir(input.workspace, input.agentId), "enforce-resource-lifecycle-receipt"],
  ] as const) {
    if (!existsSync(dir)) continue;
    for (const entry of readdirSync(dir).filter((name) => name.endsWith(".json"))) {
      candidates.push({ path: join(dir, entry), artifactKind });
    }
  }
  const transitions = candidates.flatMap((candidate) => {
    const signature = verifyArtifactFileSignature({
      workspace: input.workspace,
      path: candidate.path,
      artifactKind: candidate.artifactKind,
    });
    if (!signature.valid) return [];
    try {
      const parsed = transitionReceiptSchema.parse(JSON.parse(readUtf8(candidate.path)) as unknown);
      if (parsed.agentId !== input.agentId) return [];
      return [{ ...parsed, artifactKind: candidate.artifactKind }];
    } catch {
      return [];
    }
  }).sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  for (const transition of transitions) {
    const accepted = transition.artifactKind === "enforce-resource-restore-receipt"
      ? transition.targetManifestId
      : transition.acceptedManifestId;
    if (accepted === input.activeManifestId && transition.baselineManifestId !== accepted) {
      return transition.baselineManifestId;
    }
  }
  return null;
}

function versionRef(input: {
  workspace: string;
  manifest: EnforceResourceManifest;
  path: string;
}): EnforceResourceVersionRef {
  return {
    manifestId: input.manifest.manifestId,
    version: input.manifest.manifestId,
    resourcesSha256: input.manifest.resourcesSha256,
    resourceCount: input.manifest.resourceCount,
    createdAt: input.manifest.createdAt,
    ref: workspaceRelative(input.workspace, input.path),
  };
}

function previousVersionRef(input: {
  workspace: string;
  agentId: string;
  activeManifestId: string;
}): EnforceResourceVersionRef | null {
  const previousId = signedPreviousManifestId(input);
  if (!previousId) return null;
  try {
    const path = enforceResourceSnapshotPath(input.workspace, input.agentId, previousId);
    const selected = selectEnforceResourceManifest({
      workspace: input.workspace,
      agentId: input.agentId,
      manifestPath: path,
    });
    if (selected.manifest.manifestId !== previousId) return null;
    return verifiedSnapshotVersionRef({
      workspace: input.workspace,
      agentId: input.agentId,
      target: selected,
    });
  } catch (error) {
    if (isEnforceResourceIntegrityError(error)) throw error;
    return null;
  }
}

export function projectEnforceResourceLifecycleStatus(input: {
  workspace: string;
  agentId?: string;
}): EnforceResourceLifecycleStatus {
  const agentId = normalizeAgentId(input.agentId ?? "default");
  const latest = latestEnforceResourceManifestPath(input.workspace, agentId);
  if (!existsSync(latest)) {
    return {
      schemaVersion: "2026-07-11",
      agentId,
      state: "NOT_INITIALIZED",
      active: null,
      previous: null,
      rollbackTarget: null,
      pendingDiff: emptyResourceDiff(),
      integrity: { valid: true, reasonCodes: [] },
      nextAction: { label: "Create the first signed resource version", command: `amc resource snapshot --agent ${agentId}` },
      claimBoundary: "No active resource version is claimed until a canonical signed manifest exists.",
    };
  }
  try {
    const selected = selectEnforceResourceManifest({ workspace: input.workspace, agentId });
    const verification = verifyEnforceResourceManifest({ workspace: input.workspace, agentId });
    if (!verification.integrity.valid) {
      return {
        schemaVersion: "2026-07-11",
        agentId,
        state: "BLOCKED",
        active: null,
        previous: null,
        rollbackTarget: null,
        pendingDiff: verification.diff,
        integrity: verification.integrity,
        nextAction: { label: "Repair signed resource state", command: "amc doctor --strict --json" },
        claimBoundary: "Untrusted manifest state cannot become an active or rollback-eligible version.",
      };
    }
    const active = verifiedSnapshotVersionRef({
      workspace: input.workspace,
      agentId,
      target: selected,
    });
    const previous = previousVersionRef({ workspace: input.workspace, agentId, activeManifestId: active.manifestId });
    return {
      schemaVersion: "2026-07-11",
      agentId,
      state: verification.valid ? "ACTIVE" : "DRIFTED",
      active,
      previous,
      rollbackTarget: previous,
      pendingDiff: verification.diff,
      integrity: { valid: true, reasonCodes: [] },
      nextAction: verification.valid
        ? previous ? { label: "Review rollback", command: `amc resource rollback --manifest ${previous.ref}` } : null
        : { label: "Review and activate pending changes", command: `amc resource activate --agent ${agentId}` },
      claimBoundary: "Only strict, signed, agent-bound manifests are active; drift is never reported as an activated version.",
    };
  } catch (error) {
    const code = isEnforceResourceIntegrityError(error) ? error.code : "MANIFEST_SCHEMA_INVALID";
    return {
      schemaVersion: "2026-07-11",
      agentId,
      state: "BLOCKED",
      active: null,
      previous: null,
      rollbackTarget: null,
      pendingDiff: emptyResourceDiff(),
      integrity: { valid: false, reasonCodes: [code] },
      nextAction: { label: "Repair signed resource state", command: "amc doctor --strict --json" },
      claimBoundary: "Untrusted manifest state cannot become an active or rollback-eligible version.",
    };
  }
}

export function resolveEnforceResourceRollbackTarget(input: {
  workspace: string;
  agentId?: string;
}): EnforceResourceVersionRef {
  const status = projectEnforceResourceLifecycleStatus(input);
  if (!status.integrity.valid) {
    integrityError(status.integrity.reasonCodes[0] ?? "MANIFEST_SIGNATURE_INVALID");
  }
  if (!status.rollbackTarget) integrityError("ROLLBACK_TARGET_MISSING");
  return status.rollbackTarget;
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

interface PreparedRestoreEntry {
  resource: EnforceResource;
  operation: "restore" | "remove";
  sourcePath: string | null;
  targetPath: string;
  expectedDigest: string | null;
}

function requireValidManifestSelection(
  selected: EnforceManifestSelection,
  reason: EnforceResourceIntegrityReasonCode,
): EnforceManifestSelection {
  if (!selected.signature.valid) integrityError(reason);
  return selected;
}

function verifiedSnapshotSource(input: {
  workspace: string;
  agentId: string;
  target: EnforceManifestSelection;
}): { snapshotPath: string; filesPath: string } {
  const snapshotPath = enforceResourceSnapshotPath(
    input.workspace,
    input.agentId,
    input.target.manifest.manifestId,
  );
  if (!existsSync(snapshotPath)) integrityError("SNAPSHOT_MISSING");
  const snapshot = selectEnforceResourceManifest({
    workspace: input.workspace,
    agentId: input.agentId,
    manifestPath: snapshotPath,
  });
  if (!snapshot.signature.valid) integrityError("SNAPSHOT_SIGNATURE_INVALID");
  if (
    snapshot.manifest.manifestId !== input.target.manifest.manifestId
    || snapshot.manifest.resourcesSha256 !== input.target.manifest.resourcesSha256
  ) {
    integrityError("SNAPSHOT_MANIFEST_INVALID");
  }
  const bundleManifestPath = enforceResourceSnapshotManifestPath(
    input.workspace,
    input.agentId,
    input.target.manifest.manifestId,
  );
  if (!existsSync(bundleManifestPath) || lstatSync(bundleManifestPath).isSymbolicLink()) {
    integrityError("SNAPSHOT_MANIFEST_INVALID");
  }
  try {
    const bundled = parseEnforceResourceManifestBytes(readFileSync(bundleManifestPath));
    if (
      bundled.manifestId !== snapshot.manifest.manifestId
      || bundled.resourcesSha256 !== snapshot.manifest.resourcesSha256
      || !readFileSync(bundleManifestPath).equals(readFileSync(snapshotPath))
    ) {
      integrityError("SNAPSHOT_MANIFEST_INVALID");
    }
  } catch (error) {
    if (isEnforceResourceIntegrityError(error)) integrityError("SNAPSHOT_MANIFEST_INVALID");
    throw error;
  }
  const filesPath = enforceResourceSnapshotFilesPath(
    input.workspace,
    input.agentId,
    input.target.manifest.manifestId,
  );
  if (!existsSync(filesPath) || !statSync(filesPath).isDirectory()) {
    integrityError("SNAPSHOT_MISSING");
  }
  return { snapshotPath, filesPath };
}

function verifiedSnapshotVersionRef(input: {
  workspace: string;
  agentId: string;
  target: EnforceManifestSelection;
}): EnforceResourceVersionRef {
  if (!input.target.signature.valid) integrityError("MANIFEST_SIGNATURE_INVALID");
  const snapshot = verifiedSnapshotSource(input);
  for (const resource of input.target.manifest.resources) {
    const sourcePath = resolveWorkspaceResource(snapshot.filesPath, resource.path);
    if (
      !existsSync(sourcePath)
      || lstatSync(sourcePath).isSymbolicLink()
      || !resource.digest
      || digestPath(sourcePath) !== resource.digest
    ) {
      integrityError("SNAPSHOT_RESOURCE_INVALID");
    }
  }
  return versionRef({
    workspace: input.workspace,
    manifest: input.target.manifest,
    path: snapshot.snapshotPath,
  });
}

function copyPath(source: string, target: string): void {
  if (lstatSync(source).isSymbolicLink()) integrityError("SNAPSHOT_RESOURCE_INVALID");
  const stat = statSync(source);
  mkdirSync(dirname(target), { recursive: true });
  if (stat.isDirectory()) {
    cpSync(source, target, { recursive: true, force: true });
  } else if (stat.isFile()) {
    copyFileSync(source, target);
  } else {
    integrityError("SNAPSHOT_RESOURCE_INVALID");
  }
}

function replacePathAtomic(source: string, target: string): void {
  const stat = statSync(source);
  if (stat.isFile()) {
    writeFileAtomic(target, readFileSync(source), stat.mode & 0o777);
    return;
  }
  if (!stat.isDirectory()) integrityError("SNAPSHOT_RESOURCE_INVALID");
  mkdirSync(dirname(target), { recursive: true });
  const staged = mkdtempSync(join(dirname(target), `.${basename(target)}.restore-`));
  rmSync(staged, { recursive: true, force: true });
  cpSync(source, staged, { recursive: true, force: true });
  rmSync(target, { recursive: true, force: true });
  renameSync(staged, target);
}

function prepareRestore(input: {
  workspace: string;
  baseline: EnforceManifestSelection;
  target: EnforceManifestSelection;
  filesPath: string;
  resource?: string;
  includeImmutable?: boolean;
}): { entries: EnforceResourceRestoreEntry[]; prepared: PreparedRestoreEntry[] } {
  const targetResources = input.resource
    ? input.target.manifest.resources.filter((entry) => entry.id === input.resource || entry.path === input.resource)
    : input.target.manifest.resources;
  const targetIds = new Set(input.target.manifest.resources.map((entry) => entry.id));
  const targetPaths = new Set(input.target.manifest.resources.map((entry) => entry.path));
  const removalResources = input.baseline.manifest.resources
    .filter((entry) => !targetIds.has(entry.id) && !targetPaths.has(entry.path))
    .filter((entry) => !input.resource || entry.id === input.resource || entry.path === input.resource);
  if (input.resource && targetResources.length === 0 && removalResources.length === 0) {
    throw new Error("Enforce resource not found");
  }
  const entries: EnforceResourceRestoreEntry[] = [];
  const prepared: PreparedRestoreEntry[] = [];
  for (const resource of targetResources) {
    const sourcePath = resolveWorkspaceResource(input.filesPath, resource.path);
    const targetPath = resolveWorkspaceResource(input.workspace, resource.path);
    if (!resource.mutable && !input.includeImmutable) {
      entries.push({
        id: resource.id,
        kind: resource.kind,
        path: resource.path,
        sourcePath,
        targetPath,
        status: "immutable-skipped",
      });
      continue;
    }
    if (!existsSync(sourcePath) || lstatSync(sourcePath).isSymbolicLink()) {
      integrityError("SNAPSHOT_RESOURCE_INVALID");
    }
    const sourceDigest = digestPath(sourcePath);
    if (!resource.digest || sourceDigest !== resource.digest) {
      integrityError("SNAPSHOT_RESOURCE_INVALID");
    }
    entries.push({
      id: resource.id,
      kind: resource.kind,
      path: resource.path,
      sourcePath,
      targetPath,
      status: "would-restore",
    });
    prepared.push({ operation: "restore", resource, sourcePath, targetPath, expectedDigest: resource.digest });
  }
  for (const resource of removalResources) {
    const targetPath = resolveWorkspaceResource(input.workspace, resource.path);
    if (!resource.mutable && !input.includeImmutable) {
      entries.push({
        id: resource.id,
        kind: resource.kind,
        path: resource.path,
        sourcePath: null,
        targetPath,
        status: "immutable-skipped",
      });
      continue;
    }
    if (existsSync(targetPath)) {
      if (lstatSync(targetPath).isSymbolicLink()) integrityError("ROLLBACK_STATE_CHANGED");
      if (!resource.digest || digestPath(targetPath) !== resource.digest) {
        integrityError("ROLLBACK_STATE_CHANGED");
      }
    }
    entries.push({
      id: resource.id,
      kind: resource.kind,
      path: resource.path,
      sourcePath: null,
      targetPath,
      status: "would-remove",
    });
    prepared.push({ operation: "remove", resource, sourcePath: null, targetPath, expectedDigest: resource.digest });
  }
  return { entries, prepared };
}

function restoreEnforceResourceSnapshotUnlocked(input: {
  workspace: string;
  agentId: string;
  manifestPath?: string;
  resource?: string;
  apply?: boolean;
  includeImmutable?: boolean;
  confirmManifestId?: string;
}): EnforceResourceRestorePlan {
  const workspace = resolve(input.workspace);
  const agentId = normalizeAgentId(input.agentId ?? "default");
  const baseline = requireValidManifestSelection(
    selectEnforceResourceManifest({ workspace, agentId }),
    "MANIFEST_SIGNATURE_INVALID",
  );
  const target = requireValidManifestSelection(
    selectEnforceResourceManifest({ workspace, agentId, manifestPath: input.manifestPath }),
    input.manifestPath ? "SNAPSHOT_SIGNATURE_INVALID" : "MANIFEST_SIGNATURE_INVALID",
  );
  const snapshot = verifiedSnapshotSource({ workspace, agentId, target });
  const preparedPlan = prepareRestore({
    workspace,
    baseline,
    target,
    filesPath: snapshot.filesPath,
    resource: input.resource,
    includeImmutable: input.includeImmutable,
  });
  const planBase = {
    manifestId: target.manifest.manifestId,
    manifestPath: target.path,
    baselineManifestId: baseline.manifest.manifestId,
    targetManifestId: target.manifest.manifestId,
    integrity: { valid: true, reasonCodes: [] } satisfies EnforceResourceIntegrity,
  };
  if (input.apply && input.confirmManifestId && input.confirmManifestId !== target.manifest.manifestId) {
    integrityError("ROLLBACK_CONFIRMATION_REQUIRED");
  }
  if (!input.apply) {
    return {
      ...planBase,
      apply: false,
      entries: preparedPlan.entries,
      receiptPath: null,
      receiptSigPath: null,
    };
  }

  const activeBeforeWrite = requireValidManifestSelection(
    selectEnforceResourceManifest({ workspace, agentId }),
    "MANIFEST_SIGNATURE_INVALID",
  );
  if (activeBeforeWrite.manifest.manifestId !== baseline.manifest.manifestId) {
    integrityError("ROLLBACK_STATE_CHANGED");
  }

  const transactionRoot = mkdtempSync(join(enforceResourceDir(workspace, agentId), ".restore-txn-"));
  const latestPath = latestEnforceResourceManifestPath(workspace, agentId);
  const latestSigPath = artifactSigPath(latestPath);
  const latestBytes = readFileSync(latestPath);
  const latestSigBytes = existsSync(latestSigPath) ? readFileSync(latestSigPath) : null;
  const staged: Array<PreparedRestoreEntry & { stagedPath: string; backupPath: string; existed: boolean }> = [];
  let receiptPath: string | null = null;
  let receiptSigPath: string | null = null;
  let lifecycleReceiptPath: string | null = null;
  let lifecycleReceiptSigPath: string | null = null;
  try {
    for (const [index, entry] of preparedPlan.prepared.entries()) {
      const stagedPath = join(transactionRoot, "staged", String(index));
      const backupPath = join(transactionRoot, "backup", String(index));
      if (entry.operation === "restore") {
        if (!entry.sourcePath || !entry.expectedDigest) integrityError("SNAPSHOT_RESOURCE_INVALID");
        copyPath(entry.sourcePath, stagedPath);
        if (digestPath(stagedPath) !== entry.expectedDigest) integrityError("SNAPSHOT_RESOURCE_INVALID");
      }
      const checkedTargetPath = resolveWorkspaceResource(workspace, entry.resource.path);
      if (resolve(checkedTargetPath) !== resolve(entry.targetPath)) integrityError("ROLLBACK_STATE_CHANGED");
      const existed = existsSync(entry.targetPath);
      if (existed) {
        if (lstatSync(entry.targetPath).isSymbolicLink()) integrityError("ROLLBACK_STATE_CHANGED");
        if (entry.operation === "remove" && entry.expectedDigest && digestPath(entry.targetPath) !== entry.expectedDigest) {
          integrityError("ROLLBACK_STATE_CHANGED");
        }
        copyPath(entry.targetPath, backupPath);
      }
      staged.push({ ...entry, stagedPath, backupPath, existed });
    }

    const targetRecheck = requireValidManifestSelection(
      selectEnforceResourceManifest({ workspace, agentId, manifestPath: snapshot.snapshotPath }),
      "SNAPSHOT_SIGNATURE_INVALID",
    );
    if (targetRecheck.manifest.manifestId !== target.manifest.manifestId) {
      integrityError("ROLLBACK_STATE_CHANGED");
    }

    for (const entry of staged) {
      const checkedTargetPath = resolveWorkspaceResource(workspace, entry.resource.path);
      if (resolve(checkedTargetPath) !== resolve(entry.targetPath)) integrityError("ROLLBACK_STATE_CHANGED");
      if (entry.operation === "remove") {
        rmSync(entry.targetPath, { recursive: true, force: true });
        if (existsSync(entry.targetPath)) integrityError("ROLLBACK_STATE_CHANGED");
      } else {
        if (!entry.expectedDigest) integrityError("SNAPSHOT_RESOURCE_INVALID");
        replacePathAtomic(entry.stagedPath, entry.targetPath);
        if (digestPath(entry.targetPath) !== entry.expectedDigest) integrityError("ROLLBACK_STATE_CHANGED");
      }
    }

    writeFileAtomic(latestPath, readFileSync(snapshot.snapshotPath), 0o644);
    signArtifactFile({ workspace, path: latestPath, artifactKind: "enforce-resource-manifest" });
    const activated = verifyEnforceResourceManifest({ workspace, agentId });
    if (!activated.valid || activated.expectedManifestId !== target.manifest.manifestId) {
      integrityError("ROLLBACK_STATE_CHANGED");
    }

    const entries = preparedPlan.entries.map((entry) => (
      entry.status === "would-restore"
        ? { ...entry, status: "restored" as const }
        : entry.status === "would-remove"
          ? { ...entry, status: "removed" as const }
          : entry
    ));
    const receipt = {
      schemaVersion: "2026-07-11",
      receiptId: `enforce-resource-restore-${randomUUID()}`,
      receiptType: "resource.rollback",
      agentId,
      baselineManifestId: baseline.manifest.manifestId,
      targetManifestId: target.manifest.manifestId,
      restoredCount: entries.filter((entry) => entry.status === "restored").length,
      createdAt: new Date().toISOString(),
      entries: entries.map((entry) => ({ id: entry.id, kind: entry.kind, path: entry.path, status: entry.status })),
    };
    receiptPath = join(enforceResourceRestoreReceiptsDir(workspace, agentId), `${receipt.receiptId}.json`);
    writeFileAtomic(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, 0o644);
    receiptSigPath = signArtifactFile({
      workspace,
      path: receiptPath,
      artifactKind: "enforce-resource-restore-receipt",
    }).sigPath;
    const lifecycleReceipt = writeRollbackLifecycleReceipt({
      workspace,
      agentId,
      command: "amc resource rollback --apply",
      targetManifestId: target.manifest.manifestId,
      restoreReceiptPath: workspaceRelative(workspace, receiptPath),
      reason: "Verified Enforce resource rollback activated.",
      refs: entries.map((entry) => entry.id),
    });
    lifecycleReceiptPath = lifecycleReceipt.receiptPath;
    lifecycleReceiptSigPath = lifecycleReceipt.signaturePath;
    if (!lifecycleReceiptSigPath) integrityError("RECEIPT_SIGNATURE_INVALID");
    return {
      ...planBase,
      apply: true,
      entries,
      receiptPath,
      receiptSigPath,
    };
  } catch (error) {
    for (const entry of [...staged].reverse()) {
      try {
        const checkedTargetPath = resolveWorkspaceResource(workspace, entry.resource.path);
        if (resolve(checkedTargetPath) !== resolve(entry.targetPath)) continue;
        if (entry.existed && existsSync(entry.backupPath)) {
          replacePathAtomic(entry.backupPath, entry.targetPath);
        } else {
          rmSync(entry.targetPath, { recursive: true, force: true });
        }
      } catch {
        // Preserve the original integrity failure; recovery remains best effort.
      }
    }
    try {
      writeFileAtomic(latestPath, latestBytes, 0o644);
      if (latestSigBytes) writeFileAtomic(latestSigPath, latestSigBytes, 0o644);
      else rmSync(latestSigPath, { force: true });
    } catch {
      // Preserve the original integrity failure.
    }
    if (receiptPath) rmSync(receiptPath, { force: true });
    if (receiptSigPath) rmSync(receiptSigPath, { force: true });
    if (lifecycleReceiptPath) rmSync(lifecycleReceiptPath, { force: true });
    if (lifecycleReceiptSigPath) rmSync(lifecycleReceiptSigPath, { force: true });
    throw error;
  } finally {
    rmSync(transactionRoot, { recursive: true, force: true });
  }
}

export function restoreEnforceResourceSnapshot(input: {
  workspace: string;
  agentId?: string;
  manifestPath?: string;
  resource?: string;
  apply?: boolean;
  includeImmutable?: boolean;
  confirmManifestId?: string;
}): EnforceResourceRestorePlan {
  const workspace = resolve(input.workspace);
  const agentId = normalizeAgentId(input.agentId ?? "default");
  return withEnforceResourceLifecycleLock({
    workspace,
    agentId,
    operation: () => restoreEnforceResourceSnapshotUnlocked({ ...input, workspace, agentId }),
  });
}
