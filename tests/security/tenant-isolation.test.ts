import { createServer, request as httpRequest } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, test } from "vitest";
import { initWorkspace } from "../../src/workspace.js";
import { issueLeaseForCli } from "../../src/leases/leaseCli.js";
import { openLedger } from "../../src/ledger/ledger.js";
import {
  createHostUser,
  createWorkspaceRecord,
  grantMembership,
  initHostDb
} from "../../src/workspaces/hostDb.js";
import { hostWorkspaceDir } from "../../src/workspaces/workspacePaths.js";
import { startWorkspaceRouter } from "../../src/workspaces/workspaceRouter.js";

const tempRoots: string[] = [];

function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempRoots.push(dir);
  return dir;
}

async function pickFreePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolvePromise) => server.listen(0, "127.0.0.1", () => resolvePromise()));
  const address = server.address();
  await new Promise<void>((resolvePromise) => server.close(() => resolvePromise()));
  if (!address || typeof address === "string") {
    throw new Error("failed to allocate port");
  }
  return address.port;
}

async function httpCall(params: {
  url: string;
  method: "GET" | "POST";
  body?: unknown;
  cookie?: string;
  lease?: string;
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
          ...(params.lease ? { "x-amc-lease": params.lease } : {})
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

function setupTenantHost(): {
  hostDir: string;
  workspaceA: string;
  workspaceB: string;
} {
  process.env.AMC_VAULT_PASSPHRASE = "tenant-isolation-passphrase";
  const hostDir = tempDir("amc-tenant-isolation-");
  initHostDb(hostDir);
  createHostUser({
    hostDir,
    username: "admin",
    password: "admin-pass-123",
    isHostAdmin: true
  });
  createHostUser({
    hostDir,
    username: "usera",
    password: "usera-pass-123",
    isHostAdmin: false
  });
  createWorkspaceRecord({
    hostDir,
    workspaceId: "ws-a",
    name: "Workspace A"
  });
  createWorkspaceRecord({
    hostDir,
    workspaceId: "ws-b",
    name: "Workspace B"
  });
  const workspaceA = hostWorkspaceDir(hostDir, "ws-a");
  const workspaceB = hostWorkspaceDir(hostDir, "ws-b");
  initWorkspace({ workspacePath: workspaceA, trustBoundaryMode: "isolated" });
  initWorkspace({ workspacePath: workspaceB, trustBoundaryMode: "isolated" });
  grantMembership({
    hostDir,
    username: "usera",
    workspaceId: "ws-a",
    role: "VIEWER"
  });
  return {
    hostDir,
    workspaceA,
    workspaceB
  };
}

afterEach(() => {
  while (tempRoots.length > 0) {
    const root = tempRoots.pop();
    if (root) {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

describe("tenant isolation security", () => {
  test("unauthenticated tenant requests cannot reach workspace API data paths", async () => {
    const { hostDir } = setupTenantHost();
    const port = await pickFreePort();
    const host = await startWorkspaceRouter({
      hostDir,
      host: "127.0.0.1",
      port,
      defaultWorkspaceId: "ws-a"
    });
    try {
      const denied = await httpCall({
        url: `http://127.0.0.1:${port}/w/ws-b/api/v1/watch/receipts/default?limit=1`,
        method: "GET"
      });
      expect(denied.status).toBe(401);
      expect(denied.body).toContain("missing workspace session");
    } finally {
      await host.close();
    }
  }, 40_000);

  test("lease workspace mismatch is blocked and audited in requested workspace only", async () => {
    const { hostDir, workspaceA, workspaceB } = setupTenantHost();
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
        scopes: "gateway:llm,toolhub:intent,toolhub:execute",
        routes: "/openai",
        models: "gpt-*",
        rpm: 60,
        tpm: 200000
      }).token;
      const denied = await httpCall({
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
      expect(denied.status).toBe(403);
      expect(denied.body).toContain("lease workspace mismatch");

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
  }, 40_000);

  test("workspace session tokens cannot be replayed across tenants", async () => {
    const { hostDir } = setupTenantHost();
    const port = await pickFreePort();
    const host = await startWorkspaceRouter({
      hostDir,
      host: "127.0.0.1",
      port,
      defaultWorkspaceId: "ws-a"
    });
    try {
      const login = await httpCall({
        url: `http://127.0.0.1:${port}/w/ws-a/api/login`,
        method: "POST",
        body: {
          username: "usera",
          password: "usera-pass-123"
        }
      });
      expect(login.status).toBe(200);
      const wsACookie = Array.isArray(login.headers["set-cookie"])
        ? login.headers["set-cookie"][0] ?? ""
        : String(login.headers["set-cookie"] ?? "");
      const replay = await httpCall({
        url: `http://127.0.0.1:${port}/w/ws-b/api/v1/watch/status`,
        method: "GET",
        cookie: wsACookie
      });
      expect(replay.status).toBe(401);
      expect(replay.body).toContain("missing workspace session");
    } finally {
      await host.close();
    }
  }, 40_000);
});
