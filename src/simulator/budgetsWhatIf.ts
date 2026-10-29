import { budgetForAgent, evaluateBudgetStatus, loadBudgetsConfig } from "../budgets/budgets.js";
import { resolveAgentId } from "../fleet/paths.js";

export function predictBudgetPressure(params: {
  workspace: string;
  agentId?: string;
}): {
  budgetConfigured: boolean;
  signatureValid: boolean;
  daily: {
    llmRequests: { used: number; limit: number; ratio: number };
    llmTokens: { used: number; limit: number; ratio: number };
    llmCostUsd: { used: number; limit: number | null; ratio: number | null };
  };
  perMinute: {
    llmRequests: { used: number; limit: number; ratio: number };
    llmTokens: { used: number; limit: number; ratio: number };
  };
  exceeded: boolean;
  reasons: string[];
} {
  const agentId = resolveAgentId(params.workspace, params.agentId);
  const status = evaluateBudgetStatus(params.workspace, agentId);
  let budgetConfigured = false;
  let dailyRequestsLimit = 0;
  let dailyTokensLimit = 0;
  let dailyCostLimit: number | null = null;
  let minuteRequestsLimit = 0;
  let minuteTokensLimit = 0;
  try {
    const config = loadBudgetsConfig(params.workspace);
    const budget = budgetForAgent(config, agentId);
    if (budget) {
      budgetConfigured = true;
      dailyRequestsLimit = budget.daily.maxLlmRequests;
      dailyTokensLimit = budget.daily.maxLlmTokens;
      dailyCostLimit = budget.daily.maxCostUsd ?? null;
      minuteRequestsLimit = budget.perMinute.maxLlmRequests;
      minuteTokensLimit = budget.perMinute.maxLlmTokens;
    }
  } catch {
    // keep defaults
  }

  const ratio = (used: number, limit: number): number => (limit > 0 ? Number((used / limit).toFixed(4)) : 0);
  return {
    budgetConfigured,
    signatureValid: status.budgetConfigValid,
    daily: {
      llmRequests: {
        used: status.usage.daily.llmRequests,
        limit: dailyRequestsLimit,
        ratio: ratio(status.usage.daily.llmRequests, dailyRequestsLimit)
      },
      llmTokens: {
        used: status.usage.daily.llmTokens,
        limit: dailyTokensLimit,
        ratio: ratio(status.usage.daily.llmTokens, dailyTokensLimit)
      },
      llmCostUsd: {
        used: status.usage.daily.llmCostUsd,
        limit: dailyCostLimit,
        ratio: dailyCostLimit === null ? null : ratio(status.usage.daily.llmCostUsd, dailyCostLimit)
      }
    },
    perMinute: {
      llmRequests: {
        used: status.usage.minute.llmRequests,
        limit: minuteRequestsLimit,
        ratio: ratio(status.usage.minute.llmRequests, minuteRequestsLimit)
      },
      llmTokens: {
        used: status.usage.minute.llmTokens,
        limit: minuteTokensLimit,
        ratio: ratio(status.usage.minute.llmTokens, minuteTokensLimit)
      }
    },
    exceeded: !status.ok,
    reasons: status.reasons
  };
}

