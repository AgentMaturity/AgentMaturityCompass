/**
 * GRC evidence export: an AMC run as labelled evidence against a framework's controls, plus SARIF
 * developer findings about the run. A pure transform over a diagnostic report; no network client,
 * no second scoring path, no vendor SDK.
 *
 * Maturity, coverage and run flags are run-level signals, never control results. No evidence is
 * bound to a control yet (P1-11), so every control result is "not evaluated" with its claim kind and
 * five status dimensions from src/claims/eligibility. See docs/GRC_EXPORT.md.
 */
import {
  envelopeForDiagnosticReport,
  evaluateClaimEligibility,
  renderClaimLabel,
  type ClaimEnvelope,
  type DiagnosticReportClaimInput
} from "../claims/eligibility/index.js";
import { evaluateDiagnosticEvidenceReadiness } from "../diagnostic/evidenceReadiness.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";

export type GrcFramework = "SOC2" | "NIST_AI_RMF" | "ISO_42001" | "EU_AI_ACT";

export interface GrcRunSignal {
  name: "verification" | "evidenceCoverage" | "maturityLevel" | "evidenceReadiness";
  /** null = not evaluated, never a default 0 */
  value: string | number | boolean | null;
  /** the run's claim label, e.g. "Self-reported" */
  label: string;
}

export interface GrcControlResultV2 {
  controlId: string;
  title: string;
  amcSurface: string;
  claim: ClaimEnvelope;
  /** renderClaimLabel(claim).line, verbatim */
  label: string;
}

export interface GrcEvidenceManifestV2 {
  schemaVersion: "amc.grc-evidence.v2";
  framework: GrcFramework;
  agentId: string;
  runId: string;
  generatedAt: number;
  run: { claim: ClaimEnvelope; label: string; signals: GrcRunSignal[] };
  controls: GrcControlResultV2[];
  disclaimer: string;
  manifestHash: string;
}

interface ControlSpec {
  controlId: string;
  title: string;
  surface: string;
}

// Experimental mapping, not expert-reviewed: ids and titles cite the frameworks and stay unchanged.
const FRAMEWORK_CONTROLS: Record<GrcFramework, ControlSpec[]> = {
  SOC2: [
    { controlId: "CC7.2", title: "System monitoring detects anomalies", surface: "Watch" },
    { controlId: "CC7.3", title: "Evaluation of security events", surface: "Shield" },
    { controlId: "CC8.1", title: "Change management with signed records", surface: "Enforce" }
  ],
  NIST_AI_RMF: [
    { controlId: "GOVERN-1.1", title: "Policies and accountability in place", surface: "Enforce" },
    { controlId: "MEASURE-2.1", title: "AI system monitored and measured", surface: "Score" },
    { controlId: "MANAGE-2.2", title: "Risks managed with corrective action", surface: "Comply" }
  ],
  ISO_42001: [
    { controlId: "8.1", title: "Operational planning and control", surface: "Enforce" },
    { controlId: "9.1", title: "Monitoring, measurement, analysis", surface: "Watch" },
    { controlId: "10.2", title: "Nonconformity and corrective action", surface: "Comply" }
  ],
  EU_AI_ACT: [
    { controlId: "Art.12", title: "Record-keeping and logging", surface: "Watch" },
    { controlId: "Art.14", title: "Human oversight", surface: "Enforce" },
    { controlId: "Art.15", title: "Accuracy, robustness, cybersecurity", surface: "Shield" }
  ]
};

const DISCLAIMER =
  "Evidence of conformity for review, not a compliance determination. Control results are 'not evaluated' " +
  "unless evidence is bound to the control. The framework mapping is experimental and not expert-reviewed; " +
  "framework text controls.";

const LOW_COVERAGE_BELOW = 0.75;

/**
 * A run file whose seal does not verify vouches for nothing: its own VALID status cannot sign for it,
 * and its observed coverage cannot raise the claim kind.
 */
function trustedFields(report: DiagnosticReportClaimInput, sealVerified: boolean): DiagnosticReportClaimInput {
  return sealVerified || report.status !== "VALID" ? report : { ...report, status: "INVALID" };
}

function runClaim(report: DiagnosticReportClaimInput, sealVerified: boolean, now: number): ClaimEnvelope {
  const envelope = envelopeForDiagnosticReport(report, now);
  return sealVerified ? envelope : { ...envelope, claimKind: "self_reported" };
}

/** No evidence is bound to any control yet, so nothing here may propose a pass or a fail. */
function controlClaim(spec: ControlSpec, framework: GrcFramework, run: ClaimEnvelope,
  report: DiagnosticReportClaimInput, now: number): ClaimEnvelope {
  return evaluateClaimEligibility({
    producer: `grc:${framework}:${spec.controlId}`,
    method: run.provenance.method,
    regulated: true,
    proposed: { result: "not_evaluated", level: null },
    evidence: {
      eventCount: run.reasons.includes("EMPTY_EVIDENCE") ? 0 : 1,
      tiers: run.claimKind === "observed" ? ["OBSERVED"] : ["SELF_REPORTED"],
      newestTs: report.windowEndTs,
      boundToControl: false,
      sameScope: true,
      contradictory: report.contradictionCount > 0,
      signatureValid: report.status === "VALID",
      issuerPinned: null
    },
    evidenceRefs: run.provenance.evidenceRefs,
    now
  });
}

function finiteOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function buildGrcEvidenceManifest(framework: GrcFramework, input: DiagnosticReportClaimInput,
  options: { sealVerified: boolean; now: number }): GrcEvidenceManifestV2 {
  const { sealVerified, now } = options;
  const report = trustedFields(input, sealVerified);
  const claim = runClaim(report, sealVerified, now);
  const runLabel = renderClaimLabel(claim);
  const signal = (name: GrcRunSignal["name"], value: GrcRunSignal["value"]): GrcRunSignal =>
    ({ name, value, label: runLabel.kindLabel });
  const controls = FRAMEWORK_CONTROLS[framework].map((spec): GrcControlResultV2 => {
    const controlEnvelope = controlClaim(spec, framework, claim, report, now);
    return { controlId: spec.controlId, title: spec.title, amcSurface: spec.surface, claim: controlEnvelope,
      label: renderClaimLabel(controlEnvelope).line };
  });
  const body = {
    schemaVersion: "amc.grc-evidence.v2" as const,
    framework,
    agentId: report.agentId,
    runId: report.runId,
    generatedAt: now,
    run: {
      claim,
      label: runLabel.line,
      signals: [
        signal("verification", sealVerified && report.status === "VALID" && report.verificationPassed === true),
        signal("evidenceCoverage", finiteOrNull(report.evidenceCoverage)),
        signal("maturityLevel", claim.eligibleLevel),
        signal("evidenceReadiness", evaluateDiagnosticEvidenceReadiness(report).status)
      ]
    },
    controls,
    disclaimer: DISCLAIMER
  };
  return { ...body, manifestHash: sha256Hex(canonicalize(body)) };
}

const SARIF_RULES = [
  { id: "AMC-GRC-RUN-UNVERIFIED", name: "Run seal or verification did not check out", level: "error" },
  { id: "AMC-GRC-EVIDENCE-NOT-READY", name: "Run evidence is not claim-ready", level: "warning" },
  { id: "AMC-GRC-LOW-COVERAGE", name: `Run evidence coverage below ${LOW_COVERAGE_BELOW * 100}%`, level: "note" }
] as const;

/** Minimal SARIF 2.1.0: developer findings about the run only, never control ids or control results. */
export function grcManifestToSarif(manifest: GrcEvidenceManifestV2): unknown {
  const value = (name: GrcRunSignal["name"]) => manifest.run.signals.find((s) => s.name === name)?.value;
  const coverage = value("evidenceCoverage");
  const findings: Record<(typeof SARIF_RULES)[number]["id"], string | null> = {
    "AMC-GRC-RUN-UNVERIFIED": value("verification") === true ? null
      : `Run ${manifest.runId} is not verified: its seal, signature status or evidence verification did not check out.`,
    "AMC-GRC-EVIDENCE-NOT-READY": value("evidenceReadiness") === "READY" ? null
      : `Run ${manifest.runId} evidence readiness is ${String(value("evidenceReadiness"))}.`,
    "AMC-GRC-LOW-COVERAGE": typeof coverage === "number" && coverage < LOW_COVERAGE_BELOW
      ? `Run ${manifest.runId} evidence coverage is ${(coverage * 100).toFixed(0)}%.` : null
  };
  return {
    version: "2.1.0",
    $schema: "https://json.schemastore.org/sarif-2.1.0.json",
    runs: [{
      tool: { driver: { name: "Agent Maturity Compass", informationUri: "https://agentmaturity.co",
        rules: SARIF_RULES.map((rule) => ({ id: rule.id, name: rule.name })) } },
      results: SARIF_RULES.flatMap((rule) => {
        const text = findings[rule.id];
        return text === null ? [] : [{ ruleId: rule.id, level: rule.level, message: { text } }];
      })
    }]
  };
}
