/** Per-question detail for the differently-abled pack, keyed by question id (see IndustryPackQuestionDetail). */
import type { PackQuestionDetail } from "../../industryPacks.js";

export const differentlyAbledDetail: PackQuestionDetail = {
  "EDU-DA-1": {
    l2: "Content is offered in two formats, chosen by the teacher rather than the learner",
    l4: "Learner-selectable options exist under all three principles, but option use and outcomes are not reviewed with educators",
    evidence: ["udl_option_coverage_per_activity", "learner_option_selection_log", "educator_udl_review_note"],
    remediation:
      "Require each generated activity to carry a learner-selectable option under engagement, representation, and action and expression, and fail generation " +
      "otherwise.",
    failureMode: "The agent generates every activity as a text worksheet answered by typing, shutting out learners who need audio or spoken responses.",
    keyRisk: 3,
  },
  "EDU-DA-2": {
    l2: "Static pages are partly accessible, with frequent screen reader and keyboard failures",
    l4: "Dynamic AI content is tested with assistive technology, but accessibility regression testing is not automated",
    evidence: ["wcag21_aa_test_report", "dynamic_content_live_region_test", "accessibility_regression_suite_result"],
    remediation:
      "Announce streamed agent responses through an ARIA live region and add an automated accessibility regression suite that runs on generated content each " +
      "release.",
    failureMode: "The agent streams answers into the page with no live region, so screen reader users hear nothing until they hunt for the new text.",
    keyRisk: 3,
  },
  "EDU-DA-3": {
    l2: "A style guide asks for respectful language, but the agent's outputs are never checked against it",
    l4: "Strengths-based design and language preferences are applied, but dignity impact is not assessed regularly",
    evidence: ["language_preference_setting", "dignity_output_review_sample", "deficit_framing_test_set"],
    remediation:
      "Store each learner's identity-first or person-first preference and run a test set of deficit-framed and patronising phrasings against the agent each " +
      "release.",
    failureMode:
      "The agent describes a learner by what they cannot do and lowers task difficulty on the diagnosis label alone, without any performance evidence.",
    keyRisk: 0,
  },
  "EDU-DA-4": {
    l2: "Accommodations from IEPs are entered by hand and applied inconsistently",
    l4: "Accommodation effectiveness is tracked and adjustments are suggested, but suggestions do not reach the IEP team for decision",
    evidence: ["iep_accommodation_effectiveness_report", "accommodation_adjustment_suggestion", "iep_team_decision_record"],
    remediation: "Track learner outcomes with and without each accommodation and send adjustment suggestions to the IEP team rather than applying them.",
    failureMode: "The agent removes a learner's read-aloud accommodation on its own because scores rose, without the IEP team deciding.",
    keyRisk: 1,
  },
  "EDU-DA-5": {
    l2: "One screen reader works, but switch access, eye-tracking and braille displays are untested",
    l4: "Broad assistive technology support exists, but testing across the full range of devices is irregular",
    evidence: ["at_compatibility_test_matrix", "switch_access_test_log", "braille_display_output_test"],
    remediation:
      "Keep a test matrix of screen readers, switch access, eye-tracking and braille displays, run it on each agent release, and block release on regressions.",
    failureMode: "The agent's new drag-to-match exercise cannot be completed with switch access or eye-tracking after an update.",
    keyRisk: 3,
  },
  "EDU-DA-6": {
    l2: "Disability data is marked sensitive, but the agent can read it for any purpose",
    l4: "An Art. 9(2) condition is recorded per purpose with minimisation, but audits of disability-data access are irregular",
    evidence: ["art9_condition_per_purpose_record", "disability_data_access_log", "disability_field_minimisation_review"],
    remediation:
      "Bind disability and accommodation fields to the purposes with a recorded Art. 9(2) condition and deny agent tool calls that request them for any " +
      "other purpose.",
    failureMode: "The agent pulls a learner's diagnosis into a group-project suggestion that every classmate can see.",
    keyRisk: 2,
  },
  "EDU-DA-7": {
    l2: "Explanations are offered only as dense text",
    l4: "Explanations are given in the learner's preferred format, but requests and deliveries are not logged",
    evidence: ["preferred_communication_format_record", "explanation_format_delivery_log", "easy_read_explanation_template"],
    remediation:
      "Generate the decision explanation from logged inputs and render it in the learner's recorded format, such as easy-read or AAC symbols, logging each " +
      "delivery.",
    failureMode: "The agent answers an AAC user's explanation request with a long paragraph of legal text they cannot use.",
    keyRisk: 4,
  },
  "EDU-DA-8": {
    l2: "Placement recommendations are recorded, but moves to separate settings are not flagged",
    l4: "Segregation flags and inclusive practice support exist, but inclusion outcomes are not monitored",
    evidence: ["placement_recommendation_log", "separate_setting_flag_report", "inclusion_outcome_monitor"],
    remediation:
      "Flag any agent recommendation that moves a learner to a separate setting and require a human review that records the mainstream supports considered.",
    failureMode: "The agent recommends moving an autistic learner to a separate class after a few disrupted sessions without considering mainstream supports.",
    keyRisk: 3,
  },
  "EDU-DA-9": {
    l2: "One or two of the WCAG 2.2 additions are checked informally",
    l4: "All six additions are tested with evidence, but not on every release",
    evidence: ["wcag22_new_criteria_test_report", "target_size_measurement", "dragging_alternative_test"],
    remediation:
      "Add automated checks for target size and focus not obscured, and manual tests for dragging, consistent help, redundant entry and authentication, to " +
      "each release.",
    failureMode: "The agent's interface hides the focused input under a sticky chat banner, so keyboard users lose track of where they are.",
    keyRisk: 3,
  },
  "EDU-DA-10": {
    l2: "Accessibility requirements cover in-house screens, but third-party plugins and AI-generated content are not covered",
    l4: "Procurement clauses, AI content checks and third-party evidence exist, but defect remediation is not tracked against SLAs",
    evidence: ["procurement_accessibility_clause", "third_party_conformance_evidence", "accessibility_defect_sla_tracker"],
    remediation:
      "Refuse to enable an LMS plugin or tool integration for the agent until its accessibility conformance evidence is on file, and track learner-affecting " +
      "defects against an SLA.",
    failureMode: "The agent calls a third-party quiz plugin that is unusable with screen readers, and the defect sits unassigned for a term.",
    keyRisk: 3,
  },
  "EDU-DA-11": {
    l2: "Templates meet contrast, but generated charts and overlays are never checked",
    l4: "Automated contrast tests cover dynamic and generated states, but failures are not tracked to remediation",
    evidence: ["contrast_ratio_test_results", "generated_chart_palette_check", "contrast_defect_log"],
    remediation:
      "Compute the contrast ratio of every generated chart, annotation and overlay before render, and regenerate any text below 4.5:1 (3:1 for large text).",
    failureMode: "The agent draws chart labels in light grey on white, so learners with low vision cannot read the data.",
    keyRisk: 3,
  },
  "EDU-DA-12": {
    l2: "WCAG testing has been done, but results are not mapped to the Revised 508 Standards or packaged for procurement",
    l4: "A report against E205.4 with test evidence exists, but traceability from criteria to implementation is missing or stale",
    evidence: ["revised_508_e205_conformance_report", "wcag20_criterion_test_evidence", "criterion_to_implementation_trace"],
    remediation: "Generate the conformance report from per-criterion WCAG 2.0 A/AA test results on the agent's generated content, and refresh it each release.",
    failureMode: "The agent produces course PDFs with no tags or reading order while the procurement report claims conformance with no test behind it.",
    keyRisk: 3,
  },
  "EDU-DA-13": {
    l2: "Placement labels are reported, with scattered notes on supports",
    l4: "Supports, educator training and service delivery are coordinated, but inclusion outcomes do not feed improvement",
    evidence: ["mainstream_support_plan", "related_service_delivery_log", "inclusion_outcome_dashboard"],
    remediation:
      "Track speech, OT and AT service delivery against each learner's support plan and report participation and attainment in the mainstream class, not " +
      "placement alone.",
    failureMode:
      "The agent reports inclusion as achieved because learners are enrolled in mainstream classes while their scheduled speech therapy never happens.",
    keyRisk: 3,
  },
  "EDU-DA-14": {
    l2: "Passwords are required and paste is blocked on some screens",
    l4: "Every authentication path passes SC 3.3.8 in automated checks, but no testing with users with cognitive disabilities has been done",
    evidence: ["auth_path_sc338_test", "passkey_email_link_option", "cognitive_disability_user_test_record"],
    remediation:
      "Offer passkeys or email links on every sign-in path, allow paste and password managers, and add an automated check that fails on puzzles or code " +
      "transcription.",
    failureMode:
      "The agent's re-authentication step makes a learner with a memory impairment transcribe a code from another device, locking them out mid-lesson.",
    keyRisk: 4,
  },
  "EDU-DA-15": {
    l2: "Assistive technology listed in the IEP is noted, but never checked against the agent",
    l4: "IEP assistive technology is mapped to tested configurations and gaps are reported, but compatibility is not re-tested each release",
    evidence: ["iep_at_requirement_map", "at_configuration_test_result", "iep_team_gap_report"],
    remediation: "Map each IEP-listed assistive technology to a tested agent configuration and report any gap to the IEP team with a date.",
    failureMode:
      "The agent substitutes its own text-to-speech for the refreshable braille display in a learner's IEP, so the braille literacy goal is never practised.",
    keyRisk: 1,
  },
  "EDU-DA-16": {
    l2: "IEP data sits in a restricted store, but the agent's reads of it are not recorded",
    l4: "Per-access records and consent gating exist, but parents are not told when information is no longer needed",
    evidence: ["idea_record_of_access", "disclosure_parental_consent_record", "parent_destruction_notice_log"],
    remediation:
      "Write a record of access with party, date and purpose for every agent read of IEP or evaluation data, and gate disclosures on recorded parental " +
      "consent.",
    failureMode:
      "The agent includes a learner's evaluation results in a summary emailed to an outside tutor with no parental consent and no record of the access.",
    keyRisk: 2,
  },
};
