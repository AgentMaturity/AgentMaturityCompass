import { z } from "zod";
import type { EvidenceEventType } from "../types.js";
import type { ClaimKind, ClaimReasonCode, EvidenceState, ResultState, StatusDimensions } from "../claims/eligibility/types.js";
import type { ControlResult } from "../catalog/evidence/types.js";
import { questionIds } from "../diagnostic/questionBank.js";
import { frameworkChoices } from "./frameworks.js";
import { STATIONS, type Station } from "../domains/stations.js";

const frameworkEnum = z.enum(frameworkChoices() as [string, ...string[]]);
const questionEnum = z.enum(questionIds as [string, ...string[]]);

const evidenceEventTypeEnum = z.enum(
  [
    "stdin",
    "stdout",
    "stderr",
    "artifact",
    "metric",
    "test",
    "audit",
    "review",
    "llm_request",
    "llm_response",
    "gateway",
    "tool_action",
    "tool_result"
  ] as [EvidenceEventType, ...EvidenceEventType[]]
);

export const complianceEvidenceRequirementSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("requires_evidence_event"),
    eventTypes: z.array(evidenceEventTypeEnum).min(1),
    minObservedRatio: z.number().min(0).max(1).default(0),
    /** Audit types that bind an `audit` event to this control without `meta.controlIds`. */
    auditTypes: z.array(z.string().min(1)).min(1).optional()
  }),
  z.object({
    type: z.literal("requires_assurance_pack"),
    packId: z.string().min(1),
    minScore: z.number().min(0).max(100),
    maxSucceeded: z.number().int().min(0).default(0)
  }),
  z.object({
    type: z.literal("requires_no_audit"),
    auditTypesDenylist: z.array(z.string().min(1)).min(1)
  })
]);

export const complianceMappingSchema = z.object({
  id: z.string().min(1),
  framework: frameworkEnum,
  category: z.string().min(1),
  description: z.string().min(1),
  evidenceRequirements: z.array(complianceEvidenceRequirementSchema).min(1),
  /** Whose evidence counts. Absent means "agent": workspace `system` events can only fail it. */
  binding: z.object({ scope: z.enum(["agent", "workspace"]) }).optional(),
  /** Explicit station tags; absent means derived (stationsForMapping in stationTags.ts). Never changes a result. */
  stations: z.array(z.enum(STATIONS)).min(1).optional(),
  related: z.object({
    questions: z.array(questionEnum).default([]),
    packs: z.array(z.string().min(1)).default([]),
    configs: z.array(z.string().min(1)).default([])
  })
});

export const complianceMapsSchema = z.object({
  complianceMaps: z.object({
    version: z.literal(1),
    mappings: z.array(complianceMappingSchema).min(1)
  })
});

export type ComplianceEvidenceRequirement = z.infer<typeof complianceEvidenceRequirementSchema>;
export type ComplianceMapping = z.infer<typeof complianceMappingSchema>;
export type ComplianceMapsFile = z.infer<typeof complianceMapsSchema>;

/**
 * PARTIAL and UNKNOWN are kept only to read reports written before P1-11 and P0-17; the engine never emits them. The
 * engine derives the status from `result` (pass SATISFIED, fail MISSING, not_evaluated NOT_EVALUATED) for one more
 * minor release; read `dimensions` and `claimKind` instead.
 */
export type ComplianceCategoryStatus = "SATISFIED" | "PARTIAL" | "MISSING" | "NOT_EVALUATED" | "UNKNOWN";

export interface ComplianceCategoryResult {
  id: string;
  framework: string;
  category: string;
  description: string;
  status: ComplianceCategoryStatus;
  /** Equal to `dimensions.result` and `dimensions.evidence`. */
  result: ResultState;
  evidence: EvidenceState;
  /** The five status dimensions, from the evidence this report admitted (P1-11). */
  dimensions: StatusDimensions;
  /** Derived through P0-08's evaluateClaimEligibility, never declared. */
  claimKind: ClaimKind;
  claimReasons: ClaimReasonCode[];
  notEvaluatedReasons: string[];
  reasons: string[];
  evidenceRefs: Array<{
    eventId: string;
    eventHash: string;
    eventType: string;
  }>;
  /** The first 24 admitted and rejected evidence items across the category's requirements. */
  admitted: ControlResult["admitted"];
  rejected: ControlResult["rejected"];
  neededToSatisfy: string[];
}

export interface ComplianceReportJson {
  reportId: string;
  ts: number;
  workspace: string;
  framework: string;
  /** Present when the report kept only the mappings tagged with this station. */
  station?: Station;
  agentId: string;
  windowStartTs: number;
  windowEndTs: number;
  configTrusted: boolean;
  configReason: string | null;
  trustTierCoverage: {
    observed: number;
    attested: number;
    selfReported: number;
  };
  coverage: {
    satisfied: number;
    /** Always 0 since P1-11; kept for one minor release. */
    partial: number;
    missing: number;
    /** Always 0; kept for one minor release. */
    unknown: number;
    notEvaluated: number;
    evaluated: number;
    /** Passes over all categories; null when no category was evaluated: there is nothing to score. */
    score: number | null;
  };
  categories: ComplianceCategoryResult[];
  nonClaims: string[];
}
