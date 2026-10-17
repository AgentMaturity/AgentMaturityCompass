/**
 * P1-23 conformance: AMC's installed Claude Code control hooks against the real, pinned Claude Code binary, driven by a
 * local scripted Messages endpoint (no live model; on macOS the binary runs under sandbox-exec with outbound network
 * denied except loopback). Opt-in: AMC_CLAUDE_CODE_CONFORMANCE=1. The binary comes from AMC_CLAUDE_CODE_PREFIX (an npm
 * prefix holding @anthropic-ai/claude-code and its platform package), else the qualified version is installed with npm
 * into a temp prefix. AMC_CLAUDE_CODE_CONFORMANCE_OUT names a JSON file for the per-case results;
 * AMC_CLAUDE_CODE_LATENCY_N sets the latency sample size (default 200).
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { getHookIntegrationStatus, installHookIntegration } from "../../src/adapters/hookIntegration.js";
import { QUALIFIED_CLAUDE_CODE_VERSIONS } from "../../src/adapters/hookProviders/claudeCode.js";
import { startBridgeServer } from "../../src/bridge/bridgeServer.js";
import { createFreezeIncident, liftFreeze } from "../../src/drift/freezeEngine.js";
import { getPurposeKeyHistory } from "../../src/keys/signingKeys.js";
import { openLedger, verifyEvidenceEventIntegrity } from "../../src/ledger/ledger.js";
import { verifyReceipt } from "../../src/receipts/receipt.js";
import { inspectHookActionLifecycle } from "../../src/watch/hookActionLifecycle.js";
import { controlledWorkspace, freePort, removeFixtureWorkspaces } from "../helpers/piHookFixtures.js";

const enabled = process.env.AMC_CLAUDE_CODE_CONFORMANCE === "1";
const agentId = "claude-conformance-agent";
const version = QUALIFIED_CLAUDE_CODE_VERSIONS[0]!;
type Step = { name: string; input: Record<string, unknown> };

const MCP_SERVER = `import { createInterface } from "node:readline";
const send = (m) => process.stdout.write(JSON.stringify(m) + "\\n");
createInterface({ input: process.stdin }).on("line", (line) => {
  const m = JSON.parse(line); if (m.id === undefined) return;
  if (m.method === "initialize") send({ jsonrpc: "2.0", id: m.id, result: { protocolVersion: m.params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: "amcprobe", version: "1.0.0" } } });
  else if (m.method === "tools/list") send({ jsonrpc: "2.0", id: m.id, result: { tools: [{ name: "echo", description: "Echo.", inputSchema: { type: "object", properties: { text: { type: "string" } } } }] } });
  else if (m.method === "tools/call") send({ jsonrpc: "2.0", id: m.id, result: { content: [{ type: "text", text: "mcp ran: " + m.params.arguments.text }] } });
  else send({ jsonrpc: "2.0", id: m.id, result: {} });
});
`;

/** The pinned Claude Code binary: the platform package's own `claude`, which `npm install --ignore-scripts` puts in place. */
function claudeBinary(): string {
  let prefix = process.env.AMC_CLAUDE_CODE_PREFIX;
  if (!prefix) {
    prefix = mkdtempSync(join(tmpdir(), `amc-claude-code-${version}-`));
    writeFileSync(join(prefix, "package.json"), '{"name":"amc-claude-code-conformance","private":true}\n');
    const installed = spawnSync("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund", "--save-exact", `@anthropic-ai/claude-code@${version}`],
      { cwd: prefix, encoding: "utf8", timeout: 600_000 });
    if (installed.status !== 0) throw new Error(`npm install of Claude Code ${version} failed: ${installed.stderr}`);
  }
  return realpathSync(join(resolve(prefix), "node_modules", "@anthropic-ai", `claude-code-${process.platform}-${process.arch}`, "claude"));
}

/** One streamed Messages response: a tool_use block or a text block. */
function sse(block: { type: "tool_use"; id: string; name: string; input: unknown } | { type: "text"; text: string }): string {
  const events: Array<[string, unknown]> = [["message_start", { type: "message_start", message: { id: "msg_amc", type: "message", role: "assistant",
    model: "claude-sonnet-4-5", content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } } }]];
  if (block.type === "tool_use") {
    events.push(["content_block_start", { type: "content_block_start", index: 0, content_block: { type: "tool_use", id: block.id, name: block.name, input: {} } }]);
    events.push(["content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: JSON.stringify(block.input) } }]);
  } else {
    events.push(["content_block_start", { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }]);
    events.push(["content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: block.text } }]);
  }
  events.push(["content_block_stop", { type: "content_block_stop", index: 0 }],
    ["message_delta", { type: "message_delta", delta: { stop_reason: block.type === "tool_use" ? "tool_use" : "end_turn", stop_sequence: null }, usage: { output_tokens: 1 } }],
    ["message_stop", { type: "message_stop" }]);
  return events.map(([name, data]) => `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`).join("");
}

/** The text of the tool result Claude Code sent back to the model for `id`. */
function toolResult(requests: Array<Record<string, unknown>>, id: string): string {
  for (const request of requests) {
    for (const message of (request.messages ?? []) as Array<{ content?: unknown }>) {
      for (const block of Array.isArray(message.content) ? message.content as Array<Record<string, unknown>> : []) {
        if (block.type === "tool_result" && block.tool_use_id === id) return JSON.stringify(block.content);
      }
    }
  }
  return "";
}

const percentile = (values: number[], p: number) => [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.ceil((p / 100) * values.length) - 1)]!;

describe.runIf(enabled)(`Claude Code ${version} hook conformance (P1-23)`, { timeout: 300_000 }, () => {
  const cases: Record<string, unknown> = {};
  let binary = "";
  let workspace = "";
  let scratch = "";
  let bridge: Awaited<ReturnType<typeof startBridgeServer>> | null = null;
  let bridgeBase = "";
  let model: Server;
  let modelBase = "";
  let steps: Array<Step & { id: string }> = [];
  let requests: Array<Record<string, unknown>> = [];

  beforeAll(async () => {
    binary = claudeBinary();
    workspace = controlledWorkspace(agentId);
    scratch = mkdtempSync(join(tmpdir(), "amc-claude-conformance-"));
    mkdirSync(join(workspace, "workspace", "output"), { recursive: true });
    writeFileSync(join(scratch, "mcp.mjs"), MCP_SERVER);
    writeFileSync(join(scratch, "mcp.json"), JSON.stringify({ mcpServers: { amcprobe: { type: "stdio", command: process.execPath, args: [join(scratch, "mcp.mjs")] } } }));
    model = createServer((req, res) => {
      let body = "";
      req.on("data", (chunk) => { body += String(chunk); });
      req.on("end", () => {
        const parsed = JSON.parse(body || "{}") as Record<string, unknown>;
        requests.push(parsed);
        if (!req.url?.startsWith("/v1/messages") || req.url.startsWith("/v1/messages/count_tokens")) {
          res.writeHead(200, { "content-type": "application/json" }).end('{"input_tokens":1}');
          return;
        }
        const main = (parsed.tools as Array<{ name: string }> | undefined)?.some((tool) => tool.name === "Bash") ?? false;
        const next = main ? steps.find((step) => !JSON.stringify(parsed.messages ?? []).includes(step.id)) : undefined;
        res.writeHead(200, { "content-type": "text/event-stream" })
          .end(sse(next ? { type: "tool_use", id: next.id, name: next.name, input: next.input } : { type: "text", text: "done" }));
      });
    });
    await new Promise<void>((done) => model.listen(0, "127.0.0.1", done));
    modelBase = `http://127.0.0.1:${(model.address() as { port: number }).port}`;
    const port = await freePort();
    bridgeBase = `http://127.0.0.1:${port}`;
    bridge = await startBridgeServer({ workspace, host: "127.0.0.1", port, gatewayBaseUrl: "http://127.0.0.1:1" });
    // Headroom over the default 120 requests a minute per route, which the 200-call latency loop would otherwise reach (and be denied).
    installHookIntegration({ workspace, provider: "claude-code", agentId, bridgeBase, mode: "control", claudeCodeBinary: binary, rpm: 1_000 });
  }, 900_000);

  afterAll(async () => {
    await bridge?.close();
    await new Promise((done) => model.close(done));
    const out = process.env.AMC_CLAUDE_CODE_CONFORMANCE_OUT;
    if (out) writeFileSync(out, `${JSON.stringify({ version, binary, platform: `${process.platform}-${process.arch}`, cases }, null, 2)}\n`);
    rmSync(scratch, { recursive: true, force: true });
    removeFixtureWorkspaces();
  });

  /** Run `claude -p` once with `script` as the model's tool calls; async, so this process keeps serving the model and the Bridge. */
  async function runClaude(script: Step[], tag: string) {
    steps = script.map((step, index) => ({ ...step, id: `toolu_01Amc${tag}${index}` }));
    requests = [];
    const env: Record<string, string> = {};
    for (const [key, value] of Object.entries(process.env)) if (value !== undefined && !/^(CLAUDE|ANTHROPIC)/.test(key)) env[key] = value;
    Object.assign(env, { HOME: scratch, ANTHROPIC_BASE_URL: modelBase, ANTHROPIC_API_KEY: "sk-ant-scripted-not-a-key", DISABLE_AUTOUPDATER: "1",
      CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1", DISABLE_TELEMETRY: "1", DISABLE_ERROR_REPORTING: "1" });
    const args = ["-p", "Run the scripted step.", "--output-format", "json", "--model", "claude-sonnet-4-5", "--mcp-config", join(scratch, "mcp.json")];
    const sandboxed = process.platform === "darwin" && existsSync("/usr/bin/sandbox-exec");
    const profile = '(version 1)(allow default)(deny network-outbound (remote ip "*:*"))(allow network-outbound (remote ip "localhost:*"))';
    const child = sandboxed ? spawn("/usr/bin/sandbox-exec", ["-p", profile, binary, ...args], { cwd: workspace, env })
      : spawn(binary, args, { cwd: workspace, env });
    let stdout = "";
    child.stdout.on("data", (chunk) => { stdout += String(chunk); });
    child.stderr.resume();
    const timer = setTimeout(() => child.kill("SIGKILL"), 120_000);
    const status = await new Promise<number | null>((done) => child.on("close", (code) => done(code)));
    clearTimeout(timer);
    let sessionId: string | null = null;
    try {
      sessionId = (JSON.parse(stdout) as { session_id?: string }).session_id ?? null;
    } catch {
      sessionId = null;
    }
    return { status, sessionId, requests, result: (id: number) => toolResult(requests, `toolu_01Amc${tag}${id}`) };
  }

  function decisions(): Array<Record<string, unknown>> {
    const ledger = openLedger(workspace);
    try {
      return ledger.getAllEvents().filter((row) => row.event_type === "audit").map((row) => JSON.parse(row.meta_json) as Record<string, unknown>)
        .filter((meta) => meta.provider === "claude-code" && meta.controlSchemaVersion === 2);
    } finally {
      ledger.close();
    }
  }

  let readSession: string | null = null;

  test("an allowed Read runs in a registered session, the claim reads enforced, and the lifecycle verifies with no mismatch", async () => {
    const run = await runClaude([{ name: "Read", input: { file_path: join(realpathSync.native(workspace), "workspace", "public.txt") } }], "Read");
    readSession = run.sessionId;
    const decision = decisions().find((meta) => meta.canonicalToolName === "fs.read" && meta.decision === "allow");
    const governance = getHookIntegrationStatus({ workspace, provider: "claude-code" }).governance!;
    const lifecycle = decision ? inspectHookActionLifecycle({ workspace, agentId, actionId: String(decision.actionId) }) : null;
    cases.allowedRead = { exit: run.status, ranTool: run.result(0).includes("public fixture"), decision: decision?.decision ?? null,
      claudeCodeVersion: decision?.claudeCodeVersion ?? null, claim: governance.claim, registeredSessions: governance.registeredSessions,
      lifecycle: lifecycle?.status ?? null, authorizationMismatch: lifecycle?.authorizationMismatch ?? null };
    expect(run.result(0)).toContain("public fixture");
    expect(decision).toMatchObject({ claudeCodeVersion: version });
    expect(governance).toMatchObject({ claim: "enforced_at_claude_code_pretooluse", invalidRegistrations: 0 });
    expect(lifecycle).toMatchObject({ status: "completed", valid: true, authorizationMismatch: false });
  });

  test("a denied Bash command, a Write that needs approval, an MCP tool and a Write to AMC's hook settings have no effect", async () => {
    const real = realpathSync.native(workspace);
    const bashMarker = join(real, "workspace", "output", "bash-effect.txt");
    const writeTarget = join(real, "workspace", "output", "denied.txt");
    // A new project settings file: Claude Code's Write needs no prior Read for it, so AMC's hook is what refuses it.
    const settings = join(real, ".claude", "settings.json");
    const run = await runClaude([
      { name: "Bash", input: { command: `touch ${bashMarker}`, description: "touch a marker" } },
      { name: "Write", input: { file_path: writeTarget, content: "x" } },
      { name: "mcp__amcprobe__echo", input: { text: "probe" } },
      { name: "Write", input: { file_path: settings, content: "{}" } },
    ], "Deny");
    cases.denied = {
      exit: run.status, bashEffect: existsSync(bashMarker), writeCreated: existsSync(writeTarget), mcpRan: run.result(2).includes("mcp ran"),
      settingsCreated: existsSync(settings),
      reasons: [0, 1, 2, 3].map((index) => run.result(index).slice(0, 160)),
    };
    expect(existsSync(bashMarker)).toBe(false);
    expect(existsSync(writeTarget)).toBe(false);
    expect(run.result(1)).toContain("not AMC approval");
    expect(run.result(2)).toContain("is not mapped to an allowed ToolHub tool");
    expect(run.result(2)).not.toContain("mcp ran");
    expect(run.result(3)).toContain("AMC protects its hook configuration");
    expect(existsSync(settings)).toBe(false);
  });

  test("a foreign PreToolUse hook in the project settings leaves the session not governed", async () => {
    const projectSettings = join(workspace, ".claude", "settings.json");
    writeFileSync(projectSettings, JSON.stringify({ hooks: { PreToolUse: [{ matcher: "*", hooks: [{ type: "command", command: process.execPath, args: ["-e", ""] }] }] } }));
    try {
      const run = await runClaude([{ name: "Read", input: { file_path: join(realpathSync.native(workspace), "workspace", "public.txt") } }], "Foreign");
      cases.foreignPreToolUseHook = { exit: run.status, ranTool: run.result(0).includes("public fixture"), reason: run.result(0).slice(0, 200) };
      expect(run.result(0)).not.toContain("public fixture");
      expect(run.result(0)).toContain("not governed");
    } finally {
      rmSync(projectSettings);
    }
  });

  test("UserPromptSubmit admission: an active freeze blocks the prompt before the model sees it", async () => {
    const incident = createFreezeIncident({ workspace, agentId, ruleId: "p1-23-conformance", previousRunId: "a", currentRunId: "b",
      deltas: { overallDrop: 1, integrityDrop: 0, correlationDrop: 0, maxLayerDrop: 1 }, actionClasses: ["WRITE_LOW"], reason: "P1-23 conformance" });
    try {
      const run = await runClaude([{ name: "Read", input: { file_path: join(realpathSync.native(workspace), "workspace", "public.txt") } }], "Frozen");
      const mainRequests = run.requests.filter((request) => (request.tools as unknown[] | undefined)?.length).length;
      cases.admissionFreeze = { exit: run.status, modelRequests: mainRequests };
      expect(mainRequests).toBe(0);
    } finally {
      liftFreeze({ workspace, agentId, incidentId: incident.incidentId, reason: "P1-23 conformance done" });
    }
  });

  test("hook round trip latency: the installed PreToolUse handler spawned against the local Bridge", async () => {
    expect(readSession).not.toBeNull();
    const config = JSON.parse(readFileSync(join(workspace, ".claude", "settings.local.json"), "utf8")) as {
      hooks: { PreToolUse: Array<{ hooks: Array<{ command: string; args: string[]; statusMessage?: string }> }> } };
    const handler = config.hooks.PreToolUse.flatMap((group) => group.hooks).find((row) => row.statusMessage?.startsWith("AMC Control"))!;
    const n = Number(process.env.AMC_CLAUDE_CODE_LATENCY_N ?? 200);
    const samples: number[] = [];
    let allowed = 0;
    for (let index = 0; index < n; index += 1) {
      const payload = JSON.stringify({ session_id: readSession, transcript_path: join(scratch, "t.jsonl"), cwd: realpathSync.native(workspace),
        permission_mode: "default", hook_event_name: "PreToolUse", tool_name: "Read",
        tool_input: { file_path: join(realpathSync.native(workspace), "workspace", "public.txt") }, tool_use_id: `toolu_latency_${index}` });
      const started = performance.now();
      const child = spawn(handler.command, handler.args, { cwd: workspace, stdio: ["pipe", "pipe", "ignore"] });
      let stdout = "";
      child.stdout.on("data", (chunk) => { stdout += String(chunk); });
      child.stdin.end(payload);
      const code = await new Promise<number | null>((done) => child.on("close", done));
      samples.push(performance.now() - started);
      // AMC only restricts: a verified allow is exit 0 with the empty answer.
      if (code === 0 && stdout.trim() === "{}") allowed += 1;
    }
    cases.latencyMs = { n, allowed, p50: Number(percentile(samples, 50).toFixed(1)), p95: Number(percentile(samples, 95).toFixed(1)),
      measured: "spawn of the installed PreToolUse handler (node + AMC forwarder entry) to its exit: observation, control decision, ledger receipt check; loopback Bridge" };
    expect(allowed).toBe(n);
  }, 1_800_000);

  test("every decision receipt and event verifies cold", () => {
    const ledger = openLedger(workspace);
    const keys = getPurposeKeyHistory(workspace, "receipt");
    const rows = ledger.getAllEvents().filter((row) => row.event_type === "audit" && (JSON.parse(row.meta_json) as { provider?: string }).provider === "claude-code");
    const failures = rows.filter((row) => !verifyReceipt(String((JSON.parse(row.meta_json) as { receipt: string }).receipt), keys).ok
      || !verifyEvidenceEventIntegrity({ ledger, eventId: row.id, requireReceipt: true, requireSealedSession: true }).ok);
    ledger.close();
    cases.receiptsVerified = { rows: rows.length, failures: failures.length };
    expect(rows.length).toBeGreaterThan(10);
    expect(failures).toEqual([]);
  });

  test("with the Bridge stopped the tool call is blocked", async () => {
    await bridge?.close();
    bridge = null;
    const run = await runClaude([{ name: "Read", input: { file_path: join(realpathSync.native(workspace), "workspace", "public.txt") } }], "Down");
    cases.bridgeStopped = { exit: run.status, ranTool: run.result(0).includes("public fixture"), modelRequests: run.requests.length, reason: run.result(0).slice(0, 200) };
    expect(run.result(0)).not.toContain("public fixture");
  });
});
