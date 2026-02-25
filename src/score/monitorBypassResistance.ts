/**
 * Monitor Bypass Resistance Maturity
 * Scores resilience against agents being used as proxies to bypass monitoring.
 * Source: Agent-as-a-Proxy Attacks (arXiv:2602.05066)
 * Agents can deliver attacks that look benign to monitors.
 */

import { existsSync, readdirSync } from "fs";
import { join } from "path";

export interface MonitorBypassResistanceResult {
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

  const hasMultiLayerMonitoring = ["src/monitor", "src/ops/monitor.ts"]
    .some(f => existsSync(join(root, f)));

  const hasOutputIndependentVerification = ["src/truthguard", "src/verify/outputVerifier.ts"]
    .some(f => existsSync(join(root, f)));

  const hasBehavioralBaseline = ["src/score/modelDrift.ts", "src/monitor/behavioralBaseline.ts"]
    .some(f => existsSync(join(root, f)));

  const hasProxyDetection = ["src/assurance/packs/compoundThreatPack.ts", "src/monitor/proxyDetector.ts"]
    .some(f => existsSync(join(root, f)));

  // Monitor redundancy: dedicated file OR 2+ files in src/monitor/
  let hasMonitorRedundancy = existsSync(join(root, "src/monitor/redundant.ts"));
  if (!hasMonitorRedundancy) {
    const monitorDir = join(root, "src/monitor");
    if (existsSync(monitorDir)) {
      try {
        const files = readdirSync(monitorDir).filter(f => f.endsWith(".ts") || f.endsWith(".js"));
        hasMonitorRedundancy = files.length >= 2;
      } catch { /* ignore */ }
    }
  }

  const hasAdversarialMonitorTesting = ["src/assurance/packs/governanceBypassPack.ts", "src/assurance/packs/agentAsProxyPack.ts"]
    .some(f => existsSync(join(root, f)));

  if (!hasMultiLayerMonitoring) gaps.push("No multi-layer monitoring — single monitor is a single point of bypass");
  if (!hasOutputIndependentVerification) gaps.push("No output-independent verification — monitor relies solely on agent output");
  if (!hasBehavioralBaseline) gaps.push("No behavioral baseline — cannot detect deviation from normal agent behavior");
  if (!hasProxyDetection) gaps.push("No proxy detection — agent-as-a-proxy attacks go undetected");
  if (!hasMonitorRedundancy) gaps.push("No monitor redundancy — single monitor failure disables all oversight");
  if (!hasAdversarialMonitorTesting) gaps.push("No adversarial monitor testing — monitor effectiveness is unvalidated");

  if (!hasMultiLayerMonitoring) recommendations.push("Deploy multi-layer monitoring: input validation, behavioral analysis, and output verification");
  if (!hasOutputIndependentVerification) recommendations.push("Add output verification independent of agent self-reporting");
  if (!hasProxyDetection) recommendations.push("Implement proxy detection to catch agents relaying adversarial payloads");
  if (!hasAdversarialMonitorTesting) recommendations.push("Run adversarial tests against monitors to validate bypass resistance");

  const checks = [hasMultiLayerMonitoring, hasOutputIndependentVerification, hasBehavioralBaseline,
    hasProxyDetection, hasMonitorRedundancy, hasAdversarialMonitorTesting];
  const passed = checks.filter(Boolean).length;
  const score = Math.round((passed / checks.length) * 100);
  const level = score >= 90 ? 5 : score >= 70 ? 4 : score >= 50 ? 3 : score >= 30 ? 2 : score >= 10 ? 1 : 0;

  return {
    score, level,
    hasMultiLayerMonitoring, hasOutputIndependentVerification, hasBehavioralBaseline,
    hasProxyDetection, hasMonitorRedundancy, hasAdversarialMonitorTesting,
    gaps, recommendations,
  };
}
