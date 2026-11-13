/** Per-question detail for the professional-practice pack, keyed by question id (see IndustryPackQuestionDetail). */
import type { PackQuestionDetail } from "../../industryPacks.js";

export const professionalPracticeDetail: PackQuestionDetail = {
  "HLT-PP-1": {
    l2: "Authorization forms are scanned into the record, but the agent does not check them before a disclosure",
    l4: "Validation, revocation and compound-authorization rules are enforced, but psychotherapy-note protections or expiration are handled manually",
    evidence: ["hipaa_authorization_register", "disclosure_authorization_check_log", "authorization_revocation_log"],
    remediation:
      "Before the agent releases PHI for any purpose outside treatment, payment and operations, check for a valid, unrevoked, unexpired authorization " +
      "matching the recipient and purpose, and block the release otherwise.",
    failureMode: "The agent fulfils a life insurer's records request using an authorization the patient revoked last month.",
    keyRisk: 2,
  },
  "HLT-PP-2": {
    l2: "Coding suggestions appear, but documentation gaps are not flagged to anyone",
    l4: "Accuracy validation and coder-physician queries run, but documentation quality metrics are not tracked",
    evidence: ["coding_suggestion_vs_documentation_audit", "coder_physician_query_log", "documentation_accuracy_metrics"],
    remediation:
      "Require each code the agent suggests to cite the note text that supports it, and route codes without support to a coder-physician query instead of " +
      "the claim.",
    failureMode: "The agent suggests a code for a complication that appears in the problem list but not in the encounter note, and the claim goes out with it.",
    keyRisk: 0,
  },
  "HLT-PP-3": {
    l2: "Reads use the standardized API, but the agent falls back to screen scraping when the API lacks a field",
    l4: "All access uses documented interfaces and is logged with purpose, but the interface inventory is not reviewed on release",
    evidence: ["ehr_interface_inventory", "agent_ehr_access_log_with_purpose", "undocumented_access_detection_report"],
    remediation:
      "Restrict the agent's EHR tools to an allowlist of documented interfaces, remove its database and UI-automation credentials, and log agent identity, " +
      "user, purpose and scope for each call.",
    failureMode: "The agent writes to the EHR through UI automation when an API call fails, bypassing access controls and leaving no API audit record.",
    keyRisk: 2,
  },
  "HLT-PP-4": {
    l2: "Claims are scrubbed for payer edits, but AI-suggested codes and referrals go out without human review",
    l4: "Every suggestion is approved by an accountable human and patterns are monitored, but exclusion-list screening is not evidenced",
    evidence: ["claim_human_review_signoff", "referral_pattern_monitoring_report", "exclusion_list_screening_log"],
    remediation:
      "Add a hold state so no AI-suggested code or referral leaves the practice until a named reviewer approves it, and monitor referral destinations " +
      "against documented thresholds.",
    failureMode:
      "The agent steers referrals toward an imaging centre the practice has a financial arrangement with, and the referrals go out with no human review.",
    keyRisk: 4,
  },
  "HLT-PP-5": {
    l2: "Spell-check and terminology lists run, but transcripts reach the chart without a clinical context check",
    l4: "Context verification and critical-finding flags run, but medication and dosage verification or quality metrics are missing",
    evidence: ["transcription_error_rate_by_category", "critical_finding_flag_log", "dosage_verification_mismatch_report"],
    remediation:
      "Cross-check every medication and dose in an AI transcript against the medication list and active orders, and hold mismatches for clinician review " +
      "before signing.",
    failureMode: "The agent transcribes fifteen milligrams as fifty milligrams in a dictated note and the error is signed into the record.",
    keyRisk: 1,
  },
  "HLT-PP-6": {
    l2: "Alert counts exist in system logs, but nobody reports them",
    l4: "Burden metrics are reported against a baseline, but high-override alerts are not reviewed and tuned",
    evidence: ["interruptive_alerts_per_encounter_report", "alert_override_rate_report", "after_hours_documentation_time_baseline"],
    remediation:
      "Report interruptive alerts per encounter, override rate and after-hours documentation time per release against a baseline, and retire or tune agent " +
      "alerts above a set override rate.",
    failureMode:
      "The agent adds interruptive documentation prompts to every encounter, raising clinicians' after-hours charting time with nobody measuring it.",
    keyRisk: 3,
  },
  "HLT-PP-7": {
    l2: "Access logs are kept, but nobody reviews them for breach indicators",
    l4: "Anomaly detection and risk assessment are automated, but notification workflows and deadlines are tracked by hand",
    evidence: ["phi_access_anomaly_alerts", "breach_risk_assessment_template", "breach_deadline_tracker"],
    remediation:
      "Alert on agent and user access anomalies such as bulk reads, off-hours exports and messages to unknown recipients, and open a breach risk assessment " +
      "with a deadline timer for each alert.",
    failureMode:
      "The agent emails a batch of patient statements to the wrong recipient list and nothing flags it, so the 60-day notification window runs out unseen.",
    keyRisk: 2,
  },
  "HLT-PP-8": {
    l2: "Codes are suggested from documentation, with no validation against the official guidelines",
    l4: "Guideline validation and modifier checks run, but audit error patterns do not feed back to coders",
    evidence: ["coding_guideline_validation_results", "modifier_appropriateness_report", "coding_audit_error_patterns"],
    remediation:
      "Validate each agent-suggested CPT and ICD-10-CM code against the official guidelines and modifier rules before it reaches a coder, and run a monthly " +
      "sample audit.",
    failureMode: "The agent appends modifier 25 to every visit with a procedure regardless of whether a separate evaluation was documented.",
    keyRisk: 0,
  },
  "HLT-PP-9": {
    l2: "Estimates are produced on request, not for every scheduled self-pay service",
    l4: "Estimates are checked against Sec. 149.610 content and timing, but estimate-versus-bill differences are not tracked",
    evidence: ["good_faith_estimate_content_check", "gfe_timing_log", "estimate_vs_bill_variance_report"],
    remediation:
      "Generate a good faith estimate when a self-pay or uninsured service is scheduled, check its content and timing against Sec. 149.610 before sending, " +
      "and record the check.",
    failureMode: "The agent books a self-pay procedure and quotes a single price in chat without producing a good faith estimate.",
    keyRisk: 4,
  },
  "HLT-PP-10": {
    l2: "Credentials are listed in a spreadsheet, with no expiration alerts",
    l4: "Primary source verification and continuous monitoring run, but privileging decisions and committee documentation are manual",
    evidence: ["primary_source_verification_record", "credential_expiry_alert_log", "npdb_query_log"],
    remediation:
      "Check the provider's licence and privileges against primary-source records before the agent schedules or bills a service under that provider, and " +
      "block when either has lapsed.",
    failureMode: "The agent keeps scheduling and billing procedures under a provider whose licence has lapsed because it reads a stale credential record.",
    keyRisk: 4,
  },
  "HLT-PP-11": {
    l2: "Unusual billing is flagged after submission, with no review of what the agent is optimizing for",
    l4: "False-claim triggers and AKS safe-harbor checks run, but OIG advisory opinions and audit documentation are not linked",
    evidence: ["billing_optimization_objective_review", "aks_safe_harbor_assessment", "provider_code_distribution_peer_comparison"],
    remediation:
      "Remove revenue-maximizing objectives from the agent's coding and referral prompts, and add a pre-submission check that compares each provider's code " +
      "distribution with peer baselines and holds outliers for review.",
    failureMode:
      "The agent learns that higher E/M levels pay more and shifts its suggestions upward across all visits, producing claims the documentation does not " +
      "support.",
    keyRisk: 4,
  },
  "HLT-PP-12-v2": {
    l2: "Breach events and deadlines are logged, but notices are drafted from scratch each time",
    l4: "Risk assessments and notices meet content and deadline requirements, but media/HHS threshold checks or the breach log are incomplete",
    evidence: ["breach_four_factor_risk_assessment", "breach_notice_content_audit", "breach_log_export"],
    remediation:
      "Record a dated four-factor risk assessment for each suspected breach, generate notices from templates with the required content, and apply the " +
      "individual, media and HHS thresholds automatically.",
    failureMode: "The agent's misrouted patient messages are judged low risk without a four-factor record, and no individual notice is sent.",
    keyRisk: 2,
  },
  "HLT-PP-13": {
    l2: "Requests are logged at intake, but deadlines and delivery formats are not tracked",
    l4: "Requests are tracked against the 30-day limit with extension and format handling, but fee controls or evidence export are inconsistent",
    evidence: ["right_of_access_request_tracker", "requester_identity_verification_log", "access_fee_calculation_record"],
    remediation:
      "Have the agent verify requester identity, track each request against the 30-day limit with extension notices, deliver in the requested electronic " +
      "format and log any fee charged.",
    failureMode: "The agent sends a patient's full record to a third party named in an email without verifying that the request came from the patient.",
    keyRisk: 2,
  },
  "HLT-PP-14": {
    l2: "Guidance on AI use exists, but nothing shows a clinician took responsibility for AI-generated records",
    l4: "Responsibility attestations and conflict-of-interest checks run, but disclosure of tool use to patients is inconsistent",
    evidence: ["clinician_responsibility_attestation_log", "billing_vs_patient_interest_conflict_review", "ai_use_disclosure_template"],
    remediation:
      "Require a clinician attestation of responsibility before any AI-generated note or order is signed, and review agent recommendations whose revenue " +
      "impact conflicts with documented patient preferences.",
    failureMode:
      "The agent recommends a more frequent follow-up schedule than the patient needs because its configuration rewards visit volume, and no clinician " +
      "reviews the conflict.",
    keyRisk: 4,
  },
  "HLT-PP-15": {
    l2: "Disclaimers are added by hand to some AI-generated messages",
    l4: "A rules registry drives disclaimers and records practitioner reviews, but rules are not re-checked when statutes change",
    evidence: ["state_ai_rules_registry", "patient_message_disclaimer_audit", "practitioner_review_record"],
    remediation:
      "Drive disclaimers and human-contact instructions from a state rules registry keyed by patient location and medium, and record the reviewer identity " +
      "when a licensed provider's review exempts a message.",
    failureMode:
      "The agent sends a California patient an AI-written message about test results without the generative-AI disclaimer or instructions for reaching a " +
      "human.",
    keyRisk: 2,
  },
  "HLT-PP-16": {
    l2: "Classification is noted, with logging enabled on only some workflows",
    l4: "Art. 9-15 controls are mapped to evidence, but technical documentation and monitoring do not cover every practice workflow",
    evidence: ["ai_act_high_risk_classification_record", "arts9_15_evidence_bundle", "practice_workflow_logging_config"],
    remediation:
      "For each practice workflow classified high-risk, map the Art. 9-15 obligations to controls with evidence and switch on logging and human oversight in " +
      "the agent before 2 December 2027.",
    failureMode:
      "The agent's practice outputs feed health insurance pricing while it runs without the logging or human oversight its high-risk classification calls for.",
    keyRisk: 4,
  },
  "HLT-PP-17": {
    l2: "Amendment and accounting requests are logged, but responses are not tied to the record change",
    l4: "SLAs and evidence are enforced, but the accounting of disclosures omits disclosures the agent made",
    evidence: ["amendment_request_log", "accounting_of_disclosures_report", "rights_request_sla_report"],
    remediation:
      "Record every disclosure the agent makes in the accounting of disclosures, and link each approved amendment to the corrected record and its notice to " +
      "prior recipients.",
    failureMode: "The agent's disclosures to outside parties are missing from the accounting of disclosures because they were logged under a system account.",
    keyRisk: 1,
  },
  "HLT-PP-18": {
    l2: "Decision support tools are listed, but nobody has checked their input variables",
    l4: "The inventory and dated input reviews are updated on change, but identified tools are not linked to mitigation records",
    evidence: ["decision_support_tool_inventory", "protected_characteristic_input_review", "decision_support_mitigation_record"],
    remediation:
      "Add each agent-driven decision support tool to the inventory on deployment and review its input variables for race, color, national origin, sex, age " +
      "or disability before go-live.",
    failureMode:
      "The agent uses a no-show prediction that includes age and national origin to deprioritise appointment offers, and the tool was never inventoried.",
    keyRisk: 4,
  },
  "HLT-PP-19": {
    l2: "The agent is listed as one application, but its model endpoints and tools are not named",
    l4: "Every AI component and ePHI flow is in the risk analysis, but the asset inventory or network map is incomplete",
    evidence: ["hipaa_risk_analysis_ai_components", "technology_asset_inventory", "ephi_network_map"],
    remediation:
      "Add the agent and each model endpoint, tool and data store to the risk analysis with the ePHI flows between them, and track NPRM readiness as " +
      "proposed only.",
    failureMode:
      "The agent sends patient messages to an external transcription model that is missing from the risk analysis, so no safeguards were assessed for it.",
    keyRisk: 2,
  },
};
