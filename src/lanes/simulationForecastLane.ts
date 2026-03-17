/**
 * Simulation & Forecast Evaluation Lane
 *
 * Aggregates 5 core dimensions for evaluating simulation/forecast systems:
 * 1. Forecast Legitimacy (AMC-6.1 to 6.10)
 * 2. Fact/Simulation Boundary Integrity (AMC-6.11 to 6.17 + 6.37 to 6.42)
 * 3. Synthetic Identity Governance (AMC-6.18 to 6.25 + 6.48 to 6.52)
 * 4. Simulation Validity (AMC-6.30 to 6.36)
 * 5. Scenario Provenance (AMC-6.26 to 6.29 + 6.53 to 6.57)
 *
 * Only activates for SystemType 'simulation-engine' | 'forecast-decision-support' |
 * 'synthetic-social-environment'.
 *
 * This is the Phase 4 deliverable from the MiroFish gap bridge.
 */

import type { SystemType } from "../types.js";
import { scoreForecastLegitimacy } from "../score/forecastLegitimacy.js";
import type { ForecastLegitimacyReport } from "../score/forecastLegitimacy.js";
import { scoreFactSimulationBoundary } from "../score/factSimulationBoundary.js";
import type { FactSimBoundaryReport } from "../score/factSimulationBoundary.js";
import { scoreSyntheticIdentityGovernance } from "../score/syntheticIdentityGovernance.js";
import type { SyntheticIdentityReport } from "../score/syntheticIdentityGovernance.js";
import { scoreSimulationValidity } from "../score/simulationValidity.js";
import type { SimulationValidityReport } from "../score/simulationValidity.js";
import { scoreScenarioProvenance } from "../score/scenarioProvenance.js";
import type { ScenarioProvenanceReport } from "../score/scenarioProvenance.js";

/** System types that activate this lane */
const SIMULATION_TYPES: SystemType[] = [
  "simulation-engine",
  "forecast-decision-support",
  "synthetic-social-environment",
];

/** Dimension weights — sum to 1.0 */
const DIMENSION_WEIGHTS = {
  forecastLegitimacy: 0.25,
  boundaryIntegrity: 0.20,
  syntheticIdentity: 0.20,
  simulationValidity: 0.20,
  scenarioProvenance: 0.15,
} as const;

export interface SimulationLaneDimension {
  name: string;
  score: number;
  level: number;
  weight: number;
  gaps: string[];
  evidenceFound: string[];
}

export interface SimulationLaneReport {
  /** Whether this lane is active for the given system type */
  active: boolean;
  /** System type that activated the lane */
  systemType: SystemType | null;
  /** Per-dimension reports */
  dimensions: {
    forecastLegitimacy: SimulationLaneDimension;
    boundaryIntegrity: SimulationLaneDimension;
    syntheticIdentity: SimulationLaneDimension;
    simulationValidity: SimulationLaneDimension;
    scenarioProvenance: SimulationLaneDimension;
  };
  /** Weighted overall score 0-100 */
  overallScore: number;
  /** Overall maturity level L0-L5 */
  overallLevel: number;
  /** All gaps across dimensions */
  allGaps: string[];
  /** Total questions answered vs total */
  coverage: { answered: number; total: number; percentage: number };
  /** Top 3 priority recommendations */
  priorities: string[];
  /** Detailed sub-reports for each scoring module */
  details: {
    forecastLegitimacy: ForecastLegitimacyReport;
    boundaryIntegrity: FactSimBoundaryReport;
    syntheticIdentity: SyntheticIdentityReport;
    simulationValidity: SimulationValidityReport;
    scenarioProvenance: ScenarioProvenanceReport;
  };
}

/**
 * Check if a system type activates the simulation & forecast lane.
 */
export function isSimulationLaneActive(systemType: SystemType | undefined | null): boolean {
  if (!systemType) return false;
  return SIMULATION_TYPES.includes(systemType);
}

/**
 * Get the list of all AMC-6.x question IDs this lane covers.
 */
export function getSimulationLaneQuestionIds(): string[] {
  const ids: string[] = [];
  for (let i = 1; i <= 57; i++) {
    ids.push(`AMC-6.${i}`);
  }
  return ids;
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
 * Compute priority recommendations from gaps.
 */
function computePriorities(dimensions: SimulationLaneReport["dimensions"]): string[] {
  const prioritized: Array<{ dim: string; score: number; topGap: string }> = [];

  for (const [key, dim] of Object.entries(dimensions)) {
    if (dim.gaps.length > 0) {
      prioritized.push({
        dim: dim.name,
        score: dim.score,
        topGap: dim.gaps[0]!,
      });
    }
  }

  // Sort by score ascending (worst dimensions first)
  prioritized.sort((a, b) => a.score - b.score);

  return prioritized.slice(0, 3).map(
    (p) => `[${p.dim} — ${p.score}%] ${p.topGap}`
  );
}

/**
 * Run the full Simulation & Forecast evaluation lane.
 *
 * @param systemType - The system type being evaluated
 * @param responses - All diagnostic question responses keyed by AMC-x.x ID
 * @returns Complete lane report with per-dimension and overall scores
 */
export function evaluateSimulationLane(
  systemType: SystemType | undefined | null,
  responses: Record<string, string>
): SimulationLaneReport {
  const active = isSimulationLaneActive(systemType);

  if (!active) {
    return {
      active: false,
      systemType: systemType ?? null,
      dimensions: {
        forecastLegitimacy: { name: "Forecast Legitimacy", score: 0, level: 0, weight: DIMENSION_WEIGHTS.forecastLegitimacy, gaps: [], evidenceFound: [] },
        boundaryIntegrity: { name: "Boundary Integrity", score: 0, level: 0, weight: DIMENSION_WEIGHTS.boundaryIntegrity, gaps: [], evidenceFound: [] },
        syntheticIdentity: { name: "Synthetic Identity Governance", score: 0, level: 0, weight: DIMENSION_WEIGHTS.syntheticIdentity, gaps: [], evidenceFound: [] },
        simulationValidity: { name: "Simulation Validity", score: 0, level: 0, weight: DIMENSION_WEIGHTS.simulationValidity, gaps: [], evidenceFound: [] },
        scenarioProvenance: { name: "Scenario Provenance", score: 0, level: 0, weight: DIMENSION_WEIGHTS.scenarioProvenance, gaps: [], evidenceFound: [] },
      },
      overallScore: 0,
      overallLevel: 0,
      allGaps: ["Simulation & Forecast lane is not active for this system type"],
      coverage: { answered: 0, total: 57, percentage: 0 },
      priorities: [],
      details: {
        forecastLegitimacy: { questionScores: {}, score: 0, level: 0, gaps: [], evidenceFound: [] },
        boundaryIntegrity: { questionScores: {}, boundaryScore: 0, writebackScore: 0, score: 0, level: 0, gaps: [], evidenceFound: [] },
        syntheticIdentity: { questionScores: {}, personaScore: 0, realPersonScore: 0, score: 0, level: 0, gaps: [], evidenceFound: [] },
        simulationValidity: { questionScores: {}, score: 0, level: 0, gaps: [], evidenceFound: [] },
        scenarioProvenance: { questionScores: {}, traceabilityScore: 0, interactionScore: 0, score: 0, level: 0, gaps: [], evidenceFound: [] },
      },
    };
  }

  // Run each scoring module
  const flReport = scoreForecastLegitimacy({ responses });
  const fsbReport = scoreFactSimulationBoundary({ responses });
  const sigReport = scoreSyntheticIdentityGovernance({ responses });
  const svReport = scoreSimulationValidity({ responses });
  const spReport = scoreScenarioProvenance({ responses });

  // Build dimension summaries
  const dimensions: SimulationLaneReport["dimensions"] = {
    forecastLegitimacy: {
      name: "Forecast Legitimacy",
      score: flReport.score,
      level: flReport.level,
      weight: DIMENSION_WEIGHTS.forecastLegitimacy,
      gaps: flReport.gaps,
      evidenceFound: flReport.evidenceFound,
    },
    boundaryIntegrity: {
      name: "Boundary Integrity",
      score: fsbReport.score,
      level: fsbReport.level,
      weight: DIMENSION_WEIGHTS.boundaryIntegrity,
      gaps: fsbReport.gaps,
      evidenceFound: fsbReport.evidenceFound,
    },
    syntheticIdentity: {
      name: "Synthetic Identity Governance",
      score: sigReport.score,
      level: sigReport.level,
      weight: DIMENSION_WEIGHTS.syntheticIdentity,
      gaps: sigReport.gaps,
      evidenceFound: sigReport.evidenceFound,
    },
    simulationValidity: {
      name: "Simulation Validity",
      score: svReport.score,
      level: svReport.level,
      weight: DIMENSION_WEIGHTS.simulationValidity,
      gaps: svReport.gaps,
      evidenceFound: svReport.evidenceFound,
    },
    scenarioProvenance: {
      name: "Scenario Provenance",
      score: spReport.score,
      level: spReport.level,
      weight: DIMENSION_WEIGHTS.scenarioProvenance,
      gaps: spReport.gaps,
      evidenceFound: spReport.evidenceFound,
    },
  };

  // Weighted overall score
  const overallScore = Math.round(
    flReport.score * DIMENSION_WEIGHTS.forecastLegitimacy +
    fsbReport.score * DIMENSION_WEIGHTS.boundaryIntegrity +
    sigReport.score * DIMENSION_WEIGHTS.syntheticIdentity +
    svReport.score * DIMENSION_WEIGHTS.simulationValidity +
    spReport.score * DIMENSION_WEIGHTS.scenarioProvenance
  );
  const overallLevel = scoreToLevel(overallScore);

  // Aggregate gaps
  const allGaps = [
    ...flReport.gaps,
    ...fsbReport.gaps,
    ...sigReport.gaps,
    ...svReport.gaps,
    ...spReport.gaps,
  ];

  // Coverage
  const allQuestionScores = {
    ...flReport.questionScores,
    ...fsbReport.questionScores,
    ...sigReport.questionScores,
    ...svReport.questionScores,
    ...spReport.questionScores,
  };
  const answered = Object.values(allQuestionScores).filter((s) => s > 0).length;
  const total = 57;
  const percentage = Math.round((answered / total) * 100);

  const priorities = computePriorities(dimensions);

  return {
    active: true,
    systemType: systemType as SystemType,
    dimensions,
    overallScore,
    overallLevel,
    allGaps,
    coverage: { answered, total, percentage },
    priorities,
    details: {
      forecastLegitimacy: flReport,
      boundaryIntegrity: fsbReport,
      syntheticIdentity: sigReport,
      simulationValidity: svReport,
      scenarioProvenance: spReport,
    },
  };
}
