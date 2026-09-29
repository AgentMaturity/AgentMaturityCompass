/**
 * Inventory of AMC source paths associated with score-gaming controls.
 *
 * File existence is not evidence that a control works. This inventory does
 * not execute adversarial evidence injection or assess an agent's behavior,
 * so it cannot produce a gaming-resistance score or maturity level.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import { detectControlSurfaceScope } from "./controlSurfaceScope.js";

interface ControlInventoryDimension {
  /** Source-path inventory points only; not a resistance measurement. */
  score: number;
  presentPaths: string[];
  missingPaths: string[];
}

export interface GamingResistanceReport {
  applicable: false;
  notApplicableReason: string;
  assessmentStatus: "not_measured";
  assessmentReason: string;
  /** No behavioral resistance evidence is collected by this function. */
  score: null;
  level: null;
  gaps: string[];
  controlInventory: {
    /** Whether the scanned directory has AMC source markers. */
    applicable: boolean;
    notApplicableReason?: string;
    /** Source-path inventory points only; never a security threshold. */
    score: number;
    flooding: ControlInventoryDimension;
    selectiveEvidence: ControlInventoryDimension;
    temporal: ControlInventoryDimension;
    context: ControlInventoryDimension;
    formula: ControlInventoryDimension;
  };
}

function inventoryDimension(root: string, paths: Array<[string, number]>): ControlInventoryDimension {
  const result: ControlInventoryDimension = { score: 0, presentPaths: [], missingPaths: [] };
  for (const [path, points] of paths) {
    if (existsSync(join(root, path))) {
      result.score += points;
      result.presentPaths.push(path);
    } else {
      result.missingPaths.push(path);
    }
  }
  return result;
}

export function scoreGamingResistance(root: string): GamingResistanceReport {
  const flooding = inventoryDimension(root, [
    ["src/evidence", 10], ["src/score/evidenceCoverageGap.ts", 10], ["src/vault", 5],
  ]);
  const selectiveEvidence = inventoryDimension(root, [
    ["src/score/evidenceCoverageGap.ts", 10], ["src/diagnostic/questionBank.ts", 5],
    ["src/score/operationalIndependence.ts", 5],
  ]);
  const temporal = inventoryDimension(root, [
    ["src/score/claimExpiry.ts", 10], ["src/score/confidenceDrift.ts", 5], ["src/gateway", 5],
  ]);
  const context = inventoryDimension(root, [
    ["src/assurance", 8], ["src/assurance/packs", 7], ["src/score/behavioralTransparency.ts", 5],
  ]);
  const formula = inventoryDimension(root, [
    ["src/score", 5], ["tests", 5], ["src/score/simplicityScoring.ts", 5],
    ["src/score/predictiveValidity.ts", 5],
  ]);
  const scope = detectControlSurfaceScope(root);
  const assessmentReason =
    "Gaming resistance is not measured: source-path presence is a control inventory, not behavioral evidence. " +
    "No adversarial evidence-injection test was executed. Use 'amc run' for evidence-based agent scoring; " +
    "this inventory cannot establish resistance to score manipulation.";

  return {
    applicable: false,
    notApplicableReason: assessmentReason,
    assessmentStatus: "not_measured",
    assessmentReason,
    score: null,
    level: null,
    gaps: ["Behavioral gaming-resistance evidence is unavailable."],
    controlInventory: {
      applicable: scope.applicable,
      notApplicableReason: scope.applicable ? undefined : scope.reason,
      score: Math.min(100, flooding.score + selectiveEvidence.score + temporal.score + context.score + formula.score),
      flooding,
      selectiveEvidence,
      temporal,
      context,
      formula,
    },
  };
}
