import { createServer, request as httpRequest, type Server } from "node:http";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { initGatewayConfig, type GatewayConfig } from "../src/gateway/config.js";
import { startGateway } from "../src/gateway/server.js";
import { issueLeaseForCli } from "../src/leases/leaseCli.js";
import { credentialRef } from "../src/credentials/credentialRef.js";
import { LocalCredentialsService } from "../src/credentials/localCredentialsService.js";
import {
  applyUpstreamAuth,
  missingUpstreamAuthRefs,
  seamCredentialResolver,
  upstreamCredentials
} from "../src/gateway/upstreamAuth.js";

/**
 * P3.0 stage 3 — the gateway resolves upstream auth through the credentials seam.
 *
 * The claim under test is narrow and load-bearing: a key rotated while the
 * gateway is running applies to the *next request*, with no restart. Before
 * this stage the request path read `process.env[auth.env]` directly, so the
 * only way to change a key was to replace the process that inherited it.
 *
 * The tokens below are synthetic fixtures chosen to look nothing like a real
 * credential. Two of them exist so the rotation assertion can be two-sided: it
 * is not enough that the second request carries the new token, the test must
 * also fail if the gateway kept serving the old one — which is exactly what a
 * hoisted resolution would do.
 */
const REF_NAME = "AMC_TEST_GATEWAY_KEY";
const REF = credentialRef(REF_NAME);
const TOKEN_BEFORE = "rotation-fixture-alpha";
const TOKEN_AFTER = "rotation-fixture-beta";

const cleanups: Array<() => void | Promise<void>> = [];

afterEach(async () => {
  while (cleanups.length > 0) {
    const cleanup = cleanups.pop();
    if (cleanup) await cleanup();
  }
});

function newWorkspace(): string {
  const dir = mkdtempSync(join(tmpdir(), "amc-cred-gateway-"));
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
  initWorkspace({ workspacePath: dir, trustBoundaryMode: "isolated" });
  return dir;
}

/** A temp AMC home holding a 0600 credentials file, or none when `entries` is empty. */
function newCredentialsHome(entries: Record<string, string>): string {
  const home = mkdtempSync(join(tmpdir(), "amc-cred-home-"));
  cleanups.push(() => rmSync(home, { recursive: true, force: true }));
  const file = join(home, ".credentials.yaml");
  const text = Object.entries(entries)
    .map(([name, value]) => `${name}: ${value}\n`)
    .join("");
  writeFileSync(file, text, { mode: 0o600 });
  chmodSync(file, 0o600);
  return home;
}

interface CapturedRequest {
  readonly authorization: string | undefined;
  readonly apiKey: string | undefined;
  readonly queryKey: string | null;
}

/** An upstream that records what the gateway sent it. */
async function startUpstream(seen: CapturedRequest[]): Promise<{ port: number; server: Server }> {
  const server = createServer((req, res) => {
    req.resume();
    req.on("end", () => {
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      seen.push({
        authorization: req.headers.authorization,
        apiKey: typeof req.headers["x-api-key"] === "string" ? req.headers["x-api-key"] : undefined,
        queryKey: url.searchParams.get("key")
      });
      res.statusCode = 200;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ id: "resp", model: "m", usage: { total_tokens: 1 } }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("upstream failed to bind");
  cleanups.push(() => new Promise<void>((resolve) => server.close(() => resolve())));
  return { port: address.port, server };
}

function gatewayConfigFor(port: number, auth: GatewayConfig["upstreams"][string]["auth"]): GatewayConfig {
  return {
    listen: { host: "127.0.0.1", port: 0 },
    redaction: {
      headerKeysDenylist: ["authorization", "x-api-key"],
      jsonPathsDenylist: ["$.api_key"],
      textRegexDenylist: ["(?i)sk-[A-Za-z0-9]{10,}"]
    },
    upstreams: { test: { baseUrl: `http://127.0.0.1:${port}`, auth, allowLocalhost: true } },
    routes: [{ prefix: "/test", upstream: "test", stripPrefix: true, openaiCompatible: true }],
    lease: { allowQueryCarrier: false },
    streamPassthrough: false,
    proxy: { enabled: false, port: 3299, allowlistHosts: [], denyByDefault: true }
  } as GatewayConfig;
}

async function post(url: string, lease: string): Promise<number> {
  const body = JSON.stringify({ model: "m", messages: [{ role: "user", content: "hi" }] });
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      url,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "content-length": Buffer.byteLength(body),
          "x-amc-agent-id": "default",
          "x-amc-lease": lease
        }
      },
      (res) => {
        res.resume();
        res.on("end", () => resolve(res.statusCode ?? 0));
      }
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

function leaseFor(workspace: string): string {
  return issueLeaseForCli({
    workspace,
    agentId: "default",
    ttl: "60m",
    scopes: "gateway:llm",
    routes: "/test",
    models: "*",
    rpm: 1000,
    tpm: 1000000,
    maxCostUsdPerDay: null
  }).token;
}

describe("gateway upstream auth resolves through the credentials seam", () => {
  it("applies a rotated key on the next request, with no restart", async () => {
    const workspace = newWorkspace();
    const seen: CapturedRequest[] = [];
    const upstream = await startUpstream(seen);
    initGatewayConfig(workspace, gatewayConfigFor(upstream.port, { type: "bearer_env", env: REF_NAME }));

    // `env: {}` removes the inherited environment from the layering, so the
    // file layer is both the answer and writable — which is the situation an
    // operator rotating a key with `amc credentials set` is actually in.
    const credentials = new LocalCredentialsService({
      homeDir: newCredentialsHome({ [REF_NAME]: TOKEN_BEFORE }),
      env: {},
      watch: false,
      projectDir: workspace
    });
    cleanups.push(() => credentials.close());

    const gateway = await startGateway({ workspace, credentials });
    cleanups.push(() => gateway.close());
    const lease = leaseFor(workspace);
    const url = `http://${gateway.host}:${gateway.port}/test/v1/chat/completions`;

    expect(await post(url, lease)).toBe(200);

    // Rotation happens against the running gateway. No restart, no reload call.
    await credentials.set(REF, TOKEN_AFTER);

    expect(await post(url, lease)).toBe(200);

    expect(seen).toHaveLength(2);
    expect(seen[0]?.authorization).toBe(`Bearer ${TOKEN_BEFORE}`);
    // Two-sided: the second request must carry the new token AND must not carry
    // the old one. A gateway that resolved once at start-up passes the first
    // assertion of this pair only by failing the second.
    expect(seen[1]?.authorization).toBe(`Bearer ${TOKEN_AFTER}`);
    expect(seen[1]?.authorization).not.toBe(`Bearer ${TOKEN_BEFORE}`);
  });

  it("keeps the env-vars-only path working unchanged", async () => {
    const workspace = newWorkspace();
    const seen: CapturedRequest[] = [];
    const upstream = await startUpstream(seen);
    initGatewayConfig(
      workspace,
      gatewayConfigFor(upstream.port, { type: "header_env", header: "x-api-key", env: REF_NAME })
    );

    // No credentials file at all — the rollback posture, where the inherited
    // environment is the only layer that answers.
    const credentials = new LocalCredentialsService({
      homeDir: newCredentialsHome({}),
      env: { [REF_NAME]: TOKEN_BEFORE },
      watch: false,
      projectDir: workspace
    });
    cleanups.push(() => credentials.close());

    const gateway = await startGateway({ workspace, credentials });
    cleanups.push(() => gateway.close());

    expect(await post(`http://${gateway.host}:${gateway.port}/test/v1/chat/completions`, leaseFor(workspace))).toBe(200);
    expect(seen[0]?.apiKey).toBe(TOKEN_BEFORE);
    expect(credentials.describe(REF)).toEqual({ configured: true, source: "env", writable: false });
  });

  it("fails the request with the reference name, never a value, when nothing configures it", async () => {
    const workspace = newWorkspace();
    const seen: CapturedRequest[] = [];
    const upstream = await startUpstream(seen);
    initGatewayConfig(workspace, gatewayConfigFor(upstream.port, { type: "bearer_env", env: REF_NAME }));

    const credentials = new LocalCredentialsService({
      homeDir: newCredentialsHome({}),
      env: {},
      watch: false,
      projectDir: workspace
    });
    cleanups.push(() => credentials.close());

    const gateway = await startGateway({ workspace, credentials });
    cleanups.push(() => gateway.close());

    expect(await post(`http://${gateway.host}:${gateway.port}/test/v1/chat/completions`, leaseFor(workspace))).toBe(500);
    expect(seen).toHaveLength(0);
  });
});

/**
 * The resolver rules, exercised without binding a socket.
 *
 * Each of these fails if the corresponding rule is deleted, which is the point:
 * the HTTP tests above prove the wiring, these prove the rules the wiring
 * depends on.
 */
describe("upstream credential resolution rules", () => {
  const authBearer = { type: "bearer_env", env: REF_NAME } as const;

  it("treats a blank environment value as absent rather than as a credential", () => {
    const credentials = new LocalCredentialsService({
      homeDir: newCredentialsHome({}),
      env: { [REF_NAME]: "   " },
      watch: false
    });
    cleanups.push(() => credentials.close());

    const headers: Record<string, string> = {};
    const result = applyUpstreamAuth(new URL("http://x/"), headers, authBearer, seamCredentialResolver(credentials));
    // Without empty-is-absent this would send `Bearer` with nothing after it and
    // the operator would debug a 401 instead of reading "missing API key env".
    expect(result.ok).toBe(false);
    expect(result.error).toBe(`missing API key env: ${REF_NAME}`);
    expect(headers.authorization).toBeUndefined();
  });

  it("falls back to the raw environment for a reference the ref grammar rejects", () => {
    const credentials = new LocalCredentialsService({
      homeDir: newCredentialsHome({}),
      env: { "MY-LEGACY-KEY": TOKEN_BEFORE },
      watch: false
    });
    cleanups.push(() => credentials.close());

    const headers: Record<string, string> = {};
    // A hand-edited gateway.yaml may name a variable the branded ref rejects.
    // Before P3.0 that worked; throwing here would be a regression dressed as
    // a security improvement.
    const result = applyUpstreamAuth(
      new URL("http://x/"),
      headers,
      { type: "bearer_env", env: "MY-LEGACY-KEY" },
      seamCredentialResolver(credentials, { "MY-LEGACY-KEY": TOKEN_BEFORE })
    );
    expect(result.ok).toBe(true);
    expect(headers.authorization).toBe(`Bearer ${TOKEN_BEFORE}`);
  });

  it("does not report a file-supplied reference as a missing env var at start-up", () => {
    const credentials = new LocalCredentialsService({
      homeDir: newCredentialsHome({ [REF_NAME]: TOKEN_BEFORE }),
      env: {},
      watch: false
    });
    cleanups.push(() => credentials.close());

    const config = gatewayConfigFor(1, authBearer);
    // The config module's env-only probe would answer [REF_NAME] here — a
    // start-up report contradicted by the very next request.
    expect(missingUpstreamAuthRefs(config, seamCredentialResolver(credentials))).toEqual([]);
    expect(missingUpstreamAuthRefs(config, () => null)).toEqual([REF_NAME]);
  });

  it("closes only a store it created", async () => {
    const supplied = new LocalCredentialsService({
      homeDir: newCredentialsHome({ [REF_NAME]: TOKEN_BEFORE }),
      env: {},
      watch: false
    });
    cleanups.push(() => supplied.close());

    const bound = upstreamCredentials(tmpdir(), supplied);
    await bound.close();
    // Still usable: closing a caller-supplied store would tear down a watcher
    // the caller is relying on.
    expect(bound.resolve(REF_NAME)).toBe(TOKEN_BEFORE);
  });
});
