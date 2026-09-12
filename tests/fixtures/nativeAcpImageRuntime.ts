/** AUTHORED UNEXECUTED. Real native ACP/session/driver/ledger/adapter; only HTTP
 * is scripted. This source fixture is NOT installed-CLI or live-provider proof.
 * Importing it never opens a workspace, provider, child or session.
 */
import { randomUUID } from "node:crypto";
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { hostname } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createAcpAgent } from "../../src/acp/acpAgentServer.js";
import { prepareAcpNativeSession } from "../../src/acp/acpNativeSession.js";
import { acpRouteFor } from "../../src/acp/acpStdioMain.js";
import { paramsFor } from "../../src/cli-agent-options.js";
import type { AcpSink } from "../../src/acp/acpConnection.js";
import type { AgentSession, AgentSessionInit } from "../../src/agent/agentSession.js";
import { AgentDriver } from "../../src/agent/agentDriver.js";
import { readAgentRunSummary } from "../../src/agent/runReport.js";
import type { LoopHooks } from "../../src/agent/loopTypes.js";
import { LocalCredentialsService } from "../../src/credentials/localCredentialsService.js";
import { AdapterRegistry } from "../../src/llm/adapter/adapterRegistry.js";
import type { LlmAdapter } from "../../src/llm/adapter/adapterTypes.js";
import { LlmRuntime } from "../../src/llm/adapter/llmRuntime.js";
import type { HttpRequest, HttpTransport } from "../../src/llm/adapter/transport.js";
import { SessionService } from "../../src/session/sessionService.js";
import { sha256Hex } from "../../src/utils/hash.js";
import { initWorkspace } from "../../src/workspace.js";
import { anthropicTextStream, okStream } from "../helpers/llmStubUpstream.js";
import { responsesImageStream } from "./nativeResponsesImageStream.js";
import { chatImageStream } from "./nativeChatImageStream.js";

export const IMAGE_FIXTURE_MARKER = "disposable native ACP image fixture\n";
export const IMAGE_PNG_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jZ1sAAAAASUVORK5CYII=";
export const imageInput = () => ({ filename: "pixel.png", mediaType: "image/png" as const, bytes: Buffer.from(IMAGE_PNG_BASE64, "base64") });

export function createNativeAcpImageFixture(workspace: string, write: AcpSink, options: {
  provider?: string; adapter?: LlmAdapter; transport?: HttpTransport; hooks?: LoopHooks; capturePath?: string; policyDigest?: string; orderedImageInput?: boolean;
} = {}) {
  const configured = acpRouteFor({ workspace, agentId: "default", providerId: options.provider ?? "anthropic",
    model: "fixture-model", systemPrompt: "Native ACP image fixture" });
  if ("error" in configured) throw new Error(configured.error);
  const route = { ...configured, credentialRef: null, adapter: options.adapter ?? configured.adapter };
  const model = route.models?.[0] ?? "";
  const registry = new AdapterRegistry(); registry.register(route);
  const credentials = new LocalCredentialsService({ env: {}, projectDir: null, homeDir: join(workspace, "empty-fixture-home"), includeDotenv: false, watch: false });
  const sent: HttpRequest[] = [], sessions = new Map<string, AgentSession>();
  const transport: HttpTransport = async request => {
    sent.push({ ...request, headers: { ...request.headers }, body: Buffer.from(request.body) });
    if (options.capturePath) appendFileSync(options.capturePath, JSON.stringify({ body: request.body.toString("base64"), digest: sha256Hex(request.body) }) + "\n");
    return options.transport ? options.transport(request)
      : route.providerId === "openai-responses" ? responsesImageStream()
        : route.providerId === "openai" ? chatImageStream()
        : okStream(anthropicTextStream({ text: ["Native image fixture response"], inputTokens: 10, outputTokens: 3 }));
  };
  const sessionOptions = (sessionId: string): AgentSessionInit & { sessionId: string } => ({
    workspace, sessionId, agentId: "default", tools: "none", maxSteps: 3,
    route: { providerId: route.providerId, model, params: paramsFor(route.providerId, 64) },
    systemPrompt: "Native ACP image fixture", harnessVersion: "native-image-fixture",
    compositionDigest: sha256Hex(`native-image-fixture:${route.providerId}:${route.adapter.encoderVersion}`),
    policyDigest: options.policyDigest ?? sha256Hex("native-image-fixture:no-tools"),
    makeLlm: session => new LlmRuntime({ session, credentials, registry, transport })
  });
  const factory = async (sessionId: string, signal: AbortSignal, resume: boolean): Promise<AgentSession> => {
    const init = sessionOptions(sessionId);
    let session: AgentSession;
    if (options.hooks) {
      // Test-only protocol adapter over the REAL driver, to inject its actual
      // preStep hook (AgentSession's normal public composition has no hook option).
      if (resume) throw new Error("Hook fixture does not implement resume");
      const writer = new SessionService(workspace); writer.open(init);
      const system = writer.recordSystemPrompt(init.systemPrompt);
      const driver = new AgentDriver({ session: writer, llm: init.makeLlm(writer), route: init.route,
        systemPromptEventId: system.eventId, hooks: options.hooks, config: { maxStepsPerTurn: 3 } });
      session = { sessionId, readEvents: () => writer.readEvents(),
        prompt: async (text, images) => {
          driver.followup(text, images); await driver.whenIdle();
          const summary = readAgentRunSummary(workspace, sessionId, driver.status);
          if (driver.status === "failed" || summary.unsignedRows) return { ok: false, reason: "fixture driver/evidence failed" };
          return { ok: true, text: summary.assistantText.join("\n"), status: driver.status, validation: summary.validation };
        },
        promptParts: async parts => {
          driver.followupParts(parts); await driver.whenIdle();
          const summary = readAgentRunSummary(workspace, sessionId, driver.status);
          if (driver.status === "failed" || summary.unsignedRows) return { ok: false, reason: "fixture driver/evidence failed" };
          return { ok: true, text: summary.assistantText.join("\n"), status: driver.status, validation: summary.validation };
        },
        cancel: (cause, by) => driver.cancel(cause, { by, keepInbox: true }),
        close: () => { writer.close({ reason: "fixture-completed" }); }
      };
    } else {
      session = await prepareAcpNativeSession({ session: init, signal, onApprovalRaised: () => {},
        ...(resume ? { claimant: { pid: process.pid, hostId: hostname(), bootId: randomUUID(), startedAt: Date.now() } } : {}) });
    }
    sessions.set(sessionId, session); return session;
  };
  const agent = createAcpAgent({ workspace, agentId: "default", write,
    promptRoute: registry.pin({ providerId: route.providerId, model }),
    orderedImageInput: options.orderedImageInput ?? true,
    sessionFactory: ({ sessionId, signal }) => factory(sessionId, signal, false),
    ...(options.hooks ? {} : { resumeSessionFactory: ({ sessionId, signal }: { sessionId: string; signal: AbortSignal }) => factory(sessionId, signal, true) }) });
  let closePromise: Promise<void> | undefined;
  return { agent, sessions, sent, close: () => closePromise ??= (async () => {
    try { await agent.close(); } finally { await credentials.close(); }
  })() };
}

async function main(): Promise<void> {
  const workspace = process.cwd();
  if (process.env.AMC_NATIVE_IMAGE_FIXTURE !== "1"
      || readFileSync(join(workspace, ".native-image-fixture"), "utf8") !== IMAGE_FIXTURE_MARKER) {
    throw new Error("This source fixture requires an explicitly marked disposable workspace");
  }
  if (!existsSync(join(workspace, ".amc"))) initWorkspace({ workspacePath: workspace, agentId: "default", trustBoundaryMode: "isolated" });
  const providerIndex = process.argv.indexOf("--provider");
  const fixture = createNativeAcpImageFixture(workspace, frame => { process.stdout.write(frame); }, {
    provider: providerIndex < 0 ? "anthropic" : (process.argv[providerIndex + 1] ?? "anthropic"),
    capturePath: join(workspace, ".native-image-http.jsonl")
  });
  const close = () => { void fixture.close().catch(() => { process.exitCode = 1; }); };
  process.stdin.on("data", (chunk: Buffer) => fixture.agent.connection.ingest(chunk));
  process.stdin.once("end", close); process.once("SIGTERM", close);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void main().catch(() => { process.stderr.write("Native image source fixture failed\n"); process.exitCode = 1; });
}
