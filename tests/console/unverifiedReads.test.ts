/**
 * Reading routes never show an edited record as trusted, and opening a value page writes nothing (console-pages
 * review, 2026-11-16): an edited run is refused with 409 RUN_UNVERIFIED on GET /diagnostic/auto-answer and
 * GET /mechanic/gap, edited targets with 409 TARGETS_UNVERIFIED, and GET /value/snapshot/latest with no stored
 * snapshot answers 404 NO_SNAPSHOT without publishing one.
 */
import { existsSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { diagnosticBankPath } from "../../src/diagnostic/bank/bankLoader.js";
import { getAgentPaths } from "../../src/fleet/paths.js";
import { scaffoldAgent } from "../../src/fleet/registry.js";
import { initMechanicTargets, mechanicTargetsPath } from "../../src/mechanic/targetsStore.js";
import { startStudioApiServer } from "../../src/studio/studioServer.js";
import { valueInitForApi } from "../../src/value/valueApi.js";
import { lockVault } from "../../src/vault/vault.js";
import { initWorkspace } from "../../src/workspace.js";
import { tamperReport, writeSealedReport } from "../helpers/sealedRun.js";

const ADMIN = "console-pages-unverified-reads-admin";
const roots: string[] = [];
const servers: Array<Awaited<ReturnType<typeof startStudioApiServer>>> = [];

beforeEach(() => {
  vi.stubEnv("AMC_VAULT_PASSPHRASE", "console-pages-unverified-reads-passphrase");
  vi.stubEnv("AMC_VAULT_PASSPHRASE_FILE", undefined);
  vi.stubEnv("AMC_A4_PREVIEW", "0");
});
afterEach(async () => {
  for (const server of servers.splice(0)) await server.close();
  for (const workspace of roots.splice(0)) { lockVault(workspace); rmSync(workspace, { recursive: true, force: true }); }
  vi.unstubAllEnvs();
});

async function studio() {
  const workspace = realpathSync(mkdtempSync(join(tmpdir(), "amc-unverified-reads-")));
  roots.push(workspace);
  initWorkspace({ workspacePath: workspace, agentId: "default", trustBoundaryMode: "isolated" });
  const server = await startStudioApiServer({ workspace, host: "127.0.0.1", port: 0, token: ADMIN });
  servers.push(server);
  const get = async (path: string) => {
    const response = await fetch(new URL(path, server.url), { headers: { "x-amc-admin-token": ADMIN } });
    return { status: response.status, json: await response.json() as Record<string, unknown> };
  };
  return { workspace, get };
}

const filesUnder = (dir: string): string[] => existsSync(dir)
  ? readdirSync(dir, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? filesUnder(join(dir, entry.name)) : [join(dir, entry.name)]) : [];

describe("reading routes refuse edited records", () => {
  test("an edited latest run is refused on auto-answer and the mechanic gap, never served as trusted", async () => {
    const { workspace, get } = await studio();
    const run = {
      runId: "run-edited", agentId: "default", ts: Date.now(), status: "VALID", windowStartTs: Date.now() - 1000, windowEndTs: Date.now(),
      integrityIndex: 0.3, trustLabel: "LOW TRUST", layerScores: [], questionScores: [], prioritizedUpgradeActions: [], evidenceToCollectNext: []
    };
    const file = writeSealedReport(workspace, getAgentPaths(workspace, "default").runsDir, run.runId, run);
    tamperReport(file, (report) => { report.trustLabel = "HIGH TRUST"; report.integrityIndex = 0.99; });
    for (const path of ["/diagnostic/auto-answer?agentId=default", "/mechanic/gap?scope=workspace"]) {
      const response = await get(path);
      expect(response.status, path).toBe(409);
      expect(response.json, path).toMatchObject({ code: "RUN_UNVERIFIED", error: "The latest score record does not pass its signature check, so it is not shown. Run a new score." });
      expect(JSON.stringify(response.json), path).not.toContain("HIGH TRUST");
    }
  }, 60_000);

  test("edited target levels are refused on the mechanic gap", async () => {
    const { workspace, get } = await studio();
    initMechanicTargets({ workspace, scope: { type: "WORKSPACE", id: "workspace" }, mode: "DESIRED" });
    expect((await get("/mechanic/gap?scope=workspace")).json.code).toBe("NO_RUN_YET");
    const path = mechanicTargetsPath(workspace), body = readFileSync(path, "utf8");
    writeFileSync(path, body.replace(/(AMC-1\.1["']?:\s*)\d/, "$11"));
    expect(readFileSync(path, "utf8")).not.toBe(body);
    const response = await get("/mechanic/gap?scope=workspace");
    expect(response.status).toBe(409);
    expect(response.json.code).toBe("TARGETS_UNVERIFIED");
    expect(String(response.json.error)).toMatch(/do not pass their signature check/);
  }, 60_000);
});

describe("opening a value page writes nothing", () => {
  test("no stored snapshot is 404 NO_SNAPSHOT and nothing is published", async () => {
    const { workspace, get } = await studio();
    valueInitForApi(workspace);
    const valueDir = join(workspace, ".amc", "value"), before = filesUnder(valueDir).sort();
    const response = await get("/value/snapshot/latest?scope=workspace&id=workspace");
    expect(response.status).toBe(404);
    expect(response.json.code).toBe("NO_SNAPSHOT");
    expect(filesUnder(valueDir).sort()).toEqual(before);
  }, 60_000);

  test("the diagnostic render reads the built-in question bank without writing it", async () => {
    const { workspace, get } = await studio();
    const now = Date.now();
    scaffoldAgent(workspace, { id: "default", agentName: "Default Agent", role: "assistant", domain: "general", primaryTasks: ["analysis"],
      stakeholders: ["owner"], environment: "production", riskTier: "med", createdTs: now, updatedTs: now,
      provider: { templateId: "openai", routePrefix: "/openai", upstreamId: "openai", baseUrl: "https://api.openai.com", openaiCompatible: true, auth: { type: "bearer_env", env: "OPENAI_API_KEY" } } });
    // A workspace whose question bank was never written (older set-ups): opening the page must not write it.
    rmSync(diagnosticBankPath(workspace), { force: true }); rmSync(`${diagnosticBankPath(workspace)}.sig`, { force: true });
    const before = filesUnder(join(workspace, ".amc")).sort();
    expect((await get("/diagnostic/render?agentId=default")).status).toBe(200);
    expect(filesUnder(join(workspace, ".amc")).sort()).toEqual(before);
    expect(existsSync(diagnosticBankPath(workspace))).toBe(false);
  }, 60_000);
});
