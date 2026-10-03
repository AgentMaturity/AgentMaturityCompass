import { SOURCES as S } from "./operatingProfileSources.js";
import { approval, clock, sourced, yearsToDays } from "./profileDataHelpers.js";
import type { StationOperatingProfileData } from "./operatingProfileTypes.js";

const CHOICE = "Numeric value is an AMC operating choice; the cited rule sets the duty, not the number.";

export const HEALTH_PROFILE: StationOperatingProfileData = {
  station: "health",
  toolAllowlist: {
    denyByDefault: sourced(true, S.cfr45_164_312, "164.312(a)(1): allow access only to persons or programs granted access rights, so tools are denied unless listed."),
    execTicketClasses: sourced(["WRITE_HIGH", "DEPLOY", "SECURITY", "DATA_EXPORT", "NETWORK_EXTERNAL"], S.cfr21_11_10, "11.10(d) limits system access to authorized individuals; an execution ticket binds each high-impact call to an authorized grant."),
    networkEgress: sourced("allowlist-only", S.cfr45_164_312, "164.312(e)(1) transmission security: PHI leaves the system only to listed hosts.")
  },
  firewall: {
    mode: sourced("block", S.cfr45_164_312, "164.312(e)(1): guard against unauthorized access to ePHI in transit; block, not warn, at the critical tier."),
    failClosedOnMissingPolicy: sourced(true, S.cfr45_164_308, "164.308(a)(6): identify and respond to security incidents; a missing policy is treated as an incident, not as permission."),
    rules: sourced({ piiLeakage: true, secretExposure: true, destructiveAction: true, promptInjection: true }, S.cfr45_164_312, "164.312(b) audit controls and (e)(1) transmission security cover the PII and secret rules; destructive-action blocking protects the records 164.316 requires.")
  },
  approvals: {
    WRITE_HIGH: sourced(approval(2, true, ["APPROVER", "OWNER"], 15), S.cfr45_164_312, "164.312(a)(1) access control: two distinct approvers for high-impact writes to systems holding ePHI."),
    DATA_EXPORT: sourced(approval(2, true, ["OWNER", "AUDITOR"], 10), S.cfr45_164_312, "164.312(e)(1): PHI export is a transmission; owner plus auditor sign-off, distinct users."),
    DEPLOY: sourced(approval(2, true, ["APPROVER", "OWNER"], 15), S.cfr21_11_10, "11.10(d)-(e): deployments change the system that produces audit trails; two distinct approvals."),
    SECURITY: sourced(approval(2, true, ["OWNER", "AUDITOR"], 10), S.cfr45_164_308, "164.308(a)(6) security incident procedures: security-class actions need owner and auditor."),
    FINANCIAL: sourced(approval(2, true, ["OWNER", "AUDITOR"], 10), S.amc_operating_choice, "No health-specific rule; inherits the AMC default of two distinct approvals for financial actions.")
  },
  budgets: {
    dailyMaxToolExecutes: {
      DATA_EXPORT: sourced(1, S.cfr45_164_312, `164.312(e)(1) transmission security motivates a one-per-day export ceiling. ${CHOICE}`),
      SECURITY: sourced(0, S.cfr45_164_308, `164.308(a)(6): no autonomous security-class executions. ${CHOICE}`),
      DEPLOY: sourced(1, S.cfr21_11_10, `11.10(d): deployments are rare, ticketed events. ${CHOICE}`),
      WRITE_HIGH: sourced(5, S.amc_operating_choice, `AMC default ceiling for high-impact writes. ${CHOICE}`)
    }
  },
  retention: {
    auditLogDays: sourced(yearsToDays(6), S.cfr45_164_316, "164.316(b)(2)(i): retain documentation 6 years from creation or last effective date."),
    payloadPruneDays: sourced(14, S.amc_operating_choice, `Raw payload bodies are pruned on the AMC default while the audit record is kept for the statutory window. ${CHOICE}`)
  },
  auditSampling: {
    ratePercent: sourced(10, S.cfr45_164_308, `164.308(a)(1)(ii)(D): regularly review records of information system activity. ${CHOICE}`),
    method: sourced("risk_weighted_random", S.cfr45_164_308, "Review weighted toward higher-risk actions satisfies 'regularly review' with a defensible sample."),
    cadence: sourced("weekly", S.cfr45_164_308, `164.308(a)(1)(ii)(D) says 'regularly'; weekly is the AMC choice. ${CHOICE}`)
  },
  humanOversight: {
    requiredReviewerRoles: sourced(["APPROVER", "OWNER"], S.eu_ai_act_art14, "Art. 14: natural persons able to oversee, understand and override the system (unverified primary text)."),
    requireDistinctReviewers: sourced(true, S.cfr45_164_312, "164.312(a)(1): distinct accountable identities for access decisions."),
    overridePath: sourced("Clinician review before any WRITE_HIGH effect; emergency override through the governor emergency-override path, logged to the ledger.", S.eu_ai_act_art14, "Art. 14(4): ability to intervene or interrupt (unverified primary text).")
  },
  incidentReportingClocks: [
    clock({ id: "hipaa-individual-notice", trigger: "Breach of unsecured PHI discovered", authority: "HHS (covered entity to individuals)", value: 60, unit: "calendar-days", source: S.cfr45_164_404, basis: "164.404(b): without unreasonable delay and in no case later than 60 calendar days after discovery." }),
    clock({ id: "hipaa-secretary-500", trigger: "Breach affecting 500 or more individuals", authority: "HHS Secretary", value: 60, unit: "calendar-days", source: S.cfr45_164_408, basis: "164.408(b): contemporaneously with the 164.404 notice, which itself is capped at 60 calendar days." }),
    clock({ id: "fda-mdr-30", trigger: "Device may have caused or contributed to death, serious injury, or malfunctioned", authority: "FDA (manufacturer MDR)", value: 30, unit: "calendar-days", source: S.cfr21_803_50, basis: "803.50(a): no later than 30 calendar days after becoming aware." }),
    clock({ id: "fda-mdr-5day", trigger: "MDR event requiring remedial action to prevent unreasonable risk", authority: "FDA (manufacturer 5-day report)", value: 5, unit: "working-days", source: S.cfr21_803_53, basis: "803.53: no later than 5 work days." }),
    clock({ id: "ind-safety-15", trigger: "Serious and unexpected suspected adverse reaction in a clinical investigation", authority: "FDA (IND sponsor)", value: 15, unit: "calendar-days", source: S.cfr21_312_32, basis: "312.32(c)(1): no later than 15 calendar days." }),
    clock({ id: "ind-fatal-7", trigger: "Unexpected fatal or life-threatening suspected adverse reaction", authority: "FDA (IND sponsor)", value: 7, unit: "calendar-days", source: S.cfr21_312_32, basis: "312.32(c)(2): no later than 7 calendar days." }),
    clock({ id: "eu-ai-act-serious-incident", trigger: "Serious incident of a high-risk AI system (EU deployment)", authority: "Market surveillance authority", value: 15, unit: "days", source: S.eu_ai_act_art73, basis: "Art. 73 serious-incident report deadline (unverified primary text; europa.eu page confirms the duty only)." })
  ]
};

export const EDUCATION_PROFILE: StationOperatingProfileData = {
  station: "education",
  toolAllowlist: {
    denyByDefault: sourced(true, S.cfr34_99_32, "99.32 requires a record of each disclosure; an unlisted tool cannot be recorded, so it is denied."),
    execTicketClasses: sourced(["WRITE_HIGH", "DATA_EXPORT", "IDENTITY"], S.cfr16_312_5, "312.5(a)(1): collection, use or disclosure of a child's data needs verifiable consent; tickets bind those calls to a consent record."),
    networkEgress: sourced("allowlist-only", S.cfr16_312_10, "312.10 retention limits are unenforceable if data can leave to arbitrary hosts.")
  },
  firewall: {
    mode: sourced("block", S.cfr16_312_5, "312.5: disclosure without consent is a violation, so PII egress is blocked rather than warned."),
    failClosedOnMissingPolicy: sourced(true, S.cfr34_99_32, "No disclosure record possible without a policy; fail closed."),
    rules: sourced({ piiLeakage: true, secretExposure: true, promptInjection: true }, S.cfr16_312_5, "PII leakage rule enforces the consent boundary; injection rule protects the educator override.")
  },
  approvals: {
    WRITE_HIGH: sourced(approval(2, true, ["APPROVER", "OWNER"], 15), S.ec_ai_act_page, "Education systems affecting access or outcomes are listed as high-risk on the Commission page; two distinct approvals."),
    DATA_EXPORT: sourced(approval(2, true, ["OWNER", "AUDITOR"], 10), S.cfr34_99_32, "99.32(a)(1): each disclosure is recorded; owner plus auditor approve exports."),
    IDENTITY: sourced(approval(2, true, ["OWNER", "AUDITOR"], 10), S.cfr16_312_5, "312.5: identity-class actions on minors' data need consent-bearing approvals."),
    DEPLOY: sourced(approval(2, true, ["APPROVER", "OWNER"], 15), S.amc_operating_choice, "AMC default for deployments; no education-specific deployment rule.")
  },
  budgets: {
    dailyMaxToolExecutes: {
      DATA_EXPORT: sourced(2, S.cfr34_99_32, `Disclosures are recorded events; a low daily ceiling keeps the record reviewable. ${CHOICE}`),
      IDENTITY: sourced(1, S.cfr16_312_5, `Identity actions on minors' data are exceptional. ${CHOICE}`),
      SECURITY: sourced(0, S.amc_operating_choice, `No autonomous security-class executions. ${CHOICE}`)
    }
  },
  retention: {
    auditLogDays: sourced(3650, S.cfr34_99_32, `99.32(a)(2): the disclosure record is kept as long as the education records are maintained; 3650 days is the AMC default archive window standing in for that lifetime. ${CHOICE}`),
    payloadPruneDays: sourced(14, S.cfr16_312_10, "312.10: retain a child's personal information only as long as reasonably necessary; raw payloads are pruned on the AMC default.")
  },
  auditSampling: {
    ratePercent: sourced(5, S.cfr34_99_32, `Sampled review of the disclosure record. ${CHOICE}`),
    method: sourced("stratified", S.cfr34_99_32, "Stratify by disclosure type so every category of disclosure is reviewed."),
    cadence: sourced("monthly", S.amc_operating_choice, `Monthly review cadence. ${CHOICE}`)
  },
  humanOversight: {
    requiredReviewerRoles: sourced(["APPROVER", "OWNER"], S.ec_ai_act_page, "Commission page: providers must implement appropriate human oversight measures for high-risk systems."),
    requireDistinctReviewers: sourced(true, S.cfr34_99_32, "Distinct identities so the disclosure record names an accountable reviewer."),
    overridePath: sourced("Educator override on every learner-affecting decision; parental consent gate for under-13 data before any IDENTITY or DATA_EXPORT action.", S.cfr16_312_5, "312.5(a)(1) verifiable parental consent.")
  },
  incidentReportingClocks: [
    clock({ id: "state-breach-ca-30", trigger: "Breach of personal information (California-resident data)", authority: "California (Civ. Code 1798.82)", value: 30, unit: "calendar-days", source: S.cal_civ_1798_82, basis: "1798.82(a) as published: within 30 calendar days of discovery; FERPA and COPPA set no federal breach clock." }),
    clock({ id: "uk-gdpr-72h", trigger: "Personal data breach likely to risk individuals' rights (UK)", authority: "ICO", value: 72, unit: "hours", source: S.ico_breach_72h, basis: "ICO: notify where feasible within 72 hours." }),
    clock({ id: "eu-gdpr-art33-72h", trigger: "Personal data breach (EU)", authority: "Supervisory authority", value: 72, unit: "hours", source: S.gdpr_art33, basis: "Art. 33(1) 72 hours (unverified primary text; ICO figure read)." }),
    clock({ id: "eu-ai-act-serious-incident", trigger: "Serious incident of a high-risk AI system (EU deployment)", authority: "Market surveillance authority", value: 15, unit: "days", source: S.eu_ai_act_art73, basis: "Art. 73 (unverified primary text)." })
  ]
};

export const ENVIRONMENT_PROFILE: StationOperatingProfileData = {
  station: "environment",
  toolAllowlist: {
    denyByDefault: sourced(true, S.nerc_cip_008_6, "R4 requires every Cyber Security Incident to be determinable and notifiable; unlisted tools cannot be classified, so they are denied."),
    execTicketClasses: sourced(["WRITE_HIGH", "DEPLOY", "SECURITY", "NETWORK_EXTERNAL"], S.nist_sp800_53r5, "SP 800-53 access-control family (catalog text not read): ticketed, attributable high-impact actions."),
    networkEgress: sourced("deny-by-default", S.nerc_cip_008_6, "Bulk electric system cyber systems: egress only to listed hosts, so an attempt to compromise is detectable per R1 Part 1.2.")
  },
  firewall: {
    mode: sourced("block", S.nerc_cip_008_6, "Critical-infrastructure tier blocks destructive and injected actions rather than warning."),
    failClosedOnMissingPolicy: sourced(true, S.nerc_cip_008_6, "A missing policy would make incident determination impossible; fail closed."),
    rules: sourced({ destructiveAction: true, promptInjection: true, secretExposure: true, payloadAnomaly: true }, S.nerc_cip_008_6, "Destructive-action and anomaly rules give the determination evidence R4 Part 4.1 asks for (functional impact, attack vector, intrusion level).")
  },
  approvals: {
    WRITE_HIGH: sourced(approval(2, true, ["APPROVER", "OWNER"], 15), S.nist_sp800_53r5, "Two-person control for high-impact writes (separation of duties; catalog text not read)."),
    DEPLOY: sourced(approval(2, true, ["APPROVER", "OWNER"], 15), S.nerc_cip_008_6, "Deployments change responder technology; R3 Part 3.2 requires plan updates within 60 days of such changes, so deploys are approved by two distinct users."),
    SECURITY: sourced(approval(2, true, ["OWNER", "AUDITOR"], 10), S.nerc_cip_008_6, "Security-class actions are incident-response actions; owner plus auditor."),
    NETWORK_EXTERNAL: sourced(approval(2, true, ["APPROVER", "OWNER"], 15), S.nerc_cip_013, "Supply-chain risk management for external connections (unverified; CIP-013-2 not fetched).")
  },
  budgets: {
    dailyMaxToolExecutes: {
      SECURITY: sourced(0, S.nerc_cip_008_6, `No autonomous security-class executions on BES cyber systems. ${CHOICE}`),
      DEPLOY: sourced(1, S.nerc_cip_008_6, `One ticketed deployment per day. ${CHOICE}`),
      WRITE_HIGH: sourced(5, S.amc_operating_choice, `AMC default ceiling. ${CHOICE}`),
      NETWORK_EXTERNAL: sourced(10, S.nerc_cip_013, `Bounded external calls (unverified source). ${CHOICE}`)
    }
  },
  retention: {
    auditLogDays: sourced(yearsToDays(3), S.nerc_cip_evidence_retention, "CIP-008-6 compliance-section evidence retention (unverified: section not read); 3 years is the figure to confirm."),
    payloadPruneDays: sourced(14, S.amc_operating_choice, `AMC default payload prune window. ${CHOICE}`)
  },
  auditSampling: {
    ratePercent: sourced(10, S.nerc_cip_008_6, `M4 requires dated evidence of notification for each determined incident; sampled review of all actions supports it. ${CHOICE}`),
    method: sourced("targeted", S.nerc_cip_008_6, "Target actions touching applicable systems (High and Medium Impact BES Cyber Systems and EACMS)."),
    cadence: sourced("weekly", S.amc_operating_choice, `Weekly cadence. ${CHOICE}`)
  },
  humanOversight: {
    requiredReviewerRoles: sourced(["APPROVER", "OWNER"], S.eu_ai_act_art14, "Art. 14 human oversight for Annex III critical-infrastructure systems (unverified primary text; europa.eu page lists critical infrastructure as high-risk)."),
    requireDistinctReviewers: sourced(true, S.nist_sp800_53r5, "Two distinct humans for physical-world effects (catalog text not read)."),
    overridePath: sourced("Hardware emergency stop and degrade-to-safe mode take precedence over any agent action; two-person authorization for physical actuation.", S.eu_ai_act_art14, "Art. 14(4) intervene or interrupt (unverified primary text).")
  },
  incidentReportingClocks: [
    clock({ id: "nerc-cip-008-1h", trigger: "Reportable Cyber Security Incident determined", authority: "E-ISAC and CISA (NCCIC successor)", value: 1, unit: "hours", source: S.nerc_cip_008_6, basis: "R4 Part 4.2: one hour after the determination." }),
    clock({ id: "nerc-cip-008-attempt", trigger: "Cyber Security Incident that was an attempt to compromise an applicable system", authority: "E-ISAC and CISA", value: 1, unit: "days", source: S.nerc_cip_008_6, basis: "R4 Part 4.2: by the end of the next calendar day after determination." }),
    clock({ id: "nerc-cip-008-update", trigger: "New or changed attribute information for a reported incident", authority: "E-ISAC and CISA", value: 7, unit: "calendar-days", source: S.nerc_cip_008_6, basis: "R4 Part 4.3: updates within 7 calendar days." }),
    clock({ id: "cisa-federal-1h", trigger: "Incident on a federal civilian system", authority: "CISA", value: 1, unit: "hours", source: S.cisa_incident_1h, basis: "Within one hour of identification by the agency CSIRT/SOC (FISMA)." }),
    clock({ id: "nis2-early-warning-24h", trigger: "Significant incident (EU essential/important entity)", authority: "National CSIRT/competent authority", value: 24, unit: "hours", source: S.nis2_art23, basis: "Art. 23(4)(a) early warning 24 hours (unverified primary text)." }),
    clock({ id: "nis2-notification-72h", trigger: "Significant incident (EU essential/important entity)", authority: "National CSIRT/competent authority", value: 72, unit: "hours", source: S.nis2_art23, basis: "Art. 23(4)(b) incident notification 72 hours (unverified primary text)." })
  ]
};

export const MOBILITY_PROFILE: StationOperatingProfileData = {
  station: "mobility",
  toolAllowlist: {
    denyByDefault: sourced(true, S.iso_26262, "Functional-safety lifecycle: only qualified tools act on safety-related items (unverified; iso.org not readable)."),
    execTicketClasses: sourced(["WRITE_HIGH", "DEPLOY", "SECURITY"], S.unece_r155, "CSMS: software changes and security actions are controlled, ticketed events (unverified; unece.org not readable)."),
    networkEgress: sourced("allowlist-only", S.unece_r155, "Vehicle-facing agents reach only listed back-ends (unverified).")
  },
  firewall: {
    mode: sourced("block", S.cfr49_573_6, "Safety-related defects trigger a 5-working-day report; blocking destructive actions prevents creating them."),
    failClosedOnMissingPolicy: sourced(true, S.iso_26262, "Fail-safe default for safety-critical operation (unverified source)."),
    rules: sourced({ destructiveAction: true, promptInjection: true, secretExposure: true, payloadAnomaly: true }, S.unece_r155, "Injection and anomaly rules address the CSMS threat catalogue (unverified).")
  },
  approvals: {
    WRITE_HIGH: sourced(approval(2, true, ["APPROVER", "OWNER"], 15), S.iso_26262, "Two distinct approvers for changes to safety-related behaviour (unverified source)."),
    DEPLOY: sourced(approval(2, true, ["APPROVER", "OWNER"], 15), S.unece_r155, "OTA/software updates go through a managed, approved process (R156 SUMS; unverified)."),
    SECURITY: sourced(approval(2, true, ["OWNER", "AUDITOR"], 10), S.unece_r155, "CSMS security actions: owner plus auditor (unverified).")
  },
  budgets: {
    dailyMaxToolExecutes: {
      DEPLOY: sourced(1, S.unece_r155, `One managed software update per day (unverified source). ${CHOICE}`),
      SECURITY: sourced(0, S.amc_operating_choice, `No autonomous security-class executions. ${CHOICE}`),
      WRITE_HIGH: sourced(5, S.amc_operating_choice, `AMC default ceiling. ${CHOICE}`)
    }
  },
  retention: {
    auditLogDays: sourced(yearsToDays(5), S.cfr49_576, "49 CFR Part 576 manufacturer record retention (unverified: not fetched); 5 years is the figure to confirm."),
    payloadPruneDays: sourced(14, S.amc_operating_choice, `AMC default payload prune window. ${CHOICE}`)
  },
  auditSampling: {
    ratePercent: sourced(10, S.cfr49_573_6, `Sampled review supports the 5-working-day defect determination clock. ${CHOICE}`),
    method: sourced("risk_weighted_random", S.iso_26262, "Weight by ASIL of the affected function (unverified source)."),
    cadence: sourced("weekly", S.amc_operating_choice, `Weekly cadence. ${CHOICE}`)
  },
  humanOversight: {
    requiredReviewerRoles: sourced(["APPROVER", "OWNER"], S.eu_ai_act_art14, "Art. 14 human oversight (unverified primary text)."),
    requireDistinctReviewers: sourced(true, S.iso_26262, "Independent confirmation review (unverified source)."),
    overridePath: sourced("Driver or operator manual control overrides the agent immediately; minimal-risk fallback is the default degraded state.", S.eu_ai_act_art14, "Art. 14(4) intervene or interrupt (unverified primary text).")
  },
  incidentReportingClocks: [
    clock({ id: "nhtsa-573-5wd", trigger: "Safety-related defect or noncompliance determined", authority: "NHTSA", value: 5, unit: "working-days", source: S.cfr49_573_6, basis: "573.6(b): not more than 5 working days after determination." }),
    clock({ id: "nhtsa-sgo-incident", trigger: "ADS/Level 2 crash with fatality, hospital treatment, or vulnerable road user", authority: "NHTSA (Standing General Order)", value: 1, unit: "days", source: S.nhtsa_sgo, basis: "SGO incident report deadline (unverified: nhtsa.gov 403)." }),
    clock({ id: "eu-ai-act-serious-incident", trigger: "Serious incident of a high-risk AI system (EU deployment)", authority: "Market surveillance authority", value: 15, unit: "days", source: S.eu_ai_act_art73, basis: "Art. 73 (unverified primary text)." })
  ]
};
