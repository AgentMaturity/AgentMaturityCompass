import { generateKeyPairSync } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  activateIndustryPackAccess,
  buildIndustryPackCheckoutUrl,
  createIndustryPackLicenseKey,
  assertIndustryPackAccess,
  formatIndustryPackPaywallMessage,
  getIndustryPackEntitlement,
  INDUSTRY_PACKS_MONTHLY_PRICE_USD,
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

describe("industry pack entitlement", () => {
  test("catalog exposes every industry pack, locked, by default", () => {
    const entitlement = getIndustryPackEntitlement(createWorkspace(), unpinnedEnv());
    const catalog = listIndustryPacks().map((pack) => toIndustryPackCatalogItem(pack, entitlement));

    expect(catalog).toHaveLength(listIndustryPacks().length);
    expect(catalog.every((pack) => pack.locked)).toBe(true);
    expect(new Set(catalog.map((pack) => pack.packId)).size).toBe(catalog.length);
  });

  test("a locked pack still shows its name, its own description and its regulatory basis", () => {
    const entitlement = getIndustryPackEntitlement(createWorkspace(), unpinnedEnv());
    const pack = getIndustryPack("clinical-trials");
    const catalog = toIndustryPackCatalogItem(pack, entitlement);

    expect(entitlement.active).toBe(false);
    expect(catalog.locked).toBe(true);
    expect(catalog.name).toBe(pack.name);
    expect(catalog.description).toBe(pack.description);
    expect(catalog.regulatoryBasis).toEqual(pack.regulatoryBasis);
    expect(catalog.complianceFrameworks).toEqual(pack.complianceFrameworks);
    expect(catalog.questionCount).toBe(pack.questions.length);
  });

  test("unsigned environment flags cannot unlock packs", () => {
    const entitlement = getIndustryPackEntitlement(createWorkspace(), unpinnedEnv({ AMC_INDUSTRY_PACKS_ACTIVE: "1" }));
    expect(entitlement.active).toBe(false);
  });

  test("a public key, HMAC secret or legacy allowlist the client supplies never unlocks packs", () => {
    const keys = operatorEnvKeys();
    const signed = createIndustryPackLicenseKey({ expiresAt: "2099-01-01T00:00:00.000Z", env: keys as NodeJS.ProcessEnv });
    const legacy = "AMC-INDUSTRY-PACKS-TESTKEY123";
    const legacyDigest = "518ccf6ef3fbe1622babaa1e40276236a29bac755abd7cc1d67b4b97ac37ec2f";
    for (const env of [
      unpinnedEnv({ ...keys, AMC_INDUSTRY_PACKS_LICENSE_KEY: signed }),
      unpinnedEnv({ AMC_INDUSTRY_PACKS_LICENSE_SECRET: "client-secret", AMC_INDUSTRY_PACKS_LICENSE_KEY: signed }),
      unpinnedEnv({ AMC_INDUSTRY_PACKS_LEGACY_KEY_SHA256_ALLOWLIST: legacyDigest, AMC_INDUSTRY_PACKS_LICENSE_KEY: legacy })
    ]) {
      const entitlement = getIndustryPackEntitlement(createWorkspace(), env);
      expect(entitlement.active).toBe(false);
      expect(entitlement.licenseVerificationConfigured).toBe(false);
    }
  });

  test("a licence signed by a key pinned in the operator trust list unlocks packs", () => {
    const licence = pinnedLicence();
    const entitlement = getIndustryPackEntitlement(createWorkspace(), { ...licence.env } as NodeJS.ProcessEnv);
    expect(entitlement).toMatchObject({ active: true, source: "env", licenseVerificationConfigured: true, subscriptionId: "sub_test" });

    const other = pinnedLicence();
    const forged = getIndustryPackEntitlement(createWorkspace(),
      { AMC_HOME: other.amcHome, AMC_INDUSTRY_PACKS_LICENSE_KEY: licence.licenseKey } as NodeJS.ProcessEnv);
    expect(forged.active).toBe(false);
    expect(forged.licenseVerificationConfigured).toBe(true);
    expect(forged.message).toContain("The environment licence was refused: the licence is not signed by a pinned Industry Packs licence key.");
  });

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

    expect(entitlement.active).toBe(true);
    expect(entitlement.source).toBe("file");
    expect(entitlement.subscriptionId).toBe("sub_test");
    expect(entitlement.expiresAt).toBe("2099-01-01T00:00:00.000Z");
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

    expect(getIndustryPackEntitlement(createWorkspace(),
      { AMC_HOME: active.amcHome, AMC_INDUSTRY_PACKS_LICENSE_KEY: `${active.licenseKey}x` } as NodeJS.ProcessEnv).active).toBe(false);
    expect(getIndustryPackEntitlement(createWorkspace(), { ...expired.env } as NodeJS.ProcessEnv).active).toBe(false);
    expect(() => activateIndustryPackAccess({ workspace: createWorkspace(), licenseKey: expired.licenseKey, env: { AMC_HOME: expired.amcHome } }))
      .toThrow(/expired/);
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

    const entitlement = getIndustryPackEntitlement(workspace, unpinnedEnv());
    expect(entitlement.active).toBe(false);
    expect(entitlement.source).toBe("none");
  });

  test("forged active local entitlement and tampered signed proof both fail closed", () => {
    const workspace = createWorkspace();
    const licence = pinnedLicence();
    const env = { AMC_HOME: licence.amcHome } as NodeJS.ProcessEnv;
    mkdirSync(join(workspace, ".amc"), { recursive: true });
    const accessPath = join(workspace, ".amc", "industry-packs-access.json");
    writeFileSync(accessPath, JSON.stringify({
      active: true,
      planId: "industry-packs-monthly",
      expiresAt: "2099-01-01T00:00:00.000Z",
    }));
    expect(getIndustryPackEntitlement(workspace, env).active).toBe(false);

    activateIndustryPackAccess({ workspace, licenseKey: licence.licenseKey, env });
    const stored = JSON.parse(readFileSync(accessPath, "utf8")) as Record<string, unknown>;
    stored.licenseSignature = `${String(stored.licenseSignature)}x`;
    writeFileSync(accessPath, JSON.stringify(stored));
    expect(getIndustryPackEntitlement(workspace, env).active).toBe(false);
  });

  test("a broken trust configuration keeps packs locked and says why", () => {
    const home = createWorkspace();
    mkdirSync(join(home, "trust"), { recursive: true });
    writeFileSync(join(home, "trust", "amc-trust-list.json"), "{}");
    const entitlement = getIndustryPackEntitlement(createWorkspace(), { AMC_HOME: home } as NodeJS.ProcessEnv);
    expect(entitlement.active).toBe(false);
    expect(entitlement.licenseVerificationConfigured).toBe(false);
    expect(entitlement.message).toMatch(/trust configuration could not be read/);
  });
});

describe("the paywall tells the truth", () => {
  test("without checkout or a pinned key: what is locked, the price and no purchase step", () => {
    const entitlement = getIndustryPackEntitlement(createWorkspace(), unpinnedEnv());
    const text = formatIndustryPackPaywallMessage(entitlement);

    expect(entitlement).toMatchObject({ checkoutAvailable: false, checkoutUrl: null, licenseVerificationConfigured: false });
    expect(entitlement.message).toBe(text);
    expect(text).toMatch(/^Industry Packs are locked/);
    expect(text).toContain("amc domain pack describe");
    expect(text).toContain("amc_score_sector_pack");
    expect(text).toContain(`US$${INDUSTRY_PACKS_MONTHLY_PRICE_USD}/month`);
    expect(text).toMatch(/never changes a score/);
    expect(text).toContain("Checkout is not available in this deployment; contact sales for access.");
    expect(text).toMatch(/licence verification is not configured/i);
    expect(text).not.toMatch(/https?:\/\//);
    expect(text).not.toMatch(/activate --key|Buy:|subscribe/i);
  });

  test("a checkout URL without a pinned licence key is still no purchase step", () => {
    const entitlement = getIndustryPackEntitlement(createWorkspace(),
      unpinnedEnv({ AMC_INDUSTRY_PACKS_CHECKOUT_URL: "https://payments.example.test/checkout" }));
    expect(entitlement).toMatchObject({ checkoutAvailable: false, checkoutUrl: null });
    expect(entitlement.message).not.toContain("payments.example.test");
    expect(entitlement.message).toContain("Checkout is not available in this deployment");
  });

  test("a pinned key without checkout offers activation of a licence already held, not a purchase", () => {
    const licence = pinnedLicence();
    const entitlement = getIndustryPackEntitlement(createWorkspace(), { AMC_HOME: licence.amcHome } as NodeJS.ProcessEnv);
    expect(entitlement).toMatchObject({ active: false, checkoutAvailable: false, licenseVerificationConfigured: true });
    expect(entitlement.message).toContain("Checkout is not available in this deployment; contact sales for access.");
    expect(entitlement.message).toContain("If you already hold a licence: amc domain pack activate --key <licence-key>");
    expect(entitlement.message).not.toMatch(/Buy:/);
  });

  test("checkout and a pinned key together show the purchase and activation steps", () => {
    const licence = pinnedLicence();
    const entitlement = getIndustryPackEntitlement(createWorkspace(),
      { AMC_HOME: licence.amcHome, AMC_INDUSTRY_PACKS_CHECKOUT_URL: "https://payments.example.test/checkout" } as NodeJS.ProcessEnv);
    expect(entitlement).toMatchObject({ checkoutAvailable: true, checkoutUrl: "https://payments.example.test/checkout" });
    expect(entitlement.message).toContain("Buy: https://payments.example.test/checkout");
    expect(entitlement.message).toContain("Then activate it: amc domain pack activate --key <licence-key>");
    expect(entitlement.message).not.toContain("contact sales");
  });

  test("the access error carries the same text", () => {
    const workspace = createWorkspace();
    const env = unpinnedEnv();
    expect(() => assertIndustryPackAccess(workspace, env)).toThrow(getIndustryPackEntitlement(workspace, env).message);
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

describe("checkout URL", () => {
  test("default public checkout state fails closed instead of presenting a non-checkout URL", () => {
    expect(() => buildIndustryPackCheckoutUrl({ env: {} as NodeJS.ProcessEnv })).toThrow(
      /checkout.*not configured|not.*available/i,
    );
  });

  test("checkout URLs include the Industry Packs plan and return targets", () => {
    const url = new URL(buildIndustryPackCheckoutUrl({
      successUrl: "https://agentmaturity.co/success",
      cancelUrl: "https://agentmaturity.co/pricing",
      customerEmail: "buyer@example.com",
      clientReferenceId: "agent-123",
      env: { AMC_INDUSTRY_PACKS_CHECKOUT_URL: "https://payments.example.test/checkout" } as NodeJS.ProcessEnv
    }));

    expect(url.origin).toBe("https://payments.example.test");
    expect(url.searchParams.get("plan")).toBe("industry-packs-monthly");
    expect(url.searchParams.get("price")).toBe(INDUSTRY_PACKS_MONTHLY_PRICE_USD);
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
