/**
 * Deep questions. Governance station: FedRAMP/FISMA (NIST SP 800-53 controls).
 * Moved verbatim from deepIndustryPacks.ts. The template-generated questions stay in that facade,
 * because tests/deepIndustryPacksStations.test.ts keeps src/domains/deep/ hand-written.
 */

import { source, type DeepIndustryQuestion } from "./shared.js";

/** FedRAMP/FISMA: the governance packs that run public-sector systems, plus virtual-infrastructure, whose basis names FedRAMP Rev. 5. */
export const FEDERAL_SYSTEM_PACKS = ["citizen-services", "petition-to-law", "digital-citizens-rights", "public-private-collaboration", "virtual-infrastructure"];

export const NIST_800_53 = source("NIST SP 800-53 Rev. 5, Security and Privacy Controls for Information Systems and Organizations", "https://csrc.nist.gov/pubs/sp/800/53/r5/upd1/final",
  "Publication and control families confirmed; individual control identifiers were not fetched from the NIST control catalog.");

export const GOVERNMENT_CONTROLS = [
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

/** Hand-written governance questions; the facade appends the template-generated ones. */
export const GOVERNMENT_HAND_WRITTEN: DeepIndustryQuestion[] = [
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
];
