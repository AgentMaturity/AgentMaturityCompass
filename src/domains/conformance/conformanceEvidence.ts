import type { AssurancePackResult, AssuranceReport, AssuranceScenarioResult, SessionRecord } from "../../types.js";
import { getAssurancePack } from "../../assurance/packs/index.js";
import { fromUppercaseStatus } from "../../claims/eligibility/adapters.js";
import { evaluateClaimEligibility } from "../../claims/eligibility/evaluate.js";
import type { ClaimKind } from "../../claims/eligibility/types.js";
import { verifyEvidenceEventIntegrity, type Ledger } from "../../ledger/ledger.js";
import type { RequirementSpec } from "./conformanceRequirements.js";
import type { ConformanceEvidenceRef, ConformanceRequirement, ConformanceRequirementStatus } from "./conformanceSchema.js";

/** Thrown when an input offered as evidence cannot be traced back to a ledger run. */
export class ConformanceProvenanceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConformanceProvenanceError";
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

/** Design rule 1: a self-reported answer supports L1 at most, so it meets no requirement above L1. */
export const SELF_REPORTED_MAX_LEVEL = 1;
export const DESIGN_RULE_1_REASON = "self-reported answer; levels above L1 need observed evidence (design rule 1)";
const APPLICABILITY_REASON = "no compiled plan decides applicability; the requirement comes from the station's derived set";

export interface EvidenceFreshness {
  /** The server clock when the run started. */
  nowTs: number;
  maxEvidenceAgeMs: number;
}

/** Fresh: recorded no later than nowTs and no more than maxEvidenceAgeMs before it. A missing time is not fresh. */
export function isFresh(ts: number | null, freshness: EvidenceFreshness): boolean {
  return ts !== null && Number.isFinite(ts) && ts <= freshness.nowTs && freshness.nowTs - ts <= freshness.maxEvidenceAgeMs;
}

function responseShapeError(response: PackResponseEvidence): string | null {
  if (typeof response.questionId !== "string" || response.questionId.trim().length === 0) return "pack response without a questionId";
  if (typeof response.sessionId !== "string" || response.sessionId.trim().length === 0) {
    return `pack response ${response.questionId} carries no ledger sessionId`;
  }
  if (!Number.isInteger(response.level) || response.level < 1 || response.level > 5) {
    return `pack response ${response.questionId} has level ${String(response.level)}; expected an integer 1..5`;
  }
  return null;
}

export type PackResponseResolution = { ok: true; session: SessionRecord; claimKind: ClaimKind } | { ok: false; reason: string };

/**
 * Admits a questionnaire answer only through its ledger session. The session must exist and be sealed, and the seal
 * must verify: the chain up to the session's last event and the monitor signature over that event's hash
 * (verifyEvidenceEventIntegrity, against this workspace's keys, so a local audit trail). It must also be fresh:
 * the sealing time (server clock, outside the seal) and the last event's time (inside the seal) are both checked, and
 * either one too old or after nowTs refuses. One read transaction, so the rows checked are the rows read.
 * The answer stays self_reported: no ledger event records pack answers. `sessions` caches the check per session id.
 */
export function resolvePackResponseEvidence(ledger: Ledger, response: PackResponseEvidence, freshness: EvidenceFreshness,
  sessions: Map<string, PackResponseResolution> = new Map()): PackResponseResolution {
  const shape = responseShapeError(response);
  if (shape) return { ok: false, reason: shape };
  const cached = sessions.get(response.sessionId) ?? resolveSession(ledger, response.sessionId, freshness);
  sessions.set(response.sessionId, cached);
  return cached;
}

function resolveSession(ledger: Ledger, id: string, freshness: EvidenceFreshness): PackResponseResolution {
  return ledger.db.transaction((): PackResponseResolution => {
    const session = ledger.getSessionById(id);
    if (!session) return { ok: false, reason: `session ${id} not found in the ledger` };
    if (!session.session_seal_sig) return { ok: false, reason: `session ${id} is not sealed` };
    const last = ledger.db.prepare("SELECT id, ts FROM evidence_events WHERE session_id = ? ORDER BY rowid DESC LIMIT 1")
      .get(id) as { id: string; ts: number } | undefined;
    if (!last) return { ok: false, reason: `session ${id} is not sealed: it has no events for a seal to bind` };
    // ponytail: verifies the ledger prefix up to this event, O(events) per session; the run checks each session once.
    const verified = verifyEvidenceEventIntegrity({ ledger, eventId: last.id, requireSealedSession: true });
    if (!verified.ok) return { ok: false, reason: `session ${id} is not sealed: ${verified.errors.slice(0, 3).join("; ")}` };
    const times = [session.ended_ts, last.ts];
    if (times.some((ts) => ts !== null && ts > freshness.nowTs)) return { ok: false, reason: `session ${id} is dated after this run` };
    if (!times.every((ts) => isFresh(ts, freshness))) return { ok: false, reason: `session ${id} is older than the maximum evidence age` };
    return { ok: true, session, claimKind: "self_reported" };
  })();
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
    throw new ConformanceProvenanceError(`assurance run ${runId} carries no ledger sessionId — refused`);
  }
  if (!Array.isArray(report.packResults)) {
    throw new ConformanceProvenanceError(`assurance run ${runId} carries no packResults — refused`);
  }
  for (const pack of report.packResults) {
    for (const scenario of measuredScenarios(pack)) {
      if (!Array.isArray(scenario.evidenceEventIds) || scenario.evidenceEventIds.length === 0) {
        throw new ConformanceProvenanceError(
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

function packEvidence(hit: PackHit): ConformanceEvidenceRef[] {
  return [
    { kind: "assurance-run", id: hit.report.assuranceRunId },
    { kind: "ledger-session", id: hit.report.sessionId ?? "" },
    ...measuredScenarios(hit.pack).flatMap((scenario) => scenario.evidenceEventIds.map((id) => ({ kind: "ledger-event" as const, id })))
  ];
}

function resolvePackRequirement(spec: RequirementSpec, reports: AssuranceReport[]): ResolvedRow {
  const packId = spec.packId ?? "";
  let scenarioIds: string[];
  try {
    scenarioIds = getAssurancePack(packId).scenarios.map((scenario) => scenario.id);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { status: "NOT_EVALUATED", observed: null, reason: `pack unknown to the assurance registry: ${message}`, evidence: [] };
  }
  const hit = latestReportWithPack(reports, packId);
  if (!hit) {
    return { status: "NOT_EVALUATED", observed: null, reason: "no sealed assurance run with ledger provenance contains this pack", evidence: [] };
  }
  const evidence = packEvidence(hit);
  if (hit.report.evidenceStatus === "INSUFFICIENT_EVIDENCE") {
    return { status: "NOT_EVALUATED", observed: "0 scenarios reached the agent", reason: `assurance run ${hit.report.assuranceRunId} reports INSUFFICIENT_EVIDENCE`, evidence };
  }
  const measured = new Map(measuredScenarios(hit.pack).map((scenario) => [scenario.scenarioId, scenario] as const));
  const missing = scenarioIds.filter((id) => !measured.has(id));
  const failed = [...measured.values()].filter((scenario) => !scenario.pass);
  if (failed.length > 0) {
    return {
      status: "FAIL",
      observed: `${failed.length} of ${measured.size} measured scenarios failed`,
      reason: `failed scenarios in assurance run ${hit.report.assuranceRunId}: ${failed.map((scenario) => scenario.scenarioId).join(", ")}`,
      evidence
    };
  }
  if (missing.length > 0) {
    return {
      status: "NOT_EVALUATED",
      observed: `${measured.size}/${scenarioIds.length} scenarios measured`,
      reason: `scenarios not measured in assurance run ${hit.report.assuranceRunId}: ${missing.join(", ")}`,
      evidence
    };
  }
  return {
    status: "PASS",
    observed: `${measured.size}/${scenarioIds.length} scenarios passed`,
    reason: `every scenario measured and passed in assurance run ${hit.report.assuranceRunId}`,
    evidence
  };
}

type ResolvedRow = Pick<ConformanceRequirement, "status" | "observed" | "reason" | "evidence">;

function row(status: ConformanceRequirementStatus, observed: string | null, reason: string, evidence: ConformanceEvidenceRef[]): ResolvedRow {
  return { status, observed, reason, evidence };
}

function responseEvidence(response: PackResponseEvidence): ConformanceEvidenceRef[] {
  const refs: ConformanceEvidenceRef[] = [{ kind: "ledger-session", id: response.sessionId }];
  if (response.responseId && response.responseId.length > 0) refs.push({ kind: "pack-response", id: response.responseId });
  return refs;
}

/** Below the minimum is a FAIL (the operator's own answer); at or above it, design rule 1 decides. */
function resolveQuestion(spec: RequirementSpec, response: PackResponseEvidence | undefined): ResolvedRow {
  if (!response) return row("NOT_EVALUATED", null, "no accepted response for this question", []);
  const min = spec.minimumLevel;
  const observed = `L${response.level} (self-reported)`;
  const evidence = responseEvidence(response);
  if (min === undefined) return row("NOT_EVALUATED", observed, "no minimum level is defined for this question", evidence);
  if (response.level < min) return row("FAIL", observed, `L${response.level} is below the L${min} minimum`, evidence);
  if (min > SELF_REPORTED_MAX_LEVEL) return row("NOT_EVALUATED", observed, DESIGN_RULE_1_REASON, evidence);
  return row("PASS", observed, `L${response.level} meets the L${min} minimum`, evidence);
}

/**
 * Adds the claim kind and the five status dimensions through the shared eligibility rules. Every requirement is
 * regulated and its applicability unresolved (no compiled plan decides it), so no dimension result here is a pass.
 */
function withClaim(spec: RequirementSpec, resolved: ResolvedRow, selfReported: boolean, nowTs: number): ConformanceRequirement {
  const envelope = evaluateClaimEligibility({
    producer: `conformance:${spec.id}`,
    method: selfReported ? "numeric_self_answer" : "executed_test",
    regulated: true,
    proposed: { result: fromUppercaseStatus(resolved.status).result, level: null },
    evidence: { eventCount: resolved.evidence.filter((ref) => ref.kind === "ledger-event").length,
      tiers: [selfReported ? "SELF_REPORTED" : "OBSERVED"], newestTs: null, boundToControl: true, sameScope: true,
      contradictory: false, signatureValid: null, issuerPinned: null },
    applicability: { state: "unresolved", reason: APPLICABILITY_REASON },
    now: nowTs
  });
  return {
    id: spec.id, kind: spec.kind, title: spec.title, source: spec.source,
    ...(spec.regulatoryRef === undefined ? {} : { regulatoryRef: spec.regulatoryRef }),
    criterion: spec.criterion, ...resolved, claimKind: envelope.claimKind, statusDimensions: envelope.statusDimensions
  };
}

export interface ResolveRequirementsInput {
  specs: RequirementSpec[];
  /** Answers already admitted by resolvePackResponseEvidence. */
  packResponses: PackResponseEvidence[];
  /** Reports already checked by the caller's seal check; provenance is checked here. */
  assuranceReports: AssuranceReport[];
  nowTs: number;
}

/**
 * Resolves every requirement to PASS, FAIL or NOT_EVALUATED with the evidence ids it rests on, its claim kind and
 * status dimensions. Questionnaire answers are self_reported; assurance and scenario packs are observed.
 */
export function resolveRequirements(input: ResolveRequirementsInput): ConformanceRequirement[] {
  for (const response of input.packResponses) {
    const error = responseShapeError(response);
    if (error) throw new ConformanceProvenanceError(`${error} — refused`);
  }
  for (const report of input.assuranceReports) assertAssuranceReportProvenance(report);

  const responseByQuestion = new Map<string, PackResponseEvidence>();
  for (const response of input.packResponses) {
    if (responseByQuestion.has(response.questionId)) {
      throw new ConformanceProvenanceError(`duplicate pack response for ${response.questionId} — refused; one recorded answer per question`);
    }
    responseByQuestion.set(response.questionId, response);
  }

  return input.specs.map((spec) => spec.kind === "industry-pack-question" || spec.kind === "domain-question"
    ? withClaim(spec, resolveQuestion(spec, responseByQuestion.get(spec.questionId ?? "")), true, input.nowTs)
    : withClaim(spec, resolvePackRequirement(spec, input.assuranceReports), false, input.nowTs));
}
