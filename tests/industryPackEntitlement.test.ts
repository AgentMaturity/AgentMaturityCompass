import { generateKeyPairSync } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  activateIndustryPackAccess,
  createIndustryPackLicenseKey,
  getIndustryPackEntitlement,
  hostedIndustryPackAccess,
  INDUSTRY_PACKS_FREE_MESSAGE,
  INDUSTRY_PACKS_FREE_PLAN_ID,
  toIndustryPackCatalogItem,
  verifyIndustryPackLicenseKey,
  verifyIndustryPackLicenseReport
} from "../src/domains/industryPackEntitlement.js";
import { loadTrustContext } from "../src/trust/index.js";
import { getIndustryPack, listIndustryPacks } from "../src/domains/industryPacks.js";
import { testIndustryPackLicence, type TestIndustryPackLicence } from "./helpers/industryPackLicence.js";

const workspaces: string[] = [];
const licences: TestIndustryPackLicence[] = [];

function createWorkspace(): string {
  const workspace = mkdtempSync(join(tmpdir(), "amc-industry-access-"));
  workspaces.push(workspace);
  return workspace;
}

/** A licence signed by a key the operator pinned in its AMC home trust list. */
function pinnedLicence(opts: Parameters<typeof testIndustryPackLicence>[0] = {}): TestIndustryPackLicence {
  const licence = testIndustryPackLicence(opts);
  licences.push(licence);
  return licence;
}

/** An AMC home with no trust list: nothing is pinned, so licence verification is not configured. */
function unpinnedEnv(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  return { AMC_HOME: createWorkspace(), ...extra } as NodeJS.ProcessEnv;
}

function operatorEnvKeys(): Record<string, string> {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  return {
    AMC_INDUSTRY_PACKS_LICENSE_PRIVATE_KEY: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    AMC_INDUSTRY_PACKS_LICENSE_PUBLIC_KEY: publicKey.export({ type: "spki", format: "pem" }).toString()
  };
}

afterEach(() => {
  while (licences.length > 0) licences.pop()?.cleanup();
  while (workspaces.length > 0) {
    const workspace = workspaces.pop();
    if (workspace) rmSync(workspace, { recursive: true, force: true });
  }
});

describe("Industry Packs are free", () => {
  test("every workspace has access with no licence, checkout or payment", () => {
    const entitlement = getIndustryPackEntitlement(createWorkspace(), unpinnedEnv());
    expect(entitlement).toMatchObject({
      active: true, source: "free", planId: INDUSTRY_PACKS_FREE_PLAN_ID, priceUsdMonthly: "0.00",
      checkoutAvailable: false, checkoutUrl: null, licenseVerificationConfigured: false, message: INDUSTRY_PACKS_FREE_MESSAGE
    });
    expect(entitlement.message).toMatch(/never changes a score/);
    expect(entitlement.message).not.toMatch(/https?:\/\/|Buy:|subscribe|locked|US\$/i);
  });

  test("the catalogue lists every pack, unlocked, with its own description and regulatory basis", () => {
    const entitlement = getIndustryPackEntitlement(createWorkspace(), unpinnedEnv());
    const catalog = listIndustryPacks().map((pack) => toIndustryPackCatalogItem(pack, entitlement));
    expect(catalog).toHaveLength(listIndustryPacks().length);
    expect(catalog.every((row) => row.locked === false)).toBe(true);
    expect(new Set(catalog.map((row) => row.packId)).size).toBe(catalog.length);
    const pack = getIndustryPack("clinical-trials");
    expect(toIndustryPackCatalogItem(pack)).toMatchObject({
      name: pack.name, description: pack.description, regulatoryBasis: pack.regulatoryBasis,
      complianceFrameworks: pack.complianceFrameworks, questionCount: pack.questions.length
    });
  });

  test("a licence, a checkout URL or a broken trust list changes nothing about access", () => {
    const licence = pinnedLicence();
    const home = createWorkspace();
    mkdirSync(join(home, "trust"), { recursive: true });
    writeFileSync(join(home, "trust", "amc-trust-list.json"), "{}");
    for (const env of [
      { ...licence.env },
      { AMC_HOME: licence.amcHome, AMC_INDUSTRY_PACKS_CHECKOUT_URL: "https://payments.example.test/checkout" },
      { AMC_HOME: home }
    ] as NodeJS.ProcessEnv[]) {
      expect(getIndustryPackEntitlement(createWorkspace(), env)).toMatchObject({ active: true, source: "free", checkoutUrl: null });
    }
    expect(getIndustryPackEntitlement(createWorkspace(), { AMC_HOME: licence.amcHome } as NodeJS.ProcessEnv).licenseVerificationConfigured).toBe(true);
  });

  test("the hosted API offers no checkout", () => {
    expect(hostedIndustryPackAccess()).toEqual({
      planId: INDUSTRY_PACKS_FREE_PLAN_ID, priceUsdMonthly: "0.00", checkoutAvailable: false, checkoutUrl: null, message: INDUSTRY_PACKS_FREE_MESSAGE
    });
  });
});

describe("legacy licences stay verifiable", () => {
  test("activation refuses when no licence key is pinned and writes no access file", () => {
    const workspace = createWorkspace();
    const licence = pinnedLicence({ pinned: false });
    expect(() => activateIndustryPackAccess({ workspace, licenseKey: licence.licenseKey, env: { AMC_HOME: licence.amcHome } }))
      .toThrow(/licence verification is not configured/i);
    expect(existsSync(join(workspace, ".amc", "industry-packs-access.json"))).toBe(false);
  });

  test("activation writes a local entitlement without storing the raw key", () => {
    const workspace = createWorkspace();
    const licence = pinnedLicence();
    const entitlement = activateIndustryPackAccess({ workspace, licenseKey: licence.licenseKey, env: { AMC_HOME: licence.amcHome } });

    expect(entitlement).toMatchObject({ active: true, source: "free", licenseVerificationConfigured: true });
    const stored = JSON.parse(readFileSync(join(workspace, ".amc", "industry-packs-access.json"), "utf8")) as Record<string, unknown>;
    expect(stored).toMatchObject({ subscriptionId: "sub_test", expiresAt: "2099-01-01T00:00:00.000Z" });
    const raw = readFileSync(join(workspace, ".amc", "industry-packs-access.json"), "utf8");
    expect(raw).not.toContain(licence.licenseKey);
    expect(getIndustryPackEntitlement(workspace, { AMC_HOME: licence.amcHome } as NodeJS.ProcessEnv).active).toBe(true);
  });

  test("legacy-shaped unsigned keys fail closed unless their digest is explicitly allowlisted on the issuing server", () => {
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

  test("issuing a licence needs an Ed25519 private key; an HMAC secret issues nothing", () => {
    expect(() => createIndustryPackLicenseKey({ env: { AMC_INDUSTRY_PACKS_LICENSE_SECRET: "s" } as NodeJS.ProcessEnv }))
      .toThrow(/AMC_INDUSTRY_PACKS_LICENSE_PRIVATE_KEY/);
  });

  test("signed licences reject tampering and expiry", () => {
    const active = pinnedLicence();
    const expired = pinnedLicence({ expiresAt: "2000-01-01T00:00:00.000Z" });
    const trust = loadTrustContext({ amcHome: active.amcHome });

    expect(verifyIndustryPackLicenseReport(`${active.licenseKey}x`, trust).valid).toBe(false);
    expect(verifyIndustryPackLicenseReport(expired.licenseKey, loadTrustContext({ amcHome: expired.amcHome })).valid).toBe(false);
    expect(() => activateIndustryPackAccess({ workspace: createWorkspace(), licenseKey: expired.licenseKey, env: { AMC_HOME: expired.amcHome } }))
      .toThrow(/expired/);
  });

});

describe("amc domain pack verify uses the same pinned key as the gate", () => {
  afterEach(() => vi.unstubAllEnvs());

  test("an environment public key is not a pin: without a trust-list key the verdict is not configured", () => {
    const keys = operatorEnvKeys();
    const licenseKey = createIndustryPackLicenseKey({ expiresAt: "2099-01-01T00:00:00.000Z", env: keys as NodeJS.ProcessEnv });
    vi.stubEnv("AMC_INDUSTRY_PACKS_LICENSE_PUBLIC_KEY", keys.AMC_INDUSTRY_PACKS_LICENSE_PUBLIC_KEY);
    const result = verifyIndustryPackLicenseReport(licenseKey, loadTrustContext({ amcHome: createWorkspace() }));
    expect(result.valid).toBe(false);
    expect(result.report.trusted).toBe(false);
    expect(result.reason).toMatch(/licence verification is not configured/i);
  });

  test("a licence signed by the trust-list key verifies; another key's licence does not", () => {
    const licence = pinnedLicence();
    const trust = loadTrustContext({ amcHome: licence.amcHome });
    const verified = verifyIndustryPackLicenseReport(licence.licenseKey, trust);
    expect(verified).toMatchObject({ valid: true, payload: { subscriptionId: "sub_test" } });
    expect(verified.report.trusted).toBe(true);
    const other = pinnedLicence();
    expect(verifyIndustryPackLicenseReport(other.licenseKey, trust).valid).toBe(false);
  });
});
