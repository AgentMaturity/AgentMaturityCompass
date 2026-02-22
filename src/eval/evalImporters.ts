import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { questionIds } from "../diagnostic/questionBank.js";
import { resolveAgentId } from "../fleet/paths.js";
import { hashBinaryOrPath, openLedger } from "../ledger/ledger.js";
import type { TrustTier } from "../types.js";
import { pathExists, readUtf8 } from "../utils/fs.js";

export type EvalImportFormat = "openai" | "langsmith" | "deepeval" | "promptfoo";

export interface EvalImportCase {
  id: string;
  name: string;
  pass: boolean | null;
  score: number | null;
  inputSnippet: string | null;
  outputSnippet: string | null;
  expectedSnippet: string | null;
  metricNames: string[];
  questionIds: string[];
  ts: number | null;
  metadata: Record<string, unknown>;
}

export interface ParsedEvalImport {
  framework: EvalImportFormat;
  runId: string | null;
  runName: string | null;
  cases: EvalImportCase[];
}

export interface EvalImportResult {
  format: EvalImportFormat;
  file: string;
  sessionId: string;
  runId: string | null;
  caseCount: number;
  passedCount: number;
  failedCount: number;
  eventIds: string[];
  questionCoverage: Record<string, number>;
}

const SUPPORTED_QUESTION_IDS = new Set(questionIds);
const DEFAULT_QUESTION_IDS = ["AMC-1.7"];
const MAX_SNIPPET_CHARS = 2_400;

const QUESTION_SIGNAL_MAP: Array<{ pattern: RegExp; questionIds: string[] }> = [
  {
    pattern: /(hallucin|factual|truth|faithful|grounded|correctness|accuracy|qa|answer relevance)/i,
    questionIds: ["AMC-2.3", "AMC-3.3.1"]
  },
  {
    pattern: /(toxicity|harm|unsafe|jailbreak|prompt injection|attack|refusal|policy violation)/i,
    questionIds: ["AMC-5.3", "AMC-1.8"]
  },
  {
    pattern: /(privacy|pii|secret|exfil|leak|sensitive)/i,
    questionIds: ["AMC-4.6", "AMC-5.3"]
  },
  {
    pattern: /(bias|fair|stereotype|demographic|parity|disparate impact|counterfactual)/i,
    questionIds: ["AMC-3.4.1", "AMC-3.4.2", "AMC-3.4.3"]
  },
  {
    pattern: /(latency|response time|throughput|slo|regression|reliability|availability|uptime)/i,
    questionIds: ["AMC-1.7"]
  },
  {
    pattern: /(retrieval|rag|citation|source|grounding|context recall)/i,
    questionIds: ["AMC-4.1", "AMC-2.3"]
  },
  {
    pattern: /(compliance|gdpr|soc2|nist|permission|consent|governance)/i,
    questionIds: ["AMC-3.2.3", "AMC-1.8"]
  }
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null;
}

function asRecordArray(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(isRecord);
}

function pickString(source: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return null;
}

function pickBoolean(source: Record<string, unknown>, keys: string[]): boolean | null {
  for (const key of keys) {
    const value = source[key];
    const parsed = toBoolean(value);
    if (parsed !== null) {
      return parsed;
    }
  }
  return null;
}

function pickNumber(source: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = source[key];
    const parsed = toNumber(value);
    if (parsed !== null) {
      return parsed;
    }
  }
  return null;
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function toBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    if (value === 1) {
      return true;
    }
    if (value === 0) {
      return false;
    }
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true" || normalized === "pass" || normalized === "passed" || normalized === "success") {
      return true;
    }
    if (normalized === "false" || normalized === "fail" || normalized === "failed" || normalized === "error") {
      return false;
    }
  }
  return null;
}

function timestampFromUnknown(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value > 10_000_000_000 ? Math.round(value) : Math.round(value * 1_000);
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function unique(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    if (!seen.has(value)) {
      seen.add(value);
      out.push(value);
    }
  }
  return out;
}

function tokenizeQuestionIdValue(value: unknown): string[] {
  if (Array.isArray(value)) {
    const out: string[] = [];
    for (const entry of value) {
      out.push(...tokenizeQuestionIdValue(entry));
    }
    return out;
  }
  if (typeof value !== "string") {
    return [];
  }
  return value
    .split(/[\s,;|]+/)
    .map((token) => token.trim().toUpperCase())
    .filter((token) => token.startsWith("AMC-"));
}

function explicitQuestionIds(record: Record<string, unknown>): string[] {
  const fields = [
    "questionId",
    "question_id",
    "questionIds",
    "question_ids",
    "amcQuestionId",
    "amcQuestionIds",
    "affectedQuestionIds",
    "affected_question_ids"
  ];
  const out: string[] = [];
  for (const field of fields) {
    out.push(...tokenizeQuestionIdValue(record[field]));
  }
  return unique(out.filter((id) => SUPPORTED_QUESTION_IDS.has(id)));
}

function scoreToUnitInterval(score: number): number {
  const abs = Math.abs(score);
  if (abs <= 1) {
    return score;
  }
  if (abs <= 5) {
    return score / 5;
  }
  if (abs <= 10) {
    return score / 10;
  }
  if (abs <= 100) {
    return score / 100;
  }
  return Math.max(-1, Math.min(1, score));
}

function inferPassFromScore(score: number): boolean {
  return scoreToUnitInterval(score) >= 0.5;
}

function valueSnippet(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  const raw =
    typeof value === "string"
      ? value
      : (() => {
          try {
            return JSON.stringify(value);
          } catch {
            return String(value);
          }
        })();
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return null;
  }
  if (trimmed.length <= MAX_SNIPPET_CHARS) {
    return trimmed;
  }
  return `${trimmed.slice(0, MAX_SNIPPET_CHARS)}…`;
}

function filterMetadata(input: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    const value = input[key];
    if (value !== undefined) {
      out[key] = value;
    }
  }
  return out;
}

function collectMetricNames(...values: unknown[]): string[] {
  const out: string[] = [];
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) {
      out.push(value.trim());
      continue;
    }
    if (Array.isArray(value)) {
      for (const entry of value) {
        if (typeof entry === "string" && entry.trim().length > 0) {
          out.push(entry.trim());
          continue;
        }
        if (isRecord(entry)) {
          const named = pickString(entry, ["name", "metric", "metric_name", "key", "assertion", "type"]);
          if (named) {
            out.push(named);
          }
        }
      }
      continue;
    }
    if (isRecord(value)) {
      for (const key of Object.keys(value)) {
        out.push(key);
      }
      const nestedName = pickString(value, ["name", "metric", "metric_name", "key", "assertion", "type"]);
      if (nestedName) {
        out.push(nestedName);
      }
    }
  }
  return unique(out.map((name) => name.trim()).filter((name) => name.length > 0));
}

function inferQuestionIds(params: {
  explicitQuestionIds: string[];
  caseName: string;
  metricNames: string[];
  additionalSignals: string[];
}): string[] {
  const explicit = params.explicitQuestionIds.filter((id) => SUPPORTED_QUESTION_IDS.has(id));
  if (explicit.length > 0) {
    return explicit;
  }
  const signalCorpus = [params.caseName, ...params.metricNames, ...params.additionalSignals].join(" ");
  const inferred: string[] = [];
  for (const mapping of QUESTION_SIGNAL_MAP) {
    if (mapping.pattern.test(signalCorpus)) {
      inferred.push(...mapping.questionIds);
    }
  }
  if (inferred.length === 0) {
    inferred.push(...DEFAULT_QUESTION_IDS);
  }
  const valid = inferred.filter((id) => SUPPORTED_QUESTION_IDS.has(id));
  return unique(valid.length > 0 ? valid : DEFAULT_QUESTION_IDS);
}

function parseRawJsonOrJsonl(file: string): unknown {
  const raw = readUtf8(file);
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    throw new Error(`Eval file is empty: ${file}`);
  }
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    const lines = trimmed.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.length > 0);
    if (lines.length === 0) {
      throw new Error(`Eval file has no JSON payloads: ${file}`);
    }
    const parsedLines = lines.map((line, index) => {
      try {
        return JSON.parse(line) as unknown;
      } catch {
        throw new Error(`Invalid JSONL in ${file} at line ${index + 1}`);
      }
    });
    return parsedLines;
  }
}

function rowsFromInput(input: unknown, candidateKeys: string[]): Record<string, unknown>[] {
  if (Array.isArray(input)) {
    return asRecordArray(input);
  }
  const root = asRecord(input);
  if (!root) {
    return [];
  }
  const rows: Record<string, unknown>[] = [];
  for (const key of candidateKeys) {
    const value = root[key];
    rows.push(...asRecordArray(value));
    const nestedRecord = asRecord(value);
    if (nestedRecord) {
      rows.push(...asRecordArray(nestedRecord.results));
      rows.push(...asRecordArray(nestedRecord.items));
      rows.push(...asRecordArray(nestedRecord.data));
      rows.push(...asRecordArray(nestedRecord.rows));
      rows.push(...asRecordArray(nestedRecord.test_cases));
      rows.push(...asRecordArray(nestedRecord.testCases));
      rows.push(...asRecordArray(nestedRecord.cases));
    }
  }
  if (rows.length === 0) {
    rows.push(root);
  }
  return rows;
}

function parseCaseTimestamp(...sources: Array<Record<string, unknown> | null>): number | null {
  const keys = ["ts", "timestamp", "created_at", "createdAt", "completed_at", "completedAt", "updated_at", "updatedAt"];
  for (const source of sources) {
    if (!source) {
      continue;
    }
    for (const key of keys) {
      const ts = timestampFromUnknown(source[key]);
      if (ts !== null) {
        return ts;
      }
    }
  }
  return null;
}

function derivePassAndScore(input: {
  pass: boolean | null;
  score: number | null;
  threshold: number | null;
}): { pass: boolean | null; score: number | null } {
  let pass = input.pass;
  let score = input.score;
  if (pass === null && score !== null) {
    if (input.threshold !== null) {
      pass = score >= input.threshold;
    } else {
      pass = inferPassFromScore(score);
    }
  }
  if (score === null && pass !== null) {
    score = pass ? 1 : 0;
  }
  return { pass, score };
}

export function parseOpenAIEvalResults(input: unknown): ParsedEvalImport {
  const root = asRecord(input);
  const rows = rowsFromInput(input, ["results", "samples", "items", "data", "records", "cases"]);
  const runId = root ? pickString(root, ["run_id", "runId", "id", "eval_id", "evalId"]) : null;
  const runName = root ? pickString(root, ["name", "run_name", "runName", "eval_name", "evalName"]) : null;

  const cases = rows.map((row, index) => {
    const result = asRecord(row.result);
    const sample = asRecord(row.sample);
    const metrics = asRecord(row.metrics);
    const nestedMetrics = asRecord(result?.metrics ?? sample?.metrics);
    const caseName =
      pickString(row, ["name", "test_name", "testName", "case_name", "caseName", "sample_name", "sampleName"]) ??
      pickString(result ?? {}, ["name", "test_name", "testName"]) ??
      `openai-eval-${index + 1}`;
    const metricNames = collectMetricNames(metrics, nestedMetrics, row.metric_name, row.metricName, row.metric);
    const threshold = pickNumber(row, ["threshold", "pass_threshold", "passThreshold"]);
    const derived = derivePassAndScore({
      pass: pickBoolean(row, ["pass", "passed", "success", "correct", "ok"]),
      score:
        pickNumber(row, ["score", "value", "normalized_score", "normalizedScore"]) ??
        pickNumber(metrics ?? {}, ["score", "value", "accuracy"]) ??
        pickNumber(nestedMetrics ?? {}, ["score", "value", "accuracy"]),
      threshold
    });
    const explicit = unique([
      ...explicitQuestionIds(row),
      ...explicitQuestionIds(result ?? {}),
      ...explicitQuestionIds(sample ?? {})
    ]);
    const questionIdsForCase = inferQuestionIds({
      explicitQuestionIds: explicit,
      caseName,
      metricNames,
      additionalSignals: [
        pickString(row, ["category", "evaluator", "grader", "task"]) ?? "",
        pickString(result ?? {}, ["category", "evaluator", "grader", "task"]) ?? ""
      ]
    });
    return {
      id:
        pickString(row, ["id", "sample_id", "sampleId", "case_id", "caseId", "test_id", "testId"]) ??
        `${runId ?? "openai"}-${index + 1}`,
      name: caseName,
      pass: derived.pass,
      score: derived.score,
      inputSnippet:
        valueSnippet(row.input ?? result?.input ?? sample?.input ?? row.prompt ?? sample?.prompt ?? row.messages) ?? null,
      outputSnippet:
        valueSnippet(row.output ?? row.completion ?? row.response ?? result?.output ?? result?.response ?? sample?.output) ?? null,
      expectedSnippet:
        valueSnippet(row.expected ?? row.ideal ?? row.reference ?? sample?.ideal ?? sample?.expected ?? result?.expected) ?? null,
      metricNames,
      questionIds: questionIdsForCase,
      ts: parseCaseTimestamp(row, result, sample),
      metadata: {
        ...filterMetadata(row, ["model", "model_name", "dataset", "task", "grader"]),
        ...(threshold !== null ? { threshold } : {})
      }
    } satisfies EvalImportCase;
  });

  return {
    framework: "openai",
    runId,
    runName,
    cases
  };
}

function average(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function numericValuesFromRecord(record: Record<string, unknown>): number[] {
  const out: number[] = [];
  for (const value of Object.values(record)) {
    const parsed = toNumber(value);
    if (parsed !== null) {
      out.push(parsed);
    }
  }
  return out;
}

export function parseLangSmithEvalResults(input: unknown): ParsedEvalImport {
  const root = asRecord(input);
  const rows = rowsFromInput(input, ["runs", "results", "data", "rows"]);
  const runId = root ? pickString(root, ["id", "project_id", "projectId", "run_id", "runId"]) : null;
  const runName = root ? pickString(root, ["name", "project_name", "projectName", "run_name", "runName"]) : null;

  const cases = rows.map((row, index) => {
    const run = asRecord(row.run) ?? row;
    const evaluationResults = asRecord(row.evaluation_results);
    const evalItems = asRecordArray(evaluationResults?.results ?? row.evaluation_results ?? row.feedback);
    const feedbackStats = asRecord(run.feedback_stats ?? row.feedback_stats);
    const metricNames = collectMetricNames(
      evalItems.map((entry) => pickString(entry, ["key", "name", "metric", "metric_name"])).filter((entry): entry is string => !!entry),
      feedbackStats
    );
    const evalScores = evalItems
      .map((entry) => pickNumber(entry, ["score", "value"]))
      .filter((value): value is number => value !== null);
    const statScores = feedbackStats ? numericValuesFromRecord(feedbackStats) : [];
    const threshold = pickNumber(row, ["threshold", "pass_threshold", "passThreshold"]);
    const derived = derivePassAndScore({
      pass:
        pickBoolean(row, ["pass", "passed", "success"]) ??
        pickBoolean(run, ["pass", "passed", "success"]) ??
        (() => {
          const evalPasses = evalItems.map((entry) => pickBoolean(entry, ["pass", "passed", "success"]));
          const known = evalPasses.filter((value): value is boolean => value !== null);
          if (known.length === 0) {
            return null;
          }
          return known.every(Boolean);
        })(),
      score:
        pickNumber(row, ["score", "value"]) ??
        pickNumber(run, ["score", "value"]) ??
        average([...evalScores, ...statScores]),
      threshold
    });

    const caseName = pickString(run, ["name"]) ?? pickString(row, ["name", "run_name", "runName"]) ?? `langsmith-eval-${index + 1}`;
    const explicit = unique([...explicitQuestionIds(row), ...explicitQuestionIds(run)]);
    const questionIdsForCase = inferQuestionIds({
      explicitQuestionIds: explicit,
      caseName,
      metricNames,
      additionalSignals: [
        pickString(row, ["evaluator", "feedback_key", "feedbackKey"]) ?? "",
        pickString(run, ["project_name", "projectName"]) ?? ""
      ]
    });
    return {
      id: pickString(run, ["id", "run_id", "runId"]) ?? pickString(row, ["id", "row_id", "rowId"]) ?? `${runId ?? "langsmith"}-${index + 1}`,
      name: caseName,
      pass: derived.pass,
      score: derived.score,
      inputSnippet: valueSnippet(run.inputs ?? row.inputs ?? row.input),
      outputSnippet: valueSnippet(run.outputs ?? row.outputs ?? row.output),
      expectedSnippet: valueSnippet(run.reference_outputs ?? row.reference_outputs ?? row.expected),
      metricNames,
      questionIds: questionIdsForCase,
      ts: parseCaseTimestamp(row, run),
      metadata: {
        ...filterMetadata(run, ["session_id", "execution_order", "status", "run_type"]),
        ...filterMetadata(row, ["project_name", "projectName"]),
        ...(threshold !== null ? { threshold } : {})
      }
    } satisfies EvalImportCase;
  });

  return {
    framework: "langsmith",
    runId,
    runName,
    cases
  };
}

export function parseDeepEvalResults(input: unknown): ParsedEvalImport {
  const root = asRecord(input);
  const rows = rowsFromInput(input, ["test_cases", "testCases", "results", "cases", "data"]);
  const runId = root ? pickString(root, ["test_run_id", "testRunId", "run_id", "runId", "id"]) : null;
  const runName = root ? pickString(root, ["name", "test_name", "testName", "suite_name", "suiteName"]) : null;

  const cases = rows.map((row, index) => {
    const metrics = asRecordArray(row.metrics_data ?? row.metricsData ?? row.metrics ?? row.metricResults);
    const metricNames = collectMetricNames(
      metrics.map((metric) => pickString(metric, ["name", "metric", "metric_name", "key"])).filter((name): name is string => !!name)
    );
    const metricScores = metrics
      .map((metric) => pickNumber(metric, ["score", "value"]))
      .filter((value): value is number => value !== null);
    const metricPasses = metrics
      .map((metric) => pickBoolean(metric, ["success", "pass", "passed"]))
      .filter((value): value is boolean => value !== null);
    const threshold = pickNumber(row, ["threshold", "pass_threshold", "passThreshold"]);
    const derived = derivePassAndScore({
      pass:
        pickBoolean(row, ["success", "pass", "passed"]) ??
        (metricPasses.length > 0 ? metricPasses.every(Boolean) : null),
      score: pickNumber(row, ["score", "value", "overall_score", "overallScore"]) ?? average(metricScores),
      threshold
    });
    const caseName = pickString(row, ["name", "test_case_name", "testCaseName", "metric_name", "metricName"]) ?? `deepeval-case-${index + 1}`;
    const explicit = explicitQuestionIds(row);
    const questionIdsForCase = inferQuestionIds({
      explicitQuestionIds: explicit,
      caseName,
      metricNames,
      additionalSignals: [
        pickString(row, ["evaluation_model", "evaluationModel", "category", "task"]) ?? "",
        metrics.map((metric) => pickString(metric, ["reason", "comment"])).filter((value): value is string => !!value).join(" ")
      ]
    });
    return {
      id:
        pickString(row, ["id", "test_case_id", "testCaseId", "case_id", "caseId"]) ??
        `${runId ?? "deepeval"}-${index + 1}`,
      name: caseName,
      pass: derived.pass,
      score: derived.score,
      inputSnippet: valueSnippet(row.input ?? row.prompt ?? row.query),
      outputSnippet: valueSnippet(row.actual_output ?? row.actualOutput ?? row.output),
      expectedSnippet: valueSnippet(row.expected_output ?? row.expectedOutput ?? row.expected),
      metricNames,
      questionIds: questionIdsForCase,
      ts: parseCaseTimestamp(row),
      metadata: {
        ...filterMetadata(row, ["evaluation_model", "evaluationModel", "category", "task"]),
        ...(threshold !== null ? { threshold } : {})
      }
    } satisfies EvalImportCase;
  });

  return {
    framework: "deepeval",
    runId,
    runName,
    cases
  };
}

export function parsePromptfooEvalResults(input: unknown): ParsedEvalImport {
  const root = asRecord(input);
  const rows = rowsFromInput(input, ["results", "data", "rows", "cases"]);
  const runId = root ? pickString(root, ["id", "eval_id", "evalId", "run_id", "runId"]) : null;
  const runName = root ? pickString(root, ["name", "description", "suite", "suite_name", "suiteName"]) : null;

  const cases = rows.map((row, index) => {
    const testCase = asRecord(row.testCase);
    const response = asRecord(row.response);
    const prompt = asRecord(row.prompt);
    const grading = asRecord(row.gradingResult);
    const namedScores = asRecord(row.namedScores);
    const assertionItems = asRecordArray(row.assertionResults ?? row.assertions);
    const componentResults = asRecordArray(grading?.componentResults);
    const metricNames = collectMetricNames(
      namedScores,
      assertionItems.map((assertion) => pickString(assertion, ["name", "assertion", "type", "metric"])).filter((value): value is string => !!value),
      componentResults.map((result) => pickString(result, ["name", "metric", "type"])).filter((value): value is string => !!value)
    );
    const scoreValues = [
      ...numericValuesFromRecord(namedScores ?? {}),
      ...assertionItems
        .map((assertion) => pickNumber(assertion, ["score", "value"]))
        .filter((value): value is number => value !== null),
      ...componentResults
        .map((component) => pickNumber(component, ["score", "value"]))
        .filter((value): value is number => value !== null)
    ];
    const threshold = pickNumber(row, ["threshold", "pass_threshold", "passThreshold"]);
    const derived = derivePassAndScore({
      pass:
        pickBoolean(row, ["success", "pass", "passed"]) ??
        pickBoolean(grading ?? {}, ["pass", "passed", "success"]) ??
        (() => {
          const assertionPasses = assertionItems
            .map((assertion) => pickBoolean(assertion, ["pass", "passed", "success"]))
            .filter((value): value is boolean => value !== null);
          if (assertionPasses.length === 0) {
            return null;
          }
          return assertionPasses.every(Boolean);
        })(),
      score: pickNumber(row, ["score", "value"]) ?? pickNumber(grading ?? {}, ["score", "value"]) ?? average(scoreValues),
      threshold
    });

    const caseName =
      pickString(row, ["description", "name", "test_name", "testName"]) ??
      pickString(testCase ?? {}, ["description", "name"]) ??
      `promptfoo-case-${index + 1}`;
    const provider = isRecord(row.provider) ? pickString(row.provider, ["id", "name"]) : null;
    const explicit = unique([...explicitQuestionIds(row), ...explicitQuestionIds(testCase ?? {})]);
    const questionIdsForCase = inferQuestionIds({
      explicitQuestionIds: explicit,
      caseName,
      metricNames,
      additionalSignals: [provider ?? "", pickString(row, ["strategy", "purpose"]) ?? ""]
    });
    return {
      id: pickString(row, ["id", "result_id", "resultId"]) ?? `${runId ?? "promptfoo"}-${index + 1}`,
      name: caseName,
      pass: derived.pass,
      score: derived.score,
      inputSnippet: valueSnippet(prompt?.raw ?? prompt ?? testCase?.vars ?? row.vars ?? row.input),
      outputSnippet: valueSnippet(response?.output ?? row.output ?? response),
      expectedSnippet: valueSnippet(testCase?.assert ?? row.expected),
      metricNames,
      questionIds: questionIdsForCase,
      ts: parseCaseTimestamp(row),
      metadata: {
        ...(provider ? { provider } : {}),
        ...filterMetadata(row, ["latencyMs", "tokensUsed"]),
        ...(threshold !== null ? { threshold } : {})
      }
    } satisfies EvalImportCase;
  });

  return {
    framework: "promptfoo",
    runId,
    runName,
    cases
  };
}

export function parseEvalImport(input: unknown, format: EvalImportFormat): ParsedEvalImport {
  if (format === "openai") {
    return parseOpenAIEvalResults(input);
  }
  if (format === "langsmith") {
    return parseLangSmithEvalResults(input);
  }
  if (format === "deepeval") {
    return parseDeepEvalResults(input);
  }
  return parsePromptfooEvalResults(input);
}

function summarizeQuestionCoverage(cases: EvalImportCase[]): Record<string, number> {
  const coverage: Record<string, number> = {};
  for (const item of cases) {
    for (const questionId of item.questionIds) {
      coverage[questionId] = (coverage[questionId] ?? 0) + 1;
    }
  }
  return coverage;
}

export function importEvalResults(params: {
  workspace: string;
  format: EvalImportFormat;
  file: string;
  agentId?: string;
  trustTier?: TrustTier;
}): EvalImportResult {
  const workspace = params.workspace;
  const file = resolve(workspace, params.file);
  if (!pathExists(file)) {
    throw new Error(`Eval result file not found: ${file}`);
  }
  const raw = parseRawJsonOrJsonl(file);
  const parsed = parseEvalImport(raw, params.format);
  if (parsed.cases.length === 0) {
    throw new Error(`No evaluable rows found for format '${params.format}' in file: ${file}`);
  }

  const trustTier = params.trustTier ?? "SELF_REPORTED";
  const agentId = resolveAgentId(workspace, params.agentId);
  const questionCoverage = summarizeQuestionCoverage(parsed.cases);
  const sessionId = randomUUID();
  const eventIds: string[] = [];
  const ledger = openLedger(workspace);
  try {
    ledger.startSession({
      sessionId,
      runtime: "unknown",
      binaryPath: "amc-eval-import",
      binarySha256: hashBinaryOrPath("amc-eval-import", "1")
    });

    ledger.appendEvidence({
      sessionId,
      runtime: "unknown",
      eventType: "audit",
      payload: JSON.stringify({
        auditType: "EVAL_IMPORT_STARTED",
        severity: "LOW",
        framework: params.format,
        file,
        runId: parsed.runId,
        caseCount: parsed.cases.length
      }),
      payloadExt: "json",
      inline: true,
      meta: {
        source: "eval_import",
        auditType: "EVAL_IMPORT_STARTED",
        severity: "LOW",
        framework: params.format,
        file,
        runId: parsed.runId,
        caseCount: parsed.cases.length,
        trustTier,
        agentId
      }
    });

    for (const item of parsed.cases) {
      const primaryQuestionId = item.questionIds[0] ?? DEFAULT_QUESTION_IDS[0];
      const detailed = ledger.appendEvidenceDetailed({
        sessionId,
        runtime: "unknown",
        eventType: "test",
        payload: JSON.stringify({
          testType: "EXTERNAL_EVAL_CASE",
          framework: params.format,
          runId: parsed.runId,
          caseId: item.id,
          caseName: item.name,
          pass: item.pass,
          score: item.score,
          metricNames: item.metricNames,
          inputSnippet: item.inputSnippet,
          outputSnippet: item.outputSnippet,
          expectedSnippet: item.expectedSnippet,
          metadata: item.metadata
        }),
        payloadExt: "json",
        inline: true,
        ts: item.ts ?? undefined,
        meta: {
          source: "eval_import",
          framework: params.format,
          runId: parsed.runId,
          caseId: item.id,
          caseName: item.name,
          pass: item.pass,
          score: item.score,
          metricNames: item.metricNames,
          questionId: primaryQuestionId,
          questionIds: item.questionIds,
          trustTier,
          agentId
        }
      });
      eventIds.push(detailed.id);
    }

    const passedCount = parsed.cases.filter((row) => row.pass === true).length;
    const failedCount = parsed.cases.filter((row) => row.pass === false).length;
    ledger.appendEvidence({
      sessionId,
      runtime: "unknown",
      eventType: "audit",
      payload: JSON.stringify({
        auditType: "EVAL_IMPORT_COMPLETED",
        severity: "LOW",
        framework: params.format,
        file,
        runId: parsed.runId,
        caseCount: parsed.cases.length,
        passedCount,
        failedCount,
        questionCoverage
      }),
      payloadExt: "json",
      inline: true,
      meta: {
        source: "eval_import",
        auditType: "EVAL_IMPORT_COMPLETED",
        severity: "LOW",
        framework: params.format,
        file,
        runId: parsed.runId,
        caseCount: parsed.cases.length,
        passedCount,
        failedCount,
        questionCoverage,
        trustTier,
        agentId
      }
    });

    ledger.sealSession(sessionId);

    return {
      format: params.format,
      file,
      sessionId,
      runId: parsed.runId,
      caseCount: parsed.cases.length,
      passedCount,
      failedCount,
      eventIds,
      questionCoverage
    };
  } finally {
    ledger.close();
  }
}
