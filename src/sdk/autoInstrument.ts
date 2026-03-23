/**
 * Auto-Instrumentation SDK — One-line setup for AMC governance + observability.
 *
 * Like Visibe's init() but with AMC's trust layer on top:
 * - Auto-detects installed AI frameworks
 * - Monkey-patches them to capture traces
 * - ALSO captures governance events, policy violations, cost tracking
 * - Feeds everything into AMC's scoring pipeline
 *
 * Usage:
 *   import { init } from '@amc/instrument';
 *   const amc = init({ apiKey: 'amc_...' });
 *
 * That's it. One line. Everything instrumented.
 */

import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { estimateCost, type NormalizedSpan, type NormalizedTrace } from "../watch/observabilityBridge.js";

/* ── Types ───────────────────────────────────────────────────────── */

export type InstrumentableFramework =
  | "openai"
  | "anthropic"
  | "langchain"
  | "langgraph"
  | "bedrock"
  | "vercel-ai"
  | "groq"
  | "cohere"
  | "google-genai"
  | "mistral";

export interface AMCInitConfig {
  /** AMC API key or bridge token */
  apiKey?: string;
  /** AMC Bridge URL (defaults to localhost) */
  bridgeUrl?: string;
  /** Omit prompt/completion text from traces (privacy mode) */
  redactContent?: boolean;
  /** Tag all traces with a session ID */
  sessionId?: string;
  /** Limit auto-instrumentation to specific frameworks */
  frameworks?: InstrumentableFramework[];
  /** Enable governance enforcement (policy checks on every call) */
  governanceMode?: boolean;
  /** Cost budget in USD — auto-blocks calls when exceeded */
  costBudgetUsd?: number;
  /** Max actions per session — prevents runaway loops */
  maxActions?: number;
  /** Custom metadata to attach to all traces */
  metadata?: Record<string, unknown>;
  /** Callback when a trace completes */
  onTrace?: (trace: NormalizedTrace) => void;
  /** Callback when a governance violation is detected */
  onViolation?: (violation: GovernanceViolation) => void;
  /** Callback when budget is exceeded */
  onBudgetExceeded?: (current: number, budget: number) => void;
}

export interface GovernanceViolation {
  violationId: string;
  type: "budget_exceeded" | "action_limit" | "policy_violation" | "blocked_model" | "blocked_tool" | "content_safety";
  message: string;
  details: Record<string, unknown>;
  ts: number;
}

export interface InstrumentationStats {
  totalCalls: number;
  totalTokens: number;
  totalCostUsd: number;
  totalDurationMs: number;
  callsByFramework: Record<string, number>;
  callsByModel: Record<string, number>;
  errorCount: number;
  violations: GovernanceViolation[];
  instrumentedFrameworks: InstrumentableFramework[];
  sessionId: string;
}

interface PendingSpan {
  spanId: string;
  traceId: string;
  name: string;
  kind: NormalizedSpan["kind"];
  startTimeMs: number;
  model?: string;
  framework: string;
  input?: unknown;
}

/* ── AMC Instrument Instance ─────────────────────────────────────── */

export class AMCInstrument extends EventEmitter {
  private config: Required<AMCInitConfig>;
  private stats: InstrumentationStats;
  private patches: Array<{ framework: string; restore: () => void }> = [];
  private pendingSpans = new Map<string, PendingSpan>();
  private completedTraces: NormalizedTrace[] = [];
  private maxTraceBuffer = 1000;
  private shutdownHandlers: Array<() => void> = [];

  constructor(config: AMCInitConfig) {
    super();
    this.config = {
      apiKey: config.apiKey ?? process.env["AMC_API_KEY"] ?? process.env["AMC_TOKEN"] ?? "",
      bridgeUrl: config.bridgeUrl ?? process.env["AMC_BRIDGE_URL"] ?? "http://127.0.0.1:3212",
      redactContent: config.redactContent ?? false,
      sessionId: config.sessionId ?? randomUUID(),
      frameworks: config.frameworks ?? [],
      governanceMode: config.governanceMode ?? false,
      costBudgetUsd: config.costBudgetUsd ?? Infinity,
      maxActions: config.maxActions ?? Infinity,
      metadata: config.metadata ?? {},
      onTrace: config.onTrace ?? (() => {}),
      onViolation: config.onViolation ?? (() => {}),
      onBudgetExceeded: config.onBudgetExceeded ?? (() => {}),
    };

    this.stats = {
      totalCalls: 0,
      totalTokens: 0,
      totalCostUsd: 0,
      totalDurationMs: 0,
      callsByFramework: {},
      callsByModel: {},
      errorCount: 0,
      violations: [],
      instrumentedFrameworks: [],
      sessionId: this.config.sessionId,
    };
  }

  /** Auto-detect and patch all available frameworks */
  instrument(): AMCInstrument {
    const detectedFrameworks = this.config.frameworks.length > 0
      ? this.config.frameworks
      : this.detectFrameworks();

    for (const fw of detectedFrameworks) {
      try {
        this.instrumentFramework(fw);
        this.stats.instrumentedFrameworks.push(fw);
      } catch {
        // Framework not installed or cannot be patched — skip silently
      }
    }

    // Register shutdown handlers
    this.registerShutdownHandlers();

    this.emit("instrumented", {
      frameworks: this.stats.instrumentedFrameworks,
      sessionId: this.config.sessionId,
    });

    return this;
  }

  /** Remove all patches and clean up */
  uninstrument(): void {
    for (const patch of this.patches) {
      try {
        patch.restore();
      } catch {
        // Best effort
      }
    }
    this.patches = [];

    for (const handler of this.shutdownHandlers) {
      handler();
    }
    this.shutdownHandlers = [];

    this.emit("uninstrumented", { sessionId: this.config.sessionId });
  }

  /** Flush pending traces (call before process exit in scripts) */
  async shutdown(): Promise<void> {
    this.uninstrument();
    // Flush any pending bridge data
    if (this.config.bridgeUrl && this.config.apiKey) {
      try {
        await this.flushToBridge();
      } catch {
        // Best effort
      }
    }
  }

  /** Manually track a named operation (like Visibe's track()) */
  track<T>(name: string, fn: () => T | Promise<T>): Promise<T> {
    const traceId = randomUUID();
    const startTime = Date.now();

    const wrapResult = (result: T): T => {
      const endTime = Date.now();
      const trace: NormalizedTrace = {
        traceId,
        sessionId: this.config.sessionId,
        name,
        startTimeMs: startTime,
        endTimeMs: endTime,
        durationMs: endTime - startTime,
        status: "ok",
        spans: [],
        totalTokens: 0,
        totalCostUsd: 0,
        modelBreakdown: {},
        errorCount: 0,
        toolCallCount: 0,
        llmCallCount: 0,
        metadata: this.config.metadata,
      };
      this.recordTrace(trace);
      return result;
    };

    const wrapError = (err: unknown): never => {
      const endTime = Date.now();
      const trace: NormalizedTrace = {
        traceId,
        sessionId: this.config.sessionId,
        name,
        startTimeMs: startTime,
        endTimeMs: endTime,
        durationMs: endTime - startTime,
        status: "error",
        spans: [],
        totalTokens: 0,
        totalCostUsd: 0,
        modelBreakdown: {},
        errorCount: 1,
        toolCallCount: 0,
        llmCallCount: 0,
        metadata: this.config.metadata,
      };
      this.recordTrace(trace);
      throw err;
    };

    try {
      const result = fn();
      if (result instanceof Promise) {
        return result.then(wrapResult).catch(wrapError);
      }
      return Promise.resolve(wrapResult(result));
    } catch (err) {
      return wrapError(err);
    }
  }

  /** Get current instrumentation statistics */
  getStats(): InstrumentationStats {
    return { ...this.stats };
  }

  /** Get completed traces */
  getTraces(limit?: number): NormalizedTrace[] {
    return this.completedTraces.slice(-(limit ?? 100));
  }

  /* ── Framework detection ──────────────────────────────────────── */

  private detectFrameworks(): InstrumentableFramework[] {
    const detected: InstrumentableFramework[] = [];
    const tryRequire = (name: string) => {
      try { require.resolve(name); return true; } catch { return false; }
    };

    if (tryRequire("openai")) detected.push("openai");
    if (tryRequire("@anthropic-ai/sdk")) detected.push("anthropic");
    if (tryRequire("@langchain/core")) detected.push("langchain");
    if (tryRequire("@langchain/langgraph")) detected.push("langgraph");
    if (tryRequire("@aws-sdk/client-bedrock-runtime")) detected.push("bedrock");
    if (tryRequire("ai")) detected.push("vercel-ai");
    if (tryRequire("groq-sdk")) detected.push("groq");
    if (tryRequire("cohere-ai")) detected.push("cohere");
    if (tryRequire("@google/generative-ai")) detected.push("google-genai");
    if (tryRequire("@mistralai/mistralai")) detected.push("mistral");

    return detected;
  }

  /* ── Framework-specific patching ──────────────────────────────── */

  private instrumentFramework(fw: InstrumentableFramework): void {
    switch (fw) {
      case "openai": return this.patchOpenAI();
      case "anthropic": return this.patchAnthropic();
      case "langchain": return this.patchLangChain();
      case "langgraph": return this.patchLangGraph();
      case "bedrock": return this.patchBedrock();
      case "vercel-ai": return this.patchVercelAI();
      case "groq": return this.patchGroq();
      case "cohere": return this.patchCohere();
      case "google-genai": return this.patchGoogleGenAI();
      case "mistral": return this.patchMistral();
    }
  }

  private patchOpenAI(): void {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const openai = require("openai");
    const originalCreate = openai.OpenAI.prototype?.chat?.completions?.create;
    if (!originalCreate) {
      // Patch at constructor level
      const OriginalOpenAI = openai.OpenAI;
      const self = this;
      const PatchedOpenAI = function(this: Record<string, unknown>, ...args: unknown[]) {
        const instance = new OriginalOpenAI(...args);
        self.wrapChatCompletions(instance, "openai");
        return instance;
      };
      PatchedOpenAI.prototype = OriginalOpenAI.prototype;
      Object.assign(PatchedOpenAI, OriginalOpenAI);
      openai.OpenAI = PatchedOpenAI;
      this.patches.push({ framework: "openai", restore: () => { openai.OpenAI = OriginalOpenAI; } });
    } else {
      this.patches.push({ framework: "openai", restore: () => {} });
    }
  }

  private patchAnthropic(): void {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const anthropic = require("@anthropic-ai/sdk");
    const OriginalAnthropic = anthropic.Anthropic ?? anthropic.default;
    if (!OriginalAnthropic) return;
    const self = this;

    const PatchedAnthropic = function(this: Record<string, unknown>, ...args: unknown[]) {
      const instance = new OriginalAnthropic(...args);
      self.wrapMessages(instance, "anthropic");
      return instance;
    };
    PatchedAnthropic.prototype = OriginalAnthropic.prototype;
    Object.assign(PatchedAnthropic, OriginalAnthropic);

    if (anthropic.Anthropic) {
      anthropic.Anthropic = PatchedAnthropic;
      this.patches.push({ framework: "anthropic", restore: () => { anthropic.Anthropic = OriginalAnthropic; } });
    } else {
      anthropic.default = PatchedAnthropic;
      this.patches.push({ framework: "anthropic", restore: () => { anthropic.default = OriginalAnthropic; } });
    }
  }

  private patchLangChain(): void {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const core = require("@langchain/core/language_models/chat_models");
      const originalInvoke = core.BaseChatModel?.prototype?.invoke;
      if (!originalInvoke) return;

      const self = this;
      core.BaseChatModel.prototype.invoke = async function(input: unknown, options: unknown) {
        const span = self.startSpan("langchain.invoke", "llm_call", "langchain");
        try {
          const result = await originalInvoke.call(this, input, options);
          self.endSpan(span.spanId, result, this.modelName);
          return result;
        } catch (err) {
          self.endSpanError(span.spanId, err);
          throw err;
        }
      };

      this.patches.push({
        framework: "langchain",
        restore: () => { core.BaseChatModel.prototype.invoke = originalInvoke; },
      });
    } catch {
      // Module structure may vary
    }
  }

  private patchLangGraph(): void {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const langgraph = require("@langchain/langgraph");
      const CompiledGraph = langgraph.CompiledStateGraph ?? langgraph.CompiledGraph;
      if (!CompiledGraph?.prototype?.invoke) return;

      const originalInvoke = CompiledGraph.prototype.invoke;
      const self = this;

      CompiledGraph.prototype.invoke = async function(input: unknown, config: unknown) {
        const span = self.startSpan("langgraph.invoke", "chain", "langgraph");
        try {
          const result = await originalInvoke.call(this, input, config);
          self.endSpan(span.spanId, result);
          return result;
        } catch (err) {
          self.endSpanError(span.spanId, err);
          throw err;
        }
      };

      this.patches.push({
        framework: "langgraph",
        restore: () => { CompiledGraph.prototype.invoke = originalInvoke; },
      });
    } catch {
      // Module not installed
    }
  }

  private patchBedrock(): void {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const bedrock = require("@aws-sdk/client-bedrock-runtime");
      const OriginalClient = bedrock.BedrockRuntimeClient;
      if (!OriginalClient?.prototype?.send) return;

      const originalSend = OriginalClient.prototype.send;
      const self = this;

      OriginalClient.prototype.send = async function(command: unknown, ...args: unknown[]) {
        const cmdName = (command as Record<string, unknown>)?.constructor?.name ?? "unknown";
        const span = self.startSpan(`bedrock.${cmdName}`, "llm_call", "bedrock");
        try {
          const result = await originalSend.call(this, command, ...args);
          const body = (result as Record<string, unknown>)?.body;
          const cmdInput = (command as Record<string, Record<string, unknown>>)?.input;
          const model = cmdInput?.modelId as string | undefined;
          self.endSpan(span.spanId, body, model);
          return result;
        } catch (err) {
          self.endSpanError(span.spanId, err);
          throw err;
        }
      };

      this.patches.push({
        framework: "bedrock",
        restore: () => { OriginalClient.prototype.send = originalSend; },
      });
    } catch {
      // Module not installed
    }
  }

  private patchVercelAI(): void {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const ai = require("ai");
      const originalGenerateText = ai.generateText;
      const originalStreamText = ai.streamText;
      const self = this;

      if (originalGenerateText) {
        ai.generateText = async function(params: unknown) {
          const span = self.startSpan("vercel-ai.generateText", "llm_call", "vercel-ai");
          try {
            const result = await originalGenerateText(params);
            const model = (params as Record<string, unknown>)?.model;
            self.endSpan(span.spanId, result, typeof model === "string" ? model : undefined);
            return result;
          } catch (err) {
            self.endSpanError(span.spanId, err);
            throw err;
          }
        };
      }

      this.patches.push({
        framework: "vercel-ai",
        restore: () => {
          if (originalGenerateText) ai.generateText = originalGenerateText;
          if (originalStreamText) ai.streamText = originalStreamText;
        },
      });
    } catch {
      // Module not installed
    }
  }

  private patchGroq(): void {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const groq = require("groq-sdk");
      const OriginalGroq = groq.Groq ?? groq.default;
      if (!OriginalGroq) return;

      const self = this;
      const PatchedGroq = function(this: Record<string, unknown>, ...args: unknown[]) {
        const instance = new OriginalGroq(...args);
        self.wrapChatCompletions(instance, "groq");
        return instance;
      };
      PatchedGroq.prototype = OriginalGroq.prototype;
      Object.assign(PatchedGroq, OriginalGroq);

      if (groq.Groq) {
        groq.Groq = PatchedGroq;
        this.patches.push({ framework: "groq", restore: () => { groq.Groq = OriginalGroq; } });
      } else {
        groq.default = PatchedGroq;
        this.patches.push({ framework: "groq", restore: () => { groq.default = OriginalGroq; } });
      }
    } catch {
      // Module not installed
    }
  }

  private patchCohere(): void {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const cohere = require("cohere-ai");
      const CohereClient = cohere.CohereClient ?? cohere.CohereClientV2;
      if (!CohereClient?.prototype?.chat) return;

      const originalChat = CohereClient.prototype.chat;
      const self = this;

      CohereClient.prototype.chat = async function(params: unknown) {
        const span = self.startSpan("cohere.chat", "llm_call", "cohere");
        try {
          const result = await originalChat.call(this, params);
          const model = (params as Record<string, unknown>)?.model as string | undefined;
          self.endSpan(span.spanId, result, model ?? "command-r");
          return result;
        } catch (err) {
          self.endSpanError(span.spanId, err);
          throw err;
        }
      };

      this.patches.push({
        framework: "cohere",
        restore: () => { CohereClient.prototype.chat = originalChat; },
      });
    } catch {
      // Module not installed
    }
  }

  private patchGoogleGenAI(): void {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const genai = require("@google/generative-ai");
      const GenerativeModel = genai.GenerativeModel;
      if (!GenerativeModel?.prototype?.generateContent) return;

      const originalGenerate = GenerativeModel.prototype.generateContent;
      const self = this;

      GenerativeModel.prototype.generateContent = async function(request: unknown) {
        const span = self.startSpan("google.generateContent", "llm_call", "google-genai");
        try {
          const result = await originalGenerate.call(this, request);
          self.endSpan(span.spanId, result, this.model);
          return result;
        } catch (err) {
          self.endSpanError(span.spanId, err);
          throw err;
        }
      };

      this.patches.push({
        framework: "google-genai",
        restore: () => { GenerativeModel.prototype.generateContent = originalGenerate; },
      });
    } catch {
      // Module not installed
    }
  }

  private patchMistral(): void {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mistral = require("@mistralai/mistralai");
      const MistralClient = mistral.Mistral ?? mistral.default;
      if (!MistralClient) return;

      const self = this;
      const OriginalClient = MistralClient;
      const PatchedClient = function(this: Record<string, unknown>, ...args: unknown[]) {
        const instance = new OriginalClient(...args);
        if (instance.chat?.complete) {
          const originalComplete = instance.chat.complete.bind(instance.chat);
          instance.chat.complete = async (params: unknown) => {
            const span = self.startSpan("mistral.chat.complete", "llm_call", "mistral");
            try {
              const result = await originalComplete(params);
              const model = (params as Record<string, unknown>)?.model as string | undefined;
              self.endSpan(span.spanId, result, model);
              return result;
            } catch (err) {
              self.endSpanError(span.spanId, err);
              throw err;
            }
          };
        }
        return instance;
      };
      PatchedClient.prototype = OriginalClient.prototype;
      Object.assign(PatchedClient, OriginalClient);

      if (mistral.Mistral) {
        mistral.Mistral = PatchedClient;
        this.patches.push({ framework: "mistral", restore: () => { mistral.Mistral = OriginalClient; } });
      }
    } catch {
      // Module not installed
    }
  }

  /* ── Generic wrappers for OpenAI-compatible APIs ──────────────── */

  private wrapChatCompletions(instance: Record<string, unknown>, framework: string): void {
    const chat = instance.chat as Record<string, unknown> | undefined;
    if (!chat?.completions) return;

    const completions = chat.completions as Record<string, unknown>;
    const originalCreate = completions.create as (...args: unknown[]) => Promise<unknown>;
    if (typeof originalCreate !== "function") return;

    const self = this;
    completions.create = async function(params: unknown, ...rest: unknown[]) {
      // Governance check
      const model = (params as Record<string, unknown>)?.model as string | undefined;
      self.checkGovernance(model, framework);

      const span = self.startSpan(`${framework}.chat.completions.create`, "llm_call", framework, model,
        self.config.redactContent ? undefined : params);

      try {
        const result = await originalCreate.call(this, params, ...rest);
        self.endSpan(span.spanId, self.config.redactContent ? undefined : result, model);
        return result;
      } catch (err) {
        self.endSpanError(span.spanId, err);
        throw err;
      }
    };
  }

  private wrapMessages(instance: Record<string, unknown>, framework: string): void {
    const messages = instance.messages as Record<string, unknown> | undefined;
    if (!messages?.create) return;

    const originalCreate = messages.create as (...args: unknown[]) => Promise<unknown>;
    if (typeof originalCreate !== "function") return;

    const self = this;
    messages.create = async function(params: unknown, ...rest: unknown[]) {
      const model = (params as Record<string, unknown>)?.model as string | undefined;
      self.checkGovernance(model, framework);

      const span = self.startSpan(`${framework}.messages.create`, "llm_call", framework, model,
        self.config.redactContent ? undefined : params);

      try {
        const result = await originalCreate.call(this, params, ...rest);
        self.endSpan(span.spanId, self.config.redactContent ? undefined : result, model);
        return result;
      } catch (err) {
        self.endSpanError(span.spanId, err);
        throw err;
      }
    };
  }

  /* ── Span management ──────────────────────────────────────────── */

  private startSpan(name: string, kind: NormalizedSpan["kind"], framework: string, model?: string, input?: unknown): PendingSpan {
    const span: PendingSpan = {
      spanId: randomUUID(),
      traceId: randomUUID(),
      name,
      kind,
      startTimeMs: Date.now(),
      model,
      framework,
      input,
    };
    this.pendingSpans.set(span.spanId, span);
    return span;
  }

  private endSpan(spanId: string, output: unknown, model?: string): void {
    const pending = this.pendingSpans.get(spanId);
    if (!pending) return;
    this.pendingSpans.delete(spanId);

    const endTimeMs = Date.now();
    const durationMs = endTimeMs - pending.startTimeMs;

    // Extract token usage from response
    const tokens = extractTokenUsage(output);
    const resolvedModel = model ?? pending.model;
    const cost = estimateCost(resolvedModel, { prompt: tokens.prompt, completion: tokens.completion });

    const span: NormalizedSpan = {
      spanId: pending.spanId,
      traceId: pending.traceId,
      name: pending.name,
      kind: pending.kind,
      startTimeMs: pending.startTimeMs,
      endTimeMs,
      durationMs,
      status: "ok",
      model: resolvedModel,
      provider: pending.framework,
      tokenUsage: tokens.total > 0 ? tokens : undefined,
      costUsd: cost,
      input: pending.input,
      output: this.config.redactContent ? undefined : output,
    };

    const trace: NormalizedTrace = {
      traceId: pending.traceId,
      sessionId: this.config.sessionId,
      name: pending.name,
      startTimeMs: pending.startTimeMs,
      endTimeMs,
      durationMs,
      status: "ok",
      spans: [span],
      totalTokens: tokens.total,
      totalCostUsd: cost,
      modelBreakdown: resolvedModel ? { [resolvedModel]: { tokens: tokens.total, costUsd: cost, calls: 1 } } : {},
      errorCount: 0,
      toolCallCount: pending.kind === "tool_call" ? 1 : 0,
      llmCallCount: pending.kind === "llm_call" ? 1 : 0,
      metadata: this.config.metadata,
    };

    this.recordTrace(trace);
    this.updateStats(pending.framework, resolvedModel, tokens, cost, durationMs, false);
  }

  private endSpanError(spanId: string, err: unknown): void {
    const pending = this.pendingSpans.get(spanId);
    if (!pending) return;
    this.pendingSpans.delete(spanId);

    const endTimeMs = Date.now();
    const durationMs = endTimeMs - pending.startTimeMs;
    const errMsg = err instanceof Error ? err.message : String(err);

    const span: NormalizedSpan = {
      spanId: pending.spanId,
      traceId: pending.traceId,
      name: pending.name,
      kind: pending.kind,
      startTimeMs: pending.startTimeMs,
      endTimeMs,
      durationMs,
      status: "error",
      model: pending.model,
      provider: pending.framework,
      error: { type: err instanceof Error ? err.constructor.name : "Error", message: errMsg },
    };

    const trace: NormalizedTrace = {
      traceId: pending.traceId,
      sessionId: this.config.sessionId,
      name: pending.name,
      startTimeMs: pending.startTimeMs,
      endTimeMs,
      durationMs,
      status: "error",
      spans: [span],
      totalTokens: 0,
      totalCostUsd: 0,
      modelBreakdown: {},
      errorCount: 1,
      toolCallCount: 0,
      llmCallCount: pending.kind === "llm_call" ? 1 : 0,
      metadata: this.config.metadata,
    };

    this.recordTrace(trace);
    this.updateStats(pending.framework, pending.model, { prompt: 0, completion: 0, total: 0 }, 0, durationMs, true);
  }

  /* ── Governance ────────────────────────────────────────────────── */

  private checkGovernance(model: string | undefined, framework: string): void {
    if (!this.config.governanceMode) return;

    // Budget check
    if (this.stats.totalCostUsd >= this.config.costBudgetUsd) {
      const violation: GovernanceViolation = {
        violationId: randomUUID(),
        type: "budget_exceeded",
        message: `Cost budget exceeded: $${this.stats.totalCostUsd.toFixed(4)} >= $${this.config.costBudgetUsd.toFixed(2)}`,
        details: { currentCost: this.stats.totalCostUsd, budget: this.config.costBudgetUsd },
        ts: Date.now(),
      };
      this.stats.violations.push(violation);
      this.config.onViolation(violation);
      this.config.onBudgetExceeded(this.stats.totalCostUsd, this.config.costBudgetUsd);
      this.emit("violation", violation);
      throw new Error(`AMC Governance: Budget exceeded ($${this.stats.totalCostUsd.toFixed(4)} / $${this.config.costBudgetUsd.toFixed(2)})`);
    }

    // Action limit check
    if (this.stats.totalCalls >= this.config.maxActions) {
      const violation: GovernanceViolation = {
        violationId: randomUUID(),
        type: "action_limit",
        message: `Action limit reached: ${this.stats.totalCalls} >= ${this.config.maxActions}`,
        details: { totalCalls: this.stats.totalCalls, maxActions: this.config.maxActions },
        ts: Date.now(),
      };
      this.stats.violations.push(violation);
      this.config.onViolation(violation);
      this.emit("violation", violation);
      throw new Error(`AMC Governance: Action limit reached (${this.stats.totalCalls} / ${this.config.maxActions})`);
    }
  }

  /* ── Internal helpers ──────────────────────────────────────────── */

  private recordTrace(trace: NormalizedTrace): void {
    this.completedTraces.push(trace);
    if (this.completedTraces.length > this.maxTraceBuffer) {
      this.completedTraces = this.completedTraces.slice(-this.maxTraceBuffer);
    }
    this.config.onTrace(trace);
    this.emit("trace", trace);
  }

  private updateStats(
    framework: string,
    model: string | undefined,
    tokens: { prompt: number; completion: number; total: number },
    cost: number,
    durationMs: number,
    isError: boolean,
  ): void {
    this.stats.totalCalls++;
    this.stats.totalTokens += tokens.total;
    this.stats.totalCostUsd += cost;
    this.stats.totalDurationMs += durationMs;
    this.stats.callsByFramework[framework] = (this.stats.callsByFramework[framework] ?? 0) + 1;
    if (model) {
      this.stats.callsByModel[model] = (this.stats.callsByModel[model] ?? 0) + 1;
    }
    if (isError) this.stats.errorCount++;
  }

  private registerShutdownHandlers(): void {
    const handler = () => {
      this.uninstrument();
    };

    process.on("SIGTERM", handler);
    process.on("SIGINT", handler);
    process.on("beforeExit", handler);

    this.shutdownHandlers.push(
      () => process.removeListener("SIGTERM", handler),
      () => process.removeListener("SIGINT", handler),
      () => process.removeListener("beforeExit", handler),
    );
  }

  private async flushToBridge(): Promise<void> {
    // Send collected traces to AMC Bridge
    if (this.completedTraces.length === 0) return;

    try {
      const { request: httpReq } = await import("node:http");
      const { request: httpsReq } = await import("node:https");
      const url = new URL(`${this.config.bridgeUrl}/api/v1/traces/ingest`);
      const reqFn = url.protocol === "https:" ? httpsReq : httpReq;
      const body = JSON.stringify({
        sessionId: this.config.sessionId,
        traces: this.completedTraces.slice(-100), // Last 100
        stats: this.stats,
      });

      await new Promise<void>((resolve, reject) => {
        const req = reqFn(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.config.apiKey}`,
            "Content-Length": Buffer.byteLength(body).toString(),
          },
          timeout: 5000,
        }, (res) => {
          res.resume();
          res.on("end", () => resolve());
        });
        req.on("error", reject);
        req.write(body);
        req.end();
      });
    } catch {
      // Best effort flush
    }
  }
}

/* ── Public API ───────────────────────────────────────────────────── */

/** One-line initialization — the AMC answer to Visibe's init() */
export function init(config?: AMCInitConfig): AMCInstrument {
  const instrument = new AMCInstrument(config ?? {});
  return instrument.instrument();
}

/** Manually instrument a specific client (like Visibe's instrument()) */
export function instrument(client: unknown, framework: InstrumentableFramework): AMCInstrument {
  const inst = new AMCInstrument({ frameworks: [framework] });
  return inst.instrument();
}

/* ── Token extraction helpers ────────────────────────────────────── */

function extractTokenUsage(response: unknown): { prompt: number; completion: number; total: number } {
  if (!response || typeof response !== "object") return { prompt: 0, completion: 0, total: 0 };

  const r = response as Record<string, unknown>;

  // OpenAI format
  const usage = r.usage as Record<string, unknown> | undefined;
  if (usage) {
    const prompt = Number(usage.prompt_tokens ?? usage.input_tokens ?? 0);
    const completion = Number(usage.completion_tokens ?? usage.output_tokens ?? 0);
    return { prompt, completion, total: prompt + completion };
  }

  // Anthropic format
  if (r.content && r.model) {
    const u = r.usage as Record<string, unknown> | undefined;
    if (u) {
      const prompt = Number(u.input_tokens ?? 0);
      const completion = Number(u.output_tokens ?? 0);
      return { prompt, completion, total: prompt + completion };
    }
  }

  // Google format
  const usageMetadata = r.usageMetadata as Record<string, unknown> | undefined;
  if (usageMetadata) {
    const prompt = Number(usageMetadata.promptTokenCount ?? 0);
    const completion = Number(usageMetadata.candidatesTokenCount ?? 0);
    return { prompt, completion, total: prompt + completion };
  }

  return { prompt: 0, completion: 0, total: 0 };
}
