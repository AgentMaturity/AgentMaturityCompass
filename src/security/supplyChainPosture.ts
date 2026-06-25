import type { EmitGuardDecisionReceiptInput } from "../enforce/evidenceEmitter.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";

export type SupplyChainComponentKind =
  | "provider"
  | "model"
  | "tool"
  | "dataset"
  | "mcp_server"
  | "plugin"
  | "package";

export type SupplyChainVulnerabilityState = "clean" | "known_vulnerabilities" | "unknown" | "unscanned";

export interface SupplyChainComponentInput {
  kind: SupplyChainComponentKind;
  id: string;
  version: string;
  source: string;
  versionHash?: string | null;
  vulnerabilityState: SupplyChainVulnerabilityState;
  vulnerabilities?: string[];
  evidenceRefs?: string[];
}

export interface SupplyChainAllowedSourcePolicy {
  policyId: string;
  allowedSources: string[];
  failOnUnknownVulnerabilityState?: boolean;
  failOnKnownVulnerabilities?: boolean;
}

export interface SupplyChainComponentPosture {
  kind: SupplyChainComponentKind;
  id: string;
  version: string;
  source: string;
  versionHash: string | null;
  vulnerabilityState: SupplyChainVulnerabilityState;
  vulnerabilities: string[];
  evidenceRefs: string[];
  allowedSource: boolean;
  componentHash: string;
  reasons: string[];
}

export interface SupplyChainPostureSummary {
  totalComponents: number;
  allowedComponents: number;
  blockedComponents: number;
  knownVulnerableComponents: number;
  unknownVulnerabilityComponents: number;
}

export interface SupplyChainPostureReport {
  v: 1;
  generatedTs: number;
  policy: {
    policyId: string;
    allowedSources: string[];
    failOnUnknownVulnerabilityState: boolean;
    failOnKnownVulnerabilities: boolean;
  };
  ok: boolean;
  summary: SupplyChainPostureSummary;
  components: SupplyChainComponentPosture[];
  reasons: string[];
  reportHash: string;
}

export interface BuildSupplyChainPostureReportInput {
  generatedTs?: number;
  policy: SupplyChainAllowedSourcePolicy;
  components: SupplyChainComponentInput[];
}

export interface SupplyChainPostureIntegrityResult {
  ok: boolean;
  reasons: string[];
}

const SHA256_HEX_RE = /^[a-f0-9]{64}$/;

function cleanString(value: string): string {
  return value.trim();
}

function normalizeStringList(values: string[] | undefined): string[] {
  return [...new Set((values ?? []).map(cleanString).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function reportBody(report: Omit<SupplyChainPostureReport, "reportHash">): Omit<SupplyChainPostureReport, "reportHash"> {
  return report;
}

export function computeSupplyChainVersionHash(input: Pick<SupplyChainComponentInput, "kind" | "id" | "version" | "source">): string {
  return sha256Hex(canonicalize({
    kind: input.kind,
    id: cleanString(input.id),
    version: cleanString(input.version),
    source: cleanString(input.source),
  }));
}

function componentSortKey(component: SupplyChainComponentInput): string {
  return [component.kind, component.id, component.source, component.version].map(cleanString).join("\0");
}

function normalizePolicy(policy: SupplyChainAllowedSourcePolicy): SupplyChainPostureReport["policy"] {
  return {
    policyId: cleanString(policy.policyId),
    allowedSources: normalizeStringList(policy.allowedSources),
    failOnUnknownVulnerabilityState: policy.failOnUnknownVulnerabilityState ?? true,
    failOnKnownVulnerabilities: policy.failOnKnownVulnerabilities ?? true,
  };
}

function evaluateComponent(
  input: SupplyChainComponentInput,
  policy: SupplyChainPostureReport["policy"],
): SupplyChainComponentPosture {
  const id = cleanString(input.id);
  const source = cleanString(input.source);
  const version = cleanString(input.version);
  const versionHash = input.versionHash ? cleanString(input.versionHash) : null;
  const vulnerabilities = normalizeStringList(input.vulnerabilities);
  const evidenceRefs = normalizeStringList(input.evidenceRefs);
  const allowedSource = policy.allowedSources.includes(source);
  const reasons: string[] = [];

  if (!id) {
    reasons.push("component id missing");
  }
  if (!version) {
    reasons.push(`component ${id || "unknown"} version missing`);
  }
  if (!source) {
    reasons.push(`component ${id || "unknown"} source missing`);
  }
  if (!allowedSource) {
    reasons.push(`component ${id || "unknown"} source not allowed by policy`);
  }
  if (!versionHash || !SHA256_HEX_RE.test(versionHash)) {
    reasons.push(`component ${id || "unknown"} version hash invalid`);
  }
  if ((input.vulnerabilityState === "unknown" || input.vulnerabilityState === "unscanned") && policy.failOnUnknownVulnerabilityState) {
    reasons.push(`component ${id || "unknown"} vulnerability state ${input.vulnerabilityState} fails closed`);
  }
  if (input.vulnerabilityState === "known_vulnerabilities" && policy.failOnKnownVulnerabilities) {
    reasons.push(`component ${id || "unknown"} has known vulnerabilities`);
  }
  if (input.vulnerabilityState === "clean" && vulnerabilities.length > 0) {
    reasons.push(`component ${id || "unknown"} lists vulnerabilities but claims clean state`);
  }

  const body = {
    kind: input.kind,
    id,
    version,
    source,
    versionHash,
    vulnerabilityState: input.vulnerabilityState,
    vulnerabilities,
    evidenceRefs,
    allowedSource,
    reasons,
  };

  return {
    ...body,
    componentHash: sha256Hex(canonicalize(body)),
  };
}

export function buildSupplyChainPostureReport(input: BuildSupplyChainPostureReportInput): SupplyChainPostureReport {
  const policy = normalizePolicy(input.policy);
  const components = [...input.components]
    .sort((a, b) => componentSortKey(a).localeCompare(componentSortKey(b)))
    .map((component) => evaluateComponent(component, policy));
  const reasons = components.flatMap((component) => component.reasons);
  if (components.length === 0) {
    reasons.push("component inventory missing");
  }

  const summary: SupplyChainPostureSummary = {
    totalComponents: components.length,
    allowedComponents: components.filter((component) => component.allowedSource).length,
    blockedComponents: components.filter((component) => component.reasons.length > 0).length,
    knownVulnerableComponents: components.filter(
      (component) => component.vulnerabilityState === "known_vulnerabilities" || component.vulnerabilities.length > 0,
    ).length,
    unknownVulnerabilityComponents: components.filter(
      (component) => component.vulnerabilityState === "unknown" || component.vulnerabilityState === "unscanned",
    ).length,
  };

  const body = reportBody({
    v: 1,
    generatedTs: input.generatedTs ?? Date.now(),
    policy,
    ok: reasons.length === 0,
    summary,
    components,
    reasons,
  });

  return {
    ...body,
    reportHash: sha256Hex(canonicalize(body)),
  };
}

export function verifySupplyChainPostureReportIntegrity(report: SupplyChainPostureReport): SupplyChainPostureIntegrityResult {
  const reasons: string[] = [];
  if (!SHA256_HEX_RE.test(report.reportHash)) {
    reasons.push("report hash invalid");
  }
  const { reportHash: _reportHash, ...body } = report;
  const expected = sha256Hex(canonicalize(body));
  if (SHA256_HEX_RE.test(report.reportHash) && report.reportHash !== expected) {
    reasons.push("report hash mismatch");
  }
  for (const component of report.components) {
    if (!SHA256_HEX_RE.test(component.componentHash)) {
      reasons.push(`component ${component.id || "unknown"} hash invalid`);
      continue;
    }
    const { componentHash: _componentHash, ...componentBody } = component;
    const expectedComponentHash = sha256Hex(canonicalize(componentBody));
    if (component.componentHash !== expectedComponentHash) {
      reasons.push(`component ${component.id || "unknown"} hash mismatch`);
    }
  }
  return {
    ok: reasons.length === 0,
    reasons,
  };
}

export function buildSupplyChainGuardDecisionReceiptInput(params: {
  report: SupplyChainPostureReport;
  agentId: string;
  moduleCode: string;
}): EmitGuardDecisionReceiptInput {
  const decision = params.report.ok ? "allow" : "block";
  return {
    agentId: params.agentId,
    moduleCode: params.moduleCode,
    decision,
    matchedRule: `supply-chain:${params.report.policy.policyId}:${decision}`,
    inputHash: params.report.reportHash,
    outputHash: sha256Hex(canonicalize({
      ok: params.report.ok,
      summary: params.report.summary,
      reasons: params.report.reasons,
      componentHashes: params.report.components.map((component) => component.componentHash),
    })),
    reason: params.report.ok
      ? "Supply-chain posture satisfies component inventory, version hash, vulnerability state, and allowed-source policy."
      : "Supply-chain posture failed closed on component inventory, version hash, vulnerability state, or allowed-source policy.",
    severity: params.report.ok ? "low" : "high",
    meta: {
      supplyChainPosture: {
        reportHash: params.report.reportHash,
        policyId: params.report.policy.policyId,
        summary: params.report.summary,
        reasons: params.report.reasons,
      },
    },
  };
}
