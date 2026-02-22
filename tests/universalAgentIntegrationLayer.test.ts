import { createServer as createHttpServer, request as httpRequest, type Server as HttpServer } from "node:http";
import { createServer as createNetServer } from "node:net";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";
import { afterEach, describe, expect, test } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { initGatewayConfig, type GatewayConfig } from "../src/gateway/config.js";
import { runStudioForeground } from "../src/studio/studioSupervisor.js";
import { startStudioApiServer } from "../src/studio/studioServer.js";
import { issueLeaseForCli } from "../src/leases/leaseCli.js";
import { openLedger } from "../src/ledger/ledger.js";
import { runAutoAnswer } from "../src/diagnostic/autoAnswer/autoAnswerEngine.js";
import { runDiagnostic } from "../src/diagnostic/runner.js";
import { autoAnswerDeterminismProbe } from "../src/diagnostic/autoAnswer/autoAnswerTests.js";
import { createAMCClient } from "../src/sdk/amcClient.js";
import { instrumentOpenAIClient } from "../src/sdk/integrations/openai.js";
import { loadBlobPlaintext } from "../src/storage/blobs/blobStore.js";
import { startFakeOpenAI } from "../src/bridge/tests/fakeProviders/fakeOpenAI.js";
import { startFakeAnthropic } from "../src/bridge/tests/fakeProviders/fakeAnthropic.js";
import { startFakeGemini } from "../src/bridge/tests/fakeProviders/fakeGemini.js";
import { startFakeXAI } from "../src/bridge/tests/fakeProviders/fakeXAI.js";
import { startFakeOpenRouter } from "../src/bridge/tests/fakeProviders/fakeOpenRouter.js";

const roots: string[] = [];

function newWorkspace(): string {
  const dir = mkdtempSync(join(tmpdir(), "amc-universal-"));
  roots.push(dir);
  initWorkspace({ workspacePath: dir, trustBoundaryMode: "isolated" });
  return dir;
}

function pickFreePort(): Promise<number> {
  return new Promise((resolvePromise, rejectPromise) => {
    const server = createNetServer();
    server.once("error", rejectPromise);
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      server.close(() => {
        if (!addr || typeof addr === "string") {
          rejectPromise(new Error("failed to allocate free port"));
          return;
        }
        resolvePromise(addr.port);
      });
    });
  });
}

function httpJson(params: {
  method?: "GET" | "POST";
  url: string;
  payload?: Record<string, unknown>;
  headers?: Record<string, string>;
}): Promise<{ status: number; body: string; headers: Record<string, string | string[] | undefined> }> {
  const body = params.payload ? JSON.stringify(params.payload) : "";
  return new Promise((resolvePromise, rejectPromise) => {
    const req = httpRequest(
      params.url,
      {
        method: params.method ?? "GET",
        headers: {
          ...(params.payload
            ? {
                "content-type": "application/json",
                "content-length": Buffer.byteLength(body)
              }
            : {}),
          ...(params.headers ?? {})
        }
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => {
          data += chunk.toString("utf8");
        });
        res.on("end", () => {
          resolvePromise({
            status: res.statusCode ?? 0,
            body: data,
            headers: res.headers as Record<string, string | string[] | undefined>
          });
        });
      }
    );
    req.once("error", rejectPromise);
    if (body.length > 0) {
      req.write(body);
    }
    req.end();
  });
}

function httpJsonWithTrailers(params: {
  method?: "GET" | "POST";
  url: string;
  payload?: Record<string, unknown>;
  headers?: Record<string, string>;
}): Promise<{ status: number; body: string; headers: Record<string, string | string[] | undefined>; trailers: Record<string, string> }> {
  const body = params.payload ? JSON.stringify(params.payload) : "";
  return new Promise((resolvePromise, rejectPromise) => {
    const req = httpRequest(
      params.url,
      {
        method: params.method ?? "GET",
        headers: {
          ...(params.payload
            ? {
                "content-type": "application/json",
                "content-length": Buffer.byteLength(body)
              }
            : {}),
          ...(params.headers ?? {})
        }
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => {
          data += chunk.toString("utf8");
        });
        res.on("end", () => {
          resolvePromise({
            status: res.statusCode ?? 0,
            body: data,
            headers: res.headers as Record<string, string | string[] | undefined>,
            trailers: res.trailers as Record<string, string>
          });
        });
      }
    );
    req.once("error", rejectPromise);
    if (body.length > 0) {
      req.write(body);
    }
    req.end();
  });
}

function runCli(cwd: string, args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolvePromise) => {
    const distCliPath = join(process.cwd(), "dist", "cli.js");
    const tsxCliPath = join(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs");
    const childArgs = existsSync(distCliPath)
      ? [distCliPath, ...args]
      : [tsxCliPath, join(process.cwd(), "src", "cli.ts"), ...args];
    const child = spawn(process.execPath, childArgs, {
      cwd,
      env: {
        ...process.env,
        AMC_VAULT_PASSPHRASE: "universal-test-passphrase"
      },
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
    child.on("close", (code) => {
      resolvePromise({
        code: code ?? 1,
        stdout,
        stderr
      });
    });
  });
}

afterEach(() => {
  while (roots.length > 0) {
    const root = roots.pop();
    if (root) {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

describe("universal agent integration layer", () => {
  test("bridge compat routes proxy major provider shapes and mint observed evidence receipts", async () => {
    const workspace = newWorkspace();
    process.env.AMC_VAULT_PASSPHRASE = "universal-test-passphrase";
    const fakeOpenAI = await startFakeOpenAI();
    const fakeAnthropic = await startFakeAnthropic();
    const fakeGemini = await startFakeGemini();
    const fakeXai = await startFakeXAI();
    const fakeOpenRouter = await startFakeOpenRouter();

    const gatewayConfig: GatewayConfig = {
      listen: { host: "127.0.0.1", port: 0 },
      redaction: {
        headerKeysDenylist: ["authorization", "x-api-key", "api-key", "x-amc-lease"],
        jsonPathsDenylist: ["$.api_key", "$.key", "$.token"],
        textRegexDenylist: ["(?i)sk-[A-Za-z0-9]{12,}", "(?i)bearer\\s+[A-Za-z0-9._-]{10,}"]
      },
      upstreams: {
        openaiFake: { baseUrl: `http://127.0.0.1:${fakeOpenAI.port}`, auth: { type: "none" }, allowLocalhost: true },
        anthropicFake: { baseUrl: `http://127.0.0.1:${fakeAnthropic.port}`, auth: { type: "none" }, allowLocalhost: true },
        geminiFake: { baseUrl: `http://127.0.0.1:${fakeGemini.port}`, auth: { type: "none" }, allowLocalhost: true },
        xaiFake: { baseUrl: `http://127.0.0.1:${fakeXai.port}`, auth: { type: "none" }, allowLocalhost: true },
        openrouterFake: { baseUrl: `http://127.0.0.1:${fakeOpenRouter.port}`, auth: { type: "none" }, allowLocalhost: true },
        localFake: { baseUrl: `http://127.0.0.1:${fakeOpenAI.port}`, auth: { type: "none" }, allowLocalhost: true }
      },
      routes: [
        { prefix: "/openai", upstream: "openaiFake", stripPrefix: true, openaiCompatible: true },
        { prefix: "/anthropic", upstream: "anthropicFake", stripPrefix: true, openaiCompatible: false },
        { prefix: "/gemini", upstream: "geminiFake", stripPrefix: true, openaiCompatible: false },
        { prefix: "/grok", upstream: "xaiFake", stripPrefix: true, openaiCompatible: true },
        { prefix: "/openrouter", upstream: "openrouterFake", stripPrefix: true, openaiCompatible: true },
        { prefix: "/local", upstream: "localFake", stripPrefix: true, openaiCompatible: true }
      ],
      lease: { allowQueryCarrier: false },
      streamPassthrough: false,
      proxy: { enabled: false, port: 3211, allowlistHosts: [], denyByDefault: true }
    };
    initGatewayConfig(workspace, gatewayConfig);

    const runtime = await runStudioForeground({
      workspace,
      apiPort: await pickFreePort(),
      dashboardPort: await pickFreePort(),
      gatewayPort: await pickFreePort(),
      proxyPort: await pickFreePort(),
      metricsPort: await pickFreePort()
    });
    const lease = issueLeaseForCli({
      workspace,
      agentId: "default",
      ttl: "30m",
      scopes: "gateway:llm",
      routes: "/openai,/anthropic,/gemini,/grok,/openrouter,/local",
      models: "*",
      rpm: 1000,
      tpm: 1_000_000,
      maxCostUsdPerDay: null
    }).token;
    const base = `http://${runtime.state.host}:${runtime.state.apiPort}`;

    try {
      const openai = await httpJson({
        method: "POST",
        url: `${base}/bridge/openai/v1/chat/completions`,
        headers: {
          authorization: `Bearer ${lease}`
        },
        payload: {
          model: "gpt-test",
          messages: [{ role: "user", content: "hello sk-ABCDEFGHIJKLMNOP" }]
        }
      });
      expect(openai.status).toBe(200);
      expect(openai.body).toContain("openai-ok");
      expect(typeof openai.headers["x-amc-receipt"]).toBe("string");

      const anthropic = await httpJson({
        method: "POST",
        url: `${base}/bridge/anthropic/v1/messages`,
        headers: { authorization: `Bearer ${lease}` },
        payload: {
          model: "claude-test",
          max_tokens: 16,
          messages: [{ role: "user", content: "hello" }]
        }
      });
      expect(anthropic.status).toBe(200);
      expect(anthropic.body).toContain("anthropic-ok");

      const gemini = await httpJson({
        method: "POST",
        url: `${base}/bridge/gemini/v1beta/models/gemini-1.5-flash:generateContent`,
        headers: { authorization: `Bearer ${lease}` },
        payload: {
          contents: [{ parts: [{ text: "hello" }] }]
        }
      });
      expect(gemini.status).toBe(200);
      expect(gemini.body).toContain("gemini-ok");

      const xai = await httpJson({
        method: "POST",
        url: `${base}/bridge/xai/v1/chat/completions`,
        headers: { authorization: `Bearer ${lease}` },
        payload: {
          model: "grok-test",
          messages: [{ role: "user", content: "hello" }]
        }
      });
      expect(xai.status).toBe(200);
      expect(xai.body).toContain("xai-ok");

      const openrouter = await httpJson({
        method: "POST",
        url: `${base}/bridge/openrouter/v1/chat/completions`,
        headers: { authorization: `Bearer ${lease}` },
        payload: {
          model: "openrouter/test-model",
          messages: [{ role: "user", content: "hello" }]
        }
      });
      expect(openrouter.status).toBe(200);
      expect(openrouter.body).toContain("openrouter-ok");

      expect(`${openai.body}${anthropic.body}${gemini.body}${xai.body}${openrouter.body}`).not.toContain(lease);
      expect(`${openai.body}${anthropic.body}${gemini.body}${xai.body}${openrouter.body}`).not.toContain("BEGIN PRIVATE KEY");

      const ledger = openLedger(workspace);
      const events = ledger.getAllEvents();
      ledger.close();
      expect(events.filter((row) => row.event_type === "llm_request").length).toBeGreaterThanOrEqual(5);
      expect(events.filter((row) => row.event_type === "llm_response").length).toBeGreaterThanOrEqual(5);
    } finally {
      await runtime.stop();
      await new Promise<void>((resolvePromise) => fakeOpenAI.server.close(() => resolvePromise()));
      await new Promise<void>((resolvePromise) => fakeAnthropic.server.close(() => resolvePromise()));
      await new Promise<void>((resolvePromise) => fakeGemini.server.close(() => resolvePromise()));
      await new Promise<void>((resolvePromise) => fakeXai.server.close(() => resolvePromise()));
      await new Promise<void>((resolvePromise) => fakeOpenRouter.server.close(() => resolvePromise()));
    }
  }, 30_000);

  test("security: /api/v1 is auth-gated and legacy bridge paths emit deprecation redirects", async () => {
    const workspace = newWorkspace();
    const token = "studio-admin-token";
    const server = await startStudioApiServer({
      workspace,
      host: "127.0.0.1",
      port: await pickFreePort(),
      token
    });
    try {
      const unauthorized = await httpJson({
        method: "GET",
        url: `${server.url}/api/v1/health`
      });
      expect(unauthorized.status).toBe(401);

      const authorized = await httpJson({
        method: "GET",
        url: `${server.url}/api/v1/health`,
        headers: {
          "x-amc-admin-token": token
        }
      });
      expect(authorized.status).toBe(200);

      const lease = issueLeaseForCli({
        workspace,
        agentId: "default",
        ttl: "30m",
        scopes: "gateway:llm",
        routes: "/openai",
        models: "*",
        rpm: 1000,
        tpm: 1_000_000,
        maxCostUsdPerDay: null
      }).token;
      const redirected = await httpJson({
        method: "POST",
        url: `${server.url}/api/v1/chat/completions`,
        headers: {
          authorization: `Bearer ${lease}`
        },
        payload: {
          model: "gpt-test",
          messages: [{ role: "user", content: "hello" }]
        }
      });
      expect(redirected.status).toBe(308);
      expect(redirected.headers.location).toBe("/bridge/openai/v1/chat/completions");
      expect(redirected.headers.deprecation).toBe("true");
      expect(String(redirected.headers.warning ?? "")).toContain("Deprecated bridge endpoint");
    } finally {
      await server.close();
    }
  });

  test("bridge streaming passthrough uses trailer receipts instead of buffering responses first", async () => {
    const workspace = newWorkspace();
    process.env.AMC_VAULT_PASSPHRASE = "universal-test-passphrase";
    const upstream = await new Promise<{ server: HttpServer; port: number }>((resolvePromise) => {
      const s = createHttpServer((req, res) => {
        if ((req.method ?? "POST").toUpperCase() !== "POST") {
          res.statusCode = 405;
          res.end();
          return;
        }
        req.resume();
        req.once("end", () => {
          res.statusCode = 200;
          res.setHeader("content-type", "application/json");
          res.setHeader("transfer-encoding", "chunked");
          res.write('{"id":"resp-stream","model":"gpt-stream","choices":[{"message":{"role":"assistant","content":"');
          setTimeout(() => {
            res.write('stream-ok');
            setTimeout(() => {
              res.end('"}}]}');
            }, 5);
          }, 5);
        });
      });
      s.listen(0, "127.0.0.1", () => {
        const address = s.address();
        if (!address || typeof address === "string") {
          throw new Error("upstream failed to bind");
        }
        resolvePromise({ server: s, port: address.port });
      });
    });

    initGatewayConfig(workspace, {
      listen: { host: "127.0.0.1", port: 0 },
      redaction: {
        headerKeysDenylist: ["authorization", "x-amc-lease"],
        jsonPathsDenylist: ["$.api_key", "$.key", "$.token"],
        textRegexDenylist: ["(?i)sk-[A-Za-z0-9]{12,}"]
      },
      upstreams: {
        openaiFake: { baseUrl: `http://127.0.0.1:${upstream.port}`, auth: { type: "none" }, allowLocalhost: true }
      },
      routes: [{ prefix: "/openai", upstream: "openaiFake", stripPrefix: true, openaiCompatible: true }],
      lease: { allowQueryCarrier: false },
      streamPassthrough: true,
      proxy: { enabled: false, port: 3211, allowlistHosts: [], denyByDefault: true }
    });

    const runtime = await runStudioForeground({
      workspace,
      apiPort: await pickFreePort(),
      dashboardPort: await pickFreePort(),
      gatewayPort: await pickFreePort(),
      proxyPort: await pickFreePort(),
      metricsPort: await pickFreePort()
    });
    const base = `http://${runtime.state.host}:${runtime.state.apiPort}`;
    const lease = issueLeaseForCli({
      workspace,
      agentId: "default",
      ttl: "30m",
      scopes: "gateway:llm",
      routes: "/openai",
      models: "*",
      rpm: 1000,
      tpm: 1_000_000,
      maxCostUsdPerDay: null
    }).token;
    try {
      const streamed = await httpJsonWithTrailers({
        method: "POST",
        url: `${base}/bridge/openai/v1/chat/completions`,
        headers: {
          authorization: `Bearer ${lease}`
        },
        payload: {
          model: "gpt-stream",
          stream: true,
          messages: [{ role: "user", content: "hello" }]
        }
      });
      expect(streamed.status).toBe(200);
      expect(streamed.body).toContain("stream-ok");
      expect(streamed.headers["x-amc-receipt-mode"]).toBe("trailer");
      expect(typeof streamed.trailers["x-amc-receipt-trailer"]).toBe("string");
    } finally {
      await runtime.stop();
      await new Promise<void>((resolvePromise) => upstream.server.close(() => resolvePromise()));
    }
  }, 30_000);

  test("pairing create/redeem is single-use, expires, and records audits", async () => {
    const workspace = newWorkspace();
    const token = "studio-admin-token";
    const server = await startStudioApiServer({
      workspace,
      host: "127.0.0.1",
      port: await pickFreePort(),
      token
    });
    try {
      const create = await httpJson({
        method: "POST",
        url: `${server.url}/pair/create`,
        headers: {
          "x-amc-admin-token": token
        },
        payload: {
          agentName: "Bridge Bot",
          ttlMinutes: 2
        }
      });
      expect(create.status).toBe(200);
      const created = JSON.parse(create.body) as { code: string };
      expect(created.code.startsWith("AMC-")).toBe(true);

      const redeem1 = await httpJson({
        method: "POST",
        url: `${server.url}/pair/redeem`,
        payload: { code: created.code, leaseTtlMinutes: 15 }
      });
      expect(redeem1.status).toBe(200);

      const redeem2 = await httpJson({
        method: "POST",
        url: `${server.url}/pair/redeem`,
        payload: { code: created.code, leaseTtlMinutes: 15 }
      });
      expect(redeem2.status).toBe(400);
      expect(redeem2.body).toContain("already used");

      const createExpiring = await httpJson({
        method: "POST",
        url: `${server.url}/pair/create`,
        headers: {
          "x-amc-admin-token": token
        },
        payload: {
          agentName: "Expiring Bot",
          ttlMinutes: 2
        }
      });
      const expiring = JSON.parse(createExpiring.body) as { pairingId: string; code: string };
      const storePath = join(workspace, ".amc", "bridge", "pairing-codes.json");
      const store = JSON.parse(readFileSync(storePath, "utf8")) as {
        codes: Array<{ id: string; expiresTs: number }>;
      };
      const row = store.codes.find((item) => item.id === expiring.pairingId);
      if (!row) {
        throw new Error("missing pairing row");
      }
      row.expiresTs = Date.now() - 1;
      writeFileSync(storePath, JSON.stringify(store, null, 2));

      const redeemExpired = await httpJson({
        method: "POST",
        url: `${server.url}/pair/redeem`,
        payload: { code: expiring.code, leaseTtlMinutes: 15 }
      });
      expect(redeemExpired.status).toBe(400);
      expect(redeemExpired.body).toContain("expired");

      const ledger = openLedger(workspace);
      const audits = ledger
        .getAllEvents()
        .filter((event) => event.event_type === "audit")
        .map((event) => JSON.parse(event.payload_inline ?? "{}") as Record<string, unknown>);
      ledger.close();
      expect(audits.some((row) => row.auditType === "PAIR_REDEEMED")).toBe(true);
      expect(audits.some((row) => row.auditType === "PAIR_REDEEM_FAILED")).toBe(true);
    } finally {
      await server.close();
    }
  });

  test("wrap command captures redacted output and stores hashed blob evidence", async () => {
    const workspace = newWorkspace();
    process.env.AMC_VAULT_PASSPHRASE = "universal-test-passphrase";
    const token = "studio-admin-token";
    const server = await startStudioApiServer({
      workspace,
      host: "127.0.0.1",
      port: await pickFreePort(),
      token
    });
    try {
      const lease = issueLeaseForCli({
        workspace,
        agentId: "default",
        ttl: "30m",
        scopes: "gateway:llm",
        routes: "/openai,/anthropic,/gemini,/grok,/openrouter,/local",
        models: "*",
        rpm: 1000,
        tpm: 1_000_000,
        maxCostUsdPerDay: null
      }).token;
      const tokenFile = join(workspace, "agent.token");
      writeFileSync(tokenFile, `${lease}\n`, { mode: 0o600 });
      const wrappedScript = join(workspace, "wrapped-agent.js");
      writeFileSync(wrappedScript, "console.log('hello sk-ABCDEFGHIJKLMNOP');\n", "utf8");
      const ran = await runCli(workspace, [
        "wrap",
        "--agent-token",
        tokenFile,
        "--provider",
        "generic",
        "--bridge-url",
        server.url,
        "node",
        wrappedScript
      ]);
      expect(ran.code, `stdout:\n${ran.stdout}\nstderr:\n${ran.stderr}`).toBe(0);
      expect(`${ran.stdout}${ran.stderr}`).not.toContain("sk-ABCDEFGHIJKLMNOP");

      const ledger = openLedger(workspace);
      const allEvents = ledger.getAllEvents();
      const capturedEvents = allEvents.filter((event) => event.event_type.startsWith("agent_"));
      ledger.close();
      expect(capturedEvents.length, `event types: ${allEvents.map((event) => event.event_type).join(",")}`).toBeGreaterThan(0);
      expect(capturedEvents[0]?.payload_sha256).toHaveLength(64);
      const payloadEvent = capturedEvents.find(
        (event) =>
          (typeof event.payload_path === "string" && event.payload_path.length > 0) ||
          (typeof event.payload_inline === "string" && event.payload_inline.length > 0)
      );
      expect(payloadEvent).toBeTruthy();
      const text =
        typeof payloadEvent!.payload_path === "string" && payloadEvent!.payload_path.length > 0
          ? loadBlobPlaintext(workspace, payloadEvent!.payload_path).bytes.toString("utf8")
          : String(payloadEvent!.payload_inline ?? "");
      expect(text).not.toContain("sk-ABCDEFGHIJKLMNOP");
    } finally {
      await server.close();
    }
  }, 15000);

  test("SDK OpenAI instrumentation routes through bridge and keeps correlation metadata", async () => {
    const workspace = newWorkspace();
    process.env.AMC_VAULT_PASSPHRASE = "universal-test-passphrase";
    const fakeOpenAI = await startFakeOpenAI();
    initGatewayConfig(workspace, {
      listen: { host: "127.0.0.1", port: 0 },
      redaction: {
        headerKeysDenylist: ["authorization"],
        jsonPathsDenylist: ["$.api_key"],
        textRegexDenylist: ["(?i)sk-[A-Za-z0-9]{12,}"]
      },
      upstreams: {
        openaiFake: { baseUrl: `http://127.0.0.1:${fakeOpenAI.port}`, auth: { type: "none" }, allowLocalhost: true }
      },
      routes: [{ prefix: "/openai", upstream: "openaiFake", stripPrefix: true, openaiCompatible: true }],
      lease: { allowQueryCarrier: false },
      streamPassthrough: false,
      proxy: { enabled: false, port: 3211, allowlistHosts: [], denyByDefault: true }
    });
    const runtime = await runStudioForeground({
      workspace,
      apiPort: await pickFreePort(),
      dashboardPort: await pickFreePort(),
      gatewayPort: await pickFreePort(),
      proxyPort: await pickFreePort(),
      metricsPort: await pickFreePort()
    });
    try {
      const lease = issueLeaseForCli({
        workspace,
        agentId: "default",
        ttl: "30m",
        scopes: "gateway:llm",
        routes: "/openai",
        models: "gpt-*",
        rpm: 1000,
        tpm: 1_000_000,
        maxCostUsdPerDay: null
      }).token;
      const amc = createAMCClient({
        bridgeUrl: `http://${runtime.state.host}:${runtime.state.apiPort}`,
        token: lease
      });
      const rawClient = {
        chat: {
          completions: {
            create: async (_payload: unknown) => ({ shouldNotReachRawClient: true })
          }
        }
      };
      const instrumented = instrumentOpenAIClient(rawClient, amc);
      const response = await instrumented.chat.completions.create({
        model: "gpt-test",
        messages: [{ role: "user", content: "hello" }]
      });
      const asRecord = response as Record<string, unknown>;
      expect(asRecord.choices).toBeTruthy();

      const ledger = openLedger(workspace);
      const llmRequests = ledger.getAllEvents().filter((event) => event.event_type === "llm_request");
      ledger.close();
      expect(llmRequests.length).toBeGreaterThan(0);
      const correlations = llmRequests
        .map((event) => JSON.parse(event.meta_json ?? "{}") as Record<string, unknown>)
        .map((meta) => meta.correlationId ?? meta.correlation_id)
        .filter((value): value is string => typeof value === "string" && value.length > 8);
      expect(correlations.length).toBeGreaterThan(0);
    } finally {
      await runtime.stop();
      await new Promise<void>((resolvePromise) => fakeOpenAI.server.close(() => resolvePromise()));
    }
  });

  test("auto-answer is deterministic and returns UNKNOWN penalties when evidence is insufficient", async () => {
    const workspace = newWorkspace();
    const report = await runDiagnostic({
      workspace,
      window: "14d",
      targetName: "default",
      claimMode: "auto",
      agentId: "default"
    });
    const probe = autoAnswerDeterminismProbe(report);
    expect(JSON.stringify(probe.a)).toBe(JSON.stringify(probe.b));

    const auto = await runAutoAnswer({
      workspace,
      agentId: "default"
    });
    expect(auto.unknownReasons.length).toBeGreaterThan(0);
    for (const row of auto.unknownReasons) {
      expect(auto.measuredScores[row.questionId]).toBeLessThanOrEqual(1);
    }
  });

  test("studio diagnostic auto-answer endpoints return measured scores and plan metadata", async () => {
    const workspace = newWorkspace();
    const token = "studio-admin-token";
    const server = await startStudioApiServer({
      workspace,
      host: "127.0.0.1",
      port: await pickFreePort(),
      token
    });
    try {
      const getAuto = await httpJson({
        method: "GET",
        url: `${server.url}/diagnostic/auto-answer?agentId=default`,
        headers: {
          "x-amc-admin-token": token
        }
      });
      expect(getAuto.status).toBe(200);
      const autoPayload = JSON.parse(getAuto.body) as {
        measuredScores?: Record<string, number>;
        unknownReasons?: unknown[];
      };
      expect(autoPayload.measuredScores).toBeTruthy();
      expect(Object.keys(autoPayload.measuredScores ?? {}).length).toBe(67);
      expect(Array.isArray(autoPayload.unknownReasons)).toBe(true);

      const runAuto = await httpJson({
        method: "POST",
        url: `${server.url}/diagnostic/run?agentId=default`,
        headers: {
          "x-amc-admin-token": token
        },
        payload: {}
      });
      expect(runAuto.status).toBe(200);
      const runPayload = JSON.parse(runAuto.body) as {
        transformPlan?: { created?: boolean; planId?: string | null };
      };
      expect(runPayload.transformPlan?.created).toBe(true);
      expect(typeof runPayload.transformPlan?.planId === "string" || runPayload.transformPlan?.planId === null).toBe(true);
    } finally {
      await server.close();
    }
  });

  test("security: lease auth cannot call owner pairing endpoint and disallowed bridge model is rejected", async () => {
    const workspace = newWorkspace();
    process.env.AMC_VAULT_PASSPHRASE = "universal-test-passphrase";
    const fakeOpenAI = await startFakeOpenAI();
    initGatewayConfig(workspace, {
      listen: { host: "127.0.0.1", port: 0 },
      redaction: {
        headerKeysDenylist: ["authorization"],
        jsonPathsDenylist: ["$.api_key"],
        textRegexDenylist: ["(?i)sk-[A-Za-z0-9]{12,}"]
      },
      upstreams: {
        openaiFake: { baseUrl: `http://127.0.0.1:${fakeOpenAI.port}`, auth: { type: "none" }, allowLocalhost: true }
      },
      routes: [{ prefix: "/openai", upstream: "openaiFake", stripPrefix: true, openaiCompatible: true }],
      lease: { allowQueryCarrier: false },
      streamPassthrough: false,
      proxy: { enabled: false, port: 3211, allowlistHosts: [], denyByDefault: true }
    });
    const runtime = await runStudioForeground({
      workspace,
      apiPort: await pickFreePort(),
      dashboardPort: await pickFreePort(),
      gatewayPort: await pickFreePort(),
      proxyPort: await pickFreePort(),
      metricsPort: await pickFreePort()
    });
    const base = `http://${runtime.state.host}:${runtime.state.apiPort}`;
    const lease = issueLeaseForCli({
      workspace,
      agentId: "default",
      ttl: "30m",
      scopes: "gateway:llm",
      routes: "/openai",
      models: "*",
      rpm: 1000,
      tpm: 1_000_000,
      maxCostUsdPerDay: null
    }).token;
    try {
      const forbiddenPair = await httpJson({
        method: "POST",
        url: `${base}/pair/create`,
        headers: {
          authorization: `Bearer ${lease}`
        },
        payload: {
          agentName: "lease-agent"
        }
      });
      expect([401, 403]).toContain(forbiddenPair.status);

      const deniedModel = await httpJson({
        method: "POST",
        url: `${base}/bridge/openai/v1/chat/completions`,
        headers: {
          authorization: `Bearer ${lease}`
        },
        payload: {
          model: "totally-unknown-model-family",
          messages: [{ role: "user", content: "hello" }]
        }
      });
      expect(deniedModel.status).toBe(403);
      expect(deniedModel.body).toContain("model denied");
      expect(deniedModel.body).not.toContain(lease);
      expect(deniedModel.body).not.toContain("BEGIN PRIVATE KEY");
    } finally {
      await runtime.stop();
      await new Promise<void>((resolvePromise) => fakeOpenAI.server.close(() => resolvePromise()));
    }
  });
});
