import { z } from "zod";
import type { EvidenceEventType } from "../types.js";
import { questionIds } from "../diagnostic/questionBank.js";
import { frameworkChoices } from "./frameworks.js";

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
    minObservedRatio: z.number().min(0).max(1).default(0)
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
export const complianceMappingSourceSchema = z.object({
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
  related: z.object({
    questions: z.array(questionEnum).default([]),
    packs: z.array(z.string().min(1)).default([]),
    configs: z.array(z.string().min(1)).default([])
  }),
  sources: z.array(complianceMappingSourceSchema).min(1).optional()
});

export const complianceMapsSchema = z.object({
  complianceMaps: z.object({
    version: z.literal(1),
    mappings: z.array(complianceMappingSchema).min(1)
  })
});

export type ComplianceEvidenceRequirement = z.infer<typeof complianceEvidenceRequirementSchema>;
export type ComplianceMapping = z.infer<typeof complianceMappingSchema>;
export type ComplianceMappingSource = z.infer<typeof complianceMappingSourceSchema>;
export type ComplianceMapsFile = z.infer<typeof complianceMapsSchema>;

export type ComplianceCategoryStatus = "SATISFIED" | "PARTIAL" | "MISSING" | "UNKNOWN";

export interface ComplianceCategoryResult {
  id: string;
  framework: string;
  category: string;
  description: string;
  status: ComplianceCategoryStatus;
  reasons: string[];
  evidenceRefs: Array<{
    eventId: string;
    eventHash: string;
    eventType: string;
  }>;
  neededToSatisfy: string[];
}

export interface ComplianceReportJson {
  reportId: string;
  ts: number;
  workspace: string;
  framework: string;
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
    partial: number;
    missing: number;
    unknown: number;
    score: number;
  };
  categories: ComplianceCategoryResult[];
  nonClaims: string[];
}
