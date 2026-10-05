import http from "node:http";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { handleRequest, computeQuickScore } from "../api/index.js";
import { questionBank } from "../src/diagnostic/questionBank.js";
import { listAssurancePacks } from "../src/assurance/packs/index.js";
import { listIndustryPacks } from "../src/domains/industryPacks.js";

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

describe("standalone API compatibility and readiness", () => {
  it("reports actual catalogs/version rather than stale hardcoded counts", async () => {
    const response = await fetch(`${origin}/api/health`);
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      status: "ok", version: JSON.parse(readFileSync("package.json", "utf8")).version,
      questions: questionBank.length, assurancePacks: listAssurancePacks().length,
      sectorPacks: listIndustryPacks().length, moduleInventoryBasis: "compiled_js_files"
    });
    expect(body.modules).toBeGreaterThan(0);
  });
  it("preserves numeric scoring/clamping and identifies self-reported results", async () => {
    const input = { agentId: "legacy", responses: { "SO-01": 10, "SK-01": -1, "unrecognized": 5 } };
    const expected = computeQuickScore(input);
    const response = await fetch(`${origin}/api/quickscore`, { method: "POST", body: JSON.stringify(input) });
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body).toMatchObject({ ...expected, timestamp: expect.any(String), composite: 20,
      assessmentBasis: "self_reported", evidenceVerified: false, version: "2.0.0" });
    expect(body.dimensions["Strategic Agent Operations"].score).toBe(100);
    expect(body.dimensions.Skills.score).toBe(0);
  });
  it("refuses invalid response types without returning a fake numeric score", async () => {
    // JSON can overflow a number without containing a nonnumeric value.
    const overflow = await fetch(`${origin}/api/quickscore`, {
      method: "POST", body: '{"responses":{"SO-01":1e999}}'
    });
    expect(overflow.status).toBe(400);
    for (const responses of [null, [], { "SO-01": "not-a-level" }]) {
      const response = await fetch(`${origin}/api/quickscore`, {
        method: "POST", body: JSON.stringify({ agentId: "invalid", responses })
      });
      expect(response.status).toBe(400);
      expect(await response.json()).not.toHaveProperty("composite");
    }
  });
  it("bounds the quickscore body and remains usable after rejection", async () => {
    const response = await fetch(`${origin}/api/quickscore`, {
      method: "POST", body: JSON.stringify({ agentId: "large", metadata: { description: "x".repeat(1_048_576) } })
    });
    expect(response.status).toBe(413);
    expect((await fetch(`${origin}/api/health`)).status).toBe(200);
  });
  it("does not trust malformed Host values for routing", async () => {
    let receivedHost: string | undefined;
    server.once("request", request => { receivedHost = request.headers.host; });
    const response = await new Promise<{ status: number | undefined; body: string }>((resolve, reject) => {
      // Fetch may replace forbidden Host headers; send the actual wire value.
      const request = http.get(`${origin}/api/health`, { headers: { Host: "[" } }, incoming => {
        let body = "";
        incoming.setEncoding("utf8");
        incoming.on("data", chunk => { body += chunk; });
        incoming.on("error", reject);
        incoming.on("end", () => resolve({ status: incoming.statusCode, body }));
      });
      request.on("error", reject);
      request.setTimeout(5000, () => request.destroy(new Error("Host probe timed out")));
    });
    expect(receivedHost).toBe("[");
    expect(response.status).toBe(200);
    expect(JSON.parse(response.body).status).toBe("ok");
  });
  it("preserves catalog access, badge, discovery and unknown-route behavior", async () => {
    vi.stubEnv("AMC_INDUSTRY_PACKS_CHECKOUT_URL", "");
    try {
      const access = await fetch(`${origin}/api/industry-packs/access`, { signal: AbortSignal.timeout(5000) });
      expect(access.status).toBe(200);
      expect(await access.json()).toMatchObject({ checkoutUrl: null, checkoutAvailable: false });
      vi.stubEnv("AMC_INDUSTRY_PACKS_CHECKOUT_URL", "https://checkout.example.invalid/amc");
      const configured = await fetch(`${origin}/api/industry-packs/access`);
      const body = await configured.json();
      expect(body.checkoutAvailable).toBe(true);
      expect(body.checkoutUrl).toMatch(/^https:\/\/checkout\.example\.invalid\/amc\?/);
    } finally { vi.unstubAllEnvs(); }
    const badge = await fetch(`${origin}/api/badge/legacy`);
    expect(badge.status).toBe(200);
    expect(badge.headers.get("X-AMC-Score-Basis")).toBe("placeholder-not-measured");
    expect(await badge.text()).toContain("<svg");
    expect((await fetch(`${origin}/api`)).status).toBe(200);
    expect((await fetch(`${origin}/missing`)).status).toBe(404);
  });
});
