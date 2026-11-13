/** Per-question detail for the weave-to-wear pack, keyed by question id (see IndustryPackQuestionDetail). */
import type { PackQuestionDetail } from "../../industryPacks.js";

export const weaveToWearDetail: PackQuestionDetail = {
  "ENV-WW-1": {
    l2: "Supplier declarations are collected for some inputs, but screening against Annex XVII is manual and new entries are not tracked",
    l4: "Inputs are screened before first use against Annex XVII and the SVHC list with results linked, but rescreening on list updates is periodic",
    evidence: ["annex_xvii_screening_result_log", "material_concentration_test_report", "svhc_list_update_rescreen_log", "unscreened_material_block_register"],
    remediation:
      "Gate material release on an Annex XVII and Candidate List screening result linked to the material, and rescreen active materials on each list update.",
    failureMode:
      "The agent swaps a cheaper dyestuff or finish into a blend without rescreening it, putting a substance restricted under Annex XVII into the garment.",
    keyRisk: 2,
  },
  "ENV-WW-2": {
    l2: "Composition and care data sit in the PIM, but no data carrier resolves to a maintained passport record",
    l4: "Attributes carry source-evidence links and the carrier resolves to the current record, but repair, reuse and recycling events are not recorded",
    evidence: ["dpp_attribute_source_map", "data_carrier_resolution_test", "dpp_version_history", "lifecycle_event_log"],
    remediation:
      "Refuse any DPP attribute write without a source-evidence link (test report, supplier declaration, bill of materials) and version every change.",
    failureMode:
      "The agent fills DPP fibre composition from a marketing description instead of the test report, publishing a passport that misstates recycled content.",
    keyRisk: 4,
  },
  "ENV-WW-3": {
    l2: "Test results are uploaded per facility, but the agent does not compare them with ZDHC limits",
    l4: "Failures open corrective actions tracked to closure, but retest evidence is not required and facilities with lapsed tests are not flagged",
    evidence: ["zdhc_wastewater_test_result_log", "facility_corrective_action_tracker", "retest_evidence_record", "lapsed_test_facility_list"],
    remediation:
      "Close a ZDHC wastewater corrective action only on a linked passing retest, and flag any wet-processing facility whose latest test is out of date.",
    failureMode:
      "The agent keeps allocating dyeing orders to a mill whose wastewater failed ZDHC limits because the failure was never linked to sourcing decisions.",
    keyRisk: 2,
  },
  "ENV-WW-4": {
    l2: "Social audit reports are stored, but the agent does not extract or flag forced-labour indicators from them",
    l4: "Forced-labour indicators are monitored across tiers 1-2 with worker-voice input, but deeper tiers and remediation verification are incomplete",
    evidence: ["forced_labour_indicator_assessment", "social_audit_finding_register", "worker_voice_channel_log", "remediation_closure_evidence"],
    remediation:
      "Map audit findings to a documented forced-labour indicator method (retained IDs, recruitment fees, restricted movement) and hold orders on open " +
      "indicators.",
    failureMode:
      "The agent rates a facility low-risk from a clean announced audit while worker-voice reports of retained passports and recruitment fees go unread.",
    keyRisk: 1,
  },
  "ENV-WW-5": {
    l2: "Generated copy goes to a marketing reviewer, but no list of generic terms or labels is applied",
    l4: "Each claim and label is linked to evidence or a scheme and unlinked ones are blocked, but the decision is not logged per output",
    evidence: ["environmental_claim_evidence_link_log", "blocked_generic_claim_register", "sustainability_label_scheme_register"],
    remediation:
      "Filter generated copy to block generic environmental terms and labels unless linked to recognised performance evidence or a scheme, logging each " +
      "decision.",
    failureMode:
      "The agent writes 'eco-friendly' and 'green' into product listings and adds a self-made sustainability badge backed by no scheme or evidence.",
    keyRisk: 0,
  },
  "ENV-WW-6": {
    l2: "Total units sold are known, but not split per Member State in a form a scheme accepts",
    l4: "Quantities and eco-modulation inputs are reported per Member State, but reconciliation with sales and product data is not logged",
    evidence: ["per_member_state_placed_on_market_report", "eco_modulation_input_dataset", "sales_to_epr_reconciliation_log"],
    remediation:
      "Generate EPR quantity and eco-modulation reports from sales and product master data, logging each reconciliation difference before submission.",
    failureMode:
      "The agent reports durability and recyclability from product defaults, not tested data, under-declaring short-lived synthetic garments in " +
      "eco-modulation.",
    keyRisk: 3,
  },
  "ENV-WW-7": {
    l2: "Scope and transaction documents are filed per supplier, but quantities are not matched to inbound and outbound volumes",
    l4: "Transaction documents match quantities at most steps, but blending and conversion losses are not reconciled by mass balance",
    evidence: ["grs_transaction_document_match_log", "conversion_mass_balance_sheet", "recycled_content_recalculation_record"],
    remediation:
      "Compute mass balance at each blending and conversion step from GRS transaction documents and block a claim when recycled output exceeds input.",
    failureMode:
      "The agent carries a 100% recycled claim through a blending step that added virgin fibre, copying the inbound percentage instead of recomputing it.",
    keyRisk: 0,
  },
  "ENV-WW-8": {
    l2: "Test reports are stored per article, but the agent does not apply product-class limits to them",
    l4: "Reports are checked against Appendix 4 limits by product class and test schedules are managed, but label validity is not tracked to renewal",
    evidence: ["oekotex_product_class_limit_check", "harmful_substance_test_report", "label_validity_tracker"],
    remediation:
      "Check each finished-article test report against the Appendix 4 limits for that article's product class and block release when class or report is " +
      "missing.",
    failureMode:
      "The agent checks a babywear article against an adult product class and releases it with a harmful-substance value above the baby-class limit.",
    keyRisk: 2,
  },
  "ENV-WW-9": {
    l2: "Suppliers are matched against the risk database occasionally, but results are not tied to sourcing decisions",
    l4: "Every in-scope sourcing decision is screened with the database version recorded and flagged products held, but evidence packs are built by hand",
    evidence: ["forced_labour_risk_database_screen_log", "held_product_register", "supply_chain_evidence_pack"],
    remediation:
      "Screen each sourcing decision against the current risk-database version, record the version, and hold flagged products until a named reviewer clears " +
      "them.",
    failureMode:
      "The agent clears a cotton purchase from a high-risk region using a cached supplier score from before the risk database was updated.",
    keyRisk: 1,
  },
  "ENV-WW-10": {
    l2: "Audits note whether age documents were seen, but the agent does not test C138 thresholds or hazardous-work limits",
    l4: "Minimum-age and young-worker hazardous-task checks run across tiers 1-2 with remediation tracked, but deeper tiers are not covered",
    evidence: ["worker_age_verification_record", "young_worker_hazardous_task_register", "child_labour_remediation_case"],
    remediation:
      "Cross-check facility worker registers against C138 minimum-age thresholds and young-worker task limits, routing each mismatch to an owned " +
      "remediation case.",
    failureMode:
      "The agent takes a facility's age register at face value and keeps placing orders there although young workers are listed on chemical finishing tasks.",
    keyRisk: 1,
  },
  "ENV-WW-11": {
    l2: "Tier-1 suppliers are mapped, but risks are identified ad hoc and no mitigation plans exist",
    l4: "Mapping, risk taxonomy and time-bound mitigation plans exist with grievance intake, but mitigation effectiveness is not measured",
    evidence: ["supplier_tier_map", "risk_taxonomy_assessment", "mitigation_plan_tracker", "grievance_case_log"],
    remediation:
      "Attach a time-bound mitigation plan with an effectiveness metric to each high-risk supplier finding, and escalate findings not improved at next review.",
    failureMode:
      "The agent drops a supplier with a serious labour finding to cut its risk score instead of following the mitigation plan, shifting the harm elsewhere.",
    keyRisk: 1,
  },
  "ENV-WW-12": {
    l2: "Chemicals are checked against the Candidate List, but the Art. 57 category is not recorded",
    l4: "Art. 57 categories are recorded with substitution plans, but concentration tracking across tiers is incomplete",
    evidence: ["svhc_art57_category_record", "substitution_plan_register", "chemical_decision_rationale_log"],
    remediation:
      "Store the Art. 57 category with each screened textile chemical and require the agent to cite it and the substitute's hazards in every substitution.",
    failureMode:
      "The agent replaces a Candidate List substance with a close analogue sharing the same hazard properties, because it screens list membership only.",
    keyRisk: 2,
  },
  "ENV-WW-13": {
    l2: "A basic passport exists, but attributes are not mapped to any delegated act and updates are ad hoc",
    l4: "Attributes are mapped to delegated-act requirements with lifecycle updates, but record integrity is not signed or verified",
    evidence: ["delegated_act_attribute_map", "dpp_signature_verification_log", "dpp_lifecycle_update_record"],
    remediation:
      "Sign each DPP record version and verify the signature before the agent serves or updates it, so an altered attribute is detected and rejected.",
    failureMode:
      "The agent accepts a DPP update pushed through a supplier integration without verifying its origin, letting altered recycled-content data reach " +
      "consumers.",
    keyRisk: 4,
  },
  "ENV-WW-14": {
    l2: "SVHC content is tracked from supplier declarations for some articles, but recipient notices are not sent",
    l4: "Recipient notices go out automatically and consumer requests are logged, but concentrations are not refreshed on each Candidate List revision",
    evidence: ["article_svhc_concentration_record", "art33_recipient_notice_log", "consumer_request_response_timer"],
    remediation:
      "Recompute article SVHC concentrations on each Candidate List revision, send Article 33(1) notices automatically, and escalate consumer requests " +
      "before day 45.",
    failureMode:
      "The agent answers a consumer's Article 33 request with 'no substances of concern' from a declaration made before the substance joined the Candidate " +
      "List.",
    keyRisk: 2,
  },
  "ENV-WW-15": {
    l2: "Unsold stock and discards are recorded, but destruction decisions are not checked against Article 25",
    l4: "Prohibited destruction is refused and derogations are evidenced, but the Article 24 disclosure is still compiled outside the system",
    evidence: ["unsold_stock_disposal_decision_log", "derogation_evidence_record", "art24_disclosure_report"],
    remediation:
      "Make the disposal workflow refuse destruction of unsold apparel and footwear unless an evidenced Annex VII derogation is attached; default to reuse " +
      "or recycling.",
    failureMode:
      "The agent books an end-of-season shredding order for unsold footwear to free warehouse space, with no derogation recorded.",
    keyRisk: 0,
  },
  "ENV-WW-16": {
    l2: "Child-labour findings are recorded from audits without the C182 Art. 3 category",
    l4: "Each facility has a dated C182 screening and findings are escalated to owners, but remediation is not verified at closure",
    evidence: ["c182_category_screening_record", "child_labour_escalation_log", "remediation_verification_visit"],
    remediation:
      "Classify each child-labour finding by C182 Art. 3 category, escalate worst-form findings to a named owner the same day, and close only after a " +
      "verification visit.",
    failureMode:
      "The agent closes a child-labour finding once the supplier submits an action plan, with no visit confirming children were removed from hazardous work.",
    keyRisk: 1,
  },
};
