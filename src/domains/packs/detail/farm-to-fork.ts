/** Per-question detail for the farm-to-fork pack, keyed by question id (see IndustryPackQuestionDetail). */
import type { PackQuestionDetail } from "../../industryPacks.js";

export const farmToForkDetail: PackQuestionDetail = {
  "ENV-FF-1": {
    l2: "CCP readings are captured by the agent but compared with critical limits only in periodic manual reviews; deviations are logged inconsistently",
    l4: "Every deviation links to its corrective action and human sign-off, but verification results are added late or retention retrieval is untested",
    evidence: ["ccp_deviation_log", "corrective_action_signoff_record", "haccp_critical_limit_table", "ccp_verification_sample_report"],
    remediation:
      "Bind each CCP sensor feed to the plan's critical limit table and make the agent open a corrective action that closes only with named sign-off.",
    failureMode:
      "The agent logs an out-of-limit pasteurisation or chilling reading as a sensor glitch and lets the batch proceed with no corrective action.",
    keyRisk: 1,
  },
  "ENV-FF-2": {
    l2: "Digital records cover immediate suppliers and customers for most lots, but transformation steps are rebuilt from paper on request",
    l4: "Lot genealogy links farm origin, transformations and logistics to point of sale, but smallholder aggregation stays batch-level and recalls take hours",
    evidence: ["lot_genealogy_graph_export", "mock_recall_trace_timing_report", "supplier_lot_mapping_table", "smallholder_aggregation_record"],
    remediation:
      "Write a genealogy edge for every receipt, transformation and shipment keyed by lot ID, and fail a quarterly timed mock recall on any untraced lot.",
    failureMode:
      "The agent fills a genealogy gap with a supplier inferred from purchase history, so a recall trace names the wrong farm and misses the adulterated " +
      "source.",
    keyRisk: 0,
  },
  "ENV-FF-3": {
    l2: "Geolocation is requested from suppliers but not checked; the agent records supplier self-declarations of deforestation-free status",
    l4:
      "Every lot has plot geolocation and a dated dataset check, but legality evidence is incomplete for some origins and failing lots are flagged, not " +
      "blocked",
    evidence: ["plot_geolocation_polygon_register", "deforestation_check_result_log", "legality_evidence_file", "blocked_lot_register"],
    remediation:
      "Add a pre-placing gate that holds a relevant-product lot until its plots pass a deforestation check (dataset and version logged) with legality " +
      "evidence.",
    failureMode:
      "The agent accepts plot coordinates copied from another lot and clears cocoa or soy grown on a recently cleared plot for export.",
    keyRisk: 2,
  },
  "ENV-FF-4": {
    l2: "Organic status of inputs is recorded from supplier claims; the agent does not check substances against the authorised lists",
    l4: "Inputs are checked against the authorised-substance lists and blocked when absent, but results are not linked to every lot or exportable",
    evidence: ["input_substance_authorisation_check_log", "organic_lot_input_linkage", "blocked_input_register", "control_body_evidence_export"],
    remediation:
      "Check each fertiliser, plant-protection product and processing aid against the versioned authorised list before approval and link the result to the " +
      "lot.",
    failureMode:
      "The agent approves a plant-protection product for an organic field because its trade name resembles an authorised substance, contaminating the " +
      "organic lot.",
    keyRisk: 0,
  },
  "ENV-FF-5": {
    l2: "Allergen data per recipe exists, but label checks against the 14 Annex II categories are manual and line sequencing ignores allergens",
    l4:
      "Sequencing applies allergen order and changeover-clean rules and labels are verified at print, but precautionary-label risk assessments are not " +
      "recorded",
    evidence: ["recipe_allergen_matrix", "line_sequencing_allergen_rule_log", "changeover_clean_verification_record", "label_artwork_allergen_check"],
    remediation:
      "Add allergen constraints to the scheduling tool so an Annex II allergen run cannot precede an allergen-free run without a verified changeover clean.",
    failureMode:
      "The agent reorders production to cut changeovers and schedules an allergen-free product straight after a peanut run on the same line with no " +
      "validated clean.",
    keyRisk: 3,
  },
  "ENV-FF-6": {
    l2: "Declarations are produced from a nutrient database but reference outdated recipe versions; formulation changes go undetected",
    l4: "Formulation changes regenerate and check the declaration, but supplier-specification changes do not and front-of-pack outputs are computed separately",
    evidence: ["nutrition_declaration_version_history", "recipe_change_trigger_log", "front_of_pack_scheme_calculation_record"],
    remediation:
      "Subscribe the declaration generator to recipe and supplier-spec change events so each change regenerates the declaration and front-of-pack output " +
      "from one source.",
    failureMode:
      "The agent publishes a nutrition table from a superseded recipe after a sugar or salt reformulation, so the label misstates the product.",
    keyRisk: 0,
  },
  "ENV-FF-7": {
    l2: "Payment-term limits sit in the ERP, but the agent can issue short-notice cancellations and contract changes with no check",
    l4: "Orders, payment runs and changes are checked and blocks are logged with approver, but the rule list is not versioned to the national transposition",
    evidence: ["payment_run_term_check_log", "perishable_order_cancellation_log", "contract_change_override_register", "utp_rule_version_history"],
    remediation:
      "Block payment dates past 30 or 60 days by product type, short-notice perishable cancellations and unilateral changes before issue; log each override.",
    failureMode:
      "The agent cancels a perishable produce order days before delivery to chase a cheaper spot price, leaving a smallholder with an unsold harvest.",
    keyRisk: 4,
  },
  "ENV-FF-8": {
    l2: "Records sit in a shared repository with templates but no version control; evidence is gathered by hand before audits",
    l4: "Documented information is version-controlled and monitoring records flow in, but completeness checks are not run and the audit export is manual",
    evidence: ["fsms_document_version_register", "monitoring_record_completeness_report", "audit_export_package"],
    remediation:
      "Run a daily completeness check of expected versus received monitoring and verification records per process step and open a gap ticket for each miss.",
    failureMode:
      "The agent overwrites a controlled food safety procedure with a regenerated draft and no version history, so the audited record differs from what " +
      "operators used.",
    keyRisk: 1,
  },
  "ENV-FF-9": {
    l2: "A food safety plan document exists, but hazard analysis and preventive controls are not held in structured form by the agent",
    l4:
      "Monitoring, corrective-action and verification records link per preventive control, but validation is incomplete or reanalysis is not triggered on " +
      "change",
    evidence: ["preventive_control_monitoring_record", "corrective_action_record", "validation_study_record", "reanalysis_trigger_log"],
    remediation:
      "Link each preventive control to its monitoring, corrective-action, verification and validation records, and open a reanalysis task on any logged " +
      "change.",
    failureMode:
      "The agent marks a supply-chain preventive control as verified from a supplier letter alone, leaving the US food safety plan without a verification " +
      "record.",
    keyRisk: 1,
  },
  "ENV-FF-10": {
    l2: "Immediate supplier and customer are recorded for whole lots, but split, merge and rework operations break the link",
    l4: "Genealogy handles split, merge and rework and exports come within hours, but reconciliation against ERP/WMS events is periodic",
    evidence: ["one_up_one_down_lot_report", "split_merge_rework_genealogy_log", "erp_wms_reconciliation_exceptions"],
    remediation:
      "Reconcile lot genealogy against ERP and WMS movement events each shift and raise an exception for any lot whose supplier or customer link is unmatched.",
    failureMode:
      "The agent gives a reworked batch a new lot ID without linking its input lots, so the one-step-back trace stops at the rework and the source supplier " +
      "is lost.",
    keyRisk: 0,
  },
  "ENV-FF-11": {
    l2: "Hazards are listed for main products, but CCP/OPRP choices lack a recorded rationale and no validation evidence is attached",
    l4: "Hazard analysis updates on process and supplier changes with validated CCP/OPRP logic, but revalidation approvals are not signed consistently",
    evidence: ["hazard_analysis_worksheet", "ccp_oprp_decision_record", "control_measure_validation_study", "revalidation_approval_signature"],
    remediation:
      "Require a validation study reference and signed approval before a proposed CCP or OPRP assignment takes effect, and reopen the analysis on change " +
      "events.",
    failureMode:
      "The agent downgrades a CCP to a prerequisite programme after a line change on its own risk estimate, with no validation study or signed approval.",
    keyRisk: 1,
  },
  "ENV-FF-12": {
    l2: "Control measures exist as SOPs, but the monitoring parameters the agent uses are not linked to hazard analysis outputs",
    l4: "Monitoring and corrections link to the hazard analysis, but operational parameter changes are not change-controlled or tied to verification",
    evidence: ["hazard_control_parameter_map", "correction_record", "parameter_change_control_log"],
    remediation:
      "Change-control every setpoint, limit and sampling frequency the agent can edit, requiring a hazard analysis link and a verification activity first.",
    failureMode:
      "The agent widens a metal-detector or temperature limit to cut false rejects, breaking the link between the hazard analysis and the operational control.",
    keyRisk: 1,
  },
  "ENV-FF-13": {
    l2: "Supplier organic status is recorded once at onboarding; validity and scope are not tracked afterwards",
    l4: "Validity and scope are reconciled with control-body records and product claims are gated, but scope changes are handled outside the workflow",
    evidence: ["supplier_organic_scope_register", "control_body_reconciliation_log", "organic_claim_gate_decision", "scope_change_record"],
    remediation:
      "Reconcile each supplier's organic document validity and product scope with the control-body database before every order; block out-of-scope organic " +
      "claims.",
    failureMode:
      "The agent keeps buying and labelling a product as organic after the supplier's organic document lapsed or its scope stopped covering that product.",
    keyRisk: 0,
  },
  "ENV-FF-14": {
    l2: "Welfare checklists are collected from farms, but missing or failed items are not followed up",
    l4: "Welfare evidence and incidents link to remediation with grievance intake, but KPI reporting against the AF.10 controls is manual",
    evidence: ["farm_worker_welfare_checklist", "grievance_intake_log", "welfare_remediation_tracker"],
    remediation:
      "Open a remediation task with owner and due date for each missing or failed AF.10 item and hold the farm's approval until closure is evidenced.",
    failureMode:
      "The agent approves a farm from a self-completed welfare checklist while an open grievance about worker housing sits unread.",
    keyRisk: 4,
  },
  "ENV-FF-15": {
    l2: "Statements or references are captured for primary-operator flows only; roles are assumed rather than determined per product",
    l4: "Every placed or exported lot carries its statement, declaration or upstream reference and roles are logged, but five-year retention is not enforced",
    evidence: ["eudr_operator_role_decision_log", "dds_reference_number_register", "supplier_recipient_record_archive"],
    remediation:
      "Determine and log the EUDR role per product before placing or export, require the matching identifier on the lot, and lock party records for five " +
      "years.",
    failureMode:
      "The agent assumes a downstream trader must file its own statement and generates a duplicate due diligence statement instead of carrying the upstream " +
      "reference.",
    keyRisk: 2,
  },
  "ENV-FF-16": {
    l2: "Recall steps are documented and affected lots are found on request, but authority notifications are drafted by hand",
    l4: "Affected lots, notification templates and evidence bundles are produced instantly, but post-recall CAPA is not tracked",
    evidence: ["recall_affected_lot_list", "authority_notification_record", "recall_evidence_bundle", "post_recall_capa_tracker"],
    remediation:
      "Route every withdrawal or recall decision and authority notification the agent drafts to a named food safety manager, logging approval time.",
    failureMode:
      "The agent decides on its own that a positive pathogen result is a lab error and neither starts a withdrawal nor alerts the food safety manager.",
    keyRisk: 0,
  },
  "ENV-FF-17": {
    l2: "Food waste is recorded at some sites as a total weight without stage or method",
    l4: "One documented method per site and stage is used and reduction is tracked, but data cannot yet be exported for national reporting",
    evidence: ["food_waste_measurement_method_doc", "site_stage_waste_quantity_log", "waste_reduction_target_tracker"],
    remediation:
      "Tag every food-waste record with site, stage and the documented method ID, and keep records using any other method out of the target tracker.",
    failureMode:
      "The agent mixes estimated and weighed food-waste figures across sites and reports a reduction that comes from a method change, not less waste.",
    keyRisk: 4,
  },
  "ENV-FF-18": {
    l2: "Traceability lot codes exist for listed foods, but KDEs cover only a few CTEs and the spreadsheet is compiled by hand",
    l4: "KDEs are recorded for most CTEs and the spreadsheet comes within 24 hours, but cooling or transformation events have gaps",
    evidence: ["cte_kde_record_table", "fda_sortable_spreadsheet_test_run", "traceability_lot_code_assignment_log"],
    remediation:
      "Validate at capture that each CTE record for a Food Traceability List food has all its KDEs, and run a timed spreadsheet drill that fails past 24 " +
      "hours.",
    failureMode:
      "The agent leaves KDEs blank on a leafy-greens transformation event, so the spreadsheet sent to FDA cannot link finished product to source lots.",
    keyRisk: 0,
  },
};
