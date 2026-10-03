import type { AssurancePackResult, AssuranceReport, AssuranceScenarioResult } from "../../types.js";
import { getAssurancePack } from "../../assurance/packs/index.js";
import { assessDomain, type ComplianceGap } from "../domainAssessmentEngine.js";
import type { Domain } from "../domainRegistry.js";
import { INDUSTRY_PACK_MINIMUM_LEVEL, type RequirementSpec } from "./certificationRequirements.js";
import type { CertificationEvidenceRef, CertificationRequirement } from "./certificationSchema.js";

/** Thrown when an input offered as evidence cannot be traced back to a ledger run. */
export class CertificationProvenanceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CertificationProvenanceError";
  }
}

/** One answered pack question, with the ledger session the answer was recorded in. */
export interface PackResponseEvidence {
  questionId: string;
  /** Maturity level 1..5 as the pack rubrics define it. */
  level: number;
  sessionId: string;
  /** Optional id of the response record inside that session. */
  responseId?: string;
}

export function assertPackResponseProvenance(response: PackResponseEvidence): void {
  if (typeof response.questionId !== "string" || response.questionId.trim().length === 0) {
    throw new CertificationProvenanceError("pack response without a questionId — refused");
  }
  if (typeof response.sessionId !== "string" || response.sessionId.trim().length === 0) {
    throw new CertificationProvenanceError(`pack response ${response.questionId} carries no ledger sessionId — refused`);
  }
  if (!Number.isInteger(response.level) || response.level < 1 || response.level > 5) {
    throw new CertificationProvenanceError(`pack response ${response.questionId} has level ${String(response.level)}; expected an integer 1..5`);
  }
}

function measuredScenarios(pack: AssurancePackResult): AssuranceScenarioResult[] {
  return pack.scenarioResults.filter((scenario) => scenario.inconclusive !== true);
}

/**
 * An assurance report is evidence only when every measured scenario points at
 * ledger events inside the run's session. The runner writes both; a report
 * without them (a red-team report, a hand-written file, a pre-sessionId run)
 * cannot make the claim and is refused rather than scored.
 */
export function assertAssuranceReportProvenance(report: AssuranceReport): void {
  const runId = typeof report.assuranceRunId === "string" && report.assuranceRunId.length > 0 ? report.assuranceRunId : "<no assuranceRunId>";
  if (typeof report.sessionId !== "string" || report.sessionId.trim().length === 0) {
    throw new CertificationProvenanceError(`assurance run ${runId} carries no ledger sessionId — refused`);
  }
  if (!Array.isArray(report.packResults)) {
    throw new CertificationProvenanceError(`assurance run ${runId} carries no packResults — refused`);
  }
  for (const pack of report.packResults) {
    for (const scenario of measuredScenarios(pack)) {
      if (!Array.isArray(scenario.evidenceEventIds) || scenario.evidenceEventIds.length === 0) {
        throw new CertificationProvenanceError(
          `assurance run ${runId}: measured scenario ${pack.packId}/${scenario.scenarioId} has no evidenceEventIds — refused`
        );
      }
    }
  }
}

interface PackHit {
  report: AssuranceReport;
  pack: AssurancePackResult;
}

function latestReportWithPack(reports: AssuranceReport[], packId: string): PackHit | null {
  let best: PackHit | null = null;
  for (const report of reports) {
    const pack = report.packResults.find((row) => row.packId === packId);
    if (!pack) continue;
    if (best === null || report.ts > best.report.ts) best = { report, pack };
  }
  return best;
}

function packEvidence(hit: PackHit): CertificationEvidenceRef[] {
  return [
    { kind: "assurance-run", id: hit.report.assuranceRunId },
    { kind: "ledger-session", id: hit.report.sessionId ?? "" },
    ...measuredScenarios(hit.pack).flatMap((scenario) => scenario.evidenceEventIds.map((id) => ({ kind: "ledger-event" as const, id })))
  ];
}

function resolvePackRequirement(spec: RequirementSpec, reports: AssuranceReport[]): CertificationRequirement {
  const packId = spec.packId ?? "";
  const base = { id: spec.id, kind: spec.kind, title: spec.title, source: spec.source, criterion: spec.criterion };
  let scenarioIds: string[];
  try {
    scenarioIds = getAssurancePack(packId).scenarios.map((scenario) => scenario.id);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ...base, status: "NOT_EVALUATED", observed: null, reason: `pack unknown to the assurance registry: ${message}`, evidence: [] };
  }
  const hit = latestReportWithPack(reports, packId);
  if (!hit) {
    return { ...base, status: "NOT_EVALUATED", observed: null, reason: "no sealed assurance run with ledger provenance contains this pack", evidence: [] };
  }
  const evidence = packEvidence(hit);
  if (hit.report.evidenceStatus === "INSUFFICIENT_EVIDENCE") {
    return { ...base, status: "NOT_EVALUATED", observed: "0 scenarios reached the agent", reason: `assurance run ${hit.report.assuranceRunId} reports INSUFFICIENT_EVIDENCE`, evidence };
  }
  const measured = new Map(measuredScenarios(hit.pack).map((scenario) => [scenario.scenarioId, scenario] as const));
  const missing = scenarioIds.filter((id) => !measured.has(id));
  const failed = [...measured.values()].filter((scenario) => !scenario.pass);
  if (failed.length > 0) {
    return {
      ...base,
      status: "FAIL",
      observed: `${failed.length} of ${measured.size} measured scenarios failed`,
      reason: `failed scenarios in assurance run ${hit.report.assuranceRunId}: ${failed.map((scenario) => scenario.scenarioId).join(", ")}`,
      evidence
    };
  }
  if (missing.length > 0) {
    return {
      ...base,
      status: "NOT_EVALUATED",
      observed: `${measured.size}/${scenarioIds.length} scenarios measured`,
      reason: `scenarios not measured in assurance run ${hit.report.assuranceRunId}: ${missing.join(", ")}`,
      evidence
    };
  }
  return {
    ...base,
    status: "PASS",
    observed: `${measured.size}/${scenarioIds.length} scenarios passed`,
    reason: `every scenario measured and passed in assurance run ${hit.report.assuranceRunId}`,
    evidence
  };
}

function responseEvidence(response: PackResponseEvidence): CertificationEvidenceRef[] {
  const refs: CertificationEvidenceRef[] = [{ kind: "ledger-session", id: response.sessionId }];
  if (response.responseId && response.responseId.length > 0) refs.push({ kind: "pack-response", id: response.responseId });
  return refs;
}

function resolveSectorQuestion(spec: RequirementSpec, response: PackResponseEvidence | undefined): CertificationRequirement {
  const base = { id: spec.id, kind: spec.kind, title: spec.title, source: spec.source, regulatoryRef: spec.regulatoryRef, criterion: spec.criterion };
  if (!response) {
    return { ...base, status: "NOT_EVALUATED", observed: null, reason: "no recorded response for this question", evidence: [] };
  }
  const pass = response.level >= INDUSTRY_PACK_MINIMUM_LEVEL;
  return {
    ...base,
    status: pass ? "PASS" : "FAIL",
    observed: `L${response.level}`,
    reason: pass ? `L${response.level} meets the L${INDUSTRY_PACK_MINIMUM_LEVEL} minimum` : `L${response.level} is below the L${INDUSTRY_PACK_MINIMUM_LEVEL} minimum`,
    evidence: responseEvidence(response)
  };
}

function resolveDomainQuestion(
  spec: RequirementSpec,
  response: PackResponseEvidence | undefined,
  gap: ComplianceGap | undefined
): CertificationRequirement {
  const base = { id: spec.id, kind: spec.kind, title: spec.title, source: spec.source, regulatoryRef: spec.regulatoryRef, criterion: spec.criterion };
  if (!response) {
    return { ...base, status: "NOT_EVALUATED", observed: null, reason: "no recorded response for this question", evidence: [] };
  }
  if (gap) {
    return {
      ...base,
      status: "FAIL",
      observed: `L${gap.currentLevel}`,
      reason: `L${gap.currentLevel} is below the required L${gap.requiredLevel} (assessDomain compliance gap)`,
      evidence: responseEvidence(response)
    };
  }
  return { ...base, status: "PASS", observed: `L${response.level}`, reason: `L${response.level}: no compliance gap reported by assessDomain`, evidence: responseEvidence(response) };
}

export interface ResolveRequirementsInput {
  station: Domain;
  agentId: string;
  specs: RequirementSpec[];
  packResponses: PackResponseEvidence[];
  /** Reports already checked by `assertAssuranceReportProvenance` (the caller's seal check comes before that). */
  assuranceReports: AssuranceReport[];
}

/**
 * Resolves every requirement to PASS, FAIL or NOT_EVALUATED with the evidence
 * ids it rests on. Inputs lacking provenance throw rather than degrade.
 */
export function resolveRequirements(input: ResolveRequirementsInput): CertificationRequirement[] {
  for (const response of input.packResponses) assertPackResponseProvenance(response);
  for (const report of input.assuranceReports) assertAssuranceReportProvenance(report);

  const responseByQuestion = new Map<string, PackResponseEvidence>();
  for (const response of input.packResponses) {
    if (responseByQuestion.has(response.questionId)) {
      throw new CertificationProvenanceError(`duplicate pack response for ${response.questionId} — refused; one recorded answer per question`);
    }
    responseByQuestion.set(response.questionId, response);
  }

  // The domain engine treats an absent answer as L1; only answered questions are
  // handed to it, so a NOT_EVALUATED question never surfaces as a FAIL.
  const domainQuestionIds = input.specs.filter((spec) => spec.kind === "domain-question").map((spec) => spec.questionId ?? "");
  const domainQuestionScores: Record<string, number> = {};
  for (const questionId of domainQuestionIds) {
    const response = responseByQuestion.get(questionId);
    if (response) domainQuestionScores[questionId] = response.level;
  }
  const gaps = assessDomain({ agentId: input.agentId, domain: input.station, baseScores: {}, domainQuestionScores }).complianceGaps;
  const gapByQuestion = new Map(gaps.map((gap) => [gap.questionId, gap] as const));

  return input.specs.map((spec) => {
    switch (spec.kind) {
      case "industry-pack-question":
        return resolveSectorQuestion(spec, responseByQuestion.get(spec.questionId ?? ""));
      case "domain-question":
        return resolveDomainQuestion(spec, responseByQuestion.get(spec.questionId ?? ""), gapByQuestion.get(spec.questionId ?? ""));
      case "assurance-pack":
      case "scenario-pack":
        return resolvePackRequirement(spec, input.assuranceReports);
    }
  });
}
