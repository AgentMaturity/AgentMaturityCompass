import { createPublicKey, sign as signEd25519, verify as verifyEd25519, type KeyObject } from "node:crypto";
import { join } from "node:path";
import { readFileSync, writeFileSync } from "node:fs";
import { ensureDir, pathExists } from "../utils/fs.js";
import { admittedListKeys, type TrustContext } from "../trust/index.js";
import type { LicenseTier } from "./tiers.js";

/** Same purpose as Industry Packs licences (src/domains/industryPackEntitlement.ts); a dedicated one is a follow-up. */
const LICENSE_PURPOSE = "artifact-seal";
const ENTERPRISE_LICENSE_NOT_CONFIGURED =
  "enterprise licence verification not configured: no licence signing key is pinned in the AMC trust list (purpose artifact-seal)";

const GRACE_PERIOD_DAYS = 7;
const LICENSE_FILE = "license.key";

/**
 * AMC-ENT-XXXX-XXXX-XXXX format regex.
 * Prefix determines tier: ENT=ENTERPRISE, PRO=PRO, COM=FREE.
 */
const LICENSE_FORMAT_RE = /^AMC-(ENT|PRO|COM)-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/;

const FORMAT_PREFIX_TO_TIER: Readonly<Record<string, LicenseTier>> = {
  ENT: "ENTERPRISE",
  PRO: "PRO",
  COM: "FREE"
};

export type LicenseStatus = "valid" | "grace" | "expired" | "invalid" | "not_configured";

export interface LicenseClaims {
  readonly licenseId: string;
  readonly tier: LicenseTier;
  readonly org: string;
  readonly issuedAt: string;
  readonly expiresAt: string;
  readonly features?: readonly string[];
}

export interface LicenseValidationResult {
  readonly valid: boolean;
  readonly status: LicenseStatus;
  readonly effectiveTier: LicenseTier;
  readonly claims: LicenseClaims | null;
  readonly graceDaysRemaining: number;
  readonly errors: readonly string[];
}

export interface LicenseActivationResult {
  readonly validation: LicenseValidationResult;
  readonly persisted: boolean;
  readonly path: string;
}

export interface LicenseStatusResult {
  readonly source: "file" | "none";
  readonly validation: LicenseValidationResult;
}

function toBase64Url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(str: string): Buffer {
  const normalized = str.replace(/-/g, "+").replace(/_/g, "/");
  const pad = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  return Buffer.from(`${normalized}${pad}`, "base64");
}

export interface LicenseFormatValidation {
  readonly valid: boolean;
  readonly tier: LicenseTier | null;
  readonly prefix: string | null;
  readonly errors: readonly string[];
}

export function validateLicenseKeyFormat(key: string): LicenseFormatValidation {
  const trimmed = key.trim();
  if (!LICENSE_FORMAT_RE.test(trimmed)) {
    return {
      valid: false,
      tier: null,
      prefix: null,
      errors: ["license key must match format AMC-{ENT|PRO|COM}-XXXX-XXXX-XXXX"]
    };
  }

  const prefix = trimmed.split("-")[1] ?? "";
  const tier = FORMAT_PREFIX_TO_TIER[prefix] ?? null;
  if (!tier) {
    return {
      valid: false,
      tier: null,
      prefix,
      errors: [`unknown tier prefix: ${prefix}`]
    };
  }

  return { valid: true, tier, prefix, errors: [] };
}

export function detectTierFromKey(key: string): LicenseTier {
  const format = validateLicenseKeyFormat(key);
  return format.tier ?? "FREE";
}

/** Ed25519 over the base64url payload: the only signature a pinned trust-list key can verify. */
export function createSignedLicenseKey(params: {
  privateKey: KeyObject;
  claims: LicenseClaims;
}): string {
  const payloadB64 = toBase64Url(Buffer.from(JSON.stringify(params.claims), "utf8"));
  return `${payloadB64}.${toBase64Url(signEd25519(null, Buffer.from(payloadB64, "utf8"), params.privateKey))}`;
}

function refused(status: "invalid" | "not_configured", error: string): LicenseValidationResult {
  return { valid: false, status, effectiveTier: "FREE", claims: null, graceDaysRemaining: 0, errors: [error] };
}

function signedBy(payloadB64: string, sigB64: string, publicKeyPem: string): boolean {
  try {
    return verifyEd25519(null, Buffer.from(payloadB64, "utf8"), createPublicKey(publicKeyPem), fromBase64Url(sigB64));
  } catch {
    return false;
  }
}

function isLicenseClaims(value: unknown): value is LicenseClaims {
  const record = (value ?? {}) as Record<string, unknown>;
  return typeof record.licenseId === "string" && typeof record.org === "string"
    && (record.tier === "FREE" || record.tier === "PRO" || record.tier === "ENTERPRISE")
    && typeof record.issuedAt === "string" && typeof record.expiresAt === "string" && Number.isFinite(Date.parse(record.expiresAt));
}

/**
 * Verifies against the keys the operator's signed trust list pins for artifact-seal, never a key the caller or the
 * licence supplies (P1-51). With no pinned key the answer is "not_configured", never a pretended verdict.
 */
function validateLicenseKey(params: {
  key: string;
  trust: TrustContext;
  now?: Date;
}): LicenseValidationResult {
  const now = params.now ?? new Date();
  const keys = admittedListKeys(params.trust, LICENSE_PURPOSE);
  if (keys.length === 0) return refused("not_configured", ENTERPRISE_LICENSE_NOT_CONFIGURED);
  const parts = params.key.trim().split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return refused("invalid", "malformed license key: expected payload.signature");
  const [payloadB64, sigB64] = parts as [string, string];
  if (!keys.some((pem) => signedBy(payloadB64, sigB64, pem))) {
    return refused("invalid", "signature does not match a pinned enterprise licence key");
  }

  let claims: LicenseClaims;
  try {
    const parsed = JSON.parse(fromBase64Url(payloadB64).toString("utf8")) as unknown;
    if (!isLicenseClaims(parsed)) return refused("invalid", "license claims are malformed");
    claims = parsed;
  } catch {
    return refused("invalid", "unable to parse license claims");
  }

  const expiresAt = new Date(claims.expiresAt);
  const msSinceExpiry = now.getTime() - expiresAt.getTime();

  if (msSinceExpiry <= 0) {
    return {
      valid: true,
      status: "valid",
      effectiveTier: claims.tier,
      claims,
      graceDaysRemaining: 0,
      errors: []
    };
  }

  const daysSinceExpiry = msSinceExpiry / (1000 * 60 * 60 * 24);
  if (daysSinceExpiry <= GRACE_PERIOD_DAYS) {
    const graceDaysRemaining = Math.ceil(GRACE_PERIOD_DAYS - daysSinceExpiry);
    return {
      valid: true,
      status: "grace",
      effectiveTier: claims.tier,
      claims,
      graceDaysRemaining,
      errors: []
    };
  }

  return {
    valid: false,
    status: "expired",
    effectiveTier: "FREE",
    claims,
    graceDaysRemaining: 0,
    errors: [`license expired and grace period (${GRACE_PERIOD_DAYS} days) has elapsed`]
  };
}

function licensePath(workspace: string): string {
  return join(workspace, ".amc", LICENSE_FILE);
}

/** Stores the key only when it verifies; a refused key is never written. */
export function activateLicenseKey(params: {
  workspace: string;
  key: string;
  trust: TrustContext;
  now?: Date;
}): LicenseActivationResult {
  const validation = validateLicenseKey({
    key: params.key,
    trust: params.trust,
    now: params.now
  });

  const filePath = licensePath(params.workspace);
  if (validation.valid) {
    ensureDir(join(params.workspace, ".amc"));
    writeFileSync(filePath, params.key.trim(), { mode: 0o600 });
  }

  return {
    validation,
    persisted: validation.valid,
    path: filePath
  };
}

export function getLicenseStatus(params: {
  workspace: string;
  trust: TrustContext;
  now?: Date;
}): LicenseStatusResult {
  const filePath = licensePath(params.workspace);
  if (admittedListKeys(params.trust, LICENSE_PURPOSE).length === 0) {
    return { source: pathExists(filePath) ? "file" : "none", validation: refused("not_configured", ENTERPRISE_LICENSE_NOT_CONFIGURED) };
  }
  if (!pathExists(filePath)) {
    return {
      source: "none",
      validation: {
        valid: false,
        status: "invalid",
        effectiveTier: "FREE",
        claims: null,
        graceDaysRemaining: 0,
        errors: ["no license file found"]
      }
    };
  }

  const key = readFileSync(filePath, "utf8").trim();
  const validation = validateLicenseKey({
    key,
    trust: params.trust,
    now: params.now
  });

  return {
    source: "file",
    validation
  };
}
