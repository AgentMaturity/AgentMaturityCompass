/**
 * prior art Self-Knowledge Maturity
 * Scores whether an agent knows what it knows — confidence calibration,
 * typed relationships, trace-based learning, and self-modifying inference.
 * Source: AMC research — self-knowledge maturity analysis
 *
 * Four prior art architectures:
 * 1. Typed Attention — labeled relationships (REQUIRES, USES), not just magnitudes
 * 2. Activation Thresholds — only relevant connections fire (interpretability)
 * 3. Self-Modifying Inference / Trace Layer — corrections persist across sessions
 * 4. Self-Knowledge Loss — confidence varies, citations link, unexplainable = expensive
 */

import { existsSync } from "fs";
import { join } from "path";
import { assessCriterion, scoreAssessableCriteria, notAssessableNote } from "./controlSurfaceScope.js";

export interface SelfKnowledgeMaturityResult {
  /**
   * How many criteria this score was actually computed over.
   *
   * Criteria whose only evidence paths are AMC's own source modules cannot be
   * judged against a real agent. Counting them as failures silently capped the
   * achievable score, so they are excluded from the denominator and reported
   * here instead: a score of 71 over 4 assessed criteria is a different claim
   * from 71 over 7.
   */
  assessedCriteria?: number;
  totalCriteria?: number;
  notAssessableCriteria?: number;
  score: number; // 0-100
  level: number; // 0-5
  hasTypedRelationships: boolean;       // prior art #1: labeled edges, not just magnitudes
  hasInterpretabilityLayer: boolean;    // prior art #2: can show which connections fired
  hasTraceLayer: boolean;               // prior art #3: corrections persist across sessions
  hasConfidenceWithCitation: boolean;   // prior art #4: every answer carries its own proof
  hasCalibrationMechanism: boolean;     // confidence varies by actual knowledge
  hasSelfKnowledgeLoss: boolean;        // penalizes unexplainable outputs
  gaps: string[];
  recommendations: string[];
}

export function scoreSelfKnowledgeMaturity(cwd?: string): SelfKnowledgeMaturityResult {
  const root = cwd ?? process.cwd();
  const gaps: string[] = [];
  const recommendations: string[] = [];

  // prior art #1: Typed relationships — knowledge graph with labeled edges
  const typedRelPaths = ["src/score/knowledgeGraph.ts", "src/cgx", "src/claims/contradictions.ts"];
  const hasTypedRelationshipsOutcome = assessCriterion(root, typedRelPaths);
  const hasTypedRelationships = hasTypedRelationshipsOutcome.met;

  // prior art #2: Interpretability — can show which evidence/connections drove a decision
  const interpPaths = ["src/score/claimProvenance.ts", "src/runtime/truthProtocol.ts", "src/score/confidenceDrift.ts"];
  const hasInterpretabilityLayerOutcome = assessCriterion(root, interpPaths);
  const hasInterpretabilityLayer = hasInterpretabilityLayerOutcome.met;

  // prior art #3: Trace layer — corrections and lessons persist across sessions
  const tracePaths = ["src/score/lessonLearnedDatabase.ts", ".amc/PREDICTION_LOG.md", "src/corrections"];
  const hasTraceLayerOutcome = assessCriterion(root, tracePaths);
  const hasTraceLayer = hasTraceLayerOutcome.met;

  // prior art #4: Confidence with citation — every claim has evidence refs
  const citationPaths = ["src/claims/claimConfidence.ts", "src/score/claimProvenance.ts", "src/truthguard"];
  const hasConfidenceWithCitationOutcome = assessCriterion(root, citationPaths);
  const hasConfidenceWithCitation = hasConfidenceWithCitationOutcome.met;

  // Calibration mechanism — confidence scores that reflect actual accuracy
  const calibrationPaths = ["src/claims/claimConfidence.ts", "src/score/confidenceDrift.ts"];
  const hasCalibrationMechanismOutcome = assessCriterion(root, calibrationPaths);
  const hasCalibrationMechanism = hasCalibrationMechanismOutcome.met;

  // Self-knowledge loss — penalizes outputs the model can't explain
  const selfKnowledgePaths = ["src/score/confidenceDrift.ts", "src/score/claimProvenance.ts"];
  const hasSelfKnowledgeLossOutcome = assessCriterion(root, selfKnowledgePaths);
  const hasSelfKnowledgeLoss = hasSelfKnowledgeLossOutcome.met;

  if (hasTypedRelationshipsOutcome.assessable && !hasTypedRelationships) gaps.push("No typed relationships — agent knows things are related but not HOW (gap #1)");
  if (hasInterpretabilityLayerOutcome.assessable && !hasInterpretabilityLayer) gaps.push("No interpretability layer — cannot show which evidence drove a decision (gap #2)");
  if (hasTraceLayerOutcome.assessable && !hasTraceLayer) gaps.push("No trace layer — corrections evaporate between sessions (gap #3)");
  if (hasConfidenceWithCitationOutcome.assessable && !hasConfidenceWithCitation) gaps.push("No confidence-with-citation — outputs lack proof of why (gap #4)");
  if (hasCalibrationMechanismOutcome.assessable && !hasCalibrationMechanism) gaps.push("No calibration mechanism — agent expresses all outputs with equal fluency");
  if (hasSelfKnowledgeLossOutcome.assessable && !hasSelfKnowledgeLoss) gaps.push("No self-knowledge loss — unexplainable outputs are not penalized");

  if (hasTypedRelationshipsOutcome.assessable && !hasTypedRelationships) recommendations.push("Add edge type labels to knowledge graph (REQUIRES, USES, CONTRADICTS) — not just similarity scores");
  if (hasTraceLayerOutcome.assessable && !hasTraceLayer) recommendations.push("Implement trace layer: write corrections/lessons to persistent store; prepend to next session context");
  if (hasConfidenceWithCitationOutcome.assessable && !hasConfidenceWithCitation) recommendations.push("Require every claim to carry evidence refs; surface low-confidence claims for human review");

  const outcomes = [hasTypedRelationshipsOutcome, hasInterpretabilityLayerOutcome, hasTraceLayerOutcome, hasConfidenceWithCitationOutcome, hasCalibrationMechanismOutcome, hasSelfKnowledgeLossOutcome];
  const { score, assessed: assessedCriteria, total: totalCriteria, notAssessable: notAssessableCriteria } =
    scoreAssessableCriteria(outcomes);
  const skipped = notAssessableNote(notAssessableCriteria, totalCriteria);
  if (skipped) recommendations.push(skipped);
  const level = score >= 90 ? 5 : score >= 70 ? 4 : score >= 50 ? 3 : score >= 30 ? 2 : score >= 10 ? 1 : 0;

  return {
    score, level, assessedCriteria, totalCriteria, notAssessableCriteria,
    hasTypedRelationships, hasInterpretabilityLayer, hasTraceLayer,
    hasConfidenceWithCitation, hasCalibrationMechanism, hasSelfKnowledgeLoss,
    gaps, recommendations,
  };
}
