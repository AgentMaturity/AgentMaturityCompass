/** Per-question detail for the specialized-education pack, keyed by question id (see IndustryPackQuestionDetail). */
import type { PackQuestionDetail } from "../../industryPacks.js";

export const specializedEducationDetail: PackQuestionDetail = {
  "EDU-SE-1": {
    l2: "Educators can ask students not to use AI, but the creative tools have no AI-free mode",
    l4: "An AI-free mode and per-portfolio AI share reporting exist, but educators cannot require AI-free work per assignment",
    evidence: ["ai_free_mode_config", "portfolio_ai_contribution_report", "assignment_ai_free_requirement"],
    remediation: "Log every AI contribution to a student's work with its size and compute the AI-generated share per portfolio for the educator.",
    failureMode: "The agent auto-completes a student's composition with its own melody and the portfolio presents it as the student's work.",
    keyRisk: 0,
  },
  "EDU-SE-2": {
    l2: "Some sources are recorded, but there is no check on whether use stays within the teaching exception",
    l4: "Sources are recorded and each use is scope-checked, but out-of-scope uses are not blocked or routed for licensing",
    evidence: ["protected_work_source_record", "teaching_exception_scope_check", "licensing_referral_log"],
    remediation:
      "Check each reproduction of a protected work against illustration-for-teaching and non-commercial scope before output, and route out-of-scope requests " +
      "for licensing.",
    failureMode: "The agent reproduces a full protected score for a school's ticketed public concert programme because the request said it was for students.",
    keyRisk: 2,
  },
  "EDU-SE-3": {
    l2: "Attribution is added only when asked, and there is no restricted-motif list",
    l4: "Attribution and stakeholder-agreed restricted-motif lists are in place with logged overrides, but overrides are not reviewed",
    evidence: ["cultural_source_attribution_record", "restricted_motif_list_with_stakeholders", "motif_override_log"],
    remediation: "Check generated designs against the community-agreed restricted-motif list before output and log any educator override with a reason.",
    failureMode: "The agent generates a generic tribal-style textile pattern that reuses a sacred motif from a named community with no attribution.",
    keyRisk: 1,
  },
  "EDU-SE-4": {
    l2: "One rubric is used, with a note that other traditions may need different criteria",
    l4: "Culturally responsive rubrics are community-validated and used, but the assessment method is not published",
    evidence: ["culturally_responsive_rubric_set", "community_rubric_validation_record", "score_by_tradition_report"],
    remediation: "Score work against the rubric for the tradition the student declares, and compare score distributions across traditions each term.",
    failureMode: "The agent marks a Carnatic vocal piece down for pitch instability because its rubric assumes Western equal temperament.",
    keyRisk: 4,
  },
  "EDU-SE-5": {
    l2: "A basic content filter runs, but AI-generated works are not labelled",
    l4: "Labels and harmful-content prevention are in place, but moderation decisions are not explained to students",
    evidence: ["ai_generated_content_label_record", "creative_output_safety_filter_log", "moderation_decision_notice"],
    remediation: "Label every AI-generated image, audio or text output at display and run the output safety filter before it reaches the student.",
    failureMode: "The agent generates a realistic image of a classmate in a violent scene for an art project and returns it unlabelled.",
    keyRisk: 0,
  },
  "EDU-SE-18": {
    l2: "An age screen exists, but under-13 accounts can upload work before consent is recorded",
    l4: "Uploads, recordings and images are blocked until consent is recorded, but withdrawal does not stop processing",
    evidence: ["under13_age_screen_log", "verifiable_parental_consent_record", "upload_block_until_consent_test"],
    remediation: "Disable upload, recording and camera tools for any under-13 account until a verifiable parental consent record exists.",
    failureMode: "The agent accepts a 9-year-old's voice recording and a self-portrait photo before any parental consent is recorded.",
    keyRisk: 2,
  },
  "EDU-SE-6": {
    l2: "Capabilities are described in marketing material, with no stated limits and no session logs",
    l4: "A versioned capability sheet and per-session logs exist, but the educator override is not tested",
    evidence: ["capability_limitation_sheet_version", "session_interaction_log", "educator_override_test_record"],
    remediation: "Publish a versioned capability and limitation sheet per creative tool release and expose per-session interaction logs to the class educator.",
    failureMode:
      "The agent rewrites a student's poem in a standard style and the educator has no log showing what the student wrote and what the agent changed.",
    keyRisk: 0,
  },
  "EDU-SE-7": {
    l2: "Visible labels are added to images only, not to audio or text outputs",
    l4: "Machine-readable marking is applied to every output, but detectability is not tested each release",
    evidence: ["output_marking_config", "marking_detector_test_result", "marking_coverage_by_media_type"],
    remediation: "Embed machine-readable marking in every image, audio and text output and add a release test that runs a detector on sample outputs.",
    failureMode: "The agent's generated music tracks carry no machine-readable marking, so students enter them in competitions as original work.",
    keyRisk: 2,
  },
  "EDU-SE-8": {
    l2: "Standard pages pass basic checks, but creative canvases can only be used with a mouse",
    l4: "Creative tools support alternative inputs and sensory accommodation, but testing with diverse learner groups is irregular",
    evidence: ["creative_tool_wcag21_test_results", "alternative_input_support_matrix", "learner_accessibility_test_session"],
    remediation: "Add keyboard, switch and voice operation to each creative canvas and test them with learners who use those inputs each release.",
    failureMode: "The agent's drawing tool offers only drag gestures, so a learner using switch access cannot take part in the art assignment.",
    keyRisk: 0,
  },
  "EDU-SE-17": {
    l2: "A generic accessibility statement exists, but it does not mention the creative tools",
    l4: "The statement lists each tool's non-accessible content and alternatives, but feedback requests go unanswered",
    evidence: ["accessibility_statement_tool_section", "accessibility_feedback_request_log", "alternative_content_provision_record"],
    remediation:
      "Generate each creative tool's section of the accessibility statement from its release test results, and log and answer every feedback request.",
    failureMode:
      "The agent answers a learner's accessibility complaint with a canned chatbot reply and the inaccessible content is never provided another way.",
    keyRisk: 0,
  },
  "EDU-SE-9": {
    l2: "Published works are excluded from training, but student works are used without checking for rights reservations",
    l4: "Opt-out detection and provenance tracking exist, but training data licensing is not documented",
    evidence: ["tdm_optout_detection_log", "student_work_training_provenance", "training_data_licence_record"],
    remediation: "Check each student creative work for a machine-readable rights reservation before adding it to a training set, and exclude reserved works.",
    failureMode: "The agent adds students' portfolios to a fine-tuning set even though the school's site carries a machine-readable rights reservation.",
    keyRisk: 2,
  },
  "EDU-SE-10": {
    l2: "An accessibility conformance report covers the main interface but not the creative tools",
    l4: "A Revised 508 report covers each tool with 502-504 evidence, but regression testing does not run each release",
    evidence: ["revised_508_accessibility_conformance_report", "at_interoperability_502_test", "authoring_tool_504_test"],
    remediation:
      "Test each creative tool against Revised 508 sections 502-504 with assistive technology and attach the results to the conformance report each release.",
    failureMode: "The agent's music notation editor exposes no accessible names to screen readers, so a learner in a federal program cannot use it.",
    keyRisk: 0,
  },
  "EDU-SE-11": {
    l2: "Professional development resources are listed, but arts education capacity is not planned or measured",
    l4: "PD pathways, partnerships and resourcing are tracked, but equity of access to arts learning is not monitored",
    evidence: ["arts_educator_pd_pathway_record", "cultural_institution_partnership_mou", "arts_access_equity_report"],
    remediation: "Track arts educator PD and partnerships with local cultural institutions per school, and report schools where arts access is falling.",
    failureMode: "The agent replaces live sessions with local traditional musicians with generated lessons, and the partnerships lapse unnoticed.",
    keyRisk: 3,
  },
  "EDU-SE-12": {
    l2: "Simplified language and hints exist, but neither learners nor educators can adjust pace or cognitive load",
    l4: "Scaffolds map to ICF categories with personal controls, but support effectiveness is not monitored over time",
    evidence: ["icf_b117_support_mapping", "scaffold_setting_per_learner", "support_effectiveness_report"],
    remediation: "Expose pacing, chunking and comprehension-check settings per learner and track task completion with and without each scaffold.",
    failureMode:
      "The agent presents a multi-step composition task as one dense block to a learner with an intellectual disability and scores them low when they stall.",
    keyRisk: 4,
  },
  "EDU-SE-13": {
    l2: "Guidance documents exist, but educators have no structured feedback loop",
    l4: "Reflective loops and network participation workflows exist, but professional learning outcomes are not measured",
    evidence: ["educator_reflection_log", "pln_participation_record", "pedagogy_iteration_record"],
    remediation:
      "Collect educator feedback after each AI-supported creative lesson and share it in the professional network space alongside the lesson plan version.",
    failureMode:
      "The agent keeps pushing the same generated lesson template to art teachers and never captures their feedback that it flattens student styles.",
    keyRisk: 0,
  },
  "EDU-SE-14": {
    l2: "Attribution is generated for some assets, with no license compatibility check",
    l4: "TASL attribution and compatibility checks are automated, but provenance manifests miss some assets",
    evidence: ["tasl_attribution_record", "license_compatibility_check", "oer_licensing_manifest"],
    remediation: "Check every asset the agent includes in a remix against NC, ND and ShareAlike terms before publishing, and write a licensing manifest.",
    failureMode: "The agent remixes a CC BY-ND photo into a student collage and publishes the result under CC BY on the school's OER site.",
    keyRisk: 2,
  },
  "EDU-SE-15": {
    l2: "A manual matrix exists for some regions, but rollout does not wait for it",
    l4: "Rollout is gated on the matrix, but evidence bundles are assembled by hand and retained inconsistently",
    evidence: ["jurisdiction_accessibility_matrix", "deployment_evidence_bundle", "release_gate_block_log"],
    remediation:
      "Add a release gate that looks up the deployment's jurisdiction in the matrix and blocks rollout until the matching evidence bundle is attached.",
    failureMode: "The agent's creative suite is rolled out to an EU public school with only a US VPAT and no accessibility statement.",
    keyRisk: 0,
  },
  "EDU-SE-16": {
    l2: "Generic AI training exists, with nothing specific to the creative tools",
    l4: "Role-specific material per tool version exists and uptake is recorded, but it is not refreshed when capabilities change",
    evidence: ["tool_specific_literacy_material", "educator_uptake_record", "capability_change_refresh_log"],
    remediation:
      "Ship role-specific literacy notes with each creative tool release covering limits, output marking and override, and record which educators have read " +
      "them.",
    failureMode:
      "The agent produces invented traditional patterns that educators present as authentic because no one told them the tool fabricates cultural detail.",
    keyRisk: 1,
  },
};
