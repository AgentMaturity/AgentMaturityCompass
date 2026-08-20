/**
 * playground.ts — Interactive prompt comparison and A/B testing playground.
 *
 * Provides a structured API for comparing different prompts, models, and
 * agent configurations side-by-side. Supports:
 *   - Multi-variant testing (compare N prompts simultaneously)
 *   - Model comparison (same prompt, different models)
 *   - Variable injection and template rendering
 *   - Automatic metric scoring of each variant
 *   - Result persistence for later analysis
 *   - Session management for iterative experimentation
 */

import { randomUUID } from 'node:crypto';
import { MetricRegistry, type MetricGroupResult, type MetricInput } from './metricTemplates.js';
import { LLMJudge, type JudgeResult } from './llmJudge.js';

/* ── Types ──────────────────────────────────────────────────────── */

export interface PlaygroundPrompt {
  id: string;
  name: string;
  /** System prompt */
  systemPrompt?: string;
  /** User prompt template — supports {{variable}} substitution */
  userPrompt: string;
  /** Model to use */
  model: string;
  /** Temperature */
  temperature?: number;
  /** Additional parameters */
  params?: Record<string, unknown>;
}

export interface PlaygroundTestcase {
  id: string;
  name: string;
  /** Input variables for template substitution */
  variables: Record<string, string>;
  /** Expected output (optional, for scoring) */
  expectedOutput?: string;
}

export interface PlaygroundVariant {
  promptId: string;
  promptName: string;
  model: string;
  /** The rendered prompt that was/would be sent */
  renderedPrompt: string;
  /** The agent/model output */
  output: string;
  /** Latency in ms */
  latencyMs: number;
  /** Metric evaluation results */
  metrics?: MetricGroupResult;
  /** LLM judge evaluation */
  judgeResults?: JudgeResult[];
  /** Token usage estimate */
  estimatedTokens?: number;
}

export interface PlaygroundRun {
  runId: string;
  sessionId: string;
  testcase: PlaygroundTestcase;
  variants: PlaygroundVariant[];
  /** Best variant ID based on metrics */
  bestVariantId?: string;
  timestamp: number;
  durationMs: number;
}

export interface PlaygroundSession {
  sessionId: string;
  name: string;
  createdAt: number;
  runs: PlaygroundRun[];
  prompts: PlaygroundPrompt[];
  testcases: PlaygroundTestcase[];
  metadata: Record<string, unknown>;
}

export interface PlaygroundSummary {
  sessionId: string;
  name: string;
  totalRuns: number;
  totalVariants: number;
  promptScores: Array<{
    promptId: string;
    promptName: string;
    avgScore: number;
    wins: number;
    runs: number;
  }>;
  bestPrompt: { promptId: string; promptName: string; avgScore: number } | undefined;
}

/* ── Template rendering ──────────────────────────────────────────── */

function renderPrompt(template: string, variables: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(variables)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
  }
  return result;
}

/** Raised when a playground run is attempted without a real agent executor. */
export class PlaygroundExecutorMissingError extends Error {
  readonly code = "PLAYGROUND_EXECUTOR_MISSING";

  constructor() {
    super(
      "Playground.run requires an executor that invokes a real agent. " +
        "Pass one to the Playground constructor; there is no simulated fallback."
    );
    this.name = "PlaygroundExecutorMissingError";
  }
}

/* ── Playground ──────────────────────────────────────────────────── */

export class Playground {
  private sessions = new Map<string, PlaygroundSession>();
  private metricRegistry: MetricRegistry;
  private judge: LLMJudge;
  /** Agent executor that performs the real model call. Required for runs. */
  private executor?: (prompt: PlaygroundPrompt, variables: Record<string, string>) => Promise<{ output: string; latencyMs: number; tokens?: number }>;

  constructor(executor?: (prompt: PlaygroundPrompt, variables: Record<string, string>) => Promise<{ output: string; latencyMs: number; tokens?: number }>) {
    this.metricRegistry = new MetricRegistry();
    this.judge = new LLMJudge();
    this.executor = executor;
  }

  /** Create a new session */
  createSession(name: string, metadata?: Record<string, unknown>): PlaygroundSession {
    const session: PlaygroundSession = {
      sessionId: randomUUID(),
      name,
      createdAt: Date.now(),
      runs: [],
      prompts: [],
      testcases: [],
      metadata: metadata ?? {},
    };
    this.sessions.set(session.sessionId, session);
    return session;
  }

  /** Get a session */
  getSession(sessionId: string): PlaygroundSession | undefined {
    return this.sessions.get(sessionId);
  }

  /** List all sessions */
  listSessions(): PlaygroundSession[] {
    return [...this.sessions.values()];
  }

  /** Add a prompt variant to a session */
  addPrompt(sessionId: string, prompt: Omit<PlaygroundPrompt, 'id'>): PlaygroundPrompt | undefined {
    const session = this.sessions.get(sessionId);
    if (!session) return undefined;
    const full: PlaygroundPrompt = { id: randomUUID(), ...prompt };
    session.prompts.push(full);
    return full;
  }

  /** Add a testcase to a session */
  addTestcase(sessionId: string, testcase: Omit<PlaygroundTestcase, 'id'>): PlaygroundTestcase | undefined {
    const session = this.sessions.get(sessionId);
    if (!session) return undefined;
    const full: PlaygroundTestcase = { id: randomUUID(), ...testcase };
    session.testcases.push(full);
    return full;
  }

  /** Run all prompts against a single testcase */
  async runComparison(
    sessionId: string,
    testcaseId: string,
    options?: { metricGroupId?: string; runJudge?: boolean },
  ): Promise<PlaygroundRun | undefined> {
    const session = this.sessions.get(sessionId);
    if (!session) return undefined;
    const testcase = session.testcases.find(t => t.id === testcaseId);
    if (!testcase) return undefined;

    const start = Date.now();
    const variants: PlaygroundVariant[] = [];

    for (const prompt of session.prompts) {
      const renderedPrompt = renderPrompt(prompt.userPrompt, testcase.variables);
      let output: string;
      let latencyMs: number;
      let tokens: number | undefined;

      if (!this.executor) {
        // Without an executor there is no agent to compare. Fabricating output
        // (previously Math.random latency/tokens over echoed prompt words)
        // produced model-comparison numbers unrelated to any model.
        throw new PlaygroundExecutorMissingError();
      }
      const result = await this.executor(prompt, testcase.variables);
      output = result.output;
      latencyMs = result.latencyMs;
      tokens = result.tokens;

      // Run metrics
      let metrics: MetricGroupResult | undefined;
      if (options?.metricGroupId) {
        const metricInput: MetricInput = {
          input: renderedPrompt,
          output,
          expectedOutput: testcase.expectedOutput,
        };
        metrics = this.metricRegistry.evaluateGroup(options.metricGroupId, metricInput) ?? undefined;
      }

      // Run LLM judge
      let judgeResults: JudgeResult[] | undefined;
      if (options?.runJudge) {
        judgeResults = await this.judge.evaluateAll({
          input: renderedPrompt,
          output,
          expected: testcase.expectedOutput,
        });
      }

      variants.push({
        promptId: prompt.id,
        promptName: prompt.name,
        model: prompt.model,
        renderedPrompt,
        output,
        latencyMs,
        metrics,
        judgeResults,
        estimatedTokens: tokens,
      });
    }

    // Determine best variant
    let bestVariantId: string | undefined;
    if (variants.length > 0) {
      let bestScore = -1;
      for (const v of variants) {
        const score = v.metrics?.overallScore ?? v.judgeResults?.[0]?.score ?? 0;
        if (score > bestScore) {
          bestScore = score;
          bestVariantId = v.promptId;
        }
      }
    }

    const run: PlaygroundRun = {
      runId: randomUUID(),
      sessionId,
      testcase,
      variants,
      bestVariantId,
      timestamp: Date.now(),
      durationMs: Date.now() - start,
    };

    session.runs.push(run);
    return run;
  }

  /** Run all prompts against all testcases */
  async runAll(
    sessionId: string,
    options?: { metricGroupId?: string; runJudge?: boolean },
  ): Promise<PlaygroundRun[]> {
    const session = this.sessions.get(sessionId);
    if (!session) return [];

    const runs: PlaygroundRun[] = [];
    for (const tc of session.testcases) {
      const run = await this.runComparison(sessionId, tc.id, options);
      if (run) runs.push(run);
    }
    return runs;
  }

  /** Get session summary with aggregate scores */
  getSummary(sessionId: string): PlaygroundSummary | undefined {
    const session = this.sessions.get(sessionId);
    if (!session) return undefined;

    const promptStats = new Map<string, { name: string; scores: number[]; wins: number }>();

    for (const prompt of session.prompts) {
      promptStats.set(prompt.id, { name: prompt.name, scores: [], wins: 0 });
    }

    for (const run of session.runs) {
      for (const variant of run.variants) {
        const stats = promptStats.get(variant.promptId);
        if (!stats) continue;
        const score = variant.metrics?.overallScore ?? variant.judgeResults?.[0]?.score ?? 0;
        stats.scores.push(score);
        if (run.bestVariantId === variant.promptId) stats.wins++;
      }
    }

    const promptScores = [...promptStats.entries()].map(([promptId, stats]) => ({
      promptId,
      promptName: stats.name,
      avgScore: stats.scores.length > 0
        ? Math.round(stats.scores.reduce((a, b) => a + b, 0) / stats.scores.length * 1000) / 1000
        : 0,
      wins: stats.wins,
      runs: stats.scores.length,
    }));

    promptScores.sort((a, b) => b.avgScore - a.avgScore);

    return {
      sessionId,
      name: session.name,
      totalRuns: session.runs.length,
      totalVariants: session.runs.reduce((s, r) => s + r.variants.length, 0),
      promptScores,
      bestPrompt: promptScores[0] ? {
        promptId: promptScores[0].promptId,
        promptName: promptScores[0].promptName,
        avgScore: promptScores[0].avgScore,
      } : undefined,
    };
  }

  get sessionCount(): number { return this.sessions.size; }
}
