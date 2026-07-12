import { createServer, request as httpRequest } from "node:http";
import { mkdtempSync, rmSync, chmodSync, writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, test } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { initGatewayConfig, type GatewayConfig } from "../src/gateway/config.js";
import { startGateway } from "../src/gateway/server.js";
import { issueLeaseForCli } from "../src/leases/leaseCli.js";
import { openLedger } from "../src/ledger/ledger.js";
import { assembleAdapterEnv, redactSecretsInText } from "../src/adapters/envAssembler.js";
import { listBuiltInAdapters } from "../src/adapters/registry.js";
import {
  adaptersDetectCli,
  adaptersConfigureCli,
  adaptersInitCli,
  adaptersRunCli,
  adaptersVerifyCli
} from "../src/adapters/adapterCli.js";
import { runDoctorCli } from "../src/doctor/doctorCli.js";
import { runStudioForeground } from "../src/studio/studioSupervisor.js";

const roots: string[] = [];

function newWorkspace(): string {
  const dir = mkdtempSync(join(tmpdir(), "amc-adapters-test-"));
  roots.push(dir);
  initWorkspace({ workspacePath: dir, trustBoundaryMode: "isolated" });
  return dir;
}

async function pickFreePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolvePromise) => server.listen(0, "127.0.0.1", () => resolvePromise()));
  const address = server.address();
  await new Promise<void>((resolvePromise) => server.close(() => resolvePromise()));
  if (!address || typeof address === "string") {
    throw new Error("failed to allocate free port");
  }
  return address.port;
}

async function httpPost(url: string, payload: Record<string, unknown>, headers: Record<string, string>): Promise<{ status: number; body: string }> {
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

function issueGatewayLease(workspace: string, route = "/openai"): string {
  return issueLeaseForCli({
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
}

afterEach(() => {
  while (roots.length > 0) {
    const root = roots.pop();
    if (root) {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

describe("lease carriers, adapters, and doctor", () => {
  test("gateway accepts lease via Authorization/x-api-key, rejects invalid, and never forwards auth headers", async () => {
    const workspace = newWorkspace();
    let seenAuthHeader: string | undefined;
    let seenXApiKey: string | undefined;
    let seenApiKey: string | undefined;
    let seenXGoogApiKey: string | undefined;

    const upstream = createServer((req, res) => {
      seenAuthHeader = typeof req.headers.authorization === "string" ? req.headers.authorization : undefined;
      seenXApiKey = typeof req.headers["x-api-key"] === "string" ? req.headers["x-api-key"] : undefined;
      seenApiKey = typeof req.headers["api-key"] === "string" ? req.headers["api-key"] : undefined;
      seenXGoogApiKey = typeof req.headers["x-goog-api-key"] === "string" ? req.headers["x-goog-api-key"] : undefined;
      res.statusCode = 200;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ ok: true, model: "gpt-test" }));
    });
    await new Promise<void>((resolvePromise) => upstream.listen(0, "127.0.0.1", () => resolvePromise()));
    const upstreamAddress = upstream.address();
    if (!upstreamAddress || typeof upstreamAddress === "string") {
      throw new Error("upstream bind failed");
    }

    const cfg: GatewayConfig = {
      listen: { host: "127.0.0.1", port: 0 },
      redaction: {
        headerKeysDenylist: ["authorization", "x-api-key", "api-key"],
        jsonPathsDenylist: ["$.api_key"],
        textRegexDenylist: ["(?i)sk-[A-Za-z0-9]{10,}"]
      },
      upstreams: {
        local: {
          baseUrl: `http://127.0.0.1:${upstreamAddress.port}`,
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
      const lease = issueGatewayLease(workspace, "/openai");
      const payload = { model: "gpt-test", messages: [{ role: "user", content: "hello" }] };

      const authResp = await httpPost(`http://${gateway.host}:${gateway.port}/openai/v1/chat/completions`, payload, {
        "x-amc-agent-id": "default",
        authorization: `Bearer ${lease}`
      });
      expect(authResp.status).toBe(200);

      const xApiResp = await httpPost(`http://${gateway.host}:${gateway.port}/openai/v1/chat/completions`, payload, {
        "x-amc-agent-id": "default",
        "x-api-key": lease
      });
      expect(xApiResp.status).toBe(200);

      const invalidResp = await httpPost(`http://${gateway.host}:${gateway.port}/openai/v1/chat/completions`, payload, {
        "x-amc-agent-id": "default",
        authorization: "Bearer definitely-not-a-lease-token"
      });
      expect(invalidResp.status).toBe(401);

      expect(seenAuthHeader).toBeUndefined();
      expect(seenXApiKey).toBeUndefined();
      expect(seenApiKey).toBeUndefined();
      expect(seenXGoogApiKey).toBeUndefined();

      const ledger = openLedger(workspace);
      const ignoredAudit = ledger
        .getAllEvents()
        .filter((event) => event.event_type === "audit")
        .map((event) => JSON.parse(event.payload_inline ?? "{}") as Record<string, unknown>)
        .some((row) => row.auditType === "AGENT_PROVIDED_KEY_IGNORED");
      ledger.close();
      expect(ignoredAudit).toBe(true);
    } finally {
      await gateway.close();
      await new Promise<void>((resolvePromise) => upstream.close(() => resolvePromise()));
    }
  });

  test("adapter env assembly sets base URLs/api-key carriers and redacts lease from logs", () => {
    const adapter = listBuiltInAdapters()[0]!;
    const prior = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = "real-provider-secret";
    try {
      const env = assembleAdapterEnv({
        adapter,
        lease: "abc.def",
        agentId: "default",
        gatewayBase: "http://127.0.0.1:3210",
        proxyBase: "http://127.0.0.1:3211",
        providerRoute: "/openai",
        model: "gpt-test",
        includeProxyEnv: true
      });
      expect(env.OPENAI_BASE_URL).toContain("127.0.0.1:3210");
      expect(env.OPENAI_API_KEY).toBe("abc.def");
      expect(env.ANTHROPIC_API_KEY).toBe("abc.def");
      expect(env.GEMINI_API_KEY).toBe("abc.def");
      expect(redactSecretsInText("token=abc.def", ["abc.def"])).toBe("token=<AMC_LEASE_REDACTED>");
    } finally {
      if (prior === undefined) {
        delete process.env.OPENAI_API_KEY;
      } else {
        process.env.OPENAI_API_KEY = prior;
      }
    }
  });

  test("adapters signature tamper forces simulate mode behavior", async () => {
    const workspace = newWorkspace();
    const cfg: GatewayConfig = {
      listen: { host: "127.0.0.1", port: await pickFreePort() },
      redaction: {
        headerKeysDenylist: ["authorization"],
        jsonPathsDenylist: ["$.key"],
        textRegexDenylist: ["(?i)bearer\\s+[A-Za-z0-9._-]{10,}"]
      },
      upstreams: {
        local: { baseUrl: "http://127.0.0.1:1", auth: { type: "none" }, allowLocalhost: true }
      },
      routes: [{ prefix: "/openai", upstream: "local", stripPrefix: true, openaiCompatible: true }],
      streamPassthrough: false,
      proxy: { enabled: false, port: await pickFreePort(), allowlistHosts: [], denyByDefault: true },
      lease: { allowQueryCarrier: false }
    };
    initGatewayConfig(workspace, cfg);
    const init = adaptersInitCli(workspace);
    writeFileSync(init.configPath, `${readFileSync(init.configPath, "utf8")}\n# tamper\n`, "utf8");
    expect(adaptersVerifyCli(workspace).valid).toBe(false);

    const runtime = await runStudioForeground({
      workspace,
      apiPort: await pickFreePort(),
      dashboardPort: await pickFreePort()
    });
    try {
      const out = await adaptersRunCli({
        workspace,
        agentId: "default",
        adapterId: "generic-cli",
        command: ["node", "-e", "console.log(process.env.AMC_REQUESTED_MODE)"]
      });
      expect(out.forcedSimulate).toBe(true);
      expect(out.exitCode).toBe(0);
    } finally {
      await runtime.stop();
    }
  }, 20000);

  test("adapters detect tolerates a bounded cold-starting claude version probe", () => {
    const workspace = newWorkspace();
    const binDir = join(workspace, "bin");
    mkdirSync(binDir, { recursive: true });
    const fakeClaude = join(binDir, "claude");
    writeFileSync(fakeClaude, "#!/bin/sh\nsleep 1\necho \"claude 9.9.9\"\n", { mode: 0o755 });
    chmodSync(fakeClaude, 0o755);
    const oldPath = process.env.PATH ?? "";
    process.env.PATH = `${binDir}:${oldPath}`;
    try {
      const rows = adaptersDetectCli();
      const claude = rows.find((row) => row.adapterId === "claude-cli");
      expect(claude?.installed).toBe(true);
      expect(claude?.command).toBe("claude");
      expect(claude?.version).toBe("9.9.9");
    } finally {
      process.env.PATH = oldPath;
    }
  });

  test("adapters run executes a fake CLI process through gateway with leased auth carrier", async () => {
    const workspace = newWorkspace();
    const upstream = createServer((req, res) => {
      res.statusCode = 200;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ ok: true, model: "gpt-test" }));
    });
    await new Promise<void>((resolvePromise) => upstream.listen(0, "127.0.0.1", () => resolvePromise()));
    const upstreamAddress = upstream.address();
    if (!upstreamAddress || typeof upstreamAddress === "string") {
      throw new Error("upstream bind failed");
    }

    const cfg: GatewayConfig = {
      listen: { host: "127.0.0.1", port: await pickFreePort() },
      redaction: {
        headerKeysDenylist: ["authorization", "x-api-key"],
        jsonPathsDenylist: ["$.api_key"],
        textRegexDenylist: ["(?i)sk-[A-Za-z0-9]{10,}"]
      },
      upstreams: {
        local: { baseUrl: `http://127.0.0.1:${upstreamAddress.port}`, auth: { type: "none" }, allowLocalhost: true }
      },
      routes: [{ prefix: "/openai", upstream: "local", stripPrefix: true, openaiCompatible: true }],
      streamPassthrough: false,
      proxy: { enabled: false, port: await pickFreePort(), allowlistHosts: [], denyByDefault: true },
      lease: { allowQueryCarrier: false }
    };
    initGatewayConfig(workspace, cfg);
    adaptersInitCli(workspace);
    adaptersConfigureCli({
      workspace,
      agentId: "default",
      adapterId: "generic-cli",
      route: "/openai",
      model: "gpt-test",
      mode: "SUPERVISE"
    });

    const runtime = await runStudioForeground({
      workspace,
      apiPort: await pickFreePort(),
      dashboardPort: await pickFreePort()
    });
    try {
      const script = [
        "const route = process.env.OPENAI_BASE_URL;",
        "const body = { model: process.env.AMC_MODEL || 'gpt-test', messages: [{ role: 'user', content: 'hello' }] };",
        "fetch(`${route}/v1/chat/completions`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-amc-agent-id': process.env.AMC_AGENT_ID, authorization: `Bearer ${process.env.OPENAI_API_KEY}` }, body: JSON.stringify(body) })",
        "  .then(async (resp) => { console.log(await resp.text()); process.exit(resp.status === 200 ? 0 : 1); })",
        "  .catch((err) => { console.error(err); process.exit(1); });"
      ].join("");
      const out = await adaptersRunCli({
        workspace,
        agentId: "default",
        adapterId: "generic-cli",
        command: ["node", "-e", script]
      });
      expect(out.exitCode).toBe(0);

      const ledger = openLedger(workspace);
      const events = ledger.getAllEvents();
      ledger.close();
      expect(events.some((event) => event.event_type === "agent_process_started")).toBe(true);
      expect(events.some((event) => event.event_type === "agent_process_exited")).toBe(true);
      const llmReq = events.find((event) => event.event_type === "llm_request");
      const reqMeta = llmReq ? (JSON.parse(llmReq.meta_json) as Record<string, unknown>) : null;
      expect(reqMeta?.lease_carrier).toBe("authorization");
    } finally {
      await runtime.stop();
      await new Promise<void>((resolvePromise) => upstream.close(() => resolvePromise()));
    }
  });

  test("doctor reports PASS when healthy and FAIL with explicit hint when signature is invalid", async () => {
    const workspace = newWorkspace();
    const upstream = createServer((_, res) => {
      res.statusCode = 200;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ ok: true }));
    });
    await new Promise<void>((resolvePromise) => upstream.listen(0, "127.0.0.1", () => resolvePromise()));
    const upstreamAddress = upstream.address();
    if (!upstreamAddress || typeof upstreamAddress === "string") {
      throw new Error("upstream bind failed");
    }
    const cfg: GatewayConfig = {
      listen: { host: "127.0.0.1", port: await pickFreePort() },
      redaction: {
        headerKeysDenylist: ["authorization"],
        jsonPathsDenylist: ["$.api_key"],
        textRegexDenylist: ["(?i)sk-[A-Za-z0-9]{10,}"]
      },
      upstreams: {
        local: { baseUrl: `http://127.0.0.1:${upstreamAddress.port}`, auth: { type: "none" }, allowLocalhost: true }
      },
      routes: [{ prefix: "/openai", upstream: "local", stripPrefix: true, openaiCompatible: true }],
      streamPassthrough: false,
      proxy: { enabled: false, port: await pickFreePort(), allowlistHosts: [], denyByDefault: true },
      lease: { allowQueryCarrier: false }
    };
    initGatewayConfig(workspace, cfg);
    const adapters = adaptersInitCli(workspace);
    const runtime = await runStudioForeground({
      workspace,
      apiPort: await pickFreePort(),
      dashboardPort: await pickFreePort()
    });
    try {
      const healthy = await runDoctorCli(workspace);
      expect(healthy.ok).toBe(true);

      writeFileSync(adapters.configPath, `${readFileSync(adapters.configPath, "utf8")}\n# break signature\n`, "utf8");
      const broken = await runDoctorCli(workspace);
      expect(broken.ok).toBe(false);
      const sigCheck = broken.checks.find((row) => row.id === "sig-adapters");
      expect(sigCheck?.status).toBe("FAIL");
      expect(sigCheck?.fixHint).toContain("fix-signatures");
    } finally {
      await runtime.stop();
      await new Promise<void>((resolvePromise) => upstream.close(() => resolvePromise()));
    }
  }, 20000);
});
