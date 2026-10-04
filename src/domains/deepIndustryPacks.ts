/**
 * Deep Industry Pack Extensions — MF-09
 *
 * Adds granular, regulation-specific questions for every station. Health:
 * HIPAA; wealth: SOX/Basel III/AML/MiFID II/MAR; governance: FedRAMP/FISMA
 * (NIST SP 800-53 controls); education, environment, mobility and technology:
 * hand-written questions anchored to one provision each.
 *
 * Every question cites its source. `verified: true` means the cited page was
 * read on `retrievedAt` and confirmed the cited provision; otherwise `note`
 * says what could not be confirmed from an official page.
 */

import type { Domain } from "./domainRegistry.js";
import { source, type DeepIndustryQuestion, type RegulationSource } from "./deep/shared.js";
import { DEEP_EDUCATION_QUESTIONS } from "./deep/education.js";
import { DEEP_ENVIRONMENT_QUESTIONS } from "./deep/environment.js";
import { DEEP_MOBILITY_QUESTIONS } from "./deep/mobility.js";
import { DEEP_TECHNOLOGY_QUESTIONS } from "./deep/technology.js";

export type { DeepIndustryQuestion, RegulationSource } from "./deep/shared.js";
export { DEEP_EDUCATION_QUESTIONS, DEEP_ENVIRONMENT_QUESTIONS, DEEP_MOBILITY_QUESTIONS, DEEP_TECHNOLOGY_QUESTIONS };

/**
 * Pack linkage for the legacy health/wealth/governance questions (ids from listIndustryPackIds()).
 * HIPAA: the health packs whose regulatory basis names HIPAA. FedRAMP/FISMA: the governance packs that
 * run public-sector systems, plus virtual-infrastructure, whose basis names FedRAMP Rev. 5.
 */
const HIPAA_PACKS = ["digital-health-record", "patient-lifecycle", "professional-practice", "wellness-management"];
const FEDERAL_SYSTEM_PACKS = ["citizen-services", "petition-to-law", "digital-citizens-rights", "public-private-collaboration", "virtual-infrastructure"];
/** Wealth packs in scope per regime: AML follows FATF/BSA in the basis; MiFID II/MAR reach crypto-assets that are financial instruments. */
const SOX_PACKS = ["digital-payments", "circular-economy"];
const BASEL_PACKS = ["circular-economy", "digital-payments"];
const AML_PACKS = ["digital-payments", "blockchain", "no-poverty"];
const MIFID_PACKS = ["blockchain", "circular-economy"];

/** 45 CFR Part 164 section page on govinfo (CFR 2024 edition); each cited section was fetched. */
function hipaaSource(section: string): RegulationSource {
  const n = /§164\.(\d+)/.exec(section)?.[1];
  if (!n) throw new Error(`HIPAA section without a 45 CFR 164 number: ${section}`);
  return source(`45 CFR §164.${n} (CFR 2024 edition)`, `https://www.govinfo.gov/content/pkg/CFR-2024-title45-vol2/xml/CFR-2024-title45-vol2-sec164-${n}.xml`);
}

const SOX = source("Sarbanes-Oxley Act of 2002, Pub. L. 107-204 (§302, §404)", "https://www.govinfo.gov/content/pkg/PLAW-107publ204/html/PLAW-107publ204.htm");
const BASEL = source("Basel III: international regulatory framework for banks (BCBS)", "https://www.bis.org/bcbs/basel3.htm",
  "Page confirms the Basel III framework; the section label is a thematic area, not a clause of the Basel Framework.");
const NIST_800_53 = source("NIST SP 800-53 Rev. 5, Security and Privacy Controls for Information Systems and Organizations", "https://csrc.nist.gov/pubs/sp/800/53/r5/upd1/final",
  "Publication and control families confirmed; individual control identifiers were not fetched from the NIST control catalog.");

const HEALTHCARE_CONTROLS = [
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

const FINANCE_CONTROLS = [
  { control: "journal entry approval segregation", regulation: "SOX", packIds: SOX_PACKS, section: "Section 404", evidence: ["approval_log", "role_matrix", "change_audit"], source: SOX },
  { control: "reconciliation exception handling", regulation: "SOX", packIds: SOX_PACKS, section: "Section 302", evidence: ["reconciliation_report", "exception_queue", "resolution_log"], source: SOX },
  { control: "model validation governance", regulation: "Basel III", packIds: BASEL_PACKS, section: "Model Risk Governance", evidence: ["validation_report", "challenge_log", "backtest"], source: BASEL },
  { control: "stress loss scenario coverage", regulation: "Basel III", packIds: BASEL_PACKS, section: "Stress Testing", evidence: ["stress_result", "scenario_library", "approval_memo"], source: BASEL },
  { control: "suspicious activity escalation", regulation: "AML", packIds: AML_PACKS, section: "31 CFR §1020.320 (bank SAR filing)", evidence: ["alert_log", "case_record", "sar_submission"],
    source: source("31 CFR §1020.320 Reports by banks of suspicious transactions (CFR 2024 edition)", "https://www.govinfo.gov/content/pkg/CFR-2024-title31-vol3/xml/CFR-2024-title31-vol3-sec1020-320.xml") },
  { control: "KYC refresh enforcement", regulation: "AML", packIds: AML_PACKS, section: "CDD Rule — 31 CFR §1010.230", evidence: ["kyc_refresh_log", "identity_check", "expiry_alert"],
    source: source("31 CFR §1010.230 Beneficial ownership requirements for legal entity customers (CFR 2024 edition)", "https://www.govinfo.gov/content/pkg/CFR-2024-title31-vol3/xml/CFR-2024-title31-vol3-sec1010-230.xml") },
  // RTS 28 venue reports were dropped (Art. 27(6) is absent from ESMA's current rulebook text); the best-execution duty in Art. 27(1) remains.
  { control: "best execution monitoring", regulation: "MiFID II", packIds: MIFID_PACKS, section: "Art. 27(1) — best execution", evidence: ["execution_report", "venue_comparison", "slippage_log"],
    source: source("Directive 2014/65/EU (MiFID II) Art. 27 — ESMA Interactive Single Rulebook", "https://www.esma.europa.eu/publications-and-data/interactive-single-rulebook/mifid-ii/article-27-obligation-execute-orders") },
  { control: "market abuse surveillance", regulation: "MAR", packIds: MIFID_PACKS, section: "Art. 16 — prevention and detection of market abuse", evidence: ["surveillance_alert", "investigation_note", "trade_replay"],
    source: source("Regulation (EU) No 596/2014 (Market Abuse Regulation)", "https://eur-lex.europa.eu/legal-content/EN/ALL/?uri=CELEX:32014R0596",
      "Art. 16 content confirmed from EUR-Lex and ESMA search results; the EUR-Lex page itself did not render for review.") },
  { control: "client money segregation", regulation: "MiFID II", packIds: MIFID_PACKS, section: "Art. 16(8)-(9) — safeguarding client assets", evidence: ["ledger_snapshot", "segregation_control", "breach_report"],
    source: source("Directive 2014/65/EU (MiFID II) Art. 16 — ESMA Interactive Single Rulebook", "https://www.esma.europa.eu/publications-and-data/interactive-single-rulebook/mifid-ii/article-16-organisational-requirements") },
  { control: "limit breach handling", regulation: "Basel III", packIds: BASEL_PACKS, section: "Risk Limits", evidence: ["limit_event", "override_approval", "risk_dashboard"], source: BASEL },
];

const GOVERNMENT_CONTROLS = [
  { control: "privileged access recertification", regulation: "FedRAMP", section: "AC-2", evidence: ["access_review", "account_registry", "manager_attestation"] },
  { control: "audit log tamper detection", regulation: "FedRAMP", section: "AU-9", evidence: ["integrity_check", "log_chain", "alert_record"] },
  { control: "baseline configuration drift detection", regulation: "FedRAMP", section: "CM-2", evidence: ["config_diff", "baseline_manifest", "remediation_ticket"] },
  { control: "identity proofing assurance", regulation: "FedRAMP", section: "IA-2", evidence: ["proofing_record", "credential_event", "revocation_log"] },
  { control: "boundary protection rule coverage", regulation: "FedRAMP", section: "SC-7", evidence: ["firewall_policy", "network_flow", "exception_register"] },
  { control: "malware response automation", regulation: "FISMA", section: "SI-3", evidence: ["endpoint_alert", "containment_log", "playbook_run"] },
  { control: "continuous monitoring cadence", regulation: "FISMA", section: "CA-7", evidence: ["monitoring_schedule", "scan_history", "sla_report"] },
  { control: "physical media protection", regulation: "FISMA", section: "PE-16", evidence: ["media_inventory", "transport_log", "destruction_record"] },
  { control: "plan of action tracking", regulation: "FedRAMP", section: "CA-5 (POA&M)", evidence: ["poam_entry", "risk_acceptance", "closure_evidence"] },
  { control: "interconnection agreement enforcement", regulation: "FedRAMP", section: "CA-3", evidence: ["isa_document", "connection_review", "boundary_test"] },
];

export const DEEP_HEALTHCARE_QUESTIONS: DeepIndustryQuestion[] = [
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
  ...Array.from({ length: 47 }, (_, i) => {
    const control = HEALTHCARE_CONTROLS[i % HEALTHCARE_CONTROLS.length]!;
    const phase = ["intake", "retrieval", "transformation", "sharing", "retention"][i % 5]!;
    return {
      id: `healthcare-hipaa-deep-${String(i + 4).padStart(2, "0")}`,
      industry: "healthcare",
      station: "health" as const,
      packIds: HIPAA_PACKS,
      regulation: "HIPAA",
      section: control.section,
      question: `During ${phase}, does the agent enforce ${control.control} for PHI-bearing workflows with measurable safeguards and documented exception handling?`,
      evaluationCriteria: [
        `Control definition exists for ${control.control}`,
        `Operational evidence covers ${phase} workflows`,
        "Exceptions are approved and logged",
        "Monitoring detects policy drift or unauthorized PHI handling",
      ],
      levels: {
        1: `No reliable ${control.control} safeguards during ${phase}`,
        2: `Manual or inconsistent ${control.control} checks`,
        3: `Documented ${control.control} with auditable enforcement`,
        4: `Continuous monitoring and exception review for ${control.control}`,
        5: `Adaptive, risk-aware ${control.control} with verified effectiveness`,
      },
      evidenceTypes: control.evidence,
      source: hipaaSource(control.section),
    };
  }),
];

export const DEEP_FINANCE_QUESTIONS: DeepIndustryQuestion[] = [
  {
    id: "finance-sox-control-01",
    industry: "finance",
    station: "wealth",
    packIds: SOX_PACKS,
    regulation: "SOX",
    section: "Section 302",
    question: "Does the agent maintain internal controls over financial reporting accuracy?",
    evaluationCriteria: ["Data validation", "Reconciliation checks", "Segregation of duties", "Audit trail"],
    levels: { 1: "No controls", 2: "Manual checks", 3: "Automated validation", 4: "Continuous monitoring", 5: "Predictive anomaly detection" },
    evidenceTypes: ["control_test", "reconciliation_log", "audit_report"],
    source: SOX,
  },
  {
    id: "finance-basel-risk-01",
    industry: "finance",
    station: "wealth",
    packIds: BASEL_PACKS,
    regulation: "Basel III",
    section: "Pillar 1 — Minimum Capital",
    question: "Does the agent properly calculate risk-weighted assets when involved in trading decisions?",
    evaluationCriteria: ["RWA calculation accuracy", "Model validation", "Stress testing", "Capital adequacy"],
    levels: { 1: "No risk calculation", 2: "Basic RWA", 3: "Standardized approach", 4: "IRB approach", 5: "Advanced modeling with backtesting" },
    evidenceTypes: ["model_output", "backtest_result", "stress_test"],
    source: BASEL,
  },
  ...Array.from({ length: 48 }, (_, i) => {
    const control = FINANCE_CONTROLS[i % FINANCE_CONTROLS.length]!;
    const workflow = ["trade capture", "post-trade control", "surveillance", "client onboarding", "regulatory reporting"][i % 5]!;
    return {
      id: `finance-deep-${String(i + 3).padStart(2, "0")}`,
      industry: "finance",
      station: "wealth" as const,
      packIds: control.packIds,
      regulation: control.regulation,
      section: control.section,
      question: `Within ${workflow}, does the agent enforce ${control.control} with evidence that materially reduces financial, conduct, or compliance risk?`,
      evaluationCriteria: [
        `${control.control} is formally specified`,
        `${workflow} events are monitored and attributable`,
        "Breaches trigger escalation and remediation",
        "Evidence supports auditor review and replay",
      ],
      levels: {
        1: `No effective ${control.control} coverage`,
        2: `Partially manual ${control.control} controls`,
        3: `Reliable ${control.control} with auditable evidence`,
        4: `Continuous supervision and challenge over ${control.control}`,
        5: `Predictive, validated ${control.control} with strong governance`,
      },
      evidenceTypes: control.evidence,
      source: control.source,
    };
  }),
];

export const DEEP_GOVERNMENT_QUESTIONS: DeepIndustryQuestion[] = [
  {
    id: "gov-fedramp-auth-01",
    industry: "government",
    station: "governance",
    packIds: FEDERAL_SYSTEM_PACKS,
    regulation: "FedRAMP",
    section: "AC-2 Account Management",
    question: "Does the agent implement FedRAMP-compliant account management with PIV/CAC authentication?",
    evaluationCriteria: ["Multi-factor auth", "PIV/CAC support", "Account lifecycle", "Privilege management"],
    levels: { 1: "No MFA", 2: "Basic MFA", 3: "PIV/CAC enabled", 4: "Continuous auth", 5: "Zero-trust with behavioral biometrics" },
    evidenceTypes: ["auth_log", "config_scan", "penetration_test"],
    source: NIST_800_53,
  },
  ...Array.from({ length: 49 }, (_, i) => {
    const control = GOVERNMENT_CONTROLS[i % GOVERNMENT_CONTROLS.length]!;
    const missionArea = ["identity", "network defense", "configuration", "assessment", "operations"][i % 5]!;
    return {
      id: `gov-deep-${String(i + 2).padStart(2, "0")}`,
      industry: "government",
      station: "governance" as const,
      packIds: FEDERAL_SYSTEM_PACKS,
      regulation: control.regulation,
      section: control.section,
      question: `For ${missionArea} workflows, does the agent demonstrate ${control.control} with evidence suitable for FedRAMP/FISMA assessor review and corrective-action tracking?`,
      evaluationCriteria: [
        `${control.control} is mapped to control families and owners`,
        "Implementation evidence is reproducible and current",
        "Deficiencies generate POA&M-style follow-up",
        "Continuous monitoring confirms control effectiveness",
      ],
      levels: {
        1: `No dependable ${control.control} evidence`,
        2: `Ad hoc ${control.control} with weak documentation`,
        3: `Assessor-ready ${control.control} artifacts and enforcement`,
        4: `Continuous verification and timely remediation for ${control.control}`,
        5: `Highly mature ${control.control} with durable, audit-grade evidence`,
      },
      evidenceTypes: control.evidence,
      source: NIST_800_53,
    };
  }),
];

export function getAllDeepIndustryQuestions(): DeepIndustryQuestion[] {
  return [
    ...DEEP_HEALTHCARE_QUESTIONS,
    ...DEEP_FINANCE_QUESTIONS,
    ...DEEP_GOVERNMENT_QUESTIONS,
    ...DEEP_EDUCATION_QUESTIONS,
    ...DEEP_ENVIRONMENT_QUESTIONS,
    ...DEEP_MOBILITY_QUESTIONS,
    ...DEEP_TECHNOLOGY_QUESTIONS,
  ];
}

export function getDeepQuestionsByIndustry(industry: string): DeepIndustryQuestion[] {
  return getAllDeepIndustryQuestions().filter((q) => q.industry === industry);
}

export function getDeepQuestionsByStation(station: Domain): DeepIndustryQuestion[] {
  return getAllDeepIndustryQuestions().filter((q) => q.station === station);
}

/** Deep questions that list `packId` (an id from listIndustryPackIds()) among their packIds. */
export function getDeepQuestionsForPack(packId: string): DeepIndustryQuestion[] {
  return getAllDeepIndustryQuestions().filter((q) => q.packIds?.includes(packId) ?? false);
}

export function getDeepQuestionsByRegulation(regulation: string): DeepIndustryQuestion[] {
  return getAllDeepIndustryQuestions().filter((q) => q.regulation === regulation);
}

/** Keyed by industry label (kept for compatibility); `station` names the AMC station. */
export function getDeepIndustryPackStats(): Record<string, { station: Domain; questionCount: number; regulations: string[]; unverifiedSources: number }> {
  const result: Record<string, { station: Domain; questionCount: number; regulations: string[]; unverifiedSources: number }> = {};
  for (const q of getAllDeepIndustryQuestions()) {
    const entry = result[q.industry] ?? { station: q.station, questionCount: 0, regulations: [], unverifiedSources: 0 };
    result[q.industry] = {
      station: entry.station,
      questionCount: entry.questionCount + 1,
      regulations: entry.regulations.includes(q.regulation) ? entry.regulations : [...entry.regulations, q.regulation],
      unverifiedSources: entry.unverifiedSources + (q.source.verified ? 0 : 1),
    };
  }
  return result;
}
