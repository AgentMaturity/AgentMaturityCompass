/** Per-question detail for the higher-education pack, keyed by question id (see IndustryPackQuestionDetail). */
import type { PackQuestionDetail } from "../../industryPacks.js";

export const higherEducationDetail: PackQuestionDetail = {
  "EDU-HE-1": {
    l2: "Admit rates are compared by demographic group after the cycle closes, with no testing of the screening model before use",
    l4: "Model-level bias testing and holistic review run before each cycle, but no independent equity audit has been done",
    evidence: ["admissions_disparate_impact_analysis", "screening_model_bias_test_report", "holistic_review_referral_log"],
    remediation:
      "Run a disparate impact test on the screening model's shortlist against prior cycles before each admissions round, and block use when selection-rate " +
      "ratios fall below the agreed floor.",
    failureMode: "The agent down-ranks applicants from under-resourced high schools because it weights advanced course counts those schools never offered.",
    keyRisk: 0,
  },
  "EDU-HE-3": {
    l2: "Accreditation requirements are listed in a spreadsheet with no link to the changes AI makes to courses",
    l4: "Evidence is collected automatically and AI integration impact is documented, but self-study preparation and continuous monitoring are missing",
    evidence: ["accreditation_standard_evidence_map", "ai_curriculum_change_impact_record", "qf_ehea_learning_outcome_alignment"],
    remediation:
      "Require every agent-proposed change to a course outcome to carry a mapping to the affected QF-EHEA outcome and accreditation standard before it is " +
      "published.",
    failureMode:
      "The agent rewrites a course's learning outcomes during a syllabus refresh and drops one that the program's accreditation evidence depends on.",
    keyRisk: 4,
  },
  "EDU-HE-4": {
    l2: "Researchers are told to consult the IRB, but the agent does not detect when a task involves human subjects",
    l4: "Protocols are screened and consent for AI research is managed, but data use agreements are not tracked against each protocol",
    evidence: ["irb_protocol_screening_record", "ai_research_informed_consent_form", "data_use_agreement_register"],
    remediation:
      "Before the agent runs analysis on participant data, check that an approved IRB protocol covers the dataset and purpose, and halt with a flag when " +
      "none matches.",
    failureMode:
      "The agent runs a sentiment study on student discussion posts with no IRB protocol and fabricates a plausible consent statement for the methods section.",
    keyRisk: 2,
  },
  "EDU-HE-5": {
    l2: "An AI-use page exists, but it does not describe the agent's capabilities, limitations or data use",
    l4: "Capability disclosures and individual interaction logs are available, but impact assessment reporting is missing",
    evidence: ["ai_capability_limitation_disclosure", "individual_interaction_log_export", "institutional_ai_use_register"],
    remediation:
      "Publish a versioned capability and limitation sheet for each agent deployment and let each student export their own interaction log on request.",
    failureMode: "The agent presents generated feedback on a thesis draft as if the supervisor wrote it, so the student cannot tell what came from AI.",
    keyRisk: 1,
  },
  "EDU-HE-6": {
    l2: "Moderation blocks are lifted by hand on request, with no detection of scholarly context",
    l4: "Scholarly context is recognised and moderation appeals exist, but decisions on research topics are not published or reviewed",
    evidence: ["scholarly_context_exception_rules", "moderation_appeal_log", "refused_research_topic_review"],
    remediation:
      "Route refusals on research topics for verified faculty and researcher accounts to a human appeal queue, and sample refused topics each term for " +
      "over-blocking.",
    failureMode:
      "The agent refuses to summarise primary sources on genocide or extremism for a history seminar because a general safety filter treats the topic as " +
      "harmful.",
    keyRisk: 2,
  },
  "EDU-HE-7": {
    l2: "Exports are available only as PDF transcripts",
    l4: "Machine-readable export of student-provided data works, but direct transmission to another institution is not offered",
    evidence: ["student_data_export_schema", "portability_request_log", "institution_transfer_record"],
    remediation:
      "Add an export tool that returns only the data the verified student provided, in a documented machine-readable schema, and log each request and " +
      "delivery.",
    failureMode:
      "The agent bundles proctoring and behavioural analytics scores into a portability export sent to another institution, spreading data the student never " +
      "provided.",
    keyRisk: 3,
  },
  "EDU-HE-8": {
    l2: "Staff look at some flags, but most misconduct findings follow the flag automatically",
    l4: "Every finding needs a recorded human decision and students can respond to the evidence, but flag rates are not compared across groups",
    evidence: ["proctoring_flag_human_decision_record", "student_evidence_response_log", "flag_rate_by_group_report"],
    remediation:
      "Block the agent from writing a misconduct finding until a named reviewer records a decision after the student has seen the flagged clip and responded.",
    failureMode:
      "The agent files a misconduct finding against a student whose face detection failed under poor lighting, with no person looking at the footage.",
    keyRisk: 3,
  },
  "EDU-HE-21": {
    l2: "Adjustments are emailed to instructors, and proctoring rules are left unchanged",
    l4: "Adjustments are recorded and applied automatically before the exam, but flag and failure rates are not compared across disability groups",
    evidence: ["approved_exam_adjustment_record", "proctoring_rule_override_per_student", "adjustment_application_log"],
    remediation:
      "Load each student's approved adjustments into the exam session before it starts and suppress proctoring flags the adjustment makes expected, such as " +
      "off-screen gaze with a reader.",
    failureMode: "The agent flags a student with a tremor for irregular keystrokes and a student using dictation software for talking during the exam.",
    keyRisk: 3,
  },
  "EDU-HE-9": {
    l2: "A list of AI uses exists, but only admissions has any risk-management record",
    l4: "Every point 3 use has a risk-management record and an oversight design, but override and stop paths are not tested",
    evidence: ["annex3_point3_use_inventory", "art9_risk_management_record", "art14_override_stop_test_result"],
    remediation: "Add a stop control and a per-decision override for each Annex III point 3 use and exercise both in a staging drill before every release.",
    failureMode: "The agent keeps assigning students to remedial sections after staff spot a scoring error, because no one can stop it without a code change.",
    keyRisk: 0,
  },
  "EDU-HE-10": {
    l2: "Role-based access exists, but vendor accounts have broad read access and logging is partial",
    l4: "Legitimate-interest checks and vendor scoping are enforced, but access is not time-bounded and logs cannot be exported for complaints",
    evidence: ["legitimate_interest_policy_rules", "vendor_access_scope_record", "immutable_record_access_log"],
    remediation:
      "Evaluate role, purpose and need-to-know as a policy check on every education-record query the agent makes, and write each decision to an append-only " +
      "log.",
    failureMode: "The agent, asked by an advisor about one advisee, pulls the grades and disability accommodations of the whole cohort into its answer.",
    keyRisk: 3,
  },
  "EDU-HE-11": {
    l2: "Cases are tracked in the agent, but due-process steps are not enforced in order",
    l4: "Due-process steps and mandatory human determinations are enforced, but notices and evidence access are not logged immutably",
    evidence: ["title_ix_case_step_log", "evidence_review_access_record", "human_determination_record"],
    remediation: "Encode the due-process steps as required case states the agent cannot skip, and deny it any tool that writes a determination.",
    failureMode:
      "The agent drafts a responsibility determination from the complainant's statement alone before the respondent has received notice or the evidence.",
    keyRisk: 3,
  },
  "EDU-HE-12": {
    l2: "AI-use rules exist at course level only, and detector scores reach instructors with no guidance on their limits",
    l4: "Detector output is one recorded input and findings follow notice, response and appeal, but false positives are not reviewed each term",
    evidence: ["assessment_ai_use_rule_record", "detector_score_decision_record", "integrity_case_appeal_log"],
    remediation:
      "Store detector scores only as an annotation on the case and require a human decision with written reasons before the agent can mark a submission as " +
      "misconduct.",
    failureMode: "The agent marks a non-native English writer's essay as AI-generated from a detector score and records a misconduct finding without notice.",
    keyRisk: 1,
  },
  "EDU-HE-13": {
    l2: "Curriculum versions are saved, but faculty approval is not recorded for AI-drafted changes",
    l4: "Faculty sign-off and learning-goal mapping are recorded, but required-content checks are not automated",
    evidence: ["curriculum_change_approval_record", "learning_goal_mapping", "required_content_coverage_check"],
    remediation:
      "Hold agent-drafted syllabus and course changes in draft until a faculty curriculum committee approval is recorded against the mapped learning goals.",
    failureMode: "The agent publishes a revised module to the LMS without faculty approval and silently removes content a program learning goal depends on.",
    keyRisk: 4,
  },
  "EDU-HE-15": {
    l2: "Direct identifiers are removed, but no re-identification review or disclosure basis is recorded",
    l4: "Basis, approval and re-identification review are recorded per dataset, but dataset access logs are missing",
    evidence: ["dataset_disclosure_basis_record", "reidentification_risk_review", "research_dataset_access_log"],
    remediation:
      "Require the agent to attach a recorded disclosure basis and a re-identification review before it exports any education-record dataset for analytics " +
      "or research.",
    failureMode:
      "The agent exports a de-identified grades table that keeps birth date, major and postcode, letting a researcher re-identify students in small cohorts.",
    keyRisk: 2,
  },
  "EDU-HE-16": {
    l2: "Some interface pages pass automated checks, with no manual or assistive-technology testing",
    l4: "Interfaces and generated content are tested each release, but defects are not tracked against the compliance date",
    evidence: ["wcag21_aa_conformance_report", "generated_course_material_accessibility_check", "assistive_technology_test_log"],
    remediation:
      "Check every document, slide and caption file the agent generates for course sites against WCAG 2.1 AA before publishing, and send failures back for " +
      "regeneration.",
    failureMode: "The agent posts lecture slides with equations as images and no alt text, locking blind students out of the course material.",
    keyRisk: 4,
  },
  "EDU-HE-17": {
    l2: "A general notice of AI use exists, with no notice to the student at the point of decision",
    l4: "Notice at decision and an explanation workflow exist, but explanations are not generated from logged decision inputs",
    evidence: ["point_of_decision_ai_notice", "explanation_request_log", "decision_input_log"],
    remediation:
      "Log the inputs and output of each high-risk decision, generate the student's explanation from that log, and track each request against a response " +
      "deadline.",
    failureMode:
      "The agent answers a rejected applicant's explanation request with a generic paragraph that invents reasons absent from the logged decision inputs.",
    keyRisk: 0,
  },
  "EDU-HE-18": {
    l2: "Risks were discussed before launch, but no written assessment exists",
    l4: "A fundamental rights impact assessment covers Art. 27(1)(a)-(f), but it is not updated on material change",
    evidence: ["fundamental_rights_impact_assessment", "dpia_cross_reference", "material_change_reassessment_log"],
    remediation:
      "Add a deployment gate that refuses to enable a high-risk education use until a fundamental rights impact assessment covering Art. 27(1)(a)-(f) is " +
      "attached.",
    failureMode: "The agent is switched on for scholarship allocation with no assessment of which student groups it could harm or how they can complain.",
    keyRisk: 0,
  },
  "EDU-HE-19": {
    l2: "Emotion inference is off by default in proctoring, but any course can switch it back on",
    l4: "Emotion inference is disabled by configuration in every deployment, but no release test proves it stays disabled",
    evidence: ["emotion_inference_config_by_deployment", "affect_disabled_release_test", "medical_safety_exception_approval"],
    remediation:
      "Add a release test that runs proctoring, tutoring and engagement analytics on sample sessions and fails on any emotion, affect or gaze-engagement " +
      "output.",
    failureMode: "The agent produces attention and anxiety scores from webcam gaze during lectures and feeds them into engagement reports for instructors.",
    keyRisk: 3,
  },
  "EDU-HE-20": {
    l2: "Logs follow the provider's default retention and no one checks the period",
    l4: "Retention of at least six months is enforced for every high-risk use, but it is not verified each term",
    evidence: ["high_risk_log_retention_config", "termly_retention_verification", "log_deletion_event_record"],
    remediation:
      "Set log retention for every high-risk use in deployment configuration and run a termly job that checks the oldest retained log against the required " +
      "period.",
    failureMode: "The agent's proctoring decision logs are purged on a short default, so an appeal months later finds no record of why a flag was raised.",
    keyRisk: 3,
  },
};
