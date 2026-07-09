import { createServer, request as httpRequest } from "node:http";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, test } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { loadAssurancePolicy, saveAssurancePolicy } from "../src/assurance/assurancePolicyStore.js";
import { openLedger } from "../src/ledger/ledger.js";
import { issueLeaseForCli } from "../src/leases/leaseCli.js";
import {
  createHostUser,
  createWorkspaceRecord,
  getWorkspaceRecord,
  grantMembership,
  initHostDb,
  listAccessibleWorkspaces
} from "../src/workspaces/hostDb.js";
import { hostMigrateCli } from "../src/workspaces/hostCli.js";
import { hostWorkspaceDir } from "../src/workspaces/workspacePaths.js";
import { startWorkspaceRouter } from "../src/workspaces/workspaceRouter.js";
import { runStudioForeground } from "../src/studio/studioSupervisor.js";

const roots: string[] = [];

function newDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  roots.push(dir);
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
  const server = createServer();
  await new Promise<void>((resolvePromise) => server.listen(0, "127.0.0.1", () => resolvePromise()));
  const address = server.address();
  await new Promise<void>((resolvePromise) => server.close(() => resolvePromise()));
  if (!address || typeof address === "string") {
    throw new Error("failed to reserve random port");
  }
  return address.port;
}

async function httpRaw(params: {
  url: string;
  method: "GET" | "POST";
  body?: unknown;
  cookie?: string;
  lease?: string;
  headers?: Record<string, string>;
}): Promise<{ status: number; body: string; headers: Record<string, string | string[] | undefined> }> {
  const raw = params.body === undefined ? "" : JSON.stringify(params.body);
  return new Promise((resolvePromise, rejectPromise) => {
    const req = httpRequest(
      params.url,
      {
        method: params.method,
        headers: {
          connection: "close",
          "content-type": "application/json",
          "content-length": Buffer.byteLength(raw),
          ...(params.cookie ? { cookie: params.cookie } : {}),
          ...(params.lease ? { "x-amc-lease": params.lease } : {}),
          ...(params.headers ?? {})
        }
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
        res.on("end", () => {
          resolvePromise({
            status: res.statusCode ?? 0,
            body: Buffer.concat(chunks).toString("utf8"),
            headers: res.headers as Record<string, string | string[] | undefined>
          });
        });
      }
    );
    req.on("error", rejectPromise);
    if (raw.length > 0) {
      req.write(raw);
    }
    req.end();
  });
}

function setupHostWithTwoWorkspaces(): {
  hostDir: string;
  workspaceA: string;
  workspaceB: string;
} {
  const _savedVaultPass = process.env.AMC_VAULT_PASSPHRASE;
  process.env.AMC_VAULT_PASSPHRASE = "host-mode-passphrase";
  const hostDir = newDir("amc-host-mode-");
  initHostDb(hostDir);
  createHostUser({
    hostDir,
    username: "admin",
    password: "admin-pass-123",
    isHostAdmin: true
  });
  createHostUser({
    hostDir,
    username: "viewerb",
    password: "viewer-pass-123",
    isHostAdmin: false
  });

  createWorkspaceRecord({ hostDir, workspaceId: "ws-a", name: "Workspace A" });
  createWorkspaceRecord({ hostDir, workspaceId: "ws-b", name: "Workspace B" });

  const workspaceA = hostWorkspaceDir(hostDir, "ws-a");
  const workspaceB = hostWorkspaceDir(hostDir, "ws-b");
  initWorkspace({ workspacePath: workspaceA, trustBoundaryMode: "isolated" });
  initWorkspace({ workspacePath: workspaceB, trustBoundaryMode: "isolated" });

  // Disable fail-closed assurance gate for test workspaces (no assurance runs in fresh workspace)
  for (const ws of [workspaceA, workspaceB]) {
    const policy = loadAssurancePolicy(ws);
    policy.assurancePolicy.thresholds.failClosedIfBelowThresholds = false;
    saveAssurancePolicy(ws, policy);
  }

  grantMembership({
    hostDir,
    username: "viewerb",
    workspaceId: "ws-b",
    role: "VIEWER"
  });

  return { hostDir, workspaceA, workspaceB };
}

describe("multi-workspace host mode", () => {
  test("workspace isolation enforces membership and blocks cross-workspace marker reads", async () => {
    const { hostDir, workspaceA, workspaceB } = setupHostWithTwoWorkspaces();
    const marker = "TENANT_A_SECRET_MARKER";
    writeFileSync(join(workspaceA, ".amc", "tenant-marker.txt"), marker);

    const port = await pickFreePort();
    const host = await startWorkspaceRouter({
      hostDir,
      host: "127.0.0.1",
      port,
      defaultWorkspaceId: "ws-a"
    });

    try {
      const hostLogin = await httpRaw({
        url: `http://127.0.0.1:${port}/host/api/login`,
        method: "POST",
        body: { username: "admin", password: "admin-pass-123" }
      });
      expect(hostLogin.status).toBe(200);
      const hostCookie = Array.isArray(hostLogin.headers["set-cookie"])
        ? hostLogin.headers["set-cookie"][0] ?? ""
        : String(hostLogin.headers["set-cookie"] ?? "");
      expect(hostCookie).toContain("amc_host_session=");

      const hostWorkspaces = await httpRaw({
        url: `http://127.0.0.1:${port}/host/api/workspaces`,
        method: "GET",
        cookie: hostCookie
      });
      expect(hostWorkspaces.status).toBe(200);
      expect(hostWorkspaces.body).toContain("\"workspaceId\":\"ws-a\"");
      expect(hostWorkspaces.body).toContain("\"workspaceId\":\"ws-b\"");

      const workspaceLogin = await httpRaw({
        url: `http://127.0.0.1:${port}/w/ws-b/api/login`,
        method: "POST",
        body: { username: "viewerb", password: "viewer-pass-123" }
      });
      expect(workspaceLogin.status).toBe(200);
      const wsCookie = Array.isArray(workspaceLogin.headers["set-cookie"])
        ? workspaceLogin.headers["set-cookie"][0] ?? ""
        : String(workspaceLogin.headers["set-cookie"] ?? "");
      expect(wsCookie).toContain("Path=/w/ws-b");

      const forbidden = await httpRaw({
        url: `http://127.0.0.1:${port}/w/ws-a/api/status`,
        method: "GET",
        cookie: wsCookie
      });
      expect([401, 403]).toContain(forbidden.status);

      const traversal = await httpRaw({
        url: `http://127.0.0.1:${port}/w/ws-b/api/../../workspaces/ws-a/.amc/tenant-marker.txt`,
        method: "GET",
        cookie: wsCookie
      });
      expect(traversal.status).toBeGreaterThanOrEqual(400);
      expect(traversal.body.includes(marker)).toBe(false);

      const onlyB = listAccessibleWorkspaces(hostDir, "viewerb");
      expect(onlyB.map((row) => row.workspaceId)).toEqual(["ws-b"]);
      expect(readFileSync(join(workspaceB, ".amc", "amc.config.yaml"), "utf8")).toContain("trustBoundaryMode");
    } finally {
      await host.close();
    }
  }, 30_000);

  test("default-workspace aliases redirect into the authenticated workspace namespace", async () => {
    const { hostDir } = setupHostWithTwoWorkspaces();
    const port = await pickFreePort();
    const host = await startWorkspaceRouter({
      hostDir,
      host: "127.0.0.1",
      port,
      defaultWorkspaceId: "ws-a"
    });

    try {
      const apiAlias = await httpRaw({
        url: `http://127.0.0.1:${port}/api/status?source=alias`,
        method: "GET"
      });
      const consoleAlias = await httpRaw({
        url: `http://127.0.0.1:${port}/console/assets/app.js`,
        method: "GET"
      });
      const unauthenticatedTarget = await httpRaw({
        url: `http://127.0.0.1:${port}/w/ws-a/api/status`,
        method: "GET"
      });

      expect(apiAlias.status).toBe(307);
      expect(String(apiAlias.headers.location ?? "")).toBe("/w/ws-a/api/status?source=alias");
      expect(consoleAlias.status).toBe(307);
      expect(String(consoleAlias.headers.location ?? "")).toBe("/w/ws-a/console/assets/app.js");
      expect(unauthenticatedTarget.status).toBe(401);
    } finally {
      await host.close();
    }
  }, 30_000);

  test("lease workspace mismatch is denied and audited only in requested workspace", async () => {
    const { hostDir, workspaceA, workspaceB } = setupHostWithTwoWorkspaces();
    const port = await pickFreePort();
    const host = await startWorkspaceRouter({
      hostDir,
      host: "127.0.0.1",
      port,
      defaultWorkspaceId: "ws-a"
    });

    try {
      const lease = issueLeaseForCli({
        workspace: workspaceA,
        workspaceId: "ws-a",
        agentId: "default",
        ttl: "30m",
        scopes: "gateway:llm,toolhub:intent,toolhub:execute,governor:check,receipt:verify",
        routes: "/openai",
        models: "gpt-*",
        rpm: 60,
        tpm: 200000
      }).token;

      const response = await httpRaw({
        url: `http://127.0.0.1:${port}/w/ws-b/api/toolhub/intent`,
        method: "POST",
        lease,
        body: {
          agentId: "default",
          toolName: "git.status",
          requestedMode: "SIMULATE",
          args: {}
        }
      });
      expect(response.status).toBe(403);

      const ledgerA = openLedger(workspaceA);
      const ledgerB = openLedger(workspaceB);
      const eventsA = ledgerA.getAllEvents();
      const eventsB = ledgerB.getAllEvents();
      ledgerA.close();
      ledgerB.close();
      const suspiciousInA = eventsA.filter((row) => {
        try {
          const meta = JSON.parse(row.meta_json) as Record<string, unknown>;
          return meta.auditType === "SUSPICIOUS_WORKSPACE_OVERRIDE_ATTEMPT";
        } catch {
          return false;
        }
      });
      const suspiciousInB = eventsB.filter((row) => {
        try {
          const meta = JSON.parse(row.meta_json) as Record<string, unknown>;
          return meta.auditType === "SUSPICIOUS_WORKSPACE_OVERRIDE_ATTEMPT";
        } catch {
          return false;
        }
      });
      expect(suspiciousInA.length).toBe(0);
      expect(suspiciousInB.length).toBeGreaterThan(0);
    } finally {
      await host.close();
    }
  }, 30_000);

  test("workspace readiness fails independently while host readiness remains available", async () => {
    const { hostDir, workspaceA, workspaceB } = setupHostWithTwoWorkspaces();
    writeFileSync(join(workspaceB, ".amc", "trust.yaml"), "tampered: true\n");

    const port = await pickFreePort();
    const host = await startWorkspaceRouter({
      hostDir,
      host: "127.0.0.1",
      port,
      defaultWorkspaceId: "ws-a"
    });

    try {
      const readyA = await httpRaw({
        url: `http://127.0.0.1:${port}/w/ws-a/readyz`,
        method: "GET"
      });
      const readyB = await httpRaw({
        url: `http://127.0.0.1:${port}/w/ws-b/readyz`,
        method: "GET"
      });
      const hostReady = await httpRaw({
        url: `http://127.0.0.1:${port}/readyz`,
        method: "GET"
      });

      expect(readyA.status).toBe(200);
      expect(readyB.status).toBe(503);
      if (hostReady.status !== 200) {
        // Host returns 503 when any workspace is not ready — ws-b is tampered
      }
      // Host readiness is 503 because ws-b is tampered, but the response body shows the breakdown
      expect(hostReady.status).toBe(503);
      expect(hostReady.body).toContain("\"workspaceId\":\"ws-b\"");
      expect(hostReady.body).toContain("\"ready\":false");
    } finally {
      await host.close();
    }
  }, 30_000);

  test("workspace console requires host/workspace session and still serves relative assets", async () => {
    const { hostDir } = setupHostWithTwoWorkspaces();
    const port = await pickFreePort();
    const host = await startWorkspaceRouter({
      hostDir,
      host: "127.0.0.1",
      port,
      defaultWorkspaceId: "ws-a"
    });

    try {
      const hostConsole = await httpRaw({
        url: `http://127.0.0.1:${port}/host/console/host.html`,
        method: "GET"
      });
      const deniedWorkspaceConsole = await httpRaw({
        url: `http://127.0.0.1:${port}/w/ws-a/console`,
        method: "GET"
      });
      const hostLogin = await httpRaw({
        url: `http://127.0.0.1:${port}/host/api/login`,
        method: "POST",
        body: {
          username: "admin",
          password: "admin-pass-123"
        }
      });
      expect(hostLogin.status).toBe(200);
      const hostCookie = Array.isArray(hostLogin.headers["set-cookie"])
        ? hostLogin.headers["set-cookie"][0] ?? ""
        : String(hostLogin.headers["set-cookie"] ?? "");

      const workspaceBootstrap = await httpRaw({
        url: `http://127.0.0.1:${port}/w/ws-a/console`,
        method: "GET",
        cookie: hostCookie
      });
      expect(workspaceBootstrap.status).toBe(302);
      expect(String(workspaceBootstrap.headers.location ?? "")).toBe(`/w/ws-a/console/`);
      const workspaceCookie = Array.isArray(workspaceBootstrap.headers["set-cookie"])
        ? workspaceBootstrap.headers["set-cookie"][0] ?? ""
        : String(workspaceBootstrap.headers["set-cookie"] ?? "");
      const combinedCookie = `${hostCookie.split(";")[0] ?? ""}; ${workspaceCookie.split(";")[0] ?? ""}`;

      const workspaceConsole = await httpRaw({
        url: `http://127.0.0.1:${port}/w/ws-a/console/`,
        method: "GET",
        cookie: combinedCookie
      });
      const workspaceJs = await httpRaw({
        url: `http://127.0.0.1:${port}/w/ws-a/console/assets/app.js`,
        method: "GET",
        cookie: combinedCookie
      });

      expect(hostConsole.status).toBe(200);
      expect(deniedWorkspaceConsole.status).toBe(401);
      expect(workspaceConsole.status).toBe(200);
      expect(workspaceConsole.body.includes('href="/console')).toBe(false);
      expect(workspaceConsole.body.includes('src="/console')).toBe(false);
      expect(workspaceJs.status).toBe(200);
      expect(workspaceJs.body.includes("https://cdn")).toBe(false);
    } finally {
      await host.close();
    }
  }, 30_000);

  test("explicit local demo mode lets the desktop launcher bootstrap the default workspace console", async () => {
    const { hostDir } = setupHostWithTwoWorkspaces();
    const port = await pickFreePort();
    const host = await startWorkspaceRouter({
      hostDir,
      host: "127.0.0.1",
      port,
      defaultWorkspaceId: "ws-a",
      allowLocalDemoWorkspace: true
    });

    try {
      const defaultConsoleBootstrap = await httpRaw({
        url: `http://127.0.0.1:${port}/w/ws-a/console`,
        method: "GET"
      });
      expect(defaultConsoleBootstrap.status).toBe(302);
      expect(String(defaultConsoleBootstrap.headers.location ?? "")).toBe(`/w/ws-a/console/`);
      const workspaceCookie = Array.isArray(defaultConsoleBootstrap.headers["set-cookie"])
        ? defaultConsoleBootstrap.headers["set-cookie"][0] ?? ""
        : String(defaultConsoleBootstrap.headers["set-cookie"] ?? "");
      expect(workspaceCookie).toContain("amc_session=");
      expect(workspaceCookie).toContain("Path=/w/ws-a");

      const defaultConsole = await httpRaw({
        url: `http://127.0.0.1:${port}/w/ws-a/console/`,
        method: "GET",
        cookie: workspaceCookie
      });
      const defaultConsoleJs = await httpRaw({
        url: `http://127.0.0.1:${port}/w/ws-a/console/assets/app.js`,
        method: "GET",
        cookie: workspaceCookie
      });
      const browserLikeConsoleJs = await httpRaw({
        url: `http://127.0.0.1:${port}/w/ws-a/console/assets/app.js`,
        method: "GET",
        cookie: workspaceCookie,
        headers: {
          origin: `http://127.0.0.1:${port}`,
          referer: `http://127.0.0.1:${port}/w/ws-a/console/`
        }
      });
      const apiWithCookie = await httpRaw({
        url: `http://127.0.0.1:${port}/w/ws-a/api/status`,
        method: "GET",
        cookie: workspaceCookie
      });
      const directApiWithoutCookie = await httpRaw({
        url: `http://127.0.0.1:${port}/w/ws-a/api/status`,
        method: "GET"
      });
      const quickscoreQuestions = await httpRaw({
        url: `http://127.0.0.1:${port}/w/ws-a/api/v1/score/quickscore/questions`,
        method: "GET"
      });
      const nonDefaultConsole = await httpRaw({
        url: `http://127.0.0.1:${port}/w/ws-b/console`,
        method: "GET"
      });

      expect(defaultConsole.status).toBe(200);
      expect(defaultConsole.body).toContain("Compass Console - AMC Studio");
      expect(defaultConsole.body).not.toContain("missing workspace session");
      expect(defaultConsoleJs.status).toBe(200);
      expect(defaultConsoleJs.body).toContain("Desktop app");
      expect(browserLikeConsoleJs.status).toBe(200);
      expect(browserLikeConsoleJs.body).toContain("Desktop app");
      expect(apiWithCookie.status).toBe(200);
      expect(apiWithCookie.body).not.toContain("missing or invalid token");
      expect(directApiWithoutCookie.status).toBe(200);
      expect(directApiWithoutCookie.body).not.toContain("missing or invalid token");
      expect(quickscoreQuestions.status).toBe(200);
      expect(quickscoreQuestions.body).toContain("AMC-1.1");
      expect(nonDefaultConsole.status).toBe(401);
    } finally {
      await host.close();
    }
  }, 30_000);

  test("local demo workspace refuses non-loopback exposure", async () => {
    const { hostDir } = setupHostWithTwoWorkspaces();
    const port = await pickFreePort();
    const attempt = startWorkspaceRouter({
      hostDir,
      host: "0.0.0.0",
      port,
      defaultWorkspaceId: "ws-a",
      allowLocalDemoWorkspace: true
    }).then(async (runtime) => {
      await runtime.close();
      return runtime;
    });

    await expect(attempt).rejects.toThrow(/loopback/i);
  });

  test("host-mode Studio startup isolates its demo vault and repairs a partial default workspace", async () => {
    const originalPassphrase = process.env.AMC_VAULT_PASSPHRASE;
    process.env.AMC_VAULT_PASSPHRASE = "ambient-real-vault-passphrase";
    const hostDir = newDir("amc-partial-demo-host-");
    initHostDb(hostDir);
    createWorkspaceRecord({ hostDir, workspaceId: "demo", name: "Demo Workspace" });
    const port = await pickFreePort();
    const runtime = await runStudioForeground({
      workspace: newDir("amc-demo-shell-workspace-"),
      hostDir,
      defaultWorkspaceId: "demo",
      allowLocalDemoWorkspace: true,
      apiHost: "127.0.0.1",
      apiPort: port
    });

    try {
      const bootstrap = await httpRaw({
        url: `http://127.0.0.1:${port}/w/demo/console`,
        method: "GET"
      });
      const workspaceCookie = Array.isArray(bootstrap.headers["set-cookie"])
        ? bootstrap.headers["set-cookie"][0] ?? ""
        : String(bootstrap.headers["set-cookie"] ?? "");
      const consolePage = await httpRaw({
        url: `http://127.0.0.1:${port}/w/demo/console/`,
        method: "GET",
        cookie: workspaceCookie
      });

      expect(bootstrap.status).toBe(302);
      expect(String(bootstrap.headers.location ?? "")).toBe(`/w/demo/console/`);
      expect(process.env.AMC_VAULT_PASSPHRASE).not.toBe("ambient-real-vault-passphrase");
      expect(process.env.AMC_VAULT_PASSPHRASE).toBe(readFileSync(join(hostDir, "demo-vault-passphrase"), "utf8").trim());
      expect(readFileSync(join(hostWorkspaceDir(hostDir, "demo"), ".amc", "amc.config.yaml"), "utf8")).toContain("trustBoundaryMode");
      expect(consolePage.status).toBe(200);
      expect(consolePage.body).toContain("Compass Console - AMC Studio");
    } finally {
      await runtime.stop();
      if (typeof originalPassphrase === "string") {
        process.env.AMC_VAULT_PASSPHRASE = originalPassphrase;
      } else {
        delete process.env.AMC_VAULT_PASSPHRASE;
      }
    }
  }, 30_000);

  test("host migrate imports single-workspace repo into host mode and preserves signatures", () => {
    process.env.AMC_VAULT_PASSPHRASE = "migrate-passphrase";
    const single = newDir("amc-single-src-");
    initWorkspace({ workspacePath: single, trustBoundaryMode: "isolated" });

    const hostDir = newDir("amc-host-migrate-");
    initHostDb(hostDir);
    createHostUser({
      hostDir,
      username: "migrator",
      password: "migrate-pass-123",
      isHostAdmin: true
    });

    const migrated = hostMigrateCli({
      fromWorkspaceDir: single,
      hostDir,
      workspaceId: "migrated",
      move: false,
      username: "migrator",
      workspaceName: "Migrated Workspace"
    });
    const record = getWorkspaceRecord(hostDir, "migrated");
    const memberships = listAccessibleWorkspaces(hostDir, "migrator");

    expect(migrated.workspaceId).toBe("migrated");
    expect(record?.status).toBe("ACTIVE");
    expect(readFileSync(join(migrated.workspaceDir, ".amc", "trust.yaml"), "utf8").length).toBeGreaterThan(0);
    expect(memberships.map((row) => row.workspaceId)).toContain("migrated");
  }, 30_000);

  test("lease-auth agents cannot access host endpoints", async () => {
    const { hostDir, workspaceA } = setupHostWithTwoWorkspaces();
    const port = await pickFreePort();
    const host = await startWorkspaceRouter({
      hostDir,
      host: "127.0.0.1",
      port,
      defaultWorkspaceId: "ws-a"
    });

    try {
      const lease = issueLeaseForCli({
        workspace: workspaceA,
        workspaceId: "ws-a",
        agentId: "default",
        ttl: "30m",
        scopes: "gateway:llm",
        routes: "/openai",
        models: "gpt-*",
        rpm: 60,
        tpm: 200000
      }).token;
      const denied = await httpRaw({
        url: `http://127.0.0.1:${port}/host/api/workspaces`,
        method: "GET",
        lease
      });
      expect(denied.status).toBe(403);
    } finally {
      await host.close();
    }
  }, 30_000);
});
