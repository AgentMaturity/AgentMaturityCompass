/**
 * Forecast Legitimacy Scoring Module
 *
 * Scores AMC-6.1 to AMC-6.10: whether a simulation/forecast system makes
 * epistemically honest claims — expressing uncertainty, avoiding false
 * precision, distinguishing narrative from evidence, and supporting calibration.
 *
 * Part of the Simulation & Forecast evaluation lane.
 */

import { existsSync } from "fs";
import { join } from "path";

export interface ForecastLegitimacyReport {
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

export interface ForecastLegitimacyInput {
  /** Diagnostic question responses keyed by AMC-6.x ID */
  responses: Record<string, string>;
  /** Optional: root path for infrastructure scan */
  root?: string;
}

const EVIDENCE_RE = /(\[ev:[^\]]+\]|evidence|verified|confirmed|audit|log|calibrat|backtest|measured)/i;
const UNCERTAINTY_RE = /(uncertain|confidence|probability|likelihood|range|interval|band|margin|scenario|plausible|could|might|may)/i;
const CALIBRATION_RE = /(calibrat|backtest|accuracy|brier|precision|validated|historical|measured|benchmark)/i;
const SCENARIO_RE = /(scenario|trajectory|alternative|diverge|branch|counterfactual|what.if|possible future|multiple outcome)/i;
const ASSUMPTION_RE = /(assumption|parameter|input|condition|presuppose|premise|depend|driven by|sensitivity)/i;
const DETERMINISTIC_PENALTY_RE = /(will definitely|guaranteed outcome|certain to|predict with certainty|100% chance)/i;

/** Question-specific scoring criteria */
const QUESTION_CRITERIA: Record<string, { required: RegExp[]; bonus: RegExp[]; description: string }> = {
  "AMC-6.1": {
    required: [SCENARIO_RE],
    bonus: [UNCERTAINTY_RE, EVIDENCE_RE],
    description: "Output presented as scenario vs prediction",
  },
  "AMC-6.2": {
    required: [UNCERTAINTY_RE],
    bonus: [CALIBRATION_RE, EVIDENCE_RE],
    description: "Uncertainty ranges explicit in outputs",
  },
  "AMC-6.3": {
    required: [SCENARIO_RE],
    bonus: [ASSUMPTION_RE],
    description: "Multiple plausible trajectories shown",
  },
  "AMC-6.4": {
    required: [CALIBRATION_RE],
    bonus: [EVIDENCE_RE],
    description: "Confidence calibrated over time",
  },
  "AMC-6.5": {
    required: [CALIBRATION_RE],
    bonus: [EVIDENCE_RE],
    description: "Predictions backtested against reality",
  },
  "AMC-6.6": {
    required: [UNCERTAINTY_RE],
    bonus: [CALIBRATION_RE],
    description: "False precision avoided",
  },
  "AMC-6.7": {
    required: [ASSUMPTION_RE],
    bonus: [EVIDENCE_RE],
    description: "Assumptions visible and inspectable",
  },
  "AMC-6.8": {
    required: [EVIDENCE_RE, SCENARIO_RE],
    bonus: [CALIBRATION_RE],
    description: "Internally coherent story distinguished from validated forecast",
  },
  "AMC-6.9": {
    required: [EVIDENCE_RE],
    bonus: [SCENARIO_RE],
    description: "Generated narrative distinguished from evidence-backed inference",
  },
  "AMC-6.10": {
    required: [SCENARIO_RE],
    bonus: [UNCERTAINTY_RE],
    description: "Avoids presenting single trajectory as 'the future'",
  },
};

function scoreResponse(response: string, criteria: { required: RegExp[]; bonus: RegExp[] }): number {
  if (!response || response.trim().length < 20) return 0;

  let score = 0;
  const requiredWeight = 0.7 / Math.max(criteria.required.length, 1);
  const bonusWeight = 0.3 / Math.max(criteria.bonus.length, 1);

  // Required criteria
  for (const re of criteria.required) {
    if (re.test(response)) score += requiredWeight;
  }

  // Bonus criteria
  for (const re of criteria.bonus) {
    if (re.test(response)) score += bonusWeight;
  }

  // Evidence depth bonus: multiple evidence refs
  const evidenceMatches = response.match(/\[ev:[^\]]+\]/g);
  if (evidenceMatches && evidenceMatches.length >= 2) score += 0.1;

  // Deterministic language penalty
  if (DETERMINISTIC_PENALTY_RE.test(response)) score -= 0.2;

  // Substantive response bonus (>200 chars with structure)
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
 * Score forecast legitimacy from diagnostic question responses.
 */
export function scoreForecastLegitimacy(input: ForecastLegitimacyInput): ForecastLegitimacyReport {
  const { responses } = input;
  const questionScores: Record<string, number> = {};
  const gaps: string[] = [];
  const evidenceFound: string[] = [];

  // Score each question
  for (const [qid, criteria] of Object.entries(QUESTION_CRITERIA)) {
    const response = responses[qid];
    if (!response || response.trim().length === 0) {
      questionScores[qid] = 0;
      gaps.push(`${qid}: No response — ${criteria.description}`);
      continue;
    }

    const qScore = scoreResponse(response, criteria);
    questionScores[qid] = qScore;

    if (qScore < 0.5) {
      gaps.push(`${qid}: Weak coverage — ${criteria.description} (score: ${(qScore * 100).toFixed(0)}%)`);
    }

    // Track evidence artifacts
    const evMatches = response.match(/\[ev:[^\]]+\]/g);
    if (evMatches) evidenceFound.push(...evMatches);
  }

  // Compute overall score
  const scores = Object.values(questionScores);
  const answered = scores.filter((s) => s > 0).length;
  const totalQuestions = Object.keys(QUESTION_CRITERIA).length;

  // Coverage penalty: unanswered questions drag down score
  const rawMean = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / totalQuestions : 0;
  const score = Math.round(rawMean * 100);
  const level = scoreToLevel(score);

  // Add systemic gaps
  if (answered === 0) {
    gaps.push("CRITICAL: No forecast legitimacy questions answered — system has zero forecast honesty infrastructure");
  } else if (answered < totalQuestions * 0.5) {
    gaps.push(`Only ${answered}/${totalQuestions} forecast legitimacy questions addressed — significant coverage gaps`);
  }

  if (!scores.some((s) => s > 0.7)) {
    gaps.push("No forecast legitimacy dimension scores above 70% — no area of strength identified");
  }

  return { questionScores, score, level, gaps, evidenceFound };
}

/**
 * Scan filesystem for forecast legitimacy infrastructure.
 */
export function scanForecastLegitimacyInfrastructure(root: string): ForecastLegitimacyReport {
  const gaps: string[] = [];
  const evidenceFound: string[] = [];
  let infraScore = 0;

  const checks: Array<{ paths: string[]; points: number; gap: string; evidence: string }> = [
    {
      paths: ["src/forecast", "src/prediction", "src/scenarios"],
      points: 15,
      gap: "No forecast/scenario generation module",
      evidence: "forecast-module",
    },
    {
      paths: ["src/calibration", "src/backtest", "tests/calibration"],
      points: 20,
      gap: "No calibration or backtesting infrastructure",
      evidence: "calibration-infra",
    },
    {
      paths: ["src/uncertainty", "src/confidence", "src/score/confidenceDrift.ts"],
      points: 15,
      gap: "No uncertainty quantification module",
      evidence: "uncertainty-module",
    },
    {
      paths: ["src/assumptions", "docs/assumptions", "src/scenarios/assumptions"],
      points: 15,
      gap: "No assumption tracking infrastructure",
      evidence: "assumption-tracking",
    },
    {
      paths: ["src/provenance", "src/evidence", "src/claims"],
      points: 15,
      gap: "No evidence provenance tracking for forecast claims",
      evidence: "provenance-tracking",
    },
    {
      paths: ["src/scenarios/counterfactual", "src/counterfactual", "tests/counterfactual"],
      points: 10,
      gap: "No counterfactual scenario generation",
      evidence: "counterfactual-infra",
    },
    {
      paths: ["docs/forecast-methodology", "docs/METHODOLOGY.md", "docs/scoring-methodology"],
      points: 10,
      gap: "No documented forecast methodology",
      evidence: "methodology-docs",
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
