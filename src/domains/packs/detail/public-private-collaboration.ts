/** Per-question detail for the public-private-collaboration pack, keyed by question id (see IndustryPackQuestionDetail). */
import type { PackQuestionDetail } from "../../industryPacks.js";

export const publicPrivateCollaborationDetail: PackQuestionDetail = {
  "GOV-PPC-1": {
    l2: "Conflict-of-interest declarations are collected on paper, but the agent does not check them before procurement steps",
    l4:
      "Art. 7 integrity and Art. 9 procurement controls run with beneficial ownership checks and automated conflict screening, but bribery risk assessment " +
      "or the audit trail is incomplete",
    evidence: ["conflict_of_interest_screening_log", "beneficial_ownership_check_record", "procurement_step_audit_trail"],
    remediation:
      "Add a pre-action check that screens evaluators, partners and beneficial owners against conflict-of-interest declarations before the agent advances a " +
      "PPP procurement step, blocking on a match until a named official clears it.",
    failureMode:
      "The agent shortlists a bidder whose beneficial owner is the spouse of an evaluation panel member, because no conflict check runs before " +
      "shortlisting.",
    keyRisk: 0,
  },
  "GOV-PPC-2": {
    l2: "Deal milestones are tracked, but no value-for-money assessment informs the agent's recommendations",
    l4:
      "Lifecycle value-for-money assessment and public transparency reporting exist, but independent audit support or reporting to the oversight body is " +
      "missing",
    evidence: ["lifecycle_vfm_assessment", "ppp_transparency_report", "oversight_body_reporting_record"],
    remediation:
      "Require a lifecycle value-for-money assessment reference as an input before the agent recommends proceeding with a PPP, and publish the " +
      "recommendation with that reference for oversight.",
    failureMode: "The agent recommends signing a PPP because it scores high on deal-completion speed, though no lifecycle value-for-money analysis was done.",
    keyRisk: 1,
  },
  "GOV-PPC-3": {
    l2: "Human rights questions appear in partner questionnaires, but answers are neither scored nor followed up",
    l4:
      "Due diligence with impact assessment, ongoing monitoring and community engagement runs, but the grievance mechanism or public human rights reporting " +
      "is missing",
    evidence: ["partner_human_rights_impact_assessment", "affected_community_engagement_record", "ppp_grievance_case_log"],
    remediation:
      "Make a completed human rights impact assessment for each private partner a required input before the agent can score or advance that partner, and " +
      "feed grievance cases back into partner monitoring.",
    failureMode:
      "The agent advances a construction partner facing documented forced-labour allegations because human rights indicators are not among its scoring " +
      "inputs.",
    keyRisk: 3,
  },
  "GOV-PPC-4": {
    l2: "Award notices are published as PDFs, with no structured data and no amendments",
    l4: "OCDS releases cover every stage including amendments and are schema-validated, but performance data is not updated on a published schedule",
    evidence: ["ocds_release_package", "ocds_schema_validation_report", "contract_amendment_release_log"],
    remediation:
      "Have the agent emit an OCDS release for each tender, award, amendment and renegotiation event it processes, validated against the schema before " +
      "publication.",
    failureMode:
      "The agent processes a renegotiation that raises the public payment but never publishes the amendment, hiding the change from open-contracting " +
      "monitors.",
    keyRisk: 0,
  },
  "GOV-PPC-5": {
    l2: "Partnership outputs are counted, but no SDG indicator or community involvement measure is tracked",
    l4: "Indicator 17.17.1 monitoring and community involvement are integrated, but outcome attribution or public SDG impact reporting is incomplete",
    evidence: ["sdg_17_17_1_indicator_dataset", "community_involvement_record", "ppp_outcome_attribution_method"],
    remediation:
      "Add community and SDG outcome measures to the agent's PPP performance dashboard with a documented attribution method, and flag partnerships whose " +
      "outputs rise while community outcomes fall.",
    failureMode:
      "The agent reports a PPP as successful on output counts while the affected community's access to the service has fallen, because no community measure " +
      "is tracked.",
    keyRisk: 1,
  },
  "GOV-PPC-6": {
    l2: "Some controls protect PPP data, but no ISMS scope covers the agent and sensitive terms are visible to all users",
    l4: "The ISMS covers the agent and PPP data with role-based access, but no AI-specific security assessment is on file for each release",
    evidence: ["isms_scope_statement_ppp", "sensitive_terms_access_review", "ai_system_security_assessment_per_release"],
    remediation:
      "Enforce role-based access on the agent's retrieval tool so sensitive partnership terms reach only authorised roles, and add prompt-injection and " +
      "data-exfiltration tests to each release's security assessment.",
    failureMode: "The agent returns a rival bidder's confidential pricing terms to another bidder's staff in answer to a cleverly phrased question.",
    keyRisk: 2,
  },
  "GOV-PPC-7": {
    l2: "PPP commitments are listed, but contingent liabilities are not identified",
    l4: "PFRAM-level fiscal risk quantification and contingent liability assessment exist, but fiscal risk disclosure or budget-office integration is missing",
    evidence: ["pfram_fiscal_risk_assessment", "contingent_liability_register", "fiscal_risk_disclosure_record"],
    remediation:
      "Run a fiscal risk calculation on every PPP commitment or renegotiation the agent proposes, and route any proposal that raises contingent liabilities " +
      "above a set threshold to the finance ministry for approval.",
    failureMode:
      "The agent agrees a revenue-support clause in a renegotiation that shifts demand risk onto the public budget without recording the contingent " +
      "liability.",
    keyRisk: 1,
  },
  "GOV-PPC-8": {
    l2: "Obvious violations are reported by staff, but the agent runs no collusion checks",
    l4: "TFEU monitoring and AI-enabled collusion detection run, but market concentration assessment or competition-authority reporting is missing",
    evidence: ["bid_pattern_collusion_screen", "market_concentration_assessment", "competition_authority_referral_log"],
    remediation:
      "Add a bid-rigging screen to the agent's tender evaluation (price clustering, bid rotation, identical errors) that flags suspect tenders to a named " +
      "official before award.",
    failureMode: "The agent recommends award in a tender where three bids share identical pricing errors, a bid-rigging signal it never checks.",
    keyRisk: 2,
  },
  "GOV-PPC-9": {
    l2: "A few high-value partners are rated informally, and flows are not rated at all",
    l4: "Every partner and flow is rated with scaled controls, but ratings are not reviewed on material change or the review lacks evidence",
    evidence: ["partner_ml_tf_risk_rating", "flow_risk_rating_log", "rating_review_on_change_record"],
    remediation:
      "Rate each PPP partner and payment flow for money-laundering and terrorist-financing risk before the agent schedules it, scale checks to the rating, " +
      "and re-rate on ownership or flow changes.",
    failureMode:
      "The agent schedules payments to a newly added subcontractor in a high-risk jurisdiction at the partner's low onboarding rating, never rating the new " +
      "flow.",
    keyRisk: 0,
  },
  "GOV-PPC-10": {
    l2: "Criteria are published for some tenders, but evaluation records are incomplete and no review route is documented",
    l4:
      "Published criteria, reproducible evaluation records and award information exist, but the bidder review and appeal route or its case outcomes are not " +
      "documented",
    evidence: ["pre_published_award_criteria", "evaluation_record_ai_vs_evaluator", "bidder_review_case_log"],
    remediation:
      "Log the agent's scoring inputs, model version and output separately from each evaluator's decision for every bid, so the evaluation can be " +
      "reproduced on review.",
    failureMode:
      "The agent re-weights award criteria after bids are opened, and the evaluation cannot be reproduced because its earlier scores were overwritten.",
    keyRisk: 0,
  },
  "GOV-PPC-11": {
    l2: "A business case exists for some projects, but there is no procurement option pre-test or comparator",
    l4: "Pre-test, comparator and risk-allocation matrix are on file, but sensitivity analysis or the trace from AI recommendations to each element is missing",
    evidence: ["procurement_option_pre_test", "public_sector_comparator_methodology", "risk_allocation_matrix", "ai_recommendation_to_vfm_trace"],
    remediation:
      "Require the agent's PPP recommendation to cite the pre-test, comparator and risk-allocation entries it relied on, and reject any recommendation " +
      "missing a citation for each.",
    failureMode:
      "The agent allocates construction risk to the public authority in its recommended structure, though the private partner could manage it at lower " +
      "cost.",
    keyRisk: 1,
  },
  "GOV-PPC-12": {
    l2: "Payment metadata is captured, but originator and beneficiary data is neither validated nor propagated",
    l4:
      "Validated data, propagation and screening run with exception workflows, but payments are not linked to contract milestones or beneficial ownership " +
      "data",
    evidence: [
      "wire_transfer_originator_beneficiary_validation",
      "sanctions_pep_screening_result",
      "payment_to_milestone_link",
      "missing_information_exception_log",
    ],
    remediation:
      "Block the agent's payment tool from releasing a PPP wire transfer until originator and beneficiary fields validate and screen clean, holding " +
      "exceptions in a human-reviewed queue.",
    failureMode:
      "The agent retries a failed cross-border milestone payment through a different intermediary without the beneficiary information, sending funds that " +
      "cannot be traced.",
    keyRisk: 0,
  },
  "GOV-PPC-13": {
    l2: "An anti-bribery policy exists, but it is not applied to intermediaries and no records of contributions or lobbying contacts are kept",
    l4:
      "Policy, due diligence and a protected reporting channel cover every partner and intermediary, but records of political contributions or lobbying " +
      "contacts are incomplete",
    evidence: ["intermediary_due_diligence_file", "gifts_and_hospitality_register", "lobbying_contact_log", "protected_report_case_log"],
    remediation:
      "Have the agent check the lobbying-contact and gifts registers for each official involved before it schedules a partner meeting or decision step, and " +
      "flag undisclosed contacts to the integrity officer.",
    failureMode:
      "The agent books meetings between a bidder's intermediary and procurement officials without logging the lobbying contacts, so the influence goes " +
      "unrecorded.",
    keyRisk: 4,
  },
  "GOV-PPC-14": {
    l2: "Final decisions are recorded, but AI involvement is not and no accountable official is named",
    l4: "A log separates AI suggestions from human decisions with named officials, but rationales are not published or bidders have no contest route",
    evidence: ["ai_suggestion_vs_human_decision_log", "accountable_official_register", "published_decision_rationale"],
    remediation:
      "Write each AI suggestion and the final human decision as separate log entries with the accountable official's id, and publish the rationale for each " +
      "shortlist or renegotiation trigger.",
    failureMode:
      "The agent's renegotiation trigger is adopted verbatim by an official who later joins the partner, and no log separates the AI suggestion from the " +
      "decision.",
    keyRisk: 4,
  },
  "GOV-PPC-15": {
    l2: "Clause anchors are listed in a document, but UNCAC, FATF and ISO 26000 references drift between questions",
    l4: "The mapping is versioned and reviewed periodically, but consistency is not validated by automated checks",
    evidence: ["ppp_control_to_citation_map", "citation_consistency_check_report", "mapping_review_record"],
    remediation:
      "Add an automated check that every UNCAC, OECD, FATF and ISO 26000 anchor in the agent's PPP outputs and evidence exports matches the versioned map, " +
      "failing the release on a mismatch.",
    failureMode: "The agent cites the wrong FATF recommendation in a partner due-diligence summary, so reviewers apply the wrong control.",
    keyRisk: 0,
  },
  "GOV-PPC-16": {
    l2: "Vendor terms are negotiated case by case, with no check for the training prohibition",
    l4:
      "Every AI contract is checked against a clause library covering each M-25-22 term, but the exit plan has not been tested for data and model " +
      "portability",
    evidence: ["m_25_22_clause_library", "pre_signature_contract_check_record", "portability_exit_test_report"],
    remediation:
      "Add a pre-signature check that compares each AI vendor contract with the M-25-22 clause library and blocks signature when the training prohibition " +
      "or portability terms are missing.",
    failureMode: "The agent sends non-public agency case data to a vendor model endpoint whose standard terms let the vendor train its commercial model on it.",
    keyRisk: 1,
  },
  "GOV-PPC-17": {
    l2: "Requests are logged on receipt, but data is released before any review",
    l4: "Intake checks each Art. 15 condition and data is minimised, but return or deletion is not tracked or not every decision is logged",
    evidence: ["exceptional_need_request_intake_record", "art15_condition_check_result", "data_return_or_deletion_record"],
    remediation:
      "Put a structured intake in front of the agent's data-export tool that checks exceptional need, purpose, scope and time limit for each public-sector " +
      "request and releases only the fields named.",
    failureMode:
      "The agent answers a public body's exceptional-need request by exporting the partner's full customer dataset instead of the fields the request " +
      "justified.",
    keyRisk: 1,
  },
  "GOV-PPC-18": {
    l2: "Beneficial owners of some partners are identified at onboarding from self-declarations only",
    l4: "Beneficial owners of every partner and vehicle are verified and re-checked on change, but the AMLR gap plan has no owners or dates",
    evidence: ["spv_beneficial_owner_verification", "ownership_change_recheck_log", "amlr_gap_plan"],
    remediation:
      "Verify beneficial owners of each partner and special-purpose vehicle against registry data before the agent onboards them, and subscribe to " +
      "ownership-change events that trigger a re-check.",
    failureMode:
      "The agent onboards a special-purpose vehicle whose undisclosed beneficial owner is a former regulator of the sector, because it accepts the " +
      "self-declaration.",
    keyRisk: 4,
  },
  "GOV-PPC-19": {
    l2: "The private partner has drafted a rights-risk note, but it covers few Art. 27(1) elements",
    l4:
      "The assessment has all elements before first use and the notification is recorded, but updates are not recorded on change or the contract does not " +
      "assign the duty",
    evidence: ["partner_art27_fria", "partner_notification_receipt", "contract_fria_duty_clause"],
    remediation:
      "Make the contract's go-live checklist require the partner's Art. 27(1) assessment and notification receipt before the agent is enabled for the " +
      "public service, and re-check when service scope changes.",
    failureMode:
      "The agent goes live on a privately run benefits helpline before the partner has assessed the fundamental rights risks to the claimants it serves.",
    keyRisk: 3,
  },
};
