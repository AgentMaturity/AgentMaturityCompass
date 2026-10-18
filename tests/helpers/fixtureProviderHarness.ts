/**
 * P1-38 test harness: a signed session, the REAL LlmRuntime with the fetch transport and a local HTTP server that
 * plays one provider's wire format. pi routes come from the lockfile-installed pi-ai@1.3.0.
 * No key, no provider, no network beyond loopback.
 */
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach } from "vitest";
import { initWorkspace } from "../../src/workspace.js";
import { SessionService } from "../../src/session/sessionService.js";
import { LocalCredentialsService } from "../../src/credentials/localCredentialsService.js";
import { AdapterRegistry, type LlmRouteConfig } from "../../src/llm/adapter/adapterRegistry.js";
import type { RequestEncoderRegistry } from "../../src/llm/request/requestEncoder.js";
import { LlmRuntime, type PreparedCall } from "../../src/llm/adapter/llmRuntime.js";
import type { ToolSchema } from "../../src/llm/request/requestSpec.js";
import type { StreamChunk } from "../../src/llm/streamChunk.js";
import type { PiAiProviderId } from "../../src/llm/providers/piAi/piAiLoader.js";
import { piAiRouteFor } from "../../src/llm/providers/piAi/piAiAdapter.js";
import { stepUsage } from "./stepUsage.js";

/** One non-reasoning openai-completions model per provider from the pinned catalog. */
export const PI_FIXTURE_MODELS: Readonly<Record<PiAiProviderId, string>> = {
  groq: "llama-3.3-70b-versatile", huggingface: "deepseek-ai/DeepSeek-V3", together: "meta-llama/Llama-3.3-70B-Instruct-Turbo"
};
export const FIXTURE_KEY = "fixture-value-not-a-provider-key";
const cleanup: (() => void | Promise<void>)[] = [];
afterEach(async () => { for (const step of cleanup.splice(0).reverse()) await step(); });

export interface Received { readonly url: string; readonly headers: Record<string, string | string[] | undefined>; readonly body: Buffer }

/** Local Chat Completions stream: text and/or one tool call, then an optional usage frame and [DONE]. */
export function chatSse(options: { text?: string; tool?: { id: string; name: string; args: string }; usage?: boolean } = {}): string {
  const chunk = (delta: unknown, finish: string | null) => ({ id: "chatcmpl-fixture", object: "chat.completion.chunk", created: 0,
    model: "fixture", choices: [{ index: 0, delta, finish_reason: finish }] });
  const frames: unknown[] = [];
  if (options.text !== undefined) frames.push(chunk({ role: "assistant", content: options.text }, null));
  if (options.tool) {
    const { id, name, args } = options.tool, half = Math.floor(args.length / 2);
    frames.push(chunk({ tool_calls: [{ index: 0, id, type: "function", function: { name, arguments: args.slice(0, half) } }] }, null));
    frames.push(chunk({ tool_calls: [{ index: 0, function: { arguments: args.slice(half) } }] }, null));
  }
  frames.push(chunk({}, options.tool ? "tool_calls" : "stop"));
  if (options.usage !== false) frames.push({ id: "chatcmpl-fixture", object: "chat.completion.chunk", created: 0, model: "fixture", choices: [],
    usage: { prompt_tokens: 10, completion_tokens: 3, total_tokens: 13 } });
  return `${frames.map((frame) => `data: ${JSON.stringify(frame)}\n\n`).join("")}data: [DONE]\n\n`;
}

export async function fixtureServer(responses: string[], contentType = "text/event-stream"): Promise<{ origin: string; received: Received[] }> {
  const received: Received[] = [];
  const server: Server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      received.push({ url: request.url ?? "", headers: request.headers, body: Buffer.concat(chunks) });
      const next = responses.shift();
      if (next === undefined) { response.writeHead(500).end("unexpected fixture request"); return; }
      response.writeHead(200, { "content-type": contentType }).end(next);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  cleanup.push(() => new Promise<void>((resolve) => server.close(() => resolve())));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("fixture server has no port");
  return { origin: `http://127.0.0.1:${address.port}`, received };
}

/** A signed session and the REAL runtime (fetch transport) over a route built against a local fixture origin. */
export async function runtimeHarness(options: { responses: string[]; contentType?: string; model: string;
  route: (origin: string) => LlmRouteConfig | Promise<{ route: LlmRouteConfig; encoders?: RequestEncoderRegistry }>;
  params: Record<string, unknown> }) {
  const server = await fixtureServer(options.responses, options.contentType ?? "text/event-stream");
  const root = realpathSync(mkdtempSync(join(tmpdir(), "amc-capability-contract-")));
  cleanup.push(() => rmSync(root, { recursive: true, force: true }));
  initWorkspace({ workspacePath: root, agentId: "default", trustBoundaryMode: "isolated" });
  const session = new SessionService(root);
  let open = true;
  cleanup.push(() => { if (open) session.disposeWithoutClosing(); });
  session.open({ agentId: "default", harnessVersion: "capability-contract", compositionDigest: "capability-contract", policyDigest: "capability-contract" });
  const system = session.recordSystemPrompt("Answer from the fixture; this is not a model claim.");
  session.startTurn({ trigger: "user" }); session.recordUserMessage("Say hello."); session.startStep();
  const credentials = new LocalCredentialsService({ env: { AMC_PI_FIXTURE_KEY: FIXTURE_KEY }, projectDir: null,
    homeDir: join(root, "empty-credentials"), includeDotenv: false, watch: false });
  cleanup.push(() => credentials.close());
  const built = await options.route(server.origin);
  const { route, encoders } = "route" in built ? built : { route: built, encoders: undefined };
  const registry = new AdapterRegistry();
  registry.register(route);
  const runtime = new LlmRuntime({ session, credentials, registry, ...(encoders === undefined ? {} : { encoders }) });
  const spec = (tools: readonly ToolSchema[] | null = null, params: Record<string, unknown> = options.params) =>
    ({ providerId: route.providerId, model: options.model, params, tools, systemPromptEventId: system.eventId });
  const finishStep = (call: PreparedCall) => session.endStep({ stopReason: call.settled?.assembly.finishReason?.kind ?? "error",
    usage: stepUsage(call.settled?.assembly.usage) });
  const close = () => { session.endTurn({ reason: "complete" }); session.sealTurn(); session.close({ reason: "fixture-completed" }); open = false; };
  return { root, session, runtime, spec, finishStep, close, received: server.received, route, encoders };
}

export function piHarness(provider: PiAiProviderId, responses: string[]) {
  return runtimeHarness({ responses, model: PI_FIXTURE_MODELS[provider], params: { max_tokens: 64 },
    route: (origin) => piAiRouteFor(`pi-ai:${provider}`, { baseUrl: `${origin}/v1`, credential: "AMC_PI_FIXTURE_KEY" }, PI_FIXTURE_MODELS[provider]) });
}

export async function drain(stream: AsyncIterable<StreamChunk>): Promise<StreamChunk[]> {
  const chunks: StreamChunk[] = [];
  for await (const chunk of stream) chunks.push(chunk);
  return chunks;
}

