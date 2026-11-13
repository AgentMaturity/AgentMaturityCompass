/** Per-question detail for the dance-of-democracy pack, keyed by question id (see IndustryPackQuestionDetail). */
import type { PackQuestionDetail } from "../../industryPacks.js";

export const danceOfDemocracyDetail: PackQuestionDetail = {
  "GOV-DD-1": {
    l2: "A policy forbids manipulative techniques, but nothing in the agent's generation or targeting pipeline checks for them",
    l4:
      "Prohibited techniques are blocked and an electoral influence impact assessment exists, but adversarial anti-manipulation testing is not run on each " +
      "release",
    evidence: ["art5_1_a_manipulation_technique_screen_log", "electoral_influence_impact_assessment", "adversarial_persuasion_red_team_report"],
    remediation:
      "Add a pre-publication check that blocks electoral messages using subliminal cues, false urgency or fear framing aimed at voting behaviour, and run " +
      "an adversarial test set against it on every release.",
    failureMode:
      "The agent optimises campaign message variants for engagement and converges on fear-based framing with hidden urgency cues that push recipients' " +
      "voting choices.",
    keyRisk: 0,
  },
  "GOV-DD-2": {
    l2: "Electoral content is spot-checked by moderators, but the agent has no fact-checking integration and amplifies items regardless of flags",
    l4:
      "Fact-checking, labelling and a DSA Art. 34 electoral assessment are in place, but cross-platform coordination detection or electoral-period enhanced " +
      "monitoring is missing",
    evidence: ["electoral_fact_check_flag_log", "dsa_art34_electoral_risk_assessment", "election_period_monitoring_dashboard"],
    remediation:
      "Make the agent's ranking and reply tools check each electoral claim against the integrated fact-check feed and label or down-rank flagged items " +
      "before display, logging each action.",
    failureMode:
      "The agent's recommender pushes a viral post falsely announcing polling-station closures to the top of feeds because no fact-check flag is consulted " +
      "before ranking.",
    keyRisk: 2,
  },
  "GOV-DD-3": {
    l2: "Declared political opinions are flagged as special category in some systems, but inferred political attributes sit in ordinary analytics fields",
    l4:
      "Art. 9 controls cover explicit and inferred political data with minimisation and a DPIA, but political micro-targeting is not technically prohibited " +
      "or processing is not disclosed",
    evidence: ["political_opinion_data_inventory", "special_category_dpia_electoral", "inferred_attribute_suppression_test"],
    remediation:
      "Block the agent's analytics tools from writing or reading inferred political-leaning fields, and enforce role-based access on explicit political " +
      "opinion data with every access logged.",
    failureMode:
      "The agent infers voters' party preference from their petition signatures and event attendance and stores it as a segment for later message " +
      "targeting.",
    keyRisk: 0,
  },
  "GOV-DD-4": {
    l2: "Disclosure is added by hand to some published items; deep fakes the agent produces carry none",
    l4:
      "Every published item and deep fake carries a disclosure or a reviewer record, but the approach is not mapped to the June 2026 Code of Practice or a " +
      "documented equivalent",
    evidence: ["published_item_ai_disclosure_record", "editorial_responsibility_review_log", "deep_fake_disclosure_sample_audit"],
    remediation:
      "Add a publication gate that refuses to post agent-generated election text or deep fakes unless the item carries a disclosure or a record naming the " +
      "human reviewer and the person with editorial responsibility.",
    failureMode:
      "The agent publishes an AI-written explainer on a ballot measure with no disclosure, claiming the editorial exception although no person reviewed it.",
    keyRisk: 2,
  },
  "GOV-DD-5": {
    l2: "Integrity checks exist for one electoral system the agent touches, but there is no independent verification or observer access",
    l4: "Integrity controls, observer access and recount support are in place, but no post-election technology review is documented",
    evidence: ["electoral_technology_security_assessment", "observer_access_request_log", "results_reconciliation_report", "post_election_technology_review"],
    remediation:
      "Require every agent write to voter-registration or results records to pass a reconciliation check against source records and be logged in a form " +
      "observers can inspect.",
    failureMode:
      "The agent auto-merges suspected duplicate voter-registration records using fuzzy name matching and silently removes eligible voters from the roll.",
    keyRisk: 1,
  },
  "GOV-DD-6": {
    l2: "Basic access controls protect the voter-registration systems the agent touches, but no measure is mapped to Art. 21(2)",
    l4: "All Art. 21(2) measures are mapped and supplier assessments are on file, but the pre-election test for the current cycle has not been run or reported",
    evidence: ["nis2_art21_measure_mapping_agent_components", "electoral_software_supplier_assessment", "pre_election_security_test_report"],
    remediation:
      "Pin and verify signed versions of every model, plugin and dependency the agent loads in electoral systems, and run a pre-election security and " +
      "incident-handling test each cycle.",
    failureMode:
      "The agent loads an updated third-party plugin into the results-handling workflow without supply-chain verification, opening a path into tally data.",
    keyRisk: 3,
  },
  "GOV-DD-7": {
    l2: "Some political advertisements the agent places carry a label, but the sponsor is not identified and no transparency notice is produced",
    l4:
      "Every advertisement carries the label, sponsor and a retrievable Art. 12(1) notice, but notices are not archived with it or no sample is audited " +
      "each election period",
    evidence: ["political_ad_label_and_sponsor_record", "art12_1_transparency_notice_archive", "election_period_ad_sample_audit"],
    remediation:
      "Make the agent's ad-placement tool reject any political advertisement that lacks the label, a verified sponsor identity and a link to its generated " +
      "Art. 12(1) notice.",
    failureMode:
      "The agent places a batch of issue ads for a client without verifying the sponsor, publishing political advertising that hides a foreign funder.",
    keyRisk: 3,
  },
  "GOV-DD-8": {
    l2: "Core electoral information pages are partly accessible, but the agent's chat and voice channels were never tested with assistive technology",
    l4:
      "Accessible, multilingual electoral information and non-digital channels exist, but assisted participation for voters with disabilities or HAVA " +
      "accessibility for voting-system AI is not evidenced",
    evidence: ["electoral_info_accessibility_test_report", "multilingual_response_coverage_matrix", "non_digital_channel_availability_log"],
    remediation:
      "Add an assistive-technology and language test set covering polling-place, registration-deadline and accessible-voting questions, and fail the " +
      "release if any supported language or format is missing.",
    failureMode:
      "The agent gives polling-place accessibility information only in the majority language and in a format screen readers cannot parse, so voters with " +
      "disabilities miss the accessible voting option.",
    keyRisk: 1,
  },
  "GOV-DD-9": {
    l2: "AI-generated political content is labelled by hand on some channels, and profiling-based targeting runs without any Art. 22(4) review",
    l4:
      "Labelling, sponsor disclosure and targeting-criteria publication are automated, but Art. 22(4) safeguards for automated political profiling are " +
      "untested or unreported in the electoral period",
    evidence: ["ai_political_content_label_log", "targeting_criteria_publication_record", "art22_4_profiling_safeguard_assessment"],
    remediation:
      "Disable automated audience selection on political-opinion signals by default, and require a recorded Art. 22(4) safeguard assessment before the " +
      "agent's targeting tool accepts such a segment.",
    failureMode:
      "The agent builds audience segments from inferred political views and serves political content to them without disclosing the targeting criteria.",
    keyRisk: 0,
  },
  "GOV-DD-10": {
    l2: "A policy names vulnerable groups, but targeting and content pipelines are not tested for exploitative or suppression messaging",
    l4: "Threat modelling, red-teaming and targeting restrictions are in place, but election-period monitoring for coercive patterns is not running",
    evidence: ["vulnerability_exploitation_threat_model", "suppression_messaging_red_team_results", "vulnerable_group_targeting_block_log"],
    remediation:
      "Block targeting parameters that select audiences by age, disability or economic hardship for voting-behaviour messages, and run a red-team set of " +
      "suppression prompts against the agent before each election period.",
    failureMode: "The agent sends care-home residents messages wrongly claiming postal voting needs a doctor's note, deterring them from voting.",
    keyRisk: 1,
  },
  "GOV-DD-11": {
    l2: "A general misinformation review exists, but recommender and advertising systems are not assessed for electoral risk",
    l4: "An Art. 34(1)(c) assessment and C/2024/3014-mapped mitigations exist, but mitigation effectiveness is not measured per election period",
    evidence: [
      "dsa_art34_1_c_assessment",
      "c_2024_3014_mitigation_mapping",
      "election_period_mitigation_effectiveness_metrics",
      "coordinated_inauthentic_behaviour_action_log",
    ],
    remediation:
      "Add a monitored metric for the reach of coordinated inauthentic accounts in the agent's recommendations during election periods, with a threshold " +
      "that triggers the escalation playbook and reduced amplification.",
    failureMode:
      "The agent's recommender amplifies a network of newly created accounts posting identical election narratives because no coordination signal feeds its " +
      "ranking during the campaign.",
    keyRisk: 3,
  },
  "GOV-DD-12": {
    l2: "Logs exist for AI-influenced steps, but they are not tamper-evident and no pre-election test is run",
    l4:
      "Pre-election tests, tamper-evident logs and change control are in place, but observers get evidence only on request or the audit procedure is not " +
      "repeatable",
    evidence: ["pre_election_test_report", "tamper_evident_log_hash_chain", "ai_step_change_control_record", "observer_evidence_package"],
    remediation:
      "Freeze the agent's model, prompt and configuration for election-technology workflows before the pre-election test, require a change-control record " +
      "for any later change, and hash-chain its logs.",
    failureMode:
      "The agent's prompt for voter-registration lookups is edited mid-election without a change record, and observers cannot tell which version answered " +
      "which voter.",
    keyRisk: 1,
  },
  "GOV-DD-13": {
    l2: "Political opinion data is marked special category, but no record says whether Art. 9(2)(d) applies or which basis is relied on",
    l4:
      "The basis is documented with safeguards, minimisation and access controls, but inferential profiling beyond that basis is not detected or evidence " +
      "is not exportable for supervisory review",
    evidence: ["art9_2_d_applicability_record", "political_data_access_control_log", "inferential_profiling_detection_report"],
    remediation:
      "Record the Art. 9 basis for each political-data processing purpose and have the agent's data tools refuse any query whose purpose tag falls outside " +
      "that basis, logging the refusal.",
    failureMode: "The agent shares a party's member list with an external polling vendor, disclosing political opinion data outside the body without consent.",
    keyRisk: 0,
  },
  "GOV-DD-14": {
    l2: "An owner is named for some electoral algorithmic systems, but affected people have no route to contest outcomes",
    l4:
      "Owners, election-period escalation time limits and a contest route exist, but evidence for independent review is not retained for the period the " +
      "electoral authority sets",
    evidence: ["electoral_algorithm_owner_register", "election_period_escalation_log", "contest_outcome_record"],
    remediation:
      "Register each electoral algorithmic system with a named owner, and wire the agent's contest form to open a case with that owner due within the " +
      "election-period time limit.",
    failureMode:
      "The agent's candidate-information ranking keeps surfacing incumbents first, and a challenger's complaint has no owner to route to before polling " +
      "day.",
    keyRisk: 4,
  },
  "GOV-DD-15": {
    l2: "Control-to-law references are kept in a document, but anchors such as DSA Art. 34(1)(c) and GDPR Art. 9(2)(d) are used inconsistently",
    l4: "The mapping is versioned with a review workflow, but citation consistency across questions and agent outputs is not checked automatically",
    evidence: ["democracy_pack_control_to_law_map", "citation_drift_check_result", "mapping_review_record"],
    remediation:
      "Run an automated check on every release that the legal anchors cited in the agent's electoral guidance match the versioned control-to-law map, " +
      "failing on drift.",
    failureMode:
      "The agent cites an outdated provision when advising a campaign team on political-data processing, so the team relies on a basis the current mapping " +
      "no longer supports.",
    keyRisk: 2,
  },
  "GOV-DD-16": {
    l2: "Policy forbids impersonating candidates or campaigns, but generation requests are not screened for it",
    l4: "Impersonation requests are detected, blocked and logged, but synthetic media about candidates carries no provenance or disclosure",
    evidence: ["candidate_impersonation_block_log", "synthetic_candidate_media_provenance_record", "impersonation_detection_test_set"],
    remediation:
      "Add a generation-time check that matches requests against a register of candidates and parties and blocks content presented as speaking for them " +
      "without verified authorisation, logging each block.",
    failureMode: "The agent generates a robocall script in a candidate's cloned voice telling supporters the election date has moved.",
    keyRisk: 3,
  },
  "GOV-DD-17": {
    l2: "Targeting uses consented data for some campaigns, but political-advertising consent is bundled with general marketing consent",
    l4: "Separate consent and special-category exclusion are enforced, but targeting parameters are not published with each advertisement or not archived",
    evidence: ["political_ad_targeting_consent_record", "special_category_targeting_exclusion_test", "published_targeting_parameters_archive"],
    remediation:
      "Configure the agent's ad-delivery pipeline to admit only data subjects with a separate political-advertising consent record and to drop " +
      "special-category attributes, with a test that fails if one passes through.",
    failureMode:
      "The agent delivers political ads to a lookalike audience built from browsing data, none of whom gave separate consent for political advertising.",
    keyRisk: 0,
  },
  "GOV-DD-18": {
    l2: "Some electoral uses are listed, but there is no rationale for how each was classified",
    l4:
      "Each electoral use is classified with prohibited techniques screened out, but the plan for the Chapter III obligations carries no dates before 2 Dec " +
      "2027",
    evidence: ["electoral_use_register_annex_iii_8b", "art5_1_a_b_screen_record", "chapter_iii_obligation_plan"],
    remediation:
      "Require a register entry with an Annex III 8(b) classification and an Art. 5(1)(a)-(b) screen before the agent can be configured for any new " +
      "voter-facing persuasion use.",
    failureMode: "The agent is repurposed from answering voter questions to persuading undecided voters, and nobody re-classifies the use as high-risk.",
    keyRisk: 0,
  },
  "GOV-DD-19": {
    l2: "Generated images carry a visible label, but no machine-readable marking is embedded in any media type",
    l4: "Every media type is marked and detection is verified per release, but robustness to compression, cropping and re-encoding is not tested",
    evidence: ["machine_readable_marking_coverage_by_media_type", "marking_detection_release_test", "transformation_robustness_test_report"],
    remediation:
      "Embed a machine-readable provenance mark in every audio, image, video and text output at generation time, and add a release test that detects the " +
      "mark after compression and re-encoding.",
    failureMode:
      "The agent produces a synthetic video of a candidate whose marking is stripped by a single re-encode, so platforms cannot detect it as generated when " +
      "it spreads.",
    keyRisk: 2,
  },
  "GOV-DD-20": {
    l2: "Biometric capabilities are partly inventoried, but nothing covers inference of political opinions or other listed traits from images or voice",
    l4: "Inference of the listed traits is blocked at runtime and each block is logged, but no release test with biometric inputs confirms the block",
    evidence: ["biometric_capability_inventory", "sensitive_trait_inference_block_log", "biometric_input_release_test"],
    remediation:
      "Block at the tool layer any request to classify faces, video or voice by political opinion or another Art. 5(1)(g) trait, and add biometric test " +
      "inputs to the release suite to confirm the block.",
    failureMode: "The agent tags rally attendees in uploaded crowd photos by predicted political leaning and ethnicity to build a canvassing list.",
    keyRisk: 4,
  },
};
