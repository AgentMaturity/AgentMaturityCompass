import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildPerAgentCostBudgetEvidenceReceipt,
  renderPerAgentCostBudgetEvidenceMarkdown,
  verifyPerAgentCostBudgetEvidenceReceipt,
  type CostBudgetDefinition,
  type CostBudgetSpendSnapshot,
  type PerAgentCostBudgetSourceCitation
} from "../src/observability/costBudgetEvidence.js";

const DOC = "docs/source-reviews/GAP-4742-helicone-cost-budget-evidence.md";
const HELICONE_HOME = "https://www.helicone.ai";
const COST_TRACKING_DOC = "https://docs.helicone.ai/guides/cookbooks/cost-tracking";
const GATEWAY_DOC = "https://docs.helicone.ai/gateway/overview";
const GITHUB_REPO = "https://github.com/Helicone/helicone";
const GITHUB_REPO_API = "https://api.github.com/repos/Helicone/helicone";
const GITHUB_LANGUAGES_API = "https://api.github.com/repos/Helicone/helicone/languages";
const GITHUB_LICENSE_API = "https://api.github.com/repos/Helicone/helicone/license";
const IDENTIFIER = "llmops-cost-budget";
const IMPLEMENTATION_FILES = [
  "src/observability/costBudgetEvidence.ts",
  "src/observability/costTracker.ts",
  "src/index.ts"
];

const sourceCitations: PerAgentCostBudgetSourceCitation[] = [
  {
    sourceId: "helicone-home",
    title: "Helicone homepage",
    url: HELICONE_HOME,
    retrievedAt: "2026-06-25T11:35:00.000Z"
  },
  {
    sourceId: "helicone-cost-tracking",
    title: "Helicone cost tracking documentation",
    url: COST_TRACKING_DOC,
    retrievedAt: "2026-06-25T11:35:00.000Z"
  },
  {
    sourceId: "helicone-gateway",
    title: "Helicone AI Gateway documentation",
    url: GATEWAY_DOC,
    retrievedAt: "2026-06-25T11:35:00.000Z"
  }
];

function budget(overrides: Partial<CostBudgetDefinition> = {}): CostBudgetDefinition {
  return {
    budgetId: "budget-support-agent-monthly",
    agentId: "support-agent",
    taskId: "customer-support",
    owner: "finops-owner",
    period: "monthly",
    budgetUsd: 120,
    forecastUsd: 96,
    budgetEvidenceRef: "signed-budget-support-agent-monthly",
    forecastEvidenceRef: "signed-forecast-support-agent-monthly",
    ownerDecision: {
      decision: "continue",
      decidedBy: "finops-owner",
      decidedAt: "2026-06-25T11:36:00.000Z",
      rationale: "Spend is inside forecast and budget.",
      evidenceRef: "signed-owner-decision-support-agent-monthly"
    },
    ...overrides
  };
}

function spend(overrides: Partial<CostBudgetSpendSnapshot> = {}): CostBudgetSpendSnapshot {
  return {
    budgetId: "budget-support-agent-monthly",
    agentId: "support-agent",
    periodStart: "2026-06-01T00:00:00.000Z",
    periodEnd: "2026-06-25T11:36:00.000Z",
    actualUsd: 84,
    runCount: 420,
    evidenceRef: "signed-actual-spend-support-agent-monthly",
    toolPathSpend: [
      {
        toolPathId: "retrieve-context",
        forecastUsd: 25,
        budgetUsd: 35,
        actualUsd: 21,
        evidenceRef: "signed-toolpath-retrieve-context"
      },
      {
        toolPathId: "draft-response",
        forecastUsd: 71,
        budgetUsd: 85,
        actualUsd: 63,
        evidenceRef: "signed-toolpath-draft-response"
      }
    ],
    ...overrides
  };
}

describe("GAP-4742 Helicone per-agent cost budget evidence boundary", () => {
  it("documents live Helicone metadata and no-bloat relevance decision", () => {
    expect(existsSync(DOC)).toBe(true);
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-4742");
    expect(doc).toContain("Helicone");
    expect(doc).toContain(HELICONE_HOME);
    expect(doc).toContain(COST_TRACKING_DOC);
    expect(doc).toContain(GATEWAY_DOC);
    expect(doc).toContain(GITHUB_REPO);
    expect(doc).toContain(GITHUB_REPO_API);
    expect(doc).toContain(GITHUB_LANGUAGES_API);
    expect(doc).toContain(GITHUB_LICENSE_API);
    expect(doc).toContain("AI Gateway");
    expect(doc).toContain("LLM observability");
    expect(doc).toContain("Cost Tracking & Optimization");
    expect(doc).toContain("Sessions");
    expect(doc).toContain("custom properties");
    expect(doc).toContain("Cost Prevention & Alerts");
    expect(doc).toContain("Automated Reports");
    expect(doc).toContain("Apache-2.0");
    expect(doc).toContain("llm-cost");
    expect(doc).toContain("Budget, forecast, actual spend, variance, and owner decision");
    expect(doc).toContain("metadata-only");
    expect(doc).toContain("No Helicone adapter");
  });

  it("emits a valid per-agent budget receipt with forecast, actual spend, variance, and owner decision", () => {
    const receipt = buildPerAgentCostBudgetEvidenceReceipt({
      receiptId: "cost-budget-receipt-1",
      sourceCitations,
      budgets: [budget()],
      spend: [spend()],
      generatedAt: "2026-06-25T11:37:00.000Z"
    });

    expect(receipt.status).toBe("pass");
    expect(receipt.failClosed).toBe(false);
    expect(receipt.budgetMet).toBe(true);
    expect(receipt.forecastVarianceWithinTolerance).toBe(true);
    expect(receipt.rows).toHaveLength(1);
    expect(receipt.rows[0]).toMatchObject({
      budgetId: "budget-support-agent-monthly",
      agentId: "support-agent",
      owner: "finops-owner",
      period: "monthly",
      budgetUsd: 120,
      forecastUsd: 96,
      actualUsd: 84,
      forecastVarianceUsd: -12,
      budgetVarianceUsd: -36,
      ownerDecision: "continue",
      rowStatus: "within_budget"
    });
    expect(receipt.rows[0]!.toolPathRows).toEqual(expect.arrayContaining([
      expect.objectContaining({
        toolPathId: "retrieve-context",
        actualUsd: 21,
        budgetUsedPct: 60
      })
    ]));
    expect(receipt.requiredEvidenceRefs).toEqual(expect.arrayContaining([
      "signed-budget-support-agent-monthly",
      "signed-forecast-support-agent-monthly",
      "signed-actual-spend-support-agent-monthly",
      "signed-owner-decision-support-agent-monthly",
      "signed-toolpath-retrieve-context",
      "signed-toolpath-draft-response"
    ]));
    expect(verifyPerAgentCostBudgetEvidenceReceipt(receipt).valid).toBe(true);

    const markdown = renderPerAgentCostBudgetEvidenceMarkdown(receipt);
    expect(markdown).toContain("cost-budget-receipt-1");
    expect(markdown).toContain("support-agent");
    expect(markdown).toContain("Budget");
    expect(markdown).toContain("Forecast");
    expect(markdown).toContain("Owner decision");
    expect(markdown).toContain("Fleet");
  });

  it("keeps complete over-budget evidence valid but marks owner action required", () => {
    const receipt = buildPerAgentCostBudgetEvidenceReceipt({
      receiptId: "cost-budget-receipt-over-1",
      sourceCitations,
      budgets: [
        budget({
          budgetUsd: 120,
          forecastUsd: 100,
          ownerDecision: {
            decision: "throttle",
            decidedBy: "finops-owner",
            decidedAt: "2026-06-25T11:38:00.000Z",
            rationale: "Throttle low-priority runs until next period.",
            evidenceRef: "signed-owner-decision-throttle-support-agent"
          }
        })
      ],
      spend: [spend({ actualUsd: 134 })],
      generatedAt: "2026-06-25T11:38:00.000Z"
    });

    expect(receipt.status).toBe("action_required");
    expect(receipt.failClosed).toBe(false);
    expect(receipt.budgetMet).toBe(false);
    expect(receipt.scorePenalty).toBeGreaterThan(0);
    expect(receipt.rows[0]).toMatchObject({
      rowStatus: "over_budget",
      budgetVarianceUsd: 14,
      ownerDecision: "throttle"
    });
    expect(verifyPerAgentCostBudgetEvidenceReceipt(receipt).valid).toBe(true);
  });

  it("fails closed when metadata exists but budget, actual spend, or owner decision evidence is missing", () => {
    const receipt = buildPerAgentCostBudgetEvidenceReceipt({
      receiptId: "cost-budget-receipt-metadata-only",
      sourceCitations,
      budgets: [
        budget({
          budgetEvidenceRef: "",
          forecastEvidenceRef: "",
          ownerDecision: undefined
        })
      ],
      spend: [
        spend({
          actualUsd: Number.NaN,
          evidenceRef: "",
          toolPathSpend: [
            {
              toolPathId: "draft-response",
              forecastUsd: 71,
              budgetUsd: 85,
              actualUsd: 63,
              evidenceRef: ""
            }
          ]
        })
      ],
      generatedAt: "2026-06-25T11:39:00.000Z"
    });

    expect(receipt.status).toBe("fail_closed");
    expect(receipt.failClosed).toBe(true);
    expect(receipt.failClosedReasons).toEqual(expect.arrayContaining([
      "budget-support-agent-monthly:budgetEvidenceRef:missing",
      "budget-support-agent-monthly:forecastEvidenceRef:missing",
      "budget-support-agent-monthly:ownerDecision:missing",
      "budget-support-agent-monthly:actualSpend:invalid",
      "budget-support-agent-monthly:actualSpendEvidenceRef:missing",
      "budget-support-agent-monthly:toolPath:draft-response:evidenceRef:missing"
    ]));
    expect(verifyPerAgentCostBudgetEvidenceReceipt(receipt).valid).toBe(false);
  });

  it("does not add Helicone-specific identifiers to generic cost-budget implementation files", () => {
    const combined = IMPLEMENTATION_FILES.map((file) => existsSync(file) ? readFileSync(file, "utf8") : "").join("\n");
    expect(combined).not.toContain("Helicone");
    expect(combined).not.toContain("helicone.ai");
    expect(combined).not.toContain("COMP-010");
    expect(combined).not.toContain(IDENTIFIER);
  });
});
