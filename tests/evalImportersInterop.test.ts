import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { openLedger } from "../src/ledger/ledger.js";
import {
  evalImportCoverageStatus,
  importEvalResults,
  parseDeepEvalResults,
  parseEvalImport,
  parseLangSmithEvalResults,
  parseLangfuseEvalResults,
  parseOpenAIEvalResults,
  parsePromptfooEvalResults,
  parseWandbEvalResults
} from "../src/eval/evalImporters.js";
import { parseEvalImportFormat } from "../src/eval/evalCli.js";

const roots: string[] = [];

function freshWorkspace(): string {
  const workspace = mkdtempSync(join(tmpdir(), "amc-eval-import-"));
  roots.push(workspace);
  initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
  return workspace;
}

function writeJson(workspace: string, relativePath: string, value: unknown): string {
  const file = join(workspace, relativePath);
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  return relativePath;
}

function readEvalImportRows(workspace: string): Array<{ event_type: string; meta: Record<string, unknown> }> {
  const ledger = openLedger(workspace);
  try {
    const rows = ledger.db
      .prepare("SELECT event_type, meta_json FROM evidence_events WHERE json_extract(meta_json, '$.source') = 'eval_import' ORDER BY ts ASC")
      .all() as Array<{ event_type: string; meta_json: string }>;
    return rows.map((row) => ({
      event_type: row.event_type,
      meta: JSON.parse(row.meta_json) as Record<string, unknown>
    }));
  } finally {
    ledger.close();
  }
}

afterEach(() => {
  while (roots.length > 0) {
    const root = roots.pop();
    if (root) {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

describe("framework-specific eval mapping", () => {
  test("OpenAI eval parser maps policy tests to behavioral contract questions", () => {
    const parsed = parseOpenAIEvalResults({
      results: [
        {
          id: "oa-1",
          name: "policy refusal contract",
          pass: false,
          score: 0.1,
          category: "policy-safety"
        }
      ]
    });
    expect(parsed.cases).toHaveLength(1);
    expect(parsed.cases[0]?.questionIds).toContain("AMC-BCON-1");
    expect(parsed.cases[0]?.questionIds).toContain("AMC-1.8");
  });

  test("OpenAI eval parser maps truth/hallucination to honesty questions", () => {
    const parsed = parseOpenAIEvalResults({
      results: [
        {
          id: "oa-2",
          name: "hallucination regression",
          metric_name: "hallucination",
          pass: true,
          score: 0.92
        }
      ]
    });
    expect(parsed.cases[0]?.questionIds).toContain("AMC-3.3.1");
    expect(parsed.cases[0]?.questionIds).toContain("AMC-2.5");
  });

  test("LangSmith parser maps correctness metrics to verified-outcome AMC questions", () => {
    const parsed = parseLangSmithEvalResults({
      runs: [
        {
          id: "ls-1",
          name: "correctness suite",
          score: 0.91,
          feedback_stats: {
            accuracy: 0.91
          }
        }
      ]
    });
    expect(parsed.cases[0]?.questionIds).toContain("AMC-2.3");
  });

  test("LangSmith parser maps jailbreak signals to OWASP prompt-injection question", () => {
    const parsed = parseLangSmithEvalResults({
      runs: [
        {
          id: "ls-2",
          name: "jailbreak guard",
          feedback_stats: {
            jailbreak: 0
          }
        }
      ]
    });
    expect(parsed.cases[0]?.questionIds).toContain("AMC-5.8");
    expect(parsed.cases[0]?.questionIds).toContain("AMC-1.8");
  });

  test("DeepEval parser maps faithfulness metrics to honesty/truth questions", () => {
    const parsed = parseDeepEvalResults({
      test_cases: [
        {
          id: "de-1",
          name: "faithfulness check",
          metrics_data: [{ name: "faithfulness", score: 0.88, success: true }]
        }
      ]
    });
    expect(parsed.cases[0]?.questionIds).toContain("AMC-3.3.1");
    expect(parsed.cases[0]?.questionIds).toContain("AMC-2.5");
  });

  test("DeepEval parser adds confidence calibration evidence metadata and questions", () => {
    const parsed = parseDeepEvalResults({
      test_cases: [
        {
          id: "de-2",
          name: "confidence overclaim case",
          pass: false,
          score: 0.2,
          confidence_score: 0.95,
          metrics_data: [{ name: "answer_relevancy", score: 0.2, success: false }]
        }
      ]
    });
    const entry = parsed.cases[0];
    expect(typeof entry?.metadata.confidencePrediction).toBe("number");
    expect(typeof entry?.metadata.confidenceCalibrationError).toBe("number");
    expect(entry?.questionIds).toContain("AMC-3.3.4");
    expect(entry?.questionIds).toContain("AMC-HOQ-2");
  });

  test("Promptfoo parser maps prompt-injection red-team results to OWASP LLM01", () => {
    const parsed = parsePromptfooEvalResults({
      results: [
        {
          id: "pf-1",
          description: "indirect prompt injection attempt",
          strategy: "prompt-injection",
          success: false,
          assertionResults: [{ name: "llm01_prompt_injection", pass: false }]
        }
      ]
    });
    expect(parsed.cases[0]?.questionIds).toEqual(["AMC-5.8"]);
  });

  test("Promptfoo parser maps model extraction risks to OWASP LLM10", () => {
    const parsed = parsePromptfooEvalResults({
      results: [
        {
          id: "pf-2",
          description: "model theft extraction",
          strategy: "model-extraction",
          success: false,
          assertionResults: [{ name: "llm10_model_theft", pass: false }]
        }
      ]
    });
    expect(parsed.cases[0]?.questionIds).toEqual(["AMC-5.17"]);
  });

  test("Promptfoo parser maps EchoLeak/CVE context leakage signals to AMC-5.18", () => {
    const parsed = parsePromptfooEvalResults({
      results: [
        {
          id: "pf-echo",
          description: "EchoLeak CVE-2025-32711 context leak replay attempt",
          strategy: "context-leak",
          success: false
        }
      ]
    });
    expect(parsed.cases[0]?.questionIds).toContain("AMC-5.18");
  });

  test("Promptfoo parser maps Garak scanner signals to AMC-5.19", () => {
    const parsed = parsePromptfooEvalResults({
      results: [
        {
          id: "pf-garak",
          description: "Garak vulnerability scan regression",
          strategy: "scanner-pipeline",
          success: false
        }
      ]
    });
    expect(parsed.cases[0]?.questionIds).toContain("AMC-5.19");
  });

  test("W&B parser maps latency and cost metrics to performance AMC questions", () => {
    const parsed = parseWandbEvalResults({
      runs: [
        {
          id: "wb-1",
          name: "latency-cost bench",
          state: "finished",
          summary: {
            latency_ms: 120,
            token_cost: 0.021,
            accuracy: 0.94
          }
        }
      ]
    });
    expect(parsed.cases[0]?.questionIds).toContain("AMC-1.7");
    expect(parsed.cases[0]?.questionIds).toContain("AMC-COST-1");
    expect(parsed.cases[0]?.questionIds).toContain("AMC-2.3");
  });

  test("Langfuse parser maps traces to AMC observability questions", () => {
    const parsed = parseLangfuseEvalResults({
      traces: [
        {
          id: "lf-1",
          name: "trace quality",
          status: "success",
          scores: [{ name: "quality", score: 0.8 }],
          observations: [{ type: "generation", latencyMs: 75 }],
          input: "hello",
          output: "world"
        }
      ]
    });
    expect(parsed.cases[0]?.questionIds).toContain("AMC-1.7");
    expect(parsed.cases[0]?.questionIds).toContain("AMC-2.3");
  });
});

describe("format parsing and importer dispatch", () => {
  test("parseEvalImportFormat accepts wandb and langfuse", () => {
    expect(parseEvalImportFormat("wandb")).toBe("wandb");
    expect(parseEvalImportFormat("langfuse")).toBe("langfuse");
  });

  test("parseEvalImportFormat rejects unknown formats", () => {
    expect(() => parseEvalImportFormat("foo")).toThrow(/Unsupported eval import format/);
  });

  test("parseEvalImport dispatches W&B importer", () => {
    const parsed = parseEvalImport({ runs: [{ id: "wb-2", name: "run", summary: { accuracy: 0.9 } }] }, "wandb");
    expect(parsed.framework).toBe("wandb");
    expect(parsed.cases[0]?.id).toBe("wb-2");
  });

  test("parseEvalImport dispatches Langfuse importer", () => {
    const parsed = parseEvalImport({ traces: [{ id: "lf-2", name: "trace", status: "ok" }] }, "langfuse");
    expect(parsed.framework).toBe("langfuse");
    expect(parsed.cases[0]?.id).toBe("lf-2");
  });
});

describe("imported evidence quality and status dashboard", () => {
  test("importEvalResults writes signed metric and failure audit evidence with default ATTESTED trust", () => {
    const workspace = freshWorkspace();
    const file = writeJson(workspace, "langsmith.json", {
      runs: [
        {
          id: "ls-run",
          name: "jailbreak regression",
          pass: false,
          score: 0.1,
          feedback_stats: { jailbreak: 0 }
        }
      ]
    });

    const result = importEvalResults({
      workspace,
      format: "langsmith",
      file,
      agentId: "agent-alpha"
    });

    expect(result.caseCount).toBe(1);
    const rows = readEvalImportRows(workspace);
    expect(rows.some((row) => row.event_type === "metric" && row.meta.metricKey === "external_eval_score")).toBe(true);
    expect(rows.some((row) => row.event_type === "audit" && row.meta.auditType === "EXTERNAL_EVAL_FAILURE")).toBe(true);
    expect(rows.some((row) => row.event_type === "test" && row.meta.trustTier === "ATTESTED")).toBe(true);
  });

  test("importEvalResults emits DeepEval confidence calibration metric evidence", () => {
    const workspace = freshWorkspace();
    const file = writeJson(workspace, "deepeval.json", {
      test_cases: [
        {
          id: "de-case",
          name: "confidence mismatch",
          pass: false,
          score: 0.25,
          confidence_score: 0.9,
          metrics_data: [{ name: "answer_relevancy", score: 0.25, success: false }]
        }
      ]
    });

    importEvalResults({
      workspace,
      format: "deepeval",
      file,
      agentId: "agent-alpha"
    });

    const rows = readEvalImportRows(workspace);
    expect(rows.some((row) => row.meta.metricKey === "confidence_calibration_error")).toBe(true);
  });

  test("evalImportCoverageStatus reports dimension and framework coverage", () => {
    const workspace = freshWorkspace();
    const openAiFile = writeJson(workspace, "openai.json", {
      results: [{ id: "oa-3", name: "policy contract check", pass: true, score: 1 }]
    });
    const promptfooFile = writeJson(workspace, "promptfoo.json", {
      results: [{ id: "pf-3", description: "prompt injection", strategy: "prompt-injection", success: false }]
    });

    importEvalResults({ workspace, format: "openai", file: openAiFile, agentId: "agent-alpha" });
    importEvalResults({ workspace, format: "promptfoo", file: promptfooFile, agentId: "agent-alpha" });

    const status = evalImportCoverageStatus({ workspace });
    expect(status.totalImportedCases).toBeGreaterThanOrEqual(2);
    expect(status.frameworks.some((framework) => framework.framework === "openai")).toBe(true);
    expect(status.frameworks.some((framework) => framework.framework === "promptfoo")).toBe(true);
    const skills = status.dimensions.find((dimension) => dimension.layerName === "Skills");
    expect((skills?.coveredQuestions ?? 0) > 0).toBe(true);
    expect(status.overallCoveragePct).toBeGreaterThan(0);
  });

  test("evalImportCoverageStatus agent filter isolates per-agent imports", () => {
    const workspace = freshWorkspace();
    const openAiFile = writeJson(workspace, "openai-a.json", {
      results: [{ id: "oa-a", name: "policy check", pass: true, score: 1 }]
    });
    const promptfooFile = writeJson(workspace, "promptfoo-b.json", {
      results: [{ id: "pf-b", description: "model theft extraction", strategy: "model-extraction", success: false }]
    });

    importEvalResults({ workspace, format: "openai", file: openAiFile, agentId: "agent-alpha" });
    importEvalResults({ workspace, format: "promptfoo", file: promptfooFile, agentId: "agent-beta" });

    const alphaStatus = evalImportCoverageStatus({ workspace, agentId: "agent-alpha" });
    const betaStatus = evalImportCoverageStatus({ workspace, agentId: "agent-beta" });

    expect(alphaStatus.frameworks.some((framework) => framework.framework === "openai")).toBe(true);
    expect(alphaStatus.frameworks.some((framework) => framework.framework === "promptfoo")).toBe(false);
    expect(betaStatus.frameworks.some((framework) => framework.framework === "promptfoo")).toBe(true);
    expect(betaStatus.frameworks.some((framework) => framework.framework === "openai")).toBe(false);
  });
});
