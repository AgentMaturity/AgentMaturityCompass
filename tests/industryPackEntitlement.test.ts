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

afterEach(() => {
  delete process.env.AMC_INDUSTRY_PACKS_ACTIVE;
  delete process.env.AMC_DOMAIN_PACKS_ACTIVE;
  delete process.env.AMC_INDUSTRY_PACKS_LICENSE_KEY;
  delete process.env.AMC_DOMAIN_PACKS_LICENSE_KEY;
  delete process.env.AMC_INDUSTRY_PACKS_LICENSE_SECRET;
  delete process.env.AMC_DOMAIN_PACKS_LICENSE_SECRET;
  delete process.env.AMC_INDUSTRY_PACKS_CHECKOUT_URL;
  delete process.env.AMC_DOMAIN_PACKS_CHECKOUT_URL;
  while (workspaces.length > 0) {
    const workspace = workspaces.pop();
    if (workspace) rmSync(workspace, { recursive: true, force: true });
  }
});

describe("industry pack entitlement", () => {
  test("catalog exposes exactly 40 locked industry packs by default", () => {
    const workspace = createWorkspace();
    const entitlement = getIndustryPackEntitlement(workspace, {} as NodeJS.ProcessEnv);
    const catalog = listIndustryPacks().map((pack) => toIndustryPackCatalogItem(pack, entitlement));

    expect(catalog).toHaveLength(40);
    expect(catalog.every((pack) => pack.locked)).toBe(true);
    expect(new Set(catalog.map((pack) => pack.packId)).size).toBe(40);
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

  test("environment entitlement unlocks all pack metadata", () => {
    const workspace = createWorkspace();
    process.env.AMC_INDUSTRY_PACKS_ACTIVE = "1";
    const entitlement = getIndustryPackEntitlement(workspace);
    const pack = getIndustryPack("clinical-trials");
    const catalog = toIndustryPackCatalogItem(pack, entitlement);

    expect(entitlement.active).toBe(true);
    expect(catalog.locked).toBe(false);
    expect(catalog.regulatoryBasis?.length).toBeGreaterThan(0);
  });

  test("activation writes a local entitlement without storing the raw key", () => {
    const workspace = createWorkspace();
    const entitlement = activateIndustryPackAccess({
      workspace,
      licenseKey: "AMC-INDUSTRY-PACKS-TESTKEY123"
    });

    expect(entitlement.active).toBe(true);
    expect(entitlement.source).toBe("file");
    const raw = readFileSync(join(workspace, ".amc", "industry-packs-access.json"), "utf8");
    expect(raw).not.toContain("TESTKEY123");
  });

  test("signed licenses verify locally and carry subscription metadata", () => {
    const workspace = createWorkspace();
    process.env.AMC_INDUSTRY_PACKS_LICENSE_SECRET = "test-secret";
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
    process.env.AMC_INDUSTRY_PACKS_LICENSE_SECRET = "test-secret";
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
    expect(url.searchParams.get("price")).toBe("9.99");
    expect(url.searchParams.get("success_url")).toBe("https://agentmaturity.co/success");
    expect(url.searchParams.get("client_reference_id")).toBe("agent-123");
  });
});
