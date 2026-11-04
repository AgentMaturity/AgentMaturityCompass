import http from "node:http";
import { createHmac, generateKeyPairSync, randomBytes } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// A pass-through spy: the admin token compare must go through crypto.timingSafeEqual (P1-51).
const spy = vi.hoisted(() => ({ timingSafeEqual: vi.fn() }));
vi.mock("node:crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:crypto")>();
  spy.timingSafeEqual.mockImplementation(actual.timingSafeEqual);
  return { ...actual, default: { ...actual, timingSafeEqual: spy.timingSafeEqual }, timingSafeEqual: spy.timingSafeEqual };
});

const { handleRequest } = await import("../api/index.js");
const { INDUSTRY_PACKS_MONTHLY_PRICE_USD, verifyIndustryPackLicenseKey } = await import("../src/domains/industryPackEntitlement.js");

const server = http.createServer(handleRequest);
let origin: string;
beforeAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing API listen address");
  origin = `http://127.0.0.1:${address.port}`;
});
afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
});

const ISSUING_ENV = ["AMC_INDUSTRY_PACKS_CHECKOUT_URL", "AMC_DOMAIN_PACKS_CHECKOUT_URL", "AMC_INDUSTRY_PACKS_LICENSE_PRIVATE_KEY",
  "AMC_DOMAIN_PACKS_LICENSE_PRIVATE_KEY", "AMC_INDUSTRY_PACKS_LICENSE_SECRET", "AMC_INDUSTRY_PACKS_ADMIN_TOKEN",
  "AMC_INDUSTRY_PACKS_WEBHOOK_SECRET"] as const;
beforeEach(() => { for (const key of ISSUING_ENV) vi.stubEnv(key, undefined); });
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

const NOT_AVAILABLE = "Checkout is not available in this deployment; contact sales for access.";

function configureIssuing(): { publicKeyPem: string; adminToken: string } {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const adminToken = randomBytes(24).toString("hex");
  vi.stubEnv("AMC_INDUSTRY_PACKS_CHECKOUT_URL", "https://checkout.example.invalid/amc");
  vi.stubEnv("AMC_INDUSTRY_PACKS_LICENSE_PRIVATE_KEY", privateKey.export({ type: "pkcs8", format: "pem" }).toString());
  vi.stubEnv("AMC_INDUSTRY_PACKS_ADMIN_TOKEN", adminToken);
  return { publicKeyPem: publicKey.export({ type: "spki", format: "pem" }).toString(), adminToken };
}

describe("hosted Industry Packs checkout tells the truth", () => {
  it("unconfigured: access and checkout say checkout is not available, with the one price and no purchase URL", async () => {
    const access = await (await fetch(`${origin}/api/industry-packs/access`)).json();
    expect(access).toMatchObject({ checkoutAvailable: false, checkoutUrl: null, priceUsdMonthly: INDUSTRY_PACKS_MONTHLY_PRICE_USD });
    expect(access).not.toHaveProperty("entitlement");
    expect(access.message).toContain(NOT_AVAILABLE);
    expect(access.message).not.toMatch(/https?:\/\//);

    const checkout = await fetch(`${origin}/api/industry-packs/checkout`, { method: "POST", body: "{}" });
    expect(checkout.status).toBe(503);
    const body = await checkout.json();
    expect(body).toMatchObject({ error: "checkout_not_available", checkoutAvailable: false });
    expect(body.message).toContain(NOT_AVAILABLE);
    expect(body.checkoutUrl).toBeNull();
  });

  it("a checkout URL alone is no purchase step: no licence could be issued for the payment", async () => {
    vi.stubEnv("AMC_INDUSTRY_PACKS_CHECKOUT_URL", "https://checkout.example.invalid/amc");
    const access = await (await fetch(`${origin}/api/industry-packs/access`)).json();
    expect(access).toMatchObject({ checkoutAvailable: false, checkoutUrl: null });
    expect((await fetch(`${origin}/api/industry-packs/checkout`, { method: "POST", body: "{}" })).status).toBe(503);
  });

  it("configured: the checkout handoff carries the plan and the one price", async () => {
    configureIssuing();
    const access = await (await fetch(`${origin}/api/industry-packs/access`)).json();
    expect(access.checkoutAvailable).toBe(true);
    expect(access.message).toContain("Buy: https://checkout.example.invalid/amc");
    const checkout = await fetch(`${origin}/api/industry-packs/checkout`, { method: "POST", body: JSON.stringify({ clientReferenceId: "agent-1" }) });
    expect(checkout.status).toBe(200);
    const url = new URL((await checkout.json()).checkoutUrl);
    expect(url.searchParams.get("price")).toBe(INDUSTRY_PACKS_MONTHLY_PRICE_USD);
    expect(url.searchParams.get("client_reference_id")).toBe("agent-1");
  });
});

describe("licence issue is the admin path", () => {
  const issue = (headers: Record<string, string>) => fetch(`${origin}/api/industry-packs/license/issue`,
    { method: "POST", headers, body: JSON.stringify({ subscriptionId: "sub_1", expiresAt: "2099-01-01T00:00:00.000Z" }) });

  it("compares the admin token in constant time and issues only to the right token", async () => {
    const { publicKeyPem, adminToken } = configureIssuing();
    spy.timingSafeEqual.mockClear();
    expect((await issue({ authorization: `Bearer ${"x".repeat(adminToken.length)}` })).status).toBe(401);
    expect(spy.timingSafeEqual).toHaveBeenCalled();
    expect((await issue({ "x-amc-admin-token": `${adminToken}x` })).status).toBe(401);
    expect((await issue({})).status).toBe(401);

    const issued = await issue({ authorization: `Bearer ${adminToken}` });
    expect(issued.status).toBe(200);
    const { licenseKey } = await issued.json();
    expect(verifyIndustryPackLicenseKey(licenseKey, { AMC_INDUSTRY_PACKS_LICENSE_PUBLIC_KEY: publicKeyPem } as NodeJS.ProcessEnv).valid).toBe(true);
  });

  it("refuses every token when no admin token is configured", async () => {
    expect((await issue({ authorization: "Bearer " })).status).toBe(401);
    expect((await issue({ "x-amc-admin-token": "undefined" })).status).toBe(401);
  });

  it("the webhook route is not an admin route: an admin token issues nothing there", async () => {
    const { adminToken } = configureIssuing();
    vi.stubEnv("AMC_INDUSTRY_PACKS_WEBHOOK_SECRET", "whsec_local_test");
    const response = await fetch(`${origin}/api/industry-packs/webhook`, {
      method: "POST", headers: { authorization: `Bearer ${adminToken}` }, body: JSON.stringify({ subscriptionId: "sub_1" })
    });
    expect(response.status).toBe(400);
    expect(await response.text()).not.toContain("AMC-INDUSTRY-PACKS.");
  });
});

describe("payment webhook: Stripe-Signature over the raw body, idempotent", () => {
  const secret = `whsec_${randomBytes(16).toString("hex")}`;
  const sign = (raw: string, t = Math.floor(Date.now() / 1000), key = secret) =>
    `t=${t},v1=${createHmac("sha256", key).update(`${t}.${raw}`).digest("hex")}`;
  const deliver = (raw: string, signature?: string) => fetch(`${origin}/api/industry-packs/webhook`, {
    method: "POST", headers: { "content-type": "application/json", ...(signature ? { "stripe-signature": signature } : {}) }, body: raw
  });
  const paidEvent = (id: string) => `{"id":"${id}",  "type":"checkout.session.completed","data":{"object":{"id":"cs_test_1",`
    + `"payment_status":"paid","customer":"cus_1","subscription":"sub_1","client_reference_id":"agent-1"}}}`;

  it("is not live until a webhook secret is configured", async () => {
    const raw = paidEvent("evt_unconfigured");
    const response = await deliver(raw, sign(raw));
    expect(response.status).toBe(503);
    expect((await response.json()).error).toMatch(/webhook is not configured/);
  });

  it("accepts the provider signature over the exact bytes received, and nothing else", async () => {
    vi.stubEnv("AMC_INDUSTRY_PACKS_WEBHOOK_SECRET", secret);
    const raw = paidEvent("evt_raw");
    const reserialized = JSON.stringify(JSON.parse(raw));
    expect(reserialized).not.toBe(raw);

    expect((await deliver(raw, sign(reserialized))).status).toBe(400);
    expect((await deliver(raw)).status).toBe(400);
    expect((await deliver(raw, sign(raw, undefined, "whsec_other"))).status).toBe(400);
    expect((await deliver(raw.replace("cus_1", "cus_2"), sign(raw))).status).toBe(400);
    expect((await deliver(raw, sign(raw, Math.floor(Date.now() / 1000) - 301))).status).toBe(400);

    const ok = await deliver(raw, `${sign(raw)},v1=${"0".repeat(64)}`);
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ received: true, eventId: "evt_raw", fulfilment: "licence_issue_pending_admin" });
  });

  it("records a paid checkout once however often it is delivered, and never issues a licence itself", async () => {
    vi.stubEnv("AMC_INDUSTRY_PACKS_WEBHOOK_SECRET", secret);
    configureIssuing();
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const raw = paidEvent("evt_idempotent");
    const first = await deliver(raw, sign(raw));
    const second = await deliver(raw, sign(raw));
    const firstBody = await first.json();
    const secondBody = await second.json();

    expect([first.status, second.status]).toEqual([200, 200]);
    expect(secondBody).toEqual({ ...firstBody, duplicate: true });
    const records = info.mock.calls.map(call => String(call[0])).filter(line => line.includes("evt_idempotent"));
    expect(records).toHaveLength(1);
    expect(JSON.parse(records[0]!)).toMatchObject({ event: "industry_packs_paid_checkout", customerId: "cus_1", subscriptionId: "sub_1" });
    expect(JSON.stringify([firstBody, secondBody, records])).not.toContain("AMC-INDUSTRY-PACKS.");
  });

  it("acknowledges other and unpaid events without recording a fulfilment", async () => {
    vi.stubEnv("AMC_INDUSTRY_PACKS_WEBHOOK_SECRET", secret);
    const unpaid = paidEvent("evt_unpaid").replace('"paid"', '"unpaid"');
    const other = '{"id":"evt_other","type":"customer.created","data":{"object":{}}}';
    for (const raw of [unpaid, other]) {
      const response = await deliver(raw, sign(raw));
      expect(response.status).toBe(200);
      expect((await response.json()).fulfilment).toBe("ignored");
    }
  });
});
