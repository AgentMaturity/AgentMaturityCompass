import { createServer, request as httpRequest } from "node:http";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, test } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { initGatewayConfig, type GatewayConfig } from "../src/gateway/config.js";
import { startGateway } from "../src/gateway/server.js";
import { issueLeaseForCli, verifyLeaseForCli } from "../src/leases/leaseCli.js";
import { verifyBridgeLease } from "../src/bridge/bridgeAuth.js";
import { getHookIntegrationStatus, installHookIntegration } from "../src/adapters/hookIntegration.js";
import { createHostUser, createWorkspaceRecord, initHostDb } from "../src/workspaces/hostDb.js";
import { hostWorkspaceDir } from "../src/workspaces/workspacePaths.js";
import { startWorkspaceRouter } from "../src/workspaces/workspaceRouter.js";
import {
  LeaseRevocationUnverifiableError,
  leaseRevocationPaths,
  revokeLease,
  revokedLeaseIdSet,
  verifyLeaseRevocationsSignature
} from "../src/leases/leaseStore.js";
import { verifyLeaseToken } from "../src/leases/leaseVerifier.js";

const roots: string[] = [];

afterEach(() => {
  while (roots.length > 0) {
    const dir = roots.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

function newWorkspace(): string {
  const dir = mkdtempSync(join(tmpdir(), "amc-lease-revocation-"));
  roots.push(dir);
  initWorkspace({ workspacePath: dir, trustBoundaryMode: "isolated" });
  return dir;
}

function issueLease(workspace: string, route = "/openai"): { token: string; leaseId: string } {
  const token = issueLeaseForCli({
    workspace,
    agentId: "default",
    ttl: "30m",
    scopes: "gateway:llm",
    routes: route,
    models: "*",
    rpm: 1000,
    tpm: 1000000,
    maxCostUsdPerDay: null
  }).token;
  const decoded = verifyLeaseToken({ workspace, token });
  if (!decoded.payload) throw new Error("failed to decode freshly issued lease");
  return { token, leaseId: decoded.payload.leaseId };
}

/** Issue a lease, revoke it, and confirm the revocation is live and signed. */
function issueAndRevoke(workspace: string, route = "/openai"): { token: string; leaseId: string } {
  const lease = issueLease(workspace, route);
  revokeLease(workspace, lease.leaseId, "compromised");
  return lease;
}

/** Overwrite the revocation list with an empty one WITHOUT re-signing. */
function tamperRevocations(workspace: string): void {
  writeFileSync(
    leaseRevocationPaths(workspace).file,
    JSON.stringify({ v: 1, updatedTs: 0, revocations: [] })
  );
}

/** Delete the revocation list, leaving its signature behind. */
function deleteRevocations(workspace: string): void {
  rmSync(leaseRevocationPaths(workspace).file);
}

const TAMPERS: Array<{ name: string; apply: (workspace: string) => void }> = [
  { name: "tampered list", apply: tamperRevocations },
  { name: "deleted list", apply: deleteRevocations }
];

describe("lease revocation list fails closed", () => {
  describe("leaseStore.revokedLeaseIdSet", () => {
    test("returns the revoked ids when the list verifies", () => {
      const workspace = newWorkspace();
      const { leaseId } = issueAndRevoke(workspace);
      expect([...revokedLeaseIdSet(workspace)]).toEqual([leaseId]);
    });

    for (const { name, apply } of TAMPERS) {
      test(`throws rather than returning an empty set for a ${name}`, () => {
        const workspace = newWorkspace();
        issueAndRevoke(workspace);
        apply(workspace);
        expect(() => revokedLeaseIdSet(workspace)).toThrow(LeaseRevocationUnverifiableError);
      });
    }
  });

  describe("leaseStore.verifyLeaseRevocationsSignature", () => {
    test("reports a deleted list as invalid rather than as 'no revocations'", () => {
      const workspace = newWorkspace();
      issueAndRevoke(workspace);
      deleteRevocations(workspace);
      const verified = verifyLeaseRevocationsSignature(workspace);
      expect(verified.valid).toBe(false);
      expect(verified.reason).toBe("revocation list missing but signature present");
    });

    test("still treats a never-initialised workspace as valid and empty", () => {
      const workspace = newWorkspace();
      const paths = leaseRevocationPaths(workspace);
      rmSync(paths.file, { force: true });
      rmSync(paths.sig, { force: true });
      expect(verifyLeaseRevocationsSignature(workspace).valid).toBe(true);
      expect([...revokedLeaseIdSet(workspace)]).toEqual([]);
    });
  });

  describe("leaseCli.verifyLeaseForCli", () => {
    test("refuses a revoked lease while the list verifies", () => {
      const workspace = newWorkspace();
      const { token } = issueAndRevoke(workspace);
      expect(verifyLeaseForCli({ workspace, token }).ok).toBe(false);
    });

    for (const { name, apply } of TAMPERS) {
      test(`refuses rather than admits the revoked lease for a ${name}`, () => {
        const workspace = newWorkspace();
        const { token } = issueAndRevoke(workspace);
        apply(workspace);
        const result = verifyLeaseForCli({ workspace, token });
        expect(result.ok).toBe(false);
        expect(result.error).toContain("unverifiable");
      });
    }
  });

  describe("bridgeAuth.verifyBridgeLease", () => {
    function verifyViaBridge(workspace: string, token: string) {
      return verifyBridgeLease({
        workspace,
        requestUrl: new URL("http://127.0.0.1/openai/v1/chat/completions"),
        headers: { "x-amc-lease": token },
        routePath: "/openai",
        requiredScope: "gateway:llm"
      });
    }

    test("refuses a revoked lease while the list verifies", () => {
      const workspace = newWorkspace();
      const { token } = issueAndRevoke(workspace);
      expect(verifyViaBridge(workspace, token).ok).toBe(false);
    });

    for (const { name, apply } of TAMPERS) {
      test(`refuses rather than admits the revoked lease for a ${name}`, () => {
        const workspace = newWorkspace();
        const { token } = issueAndRevoke(workspace);
        apply(workspace);
        const result = verifyViaBridge(workspace, token);
        expect(result.ok).toBe(false);
        expect(result.status).toBe(401);
      });
    }
  });

  describe("hookIntegration.verifyManagedLease", () => {
    for (const { name, apply } of TAMPERS) {
      test(`refuses rather than admits the managed hook lease for a ${name}`, () => {
        const workspace = newWorkspace();
        installHookIntegration({ workspace, provider: "claude-code", agentId: "research-agent" });
        expect(getHookIntegrationStatus({ workspace, provider: "claude-code" }).leaseValid).toBe(true);

        // Create and sign a revocation store, then corrupt it.
        revokeLease(workspace, issueLease(workspace).leaseId, "unrelated");
        apply(workspace);

        const status = getHookIntegrationStatus({ workspace, provider: "claude-code" });
        expect(status.leaseValid).toBe(false);
        expect(status.issues.join(" ")).toContain("unverifiable");
      });
    }
  });

  describe("workspaceRouter.verifyWorkspaceLeaseToken", () => {
    for (const { name, apply } of TAMPERS) {
      test(`refuses rather than admits the revoked lease for a ${name}`, async () => {
        const hostDir = mkdtempSync(join(tmpdir(), "amc-lease-revocation-host-"));
        roots.push(hostDir);
        initHostDb(hostDir);
        createHostUser({ hostDir, username: "admin", password: "admin-pass-123", isHostAdmin: true });
        createWorkspaceRecord({ hostDir, workspaceId: "ws-a", name: "Workspace A" });
        const workspace = hostWorkspaceDir(hostDir, "ws-a");
        initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });

        const token = issueLeaseForCli({
          workspace,
          workspaceId: "ws-a",
          agentId: "default",
          ttl: "30m",
          scopes: "gateway:llm",
          routes: "/openai",
          models: "*",
          rpm: 1000,
          tpm: 1000000,
          maxCostUsdPerDay: null
        }).token;
        const decoded = verifyLeaseToken({ workspace, token });
        revokeLease(workspace, decoded.payload?.leaseId ?? "", "compromised");
        apply(workspace);

        const port = await pickFreePort();
        const host = await startWorkspaceRouter({
          hostDir,
          host: "127.0.0.1",
          port,
          defaultWorkspaceId: "ws-a"
        });
        try {
          const response = await httpGet(`http://127.0.0.1:${port}/w/ws-a/api/state`, {
            "x-amc-lease": token
          });
          expect(response.status).toBe(401);
        } finally {
          await host.close();
        }
      });
    }
  });

  describe("gateway.startGateway", () => {
    for (const { name, apply } of TAMPERS) {
      test(`refuses rather than admits the revoked lease for a ${name}`, async () => {
        const workspace = newWorkspace();
        const { token } = issueAndRevoke(workspace);
        apply(workspace);

        const cfg: GatewayConfig = {
          listen: { host: "127.0.0.1", port: 0 },
          redaction: {
            headerKeysDenylist: ["authorization", "x-api-key", "api-key"],
            jsonPathsDenylist: ["$.api_key"],
            textRegexDenylist: []
          },
          upstreams: {
            local: {
              baseUrl: "http://127.0.0.1:1",
              auth: { type: "none" },
              allowLocalhost: true
            }
          },
          routes: [{ prefix: "/openai", upstream: "local", stripPrefix: true, openaiCompatible: true }],
          streamPassthrough: false,
          proxy: { enabled: false, port: 3211, allowlistHosts: [], denyByDefault: true },
          lease: { allowQueryCarrier: false }
        };
        initGatewayConfig(workspace, cfg);
        const gateway = await startGateway({ workspace });
        try {
          const response = await httpPost(
            `http://${gateway.host}:${gateway.port}/openai/v1/chat/completions`,
            { model: "gpt-test", messages: [{ role: "user", content: "hi" }] },
            { "x-amc-lease": token, "x-amc-agent-id": "default" }
          );
          expect(response.status).toBe(401);
        } finally {
          await gateway.close();
        }
      });
    }
  });
});

async function httpPost(
  url: string,
  payload: Record<string, unknown>,
  headers: Record<string, string>
): Promise<{ status: number; body: string }> {
  const body = JSON.stringify(payload);
  return new Promise((resolvePromise, rejectPromise) => {
    const req = httpRequest(
      url,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "content-length": Buffer.byteLength(body),
          ...headers
        }
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk.toString("utf8")));
        res.on("end", () => resolvePromise({ status: res.statusCode ?? 0, body: data }));
      }
    );
    req.on("error", rejectPromise);
    req.write(body);
    req.end();
  });
}

async function httpGet(url: string, headers: Record<string, string>): Promise<{ status: number; body: string }> {
  return new Promise((resolvePromise, rejectPromise) => {
    const req = httpRequest(url, { method: "GET", headers }, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk.toString("utf8")));
      res.on("end", () => resolvePromise({ status: res.statusCode ?? 0, body: data }));
    });
    req.on("error", rejectPromise);
    req.end();
  });
}

async function pickFreePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", () => done()));
  const address = server.address();
  await new Promise<void>((done) => server.close(() => done()));
  if (!address || typeof address === "string") throw new Error("failed to allocate free port");
  return address.port;
}
