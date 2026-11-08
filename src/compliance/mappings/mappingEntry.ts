import type { ComplianceMapping } from "../mappingSchema.js";

/** Requirement builders shared by the file-per-framework mappings (SH-TRUST-04): whole packs and registered audit types only. */
const pack = (packId: string, minScore = 80) => ({ type: "requires_assurance_pack" as const, packId, minScore, maxSucceeded: 0 });
export const noAudit = (...auditTypesDenylist: string[]) => ({ type: "requires_no_audit" as const, auditTypesDenylist });
export const auditRows = (...auditTypes: string[]) => ({ type: "requires_evidence_event" as const, eventTypes: ["audit" as const], minObservedRatio: 0, auditTypes });

/** A mapping builder for one framework: each named pack is required at the default bar, then any further requirements. */
export function mappingEntry(framework: string) {
  return (params: { id: string; category: string; description: string; packs: string[]; requirements?: ComplianceMapping["evidenceRequirements"] }): ComplianceMapping => ({
    id: params.id, framework, category: params.category, description: params.description,
    evidenceRequirements: [...params.packs.map((packId) => pack(packId)), ...(params.requirements ?? [])],
    related: { questions: [], packs: params.packs, configs: [] }, catalogControls: []
  });
}
