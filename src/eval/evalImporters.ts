import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { questionBank, questionIds } from "../diagnostic/questionBank.js";
import { resolveAgentId } from "../fleet/paths.js";
import { hashBinaryOrPath, openLedger } from "../ledger/ledger.js";
import type { LayerName, TrustTier } from "../types.js";
import { pathExists, readUtf8 } from "../utils/fs.js";

export type EvalImportFormat = "openai" | "langsmith" | "deepeval" | "promptfoo" | "wandb" | "langfuse";

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

export interface EvalFrameworkStatus {
  framework: EvalImportFormat;
  importedEvents: number;
  importedCases: number;
  passedCases: number;
  failedCases: number;
  mappedQuestions: string[];
  trustTierBreakdown: Record<TrustTier, number>;
  latestTs: number | null;
}

export interface EvalDimensionCoverage {
  layerName: LayerName;
  coveredQuestions: number;
  totalQuestions: number;
  coveragePct: number;
  questionIds: string[];
}

export interface EvalCoverageStatus {
  generatedTs: number;
  totalImportedEvents: number;
  totalImportedCases: number;
  mappedQuestionCount: number;
  totalQuestionCount: number;
  overallCoveragePct: number;
  frameworks: EvalFrameworkStatus[];
  dimensions: EvalDimensionCoverage[];
}

const SUPPORTED_QUESTION_IDS = new Set(questionIds);
const DEFAULT_QUESTION_IDS = ["AMC-1.7"];
const MAX_SNIPPET_CHARS = 2_400;
const DEFAULT_TRUST_TIER_BY_FORMAT: Record<EvalImportFormat, TrustTier> = {
  openai: "ATTESTED",
  langsmith: "ATTESTED",
  deepeval: "ATTESTED",
  promptfoo: "ATTESTED",
  wandb: "ATTESTED",
  langfuse: "ATTESTED"
};

const OWASP_LLM_TOP10_IDS = [
  "AMC-5.8",
  "AMC-5.9",
  "AMC-5.10",
  "AMC-5.11",
  "AMC-5.12",
  "AMC-5.13",
  "AMC-5.14",
  "AMC-5.15",
  "AMC-5.16",
  "AMC-5.17"
];
const PROMPTFOO_SECURITY_EXTENSION_IDS = ["AMC-5.18", "AMC-5.19"];
const PROMPTFOO_SECURITY_IDS = [...OWASP_LLM_TOP10_IDS, ...PROMPTFOO_SECURITY_EXTENSION_IDS];
const OPENAI_BEHAVIORAL_BASE_IDS = ["AMC-BCON-1", "AMC-1.8"];
const DEEPEVAL_CONFIDENCE_QUESTION_IDS = ["AMC-3.3.4", "AMC-HOQ-2", "AMC-OINT-1"];

type SignalQuestionMap = Array<{ pattern: RegExp; questionIds: string[] }>;

const GENERIC_SIGNAL_MAP: SignalQuestionMap = [
  {
    pattern: /(hallucin|factual|truth|faithful|grounded|correctness|accuracy|qa|answer relevance)/i,
    questionIds: ["AMC-2.3", "AMC-3.3.1", "AMC-2.5"]
  },
  {
    pattern: /(toxicity|harm|unsafe|jailbreak|prompt injection|attack|refusal|policy violation)/i,
    questionIds: ["AMC-1.8", "AMC-5.8"]
  },
  {
    pattern: /(privacy|pii|secret|exfil|leak|sensitive)/i,
    questionIds: ["AMC-1.8", "AMC-5.13", "AMC-5.18"]
  },
  {
    pattern: /(echoleak|cve-2025-32711|context leak|prompt leak|system prompt leak|garak|pyrit|vulnerability scan)/i,
    questionIds: ["AMC-5.18", "AMC-5.19"]
  },
  {
    pattern: /(bias|fair|stereotype|demographic|parity|disparate impact|counterfactual)/i,
    questionIds: ["AMC-3.4.1", "AMC-3.4.2", "AMC-3.4.3"]
  },
  {
    pattern: /(latency|response time|throughput|slo|regression|reliability|availability|uptime|trace)/i,
    questionIds: ["AMC-1.7"]
  },
  {
    pattern: /(retrieval|rag|citation|source|grounding|context recall)/i,
    questionIds: ["AMC-4.1", "AMC-2.3"]
  },
  {
    pattern: /(compliance|gdpr|soc2|nist|permission|consent|governance)/i,
    questionIds: ["AMC-1.8", "AMC-BCON-1"]
  }
];

const LANGSMITH_SIGNAL_MAP: SignalQuestionMap = [
  {
    pattern: /(correct|accuracy|factual|faithful|grounded|answer relevan|qa)/i,
    questionIds: ["AMC-2.3", "AMC-3.3.1"]
  },
  {
    pattern: /(hallucin|truth|honesty|truthful|uncertain)/i,
    questionIds: ["AMC-2.5", "AMC-3.3.1"]
  },
  {
    pattern: /(toxicity|safety|harm|policy|jailbreak|prompt injection|refusal)/i,
    questionIds: ["AMC-1.8", "AMC-5.8"]
  },
  {
    pattern: /(retrieval|context|citation|rag|grounding)/i,
    questionIds: ["AMC-4.1", "AMC-2.3"]
  },
  {
    pattern: /(latency|throughput|uptime|slo|regression|reliability)/i,
    questionIds: ["AMC-1.7"]
  },
  {
    pattern: /(cost|token|budget|compute)/i,
    questionIds: ["AMC-COST-1", "AMC-5.6"]
  },
  {
    pattern: /(bias|fair|stereotype|demographic|counterfactual|disparate)/i,
    questionIds: ["AMC-3.4.1", "AMC-3.4.2", "AMC-3.4.3"]
  }
];

const DEEPEVAL_SIGNAL_MAP: SignalQuestionMap = [
  {
    pattern: /(answer relevancy|relevancy|task completion|correct|accuracy|g[-_ ]?eval)/i,
    questionIds: ["AMC-2.3", "AMC-OINT-1"]
  },
  {
    pattern: /(faithfulness|hallucin|factual|grounded|truth)/i,
    questionIds: ["AMC-3.3.1", "AMC-2.5"]
  },
  {
    pattern: /(toxicity|safety|harm|jailbreak|prompt injection|policy)/i,
    questionIds: ["AMC-1.8", "AMC-5.8"]
  },
  {
    pattern: /(bias|fairness|stereotype|demographic|counterfactual|disparate)/i,
    questionIds: ["AMC-3.4.1", "AMC-3.4.2", "AMC-3.4.3"]
  },
  {
    pattern: /(retrieval|contextual precision|contextual recall|rag|citation)/i,
    questionIds: ["AMC-4.1", "AMC-2.3"]
  },
  {
    pattern: /(latency|reliability|stability|regression|consistency)/i,
    questionIds: ["AMC-1.7"]
  },
  {
    pattern: /(confidence|calibration|overconfidence|underconfidence)/i,
    questionIds: DEEPEVAL_CONFIDENCE_QUESTION_IDS
  }
];

const OPENAI_BEHAVIORAL_SIGNAL_MAP: SignalQuestionMap = [
  {
    pattern: /(behavior|contract|policy|safety|refusal|forbidden|boundary|jailbreak|prompt injection)/i,
    questionIds: ["AMC-BCON-1", "AMC-1.8"]
  },
  {
    pattern: /(truth|factual|hallucin|grounded|accuracy|evidence)/i,
    questionIds: ["AMC-2.5", "AMC-3.3.1", "AMC-OINT-1"]
  },
  {
    pattern: /(tool|action|autonomy|approval|escalation|side[- ]effect)/i,
    questionIds: ["AMC-GOV-PROACTIVE-1", "AMC-BCON-1"]
  },
  {
    pattern: /(confidence|calibration|uncertain)/i,
    questionIds: ["AMC-3.3.4", "AMC-HOQ-2"]
  }
];

const PROMPTFOO_OWASP_SIGNAL_MAP: SignalQuestionMap = [
  { pattern: /(llm01|prompt injection|jailbreak|instruction override|indirect injection)/i, questionIds: ["AMC-5.8"] },
  { pattern: /(llm02|insecure output|xss|script injection|unsafe render|output handling)/i, questionIds: ["AMC-5.9"] },
  { pattern: /(llm03|data poisoning|poisoned retrieval|rag poison|training data poisoning)/i, questionIds: ["AMC-5.10"] },
  { pattern: /(llm04|denial of service|dos|resource exhaustion|latency flood|token flood)/i, questionIds: ["AMC-5.11"] },
  { pattern: /(llm05|supply chain|dependency compromise|artifact tamper|model provenance)/i, questionIds: ["AMC-5.12"] },
  { pattern: /(llm06|sensitive information|secret leak|pii|exfiltration|credential disclosure)/i, questionIds: ["AMC-5.13"] },
  { pattern: /(llm07|insecure plugin|tool abuse|function call abuse|schema bypass)/i, questionIds: ["AMC-5.14"] },
  { pattern: /(llm08|excessive agency|autonomy abuse|unauthorized action)/i, questionIds: ["AMC-5.15"] },
  { pattern: /(llm09|overreliance|blind trust|automation bias|oversight bypass)/i, questionIds: ["AMC-5.16"] },
  { pattern: /(llm10|model theft|model extraction|prompt stealing|weight theft)/i, questionIds: ["AMC-5.17"] },
  { pattern: /(echoleak|cve-2025-32711|context leak|system prompt leak|prompt echo)/i, questionIds: ["AMC-5.18"] },
  { pattern: /(garak|pyrit|vulnerability scan|scanner pipeline|llm vuln scan)/i, questionIds: ["AMC-5.19"] }
];

const WANDB_PERFORMANCE_SIGNAL_MAP: SignalQuestionMap = [
  {
    pattern: /(accuracy|f1|precision|recall|rouge|bleu|success|pass rate|win rate|quality)/i,
    questionIds: ["AMC-2.3", "AMC-OINT-1"]
  },
  {
    pattern: /(latency|throughput|slo|uptime|availability|p95|p99|regression|reliability)/i,
    questionIds: ["AMC-1.7"]
  },
  {
    pattern: /(cost|token|compute|gpu|runtime spend|budget)/i,
    questionIds: ["AMC-COST-1", "AMC-5.6"]
  },
  {
    pattern: /(drift|stability|variance|stddev|degradation)/i,
    questionIds: ["AMC-2.2", "AMC-1.7"]
  },
  {
    pattern: /(hallucin|faithful|grounded|toxicity|safety)/i,
    questionIds: ["AMC-3.3.1", "AMC-1.8"]
  }
];

const LANGFUSE_OBSERVABILITY_SIGNAL_MAP: SignalQuestionMap = [
  {
    pattern: /(trace|observation|span|latency|token|cost|error|status|session|request)/i,
    questionIds: ["AMC-1.7"]
  },
  {
    pattern: /(score|quality|relevance|faithfulness|hallucin|grounded|correct)/i,
    questionIds: ["AMC-2.3", "AMC-OINT-1"]
  },
  {
    pattern: /(prompt injection|jailbreak|policy|safety|harm)/i,
    questionIds: ["AMC-1.8", "AMC-5.8"]
  }
];

const LAYER_NAMES: LayerName[] = [
  "Strategic Agent Operations",
  "Leadership & Autonomy",
  "Culture & Alignment",
  "Resilience",
  "Skills"
];
const QUESTION_LAYER_MAP = new Map(questionBank.map((question) => [question.id, question.layerName]));

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

function sanitizeQuestionIds(questionIds: string[], fallback: string[] = DEFAULT_QUESTION_IDS): string[] {
  const valid = questionIds.filter((questionId) => SUPPORTED_QUESTION_IDS.has(questionId));
  if (valid.length > 0) {
    return unique(valid);
  }
  return unique(fallback.filter((questionId) => SUPPORTED_QUESTION_IDS.has(questionId)));
}

function inferQuestionIdsFromSignals(params: {
  explicitQuestionIds: string[];
  caseName: string;
  metricNames: string[];
  additionalSignals: string[];
  mapping: SignalQuestionMap;
  fallback: string[];
}): string[] {
  const explicit = params.explicitQuestionIds.filter((questionId) => SUPPORTED_QUESTION_IDS.has(questionId));
  if (explicit.length > 0) {
    return unique(explicit);
  }
  const signalCorpus = [params.caseName, ...params.metricNames, ...params.additionalSignals].join(" ").toLowerCase();
  const inferred: string[] = [];
  for (const mappingEntry of params.mapping) {
    if (mappingEntry.pattern.test(signalCorpus)) {
      inferred.push(...mappingEntry.questionIds);
    }
  }
  return sanitizeQuestionIds(inferred, params.fallback);
}

function inferGenericQuestionIds(params: {
  explicitQuestionIds: string[];
  caseName: string;
  metricNames: string[];
  additionalSignals: string[];
}): string[] {
  return inferQuestionIdsFromSignals({
    ...params,
    mapping: GENERIC_SIGNAL_MAP,
    fallback: DEFAULT_QUESTION_IDS
  });
}

function inferOpenAIBehavioralQuestionIds(params: {
  explicitQuestionIds: string[];
  caseName: string;
  metricNames: string[];
  additionalSignals: string[];
}): string[] {
  const inferred = inferQuestionIdsFromSignals({
    ...params,
    mapping: OPENAI_BEHAVIORAL_SIGNAL_MAP,
    fallback: OPENAI_BEHAVIORAL_BASE_IDS
  });
  return sanitizeQuestionIds([...OPENAI_BEHAVIORAL_BASE_IDS, ...inferred], OPENAI_BEHAVIORAL_BASE_IDS);
}

function inferLangSmithQuestionIds(params: {
  explicitQuestionIds: string[];
  caseName: string;
  metricNames: string[];
  additionalSignals: string[];
}): string[] {
  return inferQuestionIdsFromSignals({
    ...params,
    mapping: LANGSMITH_SIGNAL_MAP,
    fallback: ["AMC-2.3", "AMC-1.7"]
  });
}

function inferDeepEvalQuestionIds(params: {
  explicitQuestionIds: string[];
  caseName: string;
  metricNames: string[];
  additionalSignals: string[];
}): string[] {
  return inferQuestionIdsFromSignals({
    ...params,
    mapping: DEEPEVAL_SIGNAL_MAP,
    fallback: ["AMC-2.3", "AMC-3.3.1"]
  });
}

function inferPromptfooOwaspQuestionIds(params: {
  explicitQuestionIds: string[];
  caseName: string;
  metricNames: string[];
  additionalSignals: string[];
}): string[] {
  const explicit = params.explicitQuestionIds.filter((questionId) => PROMPTFOO_SECURITY_IDS.includes(questionId));
  if (explicit.length > 0) {
    return unique(explicit);
  }
  return inferQuestionIdsFromSignals({
    ...params,
    mapping: PROMPTFOO_OWASP_SIGNAL_MAP,
    fallback: ["AMC-5.8"]
  });
}

function inferWandbPerformanceQuestionIds(params: {
  explicitQuestionIds: string[];
  caseName: string;
  metricNames: string[];
  additionalSignals: string[];
}): string[] {
  return inferQuestionIdsFromSignals({
    ...params,
    mapping: WANDB_PERFORMANCE_SIGNAL_MAP,
    fallback: ["AMC-1.7", "AMC-2.3"]
  });
}

function inferLangfuseObservabilityQuestionIds(params: {
  explicitQuestionIds: string[];
  caseName: string;
  metricNames: string[];
  additionalSignals: string[];
}): string[] {
  return inferQuestionIdsFromSignals({
    ...params,
    mapping: LANGFUSE_OBSERVABILITY_SIGNAL_MAP,
    fallback: ["AMC-1.7"]
  });
}

function normalizedScore(score: number | null): number | null {
  if (score === null) {
    return null;
  }
  const unit = scoreToUnitInterval(score);
  if (!Number.isFinite(unit)) {
    return null;
  }
  return Math.max(0, Math.min(1, unit));
}

function normalizeProbability(value: number | null): number | null {
  if (value === null) {
    return null;
  }
  if (!Number.isFinite(value)) {
    return null;
  }
  if (value >= 0 && value <= 1) {
    return value;
  }
  if (value >= 0 && value <= 100) {
    return value / 100;
  }
  if (value >= -1 && value <= 1) {
    return (value + 1) / 2;
  }
  return null;
}

function confidenceCalibrationError(params: {
  confidence: number | null;
  pass: boolean | null;
  score: number | null;
}): number | null {
  const confidence = normalizeProbability(params.confidence);
  if (confidence === null) {
    return null;
  }
  let observedOutcome: number | null = null;
  if (params.pass !== null) {
    observedOutcome = params.pass ? 1 : 0;
  } else {
    observedOutcome = normalizedScore(params.score);
  }
  if (observedOutcome === null) {
    return null;
  }
  return Number(Math.abs(confidence - observedOutcome).toFixed(6));
}

function defaultTrustTierForFormat(format: EvalImportFormat): TrustTier {
  return DEFAULT_TRUST_TIER_BY_FORMAT[format] ?? "SELF_REPORTED";
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
    const behaviorSignals = [
      pickString(row, ["category", "evaluator", "grader", "task"]) ?? "",
      pickString(result ?? {}, ["category", "evaluator", "grader", "task"]) ?? ""
    ];
    const questionIdsForCase = inferOpenAIBehavioralQuestionIds({
      explicitQuestionIds: explicit,
      caseName,
      metricNames,
      additionalSignals: behaviorSignals
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
        mappingTarget: "behavioral_contract",
        mappingSignals: behaviorSignals,
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
    const scoreSignals = [
      pickString(row, ["evaluator", "feedback_key", "feedbackKey"]) ?? "",
      pickString(run, ["project_name", "projectName"]) ?? "",
      ...evalItems
        .map((entry) => pickString(entry, ["comment", "reason", "key", "name", "metric"]))
        .filter((value): value is string => !!value)
    ];
    const questionIdsForCase = inferLangSmithQuestionIds({
      explicitQuestionIds: explicit,
      caseName,
      metricNames,
      additionalSignals: scoreSignals
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
        mappingTarget: "langsmith_scores",
        mappingSignals: scoreSignals,
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
    const confidenceCandidates = [
      pickNumber(row, ["confidence", "predicted_confidence", "predictedConfidence", "confidence_score", "confidenceScore"]),
      ...metrics
        .map((metric) => pickNumber(metric, ["confidence", "predicted_confidence", "predictedConfidence", "confidence_score", "confidenceScore"]))
        .filter((value): value is number => value !== null)
    ].filter((value): value is number => value !== null);
    const confidencePrediction = normalizeProbability(
      confidenceCandidates.length > 0 ? average(confidenceCandidates) : null
    );
    const calibrationError = confidenceCalibrationError({
      confidence: confidencePrediction,
      pass: derived.pass,
      score: derived.score
    });
    const caseName = pickString(row, ["name", "test_case_name", "testCaseName", "metric_name", "metricName"]) ?? `deepeval-case-${index + 1}`;
    const explicit = explicitQuestionIds(row);
    const mappingSignals = [
      pickString(row, ["evaluation_model", "evaluationModel", "category", "task"]) ?? "",
      metrics.map((metric) => pickString(metric, ["reason", "comment"])).filter((value): value is string => !!value).join(" ")
    ];
    const questionIdsForCase = inferDeepEvalQuestionIds({
      explicitQuestionIds: explicit,
      caseName,
      metricNames,
      additionalSignals: mappingSignals
    });
    const calibratedQuestionIds =
      confidencePrediction !== null
        ? sanitizeQuestionIds([...questionIdsForCase, ...DEEPEVAL_CONFIDENCE_QUESTION_IDS], questionIdsForCase)
        : questionIdsForCase;
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
      questionIds: calibratedQuestionIds,
      ts: parseCaseTimestamp(row),
      metadata: {
        ...filterMetadata(row, ["evaluation_model", "evaluationModel", "category", "task"]),
        ...(confidencePrediction !== null ? { confidencePrediction } : {}),
        ...(calibrationError !== null ? { confidenceCalibrationError: calibrationError } : {}),
        mappingTarget: "deepeval_metrics",
        mappingSignals,
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
    const owaspSignals = [
      provider ?? "",
      pickString(row, ["strategy", "purpose", "category", "pluginId", "plugin"]) ?? "",
      assertionItems
        .map((assertion) => pickString(assertion, ["name", "assertion", "type", "metric", "pluginId"]))
        .filter((value): value is string => !!value)
        .join(" "),
      componentResults
        .map((component) => pickString(component, ["name", "metric", "type"]))
        .filter((value): value is string => !!value)
        .join(" ")
    ];
    const questionIdsForCase = inferPromptfooOwaspQuestionIds({
      explicitQuestionIds: explicit,
      caseName,
      metricNames,
      additionalSignals: owaspSignals
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
        mappingTarget: "owasp_llm_top10",
        mappingSignals: owaspSignals,
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

export function parseWandbEvalResults(input: unknown): ParsedEvalImport {
  const root = asRecord(input);
  const rows = rowsFromInput(input, ["runs", "results", "data", "records", "items"]);
  const runId = root ? pickString(root, ["id", "run_id", "runId", "sweep_id", "sweepId"]) : null;
  const runName = root ? pickString(root, ["name", "display_name", "displayName", "project", "project_name"]) : null;

  const cases = rows.map((row, index) => {
    const run = asRecord(row.run) ?? row;
    const summary = asRecord(run.summary ?? row.summary);
    const metrics = asRecord(run.metrics ?? row.metrics);
    const status =
      pickString(run, ["state", "status", "run_state", "runState"]) ??
      pickString(row, ["state", "status", "run_state", "runState"]);
    const statusPass =
      status && /(finished|success|succeeded|completed)/i.test(status)
        ? true
        : status && /(fail|error|crash|aborted|cancelled)/i.test(status)
          ? false
          : null;
    const metricNames = collectMetricNames(
      summary,
      metrics,
      row.metric,
      row.metric_name,
      run.metric,
      run.metric_name
    );
    const scoreValues = [
      ...numericValuesFromRecord(summary ?? {}),
      ...numericValuesFromRecord(metrics ?? {}),
      ...collectMetricNames(summary, metrics)
        .map((name) => toNumber(summary?.[name] ?? metrics?.[name]))
        .filter((value): value is number => value !== null)
    ];
    const threshold = pickNumber(row, ["threshold", "pass_threshold", "passThreshold"]);
    const derived = derivePassAndScore({
      pass:
        pickBoolean(row, ["success", "pass", "passed"]) ??
        pickBoolean(run, ["success", "pass", "passed"]) ??
        statusPass,
      score:
        pickNumber(run, ["score", "value", "summary_score", "summaryScore"]) ??
        pickNumber(row, ["score", "value", "summary_score", "summaryScore"]) ??
        average(scoreValues),
      threshold
    });

    const caseName =
      pickString(run, ["name", "display_name", "displayName", "job_type", "jobType"]) ??
      pickString(row, ["name", "display_name", "displayName", "job_type", "jobType"]) ??
      `wandb-run-${index + 1}`;
    const explicit = unique([
      ...explicitQuestionIds(row),
      ...explicitQuestionIds(run),
      ...explicitQuestionIds(summary ?? {}),
      ...explicitQuestionIds(metrics ?? {})
    ]);
    const mappingSignals = [
      status ?? "",
      pickString(run, ["project", "project_name", "projectName"]) ?? "",
      pickString(run, ["job_type", "jobType"]) ?? ""
    ];
    const questionIdsForCase = inferWandbPerformanceQuestionIds({
      explicitQuestionIds: explicit,
      caseName,
      metricNames,
      additionalSignals: mappingSignals
    });

    return {
      id: pickString(run, ["id", "run_id", "runId"]) ?? pickString(row, ["id", "run_id", "runId"]) ?? `${runId ?? "wandb"}-${index + 1}`,
      name: caseName,
      pass: derived.pass,
      score: derived.score,
      inputSnippet: valueSnippet(run.config ?? row.config ?? row.input),
      outputSnippet: valueSnippet(summary ?? metrics ?? run.outputs ?? row.output),
      expectedSnippet: valueSnippet(row.expected ?? row.reference),
      metricNames,
      questionIds: questionIdsForCase,
      ts: parseCaseTimestamp(row, run),
      metadata: {
        ...filterMetadata(run, ["project", "project_name", "projectName", "job_type", "jobType", "state", "status"]),
        ...filterMetadata(row, ["entity", "sweep", "group"]),
        mappingTarget: "wandb_performance",
        mappingSignals,
        ...(threshold !== null ? { threshold } : {})
      }
    } satisfies EvalImportCase;
  });

  return {
    framework: "wandb",
    runId,
    runName,
    cases
  };
}

export function parseLangfuseEvalResults(input: unknown): ParsedEvalImport {
  const root = asRecord(input);
  const rows = rowsFromInput(input, ["traces", "data", "observations", "results", "items"]);
  const runId = root ? pickString(root, ["id", "trace_id", "traceId", "session_id", "sessionId"]) : null;
  const runName = root ? pickString(root, ["name", "session_name", "sessionName", "project", "project_name"]) : null;

  const cases = rows.map((row, index) => {
    const trace = asRecord(row.trace) ?? row;
    const scores = asRecordArray(trace.scores ?? row.scores ?? trace.evals ?? row.evaluations);
    const observations = asRecordArray(trace.observations ?? row.observations);
    const metricNames = collectMetricNames(
      scores.map((score) => pickString(score, ["name", "key", "metric", "metric_name"])).filter((name): name is string => !!name),
      observations.map((observation) => pickString(observation, ["name", "type"])).filter((name): name is string => !!name),
      row.metric,
      trace.metric
    );
    const scoreValues = [
      ...scores.map((score) => pickNumber(score, ["score", "value"])).filter((value): value is number => value !== null),
      ...observations
        .map((observation) => pickNumber(observation, ["latency", "latencyMs", "score", "value"]))
        .filter((value): value is number => value !== null)
    ];
    const status =
      pickString(trace, ["status", "level", "completion_status", "completionStatus"]) ??
      pickString(row, ["status", "level", "completion_status", "completionStatus"]);
    const statusPass =
      status && /(success|ok|completed|passed)/i.test(status)
        ? true
        : status && /(error|failed|timeout|cancelled)/i.test(status)
          ? false
          : null;
    const threshold = pickNumber(row, ["threshold", "pass_threshold", "passThreshold"]);
    const derived = derivePassAndScore({
      pass:
        pickBoolean(row, ["success", "pass", "passed"]) ??
        pickBoolean(trace, ["success", "pass", "passed"]) ??
        statusPass,
      score:
        pickNumber(trace, ["score", "value"]) ??
        pickNumber(row, ["score", "value"]) ??
        average(scoreValues),
      threshold
    });

    const caseName =
      pickString(trace, ["name", "trace_name", "traceName", "session_name", "sessionName"]) ??
      pickString(row, ["name", "trace_name", "traceName"]) ??
      `langfuse-trace-${index + 1}`;
    const explicit = unique([...explicitQuestionIds(row), ...explicitQuestionIds(trace)]);
    const mappingSignals = [
      status ?? "",
      pickString(trace, ["type", "event_type", "eventType"]) ?? "",
      scores.map((score) => pickString(score, ["comment", "reason"])).filter((value): value is string => !!value).join(" ")
    ];
    const questionIdsForCase = inferLangfuseObservabilityQuestionIds({
      explicitQuestionIds: explicit,
      caseName,
      metricNames,
      additionalSignals: mappingSignals
    });

    return {
      id:
        pickString(trace, ["id", "trace_id", "traceId", "observation_id", "observationId"]) ??
        pickString(row, ["id", "trace_id", "traceId"]) ??
        `${runId ?? "langfuse"}-${index + 1}`,
      name: caseName,
      pass: derived.pass,
      score: derived.score,
      inputSnippet: valueSnippet(trace.input ?? row.input ?? trace.prompt ?? row.prompt),
      outputSnippet: valueSnippet(trace.output ?? row.output ?? trace.response ?? row.response),
      expectedSnippet: valueSnippet(row.expected ?? trace.expected),
      metricNames,
      questionIds: questionIdsForCase,
      ts: parseCaseTimestamp(row, trace),
      metadata: {
        ...filterMetadata(trace, ["session_id", "sessionId", "environment", "status", "level", "type"]),
        ...filterMetadata(row, ["project", "project_name", "user_id", "userId"]),
        mappingTarget: "langfuse_observability",
        mappingSignals,
        ...(threshold !== null ? { threshold } : {})
      }
    } satisfies EvalImportCase;
  });

  return {
    framework: "langfuse",
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
  if (format === "promptfoo") {
    return parsePromptfooEvalResults(input);
  }
  if (format === "wandb") {
    return parseWandbEvalResults(input);
  }
  return parseLangfuseEvalResults(input);
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

  const trustTier = params.trustTier ?? defaultTrustTierForFormat(params.format);
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
      const questionIdsForCase = sanitizeQuestionIds(item.questionIds);
      const primaryQuestionId = questionIdsForCase[0] ?? DEFAULT_QUESTION_IDS[0];
      const unitScore = normalizedScore(item.score);
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
          questionIds: questionIdsForCase,
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
          normalizedScore: unitScore,
          metricNames: item.metricNames,
          questionId: primaryQuestionId,
          questionIds: questionIdsForCase,
          mappingTarget: item.metadata.mappingTarget,
          trustTier,
          agentId
        }
      });
      eventIds.push(detailed.id);

      for (const questionId of questionIdsForCase) {
        const metric = ledger.appendEvidenceDetailed({
          sessionId,
          runtime: "unknown",
          eventType: "metric",
          payload: JSON.stringify({
            metricKey: "external_eval_score",
            framework: params.format,
            runId: parsed.runId,
            caseId: item.id,
            caseName: item.name,
            questionId,
            questionIds: questionIdsForCase,
            metricNames: item.metricNames,
            score: item.score,
            normalizedScore: unitScore,
            pass: item.pass,
            mappingTarget: item.metadata.mappingTarget ?? "generic"
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
            metricKey: "external_eval_score",
            metricValue: unitScore,
            pass: item.pass,
            score: item.score,
            questionId,
            questionIds: questionIdsForCase,
            trustTier,
            agentId
          }
        });
        eventIds.push(metric.id);
      }

      if (params.format === "deepeval") {
        const confidencePrediction = normalizeProbability(toNumber(item.metadata.confidencePrediction));
        const calibrationError = toNumber(item.metadata.confidenceCalibrationError);
        if (confidencePrediction !== null || calibrationError !== null) {
          const calibrationQuestionIds = sanitizeQuestionIds(
            [...DEEPEVAL_CONFIDENCE_QUESTION_IDS, ...questionIdsForCase],
            DEEPEVAL_CONFIDENCE_QUESTION_IDS
          );
          for (const questionId of calibrationQuestionIds) {
            const calibrationMetric = ledger.appendEvidenceDetailed({
              sessionId,
              runtime: "unknown",
              eventType: "metric",
              payload: JSON.stringify({
                metricKey: "confidence_calibration_error",
                framework: params.format,
                runId: parsed.runId,
                caseId: item.id,
                caseName: item.name,
                questionId,
                confidencePrediction,
                confidenceCalibrationError: calibrationError,
                pass: item.pass,
                score: item.score
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
                metricKey: "confidence_calibration_error",
                metricValue: calibrationError,
                confidencePrediction,
                pass: item.pass,
                score: item.score,
                questionId,
                questionIds: calibrationQuestionIds,
                trustTier,
                agentId
              }
            });
            eventIds.push(calibrationMetric.id);
          }
        }
      }

      if (item.pass === false) {
        const failureAudit = ledger.appendEvidenceDetailed({
          sessionId,
          runtime: "unknown",
          eventType: "audit",
          payload: JSON.stringify({
            auditType: "EXTERNAL_EVAL_FAILURE",
            severity: "MEDIUM",
            framework: params.format,
            runId: parsed.runId,
            caseId: item.id,
            caseName: item.name,
            questionIds: questionIdsForCase,
            metricNames: item.metricNames,
            score: item.score
          }),
          payloadExt: "json",
          inline: true,
          ts: item.ts ?? undefined,
          meta: {
            source: "eval_import",
            auditType: "EXTERNAL_EVAL_FAILURE",
            severity: "MEDIUM",
            framework: params.format,
            runId: parsed.runId,
            caseId: item.id,
            caseName: item.name,
            metricNames: item.metricNames,
            pass: item.pass,
            score: item.score,
            questionId: primaryQuestionId,
            questionIds: questionIdsForCase,
            trustTier,
            agentId
          }
        });
        eventIds.push(failureAudit.id);
      }
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

function isEvalImportFormat(value: string): value is EvalImportFormat {
  return value === "openai" || value === "langsmith" || value === "deepeval" || value === "promptfoo" || value === "wandb" || value === "langfuse";
}

function parseMetaRecord(metaJson: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(metaJson) as unknown;
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function parseMetaQuestionIds(meta: Record<string, unknown>): string[] {
  const derived = unique([
    ...tokenizeQuestionIdValue(meta.questionId),
    ...tokenizeQuestionIdValue(meta.question_id),
    ...tokenizeQuestionIdValue(meta.questionIds),
    ...tokenizeQuestionIdValue(meta.question_ids),
    ...tokenizeQuestionIdValue(meta.affectedQuestionIds),
    ...tokenizeQuestionIdValue(meta.affected_question_ids)
  ]);
  return sanitizeQuestionIds(derived, []);
}

function parseMetaTrustTier(meta: Record<string, unknown>): TrustTier {
  const value = meta.trustTier;
  if (value === "OBSERVED" || value === "OBSERVED_HARDENED" || value === "ATTESTED" || value === "SELF_REPORTED") {
    return value;
  }
  return "SELF_REPORTED";
}

function emptyTrustTierBreakdown(): Record<TrustTier, number> {
  return {
    OBSERVED: 0,
    OBSERVED_HARDENED: 0,
    ATTESTED: 0,
    SELF_REPORTED: 0
  };
}

export function evalImportCoverageStatus(params: {
  workspace: string;
  agentId?: string;
  sinceTs?: number;
}): EvalCoverageStatus {
  const ledger = openLedger(params.workspace);
  try {
    const clauses = ["json_extract(meta_json, '$.source') = 'eval_import'"];
    const args: unknown[] = [];
    if (typeof params.sinceTs === "number" && Number.isFinite(params.sinceTs)) {
      clauses.push("ts >= ?");
      args.push(Math.round(params.sinceTs));
    }
    if (params.agentId && params.agentId.length > 0) {
      clauses.push("(json_extract(meta_json, '$.agentId') = ? OR json_extract(meta_json, '$.agent_id') = ?)");
      args.push(params.agentId, params.agentId);
    }

    const rows = ledger.db
      .prepare(`SELECT ts, event_type, meta_json FROM evidence_events WHERE ${clauses.join(" AND ")} ORDER BY ts ASC`)
      .all(...args) as Array<{ ts: number; event_type: string; meta_json: string }>;

    const dimensionQuestionTotals = new Map<LayerName, number>();
    for (const layerName of LAYER_NAMES) {
      dimensionQuestionTotals.set(
        layerName,
        questionBank.filter((question) => question.layerName === layerName).length
      );
    }
    const dimensionCoverage = new Map<LayerName, Set<string>>();
    for (const layerName of LAYER_NAMES) {
      dimensionCoverage.set(layerName, new Set<string>());
    }

    const frameworkState = new Map<EvalImportFormat, {
      importedEvents: number;
      importedCases: number;
      passedCases: number;
      failedCases: number;
      mappedQuestions: Set<string>;
      trustTierBreakdown: Record<TrustTier, number>;
      latestTs: number | null;
    }>();
    const allMappedQuestions = new Set<string>();
    let totalImportedCases = 0;

    for (const row of rows) {
      const meta = parseMetaRecord(row.meta_json);
      const frameworkValue = typeof meta.framework === "string" ? meta.framework.toLowerCase() : "";
      if (!isEvalImportFormat(frameworkValue)) {
        continue;
      }
      const trustTier = parseMetaTrustTier(meta);
      const questionIdsForEvent = parseMetaQuestionIds(meta);
      const framework = frameworkValue;
      const state = frameworkState.get(framework) ?? {
        importedEvents: 0,
        importedCases: 0,
        passedCases: 0,
        failedCases: 0,
        mappedQuestions: new Set<string>(),
        trustTierBreakdown: emptyTrustTierBreakdown(),
        latestTs: null
      };
      state.importedEvents += 1;
      state.trustTierBreakdown[trustTier] += 1;
      state.latestTs = state.latestTs === null ? row.ts : Math.max(state.latestTs, row.ts);
      if (row.event_type === "test") {
        state.importedCases += 1;
        totalImportedCases += 1;
        if (meta.pass === true) {
          state.passedCases += 1;
        } else if (meta.pass === false) {
          state.failedCases += 1;
        }
      }
      for (const questionId of questionIdsForEvent) {
        state.mappedQuestions.add(questionId);
        allMappedQuestions.add(questionId);
        const layerName = QUESTION_LAYER_MAP.get(questionId);
        if (layerName) {
          dimensionCoverage.get(layerName)?.add(questionId);
        }
      }
      frameworkState.set(framework, state);
    }

    const frameworks = [...frameworkState.entries()]
      .map(([framework, state]) => ({
        framework,
        importedEvents: state.importedEvents,
        importedCases: state.importedCases,
        passedCases: state.passedCases,
        failedCases: state.failedCases,
        mappedQuestions: [...state.mappedQuestions].sort((a, b) => a.localeCompare(b)),
        trustTierBreakdown: state.trustTierBreakdown,
        latestTs: state.latestTs
      }))
      .sort((a, b) => a.framework.localeCompare(b.framework));

    const dimensions: EvalDimensionCoverage[] = LAYER_NAMES.map((layerName) => {
      const coveredQuestionIds = [...(dimensionCoverage.get(layerName) ?? new Set<string>())].sort((a, b) => a.localeCompare(b));
      const totalQuestions = dimensionQuestionTotals.get(layerName) ?? 0;
      return {
        layerName,
        coveredQuestions: coveredQuestionIds.length,
        totalQuestions,
        coveragePct: totalQuestions > 0 ? Number(((coveredQuestionIds.length / totalQuestions) * 100).toFixed(2)) : 0,
        questionIds: coveredQuestionIds
      };
    });

    const totalQuestionCount = questionBank.length;
    return {
      generatedTs: Date.now(),
      totalImportedEvents: rows.length,
      totalImportedCases,
      mappedQuestionCount: allMappedQuestions.size,
      totalQuestionCount,
      overallCoveragePct: totalQuestionCount > 0 ? Number(((allMappedQuestions.size / totalQuestionCount) * 100).toFixed(2)) : 0,
      frameworks,
      dimensions
    };
  } finally {
    ledger.close();
  }
}
