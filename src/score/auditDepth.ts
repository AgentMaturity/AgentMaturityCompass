/**
 * Audit Depth Scoring Module
 *
 * Measures the depth of access available for AI auditing:
 * black-box, white-box, and outside-the-box.
 *
 * Research basis:
 * - Casper et al. (arXiv:2401.14446, FAccT 2024): "Black-Box Access is
 *   Insufficient for Rigorous AI Audits" — white-box access enables stronger
 *   attacks, better interpretability, and fine-tuning analysis. Outside-the-box
 *   access to training data, methodology, and deployment details enables
 *   targeted evaluations.
 * - METR autonomy evaluation: task suites at different difficulty levels
 *   require different access depths for meaningful evaluation.
 *
 * AMC innovation: We score not just WHETHER an agent is auditable, but
 * HOW DEEPLY it can be audited. An L5 agent should support all three
 * access levels with cryptographic evidence at each layer.
 */

import { existsSync } from "fs";
import { join } from "path";
import { evidencePathExists } from "./controlSurfaceScope.js";

export interface AuditDepthReport {
  /** Black-box audit capabilities (query + observe outputs) */
  blackBox: { available: boolean; capabilities: string[]; score: number };
  /** White-box audit capabilities (weights, activations, gradients) */
  whiteBox: { available: boolean; capabilities: string[]; score: number };
  /** Outside-the-box audit capabilities (methodology, code, data, docs) */
  outsideTheBox: { available: boolean; capabilities: string[]; score: number };
  /** Overall audit depth score 0-100 */
  score: number;
  /** Maturity level */
  level: number;
  /** Gaps */
  gaps: string[];
}

export function scoreAuditDepth(root: string): AuditDepthReport {
  const gaps: string[] = [];

  // === BLACK-BOX CAPABILITIES ===
  const bbCapabilities: string[] = [];
  let bbScore = 0;

  const bbPaths: [string, string, number][] = [
    ["src/gateway", "API gateway for query interception", 10],
    ["src/assurance", "Behavioral testing via assurance packs", 10],
    ["src/diagnostic", "Diagnostic questionnaire evaluation", 10],
    [".amc/evidence", "Evidence collection from outputs", 5],
    ["src/score", "Automated scoring from observations", 5],
  ];

  for (const [path, cap, points] of bbPaths) {
    if (evidencePathExists(root, path)) {
      bbCapabilities.push(cap);
      bbScore += points;
    }
  }

  // === WHITE-BOX CAPABILITIES ===
  const wbCapabilities: string[] = [];
  let wbScore = 0;

  const wbPaths: [string, string, number][] = [
    ["src/score/interpretability.ts", "Interpretability scoring", 10],
    ["src/score/alignmentIndex.ts", "Alignment measurement", 8],
    ["src/score/capabilityElicitation.ts", "Capability elicitation testing", 8],
    ["src/score/formalSpec.ts", "Formal specification verification", 7],
    ["src/score/modelDrift.ts", "Model drift detection", 7],
  ];

  for (const [path, cap, points] of wbPaths) {
    if (evidencePathExists(root, path)) {
      wbCapabilities.push(cap);
      wbScore += points;
    }
  }

  // === OUTSIDE-THE-BOX CAPABILITIES ===
  const otbCapabilities: string[] = [];
  let otbScore = 0;

  const otbPaths: [string, string, number][] = [
    ["src/score/claimProvenance.ts", "Claim provenance tracking", 8],
    ["src/vault", "Cryptographic evidence vault", 8],
    ["src/notary", "Notary attestation service", 7],
    ["src/audit", "Audit binder generation", 7],
    ["docs", "Documentation for methodology review", 5],
    ["src/comply", "Compliance framework mapping", 5],
  ];

  for (const [path, cap, points] of otbPaths) {
    if (evidencePathExists(root, path)) {
      otbCapabilities.push(cap);
      otbScore += points;
    }
  }

  const totalScore = Math.min(100, bbScore + wbScore + otbScore);

  if (bbScore < 20) gaps.push("Limited black-box audit capabilities — basic query/observe testing incomplete");
  if (wbScore < 15) gaps.push("No white-box audit support — cannot inspect model internals, activations, or gradients");
  if (otbScore < 15) gaps.push("No outside-the-box audit support — training methodology and data provenance unavailable");
  if (wbScore === 0 && otbScore === 0) {
    gaps.push("CRITICAL: Black-box only auditing is insufficient for rigorous evaluation (Casper et al. 2024)");
  }

  const level = totalScore >= 85 ? 5 : totalScore >= 65 ? 4 : totalScore >= 45 ? 3 : totalScore >= 25 ? 2 : totalScore >= 10 ? 1 : 0;

  return {
    blackBox: { available: bbScore > 0, capabilities: bbCapabilities, score: bbScore },
    whiteBox: { available: wbScore > 0, capabilities: wbCapabilities, score: wbScore },
    outsideTheBox: { available: otbScore > 0, capabilities: otbCapabilities, score: otbScore },
    score: totalScore,
    level,
    gaps,
  };
}
