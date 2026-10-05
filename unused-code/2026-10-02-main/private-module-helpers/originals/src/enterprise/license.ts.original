import { createSign, createVerify, type KeyObject } from "node:crypto";
import { join } from "node:path";
import { readFileSync, writeFileSync } from "node:fs";
import { ensureDir, pathExists } from "../utils/fs.js";
import type { LicenseTier } from "./tiers.js";

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

export type LicenseStatus = "valid" | "grace" | "expired" | "invalid";

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

export function createSignedLicenseKey(params: {
  privateKey: KeyObject;
  claims: LicenseClaims;
}): string {
  const payload = JSON.stringify(params.claims);
  const payloadB64 = toBase64Url(Buffer.from(payload, "utf8"));
  const signer = createSign("SHA256");
  signer.update(payloadB64);
  signer.end();
  const sig = toBase64Url(signer.sign(params.privateKey));
  return `${payloadB64}.${sig}`;
}

export function validateLicenseKey(params: {
  key: string;
  publicKey: KeyObject;
  now?: Date;
}): LicenseValidationResult {
  const now = params.now ?? new Date();
  const parts = params.key.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return {
      valid: false,
      status: "invalid",
      effectiveTier: "FREE",
      claims: null,
      graceDaysRemaining: 0,
      errors: ["malformed license key: expected payload.signature"]
    };
  }

  const [payloadB64, sigB64] = parts as [string, string];

  const verifier = createVerify("SHA256");
  verifier.update(payloadB64);
  verifier.end();

  let sigValid: boolean;
  try {
    sigValid = verifier.verify(params.publicKey, fromBase64Url(sigB64));
  } catch {
    sigValid = false;
  }

  if (!sigValid) {
    return {
      valid: false,
      status: "invalid",
      effectiveTier: "FREE",
      claims: null,
      graceDaysRemaining: 0,
      errors: ["signature verification failed"]
    };
  }

  let claims: LicenseClaims;
  try {
    const parsed = JSON.parse(fromBase64Url(payloadB64).toString("utf8")) as unknown;
    claims = parsed as LicenseClaims;
  } catch {
    return {
      valid: false,
      status: "invalid",
      effectiveTier: "FREE",
      claims: null,
      graceDaysRemaining: 0,
      errors: ["unable to parse license claims"]
    };
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

export function activateLicenseKey(params: {
  workspace: string;
  key: string;
  publicKey: KeyObject;
  now?: Date;
}): LicenseActivationResult {
  const validation = validateLicenseKey({
    key: params.key,
    publicKey: params.publicKey,
    now: params.now
  });

  const filePath = licensePath(params.workspace);
  ensureDir(join(params.workspace, ".amc"));
  writeFileSync(filePath, params.key, { mode: 0o600 });

  return {
    validation,
    persisted: true,
    path: filePath
  };
}

export function getLicenseStatus(params: {
  workspace: string;
  publicKey: KeyObject;
  now?: Date;
}): LicenseStatusResult {
  const filePath = licensePath(params.workspace);
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
    publicKey: params.publicKey,
    now: params.now
  });

  return {
    source: "file",
    validation
  };
}
