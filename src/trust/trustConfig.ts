import { randomBytes } from "node:crypto";
import { request as httpRequest } from "node:http";
import { join, resolve } from "node:path";
import { z } from "zod";
import YAML from "yaml";
import { ensureDir, pathExists, readUtf8, writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { verifySignedFileWithAuditor } from "../org/orgSigner.js";
import { getVaultSecret, setVaultSecret } from "../vault/vault.js";
import { verifyNotaryAttestResponse } from "../notary/notaryVerify.js";
import { addPublicKeyToHistory } from "../crypto/keys.js";
import { buildNotaryAuthSignature } from "../notary/notaryAuth.js";
import { signDigestWithVault } from "../crypto/signing/signerVault.js";

function signTrustConfigWithVault(workspace: string, path: string): string {
  const digest = sha256Hex(Buffer.from(readUtf8(path), "utf8"));
  const signed = signDigestWithVault({
    workspace,
    kind: "BUNDLE",
    digestHex: digest
  });
  const sigPath = `${path}.sig`;
  writeFileAtomic(
    sigPath,
    JSON.stringify(
      {
        digestSha256: digest,
        signature: signed.signature,
        signedTs: signed.signedTs,
        signer: "auditor",
        envelope: signed.envelope
      },
      null,
      2
    ),
    0o644
  );
  return sigPath;
}

export const signKindValues = [
  "TRANSPARENCY_ROOT",
  "MERKLE_ROOT",
  "CERT",
  "BUNDLE",
  "BOM",
  "INSTALLED_LOCK",
  "RELEASE_MANIFEST",
  "BACKUP_MANIFEST",
  "ORG_SCORECARD",
  "TRANSFORM_PLAN",
  "COMPLIANCE_MAPS",
  "OPS_POLICY"
] as const;

export type SignKind = (typeof signKindValues)[number];

export const trustConfigSchema = z.object({
  trust: z.object({
    version: z.literal(1),
    mode: z.enum(["LOCAL_VAULT", "NOTARY"]),
    notary: z.object({
      baseUrl: z.string().min(1),
      unixSocketPath: z.string().min(1).nullable(),
      pinnedPubkeyFingerprint: z.string().length(64),
      auth: z.object({
        secretRef: z.string().startsWith("vault:"),
        headerName: z.string().min(1),
        hmacAlg: z.literal("sha256")
      }),
      requiredAttestationLevel: z.enum(["SOFTWARE", "HARDWARE"]),
      allowedSignKinds: z.array(z.enum(signKindValues)).default([...signKindValues])
    }),
    enforcement: z.object({
      requireNotaryFor: z.array(z.enum(signKindValues)).default([
        "TRANSPARENCY_ROOT",
        "MERKLE_ROOT",
        "CERT",
        "INSTALLED_LOCK",
        "RELEASE_MANIFEST",
        "BACKUP_MANIFEST"
      ]),
      denyLocalVaultSigningIfNotaryEnabled: z.boolean().default(true),
      notaryMaxClockSkewSeconds: z.number().int().positive().default(120)
    })
  })
});

export type TrustConfig = z.infer<typeof trustConfigSchema>;

function trustDir(workspace: string): string {
  return join(workspace, ".amc");
}

export function trustConfigPath(workspace: string): string {
  return join(trustDir(workspace), "trust.yaml");
}

export function trustConfigSigPath(workspace: string): string {
  return `${trustConfigPath(workspace)}.sig`;
}

function defaultTrustConfig(): TrustConfig {
  return trustConfigSchema.parse({
    trust: {
      version: 1,
      mode: "LOCAL_VAULT",
      notary: {
        baseUrl: "http://127.0.0.1:4343",
        unixSocketPath: null,
        pinnedPubkeyFingerprint: "0".repeat(64),
        auth: {
          secretRef: "vault:notary/auth",
          headerName: "x-amc-notary-auth",
          hmacAlg: "sha256"
        },
        requiredAttestationLevel: "SOFTWARE",
        allowedSignKinds: [...signKindValues]
      },
      enforcement: {
        requireNotaryFor: [
          "TRANSPARENCY_ROOT",
          "MERKLE_ROOT",
          "CERT",
          "INSTALLED_LOCK",
          "RELEASE_MANIFEST",
          "BACKUP_MANIFEST"
        ],
        denyLocalVaultSigningIfNotaryEnabled: true,
        notaryMaxClockSkewSeconds: 120
      }
    }
  });
}

export function loadTrustConfig(workspace: string): TrustConfig {
  const path = trustConfigPath(workspace);
  if (!pathExists(path)) {
    return defaultTrustConfig();
  }
  return trustConfigSchema.parse(YAML.parse(readUtf8(path)) as unknown);
}

export function initTrustConfig(workspace: string): {
  path: string;
  sigPath: string;
  config: TrustConfig;
} {
  ensureDir(trustDir(workspace));
  const path = trustConfigPath(workspace);
  const config = defaultTrustConfig();
  writeFileAtomic(path, YAML.stringify(config), 0o644);
  const sigPath = signTrustConfigWithVault(workspace, path);
  return { path, sigPath, config };
}

function saveTrustConfig(workspace: string, config: TrustConfig): {
  path: string;
  sigPath: string;
} {
  const path = trustConfigPath(workspace);
  ensureDir(trustDir(workspace));
  writeFileAtomic(path, YAML.stringify(trustConfigSchema.parse(config)), 0o644);
  return {
    path,
    sigPath: signTrustConfigWithVault(workspace, path)
  };
}

export function verifyTrustConfigSignature(workspace: string): {
  valid: boolean;
  signatureExists: boolean;
  reason: string | null;
  path: string;
  sigPath: string;
} {
  return verifySignedFileWithAuditor(workspace, trustConfigPath(workspace));
}

async function httpJsonGet(params: {
  baseUrl: string;
  unixSocketPath: string | null;
  path: string;
  headers?: Record<string, string>;
}): Promise<{ status: number; body: string }> {
  return new Promise((resolvePromise) => {
    const url = new URL(params.path, params.baseUrl);
    const req = httpRequest(
      params.unixSocketPath
        ? {
            socketPath: params.unixSocketPath,
            path: params.path,
            method: "GET",
            headers: params.headers
          }
        : {
            method: "GET",
            hostname: url.hostname,
            port: Number(url.port || "80"),
            path: `${url.pathname}${url.search}`,
            headers: params.headers
          },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
        res.on("end", () => {
          resolvePromise({
            status: res.statusCode ?? 0,
            body: Buffer.concat(chunks).toString("utf8")
          });
        });
      }
    );
    req.on("error", () => resolvePromise({ status: 0, body: "" }));
    req.end();
  });
}

export async function checkNotaryTrust(workspace: string): Promise<{
  mode: "LOCAL_VAULT" | "NOTARY";
  ok: boolean;
  reasons: string[];
  signatureValid: boolean;
  notaryReachable: boolean;
  pinnedFingerprint: string | null;
  currentFingerprint: string | null;
  attestationLevel: "SOFTWARE" | "HARDWARE" | null;
  requiredAttestationLevel: "SOFTWARE" | "HARDWARE" | null;
  lastAttestationTs: number | null;
}> {
  const sig = verifyTrustConfigSignature(workspace);
  const config = loadTrustConfig(workspace);
  const out = {
    mode: config.trust.mode,
    ok: true,
    reasons: [] as string[],
    signatureValid: sig.valid,
    notaryReachable: false,
    pinnedFingerprint: config.trust.mode === "NOTARY" ? config.trust.notary.pinnedPubkeyFingerprint : null,
    currentFingerprint: null as string | null,
    attestationLevel: null as "SOFTWARE" | "HARDWARE" | null,
    requiredAttestationLevel: config.trust.mode === "NOTARY" ? config.trust.notary.requiredAttestationLevel : null,
    lastAttestationTs: null as number | null
  };
  if (!sig.valid) {
    out.ok = false;
    out.reasons.push(`TRUST_CONFIG_UNTRUSTED: ${sig.reason ?? "unknown"}`);
    return out;
  }
  if (config.trust.mode !== "NOTARY") {
    return out;
  }
  const ready = await httpJsonGet({
    baseUrl: config.trust.notary.baseUrl,
    unixSocketPath: config.trust.notary.unixSocketPath,
    path: "/readyz"
  });
  if (ready.status < 200 || ready.status >= 300) {
    out.ok = false;
    out.reasons.push("NOTARY_UNREACHABLE");
    return out;
  }
  out.notaryReachable = true;
  const pub = await httpJsonGet({
    baseUrl: config.trust.notary.baseUrl,
    unixSocketPath: config.trust.notary.unixSocketPath,
    path: "/pubkey"
  });
  if (pub.status < 200 || pub.status >= 300) {
    out.ok = false;
    out.reasons.push("NOTARY_PUBKEY_UNAVAILABLE");
    return out;
  }
  try {
    const parsed = JSON.parse(pub.body) as { pubkeyPem?: string; fingerprint?: string };
    const currentFpr = typeof parsed.fingerprint === "string"
      ? parsed.fingerprint
      : typeof parsed.pubkeyPem === "string"
        ? sha256Hex(Buffer.from(parsed.pubkeyPem, "utf8"))
        : null;
    out.currentFingerprint = currentFpr;
    if (!currentFpr || currentFpr !== config.trust.notary.pinnedPubkeyFingerprint) {
      out.ok = false;
      out.reasons.push("NOTARY_KEY_MISMATCH");
      return out;
    }
  } catch {
    out.ok = false;
    out.reasons.push("NOTARY_PUBKEY_PARSE_FAILED");
    return out;
  }
  const att = await httpJsonGet({
    baseUrl: config.trust.notary.baseUrl,
    unixSocketPath: config.trust.notary.unixSocketPath,
    path: "/attest/current"
  });
  if (att.status < 200 || att.status >= 300) {
    out.ok = false;
    out.reasons.push("NOTARY_ATTESTATION_UNAVAILABLE");
    return out;
  }
  const verified = verifyNotaryAttestResponse(JSON.parse(att.body) as unknown);
  if (!verified.ok || !verified.parsed) {
    out.ok = false;
    out.reasons.push(`NOTARY_ATTESTATION_INVALID: ${verified.error ?? "unknown"}`);
    return out;
  }
  out.attestationLevel = verified.parsed.attestation.notary.attestationLevel;
  out.lastAttestationTs = verified.parsed.attestation.ts;
  if (verified.parsed.pubkeyFingerprint !== config.trust.notary.pinnedPubkeyFingerprint) {
    out.ok = false;
    out.reasons.push("NOTARY_ATTESTATION_FINGERPRINT_MISMATCH");
  }
  if (config.trust.notary.requiredAttestationLevel === "HARDWARE" && out.attestationLevel !== "HARDWARE") {
    out.ok = false;
    out.reasons.push("NOTARY_ATTESTATION_LEVEL_INSUFFICIENT");
  }
  const skew = Math.abs(Date.now() - (out.lastAttestationTs ?? 0));
  if (skew > config.trust.enforcement.notaryMaxClockSkewSeconds * 1000) {
    out.ok = false;
    out.reasons.push("NOTARY_ATTESTATION_CLOCK_SKEW");
  }
  return out;
}

export async function enableNotaryTrust(params: {
  workspace: string;
  baseUrl: string;
  pinPubkeyPath: string;
  requiredAttestationLevel: "SOFTWARE" | "HARDWARE";
  unixSocketPath?: string | null;
}): Promise<{
  path: string;
  sigPath: string;
  fingerprint: string;
}> {
  const pubPath = resolve(params.pinPubkeyPath);
  if (!pathExists(pubPath)) {
    throw new Error(`notary pubkey file missing: ${pubPath}`);
  }
  const pubPem = readUtf8(pubPath);
  const fingerprint = sha256Hex(Buffer.from(pubPem, "utf8"));
  let authSecret = getVaultSecret(params.workspace, "notary/auth");
  if (!authSecret) {
    authSecret = randomBytes(32).toString("base64");
    setVaultSecret(params.workspace, "notary/auth", authSecret);
  }
  const current = loadTrustConfig(params.workspace);
  const next = trustConfigSchema.parse({
    trust: {
      ...current.trust,
      mode: "NOTARY",
      notary: {
        ...current.trust.notary,
        baseUrl: params.baseUrl,
        unixSocketPath: params.unixSocketPath ?? null,
        pinnedPubkeyFingerprint: fingerprint,
        auth: {
          secretRef: "vault:notary/auth",
          headerName: "x-amc-notary-auth",
          hmacAlg: "sha256"
        },
        requiredAttestationLevel: params.requiredAttestationLevel
      }
    }
  });
  // Admit the key only once the config it belongs to is durably saved and
  // signed. Doing it first meant a failure in saveTrustConfig — an unwritable
  // trust directory, a locked vault at the signing step — left the auditor
  // trust set permanently widened for a notary that was never enabled. There
  // is no revocation path, so that widening would have been silent and final.
  const saved = saveTrustConfig(params.workspace, next);
  addPublicKeyToHistory(params.workspace, "auditor", pubPem, "notary");
  return {
    path: saved.path,
    sigPath: saved.sigPath,
    fingerprint
  };
}

export function shouldRequireNotaryForKind(workspace: string, kind: SignKind): boolean {
  const config = loadTrustConfig(workspace);
  return config.trust.mode === "NOTARY" && config.trust.enforcement.requireNotaryFor.includes(kind);
}

export function resolveNotaryAuthSecret(workspace: string, secretRef: string): string {
  if (!secretRef.startsWith("vault:")) {
    throw new Error(`unsupported notary auth secretRef: ${secretRef}`);
  }
  const key = secretRef.slice("vault:".length);
  const value = getVaultSecret(workspace, key);
  if (!value || value.length === 0) {
    throw new Error(`vault secret missing: ${secretRef}`);
  }
  return value;
}

export async function fetchNotaryLogTail(params: {
  workspace: string;
  limit?: number;
}): Promise<{
  ok: boolean;
  status: number;
  entries: Array<Record<string, unknown>>;
  error: string | null;
}> {
  const config = loadTrustConfig(params.workspace);
  if (config.trust.mode !== "NOTARY") {
    return {
      ok: false,
      status: 400,
      entries: [],
      error: "trust mode is not NOTARY"
    };
  }
  const ts = Date.now();
  const authSecret = resolveNotaryAuthSecret(params.workspace, config.trust.notary.auth.secretRef);
  const auth = buildNotaryAuthSignature({
    secret: authSecret,
    ts,
    method: "GET",
    path: "/log/tail",
    bodyBytes: Buffer.alloc(0)
  });
  const res = await httpJsonGet({
    baseUrl: config.trust.notary.baseUrl,
    unixSocketPath: config.trust.notary.unixSocketPath,
    path: `/log/tail?limit=${Math.max(1, Math.min(200, Math.trunc(params.limit ?? 20)))}`,
    headers: {
      [config.trust.notary.auth.headerName]: auth,
      "x-amc-notary-ts": String(ts)
    }
  });
  if (res.status < 200 || res.status >= 300) {
    return {
      ok: false,
      status: res.status,
      entries: [],
      error: res.body
    };
  }
  try {
    const parsed = JSON.parse(res.body) as { entries?: Array<Record<string, unknown>> };
    return {
      ok: true,
      status: res.status,
      entries: Array.isArray(parsed.entries) ? parsed.entries : [],
      error: null
    };
  } catch (error) {
    return {
      ok: false,
      status: res.status,
      entries: [],
      error: String(error)
    };
  }
}
