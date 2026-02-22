import { z } from "zod";

export const evidenceArtifactTypeSchema = z.enum([
  "risk_management_plan",
  "data_governance_policy",
  "transparency_report",
  "oversight_log",
  "accuracy_benchmark",
  "quality_management_system",
  "impact_assessment_scope",
  "impact_identification_report",
  "impact_evaluation_matrix",
  "impact_treatment_plan",
  "prompt_injection_test_report",
  "output_handling_safeguard_report",
  "training_data_poisoning_assessment",
  "model_dos_resilience_report",
  "supply_chain_integrity_report",
  "sensitive_information_disclosure_assessment",
  "plugin_tool_permission_audit",
  "excessive_agency_boundary_test",
  "overreliance_human_review_report",
  "model_theft_protection_assessment",
  "output-sanitization-report",
  "system-prompt-confidentiality-report",
  "echoleak-redteam-report",
  "garak-scan-report",
  "pyrit-scan-report",
  "vulnerability-scan-report",
  "ci-vulnerability-gate-report",
  "vulnerability-scan-history-report"
]);

export type EvidenceArtifactType = z.infer<typeof evidenceArtifactTypeSchema>;

export function isEvidenceArtifactType(value: string): value is EvidenceArtifactType {
  return evidenceArtifactTypeSchema.safeParse(value).success;
}
