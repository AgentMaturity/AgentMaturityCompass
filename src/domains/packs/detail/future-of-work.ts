/** Per-question detail for the future-of-work pack, keyed by question id (see IndustryPackQuestionDetail). */
import type { PackQuestionDetail } from "../../industryPacks.js";

export const futureOfWorkDetail: PackQuestionDetail = {
  "WLT-FW-1": {
    l2: "Selection rates by group are computed once for a launch or pilot, but are not recomputed per model version and shortfalls are not logged",
    l4: "Selection rates are computed per model version and cohort and every shortfall is investigated, but investigation outcomes are not linked to the model "
      + "version or retained for review",
    evidence: ["selection_rate_by_group_report", "four_fifths_shortfall_investigation_record", "screening_model_version_register"],
    remediation: "Compute group selection rates for every screening model version and decision cohort, and block promotion of a version until each "
      + "four-fifths shortfall has a recorded investigation outcome.",
    failureMode: "The agent ranks candidates with a new model version whose selection rate for one group falls below four-fifths of the highest group, "
      + "and nobody sees it until hiring is complete.",
    keyRisk: 0,
  },
  "WLT-FW-2": {
    l2: "Onboarding captures some direction-and-control facts in free text, but status is still set by the contract template",
    l4: "Every status determination is taken and recorded by a named human with the facts considered, but changes to agent-driven pay, allocation or "
      + "sanction controls do not trigger re-assessment",
    evidence: ["worker_status_determination_record", "direction_and_control_fact_sheet", "algorithmic_control_change_reassessment_log"],
    remediation: "Record the direction-and-control facts per person at onboarding, route the status decision to a named human, and open a re-assessment "
      + "task whenever the agent's pay-setting, allocation, rating or sanction rules change.",
    failureMode: "The agent onboards couriers as self-employed from a template while it sets their pay, allocates their jobs and sanctions them, with "
      + "no record of the control it exercises.",
    keyRisk: 1,
  },
  "WLT-FW-3": {
    l2: "Information on the automated systems exists only in internal documentation and is given to workers or representatives on request",
    l4: "Information is generated from the live system inventory and delivered before use, but re-issue on material change is manual and delivery "
      + "evidence is incomplete",
    evidence: ["automated_system_information_notice", "algorithmic_system_inventory_snapshot", "notice_delivery_receipt_log"],
    remediation: "Generate the Art. 9 notice from the deployed system inventory (systems, data categories, aims, decision types, main parameters) and "
      + "make a material version change fail release until the notice is re-issued with delivery evidence.",
    failureMode: "The agent starts using a new ranking parameter for job allocation while workers and their representatives still hold a notice "
      + "describing the previous system.",
    keyRisk: 2,
  },
  "WLT-FW-4": {
    l2: "Prohibited categories are listed in policy and some obvious fields are removed manually from feature pipelines",
    l4: "Feature allow-lists exclude the Art. 7(1) categories and off-shift collection is blocked, but no automated release test proves the categories "
      + "are absent",
    evidence: ["feature_allowlist_config", "off_shift_collection_block_test", "prohibited_category_ingestion_test_report"],
    remediation: "Enforce an input and feature allow-list that excludes emotional state, private conversations, off-shift data and union-activity "
      + "predictors, and add a release test that fails if any such field reaches the agent.",
    failureMode: "The agent ingests in-app chat sentiment and off-shift location pings into a worker risk score that predicts likely organising activity.",
    keyRisk: 2,
  },
  "WLT-FW-5": {
    l2: "The agent does not block worker communication channels, but provides no aggregate data or consultation route for representatives",
    l4: "Aggregate workforce data is provided and representatives are consulted on algorithmic management changes, but non-interference is not verified "
      + "by tests or monitoring",
    evidence: ["worker_channel_non_interference_test", "aggregate_workforce_data_disclosure", "works_council_consultation_minutes"],
    remediation: "Add a non-interference test that proves the agent never downranks, deactivates or reroutes workers based on union or channel activity, "
      + "and log each algorithmic-management change consulted with representatives.",
    failureMode: "The agent lowers job allocation for workers who post in an organising channel because it treats their reduced acceptance rate as a "
      + "performance signal.",
    keyRisk: 4,
  },
  "WLT-FW-6": {
    l2: "Roles affected by automation are listed for a project, but no reskilling opportunity is identified for them",
    l4: "Displacement forecasts and personalised reskilling pathways exist for affected roles, but reskilling effectiveness is not measured against "
      + "redeployment outcomes",
    evidence: ["automation_impact_assessment", "affected_role_register", "reskilling_pathway_outcome_report"],
    remediation: "Require an automation impact assessment naming affected roles before the agent takes over a task family, and track each affected "
      + "worker's reskilling pathway to a redeployment or exit outcome.",
    failureMode: "The agent absorbs a whole claims-handling task family and the affected staff learn of it from a headcount plan with no reskilling route.",
    keyRisk: 3,
  },
  "WLT-FW-7": {
    l2: "Working hours are visible in the scheduling system, but limits are not checked by the agent",
    l4: "Scheduling blocks shifts that breach daily rest, breaks, weekly rest and the weekly maximum, but hours worked across multiple apps or accounts "
      + "are not aggregated",
    evidence: ["shift_schedule_constraint_config", "rest_period_breach_report", "working_time_aggregation_log"],
    remediation: "Encode the daily rest, break, weekly rest, weekly maximum and night-work limits as hard constraints in the agent's shift allocator, "
      + "rejecting any offer that would breach them.",
    failureMode: "The agent offers a surge shift to a driver who logged off eight hours earlier, cutting the daily rest period to win a delivery SLA.",
    keyRisk: 1,
  },
  "WLT-FW-8": {
    l2: "Some decision logs exist, but they rotate before six months or are lost on redeploy",
    l4: "Logs are retained and each decision links to inputs, model version and reviewer, but reconstruction has never been tested on a sampled decision",
    evidence: ["employment_decision_log_retention_config", "decision_to_model_version_linkage", "quarterly_decision_reconstruction_test"],
    remediation: "Write a decision record per worker or candidate decision with input hash, model version and human reviewer, retain it at least six "
      + "months, and reconstruct a sampled decision each quarter.",
    failureMode: "The agent rejects a candidate and, when the candidate challenges it, the logs have rotated so no one can show which inputs or model "
      + "produced the rejection.",
    keyRisk: 0,
  },
  "WLT-FW-9": {
    l2: "Human approval is configured for account terminations, but the approval step can be skipped by an admin flag",
    l4: "A technical gate blocks every detrimental decision until a named human records reasons, but bypass attempts are not logged or tested",
    evidence: ["detrimental_decision_approval_record", "account_suspension_gate_config", "gate_bypass_attempt_log"],
    remediation: "Put a hard gate in front of the suspend, restrict and deactivate tools so they return pending until a named human records the decision "
      + "and reasons, and test that the agent cannot call them directly.",
    failureMode: "The agent auto-suspends a worker's account after a fraud score crosses a threshold, cutting off income with no human decision.",
    keyRisk: 1,
  },
  "WLT-FW-10": {
    l2: "Internal bias testing is run once, with no independent auditor and no candidate notice",
    l4: "An independent bias audit runs annually and the summary is published, but candidate and employee notices are sent manually and delivery is "
      + "not tracked",
    evidence: ["aedt_independent_bias_audit_report", "published_bias_audit_summary", "aedt_candidate_notice_delivery_log"],
    remediation: "Block AEDT scoring for NYC candidates unless a current independent bias audit is on file and the notice has been delivered, and log "
      + "each delivery against the candidate record.",
    failureMode: "The agent scores NYC applicants with a resume-ranking tool whose bias audit has lapsed and sends no notice that an AEDT is in use.",
    keyRisk: 0,
  },
  "WLT-FW-11": {
    l2: "A generic AI-use notice is shown in the application portal, but consent is not captured per applicant before analysis",
    l4: "Notice, explanation and consent are recorded per applicant, but deletion requests are tracked manually and copies in vendor storage are not "
      + "covered",
    evidence: ["video_interview_consent_record", "ai_characteristics_explanation_text", "interview_video_deletion_record"],
    remediation: "Hold each video interview out of the analysis queue until the applicant's notice, explanation and consent are recorded, and run "
      + "deletion requests against every storage location including vendor copies.",
    failureMode: "The agent analyses a recorded interview for facial expressions before the applicant consented, and keeps a vendor copy after a "
      + "deletion request.",
    keyRisk: 2,
  },
  "WLT-FW-12": {
    l2: "An accommodation contact address is listed, but applicants are scored before any request is handled",
    l4: "Accommodation is offered before scoring and job-relatedness evidence exists per criterion, but evidence is not re-reviewed when the model changes",
    evidence: ["accommodation_request_outcome_log", "screen_out_criterion_job_relatedness_record", "assessment_model_change_review"],
    remediation: "Offer an accommodation choice (alternative format or human assessment) before the agent scores an applicant, and refuse to deploy a "
      + "screen-out criterion without a recorded job-relatedness review.",
    failureMode: "The agent screens out an applicant with a speech impairment because a timed voice assessment scored them low, with no offer of an "
      + "alternative format.",
    keyRisk: 0,
  },
  "WLT-FW-13": {
    l2: "Labour impacts are discussed informally, and grievances arrive by email with no case record",
    l4: "Impact assessments, worker consultation and grievance cases are recorded and linked to algorithmic changes, but mitigation effectiveness is "
      + "not measured or reported",
    evidence: ["labour_impact_due_diligence_assessment", "worker_grievance_case_register", "algorithmic_change_mitigation_report"],
    remediation: "Link every worker grievance case to the algorithmic-management change it concerns, and require a recorded impact review with worker "
      + "consultation before such a change ships.",
    failureMode: "The agent rolls out a new rating penalty while open grievances about the previous one sit unconnected to the change.",
    keyRisk: 4,
  },
  "WLT-FW-14": {
    l2: "Teams know of some location-specific duties, but no matrix exists and rollout is not checked",
    l4: "A jurisdiction matrix gates rollout, but evidence of completed notice, audit and consent duties is stored per team and not bundled per release",
    evidence: ["employment_ai_jurisdiction_matrix", "rollout_gate_check_result", "location_duty_evidence_bundle"],
    remediation: "Map each employment AI feature to the jurisdictions where it runs and make the rollout pipeline fail for a location until its notice, "
      + "audit or consent evidence is attached.",
    failureMode: "The agent's video-interview scoring is switched on for Illinois applicants by a global flag before the location's consent duties are met.",
    keyRisk: 0,
  },
  "WLT-FW-15": {
    l2: "Workers are told about workplace AI informally through managers, with no record of who was told",
    l4: "Notices are recorded per system and site before go-live, but recipient lists for workers' representatives are incomplete",
    evidence: ["workplace_ai_notice_record", "workers_representative_recipient_list", "system_go_live_gate_log"],
    remediation: "Gate go-live of each high-risk workplace AI system per site on a recorded notice to workers' representatives and affected workers, "
      + "storing the text, date and recipients.",
    failureMode: "The agent starts monitoring warehouse pick rates at a new site before workers or their representatives were told it would.",
    keyRisk: 4,
  },
  "WLT-FW-16": {
    l2: "Review requests are accepted by chat, but replies are verbal or templated and no clock is kept",
    l4: "Written substantiated replies are sent and timed, but rectification deadlines are not tracked or breaches are not reported",
    evidence: ["decision_review_request_log", "substantiated_reply_record", "rectification_deadline_breach_report"],
    remediation: "Open a timed case for every review request with a two-week clock for the written reply and a second for rectification, and alert on "
      + "breach of either.",
    failureMode: "The agent answers a worker's request to review a pay deduction with a canned chatbot message and the request is never escalated.",
    keyRisk: 1,
  },
  "WLT-FW-17": {
    l2: "Pay proposal criteria are described internally but not shared with workers",
    l4: "Criteria are published and tested for gender neutrality, but pay-gap indicators cannot be reproduced from logged inputs",
    evidence: ["pay_criteria_publication", "gender_neutrality_test_report", "pay_gap_indicator_reproduction_log"],
    remediation: "Log every input and criterion behind each pay proposal the agent makes, run a gender-neutrality test on each release, and recompute "
      + "the pay-gap indicators from those logs.",
    failureMode: "The agent proposes lower starting pay for returning part-time workers using prior salary history, which encodes a gender gap no one "
      + "can trace.",
    keyRisk: 0,
  },
};
