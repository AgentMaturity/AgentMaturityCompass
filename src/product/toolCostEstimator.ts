import { MODEL_PRICING as SHARED_MODEL_PRICING } from './modelPricing.js';
/**
 * toolCostEstimator.ts — Model-specific pricing registry with batch
 * cost estimation and budget tracking.
 */

export interface CostEstimate {
  toolName: string;
  estimatedTokens: number;
  estimatedCost: number;
  currency: 'USD';
  model?: string;
}

export interface ModelPricing {
  model: string;
  inputPer1kTokens: number;
  outputPer1kTokens: number;
  contextWindow: number;
}

export interface BatchCostEstimate {
  totalTokens: number;
  totalCost: number;
  currency: 'USD';
  breakdown: CostEstimate[];
  budgetRemaining?: number;
}

/* ── Model pricing registry ──────────────────────────────────────── */

// Pricing comes from the shared table; a second copy previously disagreed with
// costLatencyRouter about the same model. See ./modelPricing.ts.
const MODEL_PRICING: Record<string, ModelPricing> = SHARED_MODEL_PRICING;

const customPricing = new Map<string, ModelPricing>();

export function registerModelPricing(pricing: ModelPricing): void {
  customPricing.set(pricing.model, pricing);
}

export function getModelPricing(model: string): ModelPricing | undefined {
  return customPricing.get(model) ?? MODEL_PRICING[model];
}

export function listModels(): string[] {
  return [...new Set([...Object.keys(MODEL_PRICING), ...customPricing.keys()])];
}

/* ── Tool cost table ─────────────────────────────────────────────── */

const TOOL_COST_TABLE: Record<string, { tokensPerCall: number; costPer1kTokens: number }> = {
  'web_search': { tokensPerCall: 500, costPer1kTokens: 0.002 },
  'web_fetch': { tokensPerCall: 2000, costPer1kTokens: 0.002 },
  'code_interpreter': { tokensPerCall: 1000, costPer1kTokens: 0.003 },
  'image_generation': { tokensPerCall: 1500, costPer1kTokens: 0.02 },
  'embedding': { tokensPerCall: 300, costPer1kTokens: 0.0001 },
};

const DEFAULT_TOOL_COST = { tokensPerCall: 500, costPer1kTokens: 0.003 };

/* ── Single estimate ─────────────────────────────────────────────── */

export function estimateCost(toolName: string, args: Record<string, unknown>, model?: string): CostEstimate {
  const argSize = JSON.stringify(args).length;
  const argTokens = Math.ceil(argSize / 4);

  if (model) {
    const pricing = getModelPricing(model);
    if (pricing) {
      const estimatedTokens = argTokens + 100; // base overhead
      const inputCost = (argTokens / 1000) * pricing.inputPer1kTokens;
      const outputCost = (100 / 1000) * pricing.outputPer1kTokens;
      return { toolName, estimatedTokens, estimatedCost: inputCost + outputCost, currency: 'USD', model };
    }
  }

  const info = TOOL_COST_TABLE[toolName] ?? DEFAULT_TOOL_COST;
  const estimatedTokens = info.tokensPerCall + argTokens;
  const estimatedCost = (estimatedTokens / 1000) * info.costPer1kTokens;
  return { toolName, estimatedTokens, estimatedCost, currency: 'USD', model };
}

/* ── Batch estimate ──────────────────────────────────────────────── */

export function estimateBatchCost(
  calls: Array<{ toolName: string; args: Record<string, unknown> }>,
  model?: string,
  budget?: number,
): BatchCostEstimate {
  const breakdown = calls.map(c => estimateCost(c.toolName, c.args, model));
  const totalTokens = breakdown.reduce((s, e) => s + e.estimatedTokens, 0);
  const totalCost = breakdown.reduce((s, e) => s + e.estimatedCost, 0);
  return {
    totalTokens,
    totalCost,
    currency: 'USD',
    breakdown,
    budgetRemaining: budget !== undefined ? budget - totalCost : undefined,
  };
}

/* ── Cost comparison across models ───────────────────────────────── */

export function compareModelCosts(
  calls: Array<{ toolName: string; args: Record<string, unknown> }>,
  models: string[],
): Record<string, { totalCost: number; totalTokens: number }> {
  const result: Record<string, { totalCost: number; totalTokens: number }> = {};
  for (const model of models) {
    const est = estimateBatchCost(calls, model);
    result[model] = { totalCost: est.totalCost, totalTokens: est.totalTokens };
  }
  return result;
}
