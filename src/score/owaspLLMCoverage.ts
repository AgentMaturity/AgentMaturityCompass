/**
 * OWASP LLM Top 10 Coverage Maturity
 * Scores how well an agent system addresses the OWASP Top 10 for LLM Applications.
 * Source: OWASP GenAI Security Project (genai.owasp.org), 2023-2025
 *
 * LLM01: Prompt Injection
 * LLM02: Insecure Output Handling
 * LLM03: Training Data Poisoning
 * LLM04: Model Denial of Service
 * LLM05: Supply Chain Vulnerabilities
 * LLM06: Sensitive Information Disclosure
 * LLM07: Insecure Plugin Design
 * LLM08: Excessive Agency
 * LLM09: Overreliance
 * LLM10: Model Theft
 */

import { existsSync } from "fs";
import { join } from "path";
import { detectControlSurfaceScope } from "./controlSurfaceScope.js";

export interface OWASPLLMCoverageResult {
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
  llm01_promptInjection: boolean;
  llm02_insecureOutputHandling: boolean;
  llm03_trainingDataPoisoning: boolean;
  llm04_modelDenialOfService: boolean;
  llm05_supplyChainVulnerabilities: boolean;
  llm06_sensitiveInfoDisclosure: boolean;
  llm07_insecurePluginDesign: boolean;
  llm08_excessiveAgency: boolean;
  llm09_overreliance: boolean;
  llm10_modelTheft: boolean;
  coveredCount: number;
  uncoveredRisks: string[];
  gaps: string[];
  recommendations: string[];
}

export function scoreOWASPLLMCoverage(cwd?: string): OWASPLLMCoverageResult {
  const root = cwd ?? process.cwd();
  const gaps: string[] = [];
  const recommendations: string[] = [];
  const uncoveredRisks: string[] = [];

  // LLM01: Prompt Injection — injectionPack, encodedInjectionPack
  const llm01 = existsSync(join(root, "src/assurance/packs/injectionPack.ts")) ||
    existsSync(join(root, "src/assurance/packs/encodedInjectionPack.ts"));

  // LLM02: Insecure Output Handling — outputIntegrityMaturity, truthguard
  const llm02 = existsSync(join(root, "src/score/outputIntegrityMaturity.ts")) ||
    existsSync(join(root, "src/truthguard"));

  // LLM03: Training Data Poisoning — ragPoisoningPack, memoryPoisoningPack
  const llm03 = existsSync(join(root, "src/assurance/packs/ragPoisoningPack.ts")) ||
    existsSync(join(root, "src/assurance/packs/memoryPoisoningPack.ts"));

  // LLM04: Model Denial of Service — resourceExhaustionPack, circuitBreaker
  const llm04 = existsSync(join(root, "src/assurance/packs/resourceExhaustionPack.ts")) ||
    existsSync(join(root, "src/ops/circuitBreaker.ts"));

  // LLM05: Supply Chain Vulnerabilities — sbomSupplyChainPack, supplyChainAttackPack
  const llm05 = existsSync(join(root, "src/assurance/packs/sbomSupplyChainPack.ts")) ||
    existsSync(join(root, "src/assurance/packs/supplyChainAttackPack.ts"));

  // LLM06: Sensitive Information Disclosure — dlpExfiltrationPack, exfiltrationPack
  const llm06 = existsSync(join(root, "src/assurance/packs/dlpExfiltrationPack.ts")) ||
    existsSync(join(root, "src/assurance/packs/exfiltrationPack.ts"));

  // LLM07: Insecure Plugin Design — mcpCompliance, honeytokenDetectionPack
  const llm07 = existsSync(join(root, "src/score/mcpCompliance.ts")) ||
    existsSync(join(root, "src/assurance/packs/honeytokenDetectionPack.ts"));

  // LLM08: Excessive Agency — governanceBypassPack, failSecureGovernance
  const llm08 = existsSync(join(root, "src/assurance/packs/governanceBypassPack.ts")) ||
    existsSync(join(root, "src/score/failSecureGovernance.ts"));

  // LLM09: Overreliance — humanOversightQuality, humanOversightQualityPack
  const llm09 = existsSync(join(root, "src/score/humanOversightQuality.ts")) ||
    existsSync(join(root, "src/assurance/packs/humanOversightQualityPack.ts"));

  // LLM10: Model Theft — taintPropagationPack, exfiltrationPack
  const llm10 = existsSync(join(root, "src/assurance/packs/taintPropagationPack.ts")) ||
    existsSync(join(root, "src/assurance/packs/exfiltrationPack.ts"));

  const coverage = { llm01, llm02, llm03, llm04, llm05, llm06, llm07, llm08, llm09, llm10 };
  const labels: Record<string, string> = {
    llm01: "LLM01: Prompt Injection",
    llm02: "LLM02: Insecure Output Handling",
    llm03: "LLM03: Training Data Poisoning",
    llm04: "LLM04: Model Denial of Service",
    llm05: "LLM05: Supply Chain Vulnerabilities",
    llm06: "LLM06: Sensitive Information Disclosure",
    llm07: "LLM07: Insecure Plugin Design",
    llm08: "LLM08: Excessive Agency",
    llm09: "LLM09: Overreliance",
    llm10: "LLM10: Model Theft",
  };

  for (const [key, covered] of Object.entries(coverage)) {
    if (!covered) {
      const label = labels[key] ?? key;
      uncoveredRisks.push(label);
      gaps.push(`No coverage for ${label}`);
    }
  }

  const coveredCount = Object.values(coverage).filter(Boolean).length;

  if (!llm02) recommendations.push("Add output validation and sanitization before downstream use (LLM02)");
  if (!llm08) recommendations.push("Implement fail-closed tool governance with explicit scope limits (LLM08)");
  if (!llm09) recommendations.push("Add human oversight quality scoring — measure quality of oversight, not just presence (LLM09)");

  const score = Math.round((coveredCount / 10) * 100);
  const level = score >= 90 ? 5 : score >= 70 ? 4 : score >= 50 ? 3 : score >= 30 ? 2 : score >= 10 ? 1 : 0;

  const surfaceScope = detectControlSurfaceScope(root);
  return {
    score, level, coveredCount, uncoveredRisks, gaps, recommendations,
    llm01_promptInjection: llm01,
    llm02_insecureOutputHandling: llm02,
    llm03_trainingDataPoisoning: llm03,
    llm04_modelDenialOfService: llm04,
    llm05_supplyChainVulnerabilities: llm05,
    llm06_sensitiveInfoDisclosure: llm06,
    llm07_insecurePluginDesign: llm07,
    llm08_excessiveAgency: llm08,
    llm09_overreliance: llm09,
    llm10_modelTheft: llm10,
    // False when this is not an AMC source checkout: the checks above look
    // for AMC source files, so the score would say nothing about the target.
    applicable: surfaceScope.applicable,
    notApplicableReason: surfaceScope.applicable ? undefined : surfaceScope.reason
  };
}
