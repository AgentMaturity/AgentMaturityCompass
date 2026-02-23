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

export interface SelfKnowledgeMaturityResult {
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
  const hasTypedRelationships = typedRelPaths.some(f => existsSync(join(root, f)));

  // prior art #2: Interpretability — can show which evidence/connections drove a decision
  const interpPaths = ["src/score/claimProvenance.ts", "src/truthguard/truthProtocol.ts", "src/score/confidenceDrift.ts"];
  const hasInterpretabilityLayer = interpPaths.some(f => existsSync(join(root, f)));

  // prior art #3: Trace layer — corrections and lessons persist across sessions
  const tracePaths = ["src/score/lessonLearnedDatabase.ts", ".amc/PREDICTION_LOG.md", "src/corrections"];
  const hasTraceLayer = tracePaths.some(f => existsSync(join(root, f)));

  // prior art #4: Confidence with citation — every claim has evidence refs
  const citationPaths = ["src/claims/claimConfidence.ts", "src/score/claimProvenance.ts", "src/truthguard"];
  const hasConfidenceWithCitation = citationPaths.some(f => existsSync(join(root, f)));

  // Calibration mechanism — confidence scores that reflect actual accuracy
  const calibrationPaths = ["src/claims/claimConfidence.ts", "src/score/confidenceDrift.ts"];
  const hasCalibrationMechanism = calibrationPaths.some(f => existsSync(join(root, f)));

  // Self-knowledge loss — penalizes outputs the model can't explain
  const selfKnowledgePaths = ["src/score/confidenceDrift.ts", "src/score/claimProvenance.ts"];
  const hasSelfKnowledgeLoss = selfKnowledgePaths.some(f => existsSync(join(root, f)));

  if (!hasTypedRelationships) gaps.push("No typed relationships — agent knows things are related but not HOW (gap #1)");
  if (!hasInterpretabilityLayer) gaps.push("No interpretability layer — cannot show which evidence drove a decision (gap #2)");
  if (!hasTraceLayer) gaps.push("No trace layer — corrections evaporate between sessions (gap #3)");
  if (!hasConfidenceWithCitation) gaps.push("No confidence-with-citation — outputs lack proof of why (gap #4)");
  if (!hasCalibrationMechanism) gaps.push("No calibration mechanism — agent expresses all outputs with equal fluency");
  if (!hasSelfKnowledgeLoss) gaps.push("No self-knowledge loss — unexplainable outputs are not penalized");

  if (!hasTypedRelationships) recommendations.push("Add edge type labels to knowledge graph (REQUIRES, USES, CONTRADICTS) — not just similarity scores");
  if (!hasTraceLayer) recommendations.push("Implement trace layer: write corrections/lessons to persistent store; prepend to next session context");
  if (!hasConfidenceWithCitation) recommendations.push("Require every claim to carry evidence refs; surface low-confidence claims for human review");

  const checks = [hasTypedRelationships, hasInterpretabilityLayer, hasTraceLayer,
    hasConfidenceWithCitation, hasCalibrationMechanism, hasSelfKnowledgeLoss];
  const passed = checks.filter(Boolean).length;
  const score = Math.round((passed / checks.length) * 100);
  const level = score >= 90 ? 5 : score >= 70 ? 4 : score >= 50 ? 3 : score >= 30 ? 2 : score >= 10 ? 1 : 0;

  return {
    score, level,
    hasTypedRelationships, hasInterpretabilityLayer, hasTraceLayer,
    hasConfidenceWithCitation, hasCalibrationMechanism, hasSelfKnowledgeLoss,
    gaps, recommendations,
  };
}
