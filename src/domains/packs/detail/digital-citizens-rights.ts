/** Per-question detail for the digital-citizens-rights pack, keyed by question id (see IndustryPackQuestionDetail). */
import type { PackQuestionDetail } from "../../industryPacks.js";

export const digitalCitizensRightsDetail: PackQuestionDetail = {
  "GOV-DCR-1": {
    l2: "Assurance levels are named in design documents, but the agent does not check which level a verification actually reached before it acts",
    l4:
      "Assurance-level checks and wallet-based attestation run in production with selective disclosure, but cross-border recognition or qualified " +
      "electronic signature flows are not evidenced per release",
    evidence: ["assurance_level_per_transaction_log", "eudi_wallet_attestation_verification_record", "cross_border_recognition_test_report"],
    remediation:
      "Add a pre-action check that reads the assurance level (low, substantial, high) of the presented identity and blocks any identity transaction whose " +
      "required level is not met, logging the level achieved.",
    failureMode:
      "The agent accepts a substantial-level login as sufficient for a transaction that requires assurance level high and issues an identity attribute to " +
      "an impostor.",
    keyRisk: 1,
  },
  "GOV-DCR-2": {
    l2:
      "Both practices are named in written policy, but use-case intake never asks whether a request involves biometric categorisation or real-time remote " +
      "identification",
    l4:
      "Both practices are blocked at runtime and releases need a prior-authorisation reference, but no named owner reviews the block-and-release log each " +
      "release",
    evidence: ["biometric_use_case_art5_assessment", "runtime_biometric_block_log", "art5_3_prior_authorisation_reference_register"],
    remediation:
      "Put a tool-level allowlist in front of the biometric functions that rejects categorisation and real-time remote identification calls unless the " +
      "request carries a recorded Art. 5(3) prior-authorisation reference, and log every block and release.",
    failureMode:
      "The agent, asked to find a person in station camera feeds, runs real-time remote identification on public-space video with no prior-authorisation " +
      "reference on record.",
    keyRisk: 0,
  },
  "GOV-DCR-3": {
    l2: "A human rights risk note exists for some AI use cases, but it does not identify affected groups or list mitigations",
    l4:
      "Assessments are repeated on each material change with affected-group input and mitigations tracked to closure, but grievance cases are not yet cited " +
      "in the next assessment",
    evidence: [
      "human_rights_impact_assessment_per_use_case",
      "affected_group_consultation_record",
      "mitigation_closure_tracker",
      "grievance_case_to_assessment_link",
    ],
    remediation:
      "Gate each agent release that changes identity-service behaviour on a refreshed human rights impact assessment, with open mitigations blocking the " +
      "release until closed or accepted by a named owner.",
    failureMode:
      "The agent is redeployed with a new name-matching model that rejects more non-Latin-script names, and no assessment catches the impact on " +
      "minority-language citizens before go-live.",
    keyRisk: 2,
  },
  "GOV-DCR-4": {
    l2: "Some access, rectification or erasure requests reach the right team, but there is no single intake and many are answered ad hoc",
    l4:
      "Every request is logged with dates and any refusal basis inside the Art. 12(3) period, but rectifications are not shown to reach every system the " +
      "agent reads from",
    evidence: [
      "identity_data_subject_request_register",
      "art12_3_response_time_report",
      "retention_refusal_legal_basis_record",
      "rectification_propagation_evidence",
    ],
    remediation:
      "Route every identity-data request into a register that starts the Art. 12(3) clock at receipt, and add a propagation check that confirms a " +
      "rectification has reached each source the agent reads before the case closes.",
    failureMode:
      "The agent keeps answering from a cached copy of a citizen's old identity record after the register was rectified, because the correction never " +
      "reached its retrieval index.",
    keyRisk: 3,
  },
  "GOV-DCR-5": {
    l2: "Disclosure is given on the main web chat only; voice, email and form channels carry none",
    l4:
      "Plain-language disclosure is given at first interaction on every channel and logged per session, but accessible formats or per-release re-tests are " +
      "missing",
    evidence: ["ai_disclosure_text_per_channel", "session_disclosure_log", "disclosure_release_test_result"],
    remediation:
      "Make the first turn on every identity-service channel a fixed disclosure injected by the channel adapter rather than the model, and fail the release " +
      "test if any channel session starts without the logged disclosure.",
    failureMode:
      "The agent answers an identity-service phone line in a human-sounding voice and never says it is an AI system, so callers share details believing " +
      "they are speaking to an official.",
    keyRisk: 0,
  },
  "GOV-DCR-6": {
    l2: "Some identity screens were checked against WCAG 2.1 AA, but the agent-driven journey has known blocking failures and no non-digital route",
    l4:
      "Digital journeys meet WCAG 2.1 AA and a staffed non-digital route exists, but assisted enrolment or digital-literacy support for vulnerable " +
      "populations is not in place",
    evidence: ["wcag_2_1_aa_audit_identity_journeys", "non_digital_enrolment_channel_volume_report", "assisted_enrolment_case_log"],
    remediation:
      "Add an escalation tool the agent must call after two failed identity-verification attempts or on an accessibility cue, handing the citizen to " +
      "assisted or in-person enrolment instead of ending the session.",
    failureMode:
      "The agent repeatedly asks a blind applicant to complete a visual liveness check and closes the enrolment as failed instead of offering an assisted " +
      "channel.",
    keyRisk: 2,
  },
  "GOV-DCR-7": {
    l2:
      "Multi-factor authentication exists for some transactions, but high-risk transactions can still complete with SMS-only codes and no mapping is " +
      "written down",
    l4:
      "Every transaction type is mapped to a level per scheme and authenticators meet it, but the level achieved is not recorded per event or the mapping " +
      "is not re-reviewed on scheme changes",
    evidence: ["transaction_to_assurance_level_mapping", "authentication_event_level_achieved_log", "authenticator_type_inventory"],
    remediation:
      "Store the transaction-to-assurance-level mapping as configuration the agent reads before each identity action, and step the citizen up to a stronger " +
      "authenticator when the session's achieved level is below the mapped one.",
    failureMode:
      "The agent changes the bank account registered for a citizen's tax refund on the strength of an SMS one-time code, a session level below what the " +
      "mapping requires for that transaction.",
    keyRisk: 1,
  },
  "GOV-DCR-8": {
    l2: "Identity incidents are handled ad hoc by the security team; the agent neither detects anomalies nor starts any notification clock",
    l4:
      "Art. 33 and NIS2 Art. 23 notifications are drafted automatically within their timelines, but credential revocation or holder notification under Art. " +
      "34 still depends on manual steps",
    evidence: [
      "identity_incident_detection_alert_log",
      "art33_notification_timeline_record",
      "nis2_art23_report_submission",
      "credential_revocation_batch_record",
    ],
    remediation:
      "Have the agent open an incident record with a 72-hour Art. 33 timer as soon as an identity-compromise signal fires, suspend the affected credentials " +
      "pending human confirmation, and preserve the related logs.",
    failureMode:
      "The agent keeps issuing attestations from a compromised credential store and treats the spike in failed verifications as user error, so no breach " +
      "timer starts.",
    keyRisk: 1,
  },
  "GOV-DCR-9": {
    l2: "Social scoring is mentioned in an acceptable-use policy, but use cases are not screened and the agent can compute behaviour scores on request",
    l4:
      "Runtime rules block cross-context use of behaviour scores and blocks are logged, but intake records no guideline-based Art. 5(1)(c) assessment or " +
      "blocks are not reviewed each release",
    evidence: ["art5_1_c_use_case_assessment", "behaviour_score_cross_context_block_log", "identity_holder_ranking_request_register"],
    remediation:
      "Tag every identity-holder attribute with its source context and add a runtime rule that refuses any ranking or eligibility tool call combining " +
      "behaviour-derived attributes across contexts, logging the refusal.",
    failureMode:
      "The agent ranks applicants for faster public-service processing using their parking-fine and library-overdue history pulled from linked identity " +
      "records.",
    keyRisk: 3,
  },
  "GOV-DCR-10": {
    l2: "Wallet features such as selective disclosure are planned or piloted, but assurance level high is not defined for any wallet flow",
    l4:
      "Assurance level high is governed and evidenced for issuance and authentication, but relying-party verification, cross-border acceptance or " +
      "suspension, revocation and recovery lack auditable evidence",
    evidence: [
      "wallet_high_assurance_evidence_bundle",
      "wallet_lifecycle_event_log",
      "relying_party_verification_trace",
      "cross_border_wallet_acceptance_test",
    ],
    remediation:
      "Before the agent completes a wallet issuance, recovery or revocation step, require the high-assurance evidence bundle (issuance, authentication, " +
      "attribute attestation) and write the lifecycle event with its bundle id.",
    failureMode:
      "The agent processes a wallet recovery request after a chat-based knowledge check and re-binds a high-assurance wallet to a device the fraudster " +
      "controls.",
    keyRisk: 1,
  },
  "GOV-DCR-11": {
    l2: "Some use cases are labelled high-risk, but there is no written classification rationale and none of the Art. 9-14 artefacts exist",
    l4:
      "Classification and the full Art. 9-14 artefact set exist, but artefacts are not versioned with each agent release or open gaps are not dated against " +
      "2 Dec 2027",
    evidence: ["annex_iii_classification_rationale_per_use_case", "art9_14_artefact_index_per_release", "dec_2027_gap_plan"],
    remediation:
      "Add a release gate that refuses to ship an agent version for an Annex III use case unless its classification record and versioned Art. 9-14 artefact " +
      "index match the release tag.",
    failureMode:
      "The agent's matching function is extended from one-to-one verification to one-to-many search without re-classification, so it runs as remote " +
      "biometric identification with no risk or oversight record.",
    keyRisk: 0,
  },
  "GOV-DCR-12": {
    l2: "Consent is a single checkbox at wallet onboarding that covers every attribute and purpose",
    l4:
      "Granular, purpose-scoped consent with receipts and withdrawal enforcement is in place, but safeguards against coerced consent in public-service " +
      "contexts are not tested",
    evidence: ["attribute_level_consent_receipt", "consent_withdrawal_enforcement_log", "special_category_disclosure_event_log"],
    remediation:
      "Require a live, purpose-matched consent receipt for the specific special-category attribute before the agent's disclosure tool releases it, and make " +
      "withdrawal revoke the receipt so the next call fails.",
    failureMode:
      "The agent shares a citizen's health-condition attribute with a housing office on the strength of a blanket onboarding consent the citizen had " +
      "already withdrawn.",
    keyRisk: 3,
  },
  "GOV-DCR-13": {
    l2: "Strong authentication is used on some services, but no service is mapped to AL3 and identity proofing strength varies between them",
    l4: "Wallet and service flows are mapped to AL3 and enforced consistently, but binding and recovery paths or auditor evidence packs are incomplete",
    evidence: ["al3_control_mapping_matrix", "identity_proofing_strength_record", "authenticator_binding_and_recovery_log"],
    remediation:
      "Map each service's proofing, authenticator and recovery steps to the AL3 requirements, and add a test that fails if any agent-reachable recovery " +
      "path binds a new authenticator below AL3.",
    failureMode:
      "The agent lets a citizen bind a new authenticator through an emailed link, a recovery path weaker than the AL3 proofing the account was created " +
      "under.",
    keyRisk: 1,
  },
  "GOV-DCR-14": {
    l2: "A spreadsheet maps some controls to eIDAS articles, but it is not versioned and Art. 5a anchors are missing where required",
    l4: "The mapping is versioned and reviewed on regulatory updates, but citation consistency across questions and agent outputs is checked by hand",
    evidence: ["eidas_control_to_article_mapping_versioned", "citation_consistency_check_output", "regulatory_update_review_record"],
    remediation:
      "Add an automated check that compares every eIDAS citation in agent prompts, outputs and evidence exports with the versioned control-to-article map " +
      "and fails the build on a mismatch.",
    failureMode:
      "The agent tells a relying party that a wallet requirement comes from a superseded eIDAS article, so the operator builds controls against the wrong " +
      "text.",
    keyRisk: 3,
  },
  "GOV-DCR-15": {
    l2: "A request route exists, but staff can only confirm that an AI system was involved, with no detail of its role",
    l4: "Decision-specific explanations are built from logged inputs and outputs, but delivery is not time-bound or not linked to any later appeal",
    evidence: ["decision_explanation_request_log", "decision_input_output_trace", "explanation_delivery_time_report"],
    remediation:
      "Log each high-risk decision's inputs, model output and human action under a decision id, and generate the plain-language explanation from that " +
      "record when the affected person asks.",
    failureMode:
      "The agent answers an explanation request with a generic description of the model instead of the inputs and output that drove the refusal of this " +
      "person's identity application.",
    keyRisk: 2,
  },
  "GOV-DCR-16": {
    l2: "Citizens can complain through a general channel, but it is not linked to the AI-influenced decision or reviewed by a human able to change it",
    l4:
      "Notices state the AI's role and information relied on and a named human reviews contests in time, but notices omit the market surveillance complaint " +
      "route or outcomes are not logged",
    evidence: ["adverse_decision_notice_template", "contest_case_human_review_log", "contest_time_limit_report"],
    remediation:
      "Have the agent attach to every adverse identity-status notice the AI's role, the main information relied on and a contest link that opens a case " +
      "assigned to a named human reviewer with a due date.",
    failureMode:
      "The agent suspends a citizen's digital identity after a fraud flag and handles the citizen's objection itself, re-confirming its own decision with " +
      "no human review.",
    keyRisk: 2,
  },
  "GOV-DCR-17": {
    l2: "The agent requests whole credentials, but a non-wallet route exists for some services and selective disclosure is planned",
    l4:
      "Only purpose-needed attributes are requested and each exchange appears on the dashboard, but dashboard erasure requests or the non-wallet route are " +
      "not tested",
    evidence: ["requested_attribute_minimisation_log", "wallet_dashboard_exchange_entry", "non_wallet_route_test_result"],
    remediation:
      "Replace whole-credential presentation requests with a per-purpose attribute list the agent must use, and check after each exchange that a dashboard " +
      "entry was written for it.",
    failureMode:
      "The agent requests a citizen's full identity credential to confirm they are over 18, exposing name, address and document number where a single age " +
      "attribute would do.",
    keyRisk: 4,
  },
  "GOV-DCR-18": {
    l2: "The agent acts for a registered relying party, but its requests are not checked against registered attributes and presentation payloads are cached",
    l4:
      "A registration-bound attribute allow-list runs at runtime and the relying party is shown to the user, but no periodic check evidences that logs hold " +
      "no transaction content",
    evidence: ["relying_party_registration_attribute_allowlist", "presentation_request_block_log", "agent_log_content_scan_report"],
    remediation:
      "Enforce the relying party's registered attribute list as a runtime allowlist on the agent's presentation-request tool, and strip presentation " +
      "payloads from agent logs so only metadata is kept.",
    failureMode:
      "The agent writes full wallet presentation payloads into its conversation logs, building a searchable record of which citizen proved what to whom.",
    keyRisk: 0,
  },
};
