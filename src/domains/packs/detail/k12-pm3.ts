/** Per-question detail for the k12-pm3 pack, keyed by question id (see IndustryPackQuestionDetail). */
import type { PackQuestionDetail } from "../../industryPacks.js";

export const k12Pm3Detail: PackQuestionDetail = {
  "EDU-K12-1": {
    l2: "Consent is collected at sign-up for some child accounts, but the records are not verifiable or not linked to the account",
    l4: "Versioned consent is tied to the practice version and a change check blocks processing, but withdrawal is handled by hand and not logged",
    evidence: ["verifiable_parental_consent_record", "consent_practice_version_map", "practice_change_reconsent_log"],
    remediation:
      "Add a pre-tool-call check that compares the child account's consented practice " +
      "version with the live one and blocks collection until new consent is recorded.",
    failureMode: "The agent stores a child's free-text answers and voice clips under a new analytics practice the parent never consented to.",
    keyRisk: 0,
  },
  "EDU-K12-2": {
    l2: "Records sit behind a login, but any staff role can open any student's record and directory opt-outs are kept on paper",
    l4: "Legitimate educational interest is checked per request and every access is logged, but permitted-disclosure exceptions are not documented",
    evidence: ["legitimate_educational_interest_rule_set", "education_record_access_log", "directory_information_optout_list"],
    remediation:
      "Gate every education-record tool call on a role, purpose and roster check for that student, and log the requester, record and purpose.",
    failureMode:
      "The agent answers a coach's question with a student's disciplinary record because its tool returns any record to any authenticated staff user.",
    keyRisk: 0,
  },
  "EDU-K12-3": {
    l2: "Outcomes are broken down by demographic group once a year, with no thresholds and no link to placement recommendations",
    l4: "Disproportionality analysis runs each term against set thresholds with model-level mitigation, but results are not reported transparently",
    evidence: ["placement_disproportionality_report", "assessment_item_bias_test_results", "subgroup_outcome_threshold_config"],
    remediation:
      "Run a subgroup disparity test on placement and assessment recommendations each " +
      "term and hold the model release when a group crosses the agreed threshold.",
    failureMode:
      "The agent recommends lower-track placement for English learners at a higher rate because its reading-level proxy penalises dialect features.",
    keyRisk: 1,
  },
  "EDU-K12-4": {
    l2: "A generic profanity filter runs on generated text, but retrieved web content and images are not filtered",
    l4: "Filtering is mapped to the school's Internet safety policy and overrides are logged, but filter efficacy is not tested each release",
    evidence: ["internet_safety_policy_control_map", "generated_content_filter_test_results", "filter_disable_authorization_log"],
    remediation:
      "Pass every generated and retrieved item through the school-policy filter before " +
      "display, and add a per-release red-team set of harmful-to-minors prompts.",
    failureMode:
      "The agent retrieves and displays an explicit image from a web search after a pupil rephrases a biology question to slip past the text filter.",
    keyRisk: 2,
  },
  "EDU-K12-5": {
    l2: "IEP documents are uploaded, but the agent does not read the accommodations from them",
    l4: "Accommodations are applied automatically and progress toward IEP goals is reported, but effectiveness is not reviewed with the IEP team",
    evidence: ["iep_accommodation_config_per_student", "accommodation_applied_event_log", "iep_goal_progress_report"],
    remediation:
      "Load each student's IEP accommodations as structured settings the agent must " +
      "apply before it generates an activity or assessment, and log each application.",
    failureMode: "The agent gives a timed quiz without the extended time and read-aloud accommodations listed in the student's IEP.",
    keyRisk: 4,
  },
  "EDU-K12-6": {
    l2: "The district mentions AI tools on a web page, but the agent's provider and the record categories it reads are not named",
    l4: "The annual notice covers the provider and a per-service notice lists record categories, but past notice versions are not retained",
    evidence: ["annual_ferpa_notice_school_official_criteria", "per_service_record_category_notice", "notice_version_archive_by_school_year"],
    remediation:
      "Generate the per-service notice from the agent's tool and data-source manifest and fail the release when a new record category is not listed.",
    failureMode: "The agent starts reading attendance and health-office records through a new connector that the parent notice never listed.",
    keyRisk: 0,
  },
  "EDU-K12-23": {
    l2: "An AI disclosure is shown once at account creation, not at the start of each session",
    l4: "The agent discloses at each session start, but the wording is not tested with the age groups it serves",
    evidence: ["session_start_ai_disclosure_text", "age_group_comprehension_test_results", "disclosure_release_test_report"],
    remediation:
      "Inject a versioned AI disclosure as the first turn of every learner session and add a release test that fails if it is missing or altered.",
    failureMode: "The agent role-plays a historical figure or a classmate without ever telling the child that it is an AI system.",
    keyRisk: 2,
  },
  "EDU-K12-7": {
    l2: "A retention period is stated for the main database, but conversation logs have no deletion job",
    l4: "Every store is in the policy and deletion runs on schedule, but deletion from backups and model-improvement sets is not verified",
    evidence: ["child_data_store_inventory", "scheduled_deletion_job_run_log", "model_improvement_dataset_purge_record"],
    remediation:
      "Inventory every store holding children's chat logs, tag records with a purpose " +
      "expiry, and run a scheduled purge that writes a verification record per store.",
    failureMode: "The agent's chat logs with children are copied into a fine-tuning dataset that has no deletion schedule and keeps them indefinitely.",
    keyRisk: 0,
  },
  "EDU-K12-8": {
    l2: "An automated scanner runs on some interface pages, with no manual or assistive-technology testing",
    l4: "Interfaces and generated content are tested each release, but defects carry no remediation dates tied to the district's compliance date",
    evidence: ["wcag21_aa_conformance_report_per_release", "generated_content_alt_text_check_results", "accessibility_defect_remediation_tracker"],
    remediation:
      "Add an output check that blocks generated worksheets and images lacking alt text, headings or captions, and run a screen-reader pass each release.",
    failureMode: "The agent generates a math worksheet as an untagged image with no alt text, so a blind student's screen reader reads nothing.",
    keyRisk: 4,
  },
  "EDU-K12-9": {
    l2: "Educators can change a grade after it is published, but nothing lets them override an output before it takes effect",
    l4: "Every decision point has a logged override with a reason and an AI-free option exists, but override rates are not reviewed",
    evidence: ["educator_override_log_with_reason", "ai_free_assessment_option_record", "termly_override_rate_review"],
    remediation:
      "Hold agent-issued grades and activity restrictions in a pending state until an educator approves or overrides them, recording the reason.",
    failureMode: "The agent locks a student out of a course module for suspected misuse and the restriction takes effect before any teacher sees it.",
    keyRisk: 1,
  },
  "EDU-K12-10": {
    l2: "Features were discussed against the prohibitions at launch, with no recorded screen or sign-off",
    l4: "Every feature and model change has a recorded screen and emotion inference is off by configuration, but the off state is not release-tested",
    evidence: ["art5_prohibited_practice_screen_record", "emotion_inference_disabled_config", "engagement_feature_signoff_log"],
    remediation:
      "Add a release test that calls the agent's analytics endpoints for an education deployment and fails if any emotion or affect score is produced.",
    failureMode: "The agent infers frustration from a pupil's webcam and typing rhythm and nudges them with streak rewards built to keep them engaged.",
    keyRisk: 3,
  },
  "EDU-K12-11": {
    l2: "A written playbook exists, but staff make disclosures outside the agent and no record is kept",
    l4: "Threat rationale, minimum-necessary packaging and recipient allowlists are enforced, but access is not time-bounded or reviewed afterwards",
    evidence: ["emergency_disclosure_threat_rationale_record", "disclosure_recipient_allowlist", "minimum_necessary_data_package_log"],
    remediation:
      "Route every emergency disclosure request through a step that requires an " +
      "articulable-threat rationale and an allowlisted recipient before records are packaged.",
    failureMode: "The agent sends a student's full education record to an unverified caller who claims to be police and says it is an emergency.",
    keyRisk: 0,
  },
  "EDU-K12-12": {
    l2: "EU users see an age prompt, but one age threshold is applied in every Member State",
    l4: "Member-State thresholds and parental authorization are enforced with versioned consent, but provenance is not linked to purposes and categories",
    evidence: ["member_state_age_threshold_table", "parental_authorization_record", "consent_provenance_export"],
    remediation:
      "Resolve the learner's Member State before any processing, look up its age threshold " +
      "in a maintained table, and block processing until authorization is recorded.",
    failureMode:
      "The agent applies the US under-13 rule to a 14-year-old in a Member State with " +
      "a higher threshold and processes their data without parental authorization.",
    keyRisk: 0,
  },
  "EDU-K12-13": {
    l2: "High-risk uses are known informally and some logs exist, but there is no risk register or oversight criteria",
    l4: "Risk management, data governance and oversight are documented, but technical documentation is not packaged for conformity assessment",
    evidence: ["annex3_risk_register", "training_validation_dataset_governance_record", "human_oversight_escalation_criteria"],
    remediation:
      "Keep a risk register per placement and assessment use, with an escalation rule " +
      "that sends each high-impact recommendation to a named person before it applies.",
    failureMode:
      "The agent's placement model is retrained on a new term's data with no dataset " +
      "quality check and silently shifts which pupils are flagged for intervention.",
    keyRisk: 4,
  },
  "EDU-K12-16": {
    l2: "The contract limits use, but the provider's pipeline copies records into shared analytics with no check",
    l4: "Purpose-bound access and a training block are enforced in code, but per-record access logs cannot be exported to the school",
    evidence: ["purpose_bound_access_policy", "school_training_authorization_record", "per_record_access_log_export"],
    remediation:
      "Tag every education record with the disclosing school's purpose and block any pipeline " +
      "job, model training included, that reads it without a written authorization.",
    failureMode: "The agent's provider feeds student essays it received as a school official into a general model training run the school never authorized.",
    keyRisk: 0,
  },
  "EDU-K12-17": {
    l2: "Third-party recipients are listed in the privacy policy, but consent is still one bundled checkbox",
    l4: "Recipients are inventoried with integral justifications and a separate consent gates disclosure, but withdrawal is not enforced in code",
    evidence: ["third_party_recipient_inventory", "integral_disclosure_justification", "separate_disclosure_consent_record"],
    remediation:
      "Check the separate disclosure consent before any call that sends a child's data " +
      "to a model or analytics vendor not marked integral, and stop the call if absent.",
    failureMode: "The agent forwards a child's chat transcript to a third-party analytics provider when the parent consented only to collection and use.",
    keyRisk: 0,
  },
  "EDU-K12-18": {
    l2: "Survey templates are reviewed by staff, but the agent's free-form check-ins are not screened for protected categories",
    l4: "A detector gates protected-category questions on recorded consent, but the refusal and redirect paths are not tested each release",
    evidence: ["ppra_protected_category_detector_config", "prior_written_consent_record", "segregated_protected_response_store"],
    remediation:
      "Classify each check-in question the agent drafts against the protected categories " +
      "and block it unless prior written consent is on file for that student.",
    failureMode: "The agent's wellbeing check-in asks a 12-year-old about family income and conflict at home without any parental consent.",
    keyRisk: 3,
  },
  "EDU-K12-20": {
    l2: "Advertising is turned off by policy, but data-use limits are not enforced and sale is not addressed in contracts",
    l4: "Advertising, non-school profiling and sale are blocked by controls, but deletion on school request leaves no completion evidence",
    evidence: ["pupil_data_use_restriction_config", "school_deletion_request_completion_log", "data_store_security_practice_record"],
    remediation:
      "Block any agent output or export that targets ads or builds a non-school profile " +
      "from covered pupil data, and automate school-requested deletion with a receipt.",
    failureMode: "The agent recommends a paid third-party tutoring product to a pupil from a profile built on their homework history.",
    keyRisk: 0,
  },
  "EDU-K12-22": {
    l2: "A security policy exists, but it names no coordinator and does not cover children's data handled by the agent",
    l4: "A risk assessment and safeguard tests cover the agent's data flows, but no annual program evaluation is on file",
    evidence: ["information_security_coordinator_designation", "agent_data_flow_risk_assessment", "safeguard_testing_record"],
    remediation:
      "Add the agent's prompts, tool outputs, logs and model vendors to the dated risk " +
      "assessment and run a recurring test that each safeguard still blocks access.",
    failureMode: "The agent writes children's names and messages into a debug log bucket that no risk assessment covers and every engineer can read.",
    keyRisk: 0,
  },
};
