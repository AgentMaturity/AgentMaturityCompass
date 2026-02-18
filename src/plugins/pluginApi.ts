import { randomUUID } from "node:crypto";
import { copyFileSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { consumeApprovedExecution, createApprovalForIntent, verifyApprovalForExecution } from "../approvals/approvalEngine.js";
import { appendTransparencyEntry } from "../transparency/logChain.js";
import { ensureDir, pathExists, readUtf8, writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import {
  browseRegistry,
  cleanupResolvedPackage,
  resolveRegistryConfigForWorkspace,
  resolveRegistryPackage
} from "./pluginRegistryClient.js";
import { verifyPluginPackage } from "./pluginPackage.js";
import {
  defaultInstalledPluginsLock,
  defaultPluginRegistriesConfig,
  ensurePluginsStore,
  loadInstalledPluginsLock,
  loadPluginRegistriesConfig,
  pendingActionPath,
  pendingPackagePath,
  pluginInstalledPackagePath,
  pluginsInstalledDir,
  pluginsInstalledLockPath,
  pluginsRegistriesPath,
  saveInstalledPluginsLock,
  savePluginRegistriesConfig,
  verifyInstalledPluginsLock,
  verifyPluginOverrides,
  verifyPluginRegistriesConfig
} from "./pluginStore.js";
import { pluginRiskCategorySchema } from "./pluginTypes.js";
import { verifyInstalledPluginsIntegrity } from "./pluginVerifier.js";

const pendingPluginActionSchema = z.object({
  v: z.literal(1),
  action: z.enum(["install", "upgrade", "remove"]),
  requestId: z.string().min(1),
  approvalRequestId: z.string().min(1),
  intentId: z.string().min(1),
  agentId: z.string().min(1),
  registryId: z.string().min(1).nullable(),
  registryFingerprint: z.string().length(64).nullable(),
  pluginId: z.string().min(1),
  version: z.string().min(1).nullable(),
  packageSha256: z.string().length(64).nullable(),
  publisherFingerprint: z.string().length(64).nullable(),
  riskCategory: pluginRiskCategorySchema.nullable(),
  createdTs: z.number().int()
});

export type PendingPluginAction = z.infer<typeof pendingPluginActionSchema>;

export function initPluginWorkspace(params: {
  workspace: string;
  includeDefaultRegistry?: {
    id: string;
    type: "file" | "http";
    base: string;
    pinnedRegistryPubkeyFingerprint: string;
  };
}): {
  registriesPath: string;
  registriesSigPath: string;
  lockPath: string;
  lockSigPath: string;
} {
  ensurePluginsStore(params.workspace);
  const registries = defaultPluginRegistriesConfig();
  if (params.includeDefaultRegistry) {
    registries.pluginRegistries.registries = [
      {
        ...params.includeDefaultRegistry,
        allowPluginPublishers: [],
        allowRiskCategories: ["LOW", "MEDIUM", "HIGH", "CRITICAL"],
        autoUpdate: false
      }
    ];
  }
  const registriesSaved = savePluginRegistriesConfig(params.workspace, registries);
  const lockSaved = saveInstalledPluginsLock(params.workspace, defaultInstalledPluginsLock(params.workspace));
  return {
    registriesPath: registriesSaved.path,
    registriesSigPath: registriesSaved.sigPath,
    lockPath: lockSaved.path,
    lockSigPath: lockSaved.sigPath
  };
}

export function verifyPluginWorkspace(params: {
  workspace: string;
}): {
  ok: boolean;
  errors: string[];
  registries: ReturnType<typeof verifyPluginRegistriesConfig>;
  overrides: ReturnType<typeof verifyPluginOverrides>;
  lock: ReturnType<typeof verifyInstalledPluginsLock>;
  integrity: ReturnType<typeof verifyInstalledPluginsIntegrity>;
} {
  const registriesPath = pluginsRegistriesPath(params.workspace);
  const lockPath = pluginsInstalledLockPath(params.workspace);
  if (!pathExists(registriesPath) && !pathExists(lockPath)) {
    const valid = {
      valid: true,
      signatureExists: false,
      reason: null,
      path: registriesPath,
      sigPath: `${registriesPath}.sig`
    };
    const lockValid = {
      valid: true,
      signatureExists: false,
      reason: null,
      path: lockPath,
      sigPath: `${lockPath}.sig`
    };
    return {
      ok: true,
      errors: [],
      registries: valid,
      overrides: valid,
      lock: lockValid,
      integrity: {
        ok: true,
        errors: [],
        lockValid: true,
        installedCount: 0
      }
    };
  }
  const registries = verifyPluginRegistriesConfig(params.workspace);
  const overrides = verifyPluginOverrides(params.workspace);
  const lock = verifyInstalledPluginsLock(params.workspace);
  const integrity = verifyInstalledPluginsIntegrity(params.workspace);
  const errors: string[] = [];
  if (!registries.valid) {
    errors.push(`registries signature invalid: ${registries.reason ?? "unknown"}`);
  }
  if (!overrides.valid) {
    errors.push(`overrides signature invalid: ${overrides.reason ?? "unknown"}`);
  }
  if (!lock.valid) {
    errors.push(`installed.lock signature invalid: ${lock.reason ?? "unknown"}`);
  }
  if (!integrity.ok) {
    errors.push(...integrity.errors);
  }
  return {
    ok: errors.length === 0,
    errors,
    registries,
    overrides,
    lock,
    integrity
  };
}

export function listInstalledPlugins(workspace: string): {
  lockPath: string;
  lockSignatureValid: boolean;
  items: Array<{
    id: string;
    version: string;
    sha256: string;
    publisherFingerprint: string;
    registryFingerprint: string;
    installedTs: number;
    verification: { ok: boolean; errors: string[] };
  }>;
} {
  const lock = loadInstalledPluginsLock(workspace);
  const lockVerify = verifyInstalledPluginsLock(workspace);
  const items = lock.installed
    .slice()
    .sort((a, b) => a.id.localeCompare(b.id) || a.version.localeCompare(b.version))
    .map((item) => {
      const pkg = pluginInstalledPackagePath(workspace, item.id, item.version);
      if (!pathExists(pkg)) {
        return {
          ...item,
          verification: { ok: false, errors: ["installed package missing"] }
        };
      }
      const verification = verifyPluginPackage({ file: pkg });
      return {
        ...item,
        verification: {
          ok: verification.ok,
          errors: verification.errors
        }
      };
    });
  return {
    lockPath: pluginsInstalledLockPath(workspace),
    lockSignatureValid: lockVerify.valid,
    items
  };
}

export async function browsePluginRegistryForWorkspace(params: {
  workspace: string;
  registryId: string;
  query?: string;
}): Promise<{
  registryId: string;
  registryFingerprint: string;
  plugins: Awaited<ReturnType<typeof browseRegistry>>["plugins"];
}> {
  const registries = loadPluginRegistriesConfig(params.workspace);
  const entry = resolveRegistryConfigForWorkspace({
    workspace: params.workspace,
    registries,
    registryId: params.registryId
  });
  const browsed = await browseRegistry({
    registryBase: entry.base,
    query: params.query
  });
  return {
    registryId: browsed.registryId,
    registryFingerprint: browsed.registryFingerprint,
    plugins: browsed.plugins
  };
}

function latestInstalledVersionFor(lock: ReturnType<typeof loadInstalledPluginsLock>, pluginId: string): string | null {
  const versions = lock.installed.filter((row) => row.id === pluginId).map((row) => row.version);
  if (versions.length === 0) {
    return null;
  }
  return versions.sort((a, b) => a.localeCompare(b)).at(-1) ?? null;
}

function loadPendingAction(workspace: string, requestId: string): PendingPluginAction {
  const file = pendingActionPath(workspace, requestId);
  if (!pathExists(file)) {
    throw new Error(`pending plugin action not found: ${requestId}`);
  }
  return pendingPluginActionSchema.parse(JSON.parse(readUtf8(file)) as unknown);
}

function savePendingAction(workspace: string, action: PendingPluginAction): string {
  ensurePluginsStore(workspace);
  const file = pendingActionPath(workspace, action.approvalRequestId);
  writeFileAtomic(file, JSON.stringify(pendingPluginActionSchema.parse(action), null, 2), 0o600);
  return file;
}

function removePending(workspace: string, requestIdOrApprovalId: string): void {
  for (const file of [pendingActionPath(workspace, requestIdOrApprovalId), pendingPackagePath(workspace, requestIdOrApprovalId)]) {
    if (pathExists(file)) {
      rmSync(file, { force: true });
    }
  }
}

function lockPolicySnapshot(workspace: string): ReturnType<typeof defaultInstalledPluginsLock>["policySnapshot"] {
  const hashOf = (relativePath: string, fallback: string): string => {
    const full = join(workspace, relativePath);
    if (!pathExists(full)) {
      return sha256Hex(fallback);
    }
    return sha256Hex(readFileSync(full));
  };
  return {
    actionPolicySha256: hashOf(".amc/action-policy.yaml", "missing-action-policy"),
    toolsSha256: hashOf(".amc/tools.yaml", "missing-tools"),
    budgetsSha256: hashOf(".amc/budgets.yaml", "missing-budgets"),
    approvalPolicySha256: hashOf(".amc/approval-policy.yaml", "missing-approval-policy"),
    opsPolicySha256: hashOf(".amc/ops-policy.yaml", "missing-ops-policy"),
    registriesSha256: hashOf(".amc/plugins/registries.yaml", "missing-plugin-registries")
  };
}

function writeInstalledPackage(params: {
  workspace: string;
  pluginId: string;
  version: string;
  packageFile: string;
}): string {
  const installPath = pluginInstalledPackagePath(params.workspace, params.pluginId, params.version);
  ensureDir(join(pluginsInstalledDir(params.workspace), params.pluginId, params.version));
  copyFileSync(params.packageFile, installPath);
  return installPath;
}

export async function requestPluginInstall(params: {
  workspace: string;
  agentId: string;
  registryId: string;
  pluginRef: string;
  action?: "install" | "upgrade";
}): Promise<{
  requestId: string;
  approvalRequestId: string;
  intentId: string;
  pluginId: string;
  version: string;
  riskCategory: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
}> {
  const action = params.action ?? "install";
  const verify = verifyPluginWorkspace({ workspace: params.workspace });
  if (!verify.registries.valid) {
    throw new Error(`plugin registries signature invalid: ${verify.registries.reason ?? "unknown"}`);
  }
  const registries = loadPluginRegistriesConfig(params.workspace);
  const registry = resolveRegistryConfigForWorkspace({
    workspace: params.workspace,
    registries,
    registryId: params.registryId
  });
  const resolved = await resolveRegistryPackage({
    registryBase: registry.base,
    pluginRef: params.pluginRef,
    pinnedRegistryPubkeyFingerprint: registry.pinnedRegistryPubkeyFingerprint,
    allowPluginPublishers: registry.allowPluginPublishers,
    allowRiskCategories: registry.allowRiskCategories
  });
  const requestId = `plreq_${randomUUID().replace(/-/g, "")}`;
  try {
    const intentId = `plugin-${action}-${requestId}`;
    const approval = createApprovalForIntent({
      workspace: params.workspace,
      agentId: params.agentId,
      intentId,
      toolName: `plugin.${action}`,
      actionClass: "SECURITY",
      workOrderId: undefined,
      requestedMode: "EXECUTE",
      effectiveMode: "EXECUTE",
      riskTier: resolved.riskCategory === "CRITICAL" ? "critical" : "high",
      intentPayload: {
        requestId,
        action,
        registryId: params.registryId,
        registryFingerprint: resolved.registryFingerprint,
        pluginId: resolved.pluginId,
        version: resolved.version,
        sha256: resolved.sha256,
        publisherFingerprint: resolved.publisherFingerprint,
        riskCategory: resolved.riskCategory
      },
      leaseConstraints: {
        routeAllowlist: [],
        modelAllowlist: [],
        scopes: []
      }
    });
    const pending = pendingPluginActionSchema.parse({
      v: 1,
      action,
      requestId,
      approvalRequestId: approval.approval.approvalRequestId,
      intentId,
      agentId: params.agentId,
      registryId: params.registryId,
      registryFingerprint: resolved.registryFingerprint,
      pluginId: resolved.pluginId,
      version: resolved.version,
      packageSha256: resolved.sha256,
      publisherFingerprint: resolved.publisherFingerprint,
      riskCategory: resolved.riskCategory,
      createdTs: Date.now()
    });
    savePendingAction(params.workspace, pending);
    copyFileSync(resolved.packagePath, pendingPackagePath(params.workspace, approval.approval.approvalRequestId));
    return {
      requestId,
      approvalRequestId: approval.approval.approvalRequestId,
      intentId,
      pluginId: resolved.pluginId,
      version: resolved.version,
      riskCategory: resolved.riskCategory
    };
  } finally {
    cleanupResolvedPackage(resolved.packagePath);
  }
}

export function requestPluginRemove(params: {
  workspace: string;
  agentId: string;
  pluginId: string;
}): {
  requestId: string;
  approvalRequestId: string;
  intentId: string;
  pluginId: string;
  version: string;
} {
  const lock = loadInstalledPluginsLock(params.workspace);
  const version = latestInstalledVersionFor(lock, params.pluginId);
  if (!version) {
    throw new Error(`plugin is not installed: ${params.pluginId}`);
  }
  const requestId = `plreq_${randomUUID().replace(/-/g, "")}`;
  const intentId = `plugin-remove-${requestId}`;
  const approval = createApprovalForIntent({
    workspace: params.workspace,
    agentId: params.agentId,
    intentId,
    toolName: "plugin.remove",
    actionClass: "SECURITY",
    workOrderId: undefined,
    requestedMode: "EXECUTE",
    effectiveMode: "EXECUTE",
    riskTier: "high",
    intentPayload: {
      requestId,
      action: "remove",
      pluginId: params.pluginId,
      version
    },
    leaseConstraints: {
      routeAllowlist: [],
      modelAllowlist: [],
      scopes: []
    }
  });
  const pending = pendingPluginActionSchema.parse({
    v: 1,
    action: "remove",
    requestId,
    approvalRequestId: approval.approval.approvalRequestId,
    intentId,
    agentId: params.agentId,
    registryId: null,
    registryFingerprint: null,
    pluginId: params.pluginId,
    version,
    packageSha256: null,
    publisherFingerprint: null,
    riskCategory: "HIGH",
    createdTs: Date.now()
  });
  savePendingAction(params.workspace, pending);
  return {
    requestId,
    approvalRequestId: approval.approval.approvalRequestId,
    intentId,
    pluginId: params.pluginId,
    version
  };
}

export function executePluginRequest(params: {
  workspace: string;
  approvalRequestId: string;
}): {
  action: "install" | "upgrade" | "remove";
  pluginId: string;
  version: string | null;
  installedLockPath: string;
  installedLockSigPath: string;
  transparencyHash: string;
} {
  const pending = loadPendingAction(params.workspace, params.approvalRequestId);
  const approvalCheck = verifyApprovalForExecution({
    workspace: params.workspace,
    approvalId: pending.approvalRequestId,
    expectedAgentId: pending.agentId,
    expectedIntentId: pending.intentId,
    expectedToolName: `plugin.${pending.action}`,
    expectedActionClass: "SECURITY"
  });
  if (!approvalCheck.ok) {
    throw new Error(`plugin action approval not executable: ${approvalCheck.error ?? approvalCheck.status ?? "unknown"}`);
  }

  const lock = loadInstalledPluginsLock(params.workspace);
  let artifactSha = sha256Hex(Buffer.from(JSON.stringify(pending), "utf8"));
  if (pending.action === "install" || pending.action === "upgrade") {
    const pendingPkg = pendingPackagePath(params.workspace, pending.approvalRequestId);
    if (!pathExists(pendingPkg)) {
      throw new Error("pending plugin package missing");
    }
    const verified = verifyPluginPackage({ file: pendingPkg });
    if (!verified.ok || !verified.manifest) {
      throw new Error(`pending plugin package verification failed: ${verified.errors.join("; ")}`);
    }
    if (verified.manifest.plugin.id !== pending.pluginId || verified.manifest.plugin.version !== pending.version) {
      throw new Error("pending plugin package does not match approved request");
    }
    if (pending.publisherFingerprint && verified.publisherFingerprint && pending.publisherFingerprint !== verified.publisherFingerprint) {
      throw new Error("pending plugin package publisher fingerprint mismatch");
    }
    if (pending.riskCategory && pending.riskCategory !== verified.manifest.plugin.risk.category) {
      throw new Error("pending plugin package risk category mismatch");
    }
    if (pending.packageSha256 && pending.packageSha256 !== sha256Hex(readFileSync(pendingPkg))) {
      throw new Error("pending plugin package sha mismatch");
    }
    const installPath = writeInstalledPackage({
      workspace: params.workspace,
      pluginId: pending.pluginId,
      version: pending.version!,
      packageFile: pendingPkg
    });
    artifactSha = sha256Hex(readFileSync(installPath));
    const retained = lock.installed.filter((row) => row.id !== pending.pluginId);
    retained.push({
      id: pending.pluginId,
      version: pending.version!,
      sha256: artifactSha,
      registryFingerprint: pending.registryFingerprint ?? "0".repeat(64),
      publisherFingerprint: verified.publisherFingerprint ?? pending.publisherFingerprint ?? "0".repeat(64),
      installedTs: Date.now()
    });
    lock.installed = retained.sort((a, b) => a.id.localeCompare(b.id) || a.version.localeCompare(b.version));
  } else {
    lock.installed = lock.installed.filter((row) => row.id !== pending.pluginId);
    const pluginDir = join(pluginsInstalledDir(params.workspace), pending.pluginId);
    if (pathExists(pluginDir)) {
      rmSync(pluginDir, { recursive: true, force: true });
    }
  }
  lock.updatedTs = Date.now();
  lock.policySnapshot = lockPolicySnapshot(params.workspace);
  const saved = saveInstalledPluginsLock(params.workspace, lock);
  const consume = consumeApprovedExecution({
    workspace: params.workspace,
    approvalId: pending.approvalRequestId,
    expectedAgentId: pending.agentId,
    executionId: pending.requestId
  });
  if (consume.replay) {
    throw new Error("approval already consumed");
  }
  const transparency = appendTransparencyEntry({
    workspace: params.workspace,
    type:
      pending.action === "install"
        ? "PLUGIN_INSTALLED"
        : pending.action === "upgrade"
          ? "PLUGIN_UPGRADED"
          : "PLUGIN_REMOVED",
    agentId: pending.agentId,
    artifact: {
      kind: "plugin",
      sha256: artifactSha,
      id: `${pending.pluginId}@${pending.version ?? "removed"}`
    }
  });
  removePending(params.workspace, pending.approvalRequestId);
  return {
    action: pending.action,
    pluginId: pending.pluginId,
    version: pending.version,
    installedLockPath: saved.path,
    installedLockSigPath: saved.sigPath,
    transparencyHash: transparency.hash
  };
}

export function pendingPluginRequest(params: {
  workspace: string;
  approvalRequestId: string;
}): PendingPluginAction | null {
  try {
    return loadPendingAction(params.workspace, params.approvalRequestId);
  } catch {
    return null;
  }
}
