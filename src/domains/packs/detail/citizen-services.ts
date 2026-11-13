/** Per-question detail for the citizen-services pack, keyed by question id (see IndustryPackQuestionDetail). */
import type { PackQuestionDetail } from "../../industryPacks.js";

export const citizenServicesDetail: PackQuestionDetail = {
  "GOV-CS-1": {
    l2: "Some web pages were tested once, but agent-generated content and the chat and voice channels were not",
    l4:
      "Every channel, including agent-generated content, has conformance evidence per release and a published statement, but focus-order regression tests " +
      "or manual assistive-technology checks are missing",
    evidence: ["wcag_conformance_report_per_channel", "art7_accessibility_statement", "focus_order_regression_test_results"],
    remediation:
      "Add automated WCAG 2.1 AA checks on agent-generated responses (headings, text alternatives, contrast, focus order) to the release pipeline for every " +
      "channel, and publish the Art. 7 statement with a feedback route.",
    failureMode:
      "The agent shows eligibility results in a dynamically injected panel without accessible labels, so screen-reader users never hear the outcome.",
    keyRisk: 0,
  },
  "GOV-CS-2": {
    l2: "A generic satisfaction survey exists, but it is not offered at the end of SDG-linked procedures",
    l4: "Feedback is collected and forwarded to the gateway tool, but recurring issues are not linked to tracked fixes",
    evidence: ["sdg_feedback_submission_log", "gateway_tool_forwarding_record", "feedback_issue_to_fix_link"],
    remediation:
      "Have the agent offer the feedback prompt at the end of every SDG-linked procedure, forward responses to the gateway's user-feedback tool, and open a " +
      "tracked fix when the same issue recurs.",
    failureMode:
      "The agent ends cross-border users' procedure sessions without a feedback prompt, so a recurring evidence-upload failure never reaches the gateway " +
      "feedback tool.",
    keyRisk: 0,
  },
  "GOV-CS-3": {
    l2: "Bias was discussed during development, but no dataset was examined and outcomes are not monitored by group",
    l4:
      "Datasets are examined and outcome disparities are monitored against thresholds, but investigations are not recorded or not reported to the oversight " +
      "body",
    evidence: ["art10_2_f_bias_examination_per_dataset", "eligibility_outcome_disparity_dashboard", "disparity_investigation_record"],
    remediation:
      "Add a production metric for eligibility approval-rate gaps across protected groups with an alert threshold, and require each alert to open an " +
      "investigation record before the next model update ships.",
    failureMode:
      "The agent's eligibility recommendations reject single-parent applicants at a much higher rate because training data encoded past caseworker bias " +
      "that no one examined.",
    keyRisk: 2,
  },
  "GOV-CS-4-v2": {
    l2: "Overseers are named, but the agent's outputs flow into decisions with no means to override them",
    l4: "Named, trained overseers can override, reverse and stop the agent with tests each release, but overrides are not logged with a reason or not reviewed",
    evidence: ["overseer_assignment_and_training_record", "override_and_stop_function_test", "override_reason_log"],
    remediation:
      "Give named overseers an override and a safe stop control on the agent's eligibility queue, test both each release, and require a reason code on " +
      "every override.",
    failureMode: "The agent keeps auto-closing benefit applications after a data-feed error, and caseworkers have no stop control to halt it.",
    keyRisk: 0,
  },
  "GOV-CS-5": {
    l2: "Purpose limitation is stated in policy, but the agent can query any government dataset its credentials reach",
    l4:
      "Necessity assessments and purpose-limitation controls exist per service, but cross-agency sharing gates or automated retention enforcement are " +
      "missing",
    evidence: ["service_necessity_assessment", "purpose_scoped_data_access_policy", "cross_agency_sharing_gate_log", "retention_enforcement_job_log"],
    remediation:
      "Scope the agent's data-access credentials to each service purpose so a benefits session cannot query tax, health or police datasets, and log every " +
      "denied cross-purpose query.",
    failureMode: "The agent pulls a claimant's police records into a housing-benefit assessment because its credentials allow it and no purpose check runs.",
    keyRisk: 3,
  },
  "GOV-CS-6": {
    l2: "Feedback is collected after launch, but no user research or usability testing preceded the agent's deployment",
    l4:
      "Iterative human-centred design with representative citizen panels runs, but satisfaction is not measured systematically or not fed into an " +
      "improvement cycle",
    evidence: ["user_research_panel_composition", "usability_test_findings", "citizen_satisfaction_measurement"],
    remediation:
      "Run usability tests of the agent's dialogues with a representative citizen panel, including older and low-literacy users, before each significant " +
      "release, and block release on unresolved critical findings.",
    failureMode:
      "The agent replaces phone intake after being tested only with digitally confident users, and older applicants who cannot use chat lose their only " +
      "route.",
    keyRisk: 4,
  },
  "GOV-CS-7": {
    l2: "Security controls exist, but the applicable regime is not identified for each deployment",
    l4: "Current authorization or assessment evidence and a NIST CSF 2.0 profile exist, but monitoring is periodic or findings are not tracked to closure",
    evidence: ["applicable_regime_per_deployment_record", "nist_csf_2_profile", "continuous_monitoring_findings_tracker"],
    remediation:
      "Record the applicable regime for each agent deployment, map its controls to NIST CSF 2.0 outcomes, and feed continuous monitoring alerts on the " +
      "agent's hosting into a findings tracker with due dates.",
    failureMode:
      "The agent is deployed on a cloud tenancy outside the authorised boundary, so the citizen case files it processes sit on infrastructure no assessment " +
      "covers.",
    keyRisk: 3,
  },
  "GOV-CS-8": {
    l2: "A policy forbids exploitative messaging, but launch scripts were never reviewed against it",
    l4: "Every prompt or template change is screened before release, but outcomes by vulnerable group are not monitored for withdrawal or drop-off",
    evidence: ["art5_1_b_prompt_change_screen_record", "claim_withdrawal_rate_by_group", "drop_off_anomaly_investigation"],
    remediation:
      "Screen every change to the agent's prompts and templates against Art. 5(1)(b) in the release pipeline, and monitor claim-withdrawal rates by age, " +
      "disability and income group with an alert threshold.",
    failureMode: "The agent tells a disabled claimant that appealing will probably delay all their payments, nudging them to drop a valid claim.",
    keyRisk: 0,
  },
  "GOV-CS-9": {
    l2: "A short rights-risk note exists, but it omits most Art. 27(1) elements",
    l4:
      "The assessment has all Art. 27(1)(a)-(f) elements and the authority was notified, but updates are not triggered by agent changes or not linked to " +
      "the agent version",
    evidence: ["art27_fria_document", "market_surveillance_notification_receipt", "fria_to_dpia_cross_reference"],
    remediation:
      "Link the fundamental rights impact assessment to the agent version in the release record, and block first deployment, or any release that changes " +
      "affected groups or risks, until it is updated.",
    failureMode:
      "The agent is extended to housing-benefit eligibility under an assessment that covered only child benefit, so the newly affected groups are never " +
      "assessed.",
    keyRisk: 2,
  },
  "GOV-CS-10": {
    l2: "Information and forms are online, but identification and evidence submission still need an office visit for most Annex II procedures",
    l4:
      "Every Annex II procedure served completes online end to end with documented exceptions, but completion rates are not measured per procedure or for " +
      "cross-border users",
    evidence: ["annex_ii_procedure_step_matrix", "offline_step_exception_register", "procedure_completion_rate_report"],
    remediation:
      "Map each Annex II procedure the agent serves step by step, and add a test journey per procedure that fails if any step outside a documented " +
      "exception sends the user offline.",
    failureMode:
      "The agent tells a cross-border applicant to post paper copies of documents for a step that is available online, stalling an Annex II procedure.",
    keyRisk: 0,
  },
  "GOV-CS-11": {
    l2: "Only domestic eID is accepted on most services, with a wallet pilot on one",
    l4: "Wallets and notified foreign eID means are accepted with attribute verification, but cross-border test transactions are not recorded per release",
    evidence: ["cross_border_eid_acceptance_matrix", "presented_attribute_verification_log", "cross_border_test_transaction_record"],
    remediation:
      "Verify every attribute presented by a foreign wallet or notified eID means against its issuer's signature before the agent uses it, and run recorded " +
      "cross-border test transactions each release.",
    failureMode: "The agent accepts a foreign wallet presentation without verifying the issuer signature, letting a forged attribute unlock a benefit claim.",
    keyRisk: 1,
  },
  "GOV-CS-12": {
    l2: "Simple pages pass focus-order checks, but wizards, modals and agent-updated forms were never tested",
    l4: "Focus order is tested end to end with automated and assistive-technology checks, but no change-control gate stops a regression from shipping",
    evidence: ["focus_order_journey_test_suite", "assistive_technology_manual_test_log", "accessibility_regression_gate_result"],
    remediation:
      "Add keyboard-only end-to-end tests for each journey the agent updates dynamically (decision notices, uploads, payments) and gate every release on " +
      "them.",
    failureMode:
      "The agent inserts a new document-request step into an open form without moving keyboard focus, trapping keyboard users away from the submit button.",
    keyRisk: 0,
  },
  "GOV-CS-13": {
    l2: "The current Section 508 or ADA Title II reference is adopted, but no conformance testing has been run on the agent's channels",
    l4:
      "Conformance evidence per release covers agent-generated content and authentication steps, but there is no exceptions log or remediation is not " +
      "tracked against the applicable date",
    evidence: ["section_508_conformance_report", "ada_title_ii_deadline_tracker", "accessibility_exceptions_log"],
    remediation:
      "Test each release's agent-generated responses and authentication steps against WCAG 2.0 Level A and AA, and track each open defect against the " +
      "compliance date that applies to the channel.",
    failureMode:
      "The agent's sign-in step uses a visual challenge with no accessible alternative, so blind residents cannot reach the county benefits service it " +
      "fronts.",
    keyRisk: 0,
  },
  "GOV-CS-14": {
    l2: "The once-only system is connected for a few procedures, but evidence is fetched with no user request step",
    l4: "Evidence is fetched only on explicit request and previewed before use, but the user cannot decline its use or exchanges are not logged",
    evidence: ["once_only_evidence_request_log", "user_preview_and_decline_record", "cross_border_evidence_exchange_log"],
    remediation:
      "Require an explicit user request before the agent calls the once-only technical system, show the returned evidence for preview, and let the user " +
      "decline its use, logging each step.",
    failureMode:
      "The agent pulls a user's foreign tax record through the once-only system unasked and uses it in the decision before the user can see or decline it.",
    keyRisk: 3,
  },
  "GOV-CS-15": {
    l2: "A notice text has been drafted, but it is published nowhere and given to no applicant",
    l4: "Notice is given in each case before the decision, but it is not recorded on the case file or the records are not sampled",
    evidence: ["per_case_high_risk_ai_notice_record", "notice_text_version", "notice_record_sample_check"],
    remediation:
      "Have the case workflow insert the high-risk AI notice into each applicant's correspondence before the decision step and write a notice-given flag to " +
      "the case file, blocking the decision when it is absent.",
    failureMode:
      "The agent drafts an eligibility recommendation that a caseworker adopts, and the applicant is never told a high-risk AI system was used in their " +
      "case.",
    keyRisk: 2,
  },
  "GOV-CS-16": {
    l2: "Explanation requests are accepted by email, but staff cannot say what the AI system did in the case",
    l4:
      "Explanations are generated from the logged decision trace through a published route, but they are not reviewed by a named official or response times " +
      "are not logged",
    evidence: ["eligibility_decision_trace_log", "explanation_request_register", "official_explanation_review_record"],
    remediation:
      "Store each eligibility decision's input fields, agent output and human action under the case id at decision time, and generate the explanation from " +
      "that record for review by a named official.",
    failureMode:
      "The agent regenerates an explanation from current data weeks after the decision, giving reasons that differ from what actually drove the refusal.",
    keyRisk: 2,
  },
};
