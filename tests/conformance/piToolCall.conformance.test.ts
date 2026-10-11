/**
 * P1-22 conformance: AMC's Pi extension against the real, pinned `pi` CLI, driven by a local scripted model endpoint
 * (no live model, no network beyond loopback). Opt-in: AMC_PI_CONFORMANCE=1. Pi comes from AMC_PI_PREFIXES
 * ("1.0.2=/abs/prefix,1.0.4=/abs/prefix", each an npm prefix holding @earendil-works/pi-coding-agent), else each
 * qualified version is installed with npm into a temp prefix. AMC_PI_CONFORMANCE_OUT names a JSON file for the
 * per-case results; AMC_PI_CONFORMANCE_FIXTURES=1 rewrites tests/fixtures/harness-hooks/pi/<version>/events.jsonl.
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { installHookIntegration } from "../../src/adapters/hookIntegration.js";
import { createAmcPiExtension, type PiExtensionApi, type PiToolCallContext } from "../../src/adapters/pi/amcPiExtension.js";
import { QUALIFIED_PI_VERSIONS } from "../../src/adapters/pi/piVersions.js";
import { startBridgeServer } from "../../src/bridge/bridgeServer.js";
import { getPublicKeyHistory } from "../../src/crypto/keys.js";
import { openLedger, verifyEvidenceEventIntegrity } from "../../src/ledger/ledger.js";
import { verifyReceipt } from "../../src/receipts/receipt.js";
import { inspectHookActionLifecycle } from "../../src/watch/hookActionLifecycle.js";
import { controlledWorkspace, freePort, removeFixtureWorkspaces } from "../helpers/piHookFixtures.js";

const enabled = process.env.AMC_PI_CONFORMANCE === "1";
const agentId = "pi-conformance-agent";
const UNAVAILABLE = "AMC control unavailable; action denied.";

/** A tool extension AMC must deny, plus an event logger for the run that loads no AMC extension. */
const PROBE_EXTENSION = `import { appendFileSync, writeFileSync } from "node:fs";
import { Type } from "typebox";
export default function (pi) {
  const log = process.env.AMC_PI_PROBE_LOG;
  if (log) {
    pi.on("tool_call", (event) => { appendFileSync(log, JSON.stringify({ type: "tool_call", toolName: event.toolName, toolCallId: event.toolCallId, parentToolCallId: event.parentToolCallId ?? null, input: event.input }) + "\\n"); });
    pi.on("tool_result", (event) => { appendFileSync(log, JSON.stringify({ type: "tool_result", toolName: event.toolName, toolCallId: event.toolCallId, parentToolCallId: event.parentToolCallId ?? null, isError: event.isError }) + "\\n"); });
  }
  pi.registerTool({ name: "amc_probe_effect", label: "AMC probe", description: "Writes a marker file.",
    parameters: Type.Object({ path: Type.String() }),
    async execute(_id, params) { writeFileSync(params.path, "probe"); return { content: [{ type: "text", text: "wrote" }], details: undefined }; } });
}
`;

type Scripted = { tool: string; args: Record<string, unknown>; id: string } | { text: string };

function piPrefixes(): Array<{ version: string; prefix: string }> {
  const given = process.env.AMC_PI_PREFIXES;
  if (given) return given.split(",").map((pair) => { const [version, prefix] = pair.split("="); return { version: version!, prefix: resolve(prefix!) }; });
  return QUALIFIED_PI_VERSIONS.map((version) => {
    const prefix = mkdtempSync(join(tmpdir(), `amc-pi-${version}-`));
    writeFileSync(join(prefix, "package.json"), '{"name":"amc-pi-conformance","private":true}\n');
    const installed = spawnSync("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund", "--save-exact", `@earendil-works/pi-coding-agent@${version}`],
      { cwd: prefix, encoding: "utf8", timeout: 300_000 });
    if (installed.status !== 0) throw new Error(`npm install of Pi ${version} failed: ${installed.stderr}`);
    return { version, prefix };
  });
}

/** One OpenAI-compatible streamed chat completion: a single tool call, or text. */
function sse(step: Scripted): string {
  const chunk = (delta: unknown, finish: string | null) => `data: ${JSON.stringify({ id: "chatcmpl-amc", object: "chat.completion.chunk", created: 0,
    model: "scripted", choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`;
  const usage = `data: ${JSON.stringify({ id: "chatcmpl-amc", object: "chat.completion.chunk", created: 0, model: "scripted", choices: [],
    usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } })}\n\n`;
  const body = "tool" in step
    ? chunk({ role: "assistant", tool_calls: [{ index: 0, id: step.id, type: "function", function: { name: step.tool, arguments: JSON.stringify(step.args) } }] }, null)
      + chunk({}, "tool_calls")
    : chunk({ role: "assistant", content: step.text }, null) + chunk({}, "stop");
  return `${body}${usage}data: [DONE]\n\n`;
}

/** The text of the tool result Pi sent back to the model for `toolCallId`. */
function toolResult(requests: Array<Record<string, unknown>>, toolCallId: string): string {
  for (const request of requests) {
    for (const message of (request.messages ?? []) as Array<Record<string, unknown>>) {
      if (message.role === "tool" && message.tool_call_id === toolCallId) {
        return typeof message.content === "string" ? message.content : JSON.stringify(message.content);
      }
    }
  }
  return "";
}

const percentile = (values: number[], p: number) => [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.ceil((p / 100) * values.length) - 1)]!;

describe.runIf(enabled)("Pi tool_call conformance (P1-22)", () => {
  const results: Record<string, unknown>[] = [];
  afterAll(() => {
    removeFixtureWorkspaces();
    const out = process.env.AMC_PI_CONFORMANCE_OUT;
    if (out) writeFileSync(out, `${JSON.stringify(results, null, 2)}\n`);
  });

  for (const { version, prefix } of enabled ? piPrefixes() : []) {
    describe(`Pi ${version}`, { timeout: 180_000 }, () => {
      const piCli = join(prefix, "node_modules", "@earendil-works", "pi-coding-agent", "dist", "bundle", "cli.js");
      const cases: Record<string, unknown> = {};
      let workspace = "";
      let scratch = "";
      let bridge: Awaited<ReturnType<typeof startBridgeServer>> | null = null;
      let bridgeBase = "";
      let model: Server;
      let script: Scripted[] = [];
      let requests: Array<Record<string, unknown>> = [];

      beforeAll(async () => {
        workspace = controlledWorkspace(agentId);
        scratch = mkdtempSync(join(tmpdir(), "amc-pi-conformance-"));
        model = createServer((req, res) => {
          let body = "";
          req.on("data", (chunk) => { body += String(chunk); });
          req.on("end", () => {
            requests.push(JSON.parse(body || "{}") as Record<string, unknown>);
            res.writeHead(200, { "content-type": "text/event-stream" }).end(sse(script.shift() ?? { text: "done" }));
          });
        });
        await new Promise<void>((done) => model.listen(0, "127.0.0.1", done));
        const address = model.address();
        if (!address || typeof address === "string") throw new Error("model server did not bind");
        const agentDir = join(scratch, "pi-agent");
        mkdirSync(agentDir, { recursive: true });
        writeFileSync(join(agentDir, "models.json"), JSON.stringify({ providers: { "amc-scripted": {
          baseUrl: `http://127.0.0.1:${address.port}/v1`, api: "openai-completions", apiKey: "scripted", models: [{ id: "scripted" }] } } }));
        writeFileSync(join(scratch, "probe.js"), PROBE_EXTENSION);
        const port = await freePort();
        bridgeBase = `http://127.0.0.1:${port}`;
        bridge = await startBridgeServer({ workspace, host: "127.0.0.1", port, gatewayBaseUrl: "http://127.0.0.1:1" });
        installHookIntegration({ workspace, provider: "pi", agentId, bridgeBase, mode: "control" });
      }, 120_000);

      afterAll(async () => {
        await bridge?.close();
        await new Promise((done) => model.close(done));
        results.push({ version, piCli, cases });
        rmSync(scratch, { recursive: true, force: true });
      });

      /** Run `pi -p` once with `steps` as the model's turns; async, so this process keeps serving the model and the Bridge. */
      async function runPi(steps: Scripted[], options: { trust?: boolean; tools?: string; probeLog?: string } = {}) {
        script = [...steps];
        requests = [];
        const args = [piCli, options.trust === false ? "--no-approve" : "--approve", "--offline", "--no-session", "--provider", "amc-scripted",
          "--model", "scripted", "-e", join(scratch, "probe.js"), ...(options.tools ? ["--tools", options.tools] : []), "-p", "Run the scripted step."];
        const child = spawn(process.execPath, args, { cwd: workspace, stdio: ["ignore", "pipe", "pipe"], env: {
          ...process.env, PI_CODING_AGENT_DIR: join(scratch, "pi-agent"), PI_OFFLINE: "1", PI_SKIP_VERSION_CHECK: "1", PI_TELEMETRY: "0",
          HOME: scratch, ...(options.probeLog ? { AMC_PI_PROBE_LOG: options.probeLog } : {}) } });
        let stdout = "";
        let stderr = "";
        child.stdout.on("data", (chunk) => { stdout += String(chunk); });
        child.stderr.on("data", (chunk) => { stderr += String(chunk); });
        const timer = setTimeout(() => child.kill("SIGKILL"), 60_000);
        const status = await new Promise<number | null>((done) => child.on("close", (code) => done(code)));
        clearTimeout(timer);
        return { status, stdout, stderr, requests };
      }

      /** AMC's recorded Pi decisions, oldest first. */
      function piDecisions(): Array<Record<string, unknown>> {
        const ledger = openLedger(workspace);
        try {
          return ledger.getAllEvents().filter((row) => row.event_type === "audit").map((row) => JSON.parse(row.meta_json) as Record<string, unknown>)
            .filter((meta) => meta.provider === "pi");
        } finally {
          ledger.close();
        }
      }

      test("an allowed read runs, reports this Pi's version and verifies as a completed lifecycle", async () => {
        const path = join(workspace, "workspace", "public.txt");
        const run = await runPi([{ tool: "read", args: { path }, id: "call_read_ok" }, { text: "done" }]);
        const result = toolResult(run.requests, "call_read_ok");
        const decision = piDecisions().find((meta) => meta.canonicalToolName === "fs.read" && meta.decision === "allow");
        cases.allowedRead = { exit: run.status, decision: decision?.decision ?? null, piVersion: decision?.piVersion ?? null, ranTool: result.includes("public fixture") };
        expect(run.status, run.stderr).toBe(0);
        expect(result).toContain("public fixture");
        expect(decision).toMatchObject({ decision: "allow", piVersion: version });
        const lifecycle = inspectHookActionLifecycle({ workspace, agentId, actionId: decision!.actionId as string });
        expect(lifecycle).toMatchObject({ status: "completed", valid: true });
      });

      test("a write that needs approval is denied and leaves no file", async () => {
        const path = join(workspace, "workspace", "output", "denied.txt");
        const run = await runPi([{ tool: "write", args: { path, content: "x" }, id: "call_write_denied" }, { text: "done" }]);
        const result = toolResult(run.requests, "call_write_denied");
        cases.deniedWrite = { exit: run.status, fileCreated: existsSync(path), reason: result.slice(0, 200) };
        expect(result).toContain("cannot carry an AMC approval");
        expect(existsSync(path)).toBe(false);
      });

      test("a denied bash command has no effect", async () => {
        const path = join(workspace, "workspace", "output", "bash-effect.txt");
        const run = await runPi([{ tool: "bash", args: { command: `touch ${path}` }, id: "call_bash_denied" }, { text: "done" }]);
        cases.deniedBash = { exit: run.status, fileCreated: existsSync(path), reason: toolResult(run.requests, "call_bash_denied").slice(0, 200) };
        expect(existsSync(path)).toBe(false);
        expect(toolResult(run.requests, "call_bash_denied")).not.toBe("");
      });

      test("an unmapped extension tool and the codemode tool are blocked before they run", async () => {
        const marker = join(workspace, "workspace", "output", "probe-marker.txt");
        const unmapped = await runPi([{ tool: "amc_probe_effect", args: { path: marker }, id: "call_ext_denied" }, { text: "done" }]);
        const codemodeMarker = join(workspace, "workspace", "output", "codemode-marker.txt");
        const codemode = await runPi([{ tool: "codemode", args: { code: `await tools.write({ path: ${JSON.stringify(codemodeMarker)}, content: "x" });` }, id: "call_codemode_denied" },
          { text: "done" }], { tools: "read,bash,edit,write,codemode" });
        cases.unmappedExtensionTool = { exit: unmapped.status, effect: existsSync(marker), reason: toolResult(unmapped.requests, "call_ext_denied").slice(0, 200) };
        cases.codemode = { exit: codemode.status, effect: existsSync(codemodeMarker), reason: toolResult(codemode.requests, "call_codemode_denied").slice(0, 200) };
        expect(toolResult(unmapped.requests, "call_ext_denied")).toContain("Pi tool amc_probe_effect is not mapped");
        expect(existsSync(marker)).toBe(false);
        expect(toolResult(codemode.requests, "call_codemode_denied")).toContain("Pi tool codemode is not mapped");
        expect(existsSync(codemodeMarker)).toBe(false);
      });

      test("confirmed contract without AMC: codemode's nested calls emit tool_call with parentToolCallId", async () => {
        const log = join(scratch, "events.jsonl");
        const path = join(workspace, "workspace", "public.txt");
        await runPi([{ tool: "codemode", args: { code: `return await tools.read({ path: ${JSON.stringify(path)} });` }, id: "call_codemode_probe" }, { text: "done" }],
          { trust: false, tools: "read,bash,edit,write,codemode", probeLog: log });
        const events = readFileSync(log, "utf8").trim().split("\n").map((line) => JSON.parse(line) as Record<string, unknown>);
        const nested = events.find((event) => event.type === "tool_call" && event.toolName === "read");
        cases.codemodeNestedToolCall = { events: events.length, nestedToolCallId: nested?.toolCallId ?? null, parentToolCallId: nested?.parentToolCallId ?? null };
        expect(events.find((event) => event.type === "tool_call" && event.toolName === "codemode")).toBeDefined();
        expect(nested).toMatchObject({ parentToolCallId: "call_codemode_probe", toolCallId: "call_codemode_probe/1" });
        if (process.env.AMC_PI_CONFORMANCE_FIXTURES === "1") {
          const dir = resolve("tests", "fixtures", "harness-hooks", "pi", version);
          mkdirSync(dir, { recursive: true });
          const portable = events.map((event) => JSON.parse(JSON.stringify(event).replaceAll(workspace, "<workspace>")) as unknown);
          writeFileSync(join(dir, "events.jsonl"), `${portable.map((event) => JSON.stringify(event)).join("\n")}\n`);
        }
      });

      test("limit: Pi loads no project extension for an untrusted project, so AMC decides nothing and the write runs", async () => {
        const path = join(workspace, "workspace", "output", "untrusted.txt");
        const before = piDecisions().length;
        const run = await runPi([{ tool: "write", args: { path, content: "untrusted" }, id: "call_untrusted_write" }, { text: "done" }], { trust: false });
        const amcDecisions = piDecisions().length - before;
        cases.untrustedProjectLimit = { exit: run.status, fileCreated: existsSync(path), amcDecisions };
        expect(existsSync(path)).toBe(true);
        expect(amcDecisions).toBe(0);
        rmSync(path);
      });

      test("decision latency through the extension and the local Bridge", async () => {
        const handlers = new Map<string, (event: unknown, ctx: PiToolCallContext) => Promise<unknown>>();
        const api: PiExtensionApi = { on: (name, handler) => handlers.set(name, handler as never) };
        await createAmcPiExtension({ workspace, mode: "control", piVersion: version })(api);
        const ctx: PiToolCallContext = { mode: "print", hasUI: false, sessionManager: { getSessionId: () => `latency-${version}` }, ui: { notify: () => undefined } };
        const samples: number[] = [];
        for (let index = 0; index < 100; index += 1) {
          const started = performance.now();
          const result = await handlers.get("tool_call")!({ toolName: "read", toolCallId: `lat_${index}`, input: { path: "workspace/public.txt" } }, ctx);
          samples.push(performance.now() - started);
          expect(result).toBeUndefined();
        }
        cases.latencyMs = { n: samples.length, p50: Number(percentile(samples, 50).toFixed(1)), p95: Number(percentile(samples, 95).toFixed(1)),
          measured: "extension tool_call handler to its result: requested observation, control decision, receipt check; loopback Bridge" };
      }, 120_000);

      test("every decision receipt and event verifies cold", async () => {
        const ledger = openLedger(workspace);
        const keys = getPublicKeyHistory(workspace, "monitor");
        const decisions = ledger.getAllEvents().filter((row) => row.event_type === "audit" && (JSON.parse(row.meta_json) as { provider?: string }).provider === "pi");
        const failures = decisions.filter((row) => {
          const meta = JSON.parse(row.meta_json) as { receipt: string };
          return !verifyReceipt(meta.receipt, keys).ok
            || !verifyEvidenceEventIntegrity({ ledger, eventId: row.id, requireReceipt: true, requireSealedSession: true }).ok;
        });
        ledger.close();
        cases.receiptsVerified = { decisions: decisions.length, failures: failures.length };
        expect(decisions.length).toBeGreaterThan(100);
        expect(failures).toEqual([]);
      });

      test("with the Bridge stopped every call is blocked", async () => {
        await bridge?.close();
        bridge = null;
        const run = await runPi([{ tool: "read", args: { path: join(workspace, "workspace", "public.txt") }, id: "call_bridge_down" }, { text: "done" }]);
        const result = toolResult(run.requests, "call_bridge_down");
        cases.bridgeStopped = { exit: run.status, reason: result.slice(0, 200), ranTool: result.includes("public fixture") };
        expect(result).toContain(UNAVAILABLE);
        expect(result).not.toContain("public fixture");
      });
    });
  }
});
