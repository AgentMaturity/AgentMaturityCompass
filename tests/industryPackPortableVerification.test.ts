import { verify } from "node:crypto";
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

function inspect(name: string, key: string, context: TrustContext, pem: string | null = null, env: NodeJS.ProcessEnv = {}): LicenseResult {
  const result = verifyIndustryPackLicenseReport(key, context, pem, env, NOW.getTime());
  verifierReportSchema.parse(result.report);
  expect(result.report.artifact).toEqual({ kind: "industry-pack-license", path: "--key", sha256: sha256Hex(key.trim()) });
  expect(result.report.asOf).toBe(NOW.toISOString());
  expect(result.report.anchoring).toEqual({ status: "not-applicable", detail: null });
  expect(result.report.issuerAdmission.signatures).toHaveLength(1);
  expect(result.valid).toBe(result.report.trusted);
  for (const dimension of ["scope", "freshness", "completeness", "satisfaction"] as const) {
    expect(result.report[dimension]).toEqual({ status: "not-evaluated", reasons: [] });
  }
  evidence(name, { explicitPemSupplied: pem !== null, licencePublicKeyEnvAbsent: !env.AMC_INDUSTRY_PACKS_LICENSE_PUBLIC_KEY && !env.AMC_DOMAIN_PACKS_LICENSE_PUBLIC_KEY,
    result, exitCode: verdictExitCode(result.report) });
  return result;
}

function requireTrusted(result: LicenseResult): void {
  expect(result.valid).toBe(true);
  expect(result.payload).toMatchObject({ customerId: "p0-51-owned-portable-fixture", issuedAt: ISSUED_AT });
  expect(result.report).toMatchObject({ trusted: true, integrity: { status: "pass", errors: [] },
    issuerAdmission: { status: "pass", signatures: [{ keyId: issuer.keyId, status: "admitted", source: "trust-list", purpose: "artifact-seal", listId: "p0-51-owned-operator" }] },
    overrides: [], warnings: [] });
  expect(verdictExitCode(result.report)).toBe(0);
}

describe("Industry Pack portable Ed25519 verification (P0-51)", () => {
  test("an operator-signed purpose-bound list alone locates and trusts the genuine licence signer", () => {
    const context = operatorContext([listEntry(issuer)], "list-only-admitted");
    const key = signedLicense();
    expect(admitKey({ publicKeyPem: issuer.publicKeyPem, purpose: "artifact-seal", signature: "license signature", context, claimedSignedAt: ISSUED_AT }))
      .toMatchObject({ status: "admitted", source: "trust-list", keyId: issuer.keyId });
    // Same key/context succeeds with a PEM locator; that locator adds no pin to the context.
    requireTrusted(inspect("list-only-explicit-pem-control", key, context, issuer.publicKeyPem));
    requireTrusted(inspect("list-only-admitted", key, context));
  });

  test("a supplied PEM locates the same signer while the operator list supplies admission", () => {
    const context = operatorContext([listEntry(issuer)], "explicit-pem-admitted");
    requireTrusted(inspect("explicit-pem-admitted", signedLicense(), context, issuer.publicKeyPem));
  });

  const refused = [
    { name: "distrusted", entry: listEntry(issuer), distrust: [distrustEntry(issuer.keyId)], status: "distrusted" },
    { name: "revoked", entry: listEntry(issuer, { revokedAt: "2026-10-12T00:00:00.000Z", revocationReason: "key-compromise" }), distrust: [], status: "revoked" },
    { name: "wrong-purpose", entry: listEntry(issuer, { purposes: ["release"] }), distrust: [], status: "wrong-purpose" },
  ] as const;

  test.each(refused.flatMap(row => [false, true].map(explicit => ({ ...row, explicit }))))(
    "$name remains refused with explicit PEM $explicit and both allow flags", row => {
      const name = `${row.name}-${row.explicit ? "explicit-pem" : "list-only"}`;
      const context = operatorContext([row.entry], name, allows[3], [...row.distrust]);
      const key = signedLicense();
      const admission = admitKey({ publicKeyPem: issuer.publicKeyPem, purpose: "artifact-seal", signature: "license signature", context, claimedSignedAt: ISSUED_AT });
      expect(admission.status).toBe(row.status);
      const result = inspect(name, key, context, row.explicit ? issuer.publicKeyPem : null);
      expect(result.report.integrity).toEqual({ status: "pass", errors: [] });
      expect(result.report.issuerAdmission).toMatchObject({ status: "fail", signatures: [{ keyId: issuer.keyId, status: row.status, purpose: "artifact-seal" }] });
      expect(result.valid).toBe(false);
      expect(result.report.trusted).toBe(false);
      expect(result.report.overrides).toEqual([]);
      expect(verdictExitCode(result.report)).toBe(1);
    },
  );

  test.each(allows)("an unknown actual signer stays untrusted with $label allow flags", flags => {
    const name = `unknown-${flags.label}`;
    const context = operatorContext([listEntry(stranger)], name, flags);
    const result = inspect(name, signedLicense(), context, issuer.publicKeyPem);
    expect(result.report.integrity).toEqual({ status: "pass", errors: [] });
    expect(result.report.issuerAdmission).toMatchObject({ status: "fail", signatures: [{ keyId: issuer.keyId,
      status: flags.allowUnpinned ? "unpinned-allowed" : "not-pinned", source: null }] });
    expect(result.valid).toBe(false);
    expect(result.report.trusted).toBe(false);
    expect(result.report.overrides).toEqual(flags.allowUnpinned ? ["allow-unpinned"] : []);
    expect(verdictExitCode(result.report)).toBe(flags.allowUnpinned ? 2 : 1);
  });

  test("tampering a real payload defeats signature integrity even under an admitted signer and both allow flags", () => {
    const context = operatorContext([listEntry(issuer)], "payload-tamper", allows[3]);
    const key = signedLicense();
    requireTrusted(inspect("payload-tamper-intact-control", key, context, issuer.publicKeyPem));
    const [prefix, payloadPart, signature] = key.split(".");
    const payload = JSON.parse(Buffer.from(payloadPart, "base64url").toString("utf8")) as Record<string, unknown>;
    payload.customerId = "changed-after-signing";
    const tampered = `${prefix}.${Buffer.from(JSON.stringify(payload), "utf8").toString("base64url")}.${signature}`;
    const result = inspect("payload-tamper", tampered, context, issuer.publicKeyPem);
    expect(result.valid).toBe(false);
    expect(result.report.integrity.status).toBe("fail");
    expect(result.report.integrity.errors).toContain("license signature mismatch");
    expect(result.report.overrides).toEqual([]);
    expect(verdictExitCode(result.report)).toBe(1);
  });

  test.each(["legacy", "hmac"].flatMap(kind => allows.map(flags => ({ kind, ...flags }))))(
    "$kind activation compatibility never becomes portable trust under $label allow flags", flags => {
      const name = `${flags.kind}-${flags.label}`;
      const context = operatorContext([listEntry(issuer)], name, flags);
      const legacy = "AMC-INDUSTRY-PACKS-TESTKEY123";
      const compatibilityEnv = flags.kind === "legacy"
        ? { AMC_INDUSTRY_PACKS_LEGACY_KEY_SHA256_ALLOWLIST: sha256Hex(legacy) }
        : { AMC_INDUSTRY_PACKS_LICENSE_SECRET: "p0-51-owned-hmac-fixture-secret" };
      const key = flags.kind === "legacy" ? legacy : createIndustryPackLicenseKey({ issuedAt: ISSUED_AT,
        expiresAt: "2027-01-01T00:00:00.000Z", env: compatibilityEnv });
      expect(verifyIndustryPackLicenseKey(key, compatibilityEnv, NOW.getTime()).valid).toBe(true);
      for (const pem of [null, issuer.publicKeyPem]) {
        const result = inspect(`${name}-${pem === null ? "list-only" : "explicit-pem"}`, key, context, pem, compatibilityEnv);
        expect(result.valid).toBe(false);
        expect(result.report.trusted).toBe(false);
        expect(result.report.integrity.status).toBe("fail");
        expect(verdictExitCode(result.report)).toBe(1);
      }
    },
  );
});
