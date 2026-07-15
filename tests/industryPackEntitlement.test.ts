import { generateKeyPairSync } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import {
  activateIndustryPackAccess,
  activateIndustryPackAccessOnline,
  buildIndustryPackCheckoutUrl,
  createIndustryPackLicenseKey,
  assertIndustryPackAccess,
  getIndustryPackEntitlement,
  toIndustryPackCatalogItem,
  verifyIndustryPackLicenseKey
} from "../src/domains/industryPackEntitlement.js";
import { getIndustryPack, listIndustryPacks } from "../src/domains/industryPacks.js";

const workspaces: string[] = [];

function createWorkspace(): string {
  const workspace = mkdtempSync(join(tmpdir(), "amc-industry-access-"));
  workspaces.push(workspace);
  return workspace;
}

function configureLicenseKeys(): void {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  process.env.AMC_INDUSTRY_PACKS_LICENSE_PRIVATE_KEY = privateKey.export({
    type: "pkcs8",
    format: "pem",
  }).toString();
  process.env.AMC_INDUSTRY_PACKS_LICENSE_PUBLIC_KEY = publicKey.export({
    type: "spki",
    format: "pem",
  }).toString();
}

afterEach(() => {
  delete process.env.AMC_INDUSTRY_PACKS_ACTIVE;
  delete process.env.AMC_DOMAIN_PACKS_ACTIVE;
  delete process.env.AMC_INDUSTRY_PACKS_LICENSE_KEY;
  delete process.env.AMC_DOMAIN_PACKS_LICENSE_KEY;
  delete process.env.AMC_INDUSTRY_PACKS_LICENSE_PRIVATE_KEY;
  delete process.env.AMC_DOMAIN_PACKS_LICENSE_PRIVATE_KEY;
  delete process.env.AMC_INDUSTRY_PACKS_LICENSE_PUBLIC_KEY;
  delete process.env.AMC_DOMAIN_PACKS_LICENSE_PUBLIC_KEY;
  delete process.env.AMC_INDUSTRY_PACKS_CHECKOUT_URL;
  delete process.env.AMC_DOMAIN_PACKS_CHECKOUT_URL;
  delete process.env.AMC_INDUSTRY_PACKS_LEGACY_KEY_SHA256_ALLOWLIST;
  while (workspaces.length > 0) {
    const workspace = workspaces.pop();
    if (workspace) rmSync(workspace, { recursive: true, force: true });
  }
});

describe("industry pack entitlement", () => {
  test("catalog exposes exactly 41 locked industry packs by default", () => {
    const workspace = createWorkspace();
    const entitlement = getIndustryPackEntitlement(workspace, {} as NodeJS.ProcessEnv);
    const catalog = listIndustryPacks().map((pack) => toIndustryPackCatalogItem(pack, entitlement));

    expect(catalog).toHaveLength(41);
    expect(catalog.every((pack) => pack.locked)).toBe(true);
    expect(new Set(catalog.map((pack) => pack.packId)).size).toBe(41);
  });

  test("locks packs by default and redacts paid details", () => {
    const workspace = createWorkspace();
    const entitlement = getIndustryPackEntitlement(workspace, {} as NodeJS.ProcessEnv);
    const pack = getIndustryPack("clinical-trials");
    const catalog = toIndustryPackCatalogItem(pack, entitlement);

    expect(entitlement.active).toBe(false);
    expect(() => assertIndustryPackAccess(workspace)).toThrow(/Industry Packs are locked/);
    expect(catalog.locked).toBe(true);
    expect(catalog.regulatoryBasis).toBeUndefined();
    expect(catalog.questionCount).toBe(pack.questions.length);
  });

  test("unsigned environment flags cannot unlock pack metadata", () => {
    const workspace = createWorkspace();
    process.env.AMC_INDUSTRY_PACKS_ACTIVE = "1";
    const entitlement = getIndustryPackEntitlement(workspace);
    const pack = getIndustryPack("clinical-trials");
    const catalog = toIndustryPackCatalogItem(pack, entitlement);

    expect(entitlement.active).toBe(false);
    expect(catalog.locked).toBe(true);
    expect(catalog.regulatoryBasis).toBeUndefined();
  });

  test("activation writes a local entitlement without storing the raw key", () => {
    const workspace = createWorkspace();
    configureLicenseKeys();
    const licenseKey = createIndustryPackLicenseKey({
      customerId: "cus_activation",
      expiresAt: "2099-01-01T00:00:00.000Z",
    });
    const entitlement = activateIndustryPackAccess({
      workspace,
      licenseKey,
    });

    expect(entitlement.active).toBe(true);
    expect(entitlement.source).toBe("file");
    const raw = readFileSync(join(workspace, ".amc", "industry-packs-access.json"), "utf8");
    expect(raw).not.toContain(licenseKey);
  });

  test("legacy-shaped unsigned keys fail closed unless their digest is explicitly allowlisted", () => {
    const key = "AMC-INDUSTRY-PACKS-TESTKEY123";

    expect(verifyIndustryPackLicenseKey(key, {} as NodeJS.ProcessEnv)).toMatchObject({
      valid: false,
      reason: expect.stringMatching(/legacy|allowlist|signature|format/i),
    });

    const digest = "518ccf6ef3fbe1622babaa1e40276236a29bac755abd7cc1d67b4b97ac37ec2f";
    const allowed = verifyIndustryPackLicenseKey(key, {
      AMC_INDUSTRY_PACKS_LEGACY_KEY_SHA256_ALLOWLIST: digest,
    } as NodeJS.ProcessEnv);
    expect(allowed.valid).toBe(true);
  });

  test("signed licenses verify locally and carry subscription metadata", () => {
    const workspace = createWorkspace();
    configureLicenseKeys();
    const licenseKey = createIndustryPackLicenseKey({
      customerId: "cus_123",
      subscriptionId: "sub_123",
      expiresAt: "2099-01-01T00:00:00.000Z"
    });

    const verification = verifyIndustryPackLicenseKey(licenseKey);
    const entitlement = activateIndustryPackAccess({ workspace, licenseKey });

    expect(verification.valid).toBe(true);
    expect(verification.payload?.subscriptionId).toBe("sub_123");
    expect(entitlement.active).toBe(true);
    expect(entitlement.subscriptionId).toBe("sub_123");
    expect(entitlement.expiresAt).toBe("2099-01-01T00:00:00.000Z");
    const raw = readFileSync(join(workspace, ".amc", "industry-packs-access.json"), "utf8");
    expect(raw).not.toContain(licenseKey);
  });

  test("signed licenses reject tampering and expiry", () => {
    configureLicenseKeys();
    const activeKey = createIndustryPackLicenseKey({
      subscriptionId: "sub_123",
      expiresAt: "2099-01-01T00:00:00.000Z"
    });
    const expiredKey = createIndustryPackLicenseKey({
      subscriptionId: "sub_old",
      expiresAt: "2000-01-01T00:00:00.000Z"
    });

    expect(verifyIndustryPackLicenseKey(`${activeKey}x`).valid).toBe(false);
    expect(verifyIndustryPackLicenseKey(expiredKey).valid).toBe(false);
    expect(verifyIndustryPackLicenseKey(expiredKey).reason).toMatch(/expired/);
  });

  test("expired local entitlement returns locked state", () => {
    const workspace = createWorkspace();
    mkdirSync(join(workspace, ".amc"), { recursive: true });
    writeFileSync(join(workspace, ".amc", "industry-packs-access.json"), JSON.stringify({
      active: true,
      planId: "industry-packs-monthly",
      expiresAt: "2000-01-01T00:00:00.000Z",
      licenseKeySha256: "redacted"
    }));

    const entitlement = getIndustryPackEntitlement(workspace, {} as NodeJS.ProcessEnv);
    expect(entitlement.active).toBe(false);
    expect(entitlement.source).toBe("none");
  });

  test("forged active local entitlement and tampered signed proof both fail closed", () => {
    const workspace = createWorkspace();
    configureLicenseKeys();
    mkdirSync(join(workspace, ".amc"), { recursive: true });
    const accessPath = join(workspace, ".amc", "industry-packs-access.json");
    writeFileSync(accessPath, JSON.stringify({
      active: true,
      planId: "industry-packs-monthly",
      expiresAt: "2099-01-01T00:00:00.000Z",
    }));
    expect(getIndustryPackEntitlement(workspace).active).toBe(false);

    const licenseKey = createIndustryPackLicenseKey({ expiresAt: "2099-01-01T00:00:00.000Z" });
    activateIndustryPackAccess({ workspace, licenseKey });
    const stored = JSON.parse(readFileSync(accessPath, "utf8")) as Record<string, unknown>;
    stored.licenseSignature = `${String(stored.licenseSignature)}x`;
    writeFileSync(accessPath, JSON.stringify(stored));
    expect(getIndustryPackEntitlement(workspace).active).toBe(false);
  });

  test("online activation fails closed when verification is offline", async () => {
    const workspace = createWorkspace();
    await expect(activateIndustryPackAccessOnline({
      workspace,
      licenseKey: "not-a-license",
      fetchImpl: async () => {
        throw new Error("offline");
      }
    })).rejects.toThrow(/offline/);
    expect(getIndustryPackEntitlement(workspace, {} as NodeJS.ProcessEnv).active).toBe(false);
  });

  test("default public checkout state fails closed instead of presenting a non-checkout URL", () => {
    const workspace = createWorkspace();
    const entitlement = getIndustryPackEntitlement(workspace, {} as NodeJS.ProcessEnv);

    expect(entitlement.checkoutAvailable).toBe(false);
    expect(entitlement.message).toMatch(/not (publicly )?(available|configured)|planned/i);
    expect(() => buildIndustryPackCheckoutUrl({ env: {} as NodeJS.ProcessEnv })).toThrow(
      /checkout.*not configured|not.*available/i,
    );
  });

  test("checkout URLs include the Industry Packs plan and return targets", () => {
    process.env.AMC_INDUSTRY_PACKS_CHECKOUT_URL = "https://payments.example.test/checkout";
    const url = new URL(buildIndustryPackCheckoutUrl({
      successUrl: "https://agentmaturity.co/success",
      cancelUrl: "https://agentmaturity.co/pricing",
      customerEmail: "buyer@example.com",
      clientReferenceId: "agent-123"
    }));

    expect(url.origin).toBe("https://payments.example.test");
    expect(url.searchParams.get("plan")).toBe("industry-packs-monthly");
    expect(url.searchParams.get("price")).toBe("19");
    expect(url.searchParams.get("success_url")).toBe("https://agentmaturity.co/success");
    expect(url.searchParams.get("client_reference_id")).toBe("agent-123");
  });

  test("checkout rejects malformed and non-HTTPS provider URLs", () => {
    expect(() => buildIndustryPackCheckoutUrl({
      env: { AMC_INDUSTRY_PACKS_CHECKOUT_URL: "not-a-url" } as NodeJS.ProcessEnv,
    })).toThrow(/checkout.*url|valid.*https/i);
    expect(() => buildIndustryPackCheckoutUrl({
      env: { AMC_INDUSTRY_PACKS_CHECKOUT_URL: "http://payments.example.test/checkout" } as NodeJS.ProcessEnv,
    })).toThrow(/https/i);
  });
});
