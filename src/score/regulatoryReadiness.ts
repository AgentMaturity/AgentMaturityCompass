import { existsSync, readdirSync, readFileSync } from "node:fs";
import { sealedRunReportVerifies } from "../diagnostic/reportSeal.js";
import { join } from "node:path";
import { getAgentPaths, resolveAgentId } from "../fleet/paths.js";
import type { DiagnosticReport } from "../types.js";
import { notEvaluatedCriteria, scoreEUAIActCompliance, type NotEvaluatedCriterion } from "./euAIActCompliance.js";
import { scoreOWASPLLMCoverage } from "./owaspLLMCoverage.js";

interface WeightedComponents {
  euAiAct: number;
  iso42001: number;
  owaspLLM: number;
}

export interface ISO42001CoverageResult {
  status: "not_evaluated";
  score: null;
  level: null;
  totalControls: number;
  gaps: string[];
  recommendations: string[];
  controls: NotEvaluatedCriterion[];
}

/**
 * Its three components counted file paths, which is not evidence, so they carry
 * no weight and the readiness is not evaluated; `notEvaluated` lists all 28
 * criteria. The latest sealed run is still reported.
 */
export interface RegulatoryReadinessResult {
  agentId: string;
  status: "not_evaluated";
  score: null;
  level: null;
  weightedComposite: null;
  components: {
    euAiAct: null;
    iso42001: null;
    owaspLLM: null;
  };
  weights: WeightedComponents;
  agentEvidenceModifier: null;
  notEvaluated: string[];
  latestRunId: string | null;
  latestIntegrityIndex: number | null;
  gaps: string[];
  recommendations: string[];
}

export interface RegulatoryReadinessInput {
  workspace?: string;
  agentId: string;
  weights?: Partial<WeightedComponents>;
}

interface LatestAgentIntegrity {
  runId: string | null;
  integrityIndex: number | null;
}

const ISO_CONTROLS: ReadonlyArray<[string, string]> = [
  ["ISO-4.1", "ISO 42001 4.1 AI management system context and governance"],
  ["ISO-5.2", "ISO 42001 5.2 AI policy and accountability"],
  ["ISO-6.1", "ISO 42001 6.1 risk and impact assessment lifecycle"],
  ["ISO-8.1", "ISO 42001 8.1 operational controls and secure development"],
  ["ISO-9.1", "ISO 42001 9.1 monitoring, measurement and drift response"],
  ["ISO-9.2", "ISO 42001 9.2 internal audit and evidence traceability"],
  ["ISO-10.2", "ISO 42001 10.2 corrective action and incident closure"],
  ["ISO-10.3", "ISO 42001 10.3 continual improvement and management review"]
];

const DEFAULT_WEIGHTS: WeightedComponents = {
  euAiAct: 0.45,
  iso42001: 0.35,
  owaspLLM: 0.2
};

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, value));
}

function normalizeWeights(overrides?: Partial<WeightedComponents>): WeightedComponents {
  const raw: WeightedComponents = {
    euAiAct: typeof overrides?.euAiAct === "number" ? overrides.euAiAct : DEFAULT_WEIGHTS.euAiAct,
    iso42001: typeof overrides?.iso42001 === "number" ? overrides.iso42001 : DEFAULT_WEIGHTS.iso42001,
    owaspLLM: typeof overrides?.owaspLLM === "number" ? overrides.owaspLLM : DEFAULT_WEIGHTS.owaspLLM
  };
  const safe = {
    euAiAct: Math.max(0, raw.euAiAct),
    iso42001: Math.max(0, raw.iso42001),
    owaspLLM: Math.max(0, raw.owaspLLM)
  };
  const sum = safe.euAiAct + safe.iso42001 + safe.owaspLLM;
  if (sum <= 0) {
    return { ...DEFAULT_WEIGHTS };
  }
  return {
    euAiAct: safe.euAiAct / sum,
    iso42001: safe.iso42001 / sum,
    owaspLLM: safe.owaspLLM / sum
  };
}

function deriveIntegrityIndex(report: Partial<DiagnosticReport>): number {
  if (typeof report.integrityIndex === "number" && Number.isFinite(report.integrityIndex)) {
    return clamp01(report.integrityIndex);
  }
  if (Array.isArray(report.layerScores) && report.layerScores.length > 0) {
    const scores = report.layerScores
      .map((row) => row?.avgFinalLevel)
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
    if (scores.length > 0) {
      const avg = scores.reduce((sum, value) => sum + value, 0) / scores.length;
      return clamp01(avg / 5);
    }
  }
  return 0;
}

function loadLatestAgentIntegrity(workspace: string, agentId: string): LatestAgentIntegrity {
  const paths = getAgentPaths(workspace, agentId);
  if (!existsSync(paths.runsDir)) {
    return { runId: null, integrityIndex: null };
  }

  const entries = readdirSync(paths.runsDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"));
  let best: { runId: string; ts: number; integrityIndex: number } | null = null;

  for (const entry of entries) {
    const file = join(paths.runsDir, entry.name);
    try {
      const parsed = JSON.parse(readFileSync(file, "utf8")) as Partial<DiagnosticReport>;
      // A scoring input (the readiness verdict quotes this run's integrity), so
      // only sealed reports count — G9-05.
      if (!sealedRunReportVerifies(workspace, parsed as Record<string, unknown>)) {
        continue;
      }
      const runId = typeof parsed.runId === "string" && parsed.runId.length > 0
        ? parsed.runId
        : entry.name.slice(0, -5);
      const ts = typeof parsed.ts === "number" && Number.isFinite(parsed.ts) ? parsed.ts : 0;
      const integrityIndex = deriveIntegrityIndex(parsed);
      if (!best || ts > best.ts || (ts === best.ts && runId > best.runId)) {
        best = { runId, ts, integrityIndex };
      }
    } catch {
      // Ignore malformed run files.
    }
  }

  if (!best) {
    return { runId: null, integrityIndex: null };
  }
  return { runId: best.runId, integrityIndex: best.integrityIndex };
}

/** @deprecated Not evaluated since P0-15: it reports no score. Removal is a D-12 question. */
export function scoreISO42001Coverage(_cwd?: string): ISO42001CoverageResult {
  return {
    status: "not_evaluated",
    score: null,
    level: null,
    totalControls: ISO_CONTROLS.length,
    gaps: [],
    recommendations: [],
    controls: notEvaluatedCriteria(ISO_CONTROLS)
  };
}

/** @deprecated Not evaluated since P0-15: it reports no score. Removal is a D-12 question. */
export function scoreRegulatoryReadiness(input: RegulatoryReadinessInput): RegulatoryReadinessResult {
  const workspace = input.workspace ?? process.cwd();
  const agentId = resolveAgentId(workspace, input.agentId);
  const weights = normalizeWeights(input.weights);

  const latest = loadLatestAgentIntegrity(workspace, agentId);
  const criteria = [
    ...scoreEUAIActCompliance(workspace).criteria,
    ...scoreISO42001Coverage(workspace).controls,
    ...scoreOWASPLLMCoverage(workspace).risks
  ];

  return {
    agentId,
    status: "not_evaluated",
    score: null,
    level: null,
    weightedComposite: null,
    components: { euAiAct: null, iso42001: null, owaspLLM: null },
    weights,
    agentEvidenceModifier: null,
    notEvaluated: criteria.map((criterion) => criterion.reason),
    latestRunId: latest.runId,
    latestIntegrityIndex: latest.integrityIndex,
    gaps: [],
    recommendations: ["File presence is not evidence: record runtime evidence with `amc quickscore` and use evidence-backed compliance reporting."]
  };
}

