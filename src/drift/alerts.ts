import { randomBytes } from "node:crypto";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import YAML from "yaml";
import { z } from "zod";
import { getSigningKey, getPublicKeyPem, signHexDigest, verifyHexDigestAny } from "../crypto/keys.js";
import { assertKeysetComplete, boundProviderKey, keysetDeclared } from "../keys/keyset.js";
import { getPurposeKeyHistory, readHistory } from "../keys/signingKeys.js";
import { getVaultSecret, setVaultSecret } from "../vault/vault.js";
import { checkScopedEgress } from "../residency/checkEgress.js";
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

function alertsPath(workspace: string): string {
  return join(workspace, ".amc", "alerts.yaml");
}

function alertsSigPath(workspace: string): string {
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
  const signature = signHexDigest(digest, getSigningKey(workspace, "config-signature"));
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

function captureAlertsPair(workspace: string): { bytes: Buffer; assertCurrent(): void } {
  const path = alertsPath(workspace), sigPath = alertsSigPath(workspace);
  let bytes: Buffer, sidecar: Buffer;
  try { bytes = readFileSync(path); sidecar = readFileSync(sigPath); }
  catch (cause) { throw new Error("alerts configuration pair is unreadable", { cause }); }
  const payload = JSON.parse(sidecar.toString("utf8")) as SignedDigest;
  if (sha256Hex(bytes) !== payload.digestSha256) throw new Error("digest mismatch");
  assertKeysetComplete(workspace);
  const keys = getPurposeKeyHistory(workspace, "config-signature");
  if (keysetDeclared(workspace) && boundProviderKey(workspace, "config-signature") === null) {
    const history = readHistory(workspace, "auditor", getPublicKeyPem(workspace, "auditor"));
    keys.push(...(history?.entries.filter(entry => entry.source === "imported").map(entry => entry.publicKeyPem) ?? []));
  }
  if (typeof payload.signature !== "string" || !verifyHexDigestAny(payload.digestSha256, payload.signature, keys))
    throw new Error("signature verification failed");
  return { bytes, assertCurrent() {
    let current: Buffer, signature: Buffer;
    try { current = readFileSync(path); signature = readFileSync(sigPath); }
    catch (cause) { throw new Error("alerts configuration pair changed or became unreadable while freeze signing was prepared", { cause }); }
    if (!bytes.equals(current) || !sidecar.equals(signature)) throw new Error("alerts configuration changed while freeze signing was prepared");
  } };
}

/** Internal same-read decision input; public signature verification does not newly require parsed YAML. */
export function captureVerifiedAlertsConfig(workspace: string): { config: AlertsConfig; assertCurrent(): void } {
  const pair = captureAlertsPair(workspace);
  return { config: alertsSchema.parse(YAML.parse(pair.bytes.toString("utf8")) as unknown), assertCurrent: pair.assertCurrent };
}

export function verifyAlertsConfigSignature(workspace: string): { valid: boolean; signatureExists: boolean; reason: string | null } {
  if (!pathExists(alertsPath(workspace))) return { valid: false, signatureExists: false, reason: "alerts config missing" };
  if (!pathExists(alertsSigPath(workspace))) return { valid: false, signatureExists: false, reason: "alerts signature missing" };
  try { captureAlertsPair(workspace); return { valid: true, signatureExists: true, reason: null }; }
  catch (error) { return { valid: false, signatureExists: true, reason: String(error) }; }
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

async function postWebhook(workspace: string, agentId: string, url: string, body: string, secret: string): Promise<void> {
  const parsed = new URL(url);
  const requestImpl = parsed.protocol === "https:" ? httpsRequest : httpRequest;
  const options = {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "content-length": Buffer.byteLength(body),
      "x-amc-alert-secret": secret
    }
  };
  await new Promise<void>((resolvePromise, rejectPromise) => {
    checkScopedEgress(workspace, "callback", parsed.href, { agentId, dataClasses: null, purpose: null });
    const req = requestImpl(
      parsed,
      options,
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
  const capturedWorkspace = workspace.trim() ? resolve(workspace) : workspace;
  const agentId = payload.agentId;
  const config = captureVerifiedAlertsConfig(capturedWorkspace).config;
  const body = JSON.stringify(payload);
  for (const channel of config.alerts.channels) {
    const secret = getVaultSecret(capturedWorkspace, secretKeyFromRef(channel.secretRef));
    if (!secret) {
      throw new Error(`missing vault secret for channel ${channel.name}`);
    }
    await postWebhook(capturedWorkspace, agentId, channel.url, body, secret);
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
