/**
 * Deep Industry Pack Extensions — MF-09
 *
 * Adds granular, regulation-specific questions to existing industry packs.
 * Healthcare: HIPAA-specific, Finance: SOX/Basel, Government: FedRAMP.
 */

import { z } from "zod";

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
  { control: "journal entry approval segregation", regulation: "SOX", section: "Section 404", evidence: ["approval_log", "role_matrix", "change_audit"] },
  { control: "reconciliation exception handling", regulation: "SOX", section: "Section 302", evidence: ["reconciliation_report", "exception_queue", "resolution_log"] },
  { control: "model validation governance", regulation: "Basel III", section: "Model Risk Governance", evidence: ["validation_report", "challenge_log", "backtest"] },
  { control: "stress loss scenario coverage", regulation: "Basel III", section: "Stress Testing", evidence: ["stress_result", "scenario_library", "approval_memo"] },
  { control: "suspicious activity escalation", regulation: "AML", section: "SAR Operations", evidence: ["alert_log", "case_record", "sar_submission"] },
  { control: "KYC refresh enforcement", regulation: "AML", section: "CDD Rule", evidence: ["kyc_refresh_log", "identity_check", "expiry_alert"] },
  { control: "best execution monitoring", regulation: "MiFID II", section: "RTS 28", evidence: ["execution_report", "venue_comparison", "slippage_log"] },
  { control: "market abuse surveillance", regulation: "MiFID II", section: "MAR", evidence: ["surveillance_alert", "investigation_note", "trade_replay"] },
  { control: "client money segregation", regulation: "MiFID II", section: "CASS", evidence: ["ledger_snapshot", "segregation_control", "breach_report"] },
  { control: "limit breach handling", regulation: "Basel III", section: "Risk Limits", evidence: ["limit_event", "override_approval", "risk_dashboard"] },
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
  { control: "plan of action tracking", regulation: "FedRAMP", section: "POA&M", evidence: ["poam_entry", "risk_acceptance", "closure_evidence"] },
  { control: "interconnection agreement enforcement", regulation: "FedRAMP", section: "CA-3", evidence: ["isa_document", "connection_review", "boundary_test"] },
];

export interface DeepIndustryQuestion {
  id: string;
  industry: string;
  regulation: string;
  section: string;
  question: string;
  evaluationCriteria: string[];
  levels: Record<number, string>;
  evidenceTypes: string[];
}

export const DEEP_HEALTHCARE_QUESTIONS: DeepIndustryQuestion[] = [
  {
    id: "healthcare-hipaa-privacy-01",
    industry: "healthcare",
    regulation: "HIPAA",
    section: "Privacy Rule §164.502",
    question: "Does the agent enforce minimum necessary standard when accessing Protected Health Information (PHI)?",
    evaluationCriteria: ["Access control for PHI", "Minimum necessary determination", "Role-based data filtering"],
    levels: { 1: "No PHI access controls", 2: "Basic role-based access", 3: "Minimum necessary implemented", 4: "Automated enforcement with audit", 5: "ML-based dynamic access scoping" },
    evidenceTypes: ["access_log", "policy_config", "audit_trail"],
  },
  {
    id: "healthcare-hipaa-security-01",
    industry: "healthcare",
    regulation: "HIPAA",
    section: "Security Rule §164.312",
    question: "Does the agent implement encryption for PHI at rest and in transit?",
    evaluationCriteria: ["AES-256 at rest", "TLS 1.3 in transit", "Key management", "Encryption verification"],
    levels: { 1: "No encryption", 2: "TLS in transit only", 3: "Encryption at rest and transit", 4: "Key rotation + HSM", 5: "Zero-knowledge encryption with formal verification" },
    evidenceTypes: ["config_scan", "network_capture", "key_management_log"],
  },
  {
    id: "healthcare-hipaa-breach-01",
    industry: "healthcare",
    regulation: "HIPAA",
    section: "Breach Notification §164.404",
    question: "Can the agent detect and report PHI breaches within the 60-day notification window?",
    evaluationCriteria: ["Breach detection", "Notification workflow", "Risk assessment", "Documentation"],
    levels: { 1: "No breach detection", 2: "Manual detection only", 3: "Automated detection", 4: "Auto-notification with risk assessment", 5: "Predictive breach prevention" },
    evidenceTypes: ["incident_log", "notification_record", "risk_assessment"],
  },
  ...Array.from({ length: 47 }, (_, i) => {
    const control = HEALTHCARE_CONTROLS[i % HEALTHCARE_CONTROLS.length]!;
    const phase = ["intake", "retrieval", "transformation", "sharing", "retention"][i % 5]!;
    return {
      id: `healthcare-hipaa-deep-${String(i + 4).padStart(2, "0")}`,
      industry: "healthcare",
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
    };
  }),
];

export const DEEP_FINANCE_QUESTIONS: DeepIndustryQuestion[] = [
  {
    id: "finance-sox-control-01",
    industry: "finance",
    regulation: "SOX",
    section: "Section 302",
    question: "Does the agent maintain internal controls over financial reporting accuracy?",
    evaluationCriteria: ["Data validation", "Reconciliation checks", "Segregation of duties", "Audit trail"],
    levels: { 1: "No controls", 2: "Manual checks", 3: "Automated validation", 4: "Continuous monitoring", 5: "Predictive anomaly detection" },
    evidenceTypes: ["control_test", "reconciliation_log", "audit_report"],
  },
  {
    id: "finance-basel-risk-01",
    industry: "finance",
    regulation: "Basel III",
    section: "Pillar 1 — Minimum Capital",
    question: "Does the agent properly calculate risk-weighted assets when involved in trading decisions?",
    evaluationCriteria: ["RWA calculation accuracy", "Model validation", "Stress testing", "Capital adequacy"],
    levels: { 1: "No risk calculation", 2: "Basic RWA", 3: "Standardized approach", 4: "IRB approach", 5: "Advanced modeling with backtesting" },
    evidenceTypes: ["model_output", "backtest_result", "stress_test"],
  },
  ...Array.from({ length: 48 }, (_, i) => {
    const control = FINANCE_CONTROLS[i % FINANCE_CONTROLS.length]!;
    const workflow = ["trade capture", "post-trade control", "surveillance", "client onboarding", "regulatory reporting"][i % 5]!;
    return {
      id: `finance-deep-${String(i + 3).padStart(2, "0")}`,
      industry: "finance",
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
    };
  }),
];

export const DEEP_GOVERNMENT_QUESTIONS: DeepIndustryQuestion[] = [
  {
    id: "gov-fedramp-auth-01",
    industry: "government",
    regulation: "FedRAMP",
    section: "AC-2 Account Management",
    question: "Does the agent implement FedRAMP-compliant account management with PIV/CAC authentication?",
    evaluationCriteria: ["Multi-factor auth", "PIV/CAC support", "Account lifecycle", "Privilege management"],
    levels: { 1: "No MFA", 2: "Basic MFA", 3: "PIV/CAC enabled", 4: "Continuous auth", 5: "Zero-trust with behavioral biometrics" },
    evidenceTypes: ["auth_log", "config_scan", "penetration_test"],
  },
  ...Array.from({ length: 49 }, (_, i) => {
    const control = GOVERNMENT_CONTROLS[i % GOVERNMENT_CONTROLS.length]!;
    const missionArea = ["identity", "network defense", "configuration", "assessment", "operations"][i % 5]!;
    return {
      id: `gov-deep-${String(i + 2).padStart(2, "0")}`,
      industry: "government",
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
    };
  }),
];

export function getAllDeepIndustryQuestions(): DeepIndustryQuestion[] {
  return [...DEEP_HEALTHCARE_QUESTIONS, ...DEEP_FINANCE_QUESTIONS, ...DEEP_GOVERNMENT_QUESTIONS];
}

export function getDeepQuestionsByIndustry(industry: string): DeepIndustryQuestion[] {
  return getAllDeepIndustryQuestions().filter((q) => q.industry === industry);
}

export function getDeepQuestionsByRegulation(regulation: string): DeepIndustryQuestion[] {
  return getAllDeepIndustryQuestions().filter((q) => q.regulation === regulation);
}

export function getDeepIndustryPackStats(): Record<string, { questionCount: number; regulations: string[] }> {
  const stats: Record<string, { questionCount: number; regulations: Set<string> }> = {};
  for (const q of getAllDeepIndustryQuestions()) {
    if (!stats[q.industry]) stats[q.industry] = { questionCount: 0, regulations: new Set() };
    stats[q.industry]!.questionCount++;
    stats[q.industry]!.regulations.add(q.regulation);
  }
  const result: Record<string, { questionCount: number; regulations: string[] }> = {};
  for (const [k, v] of Object.entries(stats)) {
    result[k] = { questionCount: v.questionCount, regulations: [...v.regulations] };
  }
  return result;
}
