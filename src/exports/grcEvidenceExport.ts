/**
 * GRC evidence export (P2 dev-tool → GRC bridge, local half).
 *
 * Eval/red-team tools stop at dashboards; GRC platforms (Vanta, Drata,
 * OneTrust, Credo) start from questionnaires and don't run tests. This module
 * closes the seam by emitting an AMC run as a control-mapped evidence manifest
 * that a GRC platform can ingest, plus a SARIF file for security tooling. It is
 * a pure transform over a DiagnosticReport — no network client, no second
 * scoring path, no vendor SDK.
 */
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";

export type GrcFramework = "SOC2" | "NIST_AI_RMF" | "ISO_42001" | "EU_AI_ACT";

export interface GrcReportInput {
  agentId: string;
  runId: string;
  ts: number;
  status: "VALID" | "INVALID" | "UNSIGNED";
  verificationPassed: boolean;
  integrityIndex: number;
  evidenceCoverage: number;
  overallLevel: number;
  layers: { name: string; level: number }[];
  evidenceReadiness: string;
}

export interface GrcControlResult {
  controlId: string;
  title: string;
  status: "PASS" | "PARTIAL" | "FAIL" | "NOT_READY";
  amcSurface: string;
  evidence: string;
}

export interface GrcEvidenceManifest {
  schemaVersion: "amc.grc-evidence.v1";
  framework: GrcFramework;
  agentId: string;
  runId: string;
  generatedAt: number;
  claimEligible: boolean;
  disclaimer: string;
  controls: GrcControlResult[];
  manifestHash: string;
}

interface ControlSpec {
  controlId: string;
  title: string;
  surface: string;
  /** which report signal decides PASS/PARTIAL/FAIL */
  metric: "verification" | "coverage" | "maturity";
}

const FRAMEWORK_CONTROLS: Record<GrcFramework, ControlSpec[]> = {
  SOC2: [
    { controlId: "CC7.2", title: "System monitoring detects anomalies", surface: "Watch", metric: "coverage" },
    { controlId: "CC7.3", title: "Evaluation of security events", surface: "Shield", metric: "maturity" },
    { controlId: "CC8.1", title: "Change management with signed records", surface: "Enforce", metric: "verification" }
  ],
  NIST_AI_RMF: [
    { controlId: "GOVERN-1.1", title: "Policies and accountability in place", surface: "Enforce", metric: "verification" },
    { controlId: "MEASURE-2.1", title: "AI system monitored and measured", surface: "Score", metric: "coverage" },
    { controlId: "MANAGE-2.2", title: "Risks managed with corrective action", surface: "Comply", metric: "maturity" }
  ],
  ISO_42001: [
    { controlId: "8.1", title: "Operational planning and control", surface: "Enforce", metric: "verification" },
    { controlId: "9.1", title: "Monitoring, measurement, analysis", surface: "Watch", metric: "coverage" },
    { controlId: "10.2", title: "Nonconformity and corrective action", surface: "Comply", metric: "maturity" }
  ],
  EU_AI_ACT: [
    { controlId: "Art.12", title: "Record-keeping and logging", surface: "Watch", metric: "coverage" },
    { controlId: "Art.14", title: "Human oversight", surface: "Enforce", metric: "verification" },
    { controlId: "Art.15", title: "Accuracy, robustness, cybersecurity", surface: "Shield", metric: "maturity" }
  ]
};

const DISCLAIMER =
  "AMC evidence supports assessment against this framework; it is not legal certification. " +
  "Only claim-eligible (READY) evidence should be relied upon for external claims. Framework text controls.";

function statusFor(spec: ControlSpec, report: GrcReportInput): GrcControlResult["status"] {
  if (report.evidenceReadiness !== "READY") return "NOT_READY";
  if (spec.metric === "verification") return report.verificationPassed && report.status === "VALID" ? "PASS" : "FAIL";
  if (spec.metric === "coverage") return report.evidenceCoverage >= 0.75 ? "PASS" : report.evidenceCoverage >= 0.4 ? "PARTIAL" : "FAIL";
  // maturity
  return report.overallLevel >= 4 ? "PASS" : report.overallLevel >= 2.5 ? "PARTIAL" : "FAIL";
}

export function buildGrcEvidenceManifest(framework: GrcFramework, report: GrcReportInput): GrcEvidenceManifest {
  const controls: GrcControlResult[] = FRAMEWORK_CONTROLS[framework].map((spec) => ({
    controlId: spec.controlId,
    title: spec.title,
    status: statusFor(spec, report),
    amcSurface: spec.surface,
    evidence: `AMC run ${report.runId} (agent ${report.agentId}); integrity ${report.integrityIndex.toFixed(2)}, coverage ${(report.evidenceCoverage * 100).toFixed(0)}%, level ${report.overallLevel.toFixed(2)}, readiness ${report.evidenceReadiness}`
  }));
  const body = {
    schemaVersion: "amc.grc-evidence.v1" as const,
    framework,
    agentId: report.agentId,
    runId: report.runId,
    generatedAt: report.ts,
    claimEligible: report.evidenceReadiness === "READY",
    disclaimer: DISCLAIMER,
    controls
  };
  return { ...body, manifestHash: sha256Hex(canonicalize(body)) };
}

/** Minimal SARIF 2.1.0 for security tooling (GitHub code scanning, etc.). */
export function grcManifestToSarif(manifest: GrcEvidenceManifest): unknown {
  return {
    version: "2.1.0",
    $schema: "https://json.schemastore.org/sarif-2.1.0.json",
    runs: [{
      tool: { driver: { name: "Agent Maturity Compass", informationUri: "https://agentmaturity.co", rules: manifest.controls.map((c) => ({ id: c.controlId, name: c.title })) } },
      results: manifest.controls
        .filter((c) => c.status === "FAIL" || c.status === "PARTIAL" || c.status === "NOT_READY")
        .map((c) => ({
          ruleId: c.controlId,
          level: c.status === "FAIL" ? "error" : "warning",
          message: { text: `${c.title}: ${c.status}. ${c.evidence}` }
        }))
    }]
  };
}
