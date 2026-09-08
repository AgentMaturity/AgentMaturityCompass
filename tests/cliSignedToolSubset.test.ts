import { spawn } from "node:child_process";
import { createServer, type Server } from "node:http";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, expect, test, vi } from "vitest";
import YAML from "yaml";
import { initWorkspace } from "../src/workspace.js";
import { initBudgets } from "../src/budgets/budgets.js";
import { writeRuntimeFirewallPolicy } from "../src/runtime/firewall.js";
import { defaultToolsConfig } from "../src/toolhub/toolsSchema.js";
import { openLedger } from "../src/ledger/ledger.js";
import { extractEnvelope } from "../src/session/sessionTypes.js";
import { readEventPayload } from "../src/session/eventPayload.js";
import { readAgentRunSummary, type AgentRunSummary } from "../src/agent/runReport.js";

interface ModelRequest {
  stream: boolean;
  stream_options: { include_usage: boolean };
  max_tokens: number;
  tools?: Array<{ type: string; function: { name: string } }>;
  messages: Array<{ role: string; content?: unknown; tool_call_id?: string }>;
}
let workspace: string | undefined, server: Server | undefined;
afterEach(async () => {
  if (server) {
    server.closeAllConnections(); await new Promise<void>(done => server!.close(() => done())); server = undefined;
  }
  if (workspace) { rmSync(workspace, { recursive: true, force: true }); workspace = undefined; }
  vi.unstubAllEnvs();
});

test.each(["CLI", "ACP"] as const)("the built native %s uses provider-valid aliases to execute the signed read subset and reconstruct its requests", async surface => {
  const cli = resolve("dist/cli.js");
  if (!existsSync(cli)) throw new Error("Build the coordinated candidate before the native subset CLI regression.");
  const pass = "synthetic-cli-subset-vault", credential = "synthetic-loopback-subset-key";
  vi.stubEnv("AMC_VAULT_PASSPHRASE", pass);
  workspace = realpathSync(mkdtempSync(join(tmpdir(), "amc-cli-subset-")));
  const root = join(workspace, "project"), home = join(workspace, "isolated-home");
  mkdirSync(root, { mode: 0o700 }); mkdirSync(home, { mode: 0o700 });
  // Independent control checkpoints must remain outside the governed project.
  const checkpointRoot = join(workspace, "control-checkpoints");
  vi.stubEnv("AMC_CONTROL_CHECKPOINT_DIR", checkpointRoot);
  initWorkspace({ workspacePath: root, trustBoundaryMode: "isolated" });
  initBudgets(root, "default"); writeRuntimeFirewallPolicy({ workspace: root, mode: "observe" });
  mkdirSync(join(root, "workspace"), { recursive: true });
  const fixtureText = "independent read-only fixture bytes: 17b4";
  writeFileSync(join(root, "workspace", "review.txt"), fixtureText);
  const config = defaultToolsConfig();
  config.tools.allowedTools = config.tools.allowedTools.filter(tool => ["fs.read", "glob", "grep"].includes(tool.name));
  // The browser/CLI must not require granting either write or bash to review code.
  const policyPath = join(root, ".amc", "tools.yaml"); writeFileSync(policyPath, YAML.stringify(config));
  const originalPolicy = readFileSync(policyPath);
  const env: NodeJS.ProcessEnv = { HOME: home, PATH: process.env.PATH, AMC_VAULT_PASSPHRASE: pass,
    AMC_SUBSET_LOOPBACK_KEY: credential, AMC_CONTROL_CHECKPOINT_DIR: checkpointRoot, NO_COLOR: "1" };
  async function run(args: string[]) {
    return new Promise<{ code: number | null; stdout: string; stderr: string }>((done, reject) => {
      const child = spawn(process.execPath, [cli, ...args], { cwd: root, env, stdio: ["ignore", "pipe", "pipe"] });
      let stdout = "", stderr = "", timedOut = false;
      const timeout = setTimeout(() => { timedOut = true; child.kill("SIGTERM"); }, 30_000);
      const kill = setTimeout(() => child.kill("SIGKILL"), 33_000);
      child.stdout.setEncoding("utf8"); child.stderr.setEncoding("utf8");
      child.stdout.on("data", (chunk: string) => { stdout += chunk; if (stdout.length > 2_000_000) child.kill("SIGKILL"); });
      child.stderr.on("data", (chunk: string) => { stderr += chunk; if (stderr.length > 2_000_000) child.kill("SIGKILL"); });
      child.once("error", error => { clearTimeout(timeout); clearTimeout(kill); reject(error); });
      child.once("close", code => { clearTimeout(timeout); clearTimeout(kill);
        if (timedOut) reject(new Error("Actual CLI subset fixture exceeded its process deadline.")); else done({ code, stdout, stderr }); });
    });
  }
  const signed = await run(["tools", "sign", "--json"]);
  expect(signed.code, signed.stderr).toBe(0); expect(JSON.parse(signed.stdout).ok).toBe(true);
  const requests: ModelRequest[] = [], auth: boolean[] = [], fixtureErrors: string[] = [];
  const diagnostics = () => JSON.stringify({ surface, fixtureErrors, requests: requests.map(request => ({
    tools: request.tools?.map(tool => tool.function.name), messages: request.messages.filter(message => message.role !== "system")
      .map(message => ({ role: message.role, toolCallId: message.tool_call_id, content: String(message.content).slice(0, 768) }))
  })) }).split(credential).join("[REDACTED]").split(pass).join("[REDACTED]").slice(0, 16000);
  const calls = [{ arguments: { path: "workspace/review.txt" } }];
  server = createServer(async (request, response) => {
    try {
      const chunks: Buffer[] = []; let bytes = 0;
      for await (const chunk of request) { const data = Buffer.from(chunk); bytes += data.length;
        if (bytes > 1_000_000) throw new Error("request exceeded fixture bound"); chunks.push(data); }
      if (request.url !== "/v1/chat/completions") throw new Error("unexpected provider route");
      requests.push(JSON.parse(Buffer.concat(chunks).toString("utf8")) as ModelRequest);
      const advertised = requests.at(-1)!.tools?.map(tool => tool.function.name) ?? [];
      if (advertised.length !== 3 || new Set(advertised).size !== 3 || advertised.some(name => !/^[A-Za-z0-9_-]{1,64}$/.test(name))) {
        throw new Error("provider function names violate the documented contract");
      }
      const readName = advertised.find(name => name !== "glob" && name !== "grep");
      if (!readName) throw new Error("no read capability advertised");
      auth.push(request.headers.authorization === `Bearer ${credential}`);
      const index = requests.length - 1, tool = calls[index];
      response.writeHead(200, { "content-type": "text/event-stream" });
      const send = (value: object) => response.write(`data: ${JSON.stringify({ id: `fixture-${index}`, object: "chat.completion.chunk", created: 1, model: "subset-fixture", ...value })}\n\n`);
      send({ choices: [{ index: 0, delta: tool
        ? { role: "assistant", tool_calls: [{ index: 0, id: `subset-call-${index}`, type: "function", function: { name: readName, arguments: JSON.stringify(tool.arguments) } }] }
        : { role: "assistant", content: "Synthetic subset conformance complete." }, finish_reason: null }] });
      send({ choices: [{ index: 0, delta: {}, finish_reason: tool ? "tool_calls" : "stop" }] });
      send({ choices: [], usage: { prompt_tokens: 10, completion_tokens: 3, total_tokens: 13, prompt_tokens_details: { cached_tokens: 0 } } });
      response.end("data: [DONE]\n\n");
    } catch { fixtureErrors.push("Loopback fixture refused an invalid or oversized request."); response.destroy(); }
  });
  await new Promise<void>(done => server!.listen(0, "127.0.0.1", done));
  const address = server.address(); if (!address || typeof address === "string") throw new Error("No fixture port.");
  const prompt = "Read the signed-scope fixture with the advertised read capability.";
  let summary: AgentRunSummary, displayed: string;
  if (surface === "CLI") {
    const result = await run(["agent-loop", "run", prompt, "--provider", "openai", "--model", "subset-fixture",
      "--base-url", `http://127.0.0.1:${address.port}`, "--credential", "AMC_SUBSET_LOOPBACK_KEY", "--credentials-home", home,
      "--tools", "workspace", "--max-steps", "6", "--max-tokens", "64", "--json"]);
    const childDiagnostics = JSON.stringify({ stderr: result.stderr.slice(0, 2000), stdout: result.stdout.slice(0, 2000) })
      .split(credential).join("[REDACTED]").split(pass).join("[REDACTED]");
    expect(result.code, `${childDiagnostics}\n${diagnostics()}`).toBe(0);
    summary = JSON.parse(result.stdout) as AgentRunSummary; displayed = JSON.stringify(result);
  } else {
    const { AMCNativeClient } = await import(pathToFileURL(resolve("dist/sdk/nativeAgentClient.js")).href) as typeof import("../src/sdk/nativeAgentClient.js");
    const client = await AMCNativeClient.start({ workspace: root, provider: "openai", model: "subset-fixture",
      baseUrl: `http://127.0.0.1:${address.port}`, credential: "AMC_SUBSET_LOOPBACK_KEY", credentialsHome: home,
      tools: "workspace", maxSteps: 6, maxTokens: 64, env, timeoutMs: 30_000 });
    try {
      const session = await client.newSession();
      const result = await session.prompt(prompt).result;
      expect(result.text).toBe("Synthetic subset conformance complete.");
      await client.close();
      summary = readAgentRunSummary(root, session.sessionId, "idle"); displayed = JSON.stringify(result);
    } finally { await client.close(); }
  }
  expect(fixtureErrors).toEqual([]);
  expect(summary.requests).toBe(2); expect(summary.toolCalls).toBe(1); expect(summary.unsignedRows).toBe(0);
  expect(requests).toHaveLength(2); expect(auth).toEqual([true, true]);
  for (const request of requests) {
    const names = request.tools!.map(tool => tool.function.name);
    expect(names).toEqual(expect.arrayContaining(["glob", "grep"]));
    expect(names).not.toContain("fs.read");
    expect(names.every(name => /^[A-Za-z0-9_-]{1,64}$/.test(name))).toBe(true);
    // Encoder-owned streaming/usage fields must still be sent, without caller collisions.
    expect(request.stream).toBe(true); expect(request.stream_options).toEqual({ include_usage: true }); expect(request.max_tokens).toBe(64);
  }
  // CLI composition appends independently committed runtime context to this
  // wire message. The original input bytes are checked in the signed log below.
  expect(requests[0]!.messages.some(message => message.role === "user" && typeof message.content === "string"
    && message.content.slice(0, prompt.length) === prompt), diagnostics()).toBe(true);
  const toolResult = (request: number, call: number): unknown => {
    const content = requests[request]!.messages.find(message => message.tool_call_id === `subset-call-${call}`)?.content;
    expect(typeof content, diagnostics()).toBe("string");
    try { return JSON.parse(String(content)); } catch { throw new Error(`Invalid committed tool result: ${diagnostics()}`); }
  };
  expect(toolResult(1, 0), diagnostics()).toEqual({ type: "amc.tool-result", version: 1, isError: false, output: fixtureText });
  expect(existsSync(join(root, "workspace", "forbidden.txt"))).toBe(false);
  expect(existsSync(join(root, "workspace", "forbidden-shell.txt"))).toBe(false);
  expect(readFileSync(policyPath)).toEqual(originalPolicy);
  const ledger = openLedger(root, { readonly: true });
  try {
    const rows = ledger.getAllEvents().filter(row => row.session_id === summary.sessionId);
    const originalInputs = rows.filter(row => row.event_type === "user/message").filter(row => {
      const payload = readEventPayload(root, row);
      return payload.status === "ok" && payload.bytes.toString("utf8") === prompt;
    });
    expect(originalInputs, diagnostics()).toHaveLength(1);
    expect(originalInputs[0]!.writer_sig).not.toBe("unsigned");
    expect(extractEnvelope(originalInputs[0]!.meta_json)?.sessionId).toBe(summary.sessionId);
    const audits = rows.filter(row => String(JSON.parse(row.meta_json).auditType).startsWith("TOOL_CALL_"));
    expect(audits.map(row => ({ name: JSON.parse(row.meta_json).toolName, type: JSON.parse(row.meta_json).auditType })))
      .toEqual([{ name: "fs.read", type: "TOOL_CALL_ALLOWED" }]);
    const call = JSON.parse(rows.find(row => row.event_type === "tool/call")!.meta_json);
    expect(call.toolName).toBe("fs.read");
    expect(call.providerName).toMatchObject({ version: 1, encoderId: "openai-chat", encoderVersion: 3,
      wireName: requests[0]!.tools!.find(tool => !["glob", "grep"].includes(tool.function.name))!.function.name });
    for (const row of audits) { expect(row.writer_sig).not.toBe("unsigned"); expect(extractEnvelope(row.meta_json)?.sessionId).toBe(summary.sessionId); }
  } finally { ledger.close(); }
  for (const args of [["session", "verify", "--json"], ["agent-loop", "verify", summary.sessionId, "--json"]]) {
    const verification = await run(args); expect(verification.code, verification.stderr).toBe(0);
    expect(JSON.parse(verification.stdout).ok).toBe(true);
  }
  expect(displayed).not.toContain(credential);
}, 90_000);
