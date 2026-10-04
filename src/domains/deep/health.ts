/**
 * Deep questions. Health station: HIPAA (45 CFR Part 164), plus the round-2 controls
 * healthcare-deep-51..58 (QMSR, Part 11, 45 CFR 92.210, AI Act, EHDS, CMS-0057-F, ICH E6(R3), ONC DSI).
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
  // Round 2 (2026-10-04): non-HIPAA health controls, numbered after the generated healthcare-hipaa-deep-04..50.
  {
    id: "healthcare-deep-51",
    industry: "healthcare",
    station: "health",
    packIds: ["clinical-lifecycle", "life-technology"],
    regulation: "FDA QMSR (21 CFR Part 820)",
    section: "21 CFR §820.10 incorporating ISO 13485:2016 clause 7.3 (design and development changes); §820.35 control of records",
    question: "When the agent is part of a device, are changes to its prompts, tool configurations and model versions controlled as design and development changes under the QMSR, with records controlled per §820.35?",
    evaluationCriteria: ["Prompts, tool configurations and model versions are listed as design outputs", "Each change has a design change record with review, verification and, where needed, validation", "Change records are controlled records under §820.35", "Released configuration matches the last approved design record"],
    levels: { 1: "Prompt, tool and model changes ship without design change records", 2: "Model changes are recorded; prompt and tool changes are not", 3: "All three change types have design change records with review", 4: "Change records include verification evidence and are controlled per §820.35", 5: "Release is blocked when the deployed configuration differs from the last approved record; sampled changes trace to verification and validation" },
    evidenceTypes: ["design_change_record", "configuration_manifest", "verification_report", "record_control_log"],
    source: { title: "Federal Register 89 FR 7496 (FR Doc. 2024-01709), Medical Devices; Quality System Regulation Amendments, final rule", url: "https://www.govinfo.gov/content/pkg/FR-2024-02-02/html/2024-01709.htm", retrievedAt: "2026-10-04", verified: true, note: "Effective date (2 February 2026) and incorporation of ISO 13485 by reference read on govinfo; the current §820.10 and §820.35 headings were read on the eCFR structure by the round-2 author and refuter (round2/content/health/review.json, 2026-10-04). ISO 13485 clause text not read (paywalled)." },
  },
  {
    id: "healthcare-deep-52",
    industry: "healthcare",
    station: "health",
    packIds: ["digital-health-record", "life-technology", "drug-discovery", "clinical-trials"],
    regulation: "FDA 21 CFR Part 11",
    section: "§11.10(e) secure, computer-generated, time-stamped audit trails",
    question: "For records required by FDA regulations that the agent creates, modifies or deletes, does the audit trail independently record the date and time of each agent action, identify the agent and the person it acts for, and preserve previously recorded information?",
    evaluationCriteria: ["Audit trail is generated by the system, not entered by the agent", "Each entry identifies the agent version and the accountable person", "Prior values remain visible after changes", "Audit trails are retained for at least the record retention period and are available for FDA review"],
    levels: { 1: "No audit trail for agent changes", 2: "Audit trail records the action but not the agent identity or prior value", 3: "System-generated, time-stamped entries with agent identity and prior values", 4: "Retention matches the record retention period; users cannot alter entries", 5: "Audit trail review is performed on a schedule and sampled reviews are documented" },
    evidenceTypes: ["audit_trail_export", "system_configuration", "retention_policy", "audit_review_record"],
    source: { title: "21 CFR §11.10 Controls for closed systems, (e) audit trails (CFR 2025 edition)", url: "https://www.govinfo.gov/content/pkg/CFR-2025-title21-vol1/xml/CFR-2025-title21-vol1-sec11-10.xml", retrievedAt: "2026-10-04", verified: true },
  },
  {
    id: "healthcare-deep-53",
    industry: "healthcare",
    station: "health",
    packIds: ["professional-practice", "clinical-lifecycle", "patient-lifecycle"],
    regulation: "ACA §1557 final rule (45 CFR Part 92)",
    section: "45 CFR §92.210(b) identification of risk; §92.210(c) mitigation of risk",
    question: "Does the covered entity identify each agent-driven patient care decision support tool whose input variables measure race, color, national origin, sex, age or disability, and record reasonable efforts to mitigate the discrimination risk of each such tool?",
    evaluationCriteria: ["Inventory of decision support tools including agents", "Input-variable review per tool", "Mitigation record per identified tool", "Re-review triggered by tool or model change"],
    levels: { 1: "No inventory of decision support tools", 2: "Inventory exists without input-variable review", 3: "Input variables reviewed and identified tools listed", 4: "Mitigation records exist for each identified tool", 5: "Reviews and mitigations are repeated on each tool change and their effect is monitored" },
    evidenceTypes: ["tool_inventory", "input_variable_review", "mitigation_record", "change_trigger_log"],
    source: { title: "45 CFR §92.210 Nondiscrimination in the use of patient care decision support tools, (b) and (c) (CFR 2024 edition)", url: "https://www.govinfo.gov/content/pkg/CFR-2024-title45-vol1/xml/CFR-2024-title45-vol1-sec92-210.xml", retrievedAt: "2026-10-04", verified: true },
  },
  {
    id: "healthcare-deep-54",
    industry: "healthcare",
    station: "health",
    packIds: ["digital-health-record", "wellness-management", "patient-lifecycle", "life-technology"],
    regulation: "EU AI Act (Regulation (EU) 2024/1689)",
    section: "Art. 26(6) deployer log retention (at least six months); Art. 26(7) informing workers; application to Annex III systems from 2 December 2027 per Regulation (EU) 2026/1744",
    question: "Where a deployer uses a high-risk health AI system, does it keep the logs the system generates, to the extent they are under its control, for at least six months, and inform affected workers and their representatives before workplace use?",
    evaluationCriteria: ["Log retention period configured and at least six months", "Logs under deployer control identified", "Worker information given before workplace use", "Application date tracked per the amended Art. 113"],
    levels: { 1: "No log retention setting for the AI system", 2: "Logs are kept, period undefined", 3: "Retention of at least six months configured and evidenced", 4: "Worker notices recorded before workplace use", 5: "Retention and notices are audited; the amended application dates are recorded per system" },
    evidenceTypes: ["log_retention_config", "log_inventory", "worker_notice_record", "classification_record"],
    source: { title: "Regulation (EU) 2024/1689 (AI Act), OJ text via Publications Office: Art. 5(1)(f), Art. 26(6)-(7), Art. 49(1), Art. 50(1), Art. 113, Annex I Section A points 11-12, Annex III point 5(a), (c), (d)", url: "https://publications.europa.eu/resource/celex/32024R1689", retrievedAt: "2026-10-04", verified: true, note: "Art. 26(6)-(7) read in the OJ text; amended Art. 113(c) dates read in Regulation (EU) 2026/1744 (OJ L of 24.7.2026)." },
  },
  {
    id: "healthcare-deep-55",
    industry: "healthcare",
    station: "health",
    packIds: ["digital-health-record"],
    regulation: "European Health Data Space (Regulation (EU) 2025/327)",
    section: "Art. 9(2) information on access: provider or person, date and time, data accessed; available at least three years; Art. 105 application from 2029-03-26 for priority categories",
    question: "Is every access the agent makes to personal electronic health data recorded with the provider or person, date and time and data accessed, and available to the natural person for at least three years from each access?",
    evaluationCriteria: ["Access records name provider or person, date and time, data accessed", "Agent accesses are attributed to the accountable professional", "Records available to the natural person through the access service", "Retention of at least three years per access"],
    levels: { 1: "Agent accesses are not recorded or use a shared identity", 2: "Accesses recorded without data detail", 3: "All Art. 9(2) fields recorded and attributable", 4: "Records exposed to natural persons and retained three years", 5: "Exposure and retention tested; application date per Art. 105 tracked" },
    evidenceTypes: ["access_record_sample", "retention_config", "patient_access_service_test", "attribution_mapping"],
    source: { title: "Regulation (EU) 2025/327 (EHDS), OJ text: Art. 8 Right to restrict access; Art. 9 (information on access, available at least three years); Art. 23 MyHealth@EU; Chapter III EHR systems and wellness applications; Art. 27; Art. 47 Labelling of wellness applications; Art. 105 (applies from 2027-03-26; Arts. 3-15 and 23(2)-(6) from 2029-03-26 for priority categories; Chapter IV from 2029-03-26)", url: "https://publications.europa.eu/resource/celex/32025R0327", retrievedAt: "2026-10-04", verified: true, note: "Art. 9(2) content and three-year availability and Art. 105 dates read in the OJ text." },
  },
  {
    id: "healthcare-deep-56",
    industry: "healthcare",
    station: "health",
    packIds: ["specialized-medicine"],
    regulation: "CMS Interoperability and Prior Authorization final rule (CMS-0057-F)",
    section: "Specific reason for denial; decision timeframes of 72 hours (expedited) and 7 calendar days (standard) beginning 2026; timeframes do not apply to drugs",
    question: "When the agent supports prior authorization decisions for impacted payers, does every denial carry a specific reason, and are decisions for medical items and services made within 72 hours (expedited) or 7 calendar days (standard)?",
    evaluationCriteria: ["Specific denial reason on every denial", "Decision clock per request type", "Drug requests separated from items and services", "Decision notice sent to the provider for every decision"],
    levels: { 1: "Denials without reasons; no decision clock", 2: "Reasons on some denials; clock not measured", 3: "Reasons on all denials; clocks measured", 4: "Escalation before deadline breach; drug requests separated", 5: "Timeliness and reason quality audited on a sample each period with corrective actions" },
    evidenceTypes: ["denial_notice_sample", "decision_time_report", "request_type_mapping", "provider_notice_log"],
    source: { title: "Federal Register 89 FR 8758 (FR Doc. 2024-00895), CMS Interoperability and Prior Authorization final rule (CMS-0057-F)", url: "https://www.govinfo.gov/content/pkg/FR-2024-02-08/html/2024-00895.htm", retrievedAt: "2026-10-04", verified: true, note: "Read on govinfo: specific reason for denial; 72-hour expedited and 7-calendar-day standard decision timeframes with 2026 compliance dates; the prior authorization policies do not apply to drugs of any type." },
  },
  {
    id: "healthcare-deep-57",
    industry: "healthcare",
    station: "health",
    packIds: ["clinical-trials"],
    regulation: "ICH E6(R3) Good Clinical Practice",
    section: "Annex 1 §4.2.2 relevant metadata including audit trails; §4.2.4 data corrections; §4.3 computerised systems",
    question: "When the agent captures, transforms or corrects trial data, are the metadata and audit trail retained, is each correction attributable and explained, and is the agent managed as a computerised system with risk-proportionate validation?",
    evaluationCriteria: ["Metadata and audit trail retained for agent-touched data", "Each correction records who/what, when and why", "Agent listed in the computerised-systems inventory", "Validation proportionate to risk and documented"],
    levels: { 1: "Agent changes to trial data are not attributable", 2: "Changes logged without reason or agent version", 3: "Attributable, explained corrections with metadata retained", 4: "Agent in the systems inventory with validation records", 5: "Validation and audit-trail review results are reviewed by sponsor oversight on a schedule" },
    evidenceTypes: ["audit_trail_export", "correction_log", "system_inventory", "validation_record"],
    source: { title: "European Medicines Agency, ICH E6 Good clinical practice - scientific guideline (E6(R3) Principles and Annex 1, effective 23 July 2025)", url: "https://www.ema.europa.eu/en/ich-e6-good-clinical-practice-scientific-guideline", retrievedAt: "2026-10-04", verified: true, note: "Current version and EU effective dates read on the EMA page; the Annex 1 headings 4.2.2, 4.2.4 and 4.3 were read in the ICH Step 4 PDF by the round-2 author and refuter (round2/content/health/review.json, 2026-10-04). The EMA PDF did not render to text in this run." },
  },
  {
    id: "healthcare-deep-58",
    industry: "healthcare",
    station: "health",
    packIds: ["digital-health-record", "professional-practice"],
    regulation: "ONC HTI-1 certification criteria (45 CFR Part 170)",
    section: "45 CFR §170.315(b)(11)(vi) intervention risk management for Predictive Decision Support Interventions; proposed for removal by HTI-5 (90 FR 60970, not final)",
    question: "For each predictive decision support intervention the health IT developer supplies, including AI agents surfaced through certified health IT, are intervention risk management practices applied and documented while the requirement remains in force?",
    evaluationCriteria: ["List of predictive DSIs supplied", "Risk analysis and mitigation records per DSI", "Records versioned with model updates", "HTI-5 status tracked as proposed"],
    levels: { 1: "No list of predictive DSIs", 2: "List exists; no risk management records", 3: "Risk analysis and mitigation records per DSI", 4: "Records versioned per release", 5: "Records reviewed per release and the regulatory status re-checked when HTI-5 is finalised or withdrawn" },
    evidenceTypes: ["dsi_inventory", "risk_management_record", "release_mapping", "regulatory_status_note"],
    source: { title: "45 CFR §170.315(b)(11)(vi) Intervention risk management (CFR 2024 edition, revised as of 2024-10-01)", url: "https://www.govinfo.gov/content/pkg/CFR-2024-title45-vol2/xml/CFR-2024-title45-vol2-sec170-315.xml", retrievedAt: "2026-10-04", verified: true, note: "(b)(11)(vi) text read on govinfo; HTI-5 (90 FR 60970) proposes removing it and is not final (Federal Register API, read by the round-2 author 2026-10-04)." },
  },
];
