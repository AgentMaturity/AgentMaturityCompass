/**
 * A whole agent, with no network anywhere.
 *
 * The loop's claims are about what AMC RECORDS — a balanced turn, a steer
 * claimed by the next step of the same turn, a veto that ends a turn blocked.
 * None of them is a claim about a provider, so the model is a scripted chunk
 * list and the tools are functions. The transport seam and the adapter seam
 * exist precisely so a test can be the provider.
 *
 * The scripted adapter answers one script per dispatch, in order, so a
 * multi-step turn is expressed as a list of steps rather than as a stateful
 * mock nobody can read.
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initWorkspace } from "../../src/workspace.js";
import { openLedger } from "../../src/ledger/ledger.js";
import { AdapterRegistry } from "../../src/llm/adapter/adapterRegistry.js";
import type { LlmAdapter } from "../../src/llm/adapter/adapterTypes.js";
import { LlmRuntime } from "../../src/llm/adapter/llmRuntime.js";
import type { HttpResponse, HttpTransport } from "../../src/llm/adapter/transport.js";
import { bodyFromChunks } from "../../src/llm/adapter/transport.js";
import { toolCallId } from "../../src/llm/streamChunk.js";
import type { StreamChunk } from "../../src/llm/streamChunk.js";
import type { ToolSchema } from "../../src/llm/request/requestSpec.js";
import type { RetryPolicyConfig } from "../../src/llm/retryPolicy.js";
import { credentialRef } from "../../src/credentials/credentialRef.js";
import type { CredentialsService } from "../../src/credentials/credentialsService.js";
import type { CredentialDescription } from "../../src/credentials/credentialSources.js";
import { SessionService } from "../../src/session/sessionService.js";
import { AgentDriver } from "../../src/agent/agentDriver.js";
import type { AgentLoopConfig, LoopHooks, LoopRetryRuntime } from "../../src/agent/loopTypes.js";
import { NO_HOOKS } from "../../src/agent/loopTypes.js";
import type { AgentToolSeam, ToolCallOutcome, ToolCallRequest } from "../../src/agent/toolSeam.js";
import type { EvidenceEvent } from "../../src/types.js";

export const LOOP_PROVIDER = "anthropic";
export const LOOP_MODEL = "claude-loop-test";

/** A credentials seam with one value and no file behind it. */
class FixedCredentials implements CredentialsService {
  resolve(): string | null {
    return "sk-loop-test-DO-NOT-LOG";
  }

  describe(): CredentialDescription {
    return Object.freeze({ configured: true, source: "file" as const, writable: false });
  }

  async set(): Promise<void> {
    throw new Error("not used");
  }

  async unset(): Promise<boolean> {
    throw new Error("not used");
  }
}

/** A transport that always answers 200 with an empty body; the adapter ignores it. */
const silentTransport: HttpTransport = async (): Promise<HttpResponse> => ({
  status: 200,
  headers: { "content-type": "text/event-stream" },
  body: bodyFromChunks([])
});

/** One complete text-only response. */
export function textStep(text: string, usage?: Partial<StreamUsageInput>): StreamChunk[] {
  return [
    { type: "block-start", index: 0, blockKind: "text" },
    { type: "text-delta", index: 0, text },
    { type: "block-end", index: 0, block: { kind: "text", text } },
    { type: "usage", usage: usageOf(usage) },
    { type: "finish", reason: { kind: "stop" } }
  ];
}

/** One response that the model truncated at its output ceiling. */
export function maxTokensStep(text: string, usage?: Partial<StreamUsageInput>): StreamChunk[] {
  return [
    { type: "block-start", index: 0, blockKind: "text" },
    { type: "text-delta", index: 0, text },
    { type: "block-end", index: 0, block: { kind: "text", text } },
    { type: "usage", usage: usageOf(usage) },
    { type: "finish", reason: { kind: "max_tokens" } }
  ];
}

/** One response that asks for a single tool call. */
export function toolStep(
  id: string,
  name: string,
  args: string,
  usage?: Partial<StreamUsageInput>
): StreamChunk[] {
  return toolStepMulti([{ id, name, args }], usage);
}

/** One response that asks for several tool calls, in model order. */
export function toolStepMulti(
  calls: readonly { readonly id: string; readonly name: string; readonly args: string }[],
  usage?: Partial<StreamUsageInput>
): StreamChunk[] {
  const chunks: StreamChunk[] = [];
  calls.forEach((call, index) => {
    const callId = toolCallId(call.id);
    chunks.push(
      { type: "block-start", index, blockKind: "tool_use" },
      { type: "tool-call-delta", index, id: callId, name: call.name, argumentsDelta: call.args },
      {
        type: "block-end",
        index,
        block: { kind: "tool_use", id: callId, name: call.name, arguments: call.args }
      }
    );
  });
  chunks.push({ type: "usage", usage: usageOf(usage) }, { type: "finish", reason: { kind: "tool_calls" } });
  return chunks;
}

export interface StreamUsageInput {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheReadTokens?: number;
  readonly cacheWriteTokens?: number;
}

function usageOf(usage: Partial<StreamUsageInput> | undefined): StreamUsageInput {
  return {
    inputTokens: usage?.inputTokens ?? 10,
    outputTokens: usage?.outputTokens ?? 4,
    ...(usage?.cacheReadTokens === undefined ? {} : { cacheReadTokens: usage.cacheReadTokens }),
    ...(usage?.cacheWriteTokens === undefined ? {} : { cacheWriteTokens: usage.cacheWriteTokens })
  };
}

/** An adapter that replays one scripted chunk list per dispatch. */
function scriptedAdapter(scripts: readonly StreamChunk[][]): LlmAdapter {
  let index = 0;
  return {
    id: "scripted-loop",
    version: 1,
    encoderId: "anthropic-messages",
    encoderVersion: 1,
    envelope: (input) => ({
      url: `${input.baseUrl}/v1/messages`,
      method: "POST",
      headers: { ...input.extraHeaders },
      body: input.body
    }),
    decode: async function* decode() {
      const script = scripts[index] ?? scripts[scripts.length - 1];
      index += 1;
      if (script === undefined) throw new Error("scripted adapter has no script configured");
      for (const chunk of script) yield chunk;
    }
  };
}

/** A tool registry backed by plain functions. */
export class StubToolSeam implements AgentToolSeam {
  readonly calls: ToolCallRequest[] = [];

  private readonly handlers: Map<string, (request: ToolCallRequest) => Promise<ToolCallOutcome>>;

  private readonly exclusive: ReadonlySet<string>;

  constructor(
    handlers: Readonly<Record<string, (request: ToolCallRequest) => Promise<ToolCallOutcome>>>,
    exclusive: readonly string[] = []
  ) {
    this.handlers = new Map(Object.entries(handlers));
    this.exclusive = new Set(exclusive);
  }

  schemas(): readonly ToolSchema[] | null {
    const names = [...this.handlers.keys()];
    if (names.length === 0) return null;
    return names.map((name) => ({
      name,
      description: `stub tool ${name}`,
      parameters: { type: "object", properties: {} }
    }));
  }

  executionMode(request: ToolCallRequest): "parallel" | "exclusive" {
    return this.exclusive.has(request.toolName) ? "exclusive" : "parallel";
  }

  async execute(request: ToolCallRequest): Promise<ToolCallOutcome> {
    this.calls.push(request);
    const handler = this.handlers.get(request.toolName);
    if (handler === undefined) {
      return { outcome: "ERROR", content: `no stub tool ${request.toolName}`, exitCode: null, timedOut: false, denied: false };
    }
    return handler(request);
  }
}

/** A tool result with the ordinary fields filled in. */
export function ok(content: string, extra: Partial<ToolCallOutcome> = {}): ToolCallOutcome {
  return { outcome: "OK", content, exitCode: 0, timedOut: false, denied: false, ...extra };
}

export interface LoopHarness {
  readonly dir: string;
  readonly session: SessionService;
  /** The wired runtime, so a test can build a second driver over the same session. */
  readonly llm: LlmRuntime;
  readonly systemPromptEventId: string;
  readonly sessionId: string;
  readonly driver: AgentDriver;
  readonly tools: StubToolSeam;
  /** Read this session's committed rows straight from the ledger. */
  events(): EvidenceEvent[];
  /** Close the session so the workspace verifies as a completed run. */
  finish(): void;
  /**
   * Simulate the process dying: nothing more may ever be written for this
   * session. Used to stage the crash-repair half of a live-vs-repaired
   * comparison — a later `finish()` would append with a stale chain head and
   * break the very chain the comparison is about to verify.
   */
  abandon(): void;
}

export interface LoopHarnessOptions {
  readonly scripts: readonly StreamChunk[][];
  readonly tools?: StubToolSeam;
  readonly hooks?: Partial<LoopHooks>;
  readonly config?: Partial<AgentLoopConfig>;
  /** Replaces the default transport, e.g. to force a dispatch failure. */
  readonly transport?: HttpTransport;
  /** The route's retry policy. Omitted means the shipped defaults. */
  readonly retry?: RetryPolicyConfig;
  /**
   * Pins the retry wait and jitter.
   *
   * Without this a retry test would really sleep — a test of `setTimeout` — and
   * the delay the signed row records would be undeterminable. Tests that pin it
   * assert the exact number the schedule computes.
   */
  readonly retryRuntime?: LoopRetryRuntime;
}

/**
 * A retry runtime that records what it was asked to wait and waits none of it.
 *
 * `waits` is what a test asserts the SIGNED ROW against, so a schedule change
 * that silently stopped honouring a provider hint fails twice: once on the row
 * and once here.
 */
export function recordingRetryRuntime(random = 0.5): LoopRetryRuntime & { readonly waits: number[] } {
  const waits: number[] = [];
  return {
    waits,
    sleep(ms: number): Promise<void> {
      waits.push(ms);
      return Promise.resolve();
    },
    random(): number {
      return random;
    }
  };
}

/**
 * Stand up a workspace, a session, a scripted model and a driver over them.
 *
 * The driver is built AFTER the system prompt is recorded, because a request
 * cites the `system/prompt` row it was assembled from and that row has to exist
 * before the first step.
 */
export function loopHarness(options: LoopHarnessOptions): LoopHarness {
  const dir = mkdtempSync(join(tmpdir(), "amc-agent-loop-"));
  initWorkspace({ workspacePath: dir, agentId: "default", trustBoundaryMode: "isolated" });

  const session = new SessionService(dir);
  session.open({
    agentId: "default",
    harnessVersion: "3.2.0",
    compositionDigest: "composition-digest",
    policyDigest: "policy-digest"
  });
  const systemPrompt = session.recordSystemPrompt("You are a careful assistant.");

  const registry = new AdapterRegistry();
  registry.register({
    providerId: LOOP_PROVIDER,
    adapter: scriptedAdapter(options.scripts),
    baseUrl: "https://api.anthropic.invalid",
    credentialRef: credentialRef("AMC_LOOP_TEST_KEY"),
    models: [LOOP_MODEL],
    ...(options.retry === undefined ? {} : { retry: options.retry })
  });

  let clock = 1_000;
  const llm = new LlmRuntime({
    session,
    credentials: new FixedCredentials(),
    registry,
    transport: options.transport ?? silentTransport,
    now: () => {
      clock += 5;
      return clock;
    }
  });

  const tools = options.tools ?? new StubToolSeam({});
  const driver = new AgentDriver({
    session,
    llm,
    tools,
    route: { providerId: LOOP_PROVIDER, model: LOOP_MODEL, params: { max_tokens: 256 } },
    systemPromptEventId: systemPrompt.eventId,
    hooks: { ...NO_HOOKS, ...options.hooks },
    ...(options.config === undefined ? {} : { config: options.config }),
    ...(options.retryRuntime === undefined ? {} : { retryRuntime: options.retryRuntime })
  });

  const sessionId = session.sessionId;
  let closed = false;
  return {
    dir,
    session,
    llm,
    systemPromptEventId: systemPrompt.eventId,
    sessionId,
    driver,
    tools,
    events(): EvidenceEvent[] {
      const ledger = openLedger(dir);
      try {
        return ledger.getAllEvents().filter((event) => event.session_id === sessionId);
      } finally {
        ledger.close();
      }
    },
    finish(): void {
      if (closed) return;
      closed = true;
      session.close({ reason: "completed" });
    },
    abandon(): void {
      closed = true;
    }
  };
}
