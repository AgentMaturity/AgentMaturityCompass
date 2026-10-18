import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { buildDashboard } from "../src/dashboard/build.js";
import { runDiagnostic } from "../src/diagnostic/runner.js";
import { INDUSTRY_PACKS_CHECKOUT_NOT_AVAILABLE, INDUSTRY_PACKS_MONTHLY_PRICE_USD } from "../src/domains/industryPackEntitlement.js";
import { listIndustryPacks } from "../src/domains/industryPacks.js";
import { createAmcMcpServer, resetRateLimiter } from "../src/mcp/amcMcpServer.js";
import { startStudioApiServer } from "../src/studio/studioServer.js";
import { initWorkspace } from "../src/workspace.js";

/**
 * P1-51 (D-06 = B): with no checkout configured and no licence key pinned, every locked surface states what is locked,
 * the one price constant and how to get access, and none shows a purchase step.
 */
const PRICE = `US$${INDUSTRY_PACKS_MONTHLY_PRICE_USD}/month`;
const pack = listIndustryPacks()[0]!;
const roots: string[] = [];
function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  roots.push(dir);
  return dir;
}

function expectTruthfulLock(text: string): void {
  expect(text).toContain("Industry Packs are locked");
  expect(text).toContain(PRICE);
  expect(text).toContain(INDUSTRY_PACKS_CHECKOUT_NOT_AVAILABLE);
  expect(text).not.toMatch(/https?:\/\/|Buy:|subscribe|\$9\.99\/month per user/i);
}

let amcHome: string;
beforeEach(() => {
  amcHome = tempDir("amc-p151-home-");
  vi.stubEnv("AMC_HOME", amcHome);
  for (const key of ["AMC_INDUSTRY_PACKS_CHECKOUT_URL", "AMC_DOMAIN_PACKS_CHECKOUT_URL", "AMC_INDUSTRY_PACKS_LICENSE_KEY",
    "AMC_DOMAIN_PACKS_LICENSE_KEY", "AMC_INDUSTRY_PACKS_LICENSE_PUBLIC_KEY", "AMC_INDUSTRY_PACKS_LICENSE_SECRET"]) vi.stubEnv(key, undefined);
});
afterEach(() => {
  vi.unstubAllEnvs();
  while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true });
});

describe("CLI amc domain pack", () => {
  function amc(args: string[]) {
    const env: NodeJS.ProcessEnv = { ...process.env, AMC_HOME: amcHome, NO_COLOR: "1" };
    for (const key of ["AMC_INDUSTRY_PACKS_CHECKOUT_URL", "AMC_INDUSTRY_PACKS_LICENSE_KEY", "AMC_DOMAIN_PACKS_LICENSE_KEY"]) delete env[key];
    return spawnSync(process.execPath, [resolve("dist/cli.js"), ...args], { cwd: tempDir("amc-p151-cli-"), encoding: "utf8", env, timeout: 60_000 });
  }

  test("access, list, checkout, describe and run state the lock, the price and no purchase step", () => {
    const access = amc(["domain", "pack", "access"]);
    expect(access.status).toBe(0);
    expect(access.stdout).toContain("Checkout: not available in this deployment");
    expect(access.stdout).toContain("Licence verification: not configured");
    expectTruthfulLock(access.stdout);

    const list = amc(["domain", "pack", "list"]);
    expect(list.status).toBe(0);
    expect(list.stdout).toContain(pack.name);
    expectTruthfulLock(list.stdout);

    const checkout = amc(["domain", "pack", "checkout"]);
    expect(checkout.status).toBe(1);
    expectTruthfulLock(checkout.stderr);

    const describe = amc(["domain", "pack", "describe", "--pack", pack.id]);
    expect(describe.status).toBe(1);
    expectTruthfulLock(describe.stderr);

    const run = amc(["domain", "pack", "run", "--pack", pack.id, "--baseline", "--json"]);
    expect(run.status).toBe(1);
    const locked = JSON.parse(run.stdout) as { error: string; message: string };
    expect(locked.error).toBe("industry_packs_locked");
    expectTruthfulLock(locked.message);
  }, 120_000);
});

describe("Studio and console", () => {
  test("list shows real descriptions; detail is 402, checkout 503 and activate 422, each with the truthful text", async () => {
    const workspace = tempDir("amc-p151-studio-");
    vi.stubEnv("AMC_VAULT_PASSPHRASE", "p151-studio");
    initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
    const api = await startStudioApiServer({ workspace, host: "127.0.0.1", port: 0, token: "p151-token" });
    const call = (method: string, path: string, body?: unknown) => fetch(`${api.url}${path}`, {
      method, headers: { "x-amc-admin-token": "p151-token", "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body)
    });
    try {
      const list = await (await call("GET", "/industry-packs/list")).json();
      expectTruthfulLock(list.entitlement.message);
      const listed = list.packs.find((row: { packId: string }) => row.packId === pack.id);
      expect(listed).toMatchObject({ locked: true, description: pack.description, regulatoryBasis: pack.regulatoryBasis });

      const detail = await call("GET", `/industry-packs/${pack.id}`);
      expect(detail.status).toBe(402);
      expectTruthfulLock((await detail.json()).message);

      const checkout = await call("GET", "/industry-packs/checkout");
      expect(checkout.status).toBe(503);
      expectTruthfulLock((await checkout.json()).error);

      const activate = await call("POST", "/industry-packs/activate", { licenseKey: "AMC-INDUSTRY-PACKS.e30.AA" });
      expect(activate.status).toBe(422);
      expect((await activate.json()).error).toMatch(/licence verification is not configured/i);

      const verify = await call("POST", "/industry-packs/license/verify", { licenseKey: "AMC-INDUSTRY-PACKS.e30.AA" });
      expect(verify.status).toBe(422);
      expect((await verify.json()).reason).toMatch(/licence verification is not configured/i);
      expect((await call("POST", "/industry-packs/license/verify", {})).status).toBe(400);
    } finally {
      await api.close();
    }
  }, 120_000);

  test("the console renders the server's text and carries no price, count or purchase step of its own", () => {
    const app = readFileSync("src/console/assets/app.js", "utf8");
    const view = app.slice(app.indexOf("async function renderIndustryPacks"), app.indexOf("async function renderCompliance"));
    expect(view).toContain("entitlement.message");
    expect(view).toContain("entitlement.checkoutAvailable === true");
    expect(view).toContain("entitlement.licenseVerificationConfigured === true");
    expect(view).not.toMatch(/9\.99|\b41\b|verified checkout|Launch status/);
  });
});

describe("MCP and dashboard", () => {
  test("amc_score_sector_pack returns the truthful paywall text", async () => {
    resetRateLimiter();
    const server = createAmcMcpServer(tempDir("amc-p151-mcp-"));
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "p151", version: "1" });
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    try {
      const result = await client.callTool({ name: "amc_score_sector_pack", arguments: { packId: pack.id, responses: {} } });
      expect(result.isError).toBe(true);
      expectTruthfulLock((result.content as Array<{ text: string }>)[0]!.text);
    } finally {
      await client.close();
      await server.close();
    }
  });

  test("the dashboard carries the server's text, public pack descriptions and no purchase button", async () => {
    const workspace = tempDir("amc-p151-dash-");
    vi.stubEnv("AMC_VAULT_PASSPHRASE", "p151-dashboard");
    initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
    await runDiagnostic({ workspace, window: "14d", targetName: "default", claimMode: "auto" });
    buildDashboard({ workspace, outDir: ".amc/dashboard-p151" });
    const data = JSON.parse(readFileSync(join(workspace, ".amc", "dashboard-p151", "data.json"), "utf8")) as {
      industryPacksAccess: { active: boolean; message: string };
      industryPacks: Array<{ id: string; description: string; regulatoryBasis: string[]; locked: boolean }>;
    };
    expect(data.industryPacksAccess.active).toBe(false);
    expectTruthfulLock(data.industryPacksAccess.message);
    expect(data.industryPacks.find((row) => row.id === pack.id)).toMatchObject({
      locked: true, description: pack.description, regulatoryBasis: pack.regulatoryBasis
    });
    const component = readFileSync("src/dashboard/templates/components/domains.js", "utf8");
    expect(component).toContain("industryPacksAccess");
    expect(component).not.toMatch(/9\.99|Subscribe|planned commercial tier/);
  }, 120_000);
});
