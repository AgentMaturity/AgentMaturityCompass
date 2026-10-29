import { measuredUsage } from "../budgets/nativeBudgetUsage.js";
import type { NormalizedSpan, NormalizedTrace } from "./observabilityBridge.js";

/* ── Model cost lookup (real pricing as of March 2026) ───────────── */

const MODEL_COSTS_PER_1K: Record<string, { input: number; output: number }> = {
  "gpt-4o": { input: 0.0025, output: 0.01 },
  "gpt-4o-mini": { input: 0.00015, output: 0.0006 },
  "gpt-4-turbo": { input: 0.01, output: 0.03 },
  "gpt-4": { input: 0.03, output: 0.06 },
  "gpt-3.5-turbo": { input: 0.0005, output: 0.0015 },
  "claude-opus-4": { input: 0.015, output: 0.075 },
  "claude-sonnet-4": { input: 0.003, output: 0.015 },
  "claude-haiku-3.5": { input: 0.0008, output: 0.004 },
  "claude-3-opus": { input: 0.015, output: 0.075 },
  "claude-3-sonnet": { input: 0.003, output: 0.015 },
  "claude-3-haiku": { input: 0.00025, output: 0.00125 },
  "gemini-2.0-flash": { input: 0.0001, output: 0.0004 },
  "gemini-1.5-pro": { input: 0.00125, output: 0.005 },
  "gemini-1.5-flash": { input: 0.000075, output: 0.0003 },
  "command-r-plus": { input: 0.003, output: 0.015 },
  "command-r": { input: 0.0005, output: 0.0015 },
  "llama-3.1-70b": { input: 0.00059, output: 0.00079 },
  "llama-3.1-8b": { input: 0.00006, output: 0.00006 },
  "mistral-large": { input: 0.002, output: 0.006 },
  "mixtral-8x7b": { input: 0.0006, output: 0.0006 },
};

export function estimateCost(model: string | undefined, tokens: { prompt: number; completion: number }): number {
  if (!model) return 0;
  const normalizedModel = model.toLowerCase().replace(/[-_]/g, "-");
  for (const [key, costs] of Object.entries(MODEL_COSTS_PER_1K)) {
    if (normalizedModel.includes(key)) {
      return (tokens.prompt / 1000) * costs.input + (tokens.completion / 1000) * costs.output;
    }
  }
  // Fallback: assume mid-range pricing
  return ((tokens.prompt + tokens.completion) / 1000) * 0.002;
}

export function normalizeSpanUsage(model: string | undefined, input: number | undefined, output: number | undefined,
  total: number | undefined, cost: number | undefined): Pick<NormalizedSpan, "tokenUsage" | "reportedTotalTokens" | "costUsd" | "costSource"> {
  const usage = measuredUsage({ input_tokens: input, output_tokens: output, total_tokens: total, costUsd: cost }, false);
  const components = measuredUsage({ input_tokens: input, output_tokens: output }, false);
  const estimated = !usage.costKnown && model !== undefined && components.tokensKnown;
  return {
    tokenUsage: usage.tokensKnown && components.tokensKnown ? { prompt: input!, completion: output!, total: usage.tokens } : undefined,
    reportedTotalTokens: usage.tokensKnown && !components.tokensKnown ? usage.tokens : undefined,
    costUsd: usage.costKnown ? usage.cost : estimated ? estimateCost(model, { prompt: input!, completion: output! }) : undefined,
    costSource: usage.costKnown ? "reported" : estimated ? "estimated" : "unknown",
  };
}

export function attributeUsage(model: string | undefined, attrs: Record<string, string | undefined>): Pick<NormalizedSpan, "tokenUsage" | "reportedTotalTokens" | "costUsd" | "costSource"> {
  const numeric = (...keys: string[]): number | undefined => {
    const value = keys.map(key => attrs[key]).find(value => value !== undefined);
    return value === undefined || value.trim() === "" ? undefined : Number(value);
  };
  return normalizeSpanUsage(model,
    numeric("gen_ai.usage.input_tokens", "gen_ai.usage.prompt_tokens", "llm.token_count.prompt"),
    numeric("gen_ai.usage.output_tokens", "gen_ai.usage.completion_tokens", "llm.token_count.completion"),
    numeric("gen_ai.usage.total_tokens", "llm.token_count.total"), numeric("gen_ai.usage.cost", "llm.cost"));
}

export function buildTrace(traceId: string, spans: NormalizedSpan[], sessionId?: string, name?: string): NormalizedTrace {
  const identity = (span: NormalizedSpan, spanId = span.spanId): string => JSON.stringify([span.traceId, spanId]);
  spans = [...new Map(spans.map(span => [identity(span), span])).values()];
  const byId = new Map(spans.map(span => [identity(span), span]));
  const usage = new Map(spans.map(span => [identity(span), measuredUsage({
    total_tokens: span.tokenUsage?.total ?? span.reportedTotalTokens, input_tokens: span.tokenUsage?.prompt,
    output_tokens: span.tokenUsage?.completion, costUsd: span.costUsd,
  }, false)]));
  const aggregateParents = new Set<string>();
  for (const span of spans) {
    const measured = usage.get(identity(span))!;
    if (!measured.tokensKnown && !measured.costKnown) continue;
    const seen = new Set([identity(span)]);
    let parent = span.parentSpanId ? byId.get(identity(span, span.parentSpanId)) : undefined;
    while (parent && !seen.has(identity(parent)) && !aggregateParents.has(identity(parent))) {
      aggregateParents.add(identity(parent));
      seen.add(identity(parent));
      parent = parent.parentSpanId ? byId.get(identity(parent, parent.parentSpanId)) : undefined;
    }
  }
  spans = spans.map(span => ({ ...span, costUsd: usage.get(identity(span))!.costKnown ? span.costUsd : undefined,
    costSource: usage.get(identity(span))!.costKnown ? span.costSource ?? "reported" : "unknown" }));
  if (spans.length === 0) {
    return {
      traceId, sessionId, name, startTimeMs: 0, endTimeMs: 0, durationMs: 0,
      status: "unknown", spans: [], totalTokens: 0, totalCostUsd: 0,
      modelBreakdown: {}, tokenUsageComplete: false, costUsageComplete: false, errorCount: 0, toolCallCount: 0, llmCallCount: 0,
    };
  }

  const startTimeMs = Math.min(...spans.map((s) => s.startTimeMs));
  const endTimeMs = Math.max(...spans.map((s) => s.endTimeMs));
  const modelBreakdown: Record<string, { tokens: number; costUsd: number; calls: number }> = {};
  let totalTokens = 0;
  let totalCost = 0;
  let errorCount = 0;
  let toolCallCount = 0;
  let llmCallCount = 0;
  let usageSpanCount = 0;
  let tokenUsageComplete = true;
  let costUsageComplete = true;

  for (const span of spans) {
    if (span.status === "error") errorCount++;
    if (span.kind === "tool_call") toolCallCount++;
    if (span.kind === "llm_call") llmCallCount++;

    if (aggregateParents.has(identity(span))) continue;
    const measured = usage.get(identity(span))!;
    if (span.kind !== "llm_call" && !measured.tokensKnown && !measured.costKnown) continue;
    usageSpanCount++;
    totalTokens += measured.tokens;
    totalCost += measured.cost;
    tokenUsageComplete &&= measured.tokensKnown;
    costUsageComplete &&= measured.costKnown;
    if (span.model) {
      const key = span.model;
      if (!modelBreakdown[key]) modelBreakdown[key] = { tokens: 0, costUsd: 0, calls: 0 };
      modelBreakdown[key]!.tokens += measured.tokens;
      modelBreakdown[key]!.costUsd += measured.cost;
      modelBreakdown[key]!.calls += 1;
    }
  }

  const hasError = spans.some((s) => s.status === "error");

  return {
    traceId,
    sessionId,
    name,
    startTimeMs,
    endTimeMs,
    durationMs: endTimeMs - startTimeMs,
    status: hasError ? "error" : "ok",
    spans,
    totalTokens,
    totalCostUsd: totalCost,
    tokenUsageComplete: usageSpanCount > 0 && tokenUsageComplete,
    costUsageComplete: usageSpanCount > 0 && costUsageComplete,
    modelBreakdown,
    errorCount,
    toolCallCount,
    llmCallCount,
  };
}

