import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getAgentPaths, resolveAgentId } from "../fleet/paths.js";
import type { DiagnosticReport } from "../types.js";
import { scoreEUAIActCompliance } from "./euAIActCompliance.js";
import { scoreOWASPLLMCoverage } from "./owaspLLMCoverage.js";
import { evidencePathExists } from "./controlSurfaceScope.js";

interface WeightedComponents {
  euAiAct: number;
  iso42001: number;
  owaspLLM: number;
}

export interface ISO42001CoverageResult {
  score: number;
  passedControls: number;
  totalControls: number;
  gaps: string[];
  recommendations: string[];
  controls: Array<{
    id: string;
    title: string;
    covered: boolean;
  }>;
}

export interface RegulatoryReadinessResult {
  agentId: string;
  score: number;
  level: number;
  weightedComposite: number;
  components: {
    euAiAct: number;
    iso42001: number;
    owaspLLM: number;
  };
  weights: WeightedComponents;
  agentEvidenceModifier: number;
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

interface ISOControlDefinition {
  id: string;
  title: string;
  evidencePaths: string[];
  recommendation: string;
}

interface LatestAgentIntegrity {
  runId: string | null;
  integrityIndex: number | null;
}

/**
 * ISO 42001 control evidence.
 *
 * Three controls (8.1, 9.1, 10.3) previously listed only `src/` paths — AMC's
 * own modules. Since `evidencePathExists` ignores those outside an AMC
 * checkout, no customer agent could satisfy them at all, capping every external
 * ISO score at 5 of 8 regardless of the controls actually in place. Each now
 * also accepts a workspace artifact AMC writes or a document the operator
 * authors, so the control is evidencable by the agent being assessed.
 */
const ISO_CONTROLS: ISOControlDefinition[] = [
  {
    id: "ISO-4.1",
    title: "AI management system context and governance",
    evidencePaths: ["docs/AI_GOVERNANCE.md", ".amc/ai_management_system.json", "src/governor"],
    recommendation: "Document AI management system scope, governance roles, and decision rights."
  },
  {
    id: "ISO-5.2",
    title: "AI policy and accountability",
    evidencePaths: ["docs/POLICY.md", "src/policy", "src/approvals"],
    recommendation: "Define signed policy artifacts with accountable owners and review cadence."
  },
  {
    id: "ISO-6.1",
    title: "Risk and impact assessment lifecycle",
    evidencePaths: ["docs/RISK_MANAGEMENT.md", ".amc/risk_register.json", "src/incidents"],
    recommendation: "Implement a maintained AI risk register with mitigation ownership."
  },
  {
    id: "ISO-8.1",
    title: "Operational controls and secure development",
    evidencePaths: ["docs/OPERATIONS.md", ".amc/ops-policy.yaml", ".amc/sandbox_profile.json", "src/ops", "src/vault", "src/assurance"],
    recommendation: "Evidence secure operations controls (key handling, backup, release and assurance)."
  },
  {
    id: "ISO-9.1",
    title: "Monitoring, measurement, and drift response",
    evidencePaths: ["docs/MONITORING.md", ".amc/trust_signals.json", "src/drift", "src/monitor", "src/claims/confidenceDrift.ts"],
    recommendation: "Enable continuous trust/performance monitoring with deterministic drift alerts."
  },
  {
    id: "ISO-9.2",
    title: "Internal audit and evidence traceability",
    evidencePaths: ["src/audit", "src/ledger", ".amc/evidence.sqlite"],
    recommendation: "Maintain tamper-evident audit evidence and periodic internal audits."
  },
  {
    id: "ISO-10.2",
    title: "Corrective action and incident closure",
    evidencePaths: ["src/corrections", "src/incidents", ".amc/incidents"],
    recommendation: "Track corrective action closure with evidence-backed effectiveness verification."
  },
  {
    id: "ISO-10.3",
    title: "Continual improvement and management review",
    evidencePaths: ["docs/MANAGEMENT_REVIEW.md", ".amc/PREDICTION_LOG.md", ".amc/snapshots", "src/loop", "src/snapshot", "src/forecast"],
    recommendation: "Run recurring management reviews that link risk posture to concrete improvements."
  }
];

const DEFAULT_WEIGHTS: WeightedComponents = {
  euAiAct: 0.45,
  iso42001: 0.35,
  owaspLLM: 0.2
};

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

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

export function scoreISO42001Coverage(cwd?: string): ISO42001CoverageResult {
  const root = cwd ?? process.cwd();
  const controls = ISO_CONTROLS.map((control) => ({
    id: control.id,
    title: control.title,
    covered: control.evidencePaths.some((path) => evidencePathExists(root, path))
  }));
  const passedControls = controls.filter((control) => control.covered).length;
  const totalControls = controls.length;
  const score = totalControls > 0 ? Math.round((passedControls / totalControls) * 100) : 0;

  const gaps: string[] = [];
  const recommendations: string[] = [];
  for (const control of controls) {
    if (!control.covered) {
      const def = ISO_CONTROLS.find((item) => item.id === control.id);
      gaps.push(`${control.id} ${control.title}`);
      if (def) {
        recommendations.push(def.recommendation);
      }
    }
  }

  return {
    score,
    passedControls,
    totalControls,
    gaps,
    recommendations,
    controls
  };
}

function levelFromScore(score: number): number {
  if (score >= 90) return 5;
  if (score >= 70) return 4;
  if (score >= 50) return 3;
  if (score >= 30) return 2;
  if (score >= 10) return 1;
  return 0;
}

export function scoreRegulatoryReadiness(input: RegulatoryReadinessInput): RegulatoryReadinessResult {
  const workspace = input.workspace ?? process.cwd();
  const agentId = resolveAgentId(workspace, input.agentId);
  const weights = normalizeWeights(input.weights);

  const eu = scoreEUAIActCompliance(workspace);
  const iso = scoreISO42001Coverage(workspace);
  const owasp = scoreOWASPLLMCoverage(workspace);
  const latest = loadLatestAgentIntegrity(workspace, agentId);

  const weightedComposite = round2(
    eu.score * weights.euAiAct +
    iso.score * weights.iso42001 +
    owasp.score * weights.owaspLLM
  );

  // Agent-specific execution modifier: high-trust runs preserve more of the theoretical readiness score.
  const agentEvidenceModifier = round2(
    latest.integrityIndex === null ? 0.9 : (0.8 + (0.2 * latest.integrityIndex))
  );

  const score = Math.round(weightedComposite * agentEvidenceModifier);
  const level = levelFromScore(score);

  const gaps = [
    ...eu.gaps.slice(0, 4),
    ...iso.gaps.slice(0, 4),
    ...owasp.gaps.slice(0, 4)
  ];
  const recommendations = [
    ...eu.recommendations.slice(0, 3),
    ...iso.recommendations.slice(0, 3),
    ...owasp.recommendations.slice(0, 3)
  ];

  return {
    agentId,
    score,
    level,
    weightedComposite,
    components: {
      euAiAct: eu.score,
      iso42001: iso.score,
      owaspLLM: owasp.score
    },
    weights,
    agentEvidenceModifier,
    latestRunId: latest.runId,
    latestIntegrityIndex: latest.integrityIndex,
    gaps,
    recommendations
  };
}

