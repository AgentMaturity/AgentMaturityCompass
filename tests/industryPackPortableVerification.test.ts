import { createHmac, verify } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { createIndustryPackLicenseKey, verifyIndustryPackLicenseKey, verifyIndustryPackLicenseReport } from "../src/domains/industryPackEntitlement.js";
import {
  admitKey, loadTrustContext, signTrustList, verifierReportSchema, verdictExitCode,
  type DistrustEntry, type TrustContext, type TrustListEntry,
} from "../src/trust/index.js";
import { sha256Hex } from "../src/utils/hash.js";
import { distrustEntry, listEntry, testKey, trustList } from "./trust/trustFixtures.js";

const NOW = new Date("2026-10-14T12:00:00.000Z");
const ISSUED_AT = "2026-10-13T12:00:00.000Z";
const issuer = testKey();
const stranger = testKey();
const homes: string[] = [];
const allows = [
  { label: "neither", allowUnpinned: false, allowUnanchored: false },
  { label: "unpinned", allowUnpinned: true, allowUnanchored: false },
  { label: "unanchored", allowUnpinned: false, allowUnanchored: true },
  { label: "both", allowUnpinned: true, allowUnanchored: true },
] as const;
type AllowOptions = Pick<TrustContext, "allowUnpinned" | "allowUnanchored">;
type LicenseResult = ReturnType<typeof verifyIndustryPackLicenseReport>;

beforeEach(() => {
  expect([22, 24], "Portable verifier fixtures require a qualified Node major").toContain(Number(process.versions.node.split(".")[0]));
});

afterEach(() => {
  const errors: unknown[] = [];
  for (const home of homes.splice(0)) {
    try { rmSync(home, { recursive: true, force: true }); } catch (error) { errors.push(error); }
  }
  if (errors.length > 0) throw new AggregateError(errors, "Portable licence fixture cleanup failed");
});

function evidence(name: string, value: unknown): void {
  if (!process.env.P051_PORTABLE_LICENSE_EVIDENCE_DIR) return;
  mkdirSync(process.env.P051_PORTABLE_LICENSE_EVIDENCE_DIR, { recursive: true });
  writeFileSync(join(process.env.P051_PORTABLE_LICENSE_EVIDENCE_DIR, `${name}.json`), `${JSON.stringify(value, null, 2)}\n`);
}

function operatorContext(entries: TrustListEntry[], name: string, options: AllowOptions = allows[0], distrust: DistrustEntry[] = []): TrustContext {
  const home = mkdtempSync(join(tmpdir(), "amc-p0-51-portable-licence-"));
  homes.push(home);
  // Operator records the root fingerprint before signing. Neither root nor issuer private key is persisted.
  const root = testKey();
  const list = trustList(entries, { listId: "p0-51-owned-operator", distrust });
  const signed = signTrustList(list, root.privateKeyPem);
  mkdirSync(join(home, "trust"), { recursive: true, mode: 0o700 });
  const listPath = join(home, "trust", "amc-trust-list.json");
  writeFileSync(listPath, JSON.stringify(signed), { mode: 0o600 });
  writeFileSync(join(home, "trust", "trust-roots.json"), JSON.stringify({ type: "amc.trust-roots", version: 1, roots: [root.keyId] }), { mode: 0o600 });
  const context = loadTrustContext({ amcHome: home, env: {}, now: NOW, ...options });
  expect(context.mode).toBe("pinned");
  expect(context.explicitPins).toEqual([]);
  expect(context.lists).toEqual([list]);
  evidence(`${name}-operator`, { home, listPath, pinnedRootKeyId: root.keyId, signedList: signed, context });
  return context;
}

/** P1-51 issues only Ed25519 licences, so an HMAC-signed one is built by hand, the way an older issuer signed it. */
function hmacLicense(secret: string): string {
  const payload = Buffer.from(JSON.stringify({ v: 1, planId: "industry-packs-monthly", status: "active", issuedAt: ISSUED_AT,
    expiresAt: "2027-01-01T00:00:00.000Z" }), "utf8").toString("base64url");
  return `AMC-INDUSTRY-PACKS.${payload}.${createHmac("sha256", secret).update(payload).digest("base64url")}`;
}

function signedLicense(): string {
  const key = createIndustryPackLicenseKey({
    customerId: "p0-51-owned-portable-fixture", issuedAt: ISSUED_AT, expiresAt: "2027-01-01T00:00:00.000Z",
    env: { AMC_INDUSTRY_PACKS_LICENSE_PRIVATE_KEY: issuer.privateKeyPem },
  });
  const [, payload, signature] = key.split(".");
  expect(verify(null, Buffer.from(payload, "utf8"), issuer.publicKeyPem, Buffer.from(signature, "base64url"))).toBe(true);
  expect(verifyIndustryPackLicenseKey(key, { AMC_INDUSTRY_PACKS_LICENSE_PUBLIC_KEY: issuer.publicKeyPem }, NOW.getTime()).valid).toBe(true);
  return key;
}

// P1-51: the verdict uses only keys the trust list admits for artifact-seal; --pubkey and environment keys never count.
const NOT_PINNED_SIGNER = "the licence is not signed by a pinned Industry Packs licence key";

function inspect(name: string, key: string, context: TrustContext): LicenseResult {
  const result = verifyIndustryPackLicenseReport(key, context, NOW.getTime());
  verifierReportSchema.parse(result.report);
  expect(result.report.artifact).toEqual({ kind: "industry-pack-license", path: "--key", sha256: sha256Hex(key.trim()) });
  expect(result.report.asOf).toBe(NOW.toISOString());
  expect(result.report.anchoring).toEqual({ status: "not-applicable", detail: null });
  expect(result.report.issuerAdmission.signatures).toHaveLength(1);
  expect(result.valid).toBe(result.report.trusted);
  for (const dimension of ["scope", "freshness", "completeness", "satisfaction"] as const) {
    expect(result.report[dimension]).toEqual({ status: "not-evaluated", reasons: [] });
  }
  evidence(name, { result, exitCode: verdictExitCode(result.report) });
  return result;
}

/** No admitted key verified the signature: integrity fails with `reason` and the report names no signer key. */
function requireUnsigned(result: LicenseResult, reason: string): void {
  expect(result.valid).toBe(false);
  expect(result.report.trusted).toBe(false);
  expect(result.report.integrity).toEqual({ status: "fail", errors: [reason] });
  expect(result.report.issuerAdmission.signatures).toEqual([expect.objectContaining({ keyId: null, status: "not-pinned" })]);
  expect(result.report.overrides).toEqual([]);
  expect(verdictExitCode(result.report)).toBe(1);
}

function requireTrusted(result: LicenseResult): void {
  expect(result.valid).toBe(true);
  expect(result.payload).toMatchObject({ customerId: "p0-51-owned-portable-fixture", issuedAt: ISSUED_AT });
  expect(result.report).toMatchObject({ trusted: true, integrity: { status: "pass", errors: [] },
    issuerAdmission: { status: "pass", signatures: [{ keyId: issuer.keyId, status: "admitted", source: "trust-list", purpose: "artifact-seal", listId: "p0-51-owned-operator" }] },
    overrides: [], warnings: [] });
  expect(verdictExitCode(result.report)).toBe(0);
}

describe("Industry Pack portable Ed25519 verification (P0-51, P1-51 gate keys)", () => {
  test("an operator-signed purpose-bound list alone locates and trusts the genuine licence signer", () => {
    const context = operatorContext([listEntry(issuer)], "list-only-admitted");
    const key = signedLicense();
    expect(admitKey({ publicKeyPem: issuer.publicKeyPem, purpose: "artifact-seal", signature: "license signature", context, claimedSignedAt: ISSUED_AT }))
      .toMatchObject({ status: "admitted", source: "trust-list", keyId: issuer.keyId });
    requireTrusted(inspect("list-only-admitted", key, context));
  });

  const refused = [
    { name: "distrusted", entry: listEntry(issuer), distrust: [distrustEntry(issuer.keyId)], status: "distrusted" },
    { name: "revoked", entry: listEntry(issuer, { revokedAt: "2026-10-12T00:00:00.000Z", revocationReason: "key-compromise" }), distrust: [], status: "revoked" },
    { name: "wrong-purpose", entry: listEntry(issuer, { purposes: ["release"] }), distrust: [], status: "wrong-purpose" },
  ] as const;

  // A key the list refuses never makes the licence valid (P1-51), but the report still names it with its refusal (P0-51).
  test.each(refused)("$name remains refused with both allow flags", row => {
    const context = operatorContext([row.entry], row.name, allows[3], [...row.distrust]);
    const key = signedLicense();
    const admission = admitKey({ publicKeyPem: issuer.publicKeyPem, purpose: "artifact-seal", signature: "license signature", context, claimedSignedAt: ISSUED_AT });
    expect(admission.status).toBe(row.status);
    const result = inspect(row.name, key, context);
    expect(result.report.integrity).toEqual({ status: "pass", errors: [] });
    expect(result.report.issuerAdmission).toMatchObject({ status: "fail", signatures: [{ keyId: issuer.keyId, status: row.status, purpose: "artifact-seal" }] });
    expect(result.reason).toMatch(/^the licence signing key is refused by the trust list: /);
    expect(result.valid).toBe(false);
    expect(result.report.trusted).toBe(false);
    expect(result.report.overrides).toEqual([]);
    expect(verdictExitCode(result.report)).toBe(1);
  });

  test.each(allows)("an unknown actual signer stays untrusted with $label allow flags", flags => {
    const name = `unknown-${flags.label}`;
    const context = operatorContext([listEntry(stranger)], name, flags);
    requireUnsigned(inspect(name, signedLicense(), context), NOT_PINNED_SIGNER);
  });

  test("tampering a real payload defeats signature integrity even under an admitted signer and both allow flags", () => {
    const context = operatorContext([listEntry(issuer)], "payload-tamper", allows[3]);
    const key = signedLicense();
    requireTrusted(inspect("payload-tamper-intact-control", key, context));
    const [prefix, payloadPart, signature] = key.split(".");
    const payload = JSON.parse(Buffer.from(payloadPart, "base64url").toString("utf8")) as Record<string, unknown>;
    payload.customerId = "changed-after-signing";
    const tampered = `${prefix}.${Buffer.from(JSON.stringify(payload), "utf8").toString("base64url")}.${signature}`;
    // No pinned key verifies the tampered signature, so none is reported as its admitted signer.
    requireUnsigned(inspect("payload-tamper", tampered, context), NOT_PINNED_SIGNER);
  });

  test.each(["legacy", "hmac"].flatMap(kind => allows.map(flags => ({ kind, ...flags }))))(
    "$kind activation compatibility never becomes portable trust under $label allow flags", flags => {
      const name = `${flags.kind}-${flags.label}`;
      const context = operatorContext([listEntry(issuer)], name, flags);
      const legacy = "AMC-INDUSTRY-PACKS-TESTKEY123";
      const compatibilityEnv = flags.kind === "legacy"
        ? { AMC_INDUSTRY_PACKS_LEGACY_KEY_SHA256_ALLOWLIST: sha256Hex(legacy) }
        : { AMC_INDUSTRY_PACKS_LICENSE_SECRET: "p0-51-owned-hmac-fixture-secret" };
      const key = flags.kind === "legacy" ? legacy : hmacLicense("p0-51-owned-hmac-fixture-secret");
      expect(verifyIndustryPackLicenseKey(key, compatibilityEnv, NOW.getTime()).valid).toBe(true);
      requireUnsigned(inspect(name, key, context), NOT_PINNED_SIGNER);
    },
  );
});
