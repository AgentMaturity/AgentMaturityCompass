/**
 * Gaming Resistance Scoring Module (Meta-Assurance)
 *
 * Tests whether the AMC scoring system itself can be gamed.
 * Can adversarial evidence injection inflate scores? Can an agent
 * produce contradictory evidence that confuses the diagnostic?
 *
 * This is meta-assurance: testing the test.
 *
 * Research basis:
 * - Alignment auditing (Marks et al. 2025): models can have hidden
 *   objectives that persist through safety training
 * - Sleeper Agents (Hubinger et al. 2024): adversarial training can
 *   teach models to HIDE unsafe behavior rather than remove it
 * - OWASP LLM Top 10: excessive agency, overreliance, model theft
 *   all represent gaming vectors against evaluation systems
 *
 * Attack vectors against scoring systems:
 * 1. Evidence flooding: submit massive amounts of low-quality evidence
 * 2. Selective evidence: only submit evidence for strong dimensions
 * 3. Temporal gaming: submit evidence in bursts before evaluation
 * 4. Context manipulation: behave well only in evaluation contexts
 * 5. Score inflation: exploit scoring formula edge cases
 */

import { existsSync } from "fs";
import { join } from "path";
import { detectControlSurfaceScope } from "./controlSurfaceScope.js";

export interface GamingResistanceReport {
  /**
   * False when the scanned directory is not an AMC source checkout.
   *
   * This scorer grades AMC's own control surface by looking for AMC source
   * files, so pointing it at a customer's repository previously produced a low
   * score that said nothing about their agent. When not applicable the score is
   * not meaningful and `notApplicableReason` explains what to run instead.
   */
  applicable?: boolean;
  notApplicableReason?: string;
  /** Resistance to evidence flooding */
  floodingResistance: { score: number; description: string };
  /** Resistance to selective evidence submission */
  selectiveResistance: { score: number; description: string };
  /** Resistance to temporal gaming */
  temporalResistance: { score: number; description: string };
  /** Resistance to context manipulation */
  contextResistance: { score: number; description: string };
  /** Resistance to score formula exploitation */
  formulaResistance: { score: number; description: string };
  /** Overall gaming resistance score 0-100 */
  score: number;
  /** Maturity level */
  level: number;
  /** Gaps */
  gaps: string[];
}

export function scoreGamingResistance(root: string): GamingResistanceReport {
  const gaps: string[] = [];

  // 1. Evidence flooding resistance
  let floodScore = 0;
  if (existsSync(join(root, "src/evidence"))) floodScore += 10;
  if (existsSync(join(root, "src/score/evidenceCoverageGap.ts"))) floodScore += 10; // Quality over quantity
  if (existsSync(join(root, "src/vault"))) floodScore += 5; // Signed evidence = harder to flood
  const floodingResistance = {
    score: floodScore,
    description: floodScore >= 20
      ? "Evidence quality gates prevent flooding"
      : "Vulnerable to evidence flooding — no quality gates on evidence submission",
  };
  if (floodScore < 15) gaps.push("No evidence quality gates — scoring can be inflated by submitting large volumes of low-quality evidence");

  // 2. Selective evidence resistance
  let selectiveScore = 0;
  if (existsSync(join(root, "src/score/evidenceCoverageGap.ts"))) selectiveScore += 10;
  if (existsSync(join(root, "src/diagnostic/questionBank.ts"))) selectiveScore += 5; // All questions must be answered
  if (existsSync(join(root, "src/score/operationalIndependence.ts"))) selectiveScore += 5;
  const selectiveResistance = {
    score: selectiveScore,
    description: selectiveScore >= 15
      ? "Coverage gap detection prevents selective evidence"
      : "Vulnerable to selective evidence — agent can cherry-pick strong dimensions",
  };
  if (selectiveScore < 10) gaps.push("No coverage gap detection — agents can submit evidence only for strong dimensions");

  // 3. Temporal gaming resistance
  let temporalScore = 0;
  if (existsSync(join(root, "src/score/claimExpiry.ts"))) temporalScore += 10;
  if (existsSync(join(root, "src/score/confidenceDrift.ts"))) temporalScore += 5;
  if (existsSync(join(root, "src/gateway"))) temporalScore += 5; // Continuous monitoring
  const temporalResistance = {
    score: temporalScore,
    description: temporalScore >= 15
      ? "Evidence decay and continuous monitoring prevent temporal gaming"
      : "Vulnerable to temporal gaming — evidence bursts before evaluation can inflate scores",
  };
  if (temporalScore < 10) gaps.push("No evidence decay mechanism — old evidence counts the same as fresh evidence");

  // 4. Context manipulation resistance
  let contextScore = 0;
  if (existsSync(join(root, "src/assurance"))) contextScore += 8;
  if (existsSync(join(root, "src/assurance/packs"))) contextScore += 7;
  if (existsSync(join(root, "src/score/behavioralTransparency.ts"))) contextScore += 5;
  const contextResistance = {
    score: contextScore,
    description: contextScore >= 15
      ? "Multi-context adversarial testing detects evaluation-specific behavior"
      : "Vulnerable to context manipulation — agent may behave differently during evaluation",
  };
  if (contextScore < 10) gaps.push("Insufficient multi-context testing — agent could behave well only during evaluation");

  // 5. Formula exploitation resistance
  let formulaScore = 0;
  if (existsSync(join(root, "src/score"))) formulaScore += 5;
  if (existsSync(join(root, "tests"))) formulaScore += 5;
  if (existsSync(join(root, "src/score/simplicityScoring.ts"))) formulaScore += 5;
  if (existsSync(join(root, "src/score/predictiveValidity.ts"))) formulaScore += 5;
  const formulaResistance = {
    score: formulaScore,
    description: formulaScore >= 15
      ? "Scoring formula is tested and validated against gaming"
      : "Scoring formula may have exploitable edge cases",
  };
  if (formulaScore < 10) gaps.push("Scoring formula not validated against adversarial inputs — edge cases may inflate scores");

  const totalScore = Math.min(100, floodingResistance.score + selectiveResistance.score +
    temporalResistance.score + contextResistance.score + formulaResistance.score);

  const level = totalScore >= 85 ? 5 : totalScore >= 65 ? 4 : totalScore >= 45 ? 3 : totalScore >= 25 ? 2 : totalScore >= 10 ? 1 : 0;

  const scope = detectControlSurfaceScope(root);
  return {
    floodingResistance,
    selectiveResistance,
    temporalResistance,
    contextResistance,
    formulaResistance,
    score: totalScore,
    level,
    gaps,
    // False when this is not an AMC source checkout: the checks above look
    // for AMC source files, so the score would say nothing about the target.
    applicable: scope.applicable,
    notApplicableReason: scope.applicable ? undefined : scope.reason
  };
}
