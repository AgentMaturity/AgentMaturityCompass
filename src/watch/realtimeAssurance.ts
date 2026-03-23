/**
 * Real-Time Assurance Engine
 *
 * Runs AMC assurance checks against live trace streams in real-time.
 * When the observability bridge ingests a new trace, this engine evaluates
 * it against relevant assurance packs and fires alerts immediately.
 *
 * This is what makes AMC a RUNTIME trust layer — not just a post-hoc audit.
 */

import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import type { NormalizedTrace, NormalizedSpan, ObservabilityBridge } from "./observabilityBridge.js";
import type { MonitoringEvent } from "./continuousMonitor.js";
import { sha256Hex } from "../utils/hash.js";
import { ensureDir, writeFileAtomic } from "../utils/fs.js";
import { openLedger } from "../ledger/ledger.js";
import { dispatchAlert, type AlertPayload } from "../drift/alerts.js";

/* ── Types ───────────────────────────────────────────────────────── */

export type AssuranceCheckSeverity = "info" | "warning" | "critical" | "blocker";

export interface RealtimeAssuranceViolation {
  violationId: string;
  checkId: string;
  checkName: string;
  severity: AssuranceCheckSeverity;
  traceId: string;
  spanId?: string;
  message: string;
  details: Record<string, unknown>;
  recommendation: string;
  ts: number;
}

export interface RealtimeAssuranceResult {
  traceId: string;
  checksRun: number;
  violations: RealtimeAssuranceViolation[];
  passedChecks: string[];
  score: number; // 0-100, percentage of checks passed
  durationMs: number;
}

export interface RealtimeAssuranceCheck {
  id: string;
  name: string;
  description: string;
  severity: AssuranceCheckSeverity;
  /** Return violations found. Empty array = passed. */
  evaluate(trace: NormalizedTrace, context: CheckContext): RealtimeAssuranceViolation[];
}

export interface CheckContext {
  workspace: string;
  agentId: string;
  recentTraces: NormalizedTrace[];
  costBudgetUsd?: number;
  maxLatencyMs?: number;
  maxErrorRate?: number;
  maxToolRetries?: number;
}

export interface RealtimeAssuranceConfig {
  workspace: string;
  agentId: string;
  bridge: ObservabilityBridge;
  enabledChecks?: string[];
  costBudgetUsd?: number;
  maxLatencyMs?: number;
  maxErrorRate?: number;
  maxToolRetries?: number;
  alertOnSeverity?: AssuranceCheckSeverity;
  persistResults?: boolean;
  recentTraceWindow?: number;
}

/* ── Built-in Real-Time Checks ───────────────────────────────────── */

const costSpikeCheck: RealtimeAssuranceCheck = {
  id: "rt-cost-spike",
  name: "Cost Spike Detection",
  description: "Detects traces with abnormally high cost compared to recent average",
  severity: "warning",
  evaluate(trace, ctx) {
    const violations: RealtimeAssuranceViolation[] = [];
    if (ctx.recentTraces.length < 5) return violations; // Need baseline

    const recentCosts = ctx.recentTraces.map((t) => t.totalCostUsd).filter((c) => c > 0);
    if (recentCosts.length === 0) return violations;

    const avgCost = recentCosts.reduce((a, b) => a + b, 0) / recentCosts.length;
    const stdDev = Math.sqrt(recentCosts.reduce((sum, c) => sum + Math.pow(c - avgCost, 2), 0) / recentCosts.length);
    const threshold = avgCost + 3 * Math.max(stdDev, avgCost * 0.5);

    if (trace.totalCostUsd > threshold && trace.totalCostUsd > 0.01) {
      violations.push({
        violationId: randomUUID(),
        checkId: "rt-cost-spike",
        checkName: "Cost Spike Detection",
        severity: "warning",
        traceId: trace.traceId,
        message: `Trace cost $${trace.totalCostUsd.toFixed(4)} is ${(trace.totalCostUsd / avgCost).toFixed(1)}x the recent average ($${avgCost.toFixed(4)})`,
        details: { traceCost: trace.totalCostUsd, avgCost, threshold, stdDev },
        recommendation: "Investigate model selection and token usage. Consider routing to a cheaper model for this task type.",
        ts: Date.now(),
      });
    }

    return violations;
  },
};

const budgetExceededCheck: RealtimeAssuranceCheck = {
  id: "rt-budget-exceeded",
  name: "Budget Exceeded",
  description: "Checks if cumulative cost exceeds the configured budget",
  severity: "critical",
  evaluate(trace, ctx) {
    const violations: RealtimeAssuranceViolation[] = [];
    if (!ctx.costBudgetUsd) return violations;

    const totalCost = ctx.recentTraces.reduce((sum, t) => sum + t.totalCostUsd, 0) + trace.totalCostUsd;

    if (totalCost > ctx.costBudgetUsd) {
      violations.push({
        violationId: randomUUID(),
        checkId: "rt-budget-exceeded",
        checkName: "Budget Exceeded",
        severity: "critical",
        traceId: trace.traceId,
        message: `Cumulative cost $${totalCost.toFixed(4)} exceeds budget of $${ctx.costBudgetUsd.toFixed(2)}`,
        details: { totalCost, budget: ctx.costBudgetUsd, overageUsd: totalCost - ctx.costBudgetUsd },
        recommendation: "Reduce model tier, add caching, or increase budget. Consider implementing request throttling.",
        ts: Date.now(),
      });
    }

    return violations;
  },
};

const highLatencyCheck: RealtimeAssuranceCheck = {
  id: "rt-high-latency",
  name: "High Latency Detection",
  description: "Detects traces that exceed acceptable latency thresholds",
  severity: "warning",
  evaluate(trace, ctx) {
    const violations: RealtimeAssuranceViolation[] = [];
    const maxMs = ctx.maxLatencyMs ?? 30_000; // Default 30s

    if (trace.durationMs > maxMs) {
      violations.push({
        violationId: randomUUID(),
        checkId: "rt-high-latency",
        checkName: "High Latency Detection",
        severity: trace.durationMs > maxMs * 3 ? "critical" : "warning",
        traceId: trace.traceId,
        message: `Trace took ${(trace.durationMs / 1000).toFixed(1)}s, exceeding threshold of ${(maxMs / 1000).toFixed(1)}s`,
        details: { durationMs: trace.durationMs, thresholdMs: maxMs, slowestSpan: findSlowestSpan(trace) },
        recommendation: "Identify bottleneck spans. Consider parallelizing tool calls or using streaming responses.",
        ts: Date.now(),
      });
    }

    return violations;
  },
};

const errorRateCheck: RealtimeAssuranceCheck = {
  id: "rt-error-rate",
  name: "Error Rate Monitor",
  description: "Detects when error rate exceeds acceptable threshold",
  severity: "critical",
  evaluate(trace, ctx) {
    const violations: RealtimeAssuranceViolation[] = [];
    const maxRate = ctx.maxErrorRate ?? 0.2; // Default 20%

    const window = [...ctx.recentTraces, trace];
    if (window.length < 5) return violations;

    const errorCount = window.filter((t) => t.status === "error").length;
    const errorRate = errorCount / window.length;

    if (errorRate > maxRate) {
      violations.push({
        violationId: randomUUID(),
        checkId: "rt-error-rate",
        checkName: "Error Rate Monitor",
        severity: "critical",
        traceId: trace.traceId,
        message: `Error rate ${(errorRate * 100).toFixed(1)}% exceeds threshold of ${(maxRate * 100).toFixed(1)}% (${errorCount}/${window.length} traces)`,
        details: { errorRate, threshold: maxRate, errorCount, windowSize: window.length },
        recommendation: "Investigate error patterns. Check for API key issues, rate limits, or model deprecation.",
        ts: Date.now(),
      });
    }

    return violations;
  },
};

const toolFailureCheck: RealtimeAssuranceCheck = {
  id: "rt-tool-failure",
  name: "Tool Failure Detection",
  description: "Detects excessive tool failures or retry loops within a trace",
  severity: "warning",
  evaluate(trace, ctx) {
    const violations: RealtimeAssuranceViolation[] = [];
    const maxRetries = ctx.maxToolRetries ?? 3;

    // Group tool calls by name
    const toolCalls = trace.spans.filter((s) => s.kind === "tool_call");
    const toolGroups = new Map<string, NormalizedSpan[]>();
    for (const span of toolCalls) {
      const name = span.toolName ?? span.name;
      if (!toolGroups.has(name)) toolGroups.set(name, []);
      toolGroups.get(name)!.push(span);
    }

    // Check for retry loops
    for (const [toolName, calls] of toolGroups) {
      const failures = calls.filter((s) => s.status === "error" || s.toolSuccess === false);
      if (failures.length > maxRetries) {
        violations.push({
          violationId: randomUUID(),
          checkId: "rt-tool-failure",
          checkName: "Tool Failure Detection",
          severity: failures.length === calls.length ? "critical" : "warning",
          traceId: trace.traceId,
          spanId: failures[0]?.spanId,
          message: `Tool "${toolName}" failed ${failures.length}/${calls.length} times (exceeds ${maxRetries} retries)`,
          details: { toolName, totalCalls: calls.length, failures: failures.length, maxRetries },
          recommendation: `Add circuit breaker for "${toolName}". Consider fallback tools or graceful degradation.`,
          ts: Date.now(),
        });
      }
    }

    // Check for unreasonably many tool calls in one trace
    if (toolCalls.length > 50) {
      violations.push({
        violationId: randomUUID(),
        checkId: "rt-tool-failure",
        checkName: "Tool Failure Detection",
        severity: "warning",
        traceId: trace.traceId,
        message: `Trace made ${toolCalls.length} tool calls — possible runaway loop`,
        details: { toolCallCount: toolCalls.length, uniqueTools: toolGroups.size },
        recommendation: "Implement action limits per trace. Consider whether the agent is stuck in a loop.",
        ts: Date.now(),
      });
    }

    return violations;
  },
};

const modelMisuseCheck: RealtimeAssuranceCheck = {
  id: "rt-model-misuse",
  name: "Model Misuse Detection",
  description: "Detects when expensive models are used for trivial tasks",
  severity: "info",
  evaluate(trace) {
    const violations: RealtimeAssuranceViolation[] = [];

    for (const span of trace.spans) {
      if (span.kind !== "llm_call" || !span.model || !span.tokenUsage) continue;

      const isExpensive = /opus|gpt-4(?!o-mini)|gpt-4-turbo|gemini-1\.5-pro/i.test(span.model);
      const isTrivial = span.tokenUsage.total < 200 && span.durationMs < 2000;

      if (isExpensive && isTrivial) {
        violations.push({
          violationId: randomUUID(),
          checkId: "rt-model-misuse",
          checkName: "Model Misuse Detection",
          severity: "info",
          traceId: trace.traceId,
          spanId: span.spanId,
          message: `Expensive model "${span.model}" used for trivial task (${span.tokenUsage.total} tokens, ${span.durationMs}ms)`,
          details: { model: span.model, tokens: span.tokenUsage.total, costUsd: span.costUsd, durationMs: span.durationMs },
          recommendation: `Route to a cheaper model (e.g., GPT-4o-mini, Claude Haiku, Gemini Flash) for tasks under 200 tokens.`,
          ts: Date.now(),
        });
      }
    }

    return violations;
  },
};

const hallucKnownPatternCheck: RealtimeAssuranceCheck = {
  id: "rt-hallucination-pattern",
  name: "Hallucination Pattern Detection",
  description: "Detects known hallucination risk patterns in traces",
  severity: "warning",
  evaluate(trace) {
    const violations: RealtimeAssuranceViolation[] = [];

    // Pattern: LLM call WITHOUT preceding retrieval/tool call but with high token output
    const llmCalls = trace.spans.filter((s) => s.kind === "llm_call");
    const retrievalCalls = trace.spans.filter((s) => s.kind === "retrieval" || s.kind === "tool_call");

    if (llmCalls.length > 0 && retrievalCalls.length === 0) {
      for (const llm of llmCalls) {
        if (llm.tokenUsage && llm.tokenUsage.completion > 500) {
          violations.push({
            violationId: randomUUID(),
            checkId: "rt-hallucination-pattern",
            checkName: "Hallucination Pattern Detection",
            severity: "warning",
            traceId: trace.traceId,
            spanId: llm.spanId,
            message: `Long LLM response (${llm.tokenUsage.completion} output tokens) with no prior retrieval or tool call — hallucination risk`,
            details: { outputTokens: llm.tokenUsage.completion, model: llm.model, hasRetrieval: false },
            recommendation: "Add retrieval-augmented generation (RAG) or grounding step before long-form generation.",
            ts: Date.now(),
          });
        }
      }
    }

    // Pattern: repeated LLM calls with same or similar prompts (self-reinforcement)
    if (llmCalls.length >= 3) {
      const models = llmCalls.map((s) => s.model).filter(Boolean);
      const uniqueModels = new Set(models);
      if (uniqueModels.size === 1 && llmCalls.every((s) => Math.abs((s.tokenUsage?.prompt ?? 0) - (llmCalls[0]?.tokenUsage?.prompt ?? 0)) < 50)) {
        violations.push({
          violationId: randomUUID(),
          checkId: "rt-hallucination-pattern",
          checkName: "Hallucination Pattern Detection",
          severity: "info",
          traceId: trace.traceId,
          message: `${llmCalls.length} LLM calls with similar prompt sizes to same model — possible self-reinforcement loop`,
          details: { callCount: llmCalls.length, model: llmCalls[0]?.model },
          recommendation: "Verify these are intentionally different queries, not a retry/reinforcement loop.",
          ts: Date.now(),
        });
      }
    }

    return violations;
  },
};

const dataLeakageCheck: RealtimeAssuranceCheck = {
  id: "rt-data-leakage",
  name: "Data Leakage Risk Detection",
  description: "Detects patterns suggesting sensitive data exposure",
  severity: "critical",
  evaluate(trace) {
    const violations: RealtimeAssuranceViolation[] = [];

    // Pattern: Tool call fetching data followed by external API call
    const spans = [...trace.spans].sort((a, b) => a.startTimeMs - b.startTimeMs);
    let hasDataFetch = false;

    for (const span of spans) {
      if (span.kind === "retrieval" || (span.kind === "tool_call" && /fetch|read|get|query|search|database|db/i.test(span.name))) {
        hasDataFetch = true;
      }

      if (hasDataFetch && span.kind === "tool_call" && /send|post|email|notify|webhook|api.*call|external/i.test(span.name)) {
        violations.push({
          violationId: randomUUID(),
          checkId: "rt-data-leakage",
          checkName: "Data Leakage Risk Detection",
          severity: "warning",
          traceId: trace.traceId,
          spanId: span.spanId,
          message: `Data retrieval followed by external send operation "${span.name}" — potential data leakage path`,
          details: { operation: span.name, toolName: span.toolName },
          recommendation: "Implement DLP (Data Loss Prevention) checks between retrieval and external send operations.",
          ts: Date.now(),
        });
      }
    }

    // Pattern: Unusually large token output (potential data dump)
    for (const span of spans) {
      if (span.kind === "llm_call" && span.tokenUsage && span.tokenUsage.completion > 4000) {
        violations.push({
          violationId: randomUUID(),
          checkId: "rt-data-leakage",
          checkName: "Data Leakage Risk Detection",
          severity: "info",
          traceId: trace.traceId,
          spanId: span.spanId,
          message: `Unusually large LLM output (${span.tokenUsage.completion} tokens) — review for sensitive data exposure`,
          details: { outputTokens: span.tokenUsage.completion, model: span.model },
          recommendation: "Implement output scanning for PII, credentials, and sensitive data patterns.",
          ts: Date.now(),
        });
      }
    }

    return violations;
  },
};

const governanceBypassCheck: RealtimeAssuranceCheck = {
  id: "rt-governance-bypass",
  name: "Governance Bypass Detection",
  description: "Detects agent actions that bypass expected governance gates",
  severity: "critical",
  evaluate(trace) {
    const violations: RealtimeAssuranceViolation[] = [];
    const spans = [...trace.spans].sort((a, b) => a.startTimeMs - b.startTimeMs);

    // Pattern: high-stakes tool call without preceding guard/safety check
    const highStakesCalls = spans.filter((s) =>
      s.kind === "tool_call" && /deploy|delete|transfer|payment|execute|admin|sudo|privileged/i.test(s.name)
    );
    const guardCalls = spans.filter((s) => s.kind === "guard");

    for (const hsc of highStakesCalls) {
      const precedingGuards = guardCalls.filter((g) => g.endTimeMs <= hsc.startTimeMs);
      if (precedingGuards.length === 0) {
        violations.push({
          violationId: randomUUID(),
          checkId: "rt-governance-bypass",
          checkName: "Governance Bypass Detection",
          severity: "critical",
          traceId: trace.traceId,
          spanId: hsc.spanId,
          message: `High-stakes action "${hsc.toolName ?? hsc.name}" executed without preceding governance/safety check`,
          details: { action: hsc.toolName ?? hsc.name, guardCount: guardCalls.length },
          recommendation: "Add mandatory approval gate or safety check before high-stakes operations.",
          ts: Date.now(),
        });
      }
    }

    return violations;
  },
};

/* ── Check Registry ──────────────────────────────────────────────── */

const BUILTIN_CHECKS: RealtimeAssuranceCheck[] = [
  costSpikeCheck,
  budgetExceededCheck,
  highLatencyCheck,
  errorRateCheck,
  toolFailureCheck,
  modelMisuseCheck,
  hallucKnownPatternCheck,
  dataLeakageCheck,
  governanceBypassCheck,
];

/* ── Engine ───────────────────────────────────────────────────────── */

export class RealtimeAssuranceEngine extends EventEmitter {
  private config: Required<RealtimeAssuranceConfig>;
  private checks: RealtimeAssuranceCheck[] = [];
  private results: RealtimeAssuranceResult[] = [];
  private violations: RealtimeAssuranceViolation[] = [];
  private running = false;
  private maxResults = 5000;

  constructor(config: RealtimeAssuranceConfig) {
    super();
    this.config = {
      workspace: config.workspace,
      agentId: config.agentId,
      bridge: config.bridge,
      enabledChecks: config.enabledChecks ?? BUILTIN_CHECKS.map((c) => c.id),
      costBudgetUsd: config.costBudgetUsd ?? 100,
      maxLatencyMs: config.maxLatencyMs ?? 30_000,
      maxErrorRate: config.maxErrorRate ?? 0.2,
      maxToolRetries: config.maxToolRetries ?? 3,
      alertOnSeverity: config.alertOnSeverity ?? "warning",
      persistResults: config.persistResults ?? true,
      recentTraceWindow: config.recentTraceWindow ?? 100,
    };

    // Load enabled checks
    this.checks = BUILTIN_CHECKS.filter((c) => this.config.enabledChecks.includes(c.id));
  }

  start(): void {
    if (this.running) return;
    this.running = true;

    // Listen for traces from the observability bridge
    this.config.bridge.on("trace", (trace: NormalizedTrace) => {
      this.evaluateTrace(trace).catch((err) => {
        this.emit("error", { error: err instanceof Error ? err.message : String(err) });
      });
    });

    this.emit("started", { agentId: this.config.agentId, checks: this.checks.length });
  }

  stop(): void {
    this.running = false;
    this.config.bridge.removeAllListeners("trace");
    this.emit("stopped", { agentId: this.config.agentId });
  }

  async evaluateTrace(trace: NormalizedTrace): Promise<RealtimeAssuranceResult> {
    const startTime = Date.now();
    const allViolations: RealtimeAssuranceViolation[] = [];
    const passedChecks: string[] = [];
    const recentTraces = this.config.bridge.getTraces(
      Date.now() - 3600_000,
      this.config.recentTraceWindow,
    );

    const ctx: CheckContext = {
      workspace: this.config.workspace,
      agentId: this.config.agentId,
      recentTraces,
      costBudgetUsd: this.config.costBudgetUsd,
      maxLatencyMs: this.config.maxLatencyMs,
      maxErrorRate: this.config.maxErrorRate,
      maxToolRetries: this.config.maxToolRetries,
    };

    for (const check of this.checks) {
      try {
        const violations = check.evaluate(trace, ctx);
        if (violations.length > 0) {
          allViolations.push(...violations);
        } else {
          passedChecks.push(check.id);
        }
      } catch (err) {
        this.emit("check_error", {
          checkId: check.id,
          traceId: trace.traceId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const result: RealtimeAssuranceResult = {
      traceId: trace.traceId,
      checksRun: this.checks.length,
      violations: allViolations,
      passedChecks,
      score: this.checks.length > 0 ? (passedChecks.length / this.checks.length) * 100 : 100,
      durationMs: Date.now() - startTime,
    };

    // Store results
    this.results.push(result);
    this.violations.push(...allViolations);
    if (this.results.length > this.maxResults) this.results = this.results.slice(-this.maxResults);
    if (this.violations.length > this.maxResults * 5) this.violations = this.violations.slice(-this.maxResults * 5);

    // Emit events
    this.emit("result", result);
    for (const v of allViolations) {
      this.emit("violation", v);
    }

    // Alert on severe violations
    const severityRank: Record<AssuranceCheckSeverity, number> = { info: 0, warning: 1, critical: 2, blocker: 3 };
    const alertThreshold = severityRank[this.config.alertOnSeverity];
    const alertableViolations = allViolations.filter((v) => severityRank[v.severity] >= alertThreshold);

    if (alertableViolations.length > 0) {
      await this.sendAlerts(alertableViolations);
    }

    // Persist
    if (this.config.persistResults) {
      await this.persistResult(result);
    }

    // Record in ledger
    if (allViolations.length > 0) {
      await this.recordViolationsToLedger(allViolations);
    }

    return result;
  }

  getResults(limit?: number): RealtimeAssuranceResult[] {
    return this.results.slice(-(limit ?? 100));
  }

  getViolations(severity?: AssuranceCheckSeverity, limit?: number): RealtimeAssuranceViolation[] {
    let filtered = this.violations;
    if (severity) filtered = filtered.filter((v) => v.severity === severity);
    return filtered.slice(-(limit ?? 100));
  }

  getStats(): {
    totalChecks: number;
    totalResults: number;
    totalViolations: number;
    avgScore: number;
    violationsBySeverity: Record<AssuranceCheckSeverity, number>;
    violationsByCheck: Record<string, number>;
  } {
    const bySeverity: Record<AssuranceCheckSeverity, number> = { info: 0, warning: 0, critical: 0, blocker: 0 };
    const byCheck: Record<string, number> = {};

    for (const v of this.violations) {
      bySeverity[v.severity] = (bySeverity[v.severity] ?? 0) + 1;
      byCheck[v.checkId] = (byCheck[v.checkId] ?? 0) + 1;
    }

    const avgScore = this.results.length > 0
      ? this.results.reduce((sum, r) => sum + r.score, 0) / this.results.length
      : 100;

    return {
      totalChecks: this.checks.length,
      totalResults: this.results.length,
      totalViolations: this.violations.length,
      avgScore,
      violationsBySeverity: bySeverity,
      violationsByCheck: byCheck,
    };
  }

  addCheck(check: RealtimeAssuranceCheck): void {
    this.checks.push(check);
  }

  private async sendAlerts(violations: RealtimeAssuranceViolation[]): Promise<void> {
    const summary = violations.map((v) => `[${v.severity.toUpperCase()}] ${v.message}`).join("\n");

    const payload: AlertPayload = {
      type: "AMC_ALERT",
      ruleId: "realtime-assurance",
      agentId: this.config.agentId,
      runId: violations[0]?.traceId ?? "unknown",
      summary: `Real-time assurance: ${violations.length} violation(s) detected\n${summary}`,
      links: {
        dashboard: "http://127.0.0.1:4173",
        report: `.amc/agents/${this.config.agentId}/rt-assurance/`,
      },
      hashes: {
        reportSha256: sha256Hex(JSON.stringify(violations)),
        bundleSha256: sha256Hex(`${this.config.agentId}:${violations[0]?.traceId}`),
      },
    };

    try {
      await dispatchAlert(this.config.workspace, payload);
    } catch {
      // Non-fatal
    }
  }

  private async persistResult(result: RealtimeAssuranceResult): Promise<void> {
    const dir = join(this.config.workspace, ".amc", "agents", this.config.agentId, "rt-assurance");
    ensureDir(dir);
    const filename = `${result.traceId}.json`;
    writeFileAtomic(join(dir, filename), JSON.stringify(result, null, 2));
  }

  private async recordViolationsToLedger(violations: RealtimeAssuranceViolation[]): Promise<void> {
    try {
      const ledger = openLedger(this.config.workspace);
      const sessionId = `rt-assurance-${randomUUID()}`;
      ledger.startSession({
        sessionId,
        runtime: "unknown",
        binaryPath: "amc-monitor",
        binarySha256: sha256Hex("amc-monitor"),
      });

      for (const v of violations) {
        ledger.appendEvidence({
          sessionId,
          runtime: "unknown",
          eventType: "audit",
          payload: JSON.stringify(v),
          payloadExt: "json",
          inline: true,
          meta: {
            auditType: `RT_ASSURANCE_${v.severity.toUpperCase()}`,
            checkId: v.checkId,
            traceId: v.traceId,
            agentId: this.config.agentId,
            trustTier: "OBSERVED",
          },
        });
      }

      ledger.sealSession(sessionId);
      ledger.close();
    } catch {
      // Non-fatal
    }
  }
}

export function createRealtimeAssuranceEngine(config: RealtimeAssuranceConfig): RealtimeAssuranceEngine {
  return new RealtimeAssuranceEngine(config);
}

/* ── Helpers ──────────────────────────────────────────────────────── */

function findSlowestSpan(trace: NormalizedTrace): { name: string; durationMs: number } | null {
  if (trace.spans.length === 0) return null;
  const slowest = trace.spans.reduce((a, b) => (a.durationMs > b.durationMs ? a : b));
  return { name: slowest.name, durationMs: slowest.durationMs };
}
