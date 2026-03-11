/**
 * Custom Assertion Engine (JS/Python)
 *
 * Extensible assertion system: users write custom grading functions in JS or Python.
 * Supports weighted assertions, assertion sets, score thresholds, named metrics.
 *
 * Usage (JS):
 *   const engine = new CustomAssertionEngine();
 *   engine.registerJs("tone_check", `(ctx) => ctx.output.includes("please") ? 1.0 : 0.0`);
 *   engine.registerJs("length_ok", `(ctx) => ctx.output.length < 500 ? 1.0 : 0.0`);
 *   const set = engine.createSet("quality", [
 *     { name: "tone_check", weight: 0.7, threshold: 0.5 },
 *     { name: "length_ok", weight: 0.3, threshold: 0.8 },
 *   ]);
 *   const result = await engine.runSet(set, { output: "Hello, please see..." });
 *
 * Usage (Python):
 *   engine.registerPython("sentiment", `
 * def grade(ctx):
 *     return 1.0 if "positive" in ctx["output"] else 0.0
 *   `);
 *
 * Issue: AMC-75 — BUILD: Custom Assertion Engine (JS/Python)
 */

import { execFile } from "node:child_process";
import { writeFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Context passed to every grading function. */
export interface AssertionContext {
  /** The agent/model output to grade */
  output: string;
  /** The original input/prompt (optional) */
  input?: string;
  /** Expected/reference output (optional) */
  expected?: string;
  /** Arbitrary metadata the user can pass in */
  meta?: Record<string, unknown>;
}

/** Result from a single assertion execution. */
export interface AssertionResult {
  /** Assertion name */
  name: string;
  /** Score from 0.0 to 1.0 */
  score: number;
  /** Whether the score meets the threshold */
  passed: boolean;
  /** Threshold that was applied */
  threshold: number;
  /** Weight within the assertion set */
  weight: number;
  /** Weighted contribution: score * weight */
  weightedScore: number;
  /** Duration in ms */
  durationMs: number;
  /** Error message if the grading function threw */
  error?: string;
}

/** Configuration for a single assertion within a set. */
export interface AssertionConfig {
  /** Registered assertion name */
  name: string;
  /** Weight (0–1, will be normalised within the set) */
  weight: number;
  /** Minimum score to pass (default 0.5) */
  threshold?: number;
}

/** A named group of weighted assertions. */
export interface AssertionSet {
  /** Set name (e.g. "quality", "safety", "relevance") */
  setName: string;
  /** Assertions in this set */
  assertions: AssertionConfig[];
}

/** Aggregate result from running an assertion set. */
export interface AssertionSetResult {
  /** Set name */
  setName: string;
  /** Weighted aggregate score (0–1) */
  aggregateScore: number;
  /** Whether ALL individual assertions passed their thresholds */
  allPassed: boolean;
  /** Whether the aggregate score meets the set-level threshold */
  setThresholdPassed: boolean;
  /** Set-level threshold (default 0.5) */
  setThreshold: number;
  /** Individual assertion results */
  results: AssertionResult[];
  /** Named metrics extracted during the run */
  metrics: Record<string, number>;
  /** Total duration of the set run in ms */
  totalDurationMs: number;
}

/** Registered assertion: runtime + source. */
interface RegisteredAssertion {
  name: string;
  runtime: "js" | "python";
  /** JS: function source string. Python: script source. */
  source: string;
  /** Optional description */
  description?: string;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class AssertionEngineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AssertionEngineError";
  }
}

export class AssertionThresholdError extends Error {
  constructor(
    public readonly setResult: AssertionSetResult,
    message?: string,
  ) {
    super(
      message ??
        `Assertion set "${setResult.setName}" failed: aggregate=${setResult.aggregateScore.toFixed(3)}, ` +
          `${setResult.results.filter((r) => !r.passed).length} assertion(s) below threshold`,
    );
    this.name = "AssertionThresholdError";
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clampScore(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function normaliseWeights(configs: AssertionConfig[]): AssertionConfig[] {
  const total = configs.reduce((s, c) => s + Math.max(0, c.weight), 0);
  if (total === 0) {
    // Equal weights if all zero
    const eq = 1 / configs.length;
    return configs.map((c) => ({ ...c, weight: eq }));
  }
  return configs.map((c) => ({ ...c, weight: Math.max(0, c.weight) / total }));
}

// ---------------------------------------------------------------------------
// Custom Assertion Engine
// ---------------------------------------------------------------------------

export class CustomAssertionEngine {
  private registry = new Map<string, RegisteredAssertion>();
  /** Named metrics accumulated across runs (reset per set run) */
  private runMetrics = new Map<string, number>();
  /** Python binary path (default: python3) */
  public pythonBin = "python3";
  /** Timeout for Python execution in ms */
  public pythonTimeoutMs = 30_000;

  // -----------------------------------------------------------------------
  // Registration
  // -----------------------------------------------------------------------

  /**
   * Register a JS grading function.
   *
   * The source must be a function expression that receives an AssertionContext
   * and returns a number (0–1) or a Promise<number>.
   *
   * Examples:
   *   "(ctx) => ctx.output.includes('yes') ? 1.0 : 0.0"
   *   "(ctx) => { const words = ctx.output.split(' ').length; return Math.min(1, words / 100); }"
   */
  registerJs(name: string, source: string, description?: string): void {
    if (!name || typeof name !== "string") {
      throw new AssertionEngineError("Assertion name must be a non-empty string");
    }
    if (!source || typeof source !== "string") {
      throw new AssertionEngineError(`JS source for "${name}" must be a non-empty string`);
    }
    this.registry.set(name, { name, runtime: "js", source, description });
  }

  /**
   * Register a Python grading function.
   *
   * The script must define a `grade(ctx: dict) -> float` function.
   * The engine will invoke it with a JSON-serialised context and parse stdout.
   *
   * Example:
   *   `
   *   def grade(ctx):
   *       return 1.0 if len(ctx["output"]) < 500 else 0.0
   *   `
   */
  registerPython(name: string, source: string, description?: string): void {
    if (!name || typeof name !== "string") {
      throw new AssertionEngineError("Assertion name must be a non-empty string");
    }
    if (!source || typeof source !== "string") {
      throw new AssertionEngineError(`Python source for "${name}" must be a non-empty string`);
    }
    this.registry.set(name, { name, runtime: "python", source, description });
  }

  /**
   * Unregister an assertion by name.
   */
  unregister(name: string): boolean {
    return this.registry.delete(name);
  }

  /**
   * List all registered assertion names.
   */
  listRegistered(): string[] {
    return [...this.registry.keys()];
  }

  /**
   * Get details of a registered assertion.
   */
  getRegistered(name: string): RegisteredAssertion | undefined {
    const r = this.registry.get(name);
    return r ? { ...r } : undefined;
  }

  // -----------------------------------------------------------------------
  // Set construction
  // -----------------------------------------------------------------------

  /**
   * Create an assertion set (validates that all referenced assertions exist).
   */
  createSet(setName: string, assertions: AssertionConfig[]): AssertionSet {
    if (!setName) throw new AssertionEngineError("Set name required");
    if (!assertions.length) throw new AssertionEngineError("At least one assertion required");
    for (const a of assertions) {
      if (!this.registry.has(a.name)) {
        throw new AssertionEngineError(
          `Assertion "${a.name}" not registered. Available: ${this.listRegistered().join(", ")}`,
        );
      }
    }
    return { setName, assertions };
  }

  // -----------------------------------------------------------------------
  // Execution: single assertion
  // -----------------------------------------------------------------------

  /**
   * Run a single registered assertion against a context.
   */
  async runOne(
    name: string,
    ctx: AssertionContext,
    threshold = 0.5,
    weight = 1,
  ): Promise<AssertionResult> {
    const reg = this.registry.get(name);
    if (!reg) {
      throw new AssertionEngineError(`Assertion "${name}" not registered`);
    }

    const start = performance.now();
    let score = 0;
    let error: string | undefined;

    try {
      if (reg.runtime === "js") {
        score = await this.execJs(reg.source, ctx);
      } else {
        score = await this.execPython(reg.source, ctx);
      }
      score = clampScore(score);
    } catch (err: unknown) {
      error = err instanceof Error ? err.message : String(err);
      score = 0;
    }

    const durationMs = performance.now() - start;
    const passed = score >= threshold;
    const weightedScore = score * weight;

    return { name, score, passed, threshold, weight, weightedScore, durationMs, error };
  }

  // -----------------------------------------------------------------------
  // Execution: assertion set
  // -----------------------------------------------------------------------

  /**
   * Run a full assertion set.
   *
   * @param set         The assertion set to run
   * @param ctx         Context object passed to each grading function
   * @param setThreshold  Minimum aggregate score for the set to pass (default 0.5)
   */
  async runSet(
    set: AssertionSet,
    ctx: AssertionContext,
    setThreshold = 0.5,
  ): Promise<AssertionSetResult> {
    const setStart = performance.now();
    this.runMetrics.clear();

    const normalised = normaliseWeights(set.assertions);
    const results: AssertionResult[] = [];

    for (const cfg of normalised) {
      const result = await this.runOne(
        cfg.name,
        ctx,
        cfg.threshold ?? 0.5,
        cfg.weight,
      );
      results.push(result);

      // Record as named metric
      this.runMetrics.set(cfg.name, result.score);
    }

    const aggregateScore = results.reduce((s, r) => s + r.weightedScore, 0);
    const allPassed = results.every((r) => r.passed);
    const setThresholdPassed = aggregateScore >= setThreshold;
    const totalDurationMs = performance.now() - setStart;

    return {
      setName: set.setName,
      aggregateScore,
      allPassed,
      setThresholdPassed,
      setThreshold,
      results,
      metrics: Object.fromEntries(this.runMetrics),
      totalDurationMs,
    };
  }

  /**
   * Run an assertion set and throw if the set-level threshold is not met.
   */
  async assertSet(
    set: AssertionSet,
    ctx: AssertionContext,
    setThreshold = 0.5,
  ): Promise<AssertionSetResult> {
    const result = await this.runSet(set, ctx, setThreshold);
    if (!result.setThresholdPassed) {
      throw new AssertionThresholdError(result);
    }
    return result;
  }

  // -----------------------------------------------------------------------
  // Named metrics
  // -----------------------------------------------------------------------

  /**
   * Record a custom named metric (can be called from JS grading functions
   * if they have access to the engine instance via ctx.meta._engine).
   */
  recordMetric(name: string, value: number): void {
    this.runMetrics.set(name, value);
  }

  /**
   * Get all metrics from the last set run.
   */
  getMetrics(): Record<string, number> {
    return Object.fromEntries(this.runMetrics);
  }

  // -----------------------------------------------------------------------
  // JS execution
  // -----------------------------------------------------------------------

  private async execJs(source: string, ctx: AssertionContext): Promise<number> {
    // Build the grading function from source
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const fn = new Function("ctx", `"use strict"; const __fn = ${source}; return __fn(ctx);`);
    const result = fn(ctx);
    // Support both sync and async grading functions
    const resolved = result instanceof Promise ? await result : result;
    return clampScore(resolved);
  }

  // -----------------------------------------------------------------------
  // Python execution
  // -----------------------------------------------------------------------

  private async execPython(source: string, ctx: AssertionContext): Promise<number> {
    const ctxJson = JSON.stringify(ctx);
    const wrapper = `
import json, sys

${source}

if __name__ == "__main__":
    ctx = json.loads(${JSON.stringify(ctxJson)})
    result = grade(ctx)
    # Ensure numeric
    result = float(result) if result is not None else 0.0
    print(json.dumps({"score": result}))
`;

    const tmpPath = join(tmpdir(), `amc-assertion-${randomUUID()}.py`);
    try {
      await writeFile(tmpPath, wrapper, "utf-8");
      const score = await new Promise<number>((resolve, reject) => {
        execFile(
          this.pythonBin,
          [tmpPath],
          { timeout: this.pythonTimeoutMs, maxBuffer: 1024 * 1024 },
          (err, stdout, stderr) => {
            if (err) {
              reject(
                new AssertionEngineError(
                  `Python assertion failed: ${err.message}${stderr ? `\nstderr: ${stderr}` : ""}`,
                ),
              );
              return;
            }
            try {
              const parsed = JSON.parse(stdout.trim());
              resolve(clampScore(parsed.score));
            } catch {
              reject(
                new AssertionEngineError(
                  `Failed to parse Python output: ${stdout.slice(0, 200)}`,
                ),
              );
            }
          },
        );
      });
      return score;
    } finally {
      await unlink(tmpPath).catch(() => {});
    }
  }

  // -----------------------------------------------------------------------
  // Reporting
  // -----------------------------------------------------------------------

  /**
   * Render a human-readable markdown report from an AssertionSetResult.
   */
  static renderReport(result: AssertionSetResult): string {
    const lines = [
      `# Assertion Set: ${result.setName}`,
      "",
      `- Aggregate Score: **${result.aggregateScore.toFixed(3)}**`,
      `- Set Threshold: ${result.setThreshold} → ${result.setThresholdPassed ? "✅ PASSED" : "❌ FAILED"}`,
      `- All Individual Thresholds Met: ${result.allPassed ? "✅" : "❌"}`,
      `- Total Duration: ${result.totalDurationMs.toFixed(0)}ms`,
      "",
      "## Individual Assertions",
      "",
      "| Assertion | Score | Threshold | Weight | Weighted | Passed | Duration |",
      "|-----------|------:|----------:|-------:|---------:|:------:|---------:|",
    ];

    for (const r of result.results) {
      const passIcon = r.passed ? "✅" : "❌";
      const errNote = r.error ? ` ⚠️` : "";
      lines.push(
        `| ${r.name}${errNote} | ${r.score.toFixed(3)} | ${r.threshold.toFixed(2)} | ${r.weight.toFixed(3)} | ${r.weightedScore.toFixed(3)} | ${passIcon} | ${r.durationMs.toFixed(0)}ms |`,
      );
    }

    const errorResults = result.results.filter((r) => r.error);
    if (errorResults.length > 0) {
      lines.push("");
      lines.push("## Errors");
      lines.push("");
      for (const r of errorResults) {
        lines.push(`- **${r.name}**: ${r.error}`);
      }
    }

    if (Object.keys(result.metrics).length > 0) {
      lines.push("");
      lines.push("## Named Metrics");
      lines.push("");
      lines.push("| Metric | Value |");
      lines.push("|--------|------:|");
      for (const [k, v] of Object.entries(result.metrics)) {
        lines.push(`| ${k} | ${v.toFixed(4)} |`);
      }
    }

    return lines.join("\n");
  }
}
