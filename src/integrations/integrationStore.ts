import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import { z } from "zod";
import { getSigningKey, signHexDigest } from "../crypto/keys.js";
import { capturePublicConfigAuthority, captureRawConfigPairForAsync, verifyRawConfigSignature } from "../config/configSignaturePair.js";
import { captureOrgPairs } from "../org/preparedOrgPairs.js";
import { ensureDir, pathExists, readUtf8, writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { getVaultSecret, setVaultSecret, unlockVault, vaultStatus } from "../vault/vault.js";
import { integrationsConfigSchema, type IntegrationsConfig } from "./integrationSchema.js";

export function integrationsConfigPath(workspace: string): string {
  return join(workspace, ".amc", "integrations.yaml");
}

export function integrationsConfigSigPath(workspace: string): string {
  return `${integrationsConfigPath(workspace)}.sig`;
}

function ensureVaultUnlocked(workspace: string): void {
  const status = vaultStatus(workspace);
  if (!status.unlocked) {
    const passphrase = process.env.AMC_VAULT_PASSPHRASE;
    if (!passphrase) {
      throw new Error("🔐 Vault locked. Run `amc vault unlock` first, or set AMC_VAULT_PASSPHRASE env var.");
    }
    unlockVault(workspace, passphrase);
  }
}

function defaultIntegrationsConfig(): IntegrationsConfig {
  return integrationsConfigSchema.parse({
    integrations: {
      version: 1,
      channels: [
        {
          id: "ops-webhook",
          type: "webhook",
          url: "http://127.0.0.1:9999/amc",
          secretRef: "vault:integrations/ops-webhook",
          enabled: true
        },
        {
          id: "ops-slack",
          type: "slack_webhook",
          webhookUrlRef: "vault:integrations/ops-slack-webhook",
          channel: "#amc-alerts",
          enabled: false
        }
      ],
      defaults: {
        delivery: {
          ordered: true,
          recordDeadLetters: true,
          maxRounds: 3,
          retry: {
            maxAttempts: 5,
            initialBackoffMs: 250,
            maxBackoffMs: 10_000,
            jitterFactor: 0.2,
            timeoutMs: 10_000
          }
        }
      },
      routing: {
        APPROVAL_REQUEST_CREATED: ["ops-webhook"],
        APPROVAL_DECISION_RECORDED: ["ops-webhook"],
        APPROVAL_QUORUM_MET: ["ops-webhook"],
        APPROVAL_DENIED: ["ops-webhook"],
        APPROVAL_CANCELLED: ["ops-webhook"],
        APPROVAL_EXPIRED: ["ops-webhook"],
        APPROVAL_CONSUMED: ["ops-webhook"],
        INCIDENT_CREATED: ["ops-webhook", "ops-slack"],
        FREEZE_APPLIED: ["ops-webhook"],
        DRIFT_REGRESSION_DETECTED: ["ops-webhook", "ops-slack"],
        BUDGET_EXCEEDED: ["ops-webhook", "ops-slack"],
        CI_GATE_FAILED: ["ops-webhook"],
        CI_GATE_PASSED: ["ops-webhook"],
        VALUE_REGRESSION_DETECTED: ["ops-webhook"],
        EXPERIMENT_FAILED: ["ops-webhook"],
        EXPERIMENT_PASSED: ["ops-webhook"],
        PLUGIN_INSTALL_REQUESTED: ["ops-webhook"],
        PLUGIN_INSTALLED: ["ops-webhook"],
        PLUGIN_UPGRADED: ["ops-webhook"],
        PLUGIN_REMOVED: ["ops-webhook"],
        PLUGIN_INTEGRITY_BROKEN: ["ops-webhook"],
        BENCH_PUBLISHED: ["ops-webhook"],
        BENCH_IMPORT_FAILED: ["ops-webhook"]
      }
    }
  });
}

export function resolveSecretRef(workspace: string, secretRef: string): string | null {
  if (!secretRef.startsWith("vault:")) {
    return null;
  }
  ensureVaultUnlocked(workspace);
  const key = secretRef.slice("vault:".length);
  return getVaultSecret(workspace, key);
}

function signConfig(workspace: string, filePath: string): string {
  const digest = sha256Hex(readFileSync(filePath));
  const sig = {
    digestSha256: digest,
    signature: signHexDigest(digest, getSigningKey(workspace, "config-signature")),
    signedTs: Date.now(),
    signer: "auditor" as const
  };
  const sigPath = `${filePath}.sig`;
  writeFileAtomic(sigPath, JSON.stringify(sig, null, 2), 0o644);
  return sigPath;
}

export function initIntegrationsConfig(workspace: string): {
  path: string;
  sigPath: string;
} {
  ensureDir(join(workspace, ".amc"));
  ensureVaultUnlocked(workspace);
  if (!getVaultSecret(workspace, "integrations/ops-webhook")) {
    setVaultSecret(workspace, "integrations/ops-webhook", randomUUID().replace(/-/g, ""));
  }
  const path = integrationsConfigPath(workspace);
  writeFileAtomic(path, YAML.stringify(defaultIntegrationsConfig()), 0o644);
  const sigPath = signConfig(workspace, path);
  return {
    path,
    sigPath
  };
}

/** Secret persistence can precede a later signer refusal; do not report it as rollback or zero effects. */
export class IntegrationsInitializationError extends Error {
  readonly code = "INTEGRATIONS_INITIALIZATION_INCOMPLETE";
  constructor(readonly secretWriteAttempted: boolean, readonly secretWriteReturned: boolean, cause: unknown) {
    super("integration initialization did not complete; inspect secret persistence and nested config publication before retrying", { cause });
    this.name = "IntegrationsInitializationError";
  }
}
/** Actual raw config-purpose successor; secret setup stays synchronous and no body precedes checked Sign. */
export async function initIntegrationsConfigAsync(workspace: string, beforePublish?: () => void): Promise<{ path: string; sigPath: string }> {
  const publicCurrent = capturePublicConfigAuthority(workspace);
  const caller = beforePublish, maySign = () => {
    publicCurrent();
    caller?.();
    if (process.env.AMC_NO_SIGN === "1") throw new Error("no-sign mode does not authorize integration config signing");
    publicCurrent();
  };
  maySign();
  const path = integrationsConfigPath(workspace), previous = captureOrgPairs([path]);
  const body = Buffer.from(YAML.stringify(defaultIntegrationsConfig())), secretKey = "integrations/ops-webhook";
  let secretWriteAttempted = false, secretWriteReturned = false;
  try {
    publicCurrent();
    ensureDir(join(workspace, ".amc")); ensureVaultUnlocked(workspace);
    publicCurrent();
    let selectedSecret = getVaultSecret(workspace, secretKey);
    if (!selectedSecret) {
      selectedSecret = randomUUID().replace(/-/g, "");
      publicCurrent();
      secretWriteAttempted = true;
      setVaultSecret(workspace, secretKey, selectedSecret); secretWriteReturned = true;
      publicCurrent();
    }
    const originalSecret = selectedSecret;
    const assertInputsCurrent = () => {
      maySign();
      if (!vaultStatus(workspace).unlocked || getVaultSecret(workspace, secretKey) !== originalSecret)
        throw new Error("integration secret authority changed while config signing was prepared");
      publicCurrent();
    };
    const pair = captureRawConfigPairForAsync(workspace, path, body, { previous, beforePublish: assertInputsCurrent });
    const prepared = await pair.prepare();
    const result = prepared.publish(); prepared.assertCurrent();
    return result;
  } catch (cause) {
    if (!secretWriteAttempted) throw cause;
    throw new IntegrationsInitializationError(secretWriteAttempted, secretWriteReturned, cause);
  }
}

export function loadIntegrationsConfig(workspace: string): IntegrationsConfig {
  const path = integrationsConfigPath(workspace);
  if (!pathExists(path)) {
    throw new Error(`Integrations config missing: ${path}`);
  }
  return integrationsConfigSchema.parse(YAML.parse(readUtf8(path)) as unknown);
}

export function verifyIntegrationsConfigSignature(workspace: string): {
  valid: boolean;
  signatureExists: boolean;
  reason: string | null;
  path: string;
  sigPath: string;
} {
  const path = integrationsConfigPath(workspace);
  const sigPath = integrationsConfigSigPath(workspace);
  if (!pathExists(path)) {
    return { valid: false, signatureExists: false, reason: "integrations config missing", path, sigPath };
  }
  if (!pathExists(sigPath)) {
    return { valid: false, signatureExists: false, reason: "integrations config signature missing", path, sigPath };
  }
  try {
    const sig = z
      .object({
        digestSha256: z.string().length(64),
        signature: z.string().min(1),
        signedTs: z.number().int(),
        signer: z.literal("auditor")
      })
      .parse(JSON.parse(readUtf8(sigPath)) as unknown);
    const digest = sha256Hex(readFileSync(path));
    if (digest !== sig.digestSha256) {
      return { valid: false, signatureExists: true, reason: "digest mismatch", path, sigPath };
    }
    const valid = verifyRawConfigSignature(workspace, digest, sig.signature);
    return {
      valid,
      signatureExists: true,
      reason: valid ? null : "signature verification failed",
      path,
      sigPath
    };
  } catch (error) {
    return {
      valid: false,
      signatureExists: true,
      reason: String(error),
      path,
      sigPath
    };
  }
}
