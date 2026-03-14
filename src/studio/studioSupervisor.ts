import { spawn } from "node:child_process";
import { existsSync, openSync, readdirSync, statSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { verifyGatewayConfigSignature } from "../gateway/config.js";
import { initActionPolicy, verifyActionPolicySignature } from "../governor/actionPolicyEngine.js";
import { initToolsConfig, verifyToolsConfigSignature } from "../toolhub/toolhubValidators.js";
import { initApprovalPolicy, verifyApprovalPolicySignature } from "../approvals/approvalPolicyEngine.js";
import { verifyAgentConfigSignature, verifyFleetConfigSignature } from "../fleet/registry.js";
import { getWorkspacePaths, initWorkspace } from "../workspace.js";
import { resolveAgentId } from "../fleet/paths.js";
import { ensureSigningKeys } from "../crypto/keys.js";
import { vaultExists, unlockVault, vaultStatus } from "../vault/vault.js";
import { buildDashboard } from "../dashboard/build.js";
import { serveDashboard } from "../dashboard/serve.js";
import { startGateway } from "../gateway/server.js";
import { ensureDir, writeFileAtomic } from "../utils/fs.js";
import { openLedger } from "../ledger/ledger.js";
import { sha256Hex } from "../utils/hash.js";
import { loadLanMode, verifyLanModeSignature } from "../pairing/lanMode.js";
import { verifyUsersConfigSignature } from "../auth/authApi.js";
import { initOpsPolicy, opsPolicyPath, verifyOpsPolicySignature } from "../ops/policy.js";
import { initForecastPolicy } from "../forecast/forecastEngine.js";
import { forecastPolicyPath } from "../forecast/forecastStore.js";
import { initPluginWorkspace, verifyPluginWorkspace } from "../plugins/pluginApi.js";
import { checkNotaryTrust, verifyTrustConfigSignature } from "../trust/trustConfig.js";
import { initMechanicWorkspace } from "../mechanic/mechanicApi.js";
import { mechanicTargetsPath, verifyMechanicTargetsSignature } from "../mechanic/targetsStore.js";
import { verifyMechanicProfilesSignature } from "../mechanic/profiles.js";
import { verifyMechanicTuningSignature } from "../mechanic/tuningStore.js";
import { initPromptPolicy, promptPolicyPath, verifyPromptPolicySignature } from "../prompt/promptPolicyStore.js";
import {
  clearStudioState,
  ensureAdminToken,
  processRunning,
  readStudioState,
  studioDir,
  studioLogsDir,
  writeStudioState,
  type StudioState
} from "./studioState.js";
import { startStudioApiServer } from "./studioServer.js";
import { startMetricsServer } from "../ops/metrics/metricsServer.js";
import { ensureMetricsBaseline, setBlobMetrics, setDbSizeMetric, setRetentionSegmentsMetric } from "../ops/metrics/metricsMiddleware.js";
import { maintenanceStats } from "../ops/maintenance/stats.js";
import { workspaceIdFromDirectory } from "../workspaces/workspaceId.js";
import { startWorkspaceRouter } from "../workspaces/workspaceRouter.js";
import { createWorkspaceRecord, getWorkspaceRecord, initHostDb } from "../workspaces/hostDb.js";
import { hostWorkspaceDir } from "../workspaces/workspacePaths.js";

export interface StudioRuntime {
  stop: () => Promise<void>;
  state: StudioState;
}

function enforceStudioLogRetention(workspace: string, retentionDays: number): void {
  const days = Math.max(1, Math.trunc(retentionDays));
  const dir = studioLogsDir(workspace);
  ensureDir(dir);
  const cutoffTs = Date.now() - days * 24 * 60 * 60 * 1000;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isFile()) {
      continue;
    }
    const filePath = join(dir, entry.name);
    try {
      const st = statSync(filePath);
      if (st.mtimeMs < cutoffTs) {
        unlinkSync(filePath);
      }
    } catch {
      // best-effort retention cleanup; never block studio start
    }
  }
}

function ensureWorkspace(workspace: string): void {
  if (!existsSync(join(workspace, ".amc"))) {
    initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
  }
  ensureSigningKeys(workspace);
  if (!existsSync(opsPolicyPath(workspace))) {
    initOpsPolicy(workspace);
  }
  if (!existsSync(forecastPolicyPath(workspace))) {
    initForecastPolicy(workspace);
  }
  if (!existsSync(mechanicTargetsPath(workspace))) {
    initMechanicWorkspace({
      workspace,
      scopeType: "WORKSPACE",
      scopeId: "workspace"
    });
  }
  if (!existsSync(promptPolicyPath(workspace))) {
    initPromptPolicy(workspace);
  }
}

function writeConfigSignatureAudit(workspace: string, agentId: string): void {
  const gatewaySig = verifyGatewayConfigSignature(workspace);
  const actionPolicySig = verifyActionPolicySignature(workspace);
  const toolsSig = verifyToolsConfigSignature(workspace);
  const approvalPolicySig = verifyApprovalPolicySignature(workspace);
  const opsPolicySig = verifyOpsPolicySignature(workspace);
  const fleetSig = verifyFleetConfigSignature(workspace);
  const agentSig = verifyAgentConfigSignature(workspace, agentId);
  const usersSig = verifyUsersConfigSignature(workspace);
  const lanSig = verifyLanModeSignature(workspace);
  const plugins = verifyPluginWorkspace({ workspace });
  const mechanicTargetsSig = verifyMechanicTargetsSignature(workspace);
  const mechanicProfilesSig = verifyMechanicProfilesSignature(workspace);
  const mechanicTuningSig = verifyMechanicTuningSignature(workspace);
  const promptPolicySig = verifyPromptPolicySignature(workspace);
  const trustSig = verifyTrustConfigSignature(workspace);
  const invalid =
    !gatewaySig.valid ||
    !actionPolicySig.valid ||
    !toolsSig.valid ||
    !approvalPolicySig.valid ||
    !opsPolicySig.valid ||
    !fleetSig.valid ||
    !agentSig.valid ||
    !trustSig.valid ||
    !promptPolicySig.valid ||
    !mechanicTargetsSig.valid ||
    !mechanicProfilesSig.valid ||
    !mechanicTuningSig.valid ||
    (usersSig.signatureExists && !usersSig.valid) ||
    !lanSig.valid ||
    !plugins.ok;
  if (!invalid) {
    return;
  }
  const ledger = openLedger(workspace);
  const sessionId = `studio-config-${Date.now()}`;
  const payload = JSON.stringify({
        auditType: "CONFIG_SIGNATURE_INVALID",
        severity: "HIGH",
        agentId,
        gatewayValid: gatewaySig.valid,
        actionPolicyValid: actionPolicySig.valid,
        toolsValid: toolsSig.valid,
        approvalPolicyValid: approvalPolicySig.valid,
        opsPolicyValid: opsPolicySig.valid,
        fleetValid: fleetSig.valid,
        agentValid: agentSig.valid,
        trustValid: trustSig.valid,
        promptPolicyValid: promptPolicySig.valid,
        mechanicTargetsValid: mechanicTargetsSig.valid,
        mechanicProfilesValid: mechanicProfilesSig.valid,
        mechanicTuningValid: mechanicTuningSig.valid,
        usersValid: usersSig.valid,
        lanValid: lanSig.valid,
        pluginsValid: plugins.ok,
        pluginErrors: plugins.errors
  });
  try {
    ledger.startSession({
      sessionId,
      runtime: "unknown",
      binaryPath: "amc-studio",
      binarySha256: sha256Hex("amc-studio")
    });
    ledger.appendEvidenceWithReceipt({
      sessionId,
      runtime: "unknown",
      eventType: "audit",
      payload,
      inline: true,
      payloadExt: "json",
      meta: {
        auditType: "CONFIG_SIGNATURE_INVALID",
        severity: "HIGH",
        source: "studio",
        trustTier: "OBSERVED",
        agentId
      },
      receipt: {
        kind: "guard_check",
        agentId,
        providerId: "unknown",
        model: null,
        bodySha256: sha256Hex(Buffer.from(payload, "utf8"))
      }
    });
    ledger.sealSession(sessionId);
  } finally {
    ledger.close();
  }
}

function writeStudioLifecycleAudit(workspace: string, agentId: string, auditType: "STUDIO_RUNTIME_STARTED" | "STUDIO_RUNTIME_STOPPED"): void {
  const ledger = openLedger(workspace);
  const sessionId = `studio-lifecycle-${Date.now()}-${auditType.toLowerCase()}`;
  const payload = JSON.stringify({
    auditType,
    severity: "LOW",
    agentId,
    ts: Date.now()
  });
  try {
    ledger.startSession({
      sessionId,
      runtime: "unknown",
      binaryPath: "amc-studio",
      binarySha256: sha256Hex("amc-studio")
    });
    ledger.appendEvidenceWithReceipt({
      sessionId,
      runtime: "unknown",
      eventType: "audit",
      payload,
      inline: true,
      payloadExt: "json",
      meta: {
        auditType,
        severity: "LOW",
        source: "studio",
        trustTier: "OBSERVED",
        agentId
      },
      receipt: {
        kind: "guard_check",
        agentId,
        providerId: "unknown",
        model: null,
        bodySha256: sha256Hex(Buffer.from(payload, "utf8"))
      }
    });
    ledger.sealSession(sessionId);
  } finally {
    ledger.close();
  }
}

export async function runStudioForeground(params: {
  workspace: string;
  hostDir?: string;
  defaultWorkspaceId?: string;
  apiPort?: number;
  dashboardPort?: number;
  apiHost?: string;
  gatewayPort?: number;
  gatewayHost?: string;
  proxyPort?: number;
  metricsHost?: string;
  metricsPort?: number;
  allowPublicBind?: boolean;
  allowedCidrs?: string[];
  trustedProxyHops?: number;
  maxRequestBytes?: number;
  corsAllowedOrigins?: string[];
  dataRetentionDays?: number;
  queryLeaseCarrierEnabled?: boolean;
}): Promise<StudioRuntime> {
  if (params.hostDir) {
    const hostDir = params.hostDir;
    const defaultWorkspaceId = params.defaultWorkspaceId ?? "default";
    initHostDb(hostDir);
    const existing = getWorkspaceRecord(hostDir, defaultWorkspaceId);
    if (!existing) {
      createWorkspaceRecord({
        hostDir,
        workspaceId: defaultWorkspaceId,
        name: "Default Workspace"
      });
      initWorkspace({
        workspacePath: hostWorkspaceDir(hostDir, defaultWorkspaceId),
        trustBoundaryMode: "isolated"
      });
    }
    const apiHost = params.apiHost ?? "127.0.0.1";
    const apiPort = params.apiPort ?? 3212;
    const router = await startWorkspaceRouter({
      hostDir,
      host: apiHost,
      port: apiPort,
      defaultWorkspaceId,
      allowedCidrs: params.allowedCidrs,
      trustedProxyHops: params.trustedProxyHops,
      maxRequestBytes: params.maxRequestBytes,
      corsAllowedOrigins: params.corsAllowedOrigins
    });
    const state: StudioState = {
      pid: process.pid,
      startedTs: Date.now(),
      apiPort: router.port,
      gatewayPort: 0,
      proxyPort: 0,
      dashboardPort: 0,
      metricsPort: params.metricsPort ?? 9464,
      metricsHost: params.metricsHost ?? "127.0.0.1",
      host: router.host,
      lanEnabled: params.allowPublicBind === true,
      pairingRequired: false,
      currentAgent: "default",
      vaultUnlocked: true,
      untrustedConfig: false,
      logFile: join(hostDir, "logs", "host.log")
    };
    return {
      state,
      stop: async () => {
        await router.close();
      }
    };
  }

  const workspace = params.workspace;
  ensureWorkspace(workspace);
  enforceStudioLogRetention(workspace, params.dataRetentionDays ?? 30);
  const agentId = resolveAgentId(workspace);

  if (!vaultExists(workspace)) {
    throw new Error("Vault not initialized. Run `amc vault init` first.");
  }
  const status = vaultStatus(workspace);
  if (!status.unlocked) {
    const passphrase = process.env.AMC_VAULT_PASSPHRASE;
    if (!passphrase) {
      throw new Error("🔐 Vault locked. Run `amc vault unlock` first, or `amc setup` for first-time setup. For CI, set AMC_VAULT_PASSPHRASE env var.");
    }
    unlockVault(workspace, passphrase);
  }

  if (!existsSync(join(workspace, ".amc", "plugins", "registries.yaml")) || !existsSync(join(workspace, ".amc", "plugins", "installed.lock.json"))) {
    initPluginWorkspace({ workspace });
  }

  const token = ensureAdminToken(workspace);
  if (!existsSync(join(workspace, ".amc", "action-policy.yaml"))) {
    initActionPolicy(workspace);
  }
  if (!existsSync(join(workspace, ".amc", "tools.yaml"))) {
    initToolsConfig(workspace);
  }
  if (!existsSync(join(workspace, ".amc", "approval-policy.yaml"))) {
    initApprovalPolicy(workspace);
  }
  const lan = loadLanMode(workspace);
  const lanSig = verifyLanModeSignature(workspace);
  const gateway = await startGateway({
    workspace,
    workspaceId: workspaceIdFromDirectory(workspace),
    listenHost: params.gatewayHost,
    listenPort: params.gatewayPort,
    proxyPort: params.proxyPort,
    allowedCidrs: params.allowedCidrs,
    allowQueryCarrierOverride: params.queryLeaseCarrierEnabled
  });

  ensureMetricsBaseline();
  try {
    const stats = maintenanceStats(workspace);
    setRetentionSegmentsMetric(stats.archive.segmentCount);
    setBlobMetrics(stats.blobs.count, stats.blobs.bytes);
    setDbSizeMetric(stats.dbSizeBytes);
  } catch {
    // Metrics baselining must remain best-effort.
  }
  const metricsHost = params.metricsHost ?? "127.0.0.1";
  const requestedMetricsPort = params.metricsPort ?? 9464;
  const metricsPublicBind = metricsHost === "0.0.0.0" || metricsHost === "::";
  if (metricsPublicBind && !(lan.enabled && lanSig.valid)) {
    throw new Error("Refusing to bind metrics publicly without signed LAN mode.");
  }
  let metrics: Awaited<ReturnType<typeof startMetricsServer>>;
  try {
    metrics = await startMetricsServer({
      workspace,
      host: metricsHost,
      port: requestedMetricsPort,
      allowRemote: metricsPublicBind,
      allowedCidrs: params.allowedCidrs
    });
  } catch (error) {
    const message = String(error);
    if (message.includes("EADDRINUSE")) {
      metrics = await startMetricsServer({
        workspace,
        host: metricsHost,
        port: 0,
        allowRemote: metricsPublicBind,
        allowedCidrs: params.allowedCidrs
      });
    } else {
      throw error;
    }
  }

  const dashboardOut = `.amc/agents/${agentId}/dashboard`;
  try {
    buildDashboard({
      workspace,
      agentId,
      outDir: dashboardOut
    });
  } catch {
    // Fresh workspaces may not have runs yet; serve a bootstrap page and build later on demand.
    const root = join(workspace, dashboardOut);
    ensureDir(root);
    writeFileAtomic(
      join(root, "index.html"),
      "<!doctype html><html><body><h1>AMC Studio</h1><p>No diagnostic runs yet. Run `amc run` then rebuild dashboard.</p></body></html>",
      0o644
    );
  }
  const requestedDashboardPort = params.dashboardPort ?? 4173;
  let dashboard: Awaited<ReturnType<typeof serveDashboard>>;
  try {
    dashboard = await serveDashboard({
      workspace,
      agentId,
      port: requestedDashboardPort,
      outDir: dashboardOut
    });
  } catch (error) {
    const message = String(error);
    if (!message.includes("EADDRINUSE")) {
      throw error;
    }
    dashboard = await serveDashboard({
      workspace,
      agentId,
      port: 0,
      outDir: dashboardOut
    });
  }

  const defaultApiHost = lan.enabled && lanSig.valid ? lan.bind : "127.0.0.1";
  const defaultApiPort = params.apiPort ?? (lan.enabled && lanSig.valid ? lan.port : 3212);
  const apiHost = params.apiHost ?? defaultApiHost;
  const apiPort = params.apiPort ?? defaultApiPort;
  const publicBind = apiHost === "0.0.0.0" || apiHost === "::";
  if (publicBind && !params.allowPublicBind && !(lan.enabled && lanSig.valid)) {
    throw new Error("Refusing to bind Studio API publicly. Enable LAN mode or set explicit public bind allowance.");
  }

  const api = await startStudioApiServer({
    workspace,
    host: apiHost,
    port: apiPort,
    token,
    allowedCidrs: params.allowedCidrs,
    trustedProxyHops: params.trustedProxyHops,
    maxRequestBytes: params.maxRequestBytes,
    corsAllowedOrigins: params.corsAllowedOrigins
  });

  const gatewaySig = verifyGatewayConfigSignature(workspace);
  const actionPolicySig = verifyActionPolicySignature(workspace);
  const toolsSig = verifyToolsConfigSignature(workspace);
  const approvalPolicySig = verifyApprovalPolicySignature(workspace);
  const opsPolicySig = verifyOpsPolicySignature(workspace);
  const fleetSig = verifyFleetConfigSignature(workspace);
  const agentSig = verifyAgentConfigSignature(workspace, agentId);
  const usersSig = verifyUsersConfigSignature(workspace);
  const trustSig = verifyTrustConfigSignature(workspace);
  const plugins = verifyPluginWorkspace({ workspace });
  const trustCheck = await checkNotaryTrust(workspace).catch(() => null);
  const untrustedConfig =
    !gatewaySig.valid ||
    !actionPolicySig.valid ||
    !toolsSig.valid ||
    !approvalPolicySig.valid ||
    !opsPolicySig.valid ||
    !fleetSig.valid ||
    !agentSig.valid ||
    !trustSig.valid ||
    (trustCheck ? !trustCheck.ok : false) ||
    (usersSig.signatureExists && !usersSig.valid) ||
    !lanSig.valid ||
    !plugins.ok;
  if (untrustedConfig) {
    writeConfigSignatureAudit(workspace, agentId);
  }

  const logFile = join(studioLogsDir(workspace), "studio.log");
  ensureDir(studioLogsDir(workspace));

  const state: StudioState = {
    pid: process.pid,
    startedTs: Date.now(),
    apiPort,
    gatewayPort: gateway.port,
    proxyPort: gateway.proxyPort ?? 0,
    dashboardPort: dashboard.port,
    metricsPort: metrics.port,
    metricsHost: metrics.host,
    host: apiHost,
    lanEnabled: lan.enabled && lanSig.valid,
    pairingRequired: lan.enabled && lanSig.valid && lan.requirePairing,
    currentAgent: agentId,
    vaultUnlocked: vaultStatus(workspace).unlocked,
    untrustedConfig,
    logFile
  };
  writeStudioState(workspace, state);
  try {
    writeStudioLifecycleAudit(workspace, agentId, "STUDIO_RUNTIME_STARTED");
  } catch {
    // Lifecycle audit is best-effort and must not block startup.
  }

  return {
    state,
    stop: async () => {
      await api.close();
      await dashboard.close();
      await gateway.close();
      await metrics.close();
      try {
        writeStudioLifecycleAudit(workspace, agentId, "STUDIO_RUNTIME_STOPPED");
      } catch {
        // Lifecycle audit is best-effort and must not block shutdown.
      }
      clearStudioState(workspace);
    }
  };
}

export async function startStudioDaemon(workspace: string): Promise<StudioState> {
  ensureWorkspace(workspace);
  enforceStudioLogRetention(workspace, 30);
  ensureDir(studioDir(workspace));
  ensureDir(studioLogsDir(workspace));
  const existing = readStudioState(workspace);
  if (existing && processRunning(existing.pid)) {
    return existing;
  }

  const logFile = join(studioLogsDir(workspace), "studio.log");
  const outFd = openSync(logFile, "a");
  const errFd = openSync(logFile, "a");

  const child = spawn(process.execPath, [process.argv[1] ?? "", "_studio-daemon", "--workspace", workspace], {
    detached: true,
    stdio: ["ignore", outFd, errFd],
    env: process.env
  });
  child.unref();

  // wait for state file
  const started = Date.now();
  while (Date.now() - started < 6000) {
    const state = readStudioState(workspace);
    if (state && state.pid > 0 && processRunning(state.pid)) {
      return state;
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
  }

  throw new Error("Studio daemon failed to start in time. Check `amc logs`.");
}

export function stopStudioDaemon(workspace: string): { stopped: boolean; message: string } {
  const state = readStudioState(workspace);
  if (!state || !state.pid) {
    return { stopped: false, message: "Studio is not running." };
  }
  if (!processRunning(state.pid)) {
    return { stopped: false, message: "Studio state exists but process is not running." };
  }
  try {
    process.kill(state.pid, "SIGTERM");
    clearStudioState(workspace);
    return { stopped: true, message: `Sent SIGTERM to studio pid ${state.pid}` };
  } catch (error) {
    return { stopped: false, message: String(error) };
  }
}

export function studioStatus(workspace: string): {
  running: boolean;
  state: StudioState | null;
  vaultUnlocked: boolean;
} {
  const state = readStudioState(workspace);
  const running = !!state && processRunning(state.pid);
  return {
    running,
    state,
    vaultUnlocked: vaultStatus(workspace).unlocked
  };
}
