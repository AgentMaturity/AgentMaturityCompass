import { resolve } from "node:path";
import { loadStudioRuntimeConfig, isPublicBind } from "./loadConfig.js";
import type { StudioRuntimeConfig } from "./configTypes.js";
import { verifyTrustConfigSignature, loadTrustConfig, checkNotaryTrust } from "../trust/trustConfig.js";
import { verifyOpsPolicySignature } from "../ops/policy.js";
import { verifyAdaptersConfigSignature } from "../adapters/adapterConfigStore.js";
import { verifyActionPolicySignature } from "../governor/actionPolicyEngine.js";
import { verifyToolsConfigSignature } from "../toolhub/toolhubValidators.js";
import { verifyBudgetsConfigSignature } from "../budgets/budgets.js";
import { verifyApprovalPolicySignature } from "../approvals/approvalPolicyEngine.js";
import { verifyPluginWorkspace } from "../plugins/pluginApi.js";
import { verifyIdentityConfigSignature, loadIdentityConfig } from "../identity/identityConfig.js";
import { pathExists } from "../utils/fs.js";
import { weakCidrs } from "../studio/listenPolicy.js";

type SourceKind = "default" | "env" | "env_file";

function sourceForEnv(env: NodeJS.ProcessEnv, key: string): SourceKind {
  const fileKey = `${key}_FILE`;
  if (typeof env[fileKey] === "string" && env[fileKey]!.trim().length > 0) {
    return "env_file";
  }
  if (typeof env[key] === "string" && env[key]!.trim().length > 0) {
    return "env";
  }
  return "default";
}

const trackedEnvKeys = [
  "AMC_HOST_DIR",
  "AMC_DEFAULT_WORKSPACE_ID",
  "AMC_HOST_BIND",
  "AMC_HOST_PORT",
  "AMC_HOST_PUBLIC_BASEURL",
  "AMC_WORKSPACE_DIR",
  "AMC_BIND",
  "AMC_STUDIO_PORT",
  "AMC_GATEWAY_PORT",
  "AMC_PROXY_PORT",
  "AMC_TOOLHUB_PORT",
  "AMC_DASHBOARD_PORT",
  "AMC_LOG_LEVEL",
  "AMC_LAN_MODE",
  "AMC_ALLOWED_CIDRS",
  "AMC_QUERY_LEASE_CARRIER_ENABLED",
  "AMC_TRUSTED_PROXY_HOPS",
  "AMC_DATA_RETENTION_DAYS",
  "AMC_MIN_FREE_DISK_MB",
  "AMC_MAX_REQUEST_BYTES",
  "AMC_GATEWAY_MAX_REQUEST_BYTES",
  "AMC_CORS_ALLOWED_ORIGINS",
  "AMC_ALLOW_PUBLIC_BIND",
  "AMC_METRICS_BIND",
  "AMC_METRICS_PORT",
  "AMC_ENABLE_NOTARY",
  "AMC_NOTARY_BASE_URL",
  "AMC_NOTARY_REQUIRED_ATTESTATION"
] as const;

function formatConfig(config: StudioRuntimeConfig): Record<string, unknown> {
  return {
    hostMode: Boolean(config.hostDir),
    hostDir: config.hostDir,
    defaultWorkspaceId: config.defaultWorkspaceId,
    hostBind: config.hostBind,
    hostPort: config.hostPort,
    hostPublicBaseUrl: config.hostPublicBaseUrl,
    workspaceDir: config.workspaceDir,
    bind: config.bind,
    studioPort: config.studioPort,
    gatewayPort: config.gatewayPort,
    proxyPort: config.proxyPort,
    toolhubPort: config.toolhubPort,
    dashboardPort: config.dashboardPort,
    logLevel: config.logLevel,
    lanMode: config.lanMode,
    allowedCidrs: config.allowedCidrs,
    queryLeaseCarrierEnabled: config.queryLeaseCarrierEnabled,
    trustedProxyHops: config.trustedProxyHops,
    dataRetentionDays: config.dataRetentionDays,
    minFreeDiskMb: config.minFreeDiskMb,
    maxRequestBytes: config.maxRequestBytes,
    gatewayMaxRequestBytes: config.gatewayMaxRequestBytes,
    corsAllowedOrigins: config.corsAllowedOrigins,
    allowPublicBind: config.allowPublicBind,
    metricsBind: config.metricsBind,
    metricsPort: config.metricsPort,
    bootstrap: config.bootstrap,
    enableNotary: config.enableNotary,
    notaryBaseUrl: config.notaryBaseUrl,
    notaryRequiredAttestation: config.notaryRequiredAttestation
  };
}

export function configPrintCli(params: {
  env?: NodeJS.ProcessEnv;
  workspace?: string;
}): {
  config: Record<string, unknown>;
  sources: Array<{ key: string; source: SourceKind }>;
} {
  const env = params.env ?? process.env;
  const workspace = resolve(params.workspace ?? process.cwd());
  const runtime = loadStudioRuntimeConfig(env, {
    workspaceDir: workspace
  });
  return {
    config: formatConfig(runtime),
    sources: trackedEnvKeys.map((key) => ({
      key,
      source: sourceForEnv(env, key)
    }))
  };
}

export async function configExplainCli(params: {
  env?: NodeJS.ProcessEnv;
  workspace?: string;
}): Promise<{
  config: Record<string, unknown>;
  sources: Array<{ key: string; source: SourceKind }>;
  signatures: Array<{ id: string; valid: boolean; reason: string | null }>;
  warnings: string[];
}> {
  const env = params.env ?? process.env;
  const workspace = resolve(params.workspace ?? process.cwd());
  const runtime = loadStudioRuntimeConfig(env, {
    workspaceDir: workspace
  });
  const warnings: string[] = [];

  const bindHost = runtime.hostDir ? runtime.hostBind : runtime.bind;
  if (isPublicBind(bindHost) && !runtime.lanMode && !runtime.allowPublicBind) {
    warnings.push("PUBLIC_BIND_WITHOUT_LAN_GATING");
  }
  if (weakCidrs(runtime.allowedCidrs)) {
    warnings.push("WEAK_CIDR_ALLOWLIST");
  }
  if (runtime.enableNotary) {
    const trustSig = verifyTrustConfigSignature(workspace);
    if (!trustSig.valid) {
      warnings.push("NOTARY_REQUIRED_BUT_TRUST_CONFIG_INVALID");
    } else {
      const notary = await checkNotaryTrust(workspace).catch(() => null);
      if (!notary || !notary.ok) {
        warnings.push("NOTARY_REQUIRED_BUT_UNAVAILABLE");
      }
    }
  }

  if (runtime.hostDir && pathExists(runtime.hostDir)) {
    const identitySig = verifyIdentityConfigSignature(runtime.hostDir);
    if (!identitySig.valid) {
      warnings.push("IDENTITY_CONFIG_UNTRUSTED");
    } else {
      const identity = loadIdentityConfig(runtime.hostDir);
      const enabledProviders = identity.identity.providers.filter((provider) => provider.enabled).length;
      if (!identity.identity.localAuth.enabled && enabledProviders === 0) {
        warnings.push("LOCKOUT_RISK_LOCAL_AUTH_DISABLED_AND_NO_SSO_PROVIDER");
      }
      if (!identity.identity.localAuth.passwordLoginEnabled && enabledProviders === 0) {
        warnings.push("LOCKOUT_RISK_PASSWORD_LOGIN_DISABLED_AND_NO_SSO_PROVIDER");
      }
    }
  }

  const signatures = [
    {
      id: "trust.yaml",
      ...verifyTrustConfigSignature(workspace)
    },
    {
      id: "ops-policy.yaml",
      ...verifyOpsPolicySignature(workspace)
    },
    {
      id: "adapters.yaml",
      ...verifyAdaptersConfigSignature(workspace)
    },
    {
      id: "action-policy.yaml",
      ...verifyActionPolicySignature(workspace)
    },
    {
      id: "tools.yaml",
      ...verifyToolsConfigSignature(workspace)
    },
    {
      id: "budgets.yaml",
      ...verifyBudgetsConfigSignature(workspace)
    },
    {
      id: "approval-policy.yaml",
      ...verifyApprovalPolicySignature(workspace)
    }
  ].map((row) => ({
    id: row.id,
    valid: row.valid,
    reason: row.reason
  }));

  const plugin = verifyPluginWorkspace({ workspace });
  if (!plugin.ok) {
    warnings.push("PLUGIN_INTEGRITY_BROKEN");
  }

  if (loadTrustConfig(workspace).trust.mode === "NOTARY" && !runtime.enableNotary) {
    warnings.push("NOTARY_MODE_CONFIGURED_BUT_AMC_ENABLE_NOTARY_IS_FALSE");
  }

  return {
    config: formatConfig(runtime),
    sources: trackedEnvKeys.map((key) => ({
      key,
      source: sourceForEnv(env, key)
    })),
    signatures,
    warnings
  };
}
