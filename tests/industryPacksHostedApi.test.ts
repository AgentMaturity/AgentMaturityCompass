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
const { INDUSTRY_PACKS_FREE_MESSAGE, INDUSTRY_PACKS_FREE_PLAN_ID, verifyIndustryPackLicenseKey } = await import("../src/domains/industryPackEntitlement.js");

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

function configureIssuing(): { publicKeyPem: string; adminToken: string } {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const adminToken = randomBytes(24).toString("hex");
  vi.stubEnv("AMC_INDUSTRY_PACKS_LICENSE_PRIVATE_KEY", privateKey.export({ type: "pkcs8", format: "pem" }).toString());
  vi.stubEnv("AMC_INDUSTRY_PACKS_ADMIN_TOKEN", adminToken);
  return { publicKeyPem: publicKey.export({ type: "spki", format: "pem" }).toString(), adminToken };
}

describe("hosted Industry Packs are free", () => {
  const FREE = {
    planId: INDUSTRY_PACKS_FREE_PLAN_ID, priceUsdMonthly: "0.00", checkoutAvailable: false, checkoutUrl: null, message: INDUSTRY_PACKS_FREE_MESSAGE
  };

  it("access and checkout return the free record, with no price or purchase URL, whatever checkout or issuing is configured", async () => {
    for (const configure of [() => undefined, () => {
      vi.stubEnv("AMC_INDUSTRY_PACKS_CHECKOUT_URL", "https://checkout.example.invalid/amc");
      configureIssuing();
    }]) {
      configure();
      const access = await fetch(`${origin}/api/industry-packs/access`);
      expect(access.status).toBe(200);
      expect(await access.json()).toEqual(FREE);
      const checkout = await fetch(`${origin}/api/industry-packs/checkout`, { method: "POST", body: JSON.stringify({ clientReferenceId: "agent-1" }) });
      expect(checkout.status).toBe(200);
      expect(await checkout.json()).toEqual(FREE);
    }
  });

  it("health and the endpoint list name the free plan", async () => {
    expect(await (await fetch(`${origin}/api/health`)).json())
      .toMatchObject({ industryPacksPlan: INDUSTRY_PACKS_FREE_PLAN_ID, industryPacksPriceUsdMonthly: "0.00" });
    const { endpoints } = await (await fetch(`${origin}/api`)).json() as { endpoints: Record<string, string> };
    expect(endpoints["GET /api/industry-packs/access"]).toMatch(/free/i);
    expect(endpoints["POST /api/industry-packs/checkout"]).toMatch(/free/i);
    expect(Object.values(endpoints).join("\n")).not.toMatch(/paid customer|\$\d/i);
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

// LIVE-RUNTIME-16: a fixed licence-issue error, and a per-client POST limiter that can read the platform proxy's header.
// The socket-keyed case runs last: it uses up 127.0.0.1's bucket for the rest of the minute.
describe("hosted API error text and rate limit", () => {
  it("a broken issuing key answers the fixed 503 and never echoes the key", async () => {
    const { adminToken } = configureIssuing();
    vi.stubEnv("AMC_INDUSTRY_PACKS_LICENSE_PRIVATE_KEY", "-----BEGIN PRIVATE KEY-----\nNOT-A-REAL-KEY-7F3A\n-----END PRIVATE KEY-----");
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = await fetch(`${origin}/api/industry-packs/license/issue`, { method: "POST", headers: { "x-amc-admin-token": adminToken },
      body: JSON.stringify({ subscriptionId: "sub_1", expiresAt: "2099-01-01T00:00:00.000Z" }) });
    const text = await response.text();
    expect(response.status).toBe(503);
    expect(JSON.parse(text)).toEqual({ error: "licence issuing is not configured",
      requiredEnv: ["AMC_INDUSTRY_PACKS_LICENSE_PRIVATE_KEY", "AMC_INDUSTRY_PACKS_ADMIN_TOKEN"] });
    expect(text).not.toContain("NOT-A-REAL-KEY");
    expect(logged).toHaveBeenCalled();
  });

  const quickscores = async (count: number, headerFor: (index: number) => Record<string, string>): Promise<number[]> => {
    const statuses: number[] = [];
    for (let index = 0; index < count; index += 1) {
      statuses.push((await fetch(`${origin}/api/quickscore`, { method: "POST", headers: headerFor(index),
        body: JSON.stringify({ agentId: "a", responses: {} }) })).status);
    }
    return statuses;
  };

  it("with AMC_API_TRUSTED_CLIENT_IP_HEADER set, clients are told apart by that header", async () => {
    vi.stubEnv("AMC_API_TRUSTED_CLIENT_IP_HEADER", "x-test-client-ip");
    expect(await quickscores(121, (index) => ({ "x-test-client-ip": index % 2 === 0 ? "198.51.100.1" : "198.51.100.2" }))).not.toContain(429);
    const one = await quickscores(121, () => ({ "x-test-client-ip": "198.51.100.3" }));
    expect(one.at(-1)).toBe(429);
    expect(one.filter((status) => status === 429)).toHaveLength(1);
  }, 120_000);

  it("without it, one socket address is one client: the 121st POST in a minute is refused", async () => {
    const statuses = await quickscores(121, () => ({}));
    expect(statuses.at(-1)).toBe(429);
  }, 120_000);

  // Each case posts to its own route: buckets are per route and client (SR-7), so the cases do not share one.
  const posts = async (path: string, count: number, headerFor: (index: number) => Record<string, string>): Promise<number[]> => {
    const statuses: number[] = [];
    for (let index = 0; index < count; index += 1) {
      statuses.push((await fetch(`${origin}${path}`, { method: "POST", headers: headerFor(index), body: "{}" })).status);
    }
    return statuses;
  };

  // SR-6: the key was the left-most X-Forwarded-For entry (or the header's first value), which the client writes.
  it("spoofed left-most X-Forwarded-For entries share the bucket of the client the platform appended", async () => {
    vi.stubEnv("AMC_API_TRUSTED_PROXY_HOPS", "1");
    const statuses = await posts("/api/industry-packs/checkout", 121, (index) => ({ "x-forwarded-for": `10.66.${index % 250}.1, 198.51.100.21` }));
    expect(statuses.at(-1)).toBe(429);
    expect(statuses.filter((status) => status === 429)).toHaveLength(1);
  }, 120_000);

  it("a trusted header whose value is not one IP address is not believed: rotating it buys no fresh bucket", async () => {
    vi.stubEnv("AMC_API_TRUSTED_CLIENT_IP_HEADER", "x-test-client-ip");
    const statuses = await posts("/api/industry-packs/license/verify", 121, (index) => ({ "x-test-client-ip": `10.67.${index % 250}.1, 198.51.100.22` }));
    expect(statuses.at(-1)).toBe(429);
  }, 120_000);

  // SR-7: one anonymous bucket covered every POST, so a flood on a public route starved the signed webhook and admin issue.
  it("a public-route flood does not 429 a valid signed webhook or the admin route", async () => {
    expect((await quickscores(121, () => ({}))).at(-1), "this client's quickscore bucket is spent").toBe(429);
    const secret = `whsec_${randomBytes(16).toString("hex")}`;
    vi.stubEnv("AMC_INDUSTRY_PACKS_WEBHOOK_SECRET", secret);
    const raw = '{"id":"evt_flood","type":"checkout.session.completed","data":{"object":{"payment_status":"unpaid"}}}';
    const unsigned = await posts("/api/industry-packs/webhook", 121, () => ({ "content-type": "application/json" }));
    expect(unsigned.every((status) => status === 400), "a flood of unsigned deliveries is refused by the signature check").toBe(true);
    const t = Math.floor(Date.now() / 1000);
    const signature = `t=${t},v1=${createHmac("sha256", secret).update(`${t}.${raw}`).digest("hex")}`;
    const webhook = await fetch(`${origin}/api/industry-packs/webhook`, { method: "POST", headers: { "content-type": "application/json", "stripe-signature": signature }, body: raw });
    expect(webhook.status).toBe(200);
    const { adminToken } = configureIssuing();
    const issued = await fetch(`${origin}/api/industry-packs/license/issue`, { method: "POST", headers: { "x-amc-admin-token": adminToken },
      body: JSON.stringify({ subscriptionId: "sub_flood", expiresAt: "2099-01-01T00:00:00.000Z" }) });
    expect(issued.status).toBe(200);
  }, 120_000);

  // SR-12: with no client named behind a platform proxy the limiter switched off, which failed open. Now every client there
  // shares one bucket per route with a higher ceiling, and the admin licence route is limited like the rest.
  it("on a platform proxy with no client named, every client shares one bucket per route at 1,200 a minute, said once", async () => {
    vi.stubEnv("VERCEL", "1");
    const warned = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const checkout = await posts("/api/industry-packs/checkout", 1_201, (index) => ({ "x-forwarded-for": `198.51.100.${index % 250}` }));
    expect(checkout.filter((status) => status === 429)).toEqual([429]);
    expect(checkout.at(-1)).toBe(429);
    const issue = await posts("/api/industry-packs/license/issue", 1_201, () => ({}));
    expect(issue.slice(0, -1).every((status) => status === 401)).toBe(true);
    expect(issue.at(-1), "the admin licence route is always limited").toBe(429);
    expect(warned).toHaveBeenCalledTimes(1);
  }, 120_000);

  // SR-13: the bucket key embedded the raw path, so every distinct path was a fresh bucket and a new key in the store.
  it("1,000 distinct unknown POST paths from one client share one bucket, apart from the known routes", async () => {
    vi.stubEnv("AMC_API_TRUSTED_CLIENT_IP_HEADER", "x-test-client-ip");
    const client = { "x-test-client-ip": "198.51.100.40" };
    const statuses: number[] = [];
    for (let index = 0; index < 1_000; index += 1) {
      statuses.push((await fetch(`${origin}/api/unknown-${index}`, { method: "POST", headers: client, body: "{}" })).status);
    }
    expect(statuses.filter((status) => status === 404)).toHaveLength(120);
    expect(statuses.filter((status) => status === 429)).toHaveLength(880);
    expect((await fetch(`${origin}/api/quickscore`, { method: "POST", headers: client, body: JSON.stringify({ agentId: "a", responses: {} }) })).status).toBe(200);
  }, 120_000);
});
