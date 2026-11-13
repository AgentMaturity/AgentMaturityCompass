/** Per-question detail for the infotainment pack, keyed by question id (see IndustryPackQuestionDetail). */
import type { PackQuestionDetail } from "../../industryPacks.js";

export const infotainmentDetail: PackQuestionDetail = {
  "TECH-INF-1": {
    l2: "An informal review of recommender harms exists, with no coverage of the Art. 34(1) risk categories.",
    l4:
      "The annual assessment covers every category with owners, but it is not repeated before " +
      "critical-impact launches or supporting documents are not retained.",
    evidence: ["art34_systemic_risk_assessment", "art35_mitigation_owner_register", "pre_launch_reassessment_record"],
    remediation:
      "Make a systemic risk reassessment a launch gate for any recommender or curation change flagged " +
      "critical-impact, with Art. 35 mitigations assigned owners.",
    failureMode: "The agent rolls out an engagement-weighted ranking that amplifies a viral false claim, and no reassessment ran before launch.",
    keyRisk: 0,
  },
  "TECH-INF-2": {
    l2: "Age signals are collected but unused; some profiling-based ads still reach recipients known to be minors.",
    l4: "Measures per feature and tested ad blocking exist, but minor-protection measures are not reviewed on a documented schedule.",
    evidence: ["minor_protection_measure_register", "profiling_ad_suppression_test", "minor_default_settings_config"],
    remediation:
      "Gate ad selection on the minor flag so profiling-based ads never reach recipients known with " +
      "reasonable certainty to be minors, with a test per ad surface.",
    failureMode: "The agent serves a profiling-based ad to a recipient its own signals already identified as a minor.",
    keyRisk: 1,
  },
  "TECH-INF-3": {
    l2: "Terms mention personalised recommendations without naming any parameter.",
    l4: "Parameters are disclosed in plain language and options work, but the disclosure lags behind ranking changes.",
    evidence: ["recommender_parameter_disclosure", "user_option_ui_test", "ranking_change_disclosure_diff"],
    remediation:
      "Generate the recommender parameter disclosure from the ranking config so each ranking change " +
      "updates the terms, and test every described option in the UI.",
    failureMode: "The agent adds an engagement signal to ranking without updating the disclosed main parameters, so users cannot see why their feed narrowed.",
    keyRisk: 4,
  },
  "TECH-INF-4": {
    l2: "Uploaded content is hash-matched, but generated content and press snippets are never checked.",
    l4: "Upload filters, press-publisher rights and training licence records exist, but generated outputs are not checked for originality.",
    evidence: ["generated_content_similarity_check", "press_publisher_licence_register", "training_data_licence_record"],
    remediation:
      "Run a similarity check of generated text, images and audio against the reference catalogue before " +
      "publishing, and hold outputs above threshold for rights review.",
    failureMode: "The agent generates a news digest that reproduces press publishers' articles near verbatim without a licence.",
    keyRisk: 3,
  },
  "TECH-INF-5": {
    l2: "Notices arrive through a generic contact form and decisions are not recorded.",
    l4: "Every notice is tracked to a timestamped decision, but links to Art. 17 statements or automated-means flags are incomplete.",
    evidence: ["art16_notice_intake_log", "notice_decision_timestamp", "automated_means_use_flag"],
    remediation:
      "Route each notice into a case with intake and decision timestamps, record whether the agent's classifier decided it, and link the Art. 17 statement.",
    failureMode: "The agent auto-dismisses notices about illegal content as duplicates and nothing records a decision on them.",
    keyRisk: 0,
  },
  "TECH-INF-6": {
    l2: "Accessibility is spot-checked on the website before launch, with no audit record.",
    l4:
      "Web, apps and players are audited with captions on generated media, but no accessibility " +
      "statement is published or audits are not repeated per major release.",
    evidence: ["eaa_accessibility_audit_report", "generated_media_caption_coverage", "accessibility_statement"],
    remediation:
      "Make captions and audio description a required step for every media item the agent generates, and " +
      "audit the player against the declared standard each major release.",
    failureMode: "The agent publishes generated video clips without captions into the audiovisual service, shutting out deaf and hard-of-hearing users.",
    keyRisk: 4,
  },
  "TECH-INF-7": {
    l2: "A cookie banner runs on web, but app SDKs set identifiers before any consent.",
    l4: "No pre-consent storage occurs on any channel and scans run, but some strictly-necessary exemptions lack a recorded reason.",
    evidence: ["pre_consent_tracker_scan", "strictly_necessary_exemption_register", "consent_withdrawal_propagation_log"],
    remediation:
      "Block the personalization SDK from writing or reading device identifiers until the consent signal " +
      "is present, and run an automated scan per channel each release.",
    failureMode: "The agent's app SDK reads a device advertising identifier before consent and feeds it into personalization.",
    keyRisk: 4,
  },
  "TECH-INF-8": {
    l2: "Terms list prohibited content but not the algorithmic tools; complaints go to general support.",
    l4:
      "Terms are complete and complaints are decided under qualified-staff supervision, but some complaint " +
      "records are missing or the six-month window is not enforced.",
    evidence: ["art14_terms_moderation_section", "art20_complaint_case_record", "complaint_human_supervisor_log"],
    remediation:
      "Route every Art. 20 complaint to a queue where a qualified staff member signs off the decision, and block closure by the agent's classifier alone.",
    failureMode: "The agent rejects a complaint against a removal using the same classifier that made the removal, with no human supervising the decision.",
    keyRisk: 0,
  },
  "TECH-INF-9-v2": {
    l2: "Disclosure sits on an about page, not at the point of exposure.",
    l4: "All modalities are disclosed at first exposure, but some editorial-control exceptions lack a recorded human review.",
    evidence: ["deep_fake_disclosure_render_test", "editorial_control_review_record", "disclosure_exposure_log"],
    remediation:
      "Render the AI-generated disclosure at first exposure for every deep fake image, audio and video, " +
      "and require an editor sign-off record for each exempted text.",
    failureMode: "The agent publishes a synthetic voice clip of a public figure in an explainer segment with no disclosure that it is AI-generated.",
    keyRisk: 2,
  },
  "TECH-INF-10": {
    l2: "Users receive a generic content-removed email that states no grounds.",
    l4: "Every restriction type receives a complete statement, but statements cannot be retrieved per decision for audit.",
    evidence: ["statement_of_reasons_template", "art17_element_completeness_check", "decision_statement_index"],
    remediation:
      "Generate the statement of reasons from the moderation decision record so facts, ground, automated-means flag and redress options are always populated.",
    failureMode: "The agent demonetises a creator with a notice that omits that the decision was automated and offers no redress option.",
    keyRisk: 0,
  },
  "TECH-INF-11": {
    l2: "Ranking conditions exist internally but are undocumented for business users and untested for parity.",
    l4: "Parity tests run on every ranking change with recorded deviations, but ranking conditions are not available to business users.",
    evidence: ["ranking_conditions_business_user_doc", "own_vs_third_party_parity_test", "ranking_deviation_record"],
    remediation:
      "Add a parity test to the ranking release pipeline comparing own-service placement against matched third-party services, blocking on unexplained gaps.",
    failureMode: "The agent boosts the gatekeeper's own streaming titles above equivalent third-party titles after a ranking-model update.",
    keyRisk: 4,
  },
  "TECH-INF-12": {
    l2: "Notice-based removal only; works reappear after removal and there is no complaint path.",
    l4: "Licensing, stay-down, lawful-use safeguards and redress exist, but some decisions are not logged.",
    evidence: ["licensing_effort_record", "stay_down_fingerprint_registry", "lawful_use_override_log", "art17_9_redress_case_log"],
    remediation:
      "Fingerprint works from substantiated notices for stay-down, and route matches flagged as " +
      "quotation, parody or pastiche to human review instead of blocking.",
    failureMode: "The agent's upload filter blocks a lawful parody automatically and the uploader has no complaint route to a human.",
    keyRisk: 3,
  },
  "TECH-INF-13": {
    l2: "The privacy policy mentions children in general terms; no direct parental notice exists.",
    l4: "Both notices carry the 16 CFR 312.4 content and are versioned, but delivery logs do not show the direct notice preceded collection.",
    evidence: ["childrens_online_privacy_notice", "direct_parental_notice_delivery_log", "notice_version_history"],
    remediation:
      "Block child account creation until the direct parental notice is sent and its delivery logged, and version both notices with each change in practices.",
    failureMode: "The agent starts collecting a child's viewing history at sign-up before any direct notice reaches the parent.",
    keyRisk: 1,
  },
  "TECH-INF-14": {
    l2: "Media providers can email support to identify themselves; no declaration functionality exists.",
    l4: "Declarations feed moderation and restrictions follow the Art. 18 steps, but outcomes are not consistently logged.",
    evidence: ["media_provider_declaration_register", "art18_safeguard_step_record", "declared_provider_restriction_log"],
    remediation:
      "Check the media-provider declaration register before any restriction and route declared providers' " +
      "content through the Art. 18 steps instead of automatic action.",
    failureMode: "The agent auto-restricts a declared media service provider's news report as borderline content, skipping the Art. 18 safeguards.",
    keyRisk: 0,
  },
  "TECH-INF-15": {
    l2: "Art. 14 and Art. 17 obligations are tracked together in one list with no evidence links.",
    l4: "A versioned control-to-evidence map with a review workflow exists, but no automated completeness check runs.",
    evidence: ["dsa_control_to_evidence_map", "control_map_review_log", "evidence_completeness_check_output"],
    remediation:
      "Keep separate map entries for Art. 14 terms, Art. 17 statements and redress paths, each with an " +
      "evidence link, and fail a CI check when an entry lacks one.",
    failureMode:
      "The agent's moderation release ships a new restriction type with no statement-of-reasons template " +
      "because the control map lumped it under terms transparency.",
    keyRisk: 0,
  },
  "TECH-INF-16": {
    l2: "A chronological feed exists in settings for one surface only.",
    l4: "Every recommender has a reachable non-profiling option, but the choice does not persist across sessions.",
    evidence: ["non_profiling_option_inventory", "option_persistence_test", "non_profiling_usage_log"],
    remediation:
      "Expose a non-profiling option on every recommender surface and persist the choice server-side so the agent cannot fall back to profiling next session.",
    failureMode: "The agent resets a user who chose the non-profiling feed back to a profiled feed after an app update.",
    keyRisk: 4,
  },
  "TECH-INF-17": {
    l2: "An age gate exists, but parental consent is a checkbox with no verification.",
    l4: "Verifiable consent covers collection, use and disclosure with records, but blocking tests do not cover every collection path.",
    evidence: ["verifiable_parental_consent_record", "consent_method_documentation", "no_consent_collection_block_test"],
    remediation:
      "Gate every collection, use and disclosure on a verifiable consent record linked to the child " +
      "account, with tests that collection fails when it is absent.",
    failureMode: "The agent shares a child's profile with an ad partner under consent that only covered collection, not disclosure.",
    keyRisk: 1,
  },
  "TECH-INF-18": {
    l2: "Deceptive-design concerns are raised informally by designers, with no review record.",
    l4: "The checklist is applied every release and experiments are logged, but findings are not always remediated.",
    evidence: ["deceptive_design_checklist_review", "choice_architecture_experiment_log", "dark_pattern_finding_tracker"],
    remediation:
      "Require approval and a deceptive-design checklist for any agent-run experiment that changes " +
      "choice architecture, such as cancel flows or consent prompts.",
    failureMode: "The agent A/B tests cancel flows and keeps the variant that best hides the cancel button.",
    keyRisk: 4,
  },
  "TECH-INF-19": {
    l2: "robots.txt is checked for some crawls but not all, and nothing is logged.",
    l4: "Every recognised reservation method is checked with per-fetch logs, but exclusion of reserved content cannot be shown afterwards.",
    evidence: ["tdm_reservation_check_log", "recognised_reservation_method_list", "reserved_content_exclusion_report"],
    remediation:
      "Have the crawler check every recognised machine-readable reservation (robots.txt, TDM headers, " +
      "metadata) before each fetch and log the decision per URL.",
    failureMode: "The agent mines a publisher's site for training data while ignoring a TDM reservation header it does not parse.",
    keyRisk: 3,
  },
};
