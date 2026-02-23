/**
 * Evidence Density Map Scoring Module
 *
 * Visualizes WHERE evidence gaps cluster across dimensions and questions.
 * Surfaces blind spots that aggregate scores hide.
 *
 * Research basis:
 * - Graph-based knowledge systems: dense regions = high confidence,
 *   sparse regions = blind spots
 * - METR autonomy evaluation: task suites at different difficulty levels
 *   reveal capability gaps that single-score metrics miss
 * - AMC evidenceCoverageGap.ts: partially exists but not exposed as
 *   a per-question, per-dimension density visualization
 */

import { existsSync, readFileSync, readdirSync } from "fs";
import { join } from "path";

export interface DensityCell {
  questionId: string;
  dimension: string;
  evidenceCount: number;
  /** 0 = no evidence, 1 = fully covered */
  density: number;
  /** Whether this cell has been adversarially tested */
  adversarialTested: boolean;
}

export interface DimensionDensity {
  dimension: string;
  totalQuestions: number;
  coveredQuestions: number;
  coverageRatio: number;
  avgDensity: number;
  sparsestQuestion: string | null;
}

export interface DensityMapReport {
  /** Per-cell density (question × dimension) */
  cells: DensityCell[];
  /** Per-dimension summary */
  dimensions: DimensionDensity[];
  /** Overall coverage ratio */
  overallCoverage: number;
  /** Number of completely uncovered questions */
  blindSpots: number;
  /** Cluster analysis: are gaps random or systematic? */
  clusterPattern: "random" | "dimensional" | "difficulty" | "unknown";
  /** Overall score 0-100 */
  score: number;
  /** Maturity level */
  level: number;
  /** Gaps */
  gaps: string[];
}

export interface EvidenceRecord {
  questionId: string;
  dimension: string;
  count: number;
  adversarialTested?: boolean;
}

/**
 * Build a density map from evidence records.
 */
export function buildDensityMap(
  records: EvidenceRecord[],
  totalQuestions: number
): DensityMapReport {
  const gaps: string[] = [];

  if (records.length === 0) {
    return {
      cells: [],
      dimensions: [],
      overallCoverage: 0,
      blindSpots: totalQuestions,
      clusterPattern: "unknown",
      score: 0,
      level: 0,
      gaps: ["No evidence records — density map is empty"],
    };
  }

  // Build cells
  const maxCount = Math.max(...records.map((r) => r.count), 1);
  const cells: DensityCell[] = records.map((r) => ({
    questionId: r.questionId,
    dimension: r.dimension,
    evidenceCount: r.count,
    density: r.count / maxCount,
    adversarialTested: r.adversarialTested ?? false,
  }));

  // Group by dimension
  const byDimension: Record<string, EvidenceRecord[]> = {};
  for (const r of records) {
    if (!byDimension[r.dimension]) byDimension[r.dimension] = [];
    byDimension[r.dimension]!.push(r);
  }

  const dimensions: DimensionDensity[] = Object.entries(byDimension).map(
    ([dim, recs]) => {
      const covered = recs.filter((r) => r.count > 0).length;
      const avgDensity =
        recs.reduce((sum, r) => sum + r.count, 0) / (recs.length * maxCount);
      const sparsest = recs.sort((a, b) => a.count - b.count)[0];
      return {
        dimension: dim,
        totalQuestions: recs.length,
        coveredQuestions: covered,
        coverageRatio: covered / recs.length,
        avgDensity,
        sparsestQuestion: sparsest ? sparsest.questionId : null,
      };
    }
  );

  // Overall metrics
  const coveredCells = cells.filter((c) => c.evidenceCount > 0).length;
  const overallCoverage = coveredCells / Math.max(cells.length, 1);
  const blindSpots = cells.filter((c) => c.evidenceCount === 0).length;

  // Cluster analysis
  const dimCoverages = dimensions.map((d) => d.coverageRatio);
  const coverageVariance =
    dimCoverages.length > 1
      ? dimCoverages.reduce((sum, c) => {
          const mean = dimCoverages.reduce((s, v) => s + v, 0) / dimCoverages.length;
          return sum + Math.pow(c - mean, 2);
        }, 0) / dimCoverages.length
      : 0;

  let clusterPattern: "random" | "dimensional" | "difficulty" | "unknown";
  if (coverageVariance > 0.1) {
    clusterPattern = "dimensional"; // Gaps cluster by dimension
    const weakest = dimensions.sort((a, b) => a.coverageRatio - b.coverageRatio)[0];
    if (weakest) {
      gaps.push(
        `Dimensional blind spot: ${weakest.dimension} has ${(weakest.coverageRatio * 100).toFixed(0)}% coverage — systematic gap`
      );
    }
  } else if (overallCoverage < 0.5) {
    clusterPattern = "random";
    gaps.push("Evidence gaps are scattered randomly — no systematic coverage strategy");
  } else {
    clusterPattern = "random";
  }

  if (blindSpots > 0) {
    gaps.push(`${blindSpots} questions have zero evidence — complete blind spots`);
  }
  if (overallCoverage < 0.5) {
    gaps.push(`Overall evidence coverage is ${(overallCoverage * 100).toFixed(0)}% — below 50% threshold`);
  }

  const notAdversarial = cells.filter((c) => c.evidenceCount > 0 && !c.adversarialTested).length;
  if (notAdversarial > coveredCells * 0.5) {
    gaps.push(`${notAdversarial} covered questions lack adversarial testing — evidence quality is untested`);
  }

  const score = Math.round(overallCoverage * 100);
  const level = score >= 90 ? 5 : score >= 70 ? 4 : score >= 50 ? 3 : score >= 30 ? 2 : score >= 10 ? 1 : 0;

  return {
    cells,
    dimensions,
    overallCoverage,
    blindSpots,
    clusterPattern,
    score,
    level,
    gaps,
  };
}

/**
 * Scan a repo for density map infrastructure.
 */
export function scanDensityMapInfra(root: string): DensityMapReport {
  const gaps: string[] = [];
  let infraScore = 0;

  const checks: [string, string, number][] = [
    ["src/score/evidenceCoverageGap.ts", "Evidence coverage gap analysis", 20],
    ["src/diagnostic/questionBank.ts", "Question bank for coverage mapping", 20],
    [".amc/evidence", "Evidence storage directory", 15],
    ["src/score/evidenceCollector.ts", "Evidence collection engine", 15],
    ["src/studio", "Studio visualization layer", 15],
    ["src/watch", "Watch monitoring for live density", 15],
  ];

  for (const [path, desc, points] of checks) {
    if (existsSync(join(root, path))) {
      infraScore += points;
    } else {
      gaps.push(`Missing: ${desc}`);
    }
  }

  const level = infraScore >= 90 ? 5 : infraScore >= 70 ? 4 : infraScore >= 50 ? 3 : infraScore >= 30 ? 2 : infraScore >= 10 ? 1 : 0;

  return {
    cells: [],
    dimensions: [],
    overallCoverage: infraScore / 100,
    blindSpots: 0,
    clusterPattern: "unknown",
    score: infraScore,
    level,
    gaps,
  };
}
