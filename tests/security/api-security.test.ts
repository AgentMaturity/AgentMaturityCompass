import { generateKeyPairSync, sign as signDetached } from "node:crypto";
import { createServer, request as httpRequest } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { initWorkspace } from "../../src/workspace.js";
import { loadAssurancePolicy, saveAssurancePolicy } from "../../src/assurance/assurancePolicyStore.js";
import { startStudioApiServer } from "../../src/studio/studioServer.js";
import { issueLeaseForCli } from "../../src/leases/leaseCli.js";
import { canonicalize } from "../../src/utils/json.js";
import { getPrivateKeyPem } from "../../src/crypto/keys.js";
import { addUser, initUsersConfig } from "../../src/auth/authApi.js";
import { initHostDb, createHostUser, createWorkspaceRecord, grantMembership } from "../../src/workspaces/hostDb.js";
import { hostWorkspaceDir } from "../../src/workspaces/workspacePaths.js";
import { startWorkspaceRouter } from "../../src/workspaces/workspaceRouter.js";
import { verifyJwtIdToken } from "../../src/identity/oidc/jwtVerify.js";

const roots: string[] = [];

function newWorkspace(prefix = "amc-api-sec-"): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  roots.push(dir);
  initWorkspace({ workspacePath: dir, trustBoundaryMode: "isolated" });
  return dir;
}

function toBase64Url(bytes: Buffer): string {
  return bytes.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

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

async function httpCall(params: {
  url: string;
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "OPTIONS";
  headers?: Record<string, string>;
  body?: unknown;
}): Promise<{ status: number; body: string; headers: Record<string, string | string[] | undefined> }> {
  const rawBody = params.body === undefined ? "" : JSON.stringify(params.body);
  return new Promise((resolvePromise, rejectPromise) => {
    const req = httpRequest(
      params.url,
      {
        method: params.method ?? "GET",
        headers: {
          connection: "close",
          ...(rawBody.length > 0
            ? {
                "content-type": "application/json",
                "content-length": Buffer.byteLength(rawBody)
              }
            : {}),
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
    if (rawBody.length > 0) {
      req.write(rawBody);
    }
    req.end();
  });
}

function firstSetCookie(headers: Record<string, string | string[] | undefined>): string {
  const setCookie = headers["set-cookie"];
  if (Array.isArray(setCookie)) {
    return setCookie[0] ?? "";
  }
  return typeof setCookie === "string" ? setCookie : "";
}

function buildExpiredSessionToken(params: {
  workspace: string;
  userId: string;
  username: string;
  roles: Array<"OWNER" | "OPERATOR" | "APPROVER" | "AUDITOR" | "VIEWER" | "AGENT">;
}): string {
  const now = Date.now();
  const payload = {
    v: 1 as const,
    userId: params.userId,
    username: params.username,
    roles: params.roles,
    issuedTs: now - 120_000,
    expiresTs: now - 60_000,
    nonce: "expiredsessionnonce1234"
  };
  const payloadBytes = Buffer.from(canonicalize(payload), "utf8");
  const signature = signDetached(null, payloadBytes, getPrivateKeyPem(params.workspace, "session"));
  return `${toBase64Url(payloadBytes)}.${toBase64Url(signature)}`;
}

function setupHostWithMemberships(): { hostDir: string; workspaceA: string; workspaceB: string } {
  if (!process.env.AMC_VAULT_PASSPHRASE) {
    process.env.AMC_VAULT_PASSPHRASE = "api-security-test-passphrase";
  }
  const hostDir = mkdtempSync(join(tmpdir(), "amc-host-sec-"));
  roots.push(hostDir);
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
    password: "viewerb-pass-123",
    isHostAdmin: false
  });
  createWorkspaceRecord({ hostDir, workspaceId: "ws-a", name: "Workspace A" });
  createWorkspaceRecord({ hostDir, workspaceId: "ws-b", name: "Workspace B" });
  const workspaceA = hostWorkspaceDir(hostDir, "ws-a");
  const workspaceB = hostWorkspaceDir(hostDir, "ws-b");
  initWorkspace({ workspacePath: workspaceA, trustBoundaryMode: "isolated" });
  initWorkspace({ workspacePath: workspaceB, trustBoundaryMode: "isolated" });
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

afterEach(() => {
  while (roots.length > 0) {
    const root = roots.pop();
    if (root) {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

describe("API security hardening", () => {
  test("internal /api/v1 routes require human/admin auth and reject lease principals", async () => {
    const workspace = newWorkspace();
    const adminToken = "api-sec-admin-token";
    const api = await startStudioApiServer({
      workspace,
      host: "127.0.0.1",
      port: await pickFreePort(),
      token: adminToken
    });
    try {
      const unauth = await httpCall({
        url: `${api.url}/api/v1/score/status`
      });
      expect(unauth.status).toBe(401);

      const lease = issueLeaseForCli({
        workspace,
        agentId: "default",
        ttl: "30m",
        scopes: "gateway:llm,toolhub:intent,toolhub:execute,governor:check,receipt:verify",
        routes: "/openai",
        models: "*",
        rpm: 100,
        tpm: 100_000
      }).token;
      const leaseAttempt = await httpCall({
        url: `${api.url}/api/v1/score/status`,
        headers: {
          "x-amc-lease": lease
        }
      });
      expect(leaseAttempt.status).toBe(403);

      const admin = await httpCall({
        url: `${api.url}/api/v1/score/status`,
        headers: {
          "x-amc-admin-token": adminToken
        }
      });
      expect(admin.status).toBe(200);

      const publicHealth = await httpCall({
        url: `${api.url}/api/v1/health`
      });
      expect(publicHealth.status).toBe(200);
    } finally {
      await api.close();
    }
  });

  test("Studio sessions enforce least-privilege roles across protected /api/v1 routes", async () => {
    const workspace = newWorkspace("amc-api-rbac-");
    initUsersConfig({
      workspace,
      username: "owner",
      password: "owner-pass-123"
    });
    addUser({ workspace, username: "viewer", password: "viewer-pass-123", roles: ["VIEWER"] });
    addUser({ workspace, username: "auditor", password: "auditor-pass-123", roles: ["AUDITOR"] });
    addUser({ workspace, username: "approver", password: "approver-pass-123", roles: ["APPROVER"] });
    addUser({ workspace, username: "operator", password: "operator-pass-123", roles: ["OPERATOR"] });

    const adminToken = "api-rbac-admin-token";
    const api = await startStudioApiServer({
      workspace,
      host: "127.0.0.1",
      port: await pickFreePort(),
      token: adminToken
    });
    try {
      const login = async (username: string, password: string): Promise<string> => {
        const response = await httpCall({
          method: "POST",
          url: `${api.url}/auth/login`,
          body: { username, password }
        });
        expect(response.status).toBe(200);
        return firstSetCookie(response.headers).split(";", 1)[0] ?? "";
      };

      const viewerCookie = await login("viewer", "viewer-pass-123");
      const viewerRead = await httpCall({
        url: `${api.url}/api/v1/score/status`,
        headers: { cookie: viewerCookie }
      });
      expect(viewerRead.status).toBe(200);

      const viewerAnalyze = await httpCall({
        method: "POST",
        url: `${api.url}/api/v1/vault/redact`,
        headers: { cookie: viewerCookie },
        body: { text: "contact alice@example.com" }
      });
      expect(viewerAnalyze.status).toBe(200);

      const viewerSecretRead = await httpCall({
        url: `${api.url}/api/v1/vault/secret/provider-key`,
        headers: { cookie: viewerCookie }
      });
      expect(viewerSecretRead.status).toBe(403);

      const viewerExecution = await httpCall({
        method: "POST",
        url: `${api.url}/api/v1/sandbox/run`,
        headers: { cookie: viewerCookie },
        body: { command: "printf", args: ["blocked"] }
      });
      expect(viewerExecution.status).toBe(403);

      const auditorCookie = await login("auditor", "auditor-pass-123");
      const auditorMutation = await httpCall({
        method: "POST",
        url: `${api.url}/api/v1/vault/keys/rotate`,
        headers: { cookie: auditorCookie },
        body: {}
      });
      expect(auditorMutation.status).toBe(403);

      const auditorAttest = await httpCall({
        method: "POST",
        url: `${api.url}/api/v1/evidence/attest`,
        headers: { cookie: auditorCookie },
        body: {}
      });
      expect(auditorAttest.status).not.toBe(403);

      const approverCookie = await login("approver", "approver-pass-123");
      const approverIssue = await httpCall({
        method: "POST",
        url: `${api.url}/api/v1/tickets/issue`,
        headers: { cookie: approverCookie },
        body: {}
      });
      expect(approverIssue.status).toBe(400);
      const approverExecution = await httpCall({
        method: "POST",
        url: `${api.url}/api/v1/sandbox/run`,
        headers: { cookie: approverCookie },
        body: { command: "printf", args: ["blocked"] }
      });
      expect(approverExecution.status).toBe(403);

      const operatorCookie = await login("operator", "operator-pass-123");
      const operatorExecution = await httpCall({
        method: "POST",
        url: `${api.url}/api/v1/sandbox/run`,
        headers: { cookie: operatorCookie },
        body: {}
      });
      expect(operatorExecution.status).toBe(400);
      const operatorIdentityMutation = await httpCall({
        method: "POST",
        url: `${api.url}/api/v1/identity/scim/token/create`,
        headers: { cookie: operatorCookie },
        body: {}
      });
      expect(operatorIdentityMutation.status).toBe(403);

      const ownerCookie = await login("owner", "owner-pass-123");
      const ownerIdentityMutation = await httpCall({
        method: "POST",
        url: `${api.url}/api/v1/identity/scim/token/create`,
        headers: { cookie: ownerCookie },
        body: {}
      });
      expect(ownerIdentityMutation.status).toBe(400);

      const adminIdentityMutation = await httpCall({
        method: "POST",
        url: `${api.url}/api/v1/identity/scim/token/create`,
        headers: { "x-amc-admin-token": adminToken },
        body: {}
      });
      expect(adminIdentityMutation.status).toBe(400);
    } finally {
      await api.close();
    }
  }, 30_000);

  test("console snapshot is no longer anonymously accessible", async () => {
    const workspace = newWorkspace();
    const adminToken = "snapshot-admin-token";
    const api = await startStudioApiServer({
      workspace,
      host: "127.0.0.1",
      port: await pickFreePort(),
      token: adminToken
    });
    try {
      const unauth = await httpCall({
        url: `${api.url}/console/snapshot`
      });
      expect(unauth.status).toBe(401);

      const admin = await httpCall({
        url: `${api.url}/console/snapshot`,
        headers: {
          "x-amc-admin-token": adminToken
        }
      });
      expect(admin.status).toBe(200);
    } finally {
      await api.close();
    }
  });

  test("expired signed session token is rejected", async () => {
    const workspace = newWorkspace();
    initUsersConfig({
      workspace,
      username: "owner",
      password: "owner-pass-123"
    });
    const api = await startStudioApiServer({
      workspace,
      host: "127.0.0.1",
      port: await pickFreePort(),
      token: "expired-session-admin-token"
    });
    try {
      const expired = buildExpiredSessionToken({
        workspace,
        userId: "u_owner",
        username: "owner",
        roles: ["OWNER"]
      });
      const response = await httpCall({
        url: `${api.url}/status`,
        headers: {
          cookie: `amc_session=${encodeURIComponent(expired)}`
        }
      });
      expect(response.status).toBe(401);
      expect(response.body.includes("expiredsessionnonce1234")).toBe(false);
    } finally {
      await api.close();
    }
  });

  test("CORS blocks non-allowlisted origins", async () => {
    const workspace = newWorkspace();
    const api = await startStudioApiServer({
      workspace,
      host: "127.0.0.1",
      port: await pickFreePort(),
      token: "cors-admin-token"
    });
    try {
      const blocked = await httpCall({
        method: "OPTIONS",
        url: `${api.url}/status`,
        headers: {
          origin: "https://evil.example"
        }
      });
      expect(blocked.status).toBe(403);
      expect(blocked.headers["access-control-allow-origin"]).toBeUndefined();

      const allowed = await httpCall({
        method: "OPTIONS",
        url: `${api.url}/status`,
        headers: {
          origin: api.url
        }
      });
      expect(allowed.status).toBe(204);
      expect(allowed.headers["access-control-allow-origin"]).toBe(api.url);
    } finally {
      await api.close();
    }
  });

  test("host and workspace login flows are rate-limited", async () => {
    const { hostDir } = setupHostWithMemberships();
    const port = await pickFreePort();
    const host = await startWorkspaceRouter({
      hostDir,
      host: "127.0.0.1",
      port,
      defaultWorkspaceId: "ws-a"
    });
    try {
      let lastHostStatus = 0;
      for (let i = 0; i < 21; i += 1) {
        const response = await httpCall({
          method: "POST",
          url: `http://127.0.0.1:${port}/host/api/login`,
          body: { username: "nobody", password: "wrong-pass" }
        });
        lastHostStatus = response.status;
      }
      expect(lastHostStatus).toBe(429);

      let lastWorkspaceStatus = 0;
      for (let i = 0; i < 21; i += 1) {
        const response = await httpCall({
          method: "POST",
          url: `http://127.0.0.1:${port}/w/ws-a/api/login`,
          body: { username: "nobody", password: "wrong-pass" }
        });
        lastWorkspaceStatus = response.status;
      }
      expect(lastWorkspaceStatus).toBe(429);
    } finally {
      await host.close();
    }
  }, 30_000);

  test("workspace IDOR attempt with cross-workspace cookie is denied", async () => {
    const { hostDir } = setupHostWithMemberships();
    const port = await pickFreePort();
    const host = await startWorkspaceRouter({
      hostDir,
      host: "127.0.0.1",
      port,
      defaultWorkspaceId: "ws-a"
    });
    try {
      const login = await httpCall({
        method: "POST",
        url: `http://127.0.0.1:${port}/w/ws-b/api/login`,
        body: {
          username: "viewerb",
          password: "viewerb-pass-123"
        }
      });
      expect(login.status).toBe(200);
      const wsCookie = firstSetCookie(login.headers);
      expect(wsCookie).toContain("amc_session=");

      const idorAttempt = await httpCall({
        method: "GET",
        url: `http://127.0.0.1:${port}/w/ws-a/api/status`,
        headers: {
          cookie: wsCookie
        }
      });
      expect([401, 403]).toContain(idorAttempt.status);
    } finally {
      await host.close();
    }
  }, 30_000);

  test("OIDC JWT verifier rejects expired and nonce-mismatched tokens", async () => {
    const keyPair = generateKeyPairSync("ed25519");
    const kid = "security-test-kid";
    const issuerPort = await pickFreePort();
    const issuer = `http://127.0.0.1:${issuerPort}`;
    const audience = "amc-security-audience";
    const jwk = keyPair.publicKey.export({ format: "jwk" }) as Record<string, unknown>;
    const server = createServer((req, res) => {
      if ((req.url ?? "").startsWith("/jwks")) {
        res.statusCode = 200;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ keys: [{ ...jwk, kid, alg: "EdDSA", use: "sig" }] }));
        return;
      }
      res.statusCode = 404;
      res.end("not found");
    });
    await new Promise<void>((resolvePromise) => server.listen(issuerPort, "127.0.0.1", () => resolvePromise()));
    try {
      const nowSec = Math.floor(Date.now() / 1000);
      const encodeJwt = (claims: Record<string, unknown>): string => {
        const header = toBase64Url(Buffer.from(JSON.stringify({ alg: "EdDSA", typ: "JWT", kid }), "utf8"));
        const payload = toBase64Url(Buffer.from(JSON.stringify(claims), "utf8"));
        const signingInput = Buffer.from(`${header}.${payload}`, "utf8");
        const signature = signDetached(null, signingInput, keyPair.privateKey);
        return `${header}.${payload}.${toBase64Url(signature)}`;
      };

      const expiredToken = encodeJwt({
        iss: issuer,
        aud: audience,
        sub: "oidc-user-1",
        nonce: "expected-nonce",
        exp: nowSec - 60,
        iat: nowSec - 120
      });
      const expired = await verifyJwtIdToken({
        token: expiredToken,
        issuer,
        audience,
        jwksUri: `${issuer}/jwks`,
        nonce: "expected-nonce",
        clockSkewSeconds: 0
      });
      expect(expired.ok).toBe(false);
      if (!expired.ok) {
        expect(expired.error).toContain("expired");
      }

      const nonceMismatchToken = encodeJwt({
        iss: issuer,
        aud: audience,
        sub: "oidc-user-1",
        nonce: "wrong-nonce",
        exp: nowSec + 600,
        iat: nowSec
      });
      const nonceMismatch = await verifyJwtIdToken({
        token: nonceMismatchToken,
        issuer,
        audience,
        jwksUri: `${issuer}/jwks`,
        nonce: "expected-nonce",
        clockSkewSeconds: 0
      });
      expect(nonceMismatch.ok).toBe(false);
      if (!nonceMismatch.ok) {
        expect(nonceMismatch.error).toContain("nonce mismatch");
      }
    } finally {
      await new Promise<void>((resolvePromise) => server.close(() => resolvePromise()));
    }
  });
});
