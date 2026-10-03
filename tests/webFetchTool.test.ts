import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer as createHttpServer, type Server } from "node:http";
import { createServer as createNetServer, type AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import YAML from "yaml";
import { afterEach, describe, expect, it } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { initToolsConfig, loadToolsConfig, signToolsConfig, toolsConfigPath } from "../src/toolhub/toolhubValidators.js";
import { networkEgressGuard } from "../src/tools/guards/policyGuards.js";
import { ToolPipeline } from "../src/tools/toolPipeline.js";
import { ToolRegistry, defineTool } from "../src/tools/toolRegistry.js";
import { webFetchTool, type WebFetchReceipt } from "../src/tools/builtin/webFetchTool.js";
import { sha256Hex } from "../src/utils/hash.js";

/**
 * web_fetch refuses by default (AMC-1549).
 *
 * The origin allowlist is read from the SIGNED tools policy inside the tool
 * body, so an empty or missing allowlist refuses before any socket is opened —
 * the existing `networkEgressGuard` reads an empty hostAllowlist as "any host"
 * (proved below), so it does not already cover this case.
 */
const PASS = "web-fetch-tool-pass";
const dirs: string[] = [];
const servers: Server[] = [];
const netServers: ReturnType<typeof createNetServer>[] = [];

afterEach(async () => {
  for (const server of servers.splice(0)) await new Promise((done) => server.close(() => done(undefined)));
  for (const server of netServers.splice(0)) await new Promise((done) => server.close(() => done(undefined)));
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function workspace(): string {
  process.env["AMC_VAULT_PASSPHRASE"] = process.env["AMC_VAULT_PASSPHRASE"] ?? PASS;
  const dir = mkdtempSync(join(tmpdir(), "amc-web-fetch-"));
  dirs.push(dir);
  initWorkspace({ workspacePath: dir, trustBoundaryMode: "isolated" });
  initToolsConfig(dir);
  return dir;
}

function signPolicy(dir: string, name: string, hostAllowlist: string[], extra: Record<string, unknown> = {}): void {
  const config = loadToolsConfig(dir);
  config.tools.allowedTools.push({
    name, actionClass: "NETWORK_EXTERNAL", allow: { hostAllowlist }, ...extra
  } as (typeof config.tools.allowedTools)[number]);
  writeFileSync(toolsConfigPath(dir), YAML.stringify(config));
  signToolsConfig(dir);
}

type FetchLike = typeof fetch;
function neverFetch(calls: string[]): FetchLike {
  return (async (input: unknown) => {
    calls.push(String(input));
    throw new Error("fetch must not be called");
  }) as FetchLike;
}
function stubFetch(body: string, init: ResponseInit = {}, calls: string[] = []): FetchLike {
  return (async (input: unknown) => {
    calls.push(String(input));
    return new Response(body, { status: 200, headers: { "content-type": "text/plain" }, ...init });
  }) as FetchLike;
}

function harness(dir: string, options: { fetch?: FetchLike; receipts?: WebFetchReceipt[]; record?: (r: WebFetchReceipt) => void } = {}) {
  const receipts = options.receipts ?? [];
  const registry = new ToolRegistry();
  registry.define(webFetchTool({
    record: options.record ?? ((receipt) => { receipts.push(receipt); }),
    ...(options.fetch ? { fetch: options.fetch } : {})
  }));
  const pipeline = new ToolPipeline({ registry, workspace: dir });
  return {
    receipts,
    run: (args: Record<string, unknown>, mode: "EXECUTE" | "SIMULATE" = "EXECUTE") =>
      pipeline.execute({ name: "web_fetch", agentId: "default", arguments: args, requestedMode: mode })
  };
}

async function connectionRecorder(): Promise<{ port: number; connections: () => number }> {
  let count = 0;
  const server = createNetServer((socket) => { count += 1; socket.destroy(); });
  netServers.push(server);
  await new Promise((done) => server.listen(0, "127.0.0.1", () => done(undefined)));
  return { port: (server.address() as AddressInfo).port, connections: () => count };
}

async function httpServer(handler: Parameters<typeof createHttpServer>[1]): Promise<number> {
  const server = createHttpServer(handler);
  servers.push(server);
  await new Promise((done) => server.listen(0, "127.0.0.1", () => done(undefined)));
  return (server.address() as AddressInfo).port;
}

describe("web_fetch origin allowlist", () => {
  it("refuses http://127.0.0.1:1/ with an empty signed allowlist and never calls fetch", async () => {
    const dir = workspace();
    signPolicy(dir, "web_fetch", []);
    const calls: string[] = [];
    const { run, receipts } = harness(dir, { fetch: neverFetch(calls) });
    const outcome = await run({ url: "http://127.0.0.1:1/" });
    expect(outcome.ok).toBe(false);
    expect(outcome.output).toContain("no allowlisted origins");
    expect(calls).toEqual([]);
    expect(receipts).toEqual([]);
  });

  it("opens no socket for a non-allowlisted origin, with the real fetch", async () => {
    const dir = workspace();
    signPolicy(dir, "web_fetch", []);
    const recorder = await connectionRecorder();
    const { run } = harness(dir);
    const outcome = await run({ url: `http://127.0.0.1:${recorder.port}/` });
    expect(outcome.ok).toBe(false);
    await new Promise((done) => setTimeout(done, 50));
    expect(recorder.connections()).toBe(0);
  });

  it("refuses an origin that is not listed, and matches scheme and port exactly", async () => {
    const dir = workspace();
    signPolicy(dir, "web_fetch", ["docs.example.test", "http://127.0.0.1:8080"]);
    const calls: string[] = [];
    const { run } = harness(dir, { fetch: neverFetch(calls) });
    for (const url of [
      "https://evil.example.test/",
      "https://sub.docs.example.test/", // no subdomain widening
      "http://docs.example.test/", // a bare host grants https only
      "https://docs.example.test:8443/", // and only the default port
      "http://127.0.0.1:8081/",
      "https://127.0.0.1:8080/"
    ]) {
      const outcome = await run({ url });
      expect(outcome.ok, url).toBe(false);
      expect(outcome.output, url).toContain("not on the signed allowlist");
    }
    expect(calls).toEqual([]);
  });

  it("refuses when the signed policy does not list web_fetch, or does not verify", async () => {
    const dir = workspace();
    const calls: string[] = [];
    const { run } = harness(dir, { fetch: neverFetch(calls) });
    expect((await run({ url: "https://docs.example.test/" })).output).toContain("not in the signed tools policy");
    signPolicy(dir, "web_fetch", ["docs.example.test"]);
    rmSync(join(dir, ".amc", "tools.yaml.sig"));
    expect((await run({ url: "https://docs.example.test/" })).output).toContain("not verifiable");
    expect(calls).toEqual([]);
  });

  it("refuses credentials in the url and any caller-supplied headers", async () => {
    const dir = workspace();
    signPolicy(dir, "web_fetch", ["docs.example.test"]);
    const calls: string[] = [];
    const { run } = harness(dir, { fetch: neverFetch(calls) });
    expect((await run({ url: "https://user:pw@docs.example.test/" })).output).toContain("credentials");
    expect((await run({ url: "https://docs.example.test/?api_key=abcdefghijklmnop1234" })).output).toContain("credentials");
    expect((await run({ url: "https://docs.example.test/", headers: { authorization: "x" } })).ok).toBe(false);
    expect(calls).toEqual([]);
  });

  it("proves the existing egress guard does NOT cover an empty allowlist", async () => {
    // Rule 7 of the brief: before adding a guard, show the existing one does
    // not already cover the case. hostAllowedForTool treats an empty list
    // without denyByDefault as "any host".
    const dir = workspace();
    signPolicy(dir, "web_fetch", []);
    const registry = new ToolRegistry();
    registry.define(defineTool({ name: "web_fetch", actionClass: "NETWORK_EXTERNAL", description: "x", body: () => ({ output: "REACHED" }) }));
    registry.guard("network-egress", networkEgressGuard(dir));
    const outcome = await new ToolPipeline({ registry, workspace: dir })
      .execute({ name: "web_fetch", agentId: "default", arguments: { url: "http://127.0.0.1:1/" }, requestedMode: "EXECUTE" });
    expect(outcome.output).toBe("REACHED");
  });
});

describe("web_fetch size caps", () => {
  it("refuses a body over the cap declared by content-length", async () => {
    const dir = workspace();
    signPolicy(dir, "web_fetch", ["docs.example.test"], { maxBytes: 64 });
    const { run, receipts } = harness(dir, { fetch: stubFetch("x".repeat(65), { headers: { "content-length": "65", "content-type": "text/plain" } }) });
    const outcome = await run({ url: "https://docs.example.test/big" });
    expect(outcome.ok).toBe(false);
    expect(outcome.output).toContain("exceeds the 64-byte cap");
    expect(receipts).toEqual([]);
  });

  it("refuses a streamed body that grows past the cap with no content-length", async () => {
    const dir = workspace();
    const port = await httpServer((_req, res) => {
      res.writeHead(200, { "content-type": "text/plain" });
      res.write("y".repeat(40));
      res.end("y".repeat(40));
    });
    signPolicy(dir, "web_fetch", [`http://127.0.0.1:${port}`], { maxBytes: 64 });
    const { run, receipts } = harness(dir);
    const outcome = await run({ url: `http://127.0.0.1:${port}/stream` });
    expect(outcome.ok).toBe(false);
    expect(outcome.output).toContain("exceeds the 64-byte cap");
    expect(receipts).toEqual([]);
  });

  it("lets a call narrow the cap but never widen the signed one", async () => {
    const dir = workspace();
    signPolicy(dir, "web_fetch", ["docs.example.test"], { maxBytes: 64 });
    const { run } = harness(dir, { fetch: stubFetch("z".repeat(32)) });
    expect((await run({ url: "https://docs.example.test/", maxBytes: 16 })).output).toContain("exceeds the 16-byte cap");
    expect((await run({ url: "https://docs.example.test/", maxBytes: 1_000_000 })).ok).toBe(true);
  });
});

describe("web_fetch content, redirects and receipts", () => {
  it("fetches an allowlisted origin over a real socket and writes a digest receipt", async () => {
    const dir = workspace();
    const port = await httpServer((_req, res) => { res.writeHead(200, { "content-type": "text/plain" }); res.end("hello regulated world"); });
    signPolicy(dir, "web_fetch", [`http://127.0.0.1:${port}`]);
    const { run, receipts } = harness(dir);
    const outcome = await run({ url: `http://127.0.0.1:${port}/doc` });
    expect(outcome.ok).toBe(true);
    expect(outcome.output).toBe("hello regulated world");
    expect(receipts).toHaveLength(1);
    expect(receipts[0]).toMatchObject({
      auditType: "NATIVE_WEB_FETCH", origin: `http://127.0.0.1:${port}`, status: 200, bytes: 21,
      contentSha256: sha256Hex("hello regulated world"), deliveredSha256: sha256Hex(outcome.output)
    });
    expect(receipts[0]?.policyDigestSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it("redacts secret-looking content in the output and the receipt", async () => {
    const dir = workspace();
    signPolicy(dir, "web_fetch", ["docs.example.test"]);
    const secret = "AKIAABCDEFGHIJKLMNOP";
    const { run, receipts } = harness(dir, { fetch: stubFetch(`config: aws key ${secret} end`) });
    const outcome = await run({ url: "https://docs.example.test/config" });
    expect(outcome.ok).toBe(true);
    expect(outcome.output).not.toContain(secret);
    expect(outcome.output).toContain("[AMC_REDACTED:aws_key]");
    const receipt = JSON.stringify(receipts[0]);
    expect(receipt).not.toContain(secret);
    expect(receipts[0]?.redactions).toEqual({ aws_key: 1 });
    expect(receipts[0]?.excerpt).toContain("[AMC_REDACTED:aws_key]");
    expect(receipts[0]?.contentSha256).toBe(sha256Hex(`config: aws key ${secret} end`));
  });

  it("does not follow a redirect, even to an allowlisted origin", async () => {
    const dir = workspace();
    signPolicy(dir, "web_fetch", ["docs.example.test"]);
    const { run, receipts } = harness(dir, { fetch: stubFetch("", { status: 302, headers: { location: "https://evil.example.test/" } }) });
    const outcome = await run({ url: "https://docs.example.test/moved" });
    expect(outcome.ok).toBe(false);
    expect(outcome.output).toContain("redirect");
    expect(receipts).toEqual([]);
  });

  it("returns no content when the receipt cannot be recorded", async () => {
    const dir = workspace();
    signPolicy(dir, "web_fetch", ["docs.example.test"]);
    const { run } = harness(dir, { fetch: stubFetch("payload"), record: () => { throw new Error("ledger unavailable"); } });
    const outcome = await run({ url: "https://docs.example.test/" });
    expect(outcome.ok).toBe(false);
    expect(outcome.output).not.toContain("payload");
  });

  it("SIMULATE checks policy and opens no connection", async () => {
    const dir = workspace();
    signPolicy(dir, "web_fetch", ["docs.example.test"]);
    const calls: string[] = [];
    const { run } = harness(dir, { fetch: neverFetch(calls) });
    const outcome = await run({ url: "https://docs.example.test/" }, "SIMULATE");
    expect(outcome.ok).toBe(true);
    expect(outcome.output).toContain("SIMULATE");
    expect(calls).toEqual([]);
    expect((await run({ url: "https://evil.example.test/" }, "SIMULATE")).ok).toBe(false);
  });
});
