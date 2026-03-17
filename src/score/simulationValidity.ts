/**
 * Simulation Validity Scoring Module
 *
 * Scores AMC-6.30 to AMC-6.36: whether a simulation is remotely defensible —
 * diversity, convergence testing, seed perturbation, adversarial scenarios,
 * minority trajectory preservation, calibration against known cases, and
 * platform-artifact separation.
 *
 * Part of the Simulation & Forecast evaluation lane.
 */

import { existsSync } from "fs";
import { join } from "path";

export interface SimulationValidityReport {
  /** Per-question scores (0-1) keyed by question ID */
  questionScores: Record<string, number>;
  /** Overall score 0-100 */
  score: number;
  /** Maturity level L0-L5 */
  level: number;
  /** Specific gaps and recommendations */
  gaps: string[];
  /** Evidence artifacts found */
  evidenceFound: string[];
}

export interface SimulationValidityInput {
  /** Diagnostic question responses keyed by AMC-6.x ID */
  responses: Record<string, string>;
  /** Optional: root path for infrastructure scan */
  root?: string;
}

const DIVERSITY_RE = /(diverse|divers|heterogeneous|varied|different.*agent|population.*variety|distinct.*persona|mode collapse)/i;
const CONVERGENCE_RE = /(convergence|divergence|independent.*run|replicate|reproducib|stability|variance|spread)/i;
const PERTURBATION_RE = /(perturbat|seed|sensitivity|vary.*input|alter.*initial|robustness|monte carlo)/i;
const ADVERSARIAL_RE = /(adversarial|counterfactual|stress.?test|edge case|boundary|worst.?case|red.?team)/i;
const MINORITY_RE = /(minority|outlier|tail|rare|edge|long.?tail|preserve|not.*average|disaggregate)/i;
const CALIBRATION_RE = /(calibrat|backtest|historical|ground.?truth|benchmark|validated|known.*case|reference)/i;
const ARTIFACT_RE = /(artifact|platform|mechanic|architecture|bias|systematic|confound|structural)/i;
const EVIDENCE_RE = /(\[ev:[^\]]+\]|evidence|verified|confirmed|audit|log|documented)/i;

const QUESTION_CRITERIA: Record<string, { required: RegExp[]; bonus: RegExp[]; description: string }> = {
  "AMC-6.30": {
    required: [DIVERSITY_RE],
    bonus: [EVIDENCE_RE],
    description: "Agent populations diverse enough to avoid mode collapse",
  },
  "AMC-6.31": {
    required: [CONVERGENCE_RE],
    bonus: [EVIDENCE_RE],
    description: "Independent runs compared for convergence/divergence",
  },
  "AMC-6.32": {
    required: [PERTURBATION_RE],
    bonus: [EVIDENCE_RE],
    description: "Different seed perturbations tested",
  },
  "AMC-6.33": {
    required: [ADVERSARIAL_RE],
    bonus: [EVIDENCE_RE],
    description: "Adversarial/counterfactual scenarios explored",
  },
  "AMC-6.34": {
    required: [MINORITY_RE],
    bonus: [EVIDENCE_RE],
    description: "Minority/outlier trajectories preserved instead of averaged away",
  },
  "AMC-6.35": {
    required: [CALIBRATION_RE],
    bonus: [EVIDENCE_RE],
    description: "Calibration checks against known historical cases",
  },
  "AMC-6.36": {
    required: [ARTIFACT_RE],
    bonus: [EVIDENCE_RE, CALIBRATION_RE],
    description: "Platform-mechanic artifacts identified and separated from 'human truth'",
  },
};

function scoreResponse(response: string, criteria: { required: RegExp[]; bonus: RegExp[] }): number {
  if (!response || response.trim().length < 20) return 0;

  let score = 0;
  const requiredWeight = 0.7 / Math.max(criteria.required.length, 1);
  const bonusWeight = 0.3 / Math.max(criteria.bonus.length, 1);

  for (const re of criteria.required) {
    if (re.test(response)) score += requiredWeight;
  }
  for (const re of criteria.bonus) {
    if (re.test(response)) score += bonusWeight;
  }

  const evidenceMatches = response.match(/\[ev:[^\]]+\]/g);
  if (evidenceMatches && evidenceMatches.length >= 2) score += 0.1;
  if (response.length > 200 && /\n/.test(response)) score += 0.05;

  return Math.max(0, Math.min(1, score));
}

function scoreToLevel(score: number): number {
  if (score >= 90) return 5;
  if (score >= 70) return 4;
  if (score >= 50) return 3;
  if (score >= 30) return 2;
  if (score >= 10) return 1;
  return 0;
}

/**
 * Score simulation validity from diagnostic responses.
 */
export function scoreSimulationValidity(input: SimulationValidityInput): SimulationValidityReport {
  const { responses } = input;
  const questionScores: Record<string, number> = {};
  const gaps: string[] = [];
  const evidenceFound: string[] = [];

  const qids = Object.keys(QUESTION_CRITERIA);
  let total = 0;

  for (const qid of qids) {
    const response = responses[qid];
    const criteria = QUESTION_CRITERIA[qid]!;

    if (!response || response.trim().length === 0) {
      questionScores[qid] = 0;
      gaps.push(`${qid}: No response — ${criteria.description}`);
      continue;
    }

    const qScore = scoreResponse(response, criteria);
    questionScores[qid] = qScore;
    total += qScore;

    if (qScore < 0.5) {
      gaps.push(`${qid}: Weak coverage — ${criteria.description} (score: ${(qScore * 100).toFixed(0)}%)`);
    }

    const evMatches = response.match(/\[ev:[^\]]+\]/g);
    if (evMatches) evidenceFound.push(...evMatches);
  }

  const score = qids.length > 0 ? Math.round((total / qids.length) * 100) : 0;
  const level = scoreToLevel(score);
  const answered = Object.values(questionScores).filter((s) => s > 0).length;

  if (answered === 0) {
    gaps.push("CRITICAL: No simulation validity questions answered — simulation realism is completely unverified");
  } else if (answered < qids.length * 0.5) {
    gaps.push(`Only ${answered}/${qids.length} validity questions addressed — simulation may be glorified fan fiction`);
  }

  // Check for synthetic consensus risk
  const hasConvergenceCheck = questionScores["AMC-6.31"]! > 0.5;
  const hasDiversityCheck = questionScores["AMC-6.30"]! > 0.5;
  if (!hasConvergenceCheck && !hasDiversityCheck) {
    gaps.push("HIGH RISK: No convergence or diversity checks — synthetic consensus may be mistaken for real consensus");
  }

  return { questionScores, score, level, gaps, evidenceFound };
}

/**
 * Scan filesystem for simulation validity infrastructure.
 */
export function scanSimulationValidityInfrastructure(root: string): SimulationValidityReport {
  const gaps: string[] = [];
  const evidenceFound: string[] = [];
  let infraScore = 0;

  const checks: Array<{ paths: string[]; points: number; gap: string; evidence: string }> = [
    {
      paths: ["src/simulation/diversity", "src/agents/diversity", "src/population"],
      points: 15,
      gap: "No agent population diversity controls",
      evidence: "diversity-controls",
    },
    {
      paths: ["src/simulation/convergence", "src/replicate", "tests/convergence"],
      points: 20,
      gap: "No convergence/divergence testing across independent runs",
      evidence: "convergence-testing",
    },
    {
      paths: ["src/simulation/perturbation", "src/sensitivity", "tests/sensitivity"],
      points: 15,
      gap: "No seed perturbation / sensitivity analysis",
      evidence: "perturbation-testing",
    },
    {
      paths: ["src/adversarial", "src/counterfactual", "src/simulation/adversarial"],
      points: 15,
      gap: "No adversarial/counterfactual scenario exploration",
      evidence: "adversarial-scenarios",
    },
    {
      paths: ["src/simulation/calibration", "src/backtest", "tests/backtest"],
      points: 20,
      gap: "No calibration against historical ground truth",
      evidence: "historical-calibration",
    },
    {
      paths: ["docs/simulation-validity", "docs/VALIDITY.md"],
      points: 15,
      gap: "No documented simulation validity methodology",
      evidence: "validity-docs",
    },
  ];

  for (const check of checks) {
    const found = check.paths.some((p) => existsSync(join(root, p)));
    if (found) {
      infraScore += check.points;
      evidenceFound.push(check.evidence);
    } else {
      gaps.push(check.gap);
    }
  }

  const score = Math.min(100, infraScore);
  const level = scoreToLevel(score);

  return { questionScores: {}, score, level, gaps, evidenceFound };
}
