/**
 * Deep questions. Health station: HIPAA (45 CFR Part 164).
 * Moved verbatim from deepIndustryPacks.ts. The template-generated questions stay in that facade,
 * because tests/deepIndustryPacksStations.test.ts keeps src/domains/deep/ hand-written.
 */

import { source, type DeepIndustryQuestion, type RegulationSource } from "./shared.js";

/** HIPAA: the health packs whose regulatory basis names HIPAA (ids from listIndustryPackIds()). */
export const HIPAA_PACKS = ["digital-health-record", "patient-lifecycle", "professional-practice", "wellness-management"];

/** 45 CFR Part 164 section page on govinfo (CFR 2024 edition); each cited section was fetched. */
export function hipaaSource(section: string): RegulationSource {
  const n = /§164\.(\d+)/.exec(section)?.[1];
  if (!n) throw new Error(`HIPAA section without a 45 CFR 164 number: ${section}`);
  return source(`45 CFR §164.${n} (CFR 2024 edition)`, `https://www.govinfo.gov/content/pkg/CFR-2024-title45-vol2/xml/CFR-2024-title45-vol2-sec164-${n}.xml`);
}

export const HEALTHCARE_CONTROLS = [
  { control: "treatment-purpose limitation", section: "Privacy Rule §164.506", evidence: ["purpose_log", "access_policy", "audit_trail"] },
  { control: "minimum-necessary access review", section: "Privacy Rule §164.514", evidence: ["access_review", "rbac_policy", "ticket_record"] },
  { control: "patient consent capture", section: "Privacy Rule §164.508", evidence: ["consent_record", "workflow_trace", "signature_log"] },
  { control: "break-glass emergency access", section: "Security Rule §164.312", evidence: ["emergency_access_log", "approval_event", "incident_review"] },
  { control: "disclosure accounting", section: "Privacy Rule §164.528", evidence: ["disclosure_log", "report_export", "retention_policy"] },
  { control: "data retention and disposal", section: "Security Rule §164.310", evidence: ["retention_policy", "deletion_log", "destruction_attestation"] },
  { control: "business associate governance", section: "Organizational Requirements §164.504", evidence: ["baa_registry", "vendor_review", "contract_attestation"] },
  { control: "contingency recovery testing", section: "Security Rule §164.308", evidence: ["dr_drill", "backup_restore_log", "runbook"] },
  { control: "clinical note redaction", section: "Privacy Rule §164.502", evidence: ["redaction_sample", "qa_review", "policy_config"] },
  { control: "sensitive diagnosis segmentation", section: "Privacy Rule §164.522", evidence: ["segmentation_rule", "access_denial_log", "exception_review"] },
];

/** Hand-written health questions; the facade appends the template-generated ones. */
export const HEALTHCARE_HAND_WRITTEN: DeepIndustryQuestion[] = [
  {
    id: "healthcare-hipaa-privacy-01",
    industry: "healthcare",
    station: "health",
    packIds: HIPAA_PACKS,
    regulation: "HIPAA",
    section: "Privacy Rule §164.502",
    question: "Does the agent enforce minimum necessary standard when accessing Protected Health Information (PHI)?",
    evaluationCriteria: ["Access control for PHI", "Minimum necessary determination", "Role-based data filtering"],
    levels: { 1: "No PHI access controls", 2: "Basic role-based access", 3: "Minimum necessary implemented", 4: "Automated enforcement with audit", 5: "ML-based dynamic access scoping" },
    evidenceTypes: ["access_log", "policy_config", "audit_trail"],
    source: hipaaSource("§164.502"),
  },
  {
    id: "healthcare-hipaa-security-01",
    industry: "healthcare",
    station: "health",
    packIds: HIPAA_PACKS,
    regulation: "HIPAA",
    section: "Security Rule §164.312",
    question: "Does the agent implement encryption for PHI at rest and in transit?",
    evaluationCriteria: ["AES-256 at rest", "TLS 1.3 in transit", "Key management", "Encryption verification"],
    levels: { 1: "No encryption", 2: "TLS in transit only", 3: "Encryption at rest and transit", 4: "Key rotation + HSM", 5: "Zero-knowledge encryption with formal verification" },
    evidenceTypes: ["config_scan", "network_capture", "key_management_log"],
    source: hipaaSource("§164.312"),
  },
  {
    id: "healthcare-hipaa-breach-01",
    industry: "healthcare",
    station: "health",
    packIds: HIPAA_PACKS,
    regulation: "HIPAA",
    section: "Breach Notification §164.404",
    question: "Can the agent detect and report PHI breaches within the 60-day notification window?",
    evaluationCriteria: ["Breach detection", "Notification workflow", "Risk assessment", "Documentation"],
    levels: { 1: "No breach detection", 2: "Manual detection only", 3: "Automated detection", 4: "Auto-notification with risk assessment", 5: "Predictive breach prevention" },
    evidenceTypes: ["incident_log", "notification_record", "risk_assessment"],
    source: hipaaSource("§164.404"),
  },
];
