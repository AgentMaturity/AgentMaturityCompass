import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  forwardProviderHookControl,
  forwardProviderHookEvent,
  getHookIntegrationStatus,
  installHookIntegration
} from "../src/adapters/hookIntegration.js";
import { verifyBridgeLease } from "../src/bridge/bridgeAuth.js";
import { initGatewayConfig, type GatewayConfig } from "../src/gateway/config.js";
import { startGateway } from "../src/gateway/server.js";
import { createWorkspaceRecord, initHostDb } from "../src/workspaces/hostDb.js";
import { hostWorkspaceDir } from "../src/workspaces/workspacePaths.js";
import { startWorkspaceRouter } from "../src/workspaces/workspaceRouter.js";
import { initWorkspace } from "../src/workspace.js";
import { workspaceIdFromDirectory } from "../src/workspaces/workspaceId.js";
import {
  leaseRevocationPaths,
  revokeLease,
  revokedLeaseIdSet,
  signLeaseRevocations,
  verifyLeaseRevocationsSignature
} from "../src/leases/leaseStore.js";
import { ensureLeaseRevocationStore, issueLeaseForCli, verifyLeaseForCli } from "../src/leases/leaseCli.js";

/**
 * The revocation store is what stands between a revoked lease and its
 * continued use. Three fail-open defects lived around it:
 *
 *   `revokedLeaseIdSet` answered an unverifiable store with an EMPTY SET, so
 *   tampering with one file un-revoked every lease ever revoked;
 *
 *   `verifyLeaseForCli` built its set from `loadLeaseRevocations` without
 *   checking the store's signature at all, so `amc lease verify` honoured a
 *   tampered list;
 *
 *   `ensureLeaseRevocationStore` SIGNED the store and then verified the
 *   signature it had just written — laundering any tampering and making the
 *   CLI's "signature invalid" branch unreachable.
 *
 * Managed hooks must use that authenticated set too, and a missing list whose
 * signature survives must not be mistaken for a never-initialised store.
 */

const roots: string[] = [];
const originalVaultPassphrase = process.env.AMC_VAULT_PASSPHRASE;

function newWorkspace(): string {
  const dir = mkdtempSync(join(tmpdir(), "amc-lease-revocation-test-"));
  roots.push(dir);
  process.env.AMC_VAULT_PASSPHRASE = "lease-revocation-test-passphrase";
  initWorkspace({ workspacePath: dir, trustBoundaryMode: "isolated" });
  return dir;
}

afterEach(() => {
  vi.restoreAllMocks();
  if (originalVaultPassphrase === undefined) delete process.env.AMC_VAULT_PASSPHRASE;
  else process.env.AMC_VAULT_PASSPHRASE = originalVaultPassphrase;
  while (roots.length > 0) {
    const dir = roots.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

/** Sign a healthy store holding one revocation, then corrupt the file body. */
function tamperedStore(workspace: string): void {
  revokeLease(workspace, "lease-gone", "test");
  const paths = leaseRevocationPaths(workspace);
  const body = JSON.parse(readFileSync(paths.file, "utf8"));
  writeFileSync(paths.file, JSON.stringify({ ...body, revocations: [] }, null, 2));
}

const storeTampering = [
  {
    name: "tampered list",
    apply(workspace: string): void {
      const path = leaseRevocationPaths(workspace).file;
      const body = JSON.parse(readFileSync(path, "utf8"));
      writeFileSync(path, JSON.stringify({ ...body, revocations: [] }, null, 2));
    }
  },
  {
    name: "deleted list",
    apply(workspace: string): void {
      rmSync(leaseRevocationPaths(workspace).file);
    }
  }
];

function issueGatewayLease(workspace: string, workspaceId = workspaceIdFromDirectory(workspace)): string {
  return issueLeaseForCli({
    workspace,
    workspaceId,
    agentId: "default",
    ttl: "1h",
    scopes: "gateway:llm",
    routes: "/openai",
    models: "*",
    rpm: 1000,
    tpm: 1000000,
    maxCostUsdPerDay: null
  }).token;
}

function revokeToken(workspace: string, token: string): void {
  const verified = verifyLeaseForCli({ workspace, token });
  expect(verified.ok).toBe(true);
  const payload = verified.payload as { leaseId: string };
  revokeLease(workspace, payload.leaseId, "compromised");
  expect(verifyLeaseForCli({ workspace, token }).error).toBe("lease revoked");
}

describe("revokedLeaseIdSet fails closed", () => {
  test("returns the revoked ids from a healthy signed store", () => {
    const workspace = newWorkspace();
    revokeLease(workspace, "lease-a", "compromised");
    expect(revokedLeaseIdSet(workspace)).toEqual(new Set(["lease-a"]));
  });

  test("throws on a tampered store instead of answering an empty set", () => {
    const workspace = newWorkspace();
    tamperedStore(workspace);
    expect(verifyLeaseRevocationsSignature(workspace).valid).toBe(false);
    expect(() => revokedLeaseIdSet(workspace)).toThrow(/revocation/i);
  });

  test("refuses a deleted list while preserving its surviving signature", () => {
    const workspace = newWorkspace();
    revokeLease(workspace, "lease-deleted", "compromised");
    const paths = leaseRevocationPaths(workspace);
    const signature = readFileSync(paths.sig);
    rmSync(paths.file);

    expect(verifyLeaseRevocationsSignature(workspace)).toEqual({
      valid: false,
      signatureExists: true,
      reason: "revocation list missing but signature present"
    });
    expect(() => revokedLeaseIdSet(workspace)).toThrow(/revocation store unverifiable/);
    expect(ensureLeaseRevocationStore(workspace).signatureValid).toBe(false);
    expect(existsSync(paths.file)).toBe(false);
    expect(readFileSync(paths.sig)).toEqual(signature);
  });

  test("allows a never-initialised store to bootstrap without inventing revocations", () => {
    const workspace = mkdtempSync(join(tmpdir(), "amc-empty-revocation-store-"));
    roots.push(workspace);
    expect(verifyLeaseRevocationsSignature(workspace)).toEqual({
      valid: true, signatureExists: false, reason: null
    });
    expect(revokedLeaseIdSet(workspace)).toEqual(new Set());
    expect(existsSync(leaseRevocationPaths(workspace).file)).toBe(false);
  });
});

describe("verifyLeaseForCli checks the store it trusts", () => {
  function issue(workspace: string): string {
    return issueLeaseForCli({
      workspace,
      workspaceId: workspaceIdFromDirectory(workspace),
      agentId: "agent-under-test",
      ttl: "1h",
      scopes: "gateway:llm",
      routes: "/openai",
      models: "*",
      rpm: 10,
      tpm: 1000,
      maxCostUsdPerDay: null,
      workOrderId: undefined
    }).token;
  }

  test("accepts a valid lease and rejects a revoked one on a healthy store", () => {
    const workspace = newWorkspace();
    const token = issue(workspace);
    expect(verifyLeaseForCli({ workspace, token }).ok).toBe(true);

    const payload = JSON.parse(Buffer.from(token.split(".")[0], "base64url").toString("utf8"));
    revokeLease(workspace, payload.leaseId, "test revocation");
    const rejected = verifyLeaseForCli({ workspace, token });
    expect(rejected.ok).toBe(false);
  });

  test("refuses to verify anything against a tampered revocation store", () => {
    const workspace = newWorkspace();
    const token = issue(workspace);
    tamperedStore(workspace);
    const result = verifyLeaseForCli({ workspace, token });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/revocation/i);
  });
});

describe("ensureLeaseRevocationStore does not launder tampering", () => {
  test("bootstraps a missing store as signed and valid", () => {
    const workspace = newWorkspace();
    const ensured = ensureLeaseRevocationStore(workspace);
    expect(ensured.signatureValid).toBe(true);
    expect(verifyLeaseRevocationsSignature(workspace).valid).toBe(true);
  });

  test("reports a tampered store invalid and leaves the evidence in place", () => {
    const workspace = newWorkspace();
    tamperedStore(workspace);
    const sigBefore = readFileSync(leaseRevocationPaths(workspace).sig, "utf8");

    const ensured = ensureLeaseRevocationStore(workspace);
    expect(ensured.signatureValid).toBe(false);
    // The stale signature is evidence of what was tampered with; re-signing
    // over it would certify the tampered content as authentic.
    expect(readFileSync(leaseRevocationPaths(workspace).sig, "utf8")).toBe(sigBefore);
  });

  test("re-running on a healthy store keeps it valid", () => {
    const workspace = newWorkspace();
    signLeaseRevocations(workspace);
    expect(ensureLeaseRevocationStore(workspace).signatureValid).toBe(true);
  });
});

describe("resignLeaseRevocationsForCli is the one deliberate repair path", () => {
  test("re-signing a tampered store restores verification and reports what was vouched for", async () => {
    const { resignLeaseRevocationsForCli } = await import("../src/leases/leaseCli.js");
    const workspace = newWorkspace();
    tamperedStore(workspace);
    const result = resignLeaseRevocationsForCli(workspace);
    expect(result.wasValid).toBe(false);
    expect(verifyLeaseRevocationsSignature(workspace).valid).toBe(true);
    // The tampered content emptied the list; the report says so.
    expect(result.revocationCount).toBe(0);
  });
});

describe("managed hooks authenticate the revocation store", () => {
  for (const provider of ["claude-code", "gemini-cli"] as const) {
    for (const mode of ["observe", "control"] as const) {
      test.each(storeTampering)(`${provider} ${mode} refuses a $name before forwarding or reinstalling`, async ({ apply }) => {
        const workspace = newWorkspace();
        const options = { workspace, provider, mode, agentId: "research-agent" };
        installHookIntegration(options);
        const initial = getHookIntegrationStatus({ workspace, provider });
        expect(initial).toMatchObject({ state: "installed", leaseValid: true });
        const token = readFileSync(initial.files.token, "utf8").trim();
        revokeToken(workspace, token);
        expect(getHookIntegrationStatus({ workspace, provider }).leaseValid).toBe(false);

        apply(workspace);
        const protectedPaths = [...Object.values(initial.files), ...Object.values(leaseRevocationPaths(workspace))];
        const before = protectedPaths.map((path) => ({ path, bytes: existsSync(path) ? readFileSync(path) : null }));
        // Any attempted transmission is a test failure, even if a server would
        // independently reject it. The local managed lease must refuse first.
        const transmission = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("unexpected hook transmission"));
        const status = getHookIntegrationStatus({ workspace, provider });
        expect(status).toMatchObject({ state: "invalid", leaseValid: false, manifestValid: true });
        expect(status.issues.join(" ")).toContain("revocation store unverifiable");

        const invocation = {
          workspace,
          provider,
          agentId: options.agentId,
          tokenFile: initial.files.token,
          rawInput: JSON.stringify({
            session_id: "revocation-test-session",
            hook_event_name: provider === "claude-code" ? "PreToolUse" : "BeforeTool",
            tool_name: "Read",
            tool_use_id: "revocation-test-call",
            tool_input: { file_path: "README.md" }
          })
        };
        const forwarded = mode === "control"
          ? forwardProviderHookControl(invocation)
          : forwardProviderHookEvent(invocation);
        await expect(forwarded).rejects.toMatchObject({
          code: "HOOK_TOKEN_INVALID",
          message: expect.stringContaining("revocation store unverifiable")
        });
        expect(transmission).not.toHaveBeenCalled();
        expect(() => installHookIntegration(options)).toThrow(/revocation store signature is invalid/);
        for (const { path, bytes } of before) {
          expect(existsSync(path) ? readFileSync(path) : null).toEqual(bytes);
        }
      });
    }
  }

  test("reports signed malformed store data as an invalid lease rather than throwing from status", () => {
    const workspace = newWorkspace();
    installHookIntegration({ workspace, provider: "claude-code", agentId: "research-agent" });
    const path = leaseRevocationPaths(workspace).file;
    writeFileSync(path, JSON.stringify({ v: 1, updatedTs: Date.now(), revocations: "invalid" }));
    signLeaseRevocations(workspace);
    expect(verifyLeaseRevocationsSignature(workspace).valid).toBe(true);
    expect(getHookIntegrationStatus({ workspace, provider: "claude-code" })).toMatchObject({
      state: "invalid", leaseValid: false, manifestValid: true
    });
  });
});

describe("lease consumers refuse damaged signed revocation stores", () => {
  test.each(storeTampering)("CLI and Bridge refuse a revoked lease after a $name", ({ apply }) => {
    const workspace = newWorkspace();
    const token = issueGatewayLease(workspace);
    const viaBridge = () => verifyBridgeLease({
      workspace,
      requestUrl: new URL("http://127.0.0.1/openai/v1/chat/completions"),
      headers: { "x-amc-lease": token },
      routePath: "/openai",
      requiredScope: "gateway:llm"
    });
    expect(viaBridge().ok).toBe(true);
    revokeToken(workspace, token);
    expect(viaBridge()).toMatchObject({ ok: false, status: 401, error: "lease revoked" });
    apply(workspace);
    expect(verifyLeaseForCli({ workspace, token })).toMatchObject({
      ok: false, payload: null, error: expect.stringContaining("revocation store unverifiable")
    });
    expect(viaBridge()).toMatchObject({
      ok: false, status: 401, error: expect.stringContaining("lease revocation signature invalid")
    });
  });

  test.each(storeTampering)("workspace router refuses a revoked lease after a $name", async ({ apply }) => {
    const hostDir = mkdtempSync(join(tmpdir(), "amc-lease-revocation-host-"));
    roots.push(hostDir);
    process.env.AMC_VAULT_PASSPHRASE = "lease-revocation-test-passphrase";
    initHostDb(hostDir);
    createWorkspaceRecord({ hostDir, workspaceId: "ws-a", name: "Workspace A" });
    const workspace = hostWorkspaceDir(hostDir, "ws-a");
    initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
    const token = issueGatewayLease(workspace, "ws-a");
    revokeToken(workspace, token);
    apply(workspace);

    const probe = createServer();
    const port = await listenOnLoopback(probe);
    await closeServer(probe);
    const router = await startWorkspaceRouter({ hostDir, host: "127.0.0.1", port, defaultWorkspaceId: "ws-a" });
    try {
      const response = await fetch(`http://127.0.0.1:${port}/w/ws-a/api/state`, {
        headers: { "x-amc-lease": token }, signal: AbortSignal.timeout(5000)
      });
      expect(response.status).toBe(401);
      expect(await response.json()).toMatchObject({
        error: expect.stringContaining("lease revocation signature invalid")
      });
    } finally {
      await router.close();
    }
  });

  test.each(storeTampering)("gateway refuses a revoked lease after a $name without reaching its upstream", async ({ apply }) => {
    const workspace = newWorkspace();
    const token = issueGatewayLease(workspace);
    let upstreamRequests = 0;
    const upstream = createServer((_request, response) => {
      upstreamRequests += 1;
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ id: "local-revocation-fixture", choices: [], usage: { total_tokens: 0 } }));
    });
    const upstreamPort = await listenOnLoopback(upstream);
    try {
      const config: GatewayConfig = {
        listen: { host: "127.0.0.1", port: 0 },
        redaction: {
          headerKeysDenylist: ["authorization", "x-api-key", "api-key"],
          jsonPathsDenylist: ["$.api_key"], textRegexDenylist: []
        },
        upstreams: {
          local: { baseUrl: `http://127.0.0.1:${upstreamPort}`, auth: { type: "none" }, allowLocalhost: true }
        },
        routes: [{ prefix: "/openai", upstream: "local", stripPrefix: true, openaiCompatible: true }],
        streamPassthrough: false,
        proxy: { enabled: false, port: 3211, allowlistHosts: [], denyByDefault: true },
        lease: { allowQueryCarrier: false }
      };
      initGatewayConfig(workspace, config);
      const gateway = await startGateway({ workspace });
      try {
        const request = () => fetch(`http://${gateway.host}:${gateway.port}/openai/v1/chat/completions`, {
          method: "POST",
          headers: { "content-type": "application/json", "x-amc-lease": token, "x-amc-agent-id": "default" },
          body: JSON.stringify({ model: "revocation-fixture", messages: [{ role: "user", content: "local fixture" }] }),
          signal: AbortSignal.timeout(5000)
        });
        const healthy = await request();
        expect(healthy.status).toBe(200);
        await healthy.arrayBuffer();
        expect(upstreamRequests).toBe(1);
        revokeToken(workspace, token);
        apply(workspace);
        const refused = await request();
        expect(refused.status).toBe(401);
        expect(await refused.text()).toContain("lease revocation signature invalid");
        expect(upstreamRequests).toBe(1);
      } finally {
        await gateway.close();
      }
    } finally {
      await closeServer(upstream);
    }
  });
});

async function listenOnLoopback(server: Server): Promise<number> {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.removeListener("error", reject);
      resolve();
    });
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("loopback fixture has no port");
  return address.port;
}

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
    server.closeAllConnections();
  });
}
