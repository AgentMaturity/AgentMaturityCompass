import { createHmac, createPrivateKey, createPublicKey, sign as signEd25519, timingSafeEqual, verify as verifyEd25519 } from "node:crypto";
import { join } from "node:path";
import { sha256Hex } from "../utils/hash.js";
import { ensureDir, pathExists, readUtf8, writeFileAtomic } from "../utils/fs.js";
import { toErrorMessage } from "../utils/errors.js";
import type { IndustryPack } from "./industryPacks.js";
import { QUESTIONNAIRE_CONTENT_STATUS } from "./questionnaireLabel.js";
import {
  admitKey, admittedListKeys, buildVerifierReport, loadTrustContext, type TrustContext, type VerifierReportV1
} from "../trust/index.js";

export const INDUSTRY_PACKS_PLAN_ID = "industry-packs-monthly";
export const INDUSTRY_PACKS_MONTHLY_PRICE_USD = "9.99";
export const INDUSTRY_PACKS_ACCESS_FILE = "industry-packs-access.json";
export const INDUSTRY_PACKS_LICENSE_PREFIX = "AMC-INDUSTRY-PACKS";
/**
 * The purpose a trust-list entry must carry for a gate to accept its key as a licence signer, as `amc domain pack verify`
 * (P0-51) already checks. ponytail: shares artifact-seal; a dedicated licence purpose needs a trust-list schema change.
 */
const INDUSTRY_PACKS_LICENSE_PURPOSE = "artifact-seal";
export const INDUSTRY_PACKS_CHECKOUT_NOT_AVAILABLE = "Checkout is not available in this deployment; contact sales for access.";
const LICENSE_VERIFICATION_NOT_CONFIGURED =
  "Industry Packs licence verification is not configured: no licence signing key is pinned in this machine's AMC trust list (purpose artifact-seal).";

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
  /** True only when a checkout URL is configured and a licence bought there could be verified here. */
  checkoutAvailable: boolean;
  checkoutUrl: string | null;
  /** A licence signing key is pinned in the operator's trust list; nothing the client supplies counts (P1-51). */
  licenseVerificationConfigured: boolean;
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
  /** AI-drafted pack content, experimental until a named expert signs it (P1-42). */
  contentStatus: typeof QUESTIONNAIRE_CONTENT_STATUS;
}

interface StoredEntitlement {
  active?: boolean;
  planId?: string;
  expiresAt?: string | null;
  licenseKeySha256?: string;
  licensePayload?: string;
  licenseSignature?: string;
  activatedAt?: string;
  customerId?: string;
  subscriptionId?: string;
  licenseStatus?: IndustryPackLicenseStatus;
}

export class IndustryPackAccessError extends Error {
  readonly entitlement: IndustryPackEntitlement;

  constructor(entitlement: IndustryPackEntitlement) {
    super(entitlement.message);
    this.name = "IndustryPackAccessError";
    this.entitlement = entitlement;
  }
}

function configuredCheckoutUrl(env: NodeJS.ProcessEnv): string | null {
  return env.AMC_INDUSTRY_PACKS_CHECKOUT_URL
    ?? env.AMC_DOMAIN_PACKS_CHECKOUT_URL
    ?? null;
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

function licensePrivateKeyPem(env: NodeJS.ProcessEnv): string | null {
  return env.AMC_INDUSTRY_PACKS_LICENSE_PRIVATE_KEY
    ?? env.AMC_DOMAIN_PACKS_LICENSE_PRIVATE_KEY
    ?? null;
}

function licensePublicKeyPem(env: NodeJS.ProcessEnv): string | null {
  return env.AMC_INDUSTRY_PACKS_LICENSE_PUBLIC_KEY
    ?? env.AMC_DOMAIN_PACKS_LICENSE_PUBLIC_KEY
    ?? null;
}

function signPayloadEd25519(payloadPart: string, privateKeyPem: string): string {
  return signEd25519(null, Buffer.from(payloadPart, "utf8"), createPrivateKey(privateKeyPem)).toString("base64url");
}

function verifyPayloadEd25519(payloadPart: string, signaturePart: string, publicKeyPem: string): boolean {
  try {
    return verifyEd25519(
      null,
      Buffer.from(payloadPart, "utf8"),
      createPublicKey(publicKeyPem),
      Buffer.from(signaturePart, "base64url")
    );
  } catch {
    return false;
  }
}

function isNotExpired(expiresAt: string | null | undefined, now = Date.now()): boolean {
  if (!expiresAt) {
    return true;
  }
  const ts = Date.parse(expiresAt);
  return Number.isFinite(ts) && ts > now;
}

function isLegacyIndustryPackLicenseKey(value: string): boolean {
  return /^AMC-(INDUSTRY|DOMAIN)-PACKS-[A-Z0-9_-]{8,}$/i.test(value.trim());
}

function validLegacyIndustryPackLicenseKey(
  value: string,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (!isLegacyIndustryPackLicenseKey(value)) {
    return false;
  }
  const digest = sha256Hex(value.trim());
  const allowlist = (env.AMC_INDUSTRY_PACKS_LEGACY_KEY_SHA256_ALLOWLIST ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => /^[a-f0-9]{64}$/.test(entry));
  return allowlist.some((allowedDigest) => constantTimeEqual(allowedDigest, digest));
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
  const privateKeyPem = licensePrivateKeyPem(env);
  // A gate verifies a licence only against a pinned Ed25519 key, so an HMAC-signed licence could never be activated.
  if (!privateKeyPem) {
    throw new Error("AMC_INDUSTRY_PACKS_LICENSE_PRIVATE_KEY (Ed25519 PEM) is required to issue Industry Packs licenses.");
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
  return `${INDUSTRY_PACKS_LICENSE_PREFIX}.${payloadPart}.${signPayloadEd25519(payloadPart, privateKeyPem)}`;
}

export function verifyIndustryPackLicenseKey(
  licenseKey: string,
  env: NodeJS.ProcessEnv = process.env,
  now = Date.now()
): { valid: boolean; payload: IndustryPackLicensePayload | null; reason?: string } {
  const key = licenseKey.trim();
  if (validLegacyIndustryPackLicenseKey(key, env)) {
    return { valid: true, payload: null };
  }
  if (isLegacyIndustryPackLicenseKey(key)) {
    return {
      valid: false,
      payload: null,
      reason: "legacy license key is not in the operator SHA-256 allowlist",
    };
  }
  const [prefix, payloadPart, signaturePart] = key.split(".");
  if (prefix !== INDUSTRY_PACKS_LICENSE_PREFIX || !payloadPart || !signaturePart) {
    return { valid: false, payload: null, reason: "invalid license format" };
  }
  const publicKeyPem = licensePublicKeyPem(env);
  const secret = licenseSecret(env);
  if (!publicKeyPem && !secret) {
    return { valid: false, payload: null, reason: "license verification key is not configured" };
  }
  const signatureValid =
    (publicKeyPem ? verifyPayloadEd25519(payloadPart, signaturePart, publicKeyPem) : false)
    || (secret ? constantTimeEqual(signatureFor(payloadPart, secret), signaturePart) : false);
  if (!signatureValid) {
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

/**
 * `amc domain pack verify` (P0-51): the licence verdict as a VerifierReportV1, against the same keys the gate uses
 * (P1-51): only a key the trust list pins for artifact-seal, never --pubkey or an environment key. With none pinned the
 * verdict is "not configured". A list key the list refuses that did sign the licence is named with that refusal (P0-51).
 * An HMAC-signed or legacy allowlisted licence names no signer, so it is never trusted.
 */
export function verifyIndustryPackLicenseReport(licenseKey: string, trust: TrustContext, now = Date.now()):
  ReturnType<typeof verifyIndustryPackLicenseKey> & { report: VerifierReportV1 } {
  const { signer, refusal, checks, result } = pinnedLicenseVerdict(licenseKey, trust, now);
  const report = buildVerifierReport({ artifact: { kind: "industry-pack-license", path: "--key", sha256: sha256Hex(licenseKey.trim()) },
    context: trust, integrityErrors: checks.valid ? [] : [checks.reason ?? "license verification failed"], anchoring: { status: "not-applicable", detail: null },
    signatures: [refusal ?? admitKey({ publicKeyPem: signer, purpose: INDUSTRY_PACKS_LICENSE_PURPOSE, signature: "license signature", context: trust,
      claimedSignedAt: result.payload?.issuedAt ?? null })] });
  return { ...result, valid: result.valid && report.trusted, report };
}

export function buildIndustryPackCheckoutUrl(params: {
  successUrl?: string;
  cancelUrl?: string;
  customerEmail?: string;
  clientReferenceId?: string;
  env?: NodeJS.ProcessEnv;
} = {}): string {
  const env = params.env ?? process.env;
  const raw = configuredCheckoutUrl(env);
  if (!raw) {
    throw new Error(
      "Industry Packs checkout is not configured or publicly available yet. Set AMC_INDUSTRY_PACKS_CHECKOUT_URL only after a live checkout has been verified.",
    );
  }
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("Industry Packs checkout URL is not a valid https URL.");
  }
  if (parsed.protocol !== "https:") {
    throw new Error("Industry Packs checkout URL must use https.");
  }
  parsed.searchParams.set("plan", INDUSTRY_PACKS_PLAN_ID);
  parsed.searchParams.set("price", INDUSTRY_PACKS_MONTHLY_PRICE_USD);
  if (params.successUrl) parsed.searchParams.set("success_url", params.successUrl);
  if (params.cancelUrl) parsed.searchParams.set("cancel_url", params.cancelUrl);
  if (params.customerEmail) parsed.searchParams.set("customer_email", params.customerEmail);
  if (params.clientReferenceId) parsed.searchParams.set("client_reference_id", params.clientReferenceId);
  return parsed.toString();
}

/**
 * The licence verdict a gate uses: the signature must come from a key the operator's signed trust list admits for
 * artifact-seal. A key, secret or allowlist in the environment is client-supplied, so it never counts here.
 */
export function verifyPinnedIndustryPackLicense(licenseKey: string, trust: TrustContext, now = Date.now()): ReturnType<typeof verifyIndustryPackLicenseKey> {
  return pinnedLicenseVerdict(licenseKey, trust, now).result;
}

function pinnedLicenseVerdict(licenseKey: string, trust: TrustContext, now: number) {
  const keys = admittedListKeys(trust, INDUSTRY_PACKS_LICENSE_PURPOSE);
  const [prefix, payloadPart = "", signaturePart = ""] = licenseKey.trim().split(".");
  const signedBy = (pems: string[]) => prefix === INDUSTRY_PACKS_LICENSE_PREFIX
    ? pems.find((pem) => verifyPayloadEd25519(payloadPart, signaturePart, pem)) ?? null : null;
  // The licence's own checks (format, payload, status, expiry) against one key, with no secret or allowlist.
  const checksBy = (pem: string) => verifyIndustryPackLicenseKey(licenseKey, { AMC_INDUSTRY_PACKS_LICENSE_PUBLIC_KEY: pem }, now);
  const signer = signedBy(keys);
  if (signer !== null) {
    const checks = checksBy(signer);
    return { signer, refusal: null, checks, result: checks };
  }
  // Naming only: a list key the list refuses (distrusted, revoked, expired, wrong purpose) that did sign the licence is
  // reported with that refusal, judged at the verification time as admittedListKeys judged it. It never makes it valid.
  const refusedSigner = signedBy(trust.lists.flatMap((list) => list.entries.map((entry) => entry.publicKeyPem)));
  if (refusedSigner !== null) {
    const refusal = admitKey({ publicKeyPem: refusedSigner, purpose: INDUSTRY_PACKS_LICENSE_PURPOSE, signature: "license signature", context: trust });
    const checks = checksBy(refusedSigner);
    return { signer: refusedSigner, refusal, checks,
      result: { valid: false, payload: checks.payload, reason: `the licence signing key is refused by the trust list: ${refusal.detail ?? refusal.status}` } };
  }
  const result: ReturnType<typeof verifyIndustryPackLicenseKey> = keys.length === 0
    ? { valid: false, payload: null, reason: LICENSE_VERIFICATION_NOT_CONFIGURED }
    : { valid: false, payload: null, reason: "the licence is not signed by a pinned Industry Packs licence key" };
  return { signer: null, refusal: null, checks: result, result };
}

function operatorTrust(env: NodeJS.ProcessEnv): { trust: TrustContext | null; error: string | null } {
  try {
    return { trust: loadTrustContext({ env }), error: null };
  } catch (error) {
    return { trust: null, error: `Industry Packs licence verification failed: the trust configuration could not be read (${toErrorMessage(error)}).` };
  }
}

export function getIndustryPackEntitlement(
  workspace = process.cwd(),
  env: NodeJS.ProcessEnv = process.env,
  trustContext?: TrustContext
): IndustryPackEntitlement {
  const { trust, error } = trustContext ? { trust: trustContext, error: null } : operatorTrust(env);
  const verificationConfigured = trust !== null && admittedListKeys(trust, INDUSTRY_PACKS_LICENSE_PURPOSE).length > 0;
  const checkoutUrl = verificationConfigured ? configuredCheckoutUrl(env) : null;
  const base = {
    planId: INDUSTRY_PACKS_PLAN_ID,
    priceUsdMonthly: INDUSTRY_PACKS_MONTHLY_PRICE_USD,
    checkoutAvailable: checkoutUrl !== null,
    checkoutUrl,
    licenseVerificationConfigured: verificationConfigured,
    expiresAt: null as string | null
  };
  const unlocked = (source: "env" | "file", payload: IndustryPackLicensePayload | null): IndustryPackEntitlement => ({
    ...base, active: true, source, expiresAt: payload?.expiresAt ?? null, customerId: payload?.customerId,
    subscriptionId: payload?.subscriptionId, licenseStatus: payload?.status,
    message: `Industry Packs active via ${source === "env" ? "environment" : "local"} licence, verified against a pinned licence key.`
  });

  const refusals: string[] = [];
  if (trust) {
    const envLicense = env.AMC_INDUSTRY_PACKS_LICENSE_KEY ?? env.AMC_DOMAIN_PACKS_LICENSE_KEY;
    const fromEnv = envLicense ? verifyPinnedIndustryPackLicense(envLicense, trust) : null;
    if (fromEnv?.valid) return unlocked("env", fromEnv.payload);
    if (fromEnv && verificationConfigured) refusals.push(`The environment licence was refused: ${fromEnv.reason ?? "verification failed"}.`);
    // The stored proof is re-verified on every read; no field of the editable file is trusted on its own.
    const stored = parseStoredEntitlement(workspace);
    if (stored?.active === true && stored.licensePayload && stored.licenseSignature) {
      const fromFile = verifyPinnedIndustryPackLicense(
        `${INDUSTRY_PACKS_LICENSE_PREFIX}.${stored.licensePayload}.${stored.licenseSignature}`, trust);
      if (fromFile.valid) return unlocked("file", fromFile.payload);
      if (verificationConfigured) refusals.push(`The stored licence was refused: ${fromFile.reason ?? "verification failed"}.`);
    }
  }
  const locked = { ...base, active: false, source: "none" as const, message: "" };
  return { ...locked, message: [formatIndustryPackPaywallMessage(locked), ...refusals, ...(error ? [error] : [])].join("\n") };
}

/**
 * The issuing server's view (api/index.ts). Checkout is live there only when a payment could become a licence: a checkout
 * URL, an Ed25519 issuing key and the admin issue path must all be configured. The server's own licence is irrelevant.
 */
export function hostedIndustryPackAccess(env: NodeJS.ProcessEnv = process.env) {
  let checkoutUrl: string | null = null;
  if (licensePrivateKeyPem(env) && env.AMC_INDUSTRY_PACKS_ADMIN_TOKEN) {
    try { checkoutUrl = buildIndustryPackCheckoutUrl({ env }); } catch { /* unset or not https: there is no checkout to offer */ }
  }
  const plan = { planId: INDUSTRY_PACKS_PLAN_ID, priceUsdMonthly: INDUSTRY_PACKS_MONTHLY_PRICE_USD, checkoutAvailable: checkoutUrl !== null, checkoutUrl };
  return { ...plan, message: formatIndustryPackPaywallMessage({ ...plan, licenseVerificationConfigured: true }) };
}

/** One text for every locked surface (CLI, Studio, console, dashboard, MCP): what is locked, the price, how to get access. */
export function formatIndustryPackPaywallMessage(
  entitlement: Pick<IndustryPackEntitlement, "priceUsdMonthly" | "planId" | "checkoutUrl" | "licenseVerificationConfigured">
): string {
  const access = entitlement.checkoutUrl
    ? [`Buy: ${entitlement.checkoutUrl}`, "Then activate it: amc domain pack activate --key <licence-key>"]
    : [INDUSTRY_PACKS_CHECKOUT_NOT_AVAILABLE,
      entitlement.licenseVerificationConfigured
        ? "If you already hold a licence: amc domain pack activate --key <licence-key>"
        : LICENSE_VERIFICATION_NOT_CONFIGURED];
  return [
    "Industry Packs are locked: pack questions and pack runs need an Industry Packs licence (CLI: amc domain pack describe|run and"
      + " amc domain assess|gaps|report|assurance|roadmap|apply; Studio: GET /industry-packs/<id>; MCP: amc_score_sector_pack,"
      + " amc_get_industry_pack, amc_score_industry_pack).",
    "Pack names and descriptions stay visible. A licence unlocks access only; it never changes a score, gap, report or other result.",
    `Price: US$${entitlement.priceUsdMonthly}/month (plan ${entitlement.planId}).`,
    ...access
  ].join("\n");
}

export function assertIndustryPackAccess(workspace = process.cwd(), env: NodeJS.ProcessEnv = process.env): IndustryPackEntitlement {
  const entitlement = getIndustryPackEntitlement(workspace, env);
  if (!entitlement.active) {
    throw new IndustryPackAccessError(entitlement);
  }
  return entitlement;
}

/** Stores a licence that verifies against a pinned licence key; anything else is refused and nothing is written. */
export function activateIndustryPackAccess(params: {
  workspace?: string;
  licenseKey: string;
  env?: NodeJS.ProcessEnv;
}): IndustryPackEntitlement {
  const workspace = params.workspace ?? process.cwd();
  const env = params.env ?? process.env;
  const key = params.licenseKey.trim();
  const { trust, error } = operatorTrust(env);
  if (!trust) throw new Error(error ?? LICENSE_VERIFICATION_NOT_CONFIGURED);
  const verified = verifyPinnedIndustryPackLicense(key, trust);
  if (!verified.valid) {
    throw new Error(verified.reason === LICENSE_VERIFICATION_NOT_CONFIGURED
      ? LICENSE_VERIFICATION_NOT_CONFIGURED
      : `Invalid Industry Packs license key: ${verified.reason ?? "verification failed"}.`);
  }
  ensureDir(join(workspace, ".amc"));
  const [, licensePayload, licenseSignature] = key.split(".");
  const stored: StoredEntitlement = {
    active: true,
    planId: INDUSTRY_PACKS_PLAN_ID,
    expiresAt: verified.payload?.expiresAt ?? null,
    licenseKeySha256: sha256Hex(Buffer.from(key, "utf8")),
    licensePayload,
    licenseSignature,
    activatedAt: new Date().toISOString(),
    customerId: verified.payload?.customerId,
    subscriptionId: verified.payload?.subscriptionId,
    licenseStatus: verified.payload?.status ?? "active"
  };
  writeFileAtomic(entitlementPath(workspace), JSON.stringify(stored, null, 2), 0o600);
  return getIndustryPackEntitlement(workspace, { ...env, AMC_INDUSTRY_PACKS_LICENSE_KEY: undefined, AMC_DOMAIN_PACKS_LICENSE_KEY: undefined }, trust);
}

/** Names and descriptions are public whether or not a licence is active; the licence gates pack questions and runs. */
export function toIndustryPackCatalogItem(
  pack: IndustryPack,
  entitlement: IndustryPackEntitlement
): IndustryPackCatalogItem {
  return {
    packId: pack.id,
    name: pack.name,
    domain: pack.stationId,
    riskLevel: pack.riskTier,
    questionCount: pack.questions.length,
    locked: !entitlement.active,
    description: pack.description,
    regulatoryBasis: pack.regulatoryBasis,
    complianceFrameworks: pack.complianceFrameworks,
    contentStatus: QUESTIONNAIRE_CONTENT_STATUS
  };
}
