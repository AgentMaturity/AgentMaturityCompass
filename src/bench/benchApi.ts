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
import { browseBenchRegistry, importBenchFromRegistry } from "./benchRegistryClient.js";
import { publishBenchToRegistry } from "./benchRegistryServer.js";
import {
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
  return join(pendingDir(workspace), `${approvalRequestId}.json`);
}

function savePendingPublish(workspace: string, pending: z.infer<typeof pendingPublishSchema>): string {
  ensureDir(pendingDir(workspace));
  const file = pendingPath(workspace, pending.approvalRequestId);
  writeFileAtomic(file, JSON.stringify(pendingPublishSchema.parse(pending), null, 2), 0o600);
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
  if (pathExists(file)) {
    rmSync(file, { force: true });
  }
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
}) {
  const { workspace: explicitWorkspace, registryId, query } = params;
  const workspace = explicitWorkspace.trim() ? resolve(explicitWorkspace) : explicitWorkspace;
  const config = loadBenchRegistriesConfig(workspace);
  const entry = config.benchRegistries.registries.find((row) => row.id === registryId);
  if (!entry) {
    throw new Error(`bench registry not configured: ${registryId}`);
  }
  return withWorkspaceScope(workspace, () => browseBenchRegistry({
    base: entry.type === "file" ? resolve(workspace, entry.base) : entry.base,
    query
  }));
}

export async function benchImportForApi(params: {
  workspace: string;
  registryId: string;
  benchRef: string;
}) {
  const { workspace: explicitWorkspace, registryId, benchRef } = params;
  const workspace = explicitWorkspace.trim() ? resolve(explicitWorkspace) : explicitWorkspace;
  const imported = await importBenchFromRegistry({ workspace, registryId, benchRef });
  appendTransparencyEntry({
    workspace,
    type: "BENCH_IMPORTED",
    agentId: "workspace",
    artifact: {
      kind: "amcbench",
      sha256: sha256Hex(readFileSync(imported.filePath)),
      id: `${imported.benchId}@${imported.version}`
    }
  });
  return imported;
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
