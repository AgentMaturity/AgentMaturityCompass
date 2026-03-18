/**
 * AI Safety Research Alignment Evaluation Lane
 *
 * Aggregates 4 core dimensions for evaluating AI safety research alignment:
 * 1. Process Deception Detection (AMC-7.1 to 7.12)
 * 2. Oversight Integrity (AMC-7.13 to 7.18)
 * 3. Capability Governance (AMC-7.19 to 7.30)
 * 4. Organizational Safety Posture (AMC-7.31 to 7.40)
 *
 * Weights:
 *   processDeception    30%
 *   oversightIntegrity  25%
 *   capabilityGovernance 25%
 *   organizationalSafety 20%
 */

import { scoreProcessDeceptionDetection } from "../score/processDeceptionDetection.js";
import type { ProcessDeceptionDetectionReport } from "../score/processDeceptionDetection.js";
import { scoreOversightIntegrity } from "../score/oversightIntegrity.js";
import type { OversightIntegrityReport } from "../score/oversightIntegrity.js";
import { scoreCapabilityGovernance } from "../score/capabilityGovernance.js";
import type { CapabilityGovernanceReport } from "../score/capabilityGovernance.js";
import { scoreOrganizationalSafetyPosture } from "../score/organizationalSafetyPosture.js";
import type { OrganizationalSafetyPostureReport } from "../score/organizationalSafetyPosture.js";

/** Dimension weights — sum to 1.0 */
const DIMENSION_WEIGHTS = {
  processDeception: 0.30,
  oversightIntegrity: 0.25,
  capabilityGovernance: 0.25,
  organizationalSafety: 0.20,
} as const;

export interface SafetyResearchLaneDimension {
  name: string;
  score: number;
  level: number;
  weight: number;
  gaps: string[];
  evidenceFound: string[];
}

export interface SafetyResearchLaneReport {
  /** Per-dimension reports */
  dimensions: {
    processDeception: SafetyResearchLaneDimension;
    oversightIntegrity: SafetyResearchLaneDimension;
    capabilityGovernance: SafetyResearchLaneDimension;
    organizationalSafety: SafetyResearchLaneDimension;
  };
  /** Weighted overall score 0-100 */
  overallScore: number;
  /** Overall maturity level L0-L5 */
  overallLevel: number;
  /** Total gap count across all dimensions */
  totalGaps: number;
  /** All gaps across dimensions */
  allGaps: string[];
  /** Top 3 priority recommendations */
  priorities: string[];
  /** Detailed sub-reports for each scoring module */
  details: {
    processDeception: ProcessDeceptionDetectionReport;
    oversightIntegrity: OversightIntegrityReport;
    capabilityGovernance: CapabilityGovernanceReport;
    organizationalSafety: OrganizationalSafetyPostureReport;
  };
}

function scoreToLevel(score: number): number {
  if (score >= 90) return 5;
  if (score >= 70) return 4;
  if (score >= 50) return 3;
  if (score >= 30) return 2;
  if (score >= 10) return 1;
  return 0;
}

function computePriorities(dimensions: SafetyResearchLaneReport["dimensions"]): string[] {
  const prioritized: Array<{ dim: string; score: number; topGap: string }> = [];

  for (const [, dim] of Object.entries(dimensions)) {
    if (dim.gaps.length > 0) {
      prioritized.push({
        dim: dim.name,
        score: dim.score,
        topGap: dim.gaps[0]!,
      });
    }
  }

  prioritized.sort((a, b) => a.score - b.score);

  return prioritized.slice(0, 3).map(
    (p) => `[${p.dim} — ${p.score}%] ${p.topGap}`
  );
}

/**
 * Run the full AI Safety Research Alignment evaluation lane.
 *
 * @param responses - All diagnostic question responses keyed by AMC-7.x ID
 * @returns Complete lane report with per-dimension and overall scores
 */
export function scoreSafetyResearchLane(responses: Record<string, string>): SafetyResearchLaneReport {
  // Run each scoring module
  const pdReport = scoreProcessDeceptionDetection({ responses });
  const oiReport = scoreOversightIntegrity({ responses });
  const cgReport = scoreCapabilityGovernance({ responses });
  const osReport = scoreOrganizationalSafetyPosture({ responses });

  // Build dimension summaries
  const dimensions: SafetyResearchLaneReport["dimensions"] = {
    processDeception: {
      name: "Process Deception Detection",
      score: pdReport.score,
      level: pdReport.level,
      weight: DIMENSION_WEIGHTS.processDeception,
      gaps: pdReport.gaps,
      evidenceFound: pdReport.evidenceFound,
    },
    oversightIntegrity: {
      name: "Oversight Integrity",
      score: oiReport.score,
      level: oiReport.level,
      weight: DIMENSION_WEIGHTS.oversightIntegrity,
      gaps: oiReport.gaps,
      evidenceFound: oiReport.evidenceFound,
    },
    capabilityGovernance: {
      name: "Capability Governance",
      score: cgReport.score,
      level: cgReport.level,
      weight: DIMENSION_WEIGHTS.capabilityGovernance,
      gaps: cgReport.gaps,
      evidenceFound: cgReport.evidenceFound,
    },
    organizationalSafety: {
      name: "Organizational Safety Posture",
      score: osReport.score,
      level: osReport.level,
      weight: DIMENSION_WEIGHTS.organizationalSafety,
      gaps: osReport.gaps,
      evidenceFound: osReport.evidenceFound,
    },
  };

  // Weighted overall score
  const overallScore = Math.round(
    pdReport.score * DIMENSION_WEIGHTS.processDeception +
    oiReport.score * DIMENSION_WEIGHTS.oversightIntegrity +
    cgReport.score * DIMENSION_WEIGHTS.capabilityGovernance +
    osReport.score * DIMENSION_WEIGHTS.organizationalSafety
  );
  const overallLevel = scoreToLevel(overallScore);

  // Aggregate gaps
  const allGaps = [
    ...pdReport.gaps,
    ...oiReport.gaps,
    ...cgReport.gaps,
    ...osReport.gaps,
  ];

  const totalGaps = allGaps.length;
  const priorities = computePriorities(dimensions);

  return {
    dimensions,
    overallScore,
    overallLevel,
    totalGaps,
    allGaps,
    priorities,
    details: {
      processDeception: pdReport,
      oversightIntegrity: oiReport,
      capabilityGovernance: cgReport,
      organizationalSafety: osReport,
    },
  };
}

/**
 * Get the list of all AMC-7.x question IDs this lane covers.
 */
export function getSafetyResearchLaneQuestionIds(): string[] {
  const ids: string[] = [];
  for (let i = 1; i <= 40; i++) {
    ids.push(`AMC-7.${i}`);
  }
  return ids;
}
