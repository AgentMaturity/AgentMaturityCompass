/**
 * Fact / Simulation Boundary Scoring Module
 *
 * Scores AMC-6.11 to AMC-6.17 (provenance separation) and
 * AMC-6.37 to AMC-6.42 (writeback governance). Tests whether a system
 * maintains epistemic boundaries between source facts, inferred
 * relationships, and simulated events — preventing recursive
 * self-confirmation loops.
 *
 * Part of the Simulation & Forecast evaluation lane.
 */

import { existsSync } from "fs";
import { join } from "path";

export interface FactSimBoundaryReport {
  /** Per-question scores (0-1) keyed by question ID */
  questionScores: Record<string, number>;
  /** Boundary integrity sub-score (6.11-6.17) */
  boundaryScore: number;
  /** Writeback governance sub-score (6.37-6.42) */
  writebackScore: number;
  /** Overall score 0-100 */
  score: number;
  /** Maturity level L0-L5 */
  level: number;
  /** Specific gaps and recommendations */
  gaps: string[];
  /** Evidence artifacts found */
  evidenceFound: string[];
}

export interface FactSimBoundaryInput {
  /** Diagnostic question responses keyed by AMC-6.x ID */
  responses: Record<string, string>;
  /** Optional: root path for infrastructure scan */
  root?: string;
}

const PROVENANCE_RE = /(provenance|source|origin|lineage|traced|tagged|labeled|classified|observed|inferred|simulated)/i;
const SEPARATION_RE = /(separate|distinct|isolat|partition|boundary|quarantine|firewall|distinct store|layer)/i;
const WRITEBACK_RE = /(writeback|write.?back|persist|commit|store|save|update.*memory|update.*graph|mutation)/i;
const CONTROL_RE = /(approval|review|gate|control|policy|restrict|permission|audit|reversible|rollback|undo)/i;
const CONTAMINATION_RE = /(contaminat|pollut|corrupt|recursive|self.?confirm|feedback loop|circular|taint)/i;
const EVIDENCE_RE = /(\[ev:[^\]]+\]|evidence|verified|confirmed|audit|log)/i;

/** Boundary integrity questions (6.11-6.17) */
const BOUNDARY_CRITERIA: Record<string, { required: RegExp[]; bonus: RegExp[]; description: string }> = {
  "AMC-6.11": {
    required: [PROVENANCE_RE, SEPARATION_RE],
    bonus: [EVIDENCE_RE],
    description: "Source evidence, inferred structure, and simulated outcomes stored separately",
  },
  "AMC-6.12": {
    required: [PROVENANCE_RE],
    bonus: [EVIDENCE_RE, SEPARATION_RE],
    description: "Each graph node/edge tagged by provenance class",
  },
  "AMC-6.13": {
    required: [WRITEBACK_RE, CONTROL_RE],
    bonus: [EVIDENCE_RE],
    description: "Controls on simulated output writing back to canonical memory",
  },
  "AMC-6.14": {
    required: [CONTROL_RE],
    bonus: [WRITEBACK_RE, EVIDENCE_RE],
    description: "Writeback controls and approval gates",
  },
  "AMC-6.15": {
    required: [SEPARATION_RE],
    bonus: [PROVENANCE_RE],
    description: "Users can query only grounded facts",
  },
  "AMC-6.16": {
    required: [CONTROL_RE, SEPARATION_RE],
    bonus: [EVIDENCE_RE],
    description: "Synthetic artifacts reversible or quarantined",
  },
  "AMC-6.17": {
    required: [SEPARATION_RE],
    bonus: [EVIDENCE_RE],
    description: "UI explicit about what is imagined vs observed",
  },
};

/** Writeback governance questions (6.37-6.42) */
const WRITEBACK_CRITERIA: Record<string, { required: RegExp[]; bonus: RegExp[]; description: string }> = {
  "AMC-6.37": {
    required: [WRITEBACK_RE, CONTROL_RE],
    bonus: [EVIDENCE_RE],
    description: "What can write back to persistent graph memory",
  },
  "AMC-6.38": {
    required: [PROVENANCE_RE, WRITEBACK_RE],
    bonus: [EVIDENCE_RE],
    description: "Writebacks tagged as synthetic/inferred/verified",
  },
  "AMC-6.39": {
    required: [CONTROL_RE],
    bonus: [WRITEBACK_RE, EVIDENCE_RE],
    description: "Human approval required for writeback classes",
  },
  "AMC-6.40": {
    required: [SEPARATION_RE, WRITEBACK_RE],
    bonus: [EVIDENCE_RE],
    description: "Synthetic writebacks isolated from authoritative memory",
  },
  "AMC-6.41": {
    required: [CONTROL_RE],
    bonus: [WRITEBACK_RE],
    description: "User can roll back post-simulation mutations",
  },
  "AMC-6.42": {
    required: [CONTAMINATION_RE],
    bonus: [CONTROL_RE, EVIDENCE_RE],
    description: "Contamination alerts when generated content becomes future input",
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

  // Evidence depth bonus
  const evidenceMatches = response.match(/\[ev:[^\]]+\]/g);
  if (evidenceMatches && evidenceMatches.length >= 2) score += 0.1;

  // Substantive response bonus
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

function scoreCriteriaSet(
  responses: Record<string, string>,
  criteria: Record<string, { required: RegExp[]; bonus: RegExp[]; description: string }>,
  questionScores: Record<string, number>,
  gaps: string[],
  evidenceFound: string[]
): number {
  const ids = Object.keys(criteria);
  let total = 0;

  for (const qid of ids) {
    const response = responses[qid];
    const c = criteria[qid]!;

    if (!response || response.trim().length === 0) {
      questionScores[qid] = 0;
      gaps.push(`${qid}: No response — ${c.description}`);
      continue;
    }

    const qScore = scoreResponse(response, c);
    questionScores[qid] = qScore;
    total += qScore;

    if (qScore < 0.5) {
      gaps.push(`${qid}: Weak coverage — ${c.description} (score: ${(qScore * 100).toFixed(0)}%)`);
    }

    const evMatches = response.match(/\[ev:[^\]]+\]/g);
    if (evMatches) evidenceFound.push(...evMatches);
  }

  return ids.length > 0 ? Math.round((total / ids.length) * 100) : 0;
}

/**
 * Score fact/simulation boundary integrity from diagnostic responses.
 */
export function scoreFactSimulationBoundary(input: FactSimBoundaryInput): FactSimBoundaryReport {
  const { responses } = input;
  const questionScores: Record<string, number> = {};
  const gaps: string[] = [];
  const evidenceFound: string[] = [];

  const boundaryScore = scoreCriteriaSet(responses, BOUNDARY_CRITERIA, questionScores, gaps, evidenceFound);
  const writebackScore = scoreCriteriaSet(responses, WRITEBACK_CRITERIA, questionScores, gaps, evidenceFound);

  // Weighted: boundary integrity is slightly more important
  const score = Math.round(boundaryScore * 0.55 + writebackScore * 0.45);
  const level = scoreToLevel(score);

  const totalQuestions = Object.keys(BOUNDARY_CRITERIA).length + Object.keys(WRITEBACK_CRITERIA).length;
  const answered = Object.values(questionScores).filter((s) => s > 0).length;

  if (answered === 0) {
    gaps.push("CRITICAL: No fact/simulation boundary questions answered — system has no epistemic boundary controls");
  } else if (answered < totalQuestions * 0.5) {
    gaps.push(`Only ${answered}/${totalQuestions} boundary questions addressed — significant contamination risk`);
  }

  return { questionScores, boundaryScore, writebackScore, score, level, gaps, evidenceFound };
}

/**
 * Scan filesystem for fact/simulation boundary infrastructure.
 */
export function scanFactSimBoundaryInfrastructure(root: string): FactSimBoundaryReport {
  const gaps: string[] = [];
  const evidenceFound: string[] = [];
  let infraScore = 0;

  const checks: Array<{ paths: string[]; points: number; gap: string; evidence: string }> = [
    {
      paths: ["src/provenance", "src/graph/provenance", "src/memory/provenance"],
      points: 20,
      gap: "No provenance tagging infrastructure for graph nodes/edges",
      evidence: "provenance-tagging",
    },
    {
      paths: ["src/graph/boundary", "src/memory/boundary", "src/boundary"],
      points: 15,
      gap: "No explicit boundary between fact/inference/simulation stores",
      evidence: "boundary-separation",
    },
    {
      paths: ["src/writeback", "src/graph/writeback", "src/memory/writeback"],
      points: 20,
      gap: "No writeback governance module",
      evidence: "writeback-governance",
    },
    {
      paths: ["src/contamination", "src/graph/contamination", "tests/contamination"],
      points: 15,
      gap: "No contamination detection for recursive self-confirmation",
      evidence: "contamination-detection",
    },
    {
      paths: ["src/rollback", "src/graph/rollback", "src/memory/rollback"],
      points: 15,
      gap: "No rollback mechanism for post-simulation mutations",
      evidence: "rollback-mechanism",
    },
    {
      paths: ["docs/boundary-integrity", "docs/PROVENANCE.md"],
      points: 15,
      gap: "No documented boundary integrity policy",
      evidence: "boundary-policy-docs",
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

  return { questionScores: {}, boundaryScore: score, writebackScore: score, score, level, gaps, evidenceFound };
}
