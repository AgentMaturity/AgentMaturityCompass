import { createServer, request as httpRequest } from "node:http";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, test } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { lockVault, unlockVault, vaultPaths } from "../src/vault/vault.js";
import { startStudioApiServer } from "../src/studio/studioServer.js";
import { runStudioForeground, studioStatus } from "../src/studio/studioSupervisor.js";
import { readStudioState } from "../src/studio/studioState.js";
import { defaultGatewayConfig, initGatewayConfig } from "../src/gateway/config.js";
import { buildConnectInstructions } from "../src/studio/connectWizard.js";
import { assertOwnerMode, setMode } from "../src/mode/mode.js";
import { loopSchedule } from "../src/loop/loop.js";
import { runDiagnostic } from "../src/diagnostic/runner.js";
import { createUnifiedClaritySnapshot } from "../src/snapshot/snapshot.js";
import { buildDashboard } from "../src/dashboard/build.js";
import { buildAgentConfig, initFleet, scaffoldAgent } from "../src/fleet/registry.js";
import { pathExists, readUtf8 } from "../src/utils/fs.js";

const roots: string[] = [];

function newWorkspace(): string {
  const dir = mkdtempSync(join(tmpdir(), "amc-studio-test-"));
  roots.push(dir);
  process.env.AMC_VAULT_PASSPHRASE = "studio-test-passphrase";
  initWorkspace({ workspacePath: dir, trustBoundaryMode: "isolated" });
  return dir;
}

afterEach(() => {
  while (roots.length > 0) {
    const dir = roots.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

async function pickFreePort(): Promise<number> {
  const s = createServer();
  await new Promise<void>((resolvePromise) => s.listen(0, "127.0.0.1", () => resolvePromise()));
  const addr = s.address();
  await new Promise<void>((resolvePromise) => s.close(() => resolvePromise()));
  if (!addr || typeof addr === "string") {
    throw new Error("failed to allocate random port");
  }
  return addr.port;
}

async function httpGet(url: string, token?: string): Promise<{ status: number; body: string }> {
  return new Promise((resolvePromise, rejectPromise) => {
    const req = httpRequest(
      url,
      {
        method: "GET",
        headers: token ? { "x-amc-admin-token": token } : {}
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
        res.on("end", () => {
          resolvePromise({
            status: res.statusCode ?? 0,
            body: Buffer.concat(chunks).toString("utf8")
          });
        });
      }
    );
    req.on("error", rejectPromise);
    req.end();
  });
}

function listAllFiles(root: string): string[] {
  const out: string[] = [];
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop()!;
    const entries = readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else {
        out.push(full);
      }
    }
  }
  return out;
}

describe("studio + vault + mode + loop", () => {
  test("vault encryption works, wrong passphrase fails, and no raw private key is stored", () => {
    const workspace = newWorkspace();
    const paths = vaultPaths(workspace);

    lockVault(workspace);
    expect(() => unlockVault(workspace, "wrong-passphrase")).toThrow("Vault unlock failed");
    expect(() => unlockVault(workspace, "studio-test-passphrase")).not.toThrow();

    expect(pathExists(paths.legacyMonitorPrivate)).toBe(false);
    expect(pathExists(paths.legacyAuditorPrivate)).toBe(false);

    for (const file of listAllFiles(join(workspace, ".amc"))) {
      if (!file.endsWith(".pub")) {
        const content = readFileSync(file, "utf8");
        expect(content.includes("BEGIN PRIVATE KEY")).toBe(false);
      }
    }
  });

  test("studio foreground writes state and exposes running status", async () => {
    const workspace = newWorkspace();
    const config = defaultGatewayConfig();
    config.listen.port = await pickFreePort();
    config.proxy.port = await pickFreePort();
    initGatewayConfig(workspace, config);

    const runtime = await runStudioForeground({
      workspace,
      apiPort: await pickFreePort(),
      dashboardPort: await pickFreePort()
    });
    try {
      const state = readStudioState(workspace);
      expect(state).not.toBeNull();
      expect(state?.gatewayPort).toBe(config.listen.port);
      expect(studioStatus(workspace).running).toBe(true);
    } finally {
      await runtime.stop();
    }
  });

  test("studio API requires admin token for protected endpoints", async () => {
    const workspace = newWorkspace();
    const token = "token-123";
    const port = await pickFreePort();
    const server = await startStudioApiServer({
      workspace,
      host: "127.0.0.1",
      port,
      token
    });
    try {
      const unauthorized = await httpGet(`http://127.0.0.1:${port}/agents`);
      expect(unauthorized.status).toBe(401);

      const authorized = await httpGet(`http://127.0.0.1:${port}/agents`, token);
      expect(authorized.status).toBe(200);
    } finally {
      await server.close();
    }
  });

  test("connect wizard returns deterministic route/env/cmd output", async () => {
    const workspace = newWorkspace();
    const config = defaultGatewayConfig();
    config.listen.port = 43210;
    config.proxy.port = 43211;
    initGatewayConfig(workspace, config);

    const output = await buildConnectInstructions({
      workspace,
      agentId: "default",
      mode: "supervise"
    });

    expect(output.routeUrl).toBe("http://127.0.0.1:43210/openai");
    expect(output.envLines.some((line) => line.includes("OPENAI_BASE_URL=http://127.0.0.1:43210/openai"))).toBe(true);
    expect(output.command).toContain("amc supervise --agent default --route http://127.0.0.1:43210/openai");
  });

  test("agent mode blocks owner-only commands", () => {
    const workspace = newWorkspace();
    setMode(workspace, "agent");
    expect(() => assertOwnerMode(workspace, "target set")).toThrow("blocked in agent mode");
    for (const command of [
      "firewall enable",
      "firewall disable",
      "firewall migrate-signature",
      "guardrails enable",
      "guardrails disable",
      "guardrails profile"
    ]) {
      expect(() => assertOwnerMode(workspace, command), command).toThrow("blocked in agent mode");
    }
    expect(() => assertOwnerMode(workspace, "run")).not.toThrow();
  });

  test("loop schedule prints deterministic cron output", () => {
    const workspace = newWorkspace();
    const cron = loopSchedule({
      workspace,
      agentId: "default",
      os: "cron",
      cadence: "weekly"
    });
    expect(cron).toBe(`0 9 * * 1 cd ${workspace} && amc loop run --agent default --days 14`);
  });

  test("snapshot contains required sections and avoids secret-like patterns", async () => {
    const workspace = newWorkspace();
    const run = await runDiagnostic({
      workspace,
      window: "14d",
      targetName: "default",
      claimMode: "auto"
    });
    expect(run.status).toBe("VALID");
    const outFile = ".amc/reports/snapshots/test.md";
    createUnifiedClaritySnapshot({
      workspace,
      agentId: "default",
      outFile
    });
    const md = readUtf8(join(workspace, outFile));
    expect(md).toContain("# Unified Clarity Snapshot");
    expect(md).toContain("## Overall + Layers");
    expect(md).toContain("## Failure-Risk Indices");
    expect(md).not.toMatch(/sk-[A-Za-z0-9]{10,}/i);
    expect(md).not.toContain("BEGIN PRIVATE KEY");
  });

  test("dashboard includes Studio Home + QR and agent list payload", async () => {
    const workspace = newWorkspace();
    initFleet(workspace, { orgName: "Studio Fleet" });
    const config = buildAgentConfig({
      agentId: "salesbot",
      agentName: "Sales Bot",
      role: "sales",
      domain: "b2b",
      primaryTasks: ["prospecting"],
      stakeholders: ["owner", "sales-lead"],
      riskTier: "med",
      templateId: "openai",
      baseUrl: "https://api.openai.com",
      routePrefix: "/openai",
      auth: { type: "bearer_env", env: "OPENAI_API_KEY" }
    });
    scaffoldAgent(workspace, config);

    await runDiagnostic({
      workspace,
      agentId: "salesbot",
      window: "14d",
      targetName: "default",
      claimMode: "auto"
    });

    const built = buildDashboard({
      workspace,
      agentId: "salesbot",
      outDir: ".amc/agents/salesbot/dashboard"
    });
    const data = JSON.parse(readUtf8(join(built.outDir, "data.json"))) as {
      studioHome?: { agents?: Array<{ id: string }> };
    };
    expect(Array.isArray(data.studioHome?.agents)).toBe(true);
    expect(data.studioHome?.agents?.some((row) => row.id === "salesbot")).toBe(true);

    const html = readUtf8(join(built.outDir, "index.html"));
    const appJs = readUtf8(join(built.outDir, "app.js"));
    // v3 dashboard: Studio Home data rendered in Fleet section
    expect(html).toContain("id=\"studio-mount\"");
    expect(appJs).toContain("buildFleet");
    expect(appJs).toContain("studioHome");
  });
});
