/** Per-question detail for the wellness-management pack, keyed by question id (see IndustryPackQuestionDetail). */
import type { PackQuestionDetail } from "../../industryPacks.js";

export const wellnessManagementDetail: PackQuestionDetail = {
  "HLT-WM-1": {
    l2: "A keyword list surfaces a hotline number, but there is no AI disclosure and no escalation beyond the message",
    l4: "The protocol is published with human escalation and tested per release, but referral notifications are not counted",
    evidence: ["crisis_protocol_published_version", "self_harm_detection_test_results", "crisis_human_escalation_log", "crisis_referral_notification_count"],
    remediation:
      "Run a crisis classifier on every user turn that, on a hit, stops coaching, shows crisis-service referral and pages an on-call human per the published " +
      "protocol. Run a labelled self-harm test set per release and block release on misses.",
    failureMode: "The agent answers an indirect statement of suicidal intent with a sleep-hygiene tip and carries on with the coaching script.",
    keyRisk: 0,
  },
  "HLT-WM-2": {
    l2: "One consent checkbox covers all wellness data, with no separate explicit consent for health or biometric categories",
    l4: "Explicit consent is recorded per purpose and withdrawal is automated, but deletion does not cascade to derived scores or partner copies",
    evidence: ["art9_explicit_consent_record_per_purpose", "consent_withdrawal_cascade_log", "special_category_wellness_data_inventory"],
    remediation:
      "Check for a recorded explicit consent covering the specific purpose before the agent reads heart-rate, mood or condition data, and on withdrawal run " +
      "a job that deletes raw data and derived scores and logs each deletion.",
    failureMode:
      "The agent starts analysing mood-journal entries and heart-rate variability for a new stress-scoring purpose that the user's original consent did not " +
      "cover.",
    keyRisk: 3,
  },
  "HLT-WM-3": {
    l2: "A blocklist removes extreme calorie targets, but the agent still produces weight-loss plans with no screening for risk indicators",
    l4: "Indicators are detected and routed with a tested red-team set, but flagged users can get restriction advice again by rephrasing",
    evidence: ["eating_disorder_red_team_set_results", "ed_indicator_referral_log", "restriction_content_filter_config"],
    remediation:
      "Add an indicator detector for restriction, purging and body-checking language that sets a persistent user flag, sends a referral to professional " +
      "assessment and blocks further calorie, fasting and weight-target outputs for that user.",
    failureMode: "The agent gives a user who mentions skipping meals and purging a very-low-calorie plan with a weekly weight-loss target.",
    keyRisk: 2,
  },
  "HLT-WM-4": {
    l2: "Individual data and employer reports share one database, separated only by report filters",
    l4: "Employer reports are aggregate with a documented minimum group size, but no re-identification review runs before a new report type",
    evidence: ["employer_report_minimum_group_size_config", "wellness_reidentification_review_record", "wellness_data_store_segregation_diagram"],
    remediation:
      "Enforce the documented minimum group size in the agent's reporting tool so any employer query with a cell below it returns suppressed, and run a " +
      "re-identification review before a new report type is enabled.",
    failureMode:
      "The agent answers an HR manager's request for wellness trends in a five-person team, letting the manager identify the one employee with a flagged " +
      "condition.",
    keyRisk: 1,
  },
  "HLT-WM-5": {
    l2: "Claims come from templates, but no template records the evidence behind it",
    l4: "Every claim template links to graded, dated evidence, but unsupported claims in free-text output are not blocked",
    evidence: ["health_claim_substantiation_register", "claim_template_evidence_links", "unsupported_claim_block_log"],
    remediation:
      "Keep a claims register linking each allowed health-benefit claim to its substantiating evidence and grade, and filter agent output so a benefit claim " +
      "not in the register is removed or restated with its evidence limits.",
    failureMode:
      "The agent tells users that an extreme fasting protocol will reshape their body and reverse metabolic damage, a claim it generated with no " +
      "substantiating evidence.",
    keyRisk: 2,
  },
  "HLT-WM-6": {
    l2: "Users see a score with a generic list of inputs, with no indication of which of their data drove it",
    l4: "Per-user factor contributions and counterfactuals are shown, but bias audits are not run on a schedule",
    evidence: ["wellness_score_factor_contribution_view", "wellness_score_methodology_document", "scheduled_wellness_bias_audit_report"],
    remediation:
      "Return the top contributing factors and their direction with every wellness score the agent shows, plus a what-would-change-this-score explanation " +
      "generated from the same model.",
    failureMode:
      "The agent lowers a user's wellness score and pushes stricter goals without saying which inputs changed, so the user cannot challenge a score built on " +
      "a mis-synced device reading.",
    keyRisk: 4,
  },
  "HLT-WM-7": {
    l2: "Wellness indicators are collected but never compared with the workplace hazard register",
    l4: "Emerging risks are identified from wellness patterns and controls are recommended, but worker consultation and follow-up are not tracked",
    evidence: ["ohs_hazard_register_wellness_linkage", "hierarchy_of_controls_recommendation_log", "worker_consultation_record"],
    remediation:
      "Link aggregated wellness signals to the hazard register by site and role, and have the agent propose controls in hierarchy order, elimination first, " +
      "with a worker consultation record before closure.",
    failureMode:
      "The agent responds to a cluster of musculoskeletal complaints on one production line by prescribing individual stretching routines instead of raising " +
      "a workplace hazard for elimination.",
    keyRisk: 1,
  },
  "HLT-WM-8": {
    l2: "Direct exports to insurers are blocked by policy, but data-broker and partner SDK flows are not inventoried",
    l4: "Data is isolated from insurance systems and inference is tested, but third-party broker monitoring is periodic and manual",
    evidence: ["insurance_data_flow_inventory", "third_party_sdk_egress_review", "underwriting_inference_test_results"],
    remediation:
      "Add an egress allowlist to the agent's tools that blocks transfers to insurer and data-broker destinations, monitor SDK traffic against it and test " +
      "whether exported aggregates allow underwriting inference.",
    failureMode: "The agent shares participation and step-count aggregates with a marketing partner whose data later reaches an insurer's underwriting model.",
    keyRisk: 3,
  },
  "HLT-WM-9": {
    l2: "Template outputs avoid disease names, but free-text replies are not logged",
    l4: "All outputs are logged and a boundary test set runs per release, but failures do not block the release",
    evidence: ["wellness_recommendation_output_log", "general_wellness_boundary_test_results", "hcp_referral_wording_review"],
    remediation:
      "Run a boundary test set of prompts that invite diagnosis, clinical thresholds or treatment advice on every release, block release on any failure, and " +
      "log every production recommendation for sampling.",
    failureMode: "The agent reads a user's blood pressure log, tells them they have stage 2 hypertension and suggests changing their medication dose.",
    keyRisk: 0,
  },
  "HLT-WM-10": {
    l2: "Users can request a CSV export through support, with no derived insights included",
    l4: "FHIR export and platform transfer work, but derived insights are missing or requests are not tracked against the Art. 20 timeline",
    evidence: ["fhir_wellness_export_sample", "portability_request_timeline_log", "derived_insight_export_manifest"],
    remediation:
      "Add a self-service export that produces FHIR Observation bundles plus the agent's derived scores and goals, and track each portability request " +
      "against its response deadline.",
    failureMode: "The agent tells a user who wants to leave the program that their coaching history cannot be exported, keeping them tied to the platform.",
    keyRisk: 4,
  },
  "HLT-WM-11": {
    l2: "Emotion features are off in the default configuration, but employer tenants can switch them on",
    l4:
      "Emotion inference is blocked and tested outside documented exceptions and worker notices are recorded, but log retention is not set to at least six " +
      "months",
    evidence: ["emotion_inference_block_test_results", "worker_notice_delivery_record", "high_risk_log_retention_setting"],
    remediation:
      "Remove emotion-inference tools from the agent's allowlist for employer tenants unless a documented medical or safety exception is attached, and test " +
      "the block on each release.",
    failureMode: "The agent analyses employees' voice and chat tone during work to infer stress and frustration and reports the result to their manager.",
    keyRisk: 1,
  },
  "HLT-WM-12": {
    l2: "Automated flags drive eligibility by default, and human review happens only when a user complains",
    l4:
      "Consequential decisions route to a human by default with explanation and a contest workflow, but the similarly-significant-effect assessment is " +
      "missing for some pathways",
    evidence: [
      "consequential_decision_routing_config", "wellness_human_review_decision_log",
      "contest_request_sla_report", "art22_effect_assessment_per_pathway",
    ],
    remediation:
      "Mark each decision pathway as consequential or not in a register, and for consequential ones make the agent produce only a recommendation that a " +
      "named reviewer must approve before it takes effect, with the reason logged.",
    failureMode:
      "The agent automatically removes a user from a premium-discount wellness tier when their activity score drops, with no human review and no way to " +
      "contest.",
    keyRisk: 3,
  },
  "HLT-WM-13": {
    l2: "An incident playbook exists, but nobody records whether an incident falls under the Health Breach Notification Rule",
    l4: "Applicability triage and Sec. 318.6 notice templates exist, but delivery of each notice is not tracked",
    evidence: ["hbnr_applicability_determination_record", "health_data_incident_timeline", "breach_notice_delivery_tracking"],
    remediation:
      "Add an incident triage step that records whether identifiable health information left the system without authorization and starts the notice clock, " +
      "then track generation and delivery of each notice against Sec. 318.6 contents.",
    failureMode:
      "The agent passes users' cycle and mood data to an advertising SDK through a tool integration, and the event is closed as a bug so no breach notice is " +
      "issued.",
    keyRisk: 3,
  },
  "HLT-WM-14": {
    l2: "Some screens pass automated accessibility scans, but chat and consent flows have not been tested with assistive technology",
    l4: "Critical flows are verified accessible and an accommodation policy exists, but there is no accessibility regression testing on release",
    evidence: ["assistive_technology_test_results_per_flow", "accessibility_regression_suite", "accommodation_request_log"],
    remediation:
      "Add screen-reader and keyboard-only test cases for onboarding, consent, crisis escalation and dashboards to the release suite, and give every chart " +
      "the agent renders a text alternative.",
    failureMode:
      "The agent shows its crisis escalation only as an image card that a screen reader cannot read, so a blind user in distress never receives the referral.",
    keyRisk: 0,
  },
  "HLT-WM-15": {
    l2: "Classification is noted, but logging and human oversight for consequential outputs are not defined",
    l4: "Arts. 9-15 controls exist and map to evidence, but readiness for 2 December 2027 is not tracked per deployment",
    evidence: ["annex_iii_5a_5c_classification_record", "arts9_15_control_mapping", "high_risk_technical_documentation_index"],
    remediation:
      "Record whether Annex III point 5(a) or 5(c) applies for each deployment, and where it does, map each Art. 9-15 obligation to a named control and " +
      "evidence artifact with an owner and readiness date.",
    failureMode:
      "The agent's wellness scores are fed into health insurance pricing by a deploying insurer with no risk management, logging or human oversight in place.",
    keyRisk: 3,
  },
  "HLT-WM-16": {
    l2: "Requirements are written for medical-like features, but verification and validation are informal",
    l4: "Design reviews, verification, validation and release gates are in place, but design changes are not analysed for impact",
    evidence: ["design_input_requirements_trace", "verification_validation_protocols", "design_change_impact_analysis"],
    remediation:
      "Put medical-like intervention features under design change control that requires an impact analysis and re-verification before any model or prompt " +
      "change ships.",
    failureMode:
      "The agent's intervention-selection prompt is changed to push higher-intensity exercise and ships without verification, exposing users with cardiac " +
      "conditions to harm.",
    keyRisk: 0,
  },
  "HLT-WM-17": {
    l2: "Deployment contexts are listed, but ADA controls are mapped only for the employer program",
    l4: "Controls are mapped per context with evidence, but reviews are not periodic or accountability is not assigned",
    evidence: ["ada_deployment_context_map", "title_i_title_iii_control_matrix", "accommodation_owner_register"],
    remediation:
      "Tag each deployment as employer-sponsored or direct-to-consumer in the agent's tenant configuration, load the matching ADA control set and name an " +
      "accommodations owner for each.",
    failureMode:
      "The agent is launched direct-to-consumer on the employer configuration, so public users who ask for an accommodation get no path because only " +
      "workplace privacy controls were applied.",
    keyRisk: 1,
  },
  "HLT-WM-18": {
    l2: "A DPIA has been started, but processing begins before it is approved",
    l4: "The DPIA covers the agent's data flows and is approved before processing, but its mitigations are not traced to implemented controls",
    evidence: ["wellness_agent_dpia", "dpia_data_flow_diagram_model_endpoints", "dpia_mitigation_control_trace"],
    remediation:
      "Block onboarding of a new employer or large user population until a DPIA covering the agent's model endpoints, tools and logs is approved, and reopen " +
      "it when a new data flow is added.",
    failureMode:
      "The agent is switched on for an employer's whole workforce and starts sending wellness data to a new model provider that no impact assessment covers.",
    keyRisk: 1,
  },
};
