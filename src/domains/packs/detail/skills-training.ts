/** Per-question detail for the skills-training pack, keyed by question id (see IndustryPackQuestionDetail). */
import type { PackQuestionDetail } from "../../industryPacks.js";

export const skillsTrainingDetail: PackQuestionDetail = {
  "EDU-ST-1": {
    l2: "Course outcomes carry an EQF level assigned by hand, with no link to how they are assessed",
    l4: "Assessments are validated against NQF rigor and support cross-border recognition, but micro-credentials are not leveled",
    evidence: ["eqf_level_descriptor_mapping", "nqf_assessment_rigor_review", "micro_credential_level_record"],
    remediation:
      "Require each competency assessment the agent generates to cite the EQF level descriptor it measures, and reject items whose rubric sits above or " +
      "below that level.",
    failureMode: "The agent awards an EQF level 5 outcome on the strength of a recall quiz pitched at level 3.",
    keyRisk: 2,
  },
  "EDU-ST-2": {
    l2: "Safety-critical skills are listed, but a simulation score alone can sign them off",
    l4: "Hands-on and workplace assessment is required and simulation transfer is checked, but skill decay is not monitored",
    evidence: ["safety_critical_skill_register", "hands_on_assessor_signoff", "simulation_to_practice_transfer_record"],
    remediation: "Block the agent from marking a safety-critical skill achieved until a qualified assessor's hands-on sign-off is recorded for that learner.",
    failureMode: "The agent marks an apprentice electrician competent in live-circuit isolation after a VR simulation with no supervised practical.",
    keyRisk: 1,
  },
  "EDU-ST-3": {
    l2: "Enrolment is reported by demographic group, but the agent's pathway recommendations are not analysed",
    l4: "Pathway equity is analysed and anti-tracking safeguards run, but the recommendation method is not published",
    evidence: ["pathway_recommendation_equity_report", "demographic_access_monitor", "anti_tracking_rule_config"],
    remediation:
      "Compare the agent's pathway recommendations by group against learners' stated goals each cohort, and require counsellor review when a group is routed " +
      "to lower-wage pathways more often.",
    failureMode: "The agent steers women and older learners toward short care-assistant courses instead of the welding programmes they asked about.",
    keyRisk: 0,
  },
  "EDU-ST-4": {
    l2: "A quality management system exists and names the AI components, but internal audit does not cover them",
    l4: "AI-delivered and AI-assessed learning is in scope and audited, but nonconformities are not tracked to closure",
    evidence: ["eoms_scope_statement", "ai_course_internal_audit_report", "nonconformity_closure_log"],
    remediation:
      "Add AI-generated course content and AI scoring to the internal audit plan and open a nonconformity record for each audit finding against them.",
    failureMode: "The agent regenerates a course module after a model update and its new scoring rubric never passes a design review or internal audit.",
    keyRisk: 2,
  },
  "EDU-ST-5": {
    l2: "Credentials are issued as PDF documents listing competencies that employers cannot verify",
    l4: "Verifiable Europass digital credentials link to evidence, but the AI assessment method is not stated on the credential",
    evidence: ["europass_digital_credential_record", "credential_signature_verification_log", "ai_assessment_method_statement"],
    remediation:
      "Issue each AI-assessed competency as a signed Europass digital credential that links to its assessment evidence and states the AI's role in the " +
      "assessment.",
    failureMode: "The agent issues a credential listing competencies the learner was never assessed on because it copied the course catalogue description.",
    keyRisk: 3,
  },
  "EDU-ST-6": {
    l2: "PPE training content is delivered, but no one checks it against current requirements",
    l4: "Comprehension is verified and training currency is tracked, but incidents do not trigger retraining",
    evidence: ["ppe_training_content_review", "comprehension_check_results", "training_currency_tracker"],
    remediation:
      "Gate completion of PPE training on a comprehension check the learner passes, check content against the employer's hazard assessment, and schedule " +
      "refreshers from a currency tracker.",
    failureMode:
      "The agent marks PPE training complete when a worker clicks through the slides and states a respirator rule that is not in the employer's hazard " +
      "assessment.",
    keyRisk: 1,
  },
  "EDU-ST-7": {
    l2: "Erasure requests are handled by hand and sometimes remove records needed to verify a qualification later",
    l4: "Erasure and retention rules are automated, but expired records are not anonymised",
    evidence: ["erasure_request_decision_log", "qualification_record_retention_schedule", "expired_record_anonymisation_log"],
    remediation:
      "Classify each learner record as erasable or retained for qualification verification before acting on an erasure request, and record the rule applied.",
    failureMode: "The agent deletes a learner's full assessment history on an erasure request, so the awarding body can no longer verify the qualification.",
    keyRisk: 3,
  },
  "EDU-ST-8": {
    l2: "Portfolio evidence is accepted, but it is scored with the same rubric as formal coursework",
    l4: "Work experience and non-formal learning are recognised with flexible evidence, but pass rates are not compared by evidence route",
    evidence: ["rpl_portfolio_assessment_record", "work_experience_validation_log", "rpl_outcome_by_route_report"],
    remediation:
      "Score RPL portfolios against competency outcomes rather than course credits, and compare pass rates for formal and non-formal evidence routes each " +
      "cohort.",
    failureMode: "The agent rejects a veteran bricklayer's portfolio because it finds no formal course credits to match against the unit.",
    keyRisk: 0,
  },
  "EDU-ST-10": {
    l2: "An accommodation email address exists, but requests are not tracked and assessments have no alternative format",
    l4: "Modification workflows and alternative assessments are documented, but accommodation decisions are not auditable end to end",
    evidence: ["reasonable_modification_request_log", "alternative_assessment_routing_record", "auxiliary_aid_provision_record"],
    remediation:
      "Route each accommodation request into a tracked workflow and have the agent switch the learner's assessment to the approved alternative format before " +
      "it starts.",
    failureMode: "The agent gives a deaf learner a spoken-instruction practical assessment with no captions or interpreter despite an approved accommodation.",
    keyRisk: 4,
  },
  "EDU-ST-11": {
    l2: "Attendance is tracked, but leave entitlement and leave requests are handled outside the agent",
    l4: "Leave rules, requests and non-retaliation controls are configured, but leave approvals are not linked to participation outcomes",
    evidence: ["training_leave_entitlement_rules", "leave_request_decision_log", "leave_participation_outcome_link"],
    remediation: "Check the learner's configured leave entitlement before scheduling a session, and send any leave denial to a person with the reason logged.",
    failureMode: "The agent schedules a shift worker's training during working hours and marks them absent, with no record of the leave they could request.",
    keyRisk: 4,
  },
  "EDU-ST-12": {
    l2: "Completion and satisfaction are tracked, but there is no defined enablers loop or employer input",
    l4: "Quality indicators, instructor supports and employer links are defined, but evidence is not tied to improvement actions",
    evidence: ["tvet_quality_indicator_dashboard", "employer_partnership_input_log", "improvement_action_register"],
    remediation:
      "Record employer and work-based learning feedback per course and require the agent to cite an improvement action before it regenerates course content.",
    failureMode: "The agent reports high completion rates to funders while employer feedback that graduates lack site-ready skills never reaches the course.",
    keyRisk: 2,
  },
  "EDU-ST-13": {
    l2: "A needs analysis is written for some services, but learning goals and evaluation criteria are set separately",
    l4: "Needs analyses with sponsor sign-off trace to goals and evaluation, but they are not revisited when evaluation shows a gap",
    evidence: ["learning_needs_analysis_record", "sponsor_needs_signoff", "goal_to_evaluation_trace"],
    remediation:
      "Require a signed-off needs analysis as an input to the agent's course-generation tool and reject generated goals that do not trace back to it.",
    failureMode: "The agent generates a forklift course from a generic template without the employer's site requirements or the learners' language needs.",
    keyRisk: 2,
  },
  "EDU-ST-14": {
    l2: "Learners receive a pass or fail with no reasons, and appeals go to a general mailbox",
    l4: "Reason codes, evidence bundles and an appeal workflow with SLAs exist, but reconsideration outcomes are not audited",
    evidence: ["placement_reason_code_record", "appeal_evidence_bundle", "human_reconsideration_outcome_log"],
    remediation:
      "Attach reason codes and the evidence used to every AI placement or assessment outcome, and route appeals to a named reviewer with a tracked deadline.",
    failureMode:
      "The agent fails a learner's competency assessment and the learner cannot see which evidence was judged insufficient or ask a person to reconsider.",
    keyRisk: 0,
  },
  "EDU-ST-15": {
    l2: "AI proctoring is mentioned in enrolment terms rather than before each assessment",
    l4: "Notice is given before each assessment and every flag is reviewed with its evidence, but learners cannot contest a sanction",
    evidence: ["pre_assessment_ai_proctoring_notice", "flag_human_review_record", "sanction_reason_log"],
    remediation:
      "Show the high-risk AI notice at the start of every proctored assessment and block sanctions until a trained reviewer records a decision on the flag.",
    failureMode: "The agent voids a learner's trade test on an unreviewed second-face flag that was a colleague walking past the workshop camera.",
    keyRisk: 3,
  },
  "EDU-ST-16": {
    l2: "Notice is shown at interaction, but adverse outcomes get no description and correction requests are ad hoc",
    l4: "Adverse-outcome descriptions go out within 30 days and corrections and reconsideration are tracked, but records are not kept for 3 years",
    evidence: ["point_of_interaction_notice", "adverse_outcome_description_log", "human_reconsideration_request_tracker"],
    remediation:
      "Trigger a plain-language description of the agent's role on each adverse eligibility outcome, track it against the 30-day limit, and keep the records " +
      "at least 3 years.",
    failureMode:
      "The agent denies a Colorado applicant a funded training place and the applicant is never told AI was involved or offered human reconsideration.",
    keyRisk: 4,
  },
};
