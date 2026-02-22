import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { studioEnvSchema, type StudioEnv } from "./envSchema.js";
import type { StudioRuntimeConfig } from "./configTypes.js";

function readSecretFromEnvOrFile(env: NodeJS.ProcessEnv, key: string): string | null {
  const fileKey = `${key}_FILE`;
  const filePath = env[fileKey];
  if (typeof filePath === "string" && filePath.trim().length > 0) {
    const raw = readFileSync(resolve(filePath.trim()), "utf8").trim();
    return raw.length > 0 ? raw : null;
  }
  const direct = env[key];
  if (typeof direct === "string" && direct.trim().length > 0) {
    return direct.trim();
  }
  return null;
}

function parseAllowedCidrs(raw: string): string[] {
  return raw
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

function parseAllowedOrigins(raw: string): string[] {
  return raw
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

function assertIntegerInRange(
  value: unknown,
  label: string,
  min: number,
  max: number
): string | null {
  if (typeof value !== "number" || !Number.isFinite(value) || !Number.isInteger(value)) {
    return `${label} must be an integer`;
  }
  if (value < min || value > max) {
    return `${label} must be between ${min} and ${max}`;
  }
  return null;
}

function validateRuntimeConfig(config: StudioRuntimeConfig, env: NodeJS.ProcessEnv): void {
  const errors: string[] = [];

  const numericChecks: Array<[unknown, string, number, number]> = [
    [config.hostPort, "AMC_HOST_PORT", 1, 65535],
    [config.studioPort, "AMC_STUDIO_PORT", 1, 65535],
    [config.gatewayPort, "AMC_GATEWAY_PORT", 1, 65535],
    [config.proxyPort, "AMC_PROXY_PORT", 1, 65535],
    [config.toolhubPort, "AMC_TOOLHUB_PORT", 1, 65535],
    [config.metricsPort, "AMC_METRICS_PORT", 1, 65535],
    [config.trustedProxyHops, "AMC_TRUSTED_PROXY_HOPS", 0, 32],
    [config.dataRetentionDays, "AMC_DATA_RETENTION_DAYS", 1, 3650],
    [config.minFreeDiskMb, "AMC_MIN_FREE_DISK_MB", 1, Number.MAX_SAFE_INTEGER],
    [config.maxRequestBytes, "AMC_MAX_REQUEST_BYTES", 1024, 268_435_456]
  ];

  for (const [value, label, min, max] of numericChecks) {
    const maybeError = assertIntegerInRange(value, label, min, max);
    if (maybeError) {
      errors.push(maybeError);
    }
  }

  if (config.hostDir) {
    if (config.hostPort === config.metricsPort) {
      errors.push("AMC_HOST_PORT and AMC_METRICS_PORT must be different in host mode");
    }
  } else {
    const runtimePorts = new Map<number, string[]>();
    const portRows: Array<[number, string]> = [
      [config.studioPort, "AMC_STUDIO_PORT"],
      [config.gatewayPort, "AMC_GATEWAY_PORT"],
      [config.proxyPort, "AMC_PROXY_PORT"],
      [config.toolhubPort, "AMC_TOOLHUB_PORT"],
      [config.metricsPort, "AMC_METRICS_PORT"]
    ];
    for (const [port, key] of portRows) {
      const current = runtimePorts.get(port);
      if (current) {
        current.push(key);
      } else {
        runtimePorts.set(port, [key]);
      }
    }
    for (const [port, keys] of runtimePorts.entries()) {
      if (keys.length > 1) {
        errors.push(`port ${port} is assigned to multiple services (${keys.join(", ")})`);
      }
    }
  }

  if (config.bootstrap) {
    const passphraseFile = env.AMC_VAULT_PASSPHRASE_FILE?.trim() ?? "";
    if (passphraseFile.length === 0) {
      errors.push("AMC_BOOTSTRAP=true requires AMC_VAULT_PASSPHRASE_FILE");
    } else if (!existsSync(resolve(passphraseFile))) {
      errors.push(`AMC_VAULT_PASSPHRASE_FILE not found: ${resolve(passphraseFile)}`);
    }
  }

  if (config.bootstrap && config.enableNotary && !config.notaryAuthSecret) {
    errors.push("AMC_ENABLE_NOTARY=true with AMC_BOOTSTRAP=true requires AMC_NOTARY_AUTH_SECRET_FILE (or AMC_NOTARY_AUTH_SECRET)");
  }

  if (errors.length > 0) {
    throw new Error(`Invalid AMC runtime configuration:\n- ${errors.join("\n- ")}`);
  }
}

export function loadStudioRuntimeConfig(
  env: NodeJS.ProcessEnv = process.env,
  overrides?: Partial<StudioRuntimeConfig>
): StudioRuntimeConfig {
  const parsed: StudioEnv = studioEnvSchema.parse({
    AMC_HOST_DIR: env.AMC_HOST_DIR,
    AMC_DEFAULT_WORKSPACE_ID: env.AMC_DEFAULT_WORKSPACE_ID,
    AMC_HOST_BIND: env.AMC_HOST_BIND,
    AMC_HOST_PORT: env.AMC_HOST_PORT,
    AMC_HOST_PUBLIC_BASEURL: env.AMC_HOST_PUBLIC_BASEURL,
    AMC_WORKSPACE_DIR: env.AMC_WORKSPACE_DIR,
    AMC_BIND: env.AMC_BIND,
    AMC_STUDIO_PORT: env.AMC_STUDIO_PORT,
    AMC_GATEWAY_PORT: env.AMC_GATEWAY_PORT,
    AMC_PROXY_PORT: env.AMC_PROXY_PORT,
    AMC_TOOLHUB_PORT: env.AMC_TOOLHUB_PORT,
    AMC_LOG_LEVEL: env.AMC_LOG_LEVEL,
    AMC_LAN_MODE: env.AMC_LAN_MODE,
    AMC_ALLOWED_CIDRS: env.AMC_ALLOWED_CIDRS,
    AMC_QUERY_LEASE_CARRIER_ENABLED: env.AMC_QUERY_LEASE_CARRIER_ENABLED,
    AMC_TRUSTED_PROXY_HOPS: env.AMC_TRUSTED_PROXY_HOPS,
    AMC_DATA_RETENTION_DAYS: env.AMC_DATA_RETENTION_DAYS,
    AMC_MIN_FREE_DISK_MB: env.AMC_MIN_FREE_DISK_MB,
    AMC_MAX_REQUEST_BYTES: env.AMC_MAX_REQUEST_BYTES,
    AMC_CORS_ALLOWED_ORIGINS: env.AMC_CORS_ALLOWED_ORIGINS,
    AMC_ALLOW_PUBLIC_BIND: env.AMC_ALLOW_PUBLIC_BIND,
    AMC_METRICS_BIND: env.AMC_METRICS_BIND,
    AMC_METRICS_PORT: env.AMC_METRICS_PORT,
    AMC_BOOTSTRAP: env.AMC_BOOTSTRAP,
    AMC_VAULT_PASSPHRASE: env.AMC_VAULT_PASSPHRASE,
    AMC_VAULT_PASSPHRASE_FILE: env.AMC_VAULT_PASSPHRASE_FILE,
    AMC_BOOTSTRAP_OWNER_USERNAME: env.AMC_BOOTSTRAP_OWNER_USERNAME,
    AMC_BOOTSTRAP_OWNER_USERNAME_FILE: env.AMC_BOOTSTRAP_OWNER_USERNAME_FILE,
    AMC_BOOTSTRAP_OWNER_PASSWORD: env.AMC_BOOTSTRAP_OWNER_PASSWORD,
    AMC_BOOTSTRAP_OWNER_PASSWORD_FILE: env.AMC_BOOTSTRAP_OWNER_PASSWORD_FILE,
    AMC_BOOTSTRAP_HOST_ADMIN_USERNAME: env.AMC_BOOTSTRAP_HOST_ADMIN_USERNAME,
    AMC_BOOTSTRAP_HOST_ADMIN_USERNAME_FILE: env.AMC_BOOTSTRAP_HOST_ADMIN_USERNAME_FILE,
    AMC_BOOTSTRAP_HOST_ADMIN_PASSWORD: env.AMC_BOOTSTRAP_HOST_ADMIN_PASSWORD,
    AMC_BOOTSTRAP_HOST_ADMIN_PASSWORD_FILE: env.AMC_BOOTSTRAP_HOST_ADMIN_PASSWORD_FILE,
    AMC_BOOTSTRAP_DEFAULT_WORKSPACE_ID: env.AMC_BOOTSTRAP_DEFAULT_WORKSPACE_ID,
    AMC_BOOTSTRAP_DEFAULT_WORKSPACE_NAME: env.AMC_BOOTSTRAP_DEFAULT_WORKSPACE_NAME,
    AMC_SESSION_SIGNING_KEY: env.AMC_SESSION_SIGNING_KEY,
    AMC_SESSION_SIGNING_KEY_FILE: env.AMC_SESSION_SIGNING_KEY_FILE,
    AMC_ENABLE_NOTARY: env.AMC_ENABLE_NOTARY,
    AMC_NOTARY_BASE_URL: env.AMC_NOTARY_BASE_URL,
    AMC_NOTARY_REQUIRED_ATTESTATION: env.AMC_NOTARY_REQUIRED_ATTESTATION,
    AMC_NOTARY_AUTH_SECRET: env.AMC_NOTARY_AUTH_SECRET,
    AMC_NOTARY_AUTH_SECRET_FILE: env.AMC_NOTARY_AUTH_SECRET_FILE
  });

  const base: StudioRuntimeConfig = {
    hostDir: parsed.AMC_HOST_DIR ? resolve(parsed.AMC_HOST_DIR) : null,
    defaultWorkspaceId: parsed.AMC_DEFAULT_WORKSPACE_ID.trim().toLowerCase(),
    hostBind: parsed.AMC_HOST_BIND,
    hostPort: parsed.AMC_HOST_PORT,
    hostPublicBaseUrl: parsed.AMC_HOST_PUBLIC_BASEURL ? parsed.AMC_HOST_PUBLIC_BASEURL.trim() : null,
    workspaceDir: resolve(parsed.AMC_WORKSPACE_DIR),
    bind: parsed.AMC_BIND,
    studioPort: parsed.AMC_STUDIO_PORT,
    gatewayPort: parsed.AMC_GATEWAY_PORT,
    proxyPort: parsed.AMC_PROXY_PORT,
    toolhubPort: parsed.AMC_TOOLHUB_PORT,
    logLevel: parsed.AMC_LOG_LEVEL,
    lanMode: parsed.AMC_LAN_MODE,
    allowedCidrs: parseAllowedCidrs(parsed.AMC_ALLOWED_CIDRS),
    queryLeaseCarrierEnabled: parsed.AMC_QUERY_LEASE_CARRIER_ENABLED,
    trustedProxyHops: Math.max(0, parsed.AMC_TRUSTED_PROXY_HOPS),
    dataRetentionDays: Math.max(1, parsed.AMC_DATA_RETENTION_DAYS),
    minFreeDiskMb: Math.max(1, parsed.AMC_MIN_FREE_DISK_MB),
    maxRequestBytes: Math.max(1_024, parsed.AMC_MAX_REQUEST_BYTES),
    corsAllowedOrigins: parseAllowedOrigins(parsed.AMC_CORS_ALLOWED_ORIGINS),
    allowPublicBind: parsed.AMC_ALLOW_PUBLIC_BIND,
    metricsBind: parsed.AMC_METRICS_BIND,
    metricsPort: parsed.AMC_METRICS_PORT,
    bootstrap: parsed.AMC_BOOTSTRAP,
    vaultPassphrase: readSecretFromEnvOrFile(env, "AMC_VAULT_PASSPHRASE"),
    bootstrapOwnerUsername: readSecretFromEnvOrFile(env, "AMC_BOOTSTRAP_OWNER_USERNAME"),
    bootstrapOwnerPassword: readSecretFromEnvOrFile(env, "AMC_BOOTSTRAP_OWNER_PASSWORD"),
    bootstrapHostAdminUsername: readSecretFromEnvOrFile(env, "AMC_BOOTSTRAP_HOST_ADMIN_USERNAME"),
    bootstrapHostAdminPassword: readSecretFromEnvOrFile(env, "AMC_BOOTSTRAP_HOST_ADMIN_PASSWORD"),
    bootstrapDefaultWorkspaceId: readSecretFromEnvOrFile(env, "AMC_BOOTSTRAP_DEFAULT_WORKSPACE_ID"),
    bootstrapDefaultWorkspaceName: readSecretFromEnvOrFile(env, "AMC_BOOTSTRAP_DEFAULT_WORKSPACE_NAME"),
    sessionSigningKey: readSecretFromEnvOrFile(env, "AMC_SESSION_SIGNING_KEY"),
    enableNotary: parsed.AMC_ENABLE_NOTARY,
    notaryBaseUrl: parsed.AMC_NOTARY_BASE_URL,
    notaryRequiredAttestation: parsed.AMC_NOTARY_REQUIRED_ATTESTATION,
    notaryAuthSecret: readSecretFromEnvOrFile(env, "AMC_NOTARY_AUTH_SECRET")
  };

  const cleanOverrides: Partial<StudioRuntimeConfig> = {};
  if (overrides) {
    for (const [key, value] of Object.entries(overrides)) {
      if (typeof value !== "undefined") {
        (cleanOverrides as Record<string, unknown>)[key] = value;
      }
    }
  }

  const resolved: StudioRuntimeConfig = {
    ...base,
    ...cleanOverrides,
    allowedCidrs: cleanOverrides.allowedCidrs ?? base.allowedCidrs,
    corsAllowedOrigins: cleanOverrides.corsAllowedOrigins ?? base.corsAllowedOrigins
  };

  validateRuntimeConfig(resolved, env);
  return resolved;
}

export function isPublicBind(host: string): boolean {
  const normalized = host.trim().toLowerCase();
  return normalized === "0.0.0.0" || normalized === "::";
}
