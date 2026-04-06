import { randomBytes } from "node:crypto";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import { z } from "zod";
import { getPrivateKeyPem, getPublicKeyHistory, signHexDigest, verifyHexDigestAny } from "../crypto/keys.js";
import { getVaultSecret, setVaultSecret } from "../vault/vault.js";
import { ensureDir, pathExists, writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";

const alertsSchema = z.object({
  alerts: z.object({
    version: z.literal(1),
    channels: z.array(
      z.object({
        type: z.literal("webhook"),
        name: z.string().min(1),
        url: z.string().url(),
        secretRef: z.string().min(1)
      })
    ),
    rules: z.array(
      z.object({
        id: z.string().min(1),
        when: z.object({
          overallDropGte: z.number().min(0),
          layerDropGte: z.number().min(0),
          integrityDropGte: z.number().min(0),
          correlationDropBelow: z.number().min(0).max(1),
          assuranceDropBelow: z.record(z.string(), z.number().min(0).max(100)).default({})
        }),
        actions: z.array(z.enum(["ALERT_OWNER", "FREEZE_EXECUTE", "CREATE_INCIDENT"])).min(1),
        freezeActionClasses: z
          .array(
            z.enum([
              "READ_ONLY",
              "WRITE_LOW",
              "WRITE_HIGH",
              "DEPLOY",
              "SECURITY",
              "FINANCIAL",
              "NETWORK_EXTERNAL",
              "DATA_EXPORT",
              "IDENTITY"
            ])
          )
          .optional()
      })
    )
  })
});

export type AlertsConfig = z.infer<typeof alertsSchema>;

interface SignedDigest {
  digestSha256: string;
  signature: string;
  signedTs: number;
  signer: "auditor";
}

export function alertsPath(workspace: string): string {
  return join(workspace, ".amc", "alerts.yaml");
}

export function alertsSigPath(workspace: string): string {
  return `${alertsPath(workspace)}.sig`;
}

export function defaultAlertsConfig(): AlertsConfig {
  return alertsSchema.parse({
    alerts: {
      version: 1,
      channels: [
        {
          type: "webhook",
          name: "local-dev",
          url: "http://127.0.0.1:9999/webhook",
          secretRef: "vault:alerts/local-dev"
        }
      ],
      rules: [
        {
          id: "maturity-regression",
          when: {
            overallDropGte: 0.5,
            layerDropGte: 0.7,
            integrityDropGte: 0.15,
            correlationDropBelow: 0.9,
            assuranceDropBelow: {
              injection: 80,
              hallucination: 80
            }
          },
          actions: ["ALERT_OWNER", "FREEZE_EXECUTE", "CREATE_INCIDENT"],
          freezeActionClasses: ["DEPLOY", "WRITE_HIGH", "SECURITY"]
        }
      ]
    }
  });
}

export function loadAlertsConfig(workspace: string): AlertsConfig {
  const path = alertsPath(workspace);
  if (!pathExists(path)) {
    throw new Error(`Alerts config not found: ${path}`);
  }
  return alertsSchema.parse(YAML.parse(readFileSync(path, "utf8")) as unknown);
}

export function signAlertsConfig(workspace: string): string {
  const path = alertsPath(workspace);
  const digest = sha256Hex(readFileSync(path));
  const signature = signHexDigest(digest, getPrivateKeyPem(workspace, "auditor"));
  const payload: SignedDigest = {
    digestSha256: digest,
    signature,
    signedTs: Date.now(),
    signer: "auditor"
  };
  const sigPath = alertsSigPath(workspace);
  writeFileAtomic(sigPath, JSON.stringify(payload, null, 2), 0o644);
  return sigPath;
}

export function verifyAlertsConfigSignature(workspace: string): {
  valid: boolean;
  signatureExists: boolean;
  reason: string | null;
} {
  const path = alertsPath(workspace);
  const sigPath = alertsSigPath(workspace);
  if (!pathExists(path)) {
    return { valid: false, signatureExists: false, reason: "alerts config missing" };
  }
  if (!pathExists(sigPath)) {
    return { valid: false, signatureExists: false, reason: "alerts signature missing" };
  }
  try {
    const payload = JSON.parse(readFileSync(sigPath, "utf8")) as SignedDigest;
    const digest = sha256Hex(readFileSync(path));
    if (digest !== payload.digestSha256) {
      return { valid: false, signatureExists: true, reason: "digest mismatch" };
    }
    const valid = verifyHexDigestAny(digest, payload.signature, getPublicKeyHistory(workspace, "auditor"));
    return {
      valid,
      signatureExists: true,
      reason: valid ? null : "signature verification failed"
    };
  } catch (error) {
    return {
      valid: false,
      signatureExists: true,
      reason: String(error)
    };
  }
}

function secretKeyFromRef(ref: string): string {
  if (!ref.startsWith("vault:")) {
    throw new Error(`Unsupported secret ref: ${ref}`);
  }
  return ref.slice("vault:".length);
}

export function initAlertsConfig(workspace: string): { configPath: string; sigPath: string } {
  ensureDir(join(workspace, ".amc"));
  const path = alertsPath(workspace);
  const config = defaultAlertsConfig();
  for (const channel of config.alerts.channels) {
    const secret = randomBytes(16).toString("hex");
    setVaultSecret(workspace, secretKeyFromRef(channel.secretRef), secret);
  }
  writeFileAtomic(path, YAML.stringify(config), 0o644);
  const sigPath = signAlertsConfig(workspace);
  return {
    configPath: path,
    sigPath
  };
}

export interface AlertPayload {
  type: "AMC_ALERT";
  ruleId: string;
  agentId: string;
  runId: string;
  summary: string;
  links: {
    dashboard: string;
    report: string;
  };
  hashes: {
    reportSha256: string;
    bundleSha256: string;
  };
}

async function postWebhook(url: string, body: string, secret: string): Promise<void> {
  const parsed = new URL(url);
  const requestImpl = parsed.protocol === "https:" ? httpsRequest : httpRequest;
  await new Promise<void>((resolvePromise, rejectPromise) => {
    const req = requestImpl(
      parsed,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "content-length": Buffer.byteLength(body),
          "x-amc-alert-secret": secret
        }
      },
      (res) => {
        const status = res.statusCode ?? 500;
        if (status >= 200 && status < 300) {
          resolvePromise();
          return;
        }
        rejectPromise(new Error(`alert webhook failed with HTTP ${status}`));
      }
    );
    req.on("error", rejectPromise);
    req.write(body);
    req.end();
  });
}

export async function dispatchAlert(workspace: string, payload: AlertPayload): Promise<void> {
  const config = loadAlertsConfig(workspace);
  const verify = verifyAlertsConfigSignature(workspace);
  if (!verify.valid) {
    throw new Error(`alerts config signature invalid: ${verify.reason ?? "unknown"}`);
  }
  const body = JSON.stringify(payload);
  for (const channel of config.alerts.channels) {
    const secret = getVaultSecret(workspace, secretKeyFromRef(channel.secretRef));
    if (!secret) {
      throw new Error(`missing vault secret for channel ${channel.name}`);
    }
    await postWebhook(channel.url, body, secret);
  }
}

export async function sendTestAlert(workspace: string): Promise<void> {
  const payload: AlertPayload = {
    type: "AMC_ALERT",
    ruleId: "test-alert",
    agentId: "default",
    runId: "test",
    summary: "AMC alert test payload",
    links: {
      dashboard: "http://127.0.0.1:4173",
      report: ".amc/reports/latest.md"
    },
    hashes: {
      reportSha256: sha256Hex("test-report"),
      bundleSha256: sha256Hex("test-bundle")
    }
  };
  await dispatchAlert(workspace, payload);
}
