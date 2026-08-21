/**
 * Monitor Bypass Resistance Maturity
 * Scores resilience against agents being used as proxies to bypass monitoring.
 * Source: Agent-as-a-Proxy Attacks (arXiv:2602.05066)
 * Agents can deliver attacks that look benign to monitors.
 */

import { existsSync, readdirSync } from "fs";
import { join } from "path";
import { evidencePathExists, detectControlSurfaceScope, assessCriterion, scoreAssessableCriteria, notAssessableNote, criterionAssessable } from "./controlSurfaceScope.js";

export interface MonitorBypassResistanceResult {
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
  score: number; // 0-100
  level: number; // 0-5
  hasMultiLayerMonitoring: boolean;
  hasOutputIndependentVerification: boolean;
  hasBehavioralBaseline: boolean;
  hasProxyDetection: boolean;
  hasMonitorRedundancy: boolean;
  hasAdversarialMonitorTesting: boolean;
  gaps: string[];
  recommendations: string[];
}

export function scoreMonitorBypassResistance(cwd?: string): MonitorBypassResistanceResult {
  const root = cwd ?? process.cwd();
  const gaps: string[] = [];
  const recommendations: string[] = [];

  const hasMultiLayerMonitoringOutcome = assessCriterion(root, ["src/monitor", "src/agents/monitor.ts"]);
  const hasMultiLayerMonitoring = hasMultiLayerMonitoringOutcome.met;

  const hasOutputIndependentVerificationOutcome = assessCriterion(root, ["src/truthguard", "src/verify/outputVerifier.ts"]);
  const hasOutputIndependentVerification = hasOutputIndependentVerificationOutcome.met;

  const hasBehavioralBaselineOutcome = assessCriterion(root, ["src/score/modelDrift.ts", "src/monitor/behavioralBaseline.ts"]);
  const hasBehavioralBaseline = hasBehavioralBaselineOutcome.met;

  const hasProxyDetectionOutcome = assessCriterion(root, ["src/assurance/packs/compoundThreatPack.ts", "src/monitor/proxyDetector.ts"]);
  const hasProxyDetection = hasProxyDetectionOutcome.met;

  // Monitor redundancy: dedicated file OR 2+ files in src/monitor/. Both forms
  // read AMC's own tree, so the criterion is unassessable against any other
  // target and is excluded from the denominator rather than scored as absent.
  const hasMonitorRedundancyOutcome = {
    met: false,
    assessable: criterionAssessable(root, ["src/monitor/redundant.ts"])
  };
  let hasMonitorRedundancy = evidencePathExists(root, "src/monitor/redundant.ts");
  if (!hasMonitorRedundancy) {
    const monitorDir = join(root, "src/monitor");
    if (hasMonitorRedundancyOutcome.assessable && existsSync(monitorDir)) {
      try {
        const files = readdirSync(monitorDir).filter(f => f.endsWith(".ts") || f.endsWith(".js"));
        hasMonitorRedundancy = files.length >= 2;
      } catch { /* ignore */ }
    }
  }
  hasMonitorRedundancyOutcome.met = hasMonitorRedundancy;

  const hasAdversarialMonitorTestingOutcome = assessCriterion(root, ["src/assurance/packs/governanceBypassPack.ts", "src/assurance/packs/agentAsProxyPack.ts"]);
  const hasAdversarialMonitorTesting = hasAdversarialMonitorTestingOutcome.met;

  if (hasMultiLayerMonitoringOutcome.assessable && !hasMultiLayerMonitoring) gaps.push("No multi-layer monitoring — single monitor is a single point of bypass");
  if (hasOutputIndependentVerificationOutcome.assessable && !hasOutputIndependentVerification) gaps.push("No output-independent verification — monitor relies solely on agent output");
  if (hasBehavioralBaselineOutcome.assessable && !hasBehavioralBaseline) gaps.push("No behavioral baseline — cannot detect deviation from normal agent behavior");
  if (hasProxyDetectionOutcome.assessable && !hasProxyDetection) gaps.push("No proxy detection — agent-as-a-proxy attacks go undetected");
  if (!hasMonitorRedundancy) gaps.push("No monitor redundancy — single monitor failure disables all oversight");
  if (hasAdversarialMonitorTestingOutcome.assessable && !hasAdversarialMonitorTesting) gaps.push("No adversarial monitor testing — monitor effectiveness is unvalidated");

  if (hasMultiLayerMonitoringOutcome.assessable && !hasMultiLayerMonitoring) recommendations.push("Deploy multi-layer monitoring: input validation, behavioral analysis, and output verification");
  if (hasOutputIndependentVerificationOutcome.assessable && !hasOutputIndependentVerification) recommendations.push("Add output verification independent of agent self-reporting");
  if (hasProxyDetectionOutcome.assessable && !hasProxyDetection) recommendations.push("Implement proxy detection to catch agents relaying adversarial payloads");
  if (hasAdversarialMonitorTestingOutcome.assessable && !hasAdversarialMonitorTesting) recommendations.push("Run adversarial tests against monitors to validate bypass resistance");

  const outcomes = [hasMultiLayerMonitoringOutcome, hasOutputIndependentVerificationOutcome, hasBehavioralBaselineOutcome, hasProxyDetectionOutcome, hasMonitorRedundancyOutcome, hasAdversarialMonitorTestingOutcome];
  const { score, assessed: assessedCriteria, total: totalCriteria, notAssessable: notAssessableCriteria } =
    scoreAssessableCriteria(outcomes);
  const skipped = notAssessableNote(notAssessableCriteria, totalCriteria);
  if (skipped) recommendations.push(skipped);
  const level = score >= 90 ? 5 : score >= 70 ? 4 : score >= 50 ? 3 : score >= 30 ? 2 : score >= 10 ? 1 : 0;

  const scope = detectControlSurfaceScope(root);
  return {
    score, level, assessedCriteria, totalCriteria, notAssessableCriteria,
    hasMultiLayerMonitoring, hasOutputIndependentVerification, hasBehavioralBaseline,
    hasProxyDetection, hasMonitorRedundancy, hasAdversarialMonitorTesting,
    gaps, recommendations,
    // False when this is not an AMC source checkout: the checks above look
    // for AMC source files, so the score would say nothing about the target.
    applicable: scope.applicable,
    notApplicableReason: scope.applicable ? undefined : scope.reason
  };
}
