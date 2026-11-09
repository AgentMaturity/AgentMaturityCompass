import { randomBytes } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, openSync, readFileSync, readdirSync, statSync, unlinkSync } from "node:fs";
import { join, resolve } from "node:path";
import { loadGatewayConfig, verifyGatewayConfigSignature } from "../gateway/config.js";
import { initActionPolicyAsync, verifyActionPolicySignature } from "../governor/actionPolicyEngine.js";
import { initToolsConfigAsync, verifyToolsConfigSignature } from "../toolhub/toolhubValidators.js";
import { initApprovalPolicy, verifyApprovalPolicySignature } from "../approvals/approvalPolicyEngine.js";
import { verifyAgentConfigSignature, verifyFleetConfigSignature } from "../fleet/registry.js";
import { getWorkspacePaths } from "../workspace.js";
import { initWorkspaceAsync } from "../workspaceInitializationAsync.js";
import { adaptersConfigPath, initAdaptersConfigAsync } from "../adapters/adapterConfigStore.js";
import { resolveAgentId } from "../fleet/paths.js";
import { ensureSigningKeys } from "../crypto/keys.js";
import { vaultExists, unlockVault, vaultStatus } from "../vault/vault.js";
import { agentDashboardDir, buildDashboard } from "../dashboard/build.js";
import { serveDashboard } from "../dashboard/serve.js";
import { startGateway } from "../gateway/server.js";
import { ensureDir, writeFileAtomic } from "../utils/fs.js";
import { openLedger } from "../ledger/ledger.js";
import { sha256Hex } from "../utils/hash.js";
import { loadLanMode, verifyLanModeSignature } from "../pairing/lanMode.js";
import { verifyUsersConfigSignature } from "../auth/authApi.js";
import { initOpsPolicyAsync, opsPolicyPath, verifyOpsPolicySignature } from "../ops/policy.js";
import { initForecastPolicyAsync } from "../forecast/forecastPublication.js";
import { forecastPolicyPath } from "../forecast/forecastStore.js";
import { loadValuePolicyAsync, valuePolicyPath } from "../value/valueStore.js";
import { initPluginWorkspaceAsync, verifyPluginWorkspace } from "../plugins/pluginApi.js";
import { checkNotaryTrust, verifyTrustConfigSignature } from "../trust/trustConfig.js";
import { initMechanicWorkspaceForAuthority } from "../mechanic/mechanicSettingsPublication.js";
import { mechanicTargetsPath, verifyMechanicTargetsSignature } from "../mechanic/targetsStore.js";
import { verifyMechanicProfilesSignature } from "../mechanic/profiles.js";
import { verifyMechanicTuningSignature } from "../mechanic/tuningStore.js";
import { ensurePromptDirs, initPromptPolicy, loadPromptPolicyAttemptAsync, promptPolicyPath, verifyPromptPolicySignature } from "../prompt/promptPolicyStore.js";
import { captureOrgPairs, orgPairBytes } from "../org/preparedOrgPairs.js";
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
import { isPublicBind } from "../config/loadConfig.js";
import { assertProxyTrustNamed, assertPublicBindAcknowledged, resolveListenPolicy } from "./listenPolicy.js";
import { assertPortFree, closeStartedThenThrow, listenOnPolicyPort } from "./studioLifecycle.js";
import { VAULT_LOCKED_MESSAGE } from "../vault/vaultLockedError.js";

export interface StudioRuntime {
  stop: () => Promise<void>;
  state: StudioState;
}

export interface StartStudioDaemonOptions {
  hostDir?: string;
  defaultWorkspaceId?: string;
  allowLocalDemoWorkspace?: boolean;
  apiPort?: number;
  dashboardPort?: number;
}

function ensureDemoVaultPassphrase(hostDir: string): string {
  const file = join(hostDir, "demo-vault-passphrase");
  ensureDir(hostDir);
  if (existsSync(file)) {
    const existing = readFileSync(file, "utf8").trim();
    if (existing.length > 0) {
      return existing;
    }
  }
  const generated = `amc-demo-${randomBytes(32).toString("base64url")}`;
  writeFileAtomic(file, `${generated}\n`, 0o600);
  return generated;
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

async function ensureWorkspace(workspace: string): Promise<void> {
  if (!existsSync(join(workspace, ".amc"))) {
    await initWorkspaceAsync({ workspacePath: workspace, trustBoundaryMode: "isolated" });
  }
  ensureSigningKeys(workspace);
  if (!existsSync(opsPolicyPath(workspace))) {
    if (!vaultStatus(workspace).unlocked) {
      const passphrase = process.env.AMC_VAULT_PASSPHRASE;
      if (!passphrase) throw new Error("Vault locked. Unlock the vault before initializing the missing ops policy.");
      unlockVault(workspace, passphrase);
    }
    await initOpsPolicyAsync(workspace, { onlyIfMissing: true });
  }
  if (!existsSync(adaptersConfigPath(workspace))) {
    if (!vaultStatus(workspace).unlocked) {
      const passphrase = process.env.AMC_VAULT_PASSPHRASE;
      if (!passphrase) throw new Error("Vault locked. Unlock the vault before initializing the missing adapters config.");
      unlockVault(workspace, passphrase);
    }
    await initAdaptersConfigAsync(workspace);
  }
  if (!existsSync(forecastPolicyPath(workspace))) {
    await initForecastPolicyAsync(workspace, { onlyIfMissing: true });
  }
  // Workspaces initialized before P2-06-D2 lack the value policy that read-only readiness requires.
  if (!existsSync(valuePolicyPath(workspace))) {
    await loadValuePolicyAsync(workspace);
  }
  if (!existsSync(mechanicTargetsPath(workspace))) {
    await initMechanicWorkspaceForAuthority({
      workspace,
      scopeType: "WORKSPACE",
      scopeId: "workspace"
    }, () => {}, true);
  }
  if (!existsSync(promptPolicyPath(workspace))) {
    if (process.env.AMC_NO_SIGN === "1") {
      initPromptPolicy(workspace);
    } else {
      const root = resolve(workspace), path = promptPolicyPath(root), before = captureOrgPairs([path]);
      if (orgPairBytes(before, path) !== null) throw new Error("missing prompt policy appeared before initialization; retry");
      const assertWorkspace = () => {
        if (resolve(workspace) !== root) throw new Error("original prompt-policy workspace changed before publication");
      };
      ensurePromptDirs(root);
      const attempt = await loadPromptPolicyAttemptAsync(root, { beforePublish: assertWorkspace }, before);
      attempt.assertCurrent();
    }
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
  allowLocalDemoWorkspace?: boolean;
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
  /** The gateway's request body cap (AMC_GATEWAY_MAX_REQUEST_BYTES); the gateway's 8 MiB default when absent. */
  gatewayMaxRequestBytes?: number;
  corsAllowedOrigins?: string[];
  dataRetentionDays?: number;
  queryLeaseCarrierEnabled?: boolean;
  /** The raw environment for the listen policy (the CLI passes process.env); absent, only the options and LAN config count. */
  env?: NodeJS.ProcessEnv;
}): Promise<StudioRuntime> {
  if (params.hostDir) {
    const hostDir = params.hostDir;
    const listen = resolveListenPolicy({ env: params.env ?? {}, hostMode: true, flags: { bind: params.apiHost, port: params.apiPort, allowedCidrs: params.allowedCidrs } });
    assertPublicBindAcknowledged(listen);
    assertProxyTrustNamed(params.trustedProxyHops, listen);
    if (params.allowLocalDemoWorkspace === true) {
      process.env.AMC_VAULT_PASSPHRASE = ensureDemoVaultPassphrase(hostDir);
    }
    const defaultWorkspaceId = params.defaultWorkspaceId ?? "default";
    initHostDb(hostDir);
    const existing = getWorkspaceRecord(hostDir, defaultWorkspaceId);
    if (!existing) {
      createWorkspaceRecord({
        hostDir,
        workspaceId: defaultWorkspaceId,
        name: "Default Workspace"
      });
    }
    const defaultWorkspaceDir = hostWorkspaceDir(hostDir, defaultWorkspaceId);
    if (!existsSync(join(defaultWorkspaceDir, ".amc", "amc.config.yaml"))) {
      await initWorkspaceAsync({
        workspacePath: defaultWorkspaceDir,
        trustBoundaryMode: "isolated"
      });
    }
    const router = await startWorkspaceRouter({
      hostDir,
      host: listen.apiHost,
      port: listen.apiPort,
      defaultWorkspaceId,
      allowLocalDemoWorkspace: params.allowLocalDemoWorkspace,
      allowedCidrs: listen.allowedCidrs,
      trustedProxyHops: params.trustedProxyHops,
      trustedProxyCidrs: listen.trustedProxyCidrs,
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
      metricsPort: listen.metricsPort,
      metricsHost: params.metricsHost ?? listen.metricsHost,
      host: router.host,
      lanEnabled: params.allowPublicBind === true,
      pairingRequired: false,
      currentAgent: "default",
      vaultUnlocked: true,
      untrustedConfig: false,
      logFile: join(hostDir, "logs", "host.log")
    };
    writeStudioState(params.workspace, state);
    return {
      state,
      stop: async () => {
        await router.close();
        clearStudioState(params.workspace);
      }
    };
  }

  const workspace = params.workspace;
  await ensureWorkspace(workspace);
  enforceStudioLogRetention(workspace, params.dataRetentionDays ?? 30);
  const agentId = resolveAgentId(workspace);

  if (!vaultExists(workspace)) {
    throw new Error("Vault not initialized. Run `amc vault init` first.");
  }
  const status = vaultStatus(workspace);
  if (!status.unlocked) {
    const passphrase = process.env.AMC_VAULT_PASSPHRASE;
    if (!passphrase) {
      throw new Error(VAULT_LOCKED_MESSAGE);
    }
    unlockVault(workspace, passphrase);
  }

  if (!existsSync(join(workspace, ".amc", "plugins", "registries.yaml")) || !existsSync(join(workspace, ".amc", "plugins", "installed.lock.json"))) {
    await initPluginWorkspaceAsync({ workspace });
  }

  const token = ensureAdminToken(workspace);
  if (!existsSync(join(workspace, ".amc", "action-policy.yaml"))) {
    await initActionPolicyAsync(workspace, undefined, { onlyIfMissing: true });
  }
  if (!existsSync(join(workspace, ".amc", "tools.yaml"))) {
    await initToolsConfigAsync(workspace, undefined, { onlyIfMissing: true });
  }
  if (!existsSync(join(workspace, ".amc", "approval-policy.yaml"))) {
    initApprovalPolicy(workspace);
  }
  const lan = loadLanMode(workspace);
  const lanSig = verifyLanModeSignature(workspace);
  // LIVE-RUNTIME-03/-10: where to listen and whom to admit is decided, and refused, before anything listens or opens a session.
  const listen = resolveListenPolicy({ env: params.env ?? {}, hostMode: false, lan: { ...lan, valid: lanSig.valid },
    flags: { bind: params.apiHost, port: params.apiPort, metricsPort: params.metricsPort, allowedCidrs: params.allowedCidrs } });
  const metricsHost = params.metricsHost ?? listen.metricsHost;
  const metricsPublicBind = isPublicBind(metricsHost);
  assertPublicBindAcknowledged(listen);
  assertProxyTrustNamed(params.trustedProxyHops, listen);
  if (metricsPublicBind && !(lan.enabled && lanSig.valid)) {
    throw new Error("Refusing to bind metrics publicly without signed LAN mode.");
  }
  if (listen.publicBind && !params.allowPublicBind && !(lan.enabled && lanSig.valid)) {
    throw new Error("Refusing to bind Studio API publicly. Enable LAN mode or set explicit public bind allowance.");
  }
  await assertPortFree(listen.apiHost, listen.apiPort, listen.apiPortSource);
  await assertPortFree(metricsHost, listen.metricsPort, listen.metricsPortSource);
  // The gateway never falls back and opens its session before it listens, so its busy ports are refused first (skeptic D4).
  const gatewayHost = params.gatewayHost ?? listen.apiHost, gatewayConfig = loadGatewayConfig(workspace);
  await assertPortFree(gatewayHost, params.gatewayPort ?? gatewayConfig.listen.port, params.gatewayPort === undefined ? "the gateway config" : "AMC_GATEWAY_PORT");
  if (gatewayConfig.proxy.enabled) await assertPortFree(gatewayHost, params.proxyPort ?? gatewayConfig.proxy.port, params.proxyPort === undefined ? "the gateway config" : "AMC_PROXY_PORT");
  const gateway = await startGateway({
    workspace,
    workspaceId: workspaceIdFromDirectory(workspace),
    listenHost: gatewayHost,
    listenPort: params.gatewayPort,
    proxyPort: params.proxyPort,
    allowedCidrs: listen.allowedCidrs,
    maxRequestBytes: params.gatewayMaxRequestBytes,
    allowQueryCarrierOverride: params.queryLeaseCarrierEnabled
  });
  // Anything that fails from here closes what already started, newest first, so a refused start leaves no open session.
  const started: Array<() => Promise<void>> = [() => gateway.close()];
  const guard = async <T>(step: () => Promise<T>): Promise<T> => step().catch((error: unknown) => closeStartedThenThrow(started, error));

  ensureMetricsBaseline();
  try {
    const stats = maintenanceStats(workspace);
    setRetentionSegmentsMetric(stats.archive.segmentCount);
    setBlobMetrics(stats.blobs.count, stats.blobs.bytes);
    setDbSizeMetric(stats.dbSizeBytes);
  } catch {
    // Metrics baselining must remain best-effort.
  }
  const metrics = await guard(() => listenOnPolicyPort({ label: "Metrics", port: listen.metricsPort, source: listen.metricsPortSource,
    start: (port) => startMetricsServer({ workspace, host: metricsHost, port, allowRemote: metricsPublicBind, allowedCidrs: listen.allowedCidrs }) }));
  started.push(() => metrics.close());

  const dashboardOut = agentDashboardDir(workspace, agentId);
  try {
    buildDashboard({
      workspace,
      agentId,
      outDir: dashboardOut
    });
  } catch (error) {
    // A fresh workspace has no run yet: serve a page naming why until `amc up`'s baseline or `amc dashboard build` replaces it.
    const reason = (error instanceof Error ? error.message : String(error)).replace(/&/g, "&amp;").replace(/</g, "&lt;");
    ensureDir(dashboardOut);
    writeFileAtomic(
      join(dashboardOut, "index.html"),
      "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">"
        + `<title>AMC Dashboard</title></head><body><h1>AMC Studio</h1><p>${reason}</p><p>Then run <code>amc dashboard build</code> to show it here.</p></body></html>`,
      0o644
    );
  }
  // The dashboard is loopback-only and always falls back to a free port (its port is a convenience, not a probe target).
  const dashboard = await guard(() => listenOnPolicyPort({ label: "Dashboard", port: params.dashboardPort ?? 4173, source: null, log: () => undefined,
    start: (port) => serveDashboard({ workspace, agentId, port, outDir: dashboardOut }) }));
  started.push(() => dashboard.close());

  const api = await guard(() => listenOnPolicyPort({ label: "Studio API", port: listen.apiPort, source: listen.apiPortSource,
    start: (port) => startStudioApiServer({ workspace, host: listen.apiHost, port, token, allowedCidrs: listen.allowedCidrs,
      trustedProxyHops: params.trustedProxyHops, trustedProxyCidrs: listen.trustedProxyCidrs, maxRequestBytes: params.maxRequestBytes, corsAllowedOrigins: params.corsAllowedOrigins }) }));
  started.push(() => api.close());

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
    await guard(async () => writeConfigSignatureAudit(workspace, agentId));
  }

  const logFile = join(studioLogsDir(workspace), "studio.log");
  ensureDir(studioLogsDir(workspace));

  const state: StudioState = {
    pid: process.pid,
    startedTs: Date.now(),
    apiPort: api.port,
    gatewayPort: gateway.port,
    proxyPort: gateway.proxyPort ?? 0,
    dashboardPort: dashboard.port,
    metricsPort: metrics.port,
    metricsHost: metrics.host,
    host: api.host,
    lanEnabled: lan.enabled && lanSig.valid,
    pairingRequired: lan.enabled && lanSig.valid && lan.requirePairing,
    currentAgent: agentId,
    vaultUnlocked: vaultStatus(workspace).unlocked,
    untrustedConfig,
    logFile
  };
  await guard(async () => writeStudioState(workspace, state));
  try {
    writeStudioLifecycleAudit(workspace, agentId, "STUDIO_RUNTIME_STARTED");
  } catch {
    // Lifecycle audit is best-effort and must not block startup.
  }

  return {
    state,
    stop: async () => {
      // The API refuses new work synchronously, then the stop is recorded before the bounded drain (up to 10 s of
      // sockets and in-flight requests): a deploy's SIGTERM grace period is 10 s, so recording it last lost it.
      const apiClosed = api.close();
      try {
        writeStudioLifecycleAudit(workspace, agentId, "STUDIO_RUNTIME_STOPPED");
      } catch {
        // Lifecycle audit is best-effort and must not block shutdown.
      }
      // LIVE-RUNTIME-02: every server closes at once, so the API's drain no longer holds the gateway's seal behind it.
      const closed = await Promise.allSettled([apiClosed, gateway.close(), dashboard.close(), metrics.close()]);
      clearStudioState(workspace);
      const failures = closed.flatMap((result) => (result.status === "rejected" ? [result.reason as unknown] : []));
      if (failures.length > 0) throw new AggregateError(failures, "Studio did not stop cleanly");
    }
  };
}

/** How long a live Studio daemon may take to write its state file. */
const STUDIO_DAEMON_START_MS = 60_000;

export async function startStudioDaemon(workspace: string, options: StartStudioDaemonOptions = {}): Promise<StudioState> {
  if (!options.hostDir) {
    await ensureWorkspace(workspace);
  }
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
  const logStart = statSync(logFile).size; // what this start appends begins here

  const args = [process.argv[1] ?? "", "_studio-daemon", "--workspace", workspace];
  if (options.hostDir) {
    args.push("--host-dir", options.hostDir);
  }
  if (options.defaultWorkspaceId) {
    args.push("--default-workspace-id", options.defaultWorkspaceId);
  }
  if (options.allowLocalDemoWorkspace) {
    args.push("--allow-local-demo-workspace");
  }
  if (typeof options.apiPort === "number") {
    args.push("--api-port", String(options.apiPort));
  }
  if (typeof options.dashboardPort === "number") {
    args.push("--dashboard-port", String(options.dashboardPort));
  }

  const child = spawn(process.execPath, args, {
    detached: true,
    stdio: ["ignore", outFd, errFd],
    env: process.env
  });
  // P0-62: a daemon that dies during startup is reported at once with its exit, and a live one is given
  // STUDIO_DAEMON_START_MS, not a fixed 6 s that a loaded host can outlast while the daemon is still booting.
  let exited: string | null = null;
  child.once("exit", (code, signal) => { exited = signal ? `signal ${signal}` : `exit code ${code}`; });
  child.unref();

  const started = Date.now();
  while (Date.now() - started < STUDIO_DAEMON_START_MS) {
    const state = readStudioState(workspace);
    if (state && state.pid > 0 && processRunning(state.pid)) {
      return state;
    }
    if (exited !== null) {
      // Name the daemon's own reason (often its fix), not only the log path; earlier runs' lines are left out.
      const reason = readFileSync(logFile).subarray(logStart).toString("utf8").trim().slice(-600);
      throw new Error(`Studio daemon exited during startup (${exited})${reason ? `: ${reason}` : ""}. See ${logFile}.`);
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
  }

  throw new Error(`Studio daemon did not start within ${STUDIO_DAEMON_START_MS / 1000} s. See ${logFile}.`);
}

/** The pid's command line, or null when it cannot be read: /proc on Linux, ps on other POSIX hosts, CIM on Windows. */
function processCommandLine(pid: number): string | null {
  try {
    if (process.platform === "win32") {
      const out = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
        `(Get-CimInstance Win32_Process -Filter 'ProcessId=${pid}').CommandLine`], { encoding: "utf8", timeout: 15_000, windowsHide: true });
      return out.status === 0 && out.stdout.trim() ? out.stdout.trim() : null;
    }
    if (existsSync(`/proc/${pid}/cmdline`)) return readFileSync(`/proc/${pid}/cmdline`, "utf8").replace(/\0/g, " ").trim() || null;
    const out = spawnSync("ps", ["-ww", "-o", "command=", "-p", String(pid)], { encoding: "utf8", timeout: 5_000 });
    return out.status === 0 && out.stdout.trim() ? out.stdout.trim() : null;
  } catch {
    return null;
  }
}

export function stopStudioDaemon(workspace: string): { stopped: boolean; message: string } {
  const state = readStudioState(workspace);
  if (!state || !state.pid) {
    return { stopped: false, message: "Studio is not running." };
  }
  // state.json is unsigned and outlives a crashed Studio, so its pid can be invalid or reused by another program:
  // only a pid whose command line carries the daemon entry (`amc up` spawns `cli.js _studio-daemon`) is signalled.
  if (!Number.isSafeInteger(state.pid) || state.pid < 1) {
    return { stopped: false, message: `Studio state names an invalid pid (${String(state.pid)}); nothing was signalled.` };
  }
  if (!processRunning(state.pid)) {
    return { stopped: false, message: "Studio state exists but process is not running." };
  }
  const commandLine = processCommandLine(state.pid);
  if (commandLine === null) {
    return { stopped: false, message: `Could not read the command line of pid ${state.pid}, so it is not confirmed as the AMC Studio daemon; nothing was signalled. If it is Studio, stop it yourself.` };
  }
  if (!commandLine.split(/[\s"']+/).includes("_studio-daemon")) {
    return {
      stopped: false,
      message: `pid ${state.pid} in .amc/studio/state.json is not the AMC Studio daemon; nothing was signalled. `
        + "A foreground Studio (amc studio start) stops with Ctrl+C; if Studio is not running, the state file is stale and can be removed."
    };
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
