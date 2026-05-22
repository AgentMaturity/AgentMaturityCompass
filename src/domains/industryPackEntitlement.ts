import { createHmac, timingSafeEqual } from "node:crypto";
import { join } from "node:path";
import { sha256Hex } from "../utils/hash.js";
import { ensureDir, pathExists, readUtf8, writeFileAtomic } from "../utils/fs.js";
import type { IndustryPack } from "./industryPacks.js";

export const INDUSTRY_PACKS_PLAN_ID = "industry-packs-monthly";
export const INDUSTRY_PACKS_MONTHLY_PRICE_USD = "9.99";
export const INDUSTRY_PACKS_ACCESS_FILE = "industry-packs-access.json";
export const INDUSTRY_PACKS_PUBLIC_COUNT = 40;
export const INDUSTRY_PACKS_LICENSE_PREFIX = "AMC-INDUSTRY-PACKS";
export const INDUSTRY_PACKS_DEFAULT_CHECKOUT_URL = "https://agentmaturity.co/pricing#industry-packs";
export const INDUSTRY_PACKS_DEFAULT_VERIFY_URL = "https://agentmaturity.co/api/industry-packs/license/verify";

export type IndustryPackLicenseStatus = "active" | "trialing" | "past_due" | "canceled";

export interface IndustryPackLicensePayload {
  v: 1;
  planId: string;
  status: IndustryPackLicenseStatus;
  issuedAt: string;
  expiresAt: string | null;
  customerId?: string;
  subscriptionId?: string;
  emailHash?: string;
}

export interface IndustryPackEntitlement {
  active: boolean;
  source: "env" | "file" | "none";
  planId: string;
  priceUsdMonthly: string;
  checkoutUrl: string;
  expiresAt: string | null;
  customerId?: string;
  subscriptionId?: string;
  licenseStatus?: IndustryPackLicenseStatus;
  message: string;
}

export interface IndustryPackCatalogItem {
  packId: string;
  name: string;
  domain: string;
  riskLevel: string;
  questionCount: number;
  locked: boolean;
  description: string;
  regulatoryBasis?: string[];
  complianceFrameworks?: string[];
}

interface StoredEntitlement {
  active?: boolean;
  planId?: string;
  expiresAt?: string | null;
  licenseKeySha256?: string;
  activatedAt?: string;
  customerId?: string;
  subscriptionId?: string;
  licenseStatus?: IndustryPackLicenseStatus;
}

export class IndustryPackAccessError extends Error {
  readonly entitlement: IndustryPackEntitlement;

  constructor(entitlement: IndustryPackEntitlement) {
    super(formatIndustryPackPaywallMessage(entitlement));
    this.name = "IndustryPackAccessError";
    this.entitlement = entitlement;
  }
}

function isTruthy(value: string | undefined): boolean {
  if (!value) {
    return false;
  }
  return new Set(["1", "true", "yes", "on"]).has(value.trim().toLowerCase());
}

function checkoutUrl(env: NodeJS.ProcessEnv): string {
  return env.AMC_INDUSTRY_PACKS_CHECKOUT_URL
    ?? env.AMC_DOMAIN_PACKS_CHECKOUT_URL
    ?? INDUSTRY_PACKS_DEFAULT_CHECKOUT_URL;
}

function licenseSecret(env: NodeJS.ProcessEnv): string | null {
  return env.AMC_INDUSTRY_PACKS_LICENSE_SECRET
    ?? env.AMC_DOMAIN_PACKS_LICENSE_SECRET
    ?? null;
}

function entitlementPath(workspace: string): string {
  return join(workspace, ".amc", INDUSTRY_PACKS_ACCESS_FILE);
}

function parseStoredEntitlement(workspace: string): StoredEntitlement | null {
  const file = entitlementPath(workspace);
  if (!pathExists(file)) {
    return null;
  }
  try {
    const parsed = JSON.parse(readUtf8(file)) as StoredEntitlement;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function isNotExpired(expiresAt: string | null | undefined, now = Date.now()): boolean {
  if (!expiresAt) {
    return true;
  }
  const ts = Date.parse(expiresAt);
  return Number.isFinite(ts) && ts > now;
}

export function validLegacyIndustryPackLicenseKey(value: string): boolean {
  return /^AMC-(INDUSTRY|DOMAIN)-PACKS-[A-Z0-9_-]{8,}$/i.test(value.trim());
}

function base64UrlJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function parseBase64UrlJson(value: string): unknown {
  return JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as unknown;
}

function signatureFor(payloadPart: string, secret: string): string {
  return createHmac("sha256", secret)
    .update(payloadPart)
    .digest("base64url");
}

function constantTimeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  return left.length === right.length && timingSafeEqual(left, right);
}

function isLicensePayload(value: unknown): value is IndustryPackLicensePayload {
  if (!value || typeof value !== "object") {
    return false;
  }
  const record = value as Record<string, unknown>;
  return record.v === 1
    && record.planId === INDUSTRY_PACKS_PLAN_ID
    && typeof record.status === "string"
    && ["active", "trialing", "past_due", "canceled"].includes(record.status)
    && typeof record.issuedAt === "string"
    && (typeof record.expiresAt === "string" || record.expiresAt === null)
    && (record.customerId === undefined || typeof record.customerId === "string")
    && (record.subscriptionId === undefined || typeof record.subscriptionId === "string")
    && (record.emailHash === undefined || typeof record.emailHash === "string");
}

export function createIndustryPackLicenseKey(params: {
  customerId?: string;
  subscriptionId?: string;
  email?: string;
  status?: IndustryPackLicenseStatus;
  issuedAt?: string;
  expiresAt?: string | null;
  env?: NodeJS.ProcessEnv;
}): string {
  const env = params.env ?? process.env;
  const secret = licenseSecret(env);
  if (!secret) {
    throw new Error("AMC_INDUSTRY_PACKS_LICENSE_SECRET is required to issue Industry Packs licenses.");
  }
  const payload: IndustryPackLicensePayload = {
    v: 1,
    planId: INDUSTRY_PACKS_PLAN_ID,
    status: params.status ?? "active",
    issuedAt: params.issuedAt ?? new Date().toISOString(),
    expiresAt: params.expiresAt ?? null,
    ...(params.customerId ? { customerId: params.customerId } : {}),
    ...(params.subscriptionId ? { subscriptionId: params.subscriptionId } : {}),
    ...(params.email ? { emailHash: sha256Hex(params.email.trim().toLowerCase()) } : {})
  };
  const payloadPart = base64UrlJson(payload);
  return `${INDUSTRY_PACKS_LICENSE_PREFIX}.${payloadPart}.${signatureFor(payloadPart, secret)}`;
}

export function verifyIndustryPackLicenseKey(
  licenseKey: string,
  env: NodeJS.ProcessEnv = process.env,
  now = Date.now()
): { valid: boolean; payload: IndustryPackLicensePayload | null; reason?: string } {
  const key = licenseKey.trim();
  if (validLegacyIndustryPackLicenseKey(key)) {
    return { valid: true, payload: null };
  }
  const [prefix, payloadPart, signaturePart] = key.split(".");
  if (prefix !== INDUSTRY_PACKS_LICENSE_PREFIX || !payloadPart || !signaturePart) {
    return { valid: false, payload: null, reason: "invalid license format" };
  }
  const secret = licenseSecret(env);
  if (!secret) {
    return { valid: false, payload: null, reason: "license verification secret is not configured" };
  }
  const expected = signatureFor(payloadPart, secret);
  if (!constantTimeEqual(expected, signaturePart)) {
    return { valid: false, payload: null, reason: "license signature mismatch" };
  }
  let payload: unknown;
  try {
    payload = parseBase64UrlJson(payloadPart);
  } catch {
    return { valid: false, payload: null, reason: "license payload is invalid" };
  }
  if (!isLicensePayload(payload)) {
    return { valid: false, payload: null, reason: "license payload is not an Industry Packs entitlement" };
  }
  if (payload.status === "canceled") {
    return { valid: false, payload, reason: "license subscription is canceled" };
  }
  if (!isNotExpired(payload.expiresAt, now)) {
    return { valid: false, payload, reason: "license has expired" };
  }
  return { valid: true, payload };
}

export function buildIndustryPackCheckoutUrl(params: {
  successUrl?: string;
  cancelUrl?: string;
  customerEmail?: string;
  clientReferenceId?: string;
  env?: NodeJS.ProcessEnv;
} = {}): string {
  const env = params.env ?? process.env;
  const raw = checkoutUrl(env);
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return raw;
  }
  parsed.searchParams.set("plan", INDUSTRY_PACKS_PLAN_ID);
  parsed.searchParams.set("price", INDUSTRY_PACKS_MONTHLY_PRICE_USD);
  if (params.successUrl) parsed.searchParams.set("success_url", params.successUrl);
  if (params.cancelUrl) parsed.searchParams.set("cancel_url", params.cancelUrl);
  if (params.customerEmail) parsed.searchParams.set("customer_email", params.customerEmail);
  if (params.clientReferenceId) parsed.searchParams.set("client_reference_id", params.clientReferenceId);
  return parsed.toString();
}

export function getIndustryPackEntitlement(
  workspace = process.cwd(),
  env: NodeJS.ProcessEnv = process.env
): IndustryPackEntitlement {
  const url = checkoutUrl(env);
  const base = {
    planId: INDUSTRY_PACKS_PLAN_ID,
    priceUsdMonthly: INDUSTRY_PACKS_MONTHLY_PRICE_USD,
    checkoutUrl: url,
    expiresAt: null as string | null
  };

  if (
    isTruthy(env.AMC_INDUSTRY_PACKS_ACTIVE)
    || isTruthy(env.AMC_DOMAIN_PACKS_ACTIVE)
  ) {
    return {
      ...base,
      active: true,
      source: "env",
      message: `Industry Packs active via environment entitlement.`
    };
  }

  const envLicense = env.AMC_INDUSTRY_PACKS_LICENSE_KEY ?? env.AMC_DOMAIN_PACKS_LICENSE_KEY;
  if (envLicense) {
    const verified = verifyIndustryPackLicenseKey(envLicense, env);
    if (verified.valid) {
      return {
        ...base,
        active: true,
        source: "env",
        expiresAt: verified.payload?.expiresAt ?? null,
        customerId: verified.payload?.customerId,
        subscriptionId: verified.payload?.subscriptionId,
        licenseStatus: verified.payload?.status,
        message: `Industry Packs active via environment license.`
      };
    }
  }

  const stored = parseStoredEntitlement(workspace);
  if (stored?.active === true && isNotExpired(stored.expiresAt)) {
    return {
      ...base,
      active: true,
      source: "file",
      planId: stored.planId ?? INDUSTRY_PACKS_PLAN_ID,
      expiresAt: stored.expiresAt ?? null,
      customerId: stored.customerId,
      subscriptionId: stored.subscriptionId,
      licenseStatus: stored.licenseStatus,
      message: `Industry Packs active via local entitlement.`
    };
  }

  return {
    ...base,
    active: false,
    source: "none",
    message: `Industry Packs require the $${INDUSTRY_PACKS_MONTHLY_PRICE_USD}/month Industry Packs subscription.`
  };
}

export function formatIndustryPackPaywallMessage(entitlement: IndustryPackEntitlement): string {
  return [
    `Industry Packs are locked.`,
    `$${entitlement.priceUsdMonthly}/month unlocks all ${INDUSTRY_PACKS_PUBLIC_COUNT} Industry Domain Packs.`,
    `Subscribe: ${entitlement.checkoutUrl}`,
    `After purchase, run: amc domain pack activate --key <license-key>`
  ].join("\n");
}

export function assertIndustryPackAccess(workspace = process.cwd()): IndustryPackEntitlement {
  const entitlement = getIndustryPackEntitlement(workspace);
  if (!entitlement.active) {
    throw new IndustryPackAccessError(entitlement);
  }
  return entitlement;
}

export function activateIndustryPackAccess(params: {
  workspace?: string;
  licenseKey: string;
  expiresAt?: string | null;
}): IndustryPackEntitlement {
  const workspace = params.workspace ?? process.cwd();
  const key = params.licenseKey.trim();
  const verified = verifyIndustryPackLicenseKey(key);
  if (!verified.valid) {
    throw new Error(`Invalid Industry Packs license key: ${verified.reason ?? "verification failed"}.`);
  }
  const file = entitlementPath(workspace);
  ensureDir(join(workspace, ".amc"));
  const stored: StoredEntitlement = {
    active: true,
    planId: INDUSTRY_PACKS_PLAN_ID,
    expiresAt: verified.payload?.expiresAt ?? params.expiresAt ?? null,
    licenseKeySha256: sha256Hex(Buffer.from(key, "utf8")),
    activatedAt: new Date().toISOString(),
    customerId: verified.payload?.customerId,
    subscriptionId: verified.payload?.subscriptionId,
    licenseStatus: verified.payload?.status ?? "active"
  };
  writeFileAtomic(file, JSON.stringify(stored, null, 2), 0o600);
  return getIndustryPackEntitlement(workspace, {
    ...process.env,
    AMC_INDUSTRY_PACKS_ACTIVE: undefined,
    AMC_DOMAIN_PACKS_ACTIVE: undefined,
    AMC_INDUSTRY_PACKS_LICENSE_KEY: undefined,
    AMC_DOMAIN_PACKS_LICENSE_KEY: undefined
  });
}

export async function activateIndustryPackAccessOnline(params: {
  workspace?: string;
  licenseKey: string;
  expiresAt?: string | null;
  verifyUrl?: string;
  fetchImpl?: typeof fetch;
}): Promise<IndustryPackEntitlement> {
  const key = params.licenseKey.trim();
  const local = verifyIndustryPackLicenseKey(key);
  if (local.valid || validLegacyIndustryPackLicenseKey(key)) {
    return activateIndustryPackAccess(params);
  }
  const verifyUrl = params.verifyUrl ?? process.env.AMC_INDUSTRY_PACKS_VERIFY_URL ?? INDUSTRY_PACKS_DEFAULT_VERIFY_URL;
  const fetcher = params.fetchImpl ?? fetch;
  const response = await fetcher(verifyUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ licenseKey: key })
  });
  const payload = await response.json() as {
    valid?: boolean;
    reason?: string;
    license?: IndustryPackLicensePayload;
  };
  if (!response.ok || payload.valid !== true) {
    throw new Error(`Invalid Industry Packs license key: ${payload.reason ?? response.statusText}.`);
  }
  const workspace = params.workspace ?? process.cwd();
  const file = entitlementPath(workspace);
  ensureDir(join(workspace, ".amc"));
  const stored: StoredEntitlement = {
    active: true,
    planId: INDUSTRY_PACKS_PLAN_ID,
    expiresAt: payload.license?.expiresAt ?? params.expiresAt ?? null,
    licenseKeySha256: sha256Hex(Buffer.from(key, "utf8")),
    activatedAt: new Date().toISOString(),
    customerId: payload.license?.customerId,
    subscriptionId: payload.license?.subscriptionId,
    licenseStatus: payload.license?.status ?? "active"
  };
  writeFileAtomic(file, JSON.stringify(stored, null, 2), 0o600);
  return getIndustryPackEntitlement(workspace, {
    ...process.env,
    AMC_INDUSTRY_PACKS_ACTIVE: undefined,
    AMC_DOMAIN_PACKS_ACTIVE: undefined,
    AMC_INDUSTRY_PACKS_LICENSE_KEY: undefined,
    AMC_DOMAIN_PACKS_LICENSE_KEY: undefined
  });
}

export function toIndustryPackCatalogItem(
  pack: IndustryPack,
  entitlement: IndustryPackEntitlement
): IndustryPackCatalogItem {
  const unlocked = entitlement.active;
  return {
    packId: pack.id,
    name: pack.name,
    domain: pack.stationId,
    riskLevel: pack.riskTier,
    questionCount: pack.questions.length,
    locked: !unlocked,
    description: unlocked
      ? pack.description
      : "Subscribe to Industry Packs to access sector diagnostics, regulatory mappings, scoring, and apply actions.",
    regulatoryBasis: unlocked ? pack.regulatoryBasis : undefined,
    complianceFrameworks: unlocked ? pack.complianceFrameworks : undefined
  };
}
