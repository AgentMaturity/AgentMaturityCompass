import { request as httpRequest } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, test } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { startStudioApiServer } from "../src/studio/studioServer.js";
import { runStudioForeground } from "../src/studio/studioSupervisor.js";
import { runBootstrap } from "../src/bootstrap/bootstrap.js";
import { valuePolicyPath, valuePolicySigPath, verifyValuePolicySignature } from "../src/value/valueStore.js";
import { pathExists, readUtf8, writeFileAtomic } from "../src/utils/fs.js";

// P2-06-D2: a fresh workspace must become Ready with no manual `amc value init`,
// while readiness itself stays read-only and fail-closed.
const roots: string[] = [];

function freshWorkspace(): string {
  const workspace = mkdtempSync(join(tmpdir(), "amc-value-ready-"));
  roots.push(workspace);
  process.env.AMC_VAULT_PASSPHRASE = "value-ready-passphrase";
  initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
  return workspace;
}

afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true });
});

function get(url: string): Promise<{ status: number; body: string }> {
  return new Promise((resolvePromise, rejectPromise) => {
    const req = httpRequest(url, { method: "GET" }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      res.on("end", () => resolvePromise({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8") }));
    });
    req.on("error", rejectPromise);
    req.end();
  });
}

async function readyz(workspace: string): Promise<{ status: number; body: string }> {
  const server = await startStudioApiServer({ workspace, host: "127.0.0.1", port: 0, token: "value-ready-token" });
  try {
    const address = server.server.address();
    if (!address || typeof address === "string") throw new Error("failed to bind studio test server");
    return await get(`http://127.0.0.1:${address.port}/readyz`);
  } finally {
    await server.close();
  }
}

describe("fresh workspace value policy readiness (P2-06-D2)", () => {
  test("init creates a signed value policy and /readyz has no VALUE_POLICY_UNTRUSTED", async () => {
    const workspace = freshWorkspace();
    expect(pathExists(valuePolicyPath(workspace))).toBe(true);
    expect(verifyValuePolicySignature(workspace).valid).toBe(true);
    const ready = await readyz(workspace);
    expect(ready.body).not.toContain("VALUE_POLICY_UNTRUSTED");
    expect(ready.status).toBe(200);
  }, 30_000);

  test("a tampered value policy still reads NOT ready", async () => {
    const workspace = freshWorkspace();
    writeFileAtomic(valuePolicyPath(workspace), `${readUtf8(valuePolicyPath(workspace))}\n# tampered\n`, 0o644);
    const ready = await readyz(workspace);
    expect(ready.status).toBe(503);
    expect(ready.body).toContain("VALUE_POLICY_UNTRUSTED");
  }, 30_000);

  test("readiness never creates a missing value policy", async () => {
    const workspace = freshWorkspace();
    rmSync(valuePolicyPath(workspace));
    rmSync(valuePolicySigPath(workspace));
    const ready = await readyz(workspace);
    expect(ready.status).toBe(503);
    expect(ready.body).toContain("VALUE_POLICY_UNTRUSTED: file missing");
    expect(pathExists(valuePolicyPath(workspace))).toBe(false);
  }, 30_000);

  test("studio start signs a value policy missing from a workspace initialized before the fix", async () => {
    const workspace = freshWorkspace();
    rmSync(valuePolicyPath(workspace));
    rmSync(valuePolicySigPath(workspace));
    const runtime = await runStudioForeground({ workspace, apiPort: 0, gatewayPort: 0, proxyPort: 0, dashboardPort: 0, metricsPort: 0 });
    try {
      expect(verifyValuePolicySignature(workspace).valid).toBe(true);
    } finally {
      await runtime.stop();
    }
  }, 60_000);

  test("studio start neither rewrites nor trips on an unparseable value policy, which stays NOT ready", async () => {
    const workspace = freshWorkspace();
    writeFileAtomic(valuePolicyPath(workspace), "valuePolicy: [not a policy\n", 0o644);
    const runtime = await runStudioForeground({ workspace, apiPort: 0, gatewayPort: 0, proxyPort: 0, dashboardPort: 0, metricsPort: 0 });
    try {
      expect(readUtf8(valuePolicyPath(workspace))).toBe("valuePolicy: [not a policy\n");
      expect(verifyValuePolicySignature(workspace).valid).toBe(false);
    } finally {
      await runtime.stop();
    }
    const ready = await readyz(workspace);
    expect(ready.status).toBe(503);
    expect(ready.body).toContain("VALUE_POLICY_UNTRUSTED");
  }, 60_000);

  test("Helm's `amc bootstrap` on an empty volume leaves a Ready workspace", async () => {
    const workspace = mkdtempSync(join(tmpdir(), "amc-value-bootstrap-"));
    roots.push(workspace);
    await runBootstrap({ workspace, vaultPassphrase: "value-ready-passphrase", ownerUsername: "owner", ownerPassword: "value-ready-owner-password",
      lanMode: false, bind: "127.0.0.1", studioPort: 0, allowedCidrs: [], enableNotary: false, notaryBaseUrl: "http://127.0.0.1:1",
      notaryRequiredAttestation: "SOFTWARE", notaryAuthSecret: null });
    expect(verifyValuePolicySignature(workspace).valid).toBe(true);
    const ready = await readyz(workspace);
    expect(ready.body).not.toContain("VALUE_POLICY_UNTRUSTED");
    expect(ready.status).toBe(200);
  }, 60_000);
});
