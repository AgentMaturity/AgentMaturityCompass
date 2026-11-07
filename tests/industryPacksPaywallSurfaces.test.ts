import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { buildDashboard } from "../src/dashboard/build.js";
import { runDiagnostic } from "../src/diagnostic/runner.js";
import { INDUSTRY_PACKS_FREE_MESSAGE } from "../src/domains/industryPackEntitlement.js";
import { listIndustryPacks } from "../src/domains/industryPacks.js";
import { createAmcMcpServer, resetRateLimiter } from "../src/mcp/amcMcpServer.js";
import { startStudioApiServer } from "../src/studio/studioServer.js";
import { initWorkspace } from "../src/workspace.js";

/**
 * Industry Packs are free (2026-11-07): every surface (CLI, Studio, console, MCP, dashboard) opens pack questions and runs
 * with no licence, states that they are free, and shows no price or purchase step.
 */
const pack = listIndustryPacks()[0]!;
const roots: string[] = [];
function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  roots.push(dir);
  return dir;
}

function expectFree(text: string): void {
  expect(text).toContain(INDUSTRY_PACKS_FREE_MESSAGE);
  expect(text).not.toMatch(/https?:\/\/|Buy:|subscribe|Industry Packs are locked|US\$\d|\$9\.99/i);
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

  test("access, list, checkout, describe and run work with no licence and state that packs are free", () => {
    const access = amc(["domain", "pack", "access"]);
    expect(access.status).toBe(0);
    expect(access.stdout).toContain("Price: free");
    expect(access.stdout).toContain("Status: active");
    expectFree(access.stdout);

    const list = amc(["domain", "pack", "list"]);
    expect(list.status).toBe(0);
    expect(list.stdout).toContain(pack.name);
    expect(list.stdout).toContain("(free, all included)");
    expect(list.stdout).not.toContain("locked");
    // The run hint names only options `domain pack run` has (it has no --agent).
    expect(list.stdout).toContain("Run a pack: amc domain pack run --pack <packId>\n");

    const checkout = amc(["domain", "pack", "checkout"]);
    expect(checkout.status).toBe(0);
    expectFree(checkout.stdout);

    const describe = amc(["domain", "pack", "describe", "--pack", pack.id, "--json"]);
    expect(describe.status).toBe(0);
    expect((JSON.parse(describe.stdout) as { id: string; questions: unknown[] })).toMatchObject({ id: pack.id });

    // An option that cannot be honoured is refused and hidden, never silently ignored.
    const expires = amc(["domain", "pack", "activate", "--key", "AMC-INDUSTRY-PACKS.e30.AA", "--expires-at", "2099-01-01T00:00:00Z"]);
    expect(expires.status).toBe(1);
    expect(expires.stderr).toContain("--expires-at is not accepted");
    expect(amc(["domain", "pack", "activate", "--help"]).stdout).not.toContain("--expires-at");
    // verify pins only the trust-list key: no --pubkey, and "not configured" without one.
    expect(amc(["domain", "pack", "verify", "--help"]).stdout).not.toContain("--pubkey");
    const verify = amc(["domain", "pack", "verify", "--key", "AMC-INDUSTRY-PACKS.e30.AA"]);
    expect(verify.status).toBe(1);
    expect(`${verify.stdout}${verify.stderr}`).toMatch(/licence verification is not configured/i);

    const run = amc(["domain", "pack", "run", "--pack", pack.id, "--baseline", "--json"]);
    expect(run.status, run.stderr).toBe(0);
    expect(JSON.parse(run.stdout)).toMatchObject({ packId: pack.id, claimKind: "self_reported", contentStatus: "experimental", percentage: null });
  }, 120_000);

  test("domain assess, gaps, roadmap, assurance and apply --audit run with no licence", () => {
    for (const command of ["assess", "gaps", "roadmap", "assurance"]) {
      const result = amc(["domain", command, "--agent", "default", "--domain", "health", "--json"]);
      expect(result.status, `${command}: ${result.stderr}`).toBe(0);
      expect(JSON.parse(result.stdout).claimKind, command).toBe("self_reported");
    }
    const audit = amc(["domain", "apply", "--agent", "default", "--pack", "clinical-trials", "--audit", "--dry-run", "--json"]);
    expect(audit.status, audit.stderr).toBe(0);
    expect(JSON.parse(audit.stdout)).toMatchObject({ packId: "clinical-trials", claimKind: "self_reported" });
  }, 120_000);
});

describe("Studio and console", () => {
  test("list and detail are open; checkout says free; activate and verify still check legacy licences", async () => {
    const workspace = tempDir("amc-free-studio-");
    vi.stubEnv("AMC_VAULT_PASSPHRASE", "free-studio");
    initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
    const api = await startStudioApiServer({ workspace, host: "127.0.0.1", port: 0, token: "free-token" });
    const call = (method: string, path: string, body?: unknown) => fetch(`${api.url}${path}`, {
      method, headers: { "x-amc-admin-token": "free-token", "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body)
    });
    try {
      const list = await (await call("GET", "/industry-packs/list")).json();
      expectFree(list.entitlement.message);
      const listed = list.packs.find((row: { packId: string }) => row.packId === pack.id);
      expect(listed).toMatchObject({ locked: false, description: pack.description, regulatoryBasis: pack.regulatoryBasis });

      const detail = await call("GET", `/industry-packs/${pack.id}`);
      expect(detail.status).toBe(200);
      expect((await detail.json()).pack.id).toBe(pack.id);

      const checkout = await call("GET", "/industry-packs/checkout");
      expect(checkout.status).toBe(200);
      const checkoutBody = await checkout.json();
      expect(checkoutBody.checkoutUrl).toBeNull();
      expectFree(checkoutBody.entitlement.message);

      const activate = await call("POST", "/industry-packs/activate", { licenseKey: "AMC-INDUSTRY-PACKS.e30.AA" });
      expect(activate.status).toBe(422);
      expect((await activate.json()).error).toMatch(/licence verification is not configured/i);

      const expires = await call("POST", "/industry-packs/activate", { licenseKey: "AMC-INDUSTRY-PACKS.e30.AA", expiresAt: "2099-01-01T00:00:00Z" });
      expect(expires.status).toBe(400);
      expect((await expires.json()).error).toContain("expiresAt is not accepted");

      const verify = await call("POST", "/industry-packs/license/verify", { licenseKey: "AMC-INDUSTRY-PACKS.e30.AA" });
      expect(verify.status).toBe(422);
      expect((await verify.json()).reason).toMatch(/licence verification is not configured/i);
      expect((await call("POST", "/industry-packs/license/verify", {})).status).toBe(400);
    } finally {
      await api.close();
    }
  }, 120_000);

  test("the console renders the server's text and carries no price, lock or purchase step", () => {
    const app = readFileSync("src/console/assets/app.js", "utf8");
    const view = app.slice(app.indexOf("async function renderIndustryPacks"), app.indexOf("async function renderCompliance"));
    expect(view).toContain("entitlement.message");
    expect(view).not.toMatch(/9\.99|\b41\b|checkout|industryActivate|locked/i);
  });
});

describe("MCP and dashboard", () => {
  test("amc_score_sector_pack scores with no licence", async () => {
    resetRateLimiter();
    const server = createAmcMcpServer(tempDir("amc-free-mcp-"));
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "free", version: "1" });
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    try {
      const result = await client.callTool({ name: "amc_score_sector_pack", arguments: { packId: pack.id, responses: {} } });
      // A result, not an error (unknown pack, rate limit, handler failure): self-reported and, unanswered, not evaluated.
      expect(result.isError).toBeFalsy();
      const text = (result.content as Array<{ text: string }>)[0]!.text;
      expect(text).toContain("**Score:** not evaluated");
      expect(text).toContain("not a certification");
      expect(text).not.toContain("Industry Packs are locked");
    } finally {
      await client.close();
      await server.close();
    }
  });

  test("the dashboard carries the free text, every pack unlocked and no purchase button", async () => {
    const workspace = tempDir("amc-free-dash-");
    vi.stubEnv("AMC_VAULT_PASSPHRASE", "free-dashboard");
    initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
    await runDiagnostic({ workspace, window: "14d", targetName: "default", claimMode: "auto" });
    buildDashboard({ workspace, outDir: ".amc/dashboard-p151" });
    const data = JSON.parse(readFileSync(join(workspace, ".amc", "dashboard-p151", "data.json"), "utf8")) as {
      industryPacksAccess: { active: boolean; message: string };
      industryPacks: Array<{ id: string; description: string; regulatoryBasis: string[]; locked: boolean }>;
    };
    expect(data.industryPacksAccess.active).toBe(true);
    expectFree(data.industryPacksAccess.message);
    expect(data.industryPacks.find((row) => row.id === pack.id)).toMatchObject({
      locked: false, description: pack.description, regulatoryBasis: pack.regulatoryBasis
    });
    const component = readFileSync("src/dashboard/templates/components/domains.js", "utf8");
    expect(component).toContain("industryPacksAccess");
    expect(component).not.toMatch(/9\.99|Subscribe|planned commercial tier|Locked: how to get access/);
  }, 120_000);
});
