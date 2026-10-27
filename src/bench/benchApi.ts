import { canonicalize } from "../utils/json.js";
import { captureRegistryFiles, registryFileBytes, assertRegistryFiles, BenchRegistryPublicationError } from "./benchRegistryPublication.js";
import { withControlFileLock } from "../lifecycle/controlFileLock.js";
import { containedPath } from "../utils/pathSafety.js";
import { captureBenchImportLogAuthority } from "./benchImportLogAuthority.js";
import { BenchImportPublicationError } from "./benchImportPublication.js";
import { appendTransparencyEntryAsync } from "../transparency/asyncWorkspaceAppend.js";
import YAML from "yaml";
import { benchRegistryConfigSchema } from "./benchRegistrySchema.js";
import type { OrgPairsOptions } from "../org/preparedOrgPairs.js";
import { createBenchArtifactAsync } from "./benchArtifactAsync.js";
import { createBenchComparisonAsync } from "./benchComparisonAsync.js";
import { randomUUID } from "node:crypto";
import { readFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { z } from "zod";
import { withWorkspaceScope } from "../enforce/evidenceEmitter.js";
import { appendTransparencyEntry } from "../transparency/logChain.js";
import { createApprovalForIntent, consumeApprovedExecution, verifyApprovalForExecution } from "../approvals/approvalEngine.js";
import { ensureDir, pathExists, readUtf8, writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { createBenchArtifact, inspectBenchArtifact, listExportedBenchArtifacts } from "./benchArtifact.js";
import { createBenchComparison } from "./benchComparer.js";
import { browseBenchRegistry, importBenchFromRegistryAttempt } from "./benchRegistryClient.js";
import { publishBenchToRegistry, prepareBenchRegistryPublish } from "./benchRegistryServer.js";
import {
  benchImportsRegistriesPath, loadBenchRegistriesConfigAsync,
  benchComparisonLatestPath,
  initBenchPolicy,
  loadBenchComparison,
  loadBenchPolicy,
  loadBenchRegistriesConfig,
  saveBenchPolicy,
  saveBenchRegistriesConfig,
  verifyBenchPolicySignature,
  verifyBenchRegistriesSignature
} from "./benchPolicyStore.js";
import { listImportedBenches } from "./benchRegistryStore.js";
export { benchInitForApiAsync, benchPolicyApplyForApiAsync, benchRegistriesForApiAsync, benchRegistryApplyForApiAsync, benchRegistryAddForApiAsync } from "./benchPolicyAsync.js";
const pendingPublishSchema = z.object({
  v: z.literal(1),
  requestId: z.string().min(1),
  approvalRequestId: z.string().min(1),
  intentId: z.string().min(1),
  agentId: z.string().min(1),
  file: z.string().min(1),
  fileSha256: z.string().length(64),
  registryDir: z.string().min(1),
  registryFingerprint: z.string().length(64),
  registryKeyPath: z.string().min(1),
  benchId: z.string().min(1),
  version: z.string().min(1),
  createdTs: z.number().int()
});

function pendingDir(workspace: string): string {
  return join(workspace, ".amc", "bench", "pending");
}

function pendingPath(workspace: string, approvalRequestId: string): string {
  return containedPath(pendingDir(workspace), "the pending benchmark publication directory", `${approvalRequestId}.json`);
}

function savePendingPublish(workspace: string, pending: z.infer<typeof pendingPublishSchema>): string {
  ensureDir(pendingDir(workspace));
  const file = pendingPath(workspace, pending.approvalRequestId);
  withControlFileLock({ root: pendingDir(workspace), name: "bench-pending-publish", operation: () => {
    writeFileAtomic(file, JSON.stringify(pendingPublishSchema.parse(pending), null, 2), 0o600);
  } });
  return file;
}

function loadPendingPublish(workspace: string, approvalRequestId: string): z.infer<typeof pendingPublishSchema> {
  const file = pendingPath(workspace, approvalRequestId);
  if (!pathExists(file)) {
    throw new Error(`pending bench publish not found: ${approvalRequestId}`);
  }
  return pendingPublishSchema.parse(JSON.parse(readUtf8(file)) as unknown);
}

function removePendingPublish(workspace: string, approvalRequestId: string): void {
  const file = pendingPath(workspace, approvalRequestId);
  withControlFileLock({ root: pendingDir(workspace), name: "bench-pending-publish", operation: () => {
    if (pathExists(file)) rmSync(file, { force: true });
  } });
}

function trustRank(label: "LOW" | "MEDIUM" | "HIGH"): number {
  if (label === "HIGH") return 3;
  if (label === "MEDIUM") return 2;
  return 1;
}

function assertPublishGates(params: {
  workspace: string;
  benchFile: string;
}): {
  bench: ReturnType<typeof inspectBenchArtifact>["bench"];
  fileSha256: string;
  registryFingerprintHint: string;
} {
  const policySig = verifyBenchPolicySignature(params.workspace);
  if (!policySig.valid) {
    throw new Error(`bench policy signature invalid: ${policySig.reason ?? "unknown"}`);
  }
  const policy = loadBenchPolicy(params.workspace);
  const inspected = inspectBenchArtifact(params.benchFile);
  const bench = inspected.bench;
  if (bench.evidence.integrityIndex < policy.benchPolicy.integrityGates.minIntegrityIndexForPublish) {
    throw new Error("publish blocked: integrity gate not met");
  }
  if (bench.evidence.correlationRatio < policy.benchPolicy.integrityGates.minCorrelationRatioForPublish) {
    throw new Error("publish blocked: correlation gate not met");
  }
  if (trustRank(bench.evidence.trustLabel) < trustRank(policy.benchPolicy.integrityGates.requireTrustLevelForPublish)) {
    throw new Error("publish blocked: trust level gate not met");
  }
  return {
    bench,
    fileSha256: inspected.sha256,
    registryFingerprintHint: inspected.signature.envelope?.fingerprint ?? "0".repeat(64)
  };
}

export function benchInitForApi(workspace: string) {
  return initBenchPolicy(workspace);
}

export function benchPolicyForApi(workspace: string) {
  return {
    policy: loadBenchPolicy(workspace),
    signature: verifyBenchPolicySignature(workspace)
  };
}

export function benchPolicyApplyForApi(params: {
  workspace: string;
  policy: ReturnType<typeof loadBenchPolicy>;
}) {
  return saveBenchPolicy(params.workspace, params.policy);
}

export function benchCreateForApi(params: {
  workspace: string;
  scope: "workspace" | "node" | "agent";
  id?: string | null;
  outFile?: string | null;
  windowDays?: number;
  named?: boolean;
  labels?: {
    industry?: "software" | "fintech" | "health" | "manufacturing" | "other";
    agentType?: "code-agent" | "support-agent" | "ops-agent" | "research-agent" | "sales-agent" | "other";
    deployment?: "single" | "host" | "k8s" | "compose";
  };
}) {
  const outFile = params.outFile
    ? resolve(params.workspace, params.outFile)
    : join(
        params.workspace,
        ".amc",
        "bench",
        "exports",
        params.scope,
        (params.id ?? "workspace").replace(/[^a-zA-Z0-9_-]/g, "_"),
        `${Date.now()}.amcbench`
      );
  return createBenchArtifact({
    workspace: params.workspace,
    scope: params.scope,
    id: params.id,
    outFile,
    windowDays: params.windowDays,
    named: params.named,
    labels: params.labels
  });
}

export function benchExportsForApi(workspace: string) {
  return listExportedBenchArtifacts(workspace);
}

export function benchImportsForApi(workspace: string) {
  return listImportedBenches(workspace);
}

export function benchRegistriesForApi(workspace: string) {
  return {
    registries: loadBenchRegistriesConfig(workspace),
    signature: verifyBenchRegistriesSignature(workspace)
  };
}

export function benchRegistryApplyForApi(params: {
  workspace: string;
  config: ReturnType<typeof loadBenchRegistriesConfig>;
}) {
  return saveBenchRegistriesConfig(params.workspace, params.config);
}

export async function benchRegistryBrowseForApi(params: {
  workspace: string;
  registryId: string;
  query?: string;
}, options: OrgPairsOptions = {}) {
  const { workspace: explicitWorkspace, registryId, query } = params;
  const workspace = explicitWorkspace.trim() ? resolve(explicitWorkspace) : explicitWorkspace;
  const actor = options.beforePublish, inputs = options.assertInputsCurrent, path = benchImportsRegistriesPath(workspace);
  actor?.(); inputs?.();
  // Existing browse reads do not acquire a signer or require an unrelated sidecar; retain the exact used body.
  const initial = pathExists(path) ? readFileSync(path) : null;
  const config = initial === null
    ? await loadBenchRegistriesConfigAsync(workspace, { beforePublish: actor, assertInputsCurrent: inputs })
    : benchRegistryConfigSchema.parse(YAML.parse(initial.toString("utf8")) as unknown);
  const selected = initial ?? Buffer.from(YAML.stringify(config));
  const current = () => { actor?.(); inputs?.();
    if (!pathExists(path) || !readFileSync(path).equals(selected)) throw new Error("selected bench registry configuration changed during browse; retry"); };
  current();
  const entry = config.benchRegistries.registries.find((row) => row.id === registryId);
  if (!entry) throw new Error(`bench registry not configured: ${registryId}`);
  let result: Awaited<ReturnType<typeof browseBenchRegistry>>;
  try {
    result = await withWorkspaceScope(workspace, () => browseBenchRegistry({ base: entry.type === "file" ? resolve(workspace, entry.base) : entry.base, query }));
  } catch (cause) {
    // Recheck the actual retained actor before a failed network read can become an HTTP response.
    try { actor?.(); } catch (refusal) { throw new Error("bench registry browse authority refused", { cause: new AggregateError([cause, refusal]) }); }
    throw cause;
  }
  current(); return result;
}

export async function benchImportForApi(params: { workspace: string; registryId: string; benchRef: string }, options: OrgPairsOptions = {}) {
  const { workspace: explicitWorkspace, registryId, benchRef } = params, workspace = explicitWorkspace.trim() ? resolve(explicitWorkspace) : explicitWorkspace;
  const original = captureBenchImportLogAuthority(workspace, options);
  const imported = await importBenchFromRegistryAttempt({ workspace, registryId, benchRef }, { beforePublish: original });
  const current = () => { original(); imported.assertPublished(); }, completedLogs: string[] = [];
  try {
    current(); const logged = await appendTransparencyEntryAsync({ workspace, type: "BENCH_IMPORTED", agentId: "workspace",
      artifact: { kind: "amcbench", sha256: sha256Hex(readFileSync(imported.result.filePath)), id: `${imported.result.benchId}@${imported.result.version}` } }, { beforeCommit: current });
    completedLogs.push(logged.hash); current(); return imported.result;
  } catch (cause) { throw new BenchImportPublicationError("workspace-log", imported.completedPaths, null, cause, Object.freeze([...completedLogs])); }
}

export function benchCompareForApi(params: {
  workspace: string;
  scope: "workspace" | "node" | "agent";
  id: string;
  against?: "imported" | `registry:${string}`;
}) {
  return createBenchComparison(params);
}

export function benchComparisonLatestForApi(workspace: string) {
  const latest = loadBenchComparison(workspace);
  const path = benchComparisonLatestPath(workspace);
  return {
    latest,
    path,
    exists: pathExists(path)
  };
}

export function benchPublishRequestForApi(params: {
  workspace: string;
  agentId: string;
  /** Who raises the approval request (P1-78): the authenticated principal, or the CLI's self-reported OS user. */
  initiator: string;
  file: string;
  registryDir: string;
  registryKeyPath: string;
  explicitOwnerAck: boolean;
}): {
  requestId: string;
  approvalRequestId: string;
  intentId: string;
  benchId: string;
  version: string;
} {
  if (!params.explicitOwnerAck) {
    throw new Error("publish blocked: explicit owner acknowledgment required");
  }
  const checked = assertPublishGates({
    workspace: params.workspace,
    benchFile: params.file
  });
  const registryPub = readUtf8(join(resolve(params.registryDir), "registry.pub"));
  const registryFingerprint = sha256Hex(Buffer.from(registryPub, "utf8"));
  const requestId = `benchpub_${randomUUID().replace(/-/g, "")}`;
  const version = new Date(checked.bench.generatedTs).toISOString();
  const intentId = `bench-publish-${requestId}`;
  const approval = createApprovalForIntent({
    workspace: params.workspace,
    initiator: params.initiator,
    agentId: params.agentId,
    intentId,
    toolName: "bench.publish",
    actionClass: "SECURITY",
    requestedMode: "EXECUTE",
    effectiveMode: "EXECUTE",
    riskTier: "high",
    intentPayload: {
      requestId,
      benchId: checked.bench.benchId,
      version,
      benchSha256: checked.fileSha256,
      registryFingerprint,
      registryDir: resolve(params.registryDir)
    },
    leaseConstraints: {
      scopes: [],
      routeAllowlist: [],
      modelAllowlist: []
    }
  });
  const pending = pendingPublishSchema.parse({
    v: 1,
    requestId,
    approvalRequestId: approval.approval.approvalRequestId,
    intentId,
    agentId: params.agentId,
    file: resolve(params.file),
    fileSha256: checked.fileSha256,
    registryDir: resolve(params.registryDir),
    registryFingerprint,
    registryKeyPath: resolve(params.registryKeyPath),
    benchId: checked.bench.benchId,
    version,
    createdTs: Date.now()
  });
  savePendingPublish(params.workspace, pending);
  return {
    requestId,
    approvalRequestId: pending.approvalRequestId,
    intentId: pending.intentId,
    benchId: pending.benchId,
    version: pending.version
  };
}

export function benchPublishExecuteForApi(params: {
  workspace: string;
  approvalRequestId: string;
}): {
  benchId: string;
  version: string;
  targetPath: string;
  indexPath: string;
  sigPath: string;
  transparencyHash: string;
} {
  const pending = loadPendingPublish(params.workspace, params.approvalRequestId);
  const approval = verifyApprovalForExecution({
    workspace: params.workspace,
    approvalId: pending.approvalRequestId,
    expectedAgentId: pending.agentId,
    expectedIntentId: pending.intentId,
    expectedToolName: "bench.publish",
    expectedActionClass: "SECURITY"
  });
  if (!approval.ok) {
    throw new Error(`publish approval not executable: ${approval.error ?? approval.status ?? "unknown"}`);
  }
  const published = publishBenchToRegistry({
    dir: pending.registryDir,
    benchFile: pending.file,
    registryKeyPath: pending.registryKeyPath,
    version: pending.version
  });
  consumeApprovedExecution({
    workspace: params.workspace,
    approvalId: pending.approvalRequestId,
    expectedAgentId: pending.agentId,
    executionId: pending.requestId
  });
  const transparency = appendTransparencyEntry({
    workspace: params.workspace,
    type: "BENCH_PUBLISHED",
    agentId: pending.agentId,
    artifact: {
      kind: "amcbench",
      sha256: published.sha256,
      id: `${published.benchId}@${published.version}`
    }
  });
  removePendingPublish(params.workspace, pending.approvalRequestId);
  return {
    benchId: published.benchId,
    version: published.version,
    targetPath: published.targetPath,
    indexPath: published.indexPath,
    sigPath: published.sigPath,
    transparencyHash: transparency.hash
  };
}

export async function benchCreateForApiAsync(params: {
  workspace: string;
  scope: "workspace" | "node" | "agent";
  id?: string | null;
  outFile?: string | null;
  windowDays?: number;
  named?: boolean;
  labels?: {
    industry?: "software" | "fintech" | "health" | "manufacturing" | "other";
    agentType?: "code-agent" | "support-agent" | "ops-agent" | "research-agent" | "sales-agent" | "other";
    deployment?: "single" | "host" | "k8s" | "compose";
  };
}, options: OrgPairsOptions = {}) {
  params = structuredClone(params);
  const outFile = params.outFile
    ? resolve(params.workspace, params.outFile)
    : join(
        params.workspace,
        ".amc",
        "bench",
        "exports",
        params.scope,
        (params.id ?? "workspace").replace(/[^a-zA-Z0-9_-]/g, "_"),
        `${Date.now()}.amcbench`
      );
  return createBenchArtifactAsync({
    workspace: params.workspace,
    scope: params.scope,
    id: params.id,
    outFile,
    windowDays: params.windowDays,
    named: params.named,
    labels: params.labels
  }, options);
}

export async function benchCompareForApiAsync(params: Parameters<typeof benchCompareForApi>[0], options: OrgPairsOptions = {}) { return createBenchComparisonAsync({...params},options); }

export class BenchApprovedPublicationError extends Error {
  readonly code = "BENCH_APPROVED_PUBLICATION_INCOMPLETE";
  constructor(readonly completedRegistryPaths: readonly string[], readonly consumption: ReturnType<typeof consumeApprovedExecution> | null,
    readonly completedLogHashes: readonly string[], readonly pendingRemoved: boolean, cause: unknown) {
    super("approved benchmark publication did not complete; successful registry, approval and log effects are retained", { cause }); this.name = "BenchApprovedPublicationError";
  }
}
/** Actual maintained execute flow; held approval request/consume primitives remain synchronous dependencies. */
export async function benchPublishExecuteForApiAsync(params: Parameters<typeof benchPublishExecuteForApi>[0], options: OrgPairsOptions = {}) {
  const { workspace: rawWorkspace, approvalRequestId } = params, workspace = rawWorkspace.trim() ? resolve(rawWorkspace) : rawWorkspace;
  const original = captureBenchImportLogAuthority(workspace, options), path = pendingPath(workspace, approvalRequestId), pendingBefore = captureRegistryFiles([path]);
  const bytes = registryFileBytes(pendingBefore, path); if (bytes === null) throw new Error("pending benchmark publication is missing");
  const pending = pendingPublishSchema.parse(JSON.parse(bytes.toString("utf8")) as unknown);
  if (pending.approvalRequestId !== approvalRequestId) throw new Error("pending benchmark approval identity mismatch");
  const expectedIntentHash = sha256Hex(canonicalize({ requestId: pending.requestId, benchId: pending.benchId, version: pending.version,
    benchSha256: pending.fileSha256, registryFingerprint: pending.registryFingerprint, registryDir: resolve(pending.registryDir) }));
  const approvalInput = { workspace, approvalId: pending.approvalRequestId, expectedAgentId: pending.agentId, expectedIntentId: pending.intentId,
    expectedIntentHash, expectedToolName: "bench.publish", expectedActionClass: "SECURITY" as const };
  const selected = () => { original(); assertRegistryFiles(pendingBefore); };
  const executable = () => { selected(); const approval = verifyApprovalForExecution(approvalInput);
    if (!approval.ok) throw new Error("benchmark publish approval is not executable"); };
  executable();
  const prepared = prepareBenchRegistryPublish({ dir: pending.registryDir, benchFile: pending.file, registryKeyPath: pending.registryKeyPath, version: pending.version }, { beforePublish: executable });
  if (prepared.result.benchId !== pending.benchId || prepared.result.version !== pending.version || prepared.result.sha256 !== pending.fileSha256
    || sha256Hex(readFileSync(join(resolve(pending.registryDir), "registry.pub"))) !== pending.registryFingerprint) throw new Error("selected benchmark or registry differs from approved facts");
  let paths: readonly string[] = [], consumption: ReturnType<typeof consumeApprovedExecution> | null = null, pendingRemoved = false;
  const completedLogs: string[] = [];
  try {
    const published = prepared.publish(); paths = published.completedPaths;
    executable(); published.assertPublishedFiles();
    consumption = consumeApprovedExecution({ workspace, approvalId: pending.approvalRequestId, expectedAgentId: pending.agentId, executionId: pending.requestId });
    if (!consumption.consumed || consumption.replay) throw new Error("benchmark approval was not consumed by this execution");
    const afterConsumption = () => { selected(); published.assertPublishedFiles(); const now = verifyApprovalForExecution(approvalInput);
      if (now.ok || now.status !== "CONSUMED" || now.error !== "approval already consumed") throw new Error("benchmark consumed approval no longer verifies"); };
    afterConsumption();
    const logged = await appendTransparencyEntryAsync({ workspace, type: "BENCH_PUBLISHED", agentId: pending.agentId,
      artifact: { kind: "amcbench", sha256: prepared.result.sha256, id: `${prepared.result.benchId}@${prepared.result.version}` } }, { beforeCommit: afterConsumption });
    completedLogs.push(logged.hash);
    withControlFileLock({ root: pendingDir(workspace), name: "bench-pending-publish", operation: () => {
      afterConsumption(); assertRegistryFiles(pendingBefore); rmSync(path); pendingRemoved = true;
    } });
    original(); published.assertPublishedFiles();
    return { benchId: published.result.benchId, version: published.result.version, targetPath: published.result.targetPath,
      indexPath: published.result.indexPath, sigPath: published.result.sigPath, transparencyHash: logged.hash };
  } catch (cause) { if (cause instanceof BenchRegistryPublicationError) paths = cause.completedPaths;
    throw new BenchApprovedPublicationError(paths, consumption, Object.freeze([...completedLogs]), pendingRemoved, cause); }
}
