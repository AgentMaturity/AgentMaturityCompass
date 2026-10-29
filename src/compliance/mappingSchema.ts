import { z } from "zod";
import type { EvidenceEventType } from "../types.js";
import type { ClaimKind, ClaimReasonCode, EvidenceState, ResultState, StatusDimensions } from "../claims/eligibility/types.js";
import type { ControlResult } from "../catalog/evidence/types.js";
import { questionIds } from "../diagnostic/questionBank.js";
import { frameworkChoices, type FamilyReview } from "./frameworks.js";
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

// Official text a mapping's clause was read from; retrievedAt is the calendar date it was read.
const complianceMappingSourceSchema = z.object({
  title: z.string().min(1),
  url: z.string().url(),
  retrievedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
});

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
  }),
  sources: z.array(complianceMappingSourceSchema).min(1).optional(),
  /**
   * Catalog control ids this mapping corresponds to (P1-53). Information only: it never changes how the mapping is
   * evaluated or its result. Built-in pairings are AI-proposed and pending review (docs/catalog/CONSOLIDATION.md).
   * The default keeps maps signed before P1-53 parseable.
   */
  catalogControls: z.array(z.string().regex(/^L[0-3](-[A-Z0-9]{2,8}){1,2}-[0-9]{2,3}$/, "must be a catalog control id")).default([])
});

export const complianceMapsSchema = z.object({
  complianceMaps: z.object({
    version: z.literal(1),
    mappings: z.array(complianceMappingSchema).min(1)
  })
});

/**
 * A crosswalk link from a clause-level control to a built-in mapping (P1-45). `partial`: the mapping's
 * evidence addresses part of the clause; `conflicting`: it pulls against the clause; `equivalent`: it
 * covers the whole clause, which only a named D-08 expert may decide, so it needs `signOffId`. Links are
 * information: a result for one framework never sets a result for another.
 */
export const crosswalkLinkSchema = z
  .object({
    mappingId: z.string().min(1),
    relation: z.enum(["equivalent", "partial", "conflicting"]),
    rationale: z.string().trim().min(1),
    signOffId: z.string().trim().min(1).optional()
  })
  .strict()
  .refine((link) => link.relation !== "equivalent" || link.signOffId !== undefined,
    { message: "an equivalent link needs a named expert's sign-off id (D-08)" });

// One clause of an official text (src/compliance/frameworks/controls.ts). verified means the text was
// string-checked against sourceUrl as read on retrievedAt, so a paraphrase is never verified.
export const frameworkControlSchema = z
  .object({
    controlId: z.string().min(1),
    framework: frameworkEnum,
    category: z.string().min(1).nullable(),
    title: z.string().min(1),
    text: z.string().min(1),
    textKind: z.enum(["verbatim", "verbatim-excerpt", "paraphrase"]),
    status: z.enum(["law", "proposed", "guidance"]),
    sourceUrl: z.string().url(),
    retrievedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    verified: z.boolean(),
    unverifiedReason: z.string().min(1).optional(),
    mappings: z.array(crosswalkLinkSchema)
  })
  .refine((row) => row.textKind !== "paraphrase" || !row.verified, { message: "a paraphrase cannot be verified against its source" })
  .refine((row) => row.verified || row.unverifiedReason !== undefined, { message: "an unverified control must say why" });

export type FrameworkControl = z.infer<typeof frameworkControlSchema>;
export type ComplianceEvidenceRequirement = z.infer<typeof complianceEvidenceRequirementSchema>;
export type ComplianceMapping = z.infer<typeof complianceMappingSchema>;
export type ComplianceMappingSource = z.infer<typeof complianceMappingSourceSchema>;
export type ComplianceMapsFile = z.infer<typeof complianceMapsSchema>;
/** What a caller may pass to be parsed: defaulted fields such as `catalogControls` may be left out. */
export type ComplianceMapsFileInput = z.input<typeof complianceMapsSchema>;

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
  /** Set when the category's source text is descoped: listed, never evaluated, left out of `coverage` (P1-45). */
  descoped?: string;
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
  /** The framework family's review status and currency flags (P1-45). Absent in reports written before it. */
  familyReview?: FamilyReview;
}
