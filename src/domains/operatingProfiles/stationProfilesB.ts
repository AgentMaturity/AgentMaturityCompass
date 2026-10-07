import { SOURCES as S } from "./operatingProfileSources.js";
import { approval, clock, sourced, yearsToDays } from "./profileDataHelpers.js";
import type { StationOperatingProfileData } from "./operatingProfileTypes.js";

const CHOICE = "Numeric value is an AMC operating choice; the cited rule sets the duty, not the number.";
const D08 = "Flagged for expert review (D-08).";

export const GOVERNANCE_PROFILE: StationOperatingProfileData = {
  station: "governance",
  toolAllowlist: {
    denyByDefault: sourced(true, S.omb_m25_21, "M-25-21 (pages 1-4 read): agencies must keep an AI use case inventory and apply minimum risk practices to high-impact AI; unlisted tools fall outside the inventory and are denied."),
    execTicketClasses: sourced(["WRITE_HIGH", "DATA_EXPORT", "IDENTITY"], S.omb_m25_21, "Consequential decisions about the public need accountable, delegated risk acceptance; tickets carry that delegation."),
    networkEgress: sourced("allowlist-only", S.cisa_incident_1h, "Egress only to listed hosts keeps federal incident identification tractable within the one-hour clock.")
  },
  firewall: {
    mode: sourced("block", S.omb_m25_21, "M-25-21: when high-impact AI is not performing appropriately agencies must discontinue its use; blocking is the enforced form of that rule."),
    failClosedOnMissingPolicy: sourced(true, S.omb_m25_21, "If proper risk mitigation is not possible, agencies must cease the use of the AI."),
    rules: sourced({ piiLeakage: true, promptInjection: true, secretExposure: true, destructiveAction: true }, S.nist_ai_rmf, "Manage function: mitigation and monitoring of mapped risks; the rule set is the runtime form.")
  },
  approvals: {
    WRITE_HIGH: sourced(approval(2, true, ["APPROVER", "OWNER"], 15), S.omb_m25_21, "Two distinct accountable officials for actions with consequential public impact."),
    DATA_EXPORT: sourced(approval(2, true, ["OWNER", "AUDITOR"], 10), S.omb_m25_21, "Safeguards for privacy and civil liberties: exports approved by owner and auditor."),
    IDENTITY: sourced(approval(2, true, ["OWNER", "AUDITOR"], 10), S.ec_ai_act_page, "Biometric identification is listed as high-risk on the Commission page; identity actions need two distinct approvals."),
    DEPLOY: sourced(approval(2, true, ["APPROVER", "OWNER"], 15), S.amc_operating_choice, "AMC default for deployments.")
  },
  budgets: {
    dailyMaxToolExecutes: {
      DATA_EXPORT: sourced(2, S.omb_m25_21, `Bounded exports keep the inventory and audit reviewable. ${CHOICE}`),
      IDENTITY: sourced(1, S.ec_ai_act_page, `Identity actions are exceptional. ${CHOICE}`),
      SECURITY: sourced(0, S.amc_operating_choice, `No autonomous security-class executions. ${CHOICE}`)
    }
  },
  retention: {
    auditLogDays: sourced(yearsToDays(3), S.nist_sp800_53r5, `SP 800-53 audit record retention (AU family; catalog text not read). 3 years is the AMC choice pending the agency's records schedule. ${CHOICE}`),
    payloadPruneDays: sourced(14, S.amc_operating_choice, `AMC default payload prune window. ${CHOICE}`)
  },
  auditSampling: {
    ratePercent: sourced(10, S.nist_ai_rmf, `Measure function: tests, evaluations and monitoring of deployed systems. ${CHOICE}`),
    method: sourced("stratified", S.nist_ai_rmf, "Stratify by decision type so each public-facing decision class is measured."),
    cadence: sourced("monthly", S.omb_m25_21, `Agencies continue annual inventory reporting; monthly sampling feeds it. ${CHOICE}`)
  },
  humanOversight: {
    requiredReviewerRoles: sourced(["APPROVER", "OWNER"], S.omb_m25_21, "Accountability for risk acceptance is delegated to appropriate officials, not to the system."),
    requireDistinctReviewers: sourced(true, S.omb_m25_21, "Distinct accountable officials."),
    overridePath: sourced("Affected persons can contest and appeal; the agency has a plan to discontinue the AI when it is not performing at an appropriate level.", S.omb_m25_21, "M-25-21 page 3: plan to discontinue use until compliance is achieved.")
  },
  incidentReportingClocks: [
    clock({ id: "cisa-federal-1h", trigger: "Information security incident on a federal civilian system", authority: "CISA", value: 1, unit: "hours", source: S.cisa_incident_1h, basis: "Within one hour of identification by the agency CSIRT/SOC (FISMA)." }),
    clock({ id: "eu-ai-act-serious-incident", trigger: "Serious incident of a high-risk AI system (EU public-sector deployment)", authority: "Market surveillance authority", value: 15, unit: "days", source: S.eu_ai_act_art73, basis: "Art. 73 (unverified primary text)." }),
    clock({ id: "eu-gdpr-art33-72h", trigger: "Personal data breach (EU)", authority: "Supervisory authority", value: 72, unit: "hours", source: S.gdpr_art33, basis: "Art. 33(1) 72 hours (unverified primary text; ICO figure read)." })
  ]
};

export const TECHNOLOGY_PROFILE: StationOperatingProfileData = {
  station: "technology",
  toolAllowlist: {
    denyByDefault: sourced(true, S.nist_ssdf, "SSDF: only verified components and tools enter the development and runtime path."),
    execTicketClasses: sourced(["DEPLOY", "SECURITY", "DATA_EXPORT"], S.cisa_eo14028, "EO 14028 baseline software security standards: deployments and supply-chain actions are controlled events."),
    networkEgress: sourced("allowlist-only", S.gdpr_art33, "Data minimisation and breach containment (unverified primary text; ICO read for the breach clock).")
  },
  firewall: {
    mode: sourced("warn", S.amc_operating_choice, "High (not critical) tier: warn on matches, block only above the block threshold; GDPR sets no runtime blocking duty."),
    failClosedOnMissingPolicy: sourced(true, S.nist_csf_2, "CSF 2.0: a missing policy is a governance gap, not an allowance."),
    rules: sourced({ piiLeakage: true, secretExposure: true, promptInjection: true }, S.gdpr_art33, "PII and secret rules contain breaches that would start the 72-hour clock (unverified primary text).")
  },
  approvals: {
    WRITE_HIGH: sourced(approval(1, false, ["APPROVER", "OWNER"], 60), S.amc_operating_choice, "High tier: one approval for high-impact writes."),
    DEPLOY: sourced(approval(2, true, ["APPROVER", "OWNER"], 15), S.nist_ssdf, "SSDF release practices: two distinct approvals before deployment."),
    DATA_EXPORT: sourced(approval(2, true, ["OWNER", "AUDITOR"], 10), S.gdpr_art33, "Exports are the breach surface; owner plus auditor (unverified primary text)."),
    SECURITY: sourced(approval(2, true, ["OWNER", "AUDITOR"], 10), S.cisa_eo14028, "Security-class actions: owner plus auditor.")
  },
  budgets: {
    dailyMaxToolExecutes: {
      DEPLOY: sourced(2, S.nist_ssdf, `Bounded daily deployments. ${CHOICE}`),
      DATA_EXPORT: sourced(2, S.gdpr_art33, `Bounded exports (unverified primary text). ${CHOICE}`),
      SECURITY: sourced(0, S.amc_operating_choice, `No autonomous security-class executions. ${CHOICE}`)
    }
  },
  retention: {
    auditLogDays: sourced(yearsToDays(1), S.amc_operating_choice, `One year of audit log; SOC 2 and ISO 27001 set no fixed figure and were not read. ${CHOICE}`),
    payloadPruneDays: sourced(14, S.gdpr_art33, "Storage limitation, Art. 5(1)(e) (unverified primary text): raw payloads pruned on the AMC default.")
  },
  auditSampling: {
    ratePercent: sourced(5, S.nist_csf_2, `Sampled review of agent actions. ${CHOICE}`),
    method: sourced("random", S.nist_csf_2, "Uniform random sample for a general-purpose service."),
    cadence: sourced("monthly", S.amc_operating_choice, `Monthly cadence. ${CHOICE}`)
  },
  humanOversight: {
    requiredReviewerRoles: sourced(["APPROVER", "OWNER"], S.gdpr_art33, "Art. 22(3) right to obtain human intervention (unverified primary text)."),
    requireDistinctReviewers: sourced(false, S.amc_operating_choice, "High tier: a single accountable reviewer suffices."),
    overridePath: sourced("Users can request human intervention on automated decisions; operators can halt the agent from the console.", S.gdpr_art33, "Art. 22(3) (unverified primary text).")
  },
  incidentReportingClocks: [
    clock({ id: "uk-gdpr-72h", trigger: "Personal data breach likely to risk individuals' rights (UK)", authority: "ICO", value: 72, unit: "hours", source: S.ico_breach_72h, basis: "ICO: notify where feasible within 72 hours." }),
    clock({ id: "eu-gdpr-art33-72h", trigger: "Personal data breach (EU)", authority: "Supervisory authority", value: 72, unit: "hours", source: S.gdpr_art33, basis: "Art. 33(1) 72 hours (unverified primary text)." }),
    clock({ id: "state-breach-ca-30", trigger: "Breach of personal information (California-resident data)", authority: "California (Civ. Code 1798.82)", value: 30, unit: "calendar-days", source: S.cal_civ_1798_82, basis: "1798.82(a) as published: within 30 calendar days." })
  ]
};

export const WEALTH_PROFILE: StationOperatingProfileData = {
  station: "wealth",
  toolAllowlist: {
    denyByDefault: sourced(true, S.cfr17_240_17a4, "Every business communication and order record must be preserved; an unlisted tool produces no preservable record, so it is denied."),
    execTicketClasses: sourced(["FINANCIAL", "WRITE_HIGH", "DATA_EXPORT"], S.sox_302_404, "Internal control over financial reporting (unverified: not fetched); tickets attribute each financial action."),
    networkEgress: sourced("allowlist-only", S.cfr12_53_3, "Containing a notification incident within 36 hours requires a known set of counterparties.")
  },
  firewall: {
    mode: sourced("block", S.cfr31_1020_320, "Suspicious transactions must be detected and reported; blocking destructive or injected financial actions is the runtime control."),
    failClosedOnMissingPolicy: sourced(true, S.cfr12_53_3, "Fail closed so a missing policy cannot become a notification incident."),
    rules: sourced({ piiLeakage: true, secretExposure: true, promptInjection: true, destructiveAction: true }, S.cfr17_240_17a4, "Records integrity and customer data protection.")
  },
  approvals: {
    FINANCIAL: sourced(approval(2, true, ["OWNER", "AUDITOR"], 10), S.amc_operating_choice, `Owner and auditor approve every agent-initiated financial action. SR 26-2 covers the models the agent calls, not the agent, so it sets no approval count here. ${D08}`),
    WRITE_HIGH: sourced(approval(2, true, ["APPROVER", "OWNER"], 15), S.sox_302_404, "Segregation of duties for changes affecting financial records (unverified: not fetched)."),
    DATA_EXPORT: sourced(approval(2, true, ["OWNER", "AUDITOR"], 10), S.sec_reg_sp_248_30, "Customer-information safeguards (unverified: not fetched)."),
    DEPLOY: sourced(approval(2, true, ["APPROVER", "OWNER"], 15), S.amc_operating_choice, `AMC default for deployments. When a deployment changes a traditional model the agent calls, SR 26-2 section V validation applies to that model separately. ${D08}`)
  },
  budgets: {
    dailyMaxToolExecutes: {
      FINANCIAL: sourced(0, S.amc_operating_choice, `No autonomous financial executions; every one is approved. ${D08} ${CHOICE}`),
      DATA_EXPORT: sourced(1, S.sec_reg_sp_248_30, `One ticketed export per day (unverified source). ${CHOICE}`),
      SECURITY: sourced(0, S.amc_operating_choice, `No autonomous security-class executions. ${CHOICE}`),
      WRITE_HIGH: sourced(5, S.amc_operating_choice, `AMC default ceiling. ${CHOICE}`)
    }
  },
  retention: {
    auditLogDays: sourced(yearsToDays(6), S.cfr17_240_17a4, "240.17a-4(a): preserve for not less than 6 years, the first two in an easily accessible place."),
    payloadPruneDays: sourced(730, S.cfr17_240_17a4, "240.17a-4(a)-(b): first two years in an easily accessible place; raw payloads stay unpruned for 730 days.")
  },
  auditSampling: {
    ratePercent: sourced(10, S.cfr31_1020_320, `Suspicious-activity monitoring supports the 30-day SAR clock. ${CHOICE}`),
    method: sourced("risk_weighted_random", S.frb_sr_26_2, `Weight the sample toward decisions that rest on the traditional or non-generative models the agent calls, whose validation and monitoring SR 26-2 section V covers; the agent itself is outside SR 26-2 (footnote 3). ${D08}`),
    cadence: sourced("weekly", S.amc_operating_choice, `Weekly cadence. ${CHOICE}`)
  },
  humanOversight: {
    requiredReviewerRoles: sourced(["APPROVER", "OWNER"], S.amc_operating_choice, `Approver and owner review the agent's consequential actions. SR 26-2 effective challenge applies to the models the agent calls, not to the agent. ${D08}`),
    requireDistinctReviewers: sourced(true, S.sox_302_404, "Segregation of duties (unverified: not fetched)."),
    overridePath: sourced("Kill switch halts trading or payment actions; suitability and fiduciary review precede any FINANCIAL execution.", S.amc_operating_choice, `No source read sets an override path for an agent; this is an AMC operating choice. ${D08}`)
  },
  incidentReportingClocks: [
    clock({ id: "occ-53-36h", trigger: "Notification incident at a banking organization", authority: "OCC", value: 36, unit: "hours", source: S.cfr12_53_3, basis: "53.3: as soon as possible and no later than 36 hours." }),
    clock({ id: "fincen-sar-30", trigger: "Suspicious transaction detected", authority: "FinCEN (bank SAR)", value: 30, unit: "calendar-days", source: S.cfr31_1020_320, basis: "1020.320(b)(3): no later than 30 calendar days after initial detection; never beyond 60." }),
    clock({ id: "finra-4530-30", trigger: "Reportable event or internal conclusion of a violation", authority: "FINRA", value: 30, unit: "calendar-days", source: S.finra_4530, basis: "Rule 4530(a)(1), (b): not later than 30 calendar days." }),
    clock({ id: "reg-sp-customer-notice-30", trigger: "Unauthorized access to sensitive customer information", authority: "SEC (Regulation S-P)", value: 30, unit: "days", source: S.sec_reg_sp_248_30, basis: "248.30(a)(4) notice not later than 30 days (unverified: not fetched)." })
  ]
};
