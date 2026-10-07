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

/** Source paths found and missing for one control group; never a number (P0-15). */
interface ControlInventoryDimension {
  presentPaths: string[];
  missingPaths: string[];
}

export interface GamingResistanceReport {
  status: "not_evaluated";
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
    flooding: ControlInventoryDimension;
    selectiveEvidence: ControlInventoryDimension;
    temporal: ControlInventoryDimension;
    context: ControlInventoryDimension;
    formula: ControlInventoryDimension;
  };
}

function inventoryDimension(root: string, paths: string[]): ControlInventoryDimension {
  const present = paths.filter((path) => existsSync(join(root, path)));
  return { presentPaths: present, missingPaths: paths.filter((path) => !present.includes(path)) };
}

export function scoreGamingResistance(root: string): GamingResistanceReport {
  const flooding = inventoryDimension(root, [
    "src/evidence", "src/score/evidenceCoverageGap.ts", "src/vault",
  ]);
  const selectiveEvidence = inventoryDimension(root, [
    "src/score/evidenceCoverageGap.ts", "src/diagnostic/questionBank.ts",
    "src/score/operationalIndependence.ts",
  ]);
  const temporal = inventoryDimension(root, [
    "src/score/claimExpiry.ts", "src/score/confidenceDrift.ts", "src/gateway",
  ]);
  const context = inventoryDimension(root, [
    "src/assurance", "src/assurance/packs", "src/score/behavioralTransparency.ts",
  ]);
  const formula = inventoryDimension(root, [
    "src/score", "tests", "src/score/simplicityScoring.ts",
    "src/score/predictiveValidity.ts",
  ]);
  const scope = detectControlSurfaceScope(root);
  const assessmentReason =
    "Gaming resistance is not measured: source-path presence is a control inventory, not behavioral evidence. " +
    "No adversarial evidence-injection test was executed. Use 'amc run' for evidence-based agent scoring; " +
    "this inventory cannot establish resistance to score manipulation.";

  return {
    status: "not_evaluated",
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
      flooding,
      selectiveEvidence,
      temporal,
      context,
      formula,
    },
  };
}
