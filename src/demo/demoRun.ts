/**
 * `amc demo run` — Run a simulated agent through the AMC gateway
 * and produce a real score in ~30 seconds. Zero config needed.
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomBytes } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { initGatewayConfig, type GatewayConfig } from "../gateway/config.js";
import { startGateway, type GatewayHandle } from "../gateway/server.js";
import { initWorkspace } from "../workspace.js";
import { openLedger } from "../ledger/ledger.js";
import { ensureLeaseRevocationStore, issueLeaseForCli } from "../leases/leaseCli.js";
import { workspaceIdFromDirectory } from "../workspaces/workspaceId.js";

export interface DemoResult {
  requestsSent: number;
  evidenceItems: number;
  gatewayUrl: string;
  durationMs: number;
  mode?: "gateway" | "no-vault-demo";
  demoOnly?: boolean;
  agentId?: string;
  maturityScore?: number;
  maturityLevel?: "L0" | "L1" | "L2" | "L3" | "L4" | "L5";
  trustLabel?: "SIGNED" | "DEMO_ONLY";
  evidenceWorkspace?: string;
  gatewaySessionId?: string;
  gatewaySignatureValid?: boolean;
  gatewaySignatureExists?: boolean;
}

export interface PreparedNoVaultDemoWorkspace {
  workspace: string;
  agentId: string;
  passphrase: string;
  gatewayConfigPath: string;
  gatewayConfigSignaturePath: string;
  leaseToken: string;
}

export interface NoVaultDemoOptions {
  agentId?: string;
  cleanup?: boolean;
  host?: string;
  preferredUpstreamPort?: number;
  logger?: Pick<Console, "log" | "error">;
}

export function shouldRunNoVaultDemo(opts: { vault?: boolean; demo?: boolean; noVault?: boolean }): boolean {
  return opts.vault === false || opts.demo === true || opts.noVault === true;
}

const DEMO_AGENT_ID = "demo-agent";

const DEMO_RESPONSES = [
  "I will search for the latest information on that topic.",
  "Based on my analysis, the data shows a 23% improvement over the baseline.",
  "I need to use the calculator tool to verify this computation.",
  "Let me check the database for the most recent records.",
  "The security scan completed successfully. No vulnerabilities detected.",
  "I have drafted the report. Here is a summary of the key findings.",
  "Running the test suite now. 47 tests passed, 0 failed.",
  "I will escalate this to a human reviewer since it involves financial data.",
  "The API rate limit was reached. Implementing exponential backoff.",
  "Task completed. All artifacts have been saved and signed.",
];

const TOOL_CALLS = [
  { name: "web_search", arguments: JSON.stringify({ query: "latest AI safety research 2026" }) },
  { name: "read_file", arguments: JSON.stringify({ path: "/data/report.md" }) },
  { name: "calculator", arguments: JSON.stringify({ expression: "0.847 * 1.1 + 0.023" }) },
  { name: "database_query", arguments: JSON.stringify({ sql: "SELECT count(*) FROM events" }) },
  { name: "security_scan", arguments: JSON.stringify({ target: "agent-workspace", depth: "full" }) },
];

function withTemporaryVaultPassphrase<T>(passphrase: string, fn: () => T): T {
  const hadOriginal = Object.prototype.hasOwnProperty.call(process.env, "AMC_VAULT_PASSPHRASE");
  const original = process.env.AMC_VAULT_PASSPHRASE;
  process.env.AMC_VAULT_PASSPHRASE = passphrase;
  try {
    return fn();
  } finally {
    if (hadOriginal) {
      process.env.AMC_VAULT_PASSPHRASE = original;
    } else {
      delete process.env.AMC_VAULT_PASSPHRASE;
    }
  }
}

async function withTemporaryVaultPassphraseAsync<T>(passphrase: string, fn: () => Promise<T>): Promise<T> {
  const hadOriginal = Object.prototype.hasOwnProperty.call(process.env, "AMC_VAULT_PASSPHRASE");
  const original = process.env.AMC_VAULT_PASSPHRASE;
  process.env.AMC_VAULT_PASSPHRASE = passphrase;
  try {
    return await fn();
  } finally {
    if (hadOriginal) {
      process.env.AMC_VAULT_PASSPHRASE = original;
    } else {
      delete process.env.AMC_VAULT_PASSPHRASE;
    }
  }
}

export function noVaultDemoGatewayConfig(upstreamBaseUrl: string): GatewayConfig {
  return {
    listen: { host: "127.0.0.1", port: 0 },
    redaction: {
      headerKeysDenylist: ["authorization", "x-api-key", "api-key", "x-openai-key"],
      jsonPathsDenylist: ["$.api_key", "$.key"],
      textRegexDenylist: ["(?i)sk-[A-Za-z0-9]{10,}", "(?i)bearer\\s+[A-Za-z0-9._-]{10,}"]
    },
    upstreams: {
      demo_local: {
        baseUrl: upstreamBaseUrl,
        auth: { type: "none" },
        allowLocalhost: true,
        providerId: "demo_local"
      }
    },
    routes: [{ prefix: "/local", upstream: "demo_local", stripPrefix: true, openaiCompatible: true, agentId: DEMO_AGENT_ID }],
    lease: { allowQueryCarrier: false },
    streamPassthrough: false,
    proxy: {
      enabled: false,
      port: 3211,
      allowlistHosts: [],
      denyByDefault: true
    }
  };
}

export function demoMaturityLevel(score: number): "L0" | "L1" | "L2" | "L3" | "L4" | "L5" {
  if (score >= 90) return "L5";
  if (score >= 75) return "L4";
  if (score >= 60) return "L3";
  if (score >= 40) return "L2";
  if (score >= 20) return "L1";
  return "L0";
}

export function demoMaturityScore(requestsSent: number, evidenceItems: number): {
  maturityScore: number;
  maturityLevel: "L0" | "L1" | "L2" | "L3" | "L4" | "L5";
} {
  const maturityScore = Math.min(86, Math.max(35, 42 + requestsSent * 2 + evidenceItems));
  return {
    maturityScore,
    maturityLevel: demoMaturityLevel(maturityScore)
  };
}

export function prepareNoVaultDemoWorkspace(params: {
  upstreamBaseUrl: string;
  workspace?: string;
  passphrase?: string;
  agentId?: string;
}): PreparedNoVaultDemoWorkspace {
  const workspace = params.workspace ?? mkdtempSync(join(tmpdir(), "amc-demo-no-vault-"));
  const passphrase = params.passphrase ?? `amc-demo-${randomBytes(32).toString("base64url")}`;
  const agentId = params.agentId ?? DEMO_AGENT_ID;

  return withTemporaryVaultPassphrase(passphrase, () => {
    initWorkspace({
      workspacePath: workspace,
      agentId,
      agentName: "AMC Demo Agent",
      role: "Demo assistant",
      primaryTasks: ["research", "data analysis", "security review", "code review", "financial escalation"],
      trustBoundaryMode: "isolated"
    });
    const gateway = initGatewayConfig(workspace, noVaultDemoGatewayConfig(params.upstreamBaseUrl));
    ensureLeaseRevocationStore(workspace);
    const lease = issueLeaseForCli({
      workspace,
      workspaceId: workspaceIdFromDirectory(workspace),
      agentId,
      ttl: "15m",
      scopes: "gateway:llm,receipt:verify",
      routes: "/local",
      models: "*",
      rpm: 60,
      tpm: 200000,
      maxCostUsdPerDay: null,
      workOrderId: "demo-no-vault"
    });
    return {
      workspace,
      agentId,
      passphrase,
      gatewayConfigPath: gateway.configPath,
      gatewayConfigSignaturePath: gateway.sigPath,
      leaseToken: lease.token
    };
  });
}

function countLedgerEvidence(workspace: string): number {
  const ledger = openLedger(workspace);
  try {
    return ledger.getAllEvents().length;
  } finally {
    ledger.close();
  }
}

function pickFreePort(host: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = createServer();
    s.listen(0, host, () => {
      const addr = s.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      s.close((err) => (err ? reject(err) : resolve(port)));
    });
    s.once("error", reject);
  });
}

/** Minimal fake OpenAI-compatible upstream that returns varied responses */
export async function startDemoUpstream(host = "127.0.0.1", preferredPort = 8000): Promise<{
  baseUrl: string;
  close: () => Promise<void>;
}> {
  // Try preferred port first (matches gateway default LOCAL_OPENAI_BASE_URL)
  let port: number;
  try {
    await new Promise<void>((resolve, reject) => {
      const test = createServer();
      test.once("error", () => { reject(); });
      test.listen(preferredPort, host, () => {
        test.close(() => resolve());
      });
    });
    port = preferredPort;
  } catch {
    port = await pickFreePort(host);
  }
  let reqCount = 0;

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? "/", `http://${host}:${port}`);

    if (url.pathname === "/v1/models") {
      res.statusCode = 200;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ object: "list", data: [{ id: "gpt-4o-demo" }] }));
      return;
    }

    if (url.pathname === "/v1/chat/completions" && (req.method ?? "GET").toUpperCase() === "POST") {
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as { model?: string };
      reqCount++;

      const useToolCall = reqCount % 3 === 0 && reqCount <= 15;
      const responseIdx = (reqCount - 1) % DEMO_RESPONSES.length;
      const toolIdx = (reqCount - 1) % TOOL_CALLS.length;

      const choice = useToolCall
        ? {
            index: 0,
            message: {
              role: "assistant",
              content: null,
              tool_calls: [
                {
                  id: `call_demo_${reqCount}`,
                  type: "function",
                  function: TOOL_CALLS[toolIdx],
                },
              ],
            },
            finish_reason: "tool_calls",
          }
        : {
            index: 0,
            message: { role: "assistant", content: DEMO_RESPONSES[responseIdx] },
            finish_reason: "stop",
          };

      res.statusCode = 200;
      res.setHeader("content-type", "application/json");
      res.end(
        JSON.stringify({
          id: `chatcmpl-demo-${reqCount}`,
          object: "chat.completion",
          model: body.model ?? "gpt-4o-demo",
          choices: [choice],
          usage: {
            prompt_tokens: 50 + reqCount * 10,
            completion_tokens: 20 + reqCount * 5,
            total_tokens: 70 + reqCount * 15,
          },
        })
      );
      return;
    }

    res.statusCode = 404;
    res.end("not found");
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => resolve());
  });

  return {
    baseUrl: `http://${host}:${port}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}

/** Send a chat completion request through the gateway */
async function sendRequest(
  gatewayUrl: string,
  messages: Array<{ role: string; content: string }>,
  tools?: boolean,
  leaseToken?: string,
  agentId = "default"
): Promise<void> {
  const body: Record<string, unknown> = {
    model: "gpt-4o-demo",
    messages,
  };
  if (tools) {
    body.tools = [
      {
        type: "function",
        function: {
          name: "web_search",
          description: "Search the web",
          parameters: { type: "object", properties: { query: { type: "string" } } },
        },
      },
      {
        type: "function",
        function: {
          name: "read_file",
          description: "Read a file",
          parameters: { type: "object", properties: { path: { type: "string" } } },
        },
      },
    ];
  }

  const headers: Record<string, string> = { "content-type": "application/json" };
  headers["x-amc-agent-id"] = agentId;
  if (leaseToken) {
    headers["x-amc-lease"] = leaseToken;
  }

  const res = await fetch(`${gatewayUrl}/local/v1/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Gateway returned ${res.status}: ${await res.text()}`);
  }
  await res.json();
}

export async function runDemo(gatewayUrl: string, leaseToken?: string, agentId = "default"): Promise<DemoResult> {
  const start = Date.now();
  let sent = 0;

  const conversations: Array<Array<{ role: string; content: string }>> = [
    [{ role: "user", content: "Research the latest developments in AI agent safety frameworks." }],
    [
      { role: "user", content: "Research the latest developments in AI agent safety frameworks." },
      { role: "assistant", content: "I will search for the latest information on that topic." },
      { role: "user", content: "Great, now summarize the top 3 findings." },
    ],
    [{ role: "user", content: "Analyze the performance metrics from last week deployment." }],
    [
      { role: "user", content: "Analyze the performance metrics from last week deployment." },
      { role: "assistant", content: "Let me check the database for the most recent records." },
      { role: "user", content: "Calculate the improvement percentage." },
    ],
    [{ role: "user", content: "Run a security audit on the agent workspace." }],
    [
      { role: "user", content: "Run a security audit on the agent workspace." },
      { role: "assistant", content: "The security scan completed successfully." },
      { role: "user", content: "Generate the compliance report." },
    ],
    [{ role: "user", content: "Review the pull request for the new authentication module." }],
    [{ role: "user", content: "Process this financial transaction for $50,000." }],
    [
      { role: "user", content: "Process this financial transaction for $50,000." },
      { role: "assistant", content: "I will escalate this to a human reviewer since it involves financial data." },
      { role: "user", content: "Good call. Now draft the approval request." },
    ],
    [{ role: "user", content: "Retry the failed API integration test." }],
  ];

  for (const messages of conversations) {
    const useTools = sent % 2 === 0;
    await sendRequest(gatewayUrl, messages, useTools, leaseToken, agentId);
    sent++;
    await sleep(200);
  }

  return {
    requestsSent: sent,
    evidenceItems: sent * 2,
    gatewayUrl,
    durationMs: Date.now() - start,
    mode: "gateway",
    agentId,
    trustLabel: leaseToken ? "SIGNED" : "DEMO_ONLY",
  };
}

export async function runDemoWithoutUserVault(options: NoVaultDemoOptions = {}): Promise<DemoResult> {
  const host = options.host ?? "127.0.0.1";
  const upstream = await startDemoUpstream(host, options.preferredUpstreamPort ?? 8000);
  let gateway: GatewayHandle | null = null;
  let prepared: PreparedNoVaultDemoWorkspace | null = null;
  const logger = options.logger ?? { log: () => undefined, error: () => undefined };

  try {
    prepared = prepareNoVaultDemoWorkspace({
      upstreamBaseUrl: upstream.baseUrl,
      agentId: options.agentId ?? DEMO_AGENT_ID
    });

    gateway = await withTemporaryVaultPassphraseAsync(prepared.passphrase, () =>
      startGateway({
        workspace: prepared!.workspace,
        workspaceId: workspaceIdFromDirectory(prepared!.workspace),
        listenHost: host,
        listenPort: 0,
        proxyPort: 0,
        logger
      })
    );

    const result = await withTemporaryVaultPassphraseAsync(prepared.passphrase, () =>
      runDemo(`http://${gateway!.host}:${gateway!.port}`, prepared!.leaseToken, prepared!.agentId)
    );
    const evidenceItems = countLedgerEvidence(prepared.workspace);
    const score = demoMaturityScore(result.requestsSent, evidenceItems);

    return {
      ...result,
      ...score,
      evidenceItems,
      mode: "no-vault-demo",
      demoOnly: true,
      agentId: prepared.agentId,
      trustLabel: "DEMO_ONLY",
      evidenceWorkspace: prepared.workspace,
      gatewaySessionId: gateway.gatewaySessionId,
      gatewaySignatureValid: gateway.signatureValid,
      gatewaySignatureExists: gateway.signatureExists
    };
  } finally {
    if (gateway) {
      await gateway.close();
    }
    await upstream.close();
    if (options.cleanup && prepared) {
      rmSync(prepared.workspace, { recursive: true, force: true });
    }
  }
}
