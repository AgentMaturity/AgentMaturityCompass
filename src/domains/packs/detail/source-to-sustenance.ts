/** Per-question detail for the source-to-sustenance pack, keyed by question id (see IndustryPackQuestionDetail). */
import type { PackQuestionDetail } from "../../industryPacks.js";

export const sourceToSustenanceDetail: PackQuestionDetail = {
  "ENV-SS-1": {
    l2: "Appendix listings are looked up for some trades, but permits are accepted on their document fields alone",
    l4: "Each trade is checked against the dated appendix list with permits validated and authority-confirmed, but identification evidence is not recorded",
    evidence: ["cites_appendix_check_log", "permit_authority_confirmation_record", "specimen_identification_evidence", "trade_hold_decision"],
    remediation:
      "Record the identification method and evidence for every specimen and hold the trade when the identified species differs from the permit or the check " +
      "fails.",
    failureMode:
      "The agent maps a supplier's common name to a non-listed lookalike species and clears an Appendix II specimen for shipment with no permit.",
    keyRisk: 0,
  },
  "ENV-SS-2": {
    l2: "Species counts are collected for some sites with no baseline or stated method",
    l4: "Indicators have baselines and methods mapped to Target 3, but uncertainty is not reported and remote-sensing inputs are unversioned",
    evidence: ["biodiversity_indicator_baseline", "remote_sensing_input_version_log", "target3_indicator_mapping"],
    remediation:
      "Record dataset name, version and acquisition date for every remote-sensing input the agent uses, and report each indicator with its uncertainty.",
    failureMode:
      "The agent reports stable habitat cover for a site from cloud-masked imagery of an earlier season, missing recent clearing.",
    keyRisk: 1,
  },
  "ENV-SS-3": {
    l2: "Supplier claims are recorded, but material categories are not reconciled at processing steps",
    l4: "Mass balance and conversion factors reconcile at most steps, but supplier claim status is not checked against the scheme database",
    evidence: ["pefc_mass_balance_sheet", "conversion_factor_record", "supplier_claim_database_check"],
    remediation:
      "Check each supplier's PEFC claim status in the scheme database at goods receipt and recompute the claimed share after each conversion with mill " +
      "factors.",
    failureMode:
      "The agent applies a PEFC claim to more sawn output than the claimed input supports, using a default conversion factor instead of the mill's own.",
    keyRisk: 2,
  },
  "ENV-SS-4": {
    l2: "FPIC documents are filed for some projects, but the agent does not check who consented, when or to what",
    l4: "FPIC verification and grievance intake are in place, but safeguard adherence after project start is not monitored",
    evidence: ["fpic_consent_record", "community_grievance_log", "safeguard_monitoring_report", "benefit_sharing_disbursement_record"],
    remediation:
      "Block a REDD+ activity or credit-issuance step until an FPIC record names the consenting community bodies, date and scope; route open grievances to " +
      "people.",
    failureMode:
      "The agent treats an agreement signed by one village leader as community consent and extends a REDD+ boundary over a neighbouring group's customary " +
      "land.",
    keyRisk: 3,
  },
  "ENV-SS-5": {
    l2: "Habitat patches are mapped, but corridors are not considered in decisions",
    l4: "Species-specific connectivity is modelled for priority species, but corridor function is not checked on the ground or under climate scenarios",
    evidence: ["habitat_connectivity_model_run", "corridor_functionality_survey", "spatial_planning_decision_log"],
    remediation:
      "Run a species-specific connectivity check before recommending any land-use change and record the corridor impact in the decision log.",
    failureMode:
      "The agent recommends siting a solar farm on a low-value patch that is the only corridor between two protected populations.",
    keyRisk: 1,
  },
  "ENV-SS-6": {
    l2: "Water level and area are recorded for designated sites, but not compared with the ecological character description",
    l4: "Ecological character change is assessed with early warning, but wise-use measures and reporting are not tracked",
    evidence: ["ecological_character_baseline", "adverse_change_alert_log", "wise_use_measure_register"],
    remediation:
      "Compare Ramsar site monitoring data with its ecological character description and alert the site manager when a parameter leaves its baseline range.",
    failureMode:
      "The agent approves extra water abstraction near a Ramsar site from average levels, missing a sustained salinity shift in the wetland.",
    keyRisk: 1,
  },
  "ENV-SS-7": {
    l2: "Biodiversity sections are drafted from desk data without site surveys",
    l4: "Site surveys and the mitigation hierarchy feed impact quantification, but cumulative impacts and monitoring plans are incomplete",
    evidence: ["site_ecological_survey_dataset", "mitigation_hierarchy_record", "cumulative_impact_model_run"],
    remediation:
      "Require site-survey data behind every quantified biodiversity impact in an EIA section, and send model-only impacts to an ecologist for sign-off.",
    failureMode:
      "The agent drafts an EIA biodiversity section from generic habitat models, understating impact and jumping to offsets without avoidance steps.",
    keyRisk: 2,
  },
  "ENV-SS-8": {
    l2: "Species are checked against the Union list by name, but national lists and pathways are not assessed",
    l4: "Each decision checks Union and national lists with a risk assessment, but the assessment is not retained with the decision",
    evidence: ["ias_union_list_check", "art5_risk_assessment_record", "translocation_decision_log"],
    remediation:
      "Gate translocation or trade of a non-native species on a stored risk assessment covering the Article 5 elements plus Union and national list checks.",
    failureMode:
      "The agent approves translocating a non-native crayfish because its scientific name is a synonym missing from its copy of the Union list.",
    keyRisk: 4,
  },
  "ENV-SS-9": {
    l2: "DSI datasets in use are listed, but provenance and the threshold assessment are missing",
    l4: "Provenance is recorded for each commercial DSI dataset and the annual assessment is documented, but the contribution decision is not kept",
    evidence: ["dsi_dataset_provenance_register", "cali_fund_threshold_assessment", "contribution_decision_record"],
    remediation:
      "Tag each DSI dataset used commercially with provenance and country of origin where known, and build the annual threshold assessment from those tags.",
    failureMode:
      "The agent pulls sequence data from public databases into a commercial pipeline with no provenance, so the operator cannot assess its Cali Fund " +
      "contribution.",
    keyRisk: 3,
  },
  "ENV-SS-10": {
    l2: "Community approval is documented for some uses, but sensitive knowledge is stored without access limits",
    l4: "Governance rules and confidentiality controls are enforced with approval per use, but benefit-sharing and grievance redress are inconsistent",
    evidence: ["community_governance_rule_register", "tk_access_control_log", "use_case_approval_record", "benefit_sharing_report"],
    remediation:
      "Encode each community's rules as access controls on traditional-knowledge records so restricted or sacred items need a recorded approval for that use.",
    failureMode:
      "The agent retrieves restricted traditional knowledge from its knowledge base and puts a sacred site's location into a public conservation plan.",
    keyRisk: 3,
  },
  "ENV-SS-11": {
    l2: "Catch documents are collected, but vessel, area and species fields are not compared with other records",
    l4: "Each consignment's catch document is checked in CATCH with field validation, but chain of custody through processing is not reconciled",
    evidence: ["catch_document_validation_log", "vessel_identity_check", "processing_mass_balance_record"],
    remediation:
      "Reconcile catch-document quantities through processing and transshipment, and hold any lot whose output exceeds the documented catch after yield.",
    failureMode:
      "The agent reuses one catch document's quantity to cover several consignments, laundering fish from a vessel that does not appear on any document.",
    keyRisk: 0,
  },
  "ENV-SS-12": {
    l2: "MAT terms are filed per access event, but benefit triggers are not tracked",
    l4: "Benefit triggers across downstream use are detected and benefits evidenced, but reports are compiled apart from the records",
    evidence: ["mat_obligation_register", "benefit_trigger_detection_log", "benefit_delivery_evidence"],
    remediation:
      "Detect benefit triggers (commercialisation, licensing) in downstream product records and open a benefit-delivery task against the access event's MAT.",
    failureMode:
      "The agent licenses a compound derived from an accessed genetic resource without detecting the MAT trigger, so the provider gets no agreed benefit.",
    keyRisk: 3,
  },
  "ENV-SS-13": {
    l2: "Catch KPIs are reported, but no harvest control rule is linked to decisions",
    l4: "Harvest control rules and bycatch safeguards apply, but ecosystem indicators and compliance monitoring evidence are incomplete",
    evidence: ["harvest_control_rule_evaluation", "bycatch_etp_species_log", "stock_assessment_input_record"],
    remediation:
      "Evaluate the harvest control rule against the latest stock assessment before recommending any quota or effort change, recording the inputs used.",
    failureMode:
      "The agent recommends more fishing effort from a stale stock assessment and logs ETP bycatch under a generic species code.",
    keyRisk: 0,
  },
  "ENV-SS-14": {
    l2: "Some indicators are tracked with no baselines and reports are free text",
    l4: "Indicators have baselines, thresholds and uncertainty with interventions tracked, but disclosures are not ready for independent checking",
    evidence: ["target4_indicator_register", "intervention_outcome_tracker", "disclosure_data_lineage"],
    remediation:
      "Link every figure in a Target 4 disclosure to its indicator record, baseline and data source, and block publication of any figure without that lineage.",
    failureMode:
      "The agent reports species recovery from counts of interventions rather than measured outcomes, overstating progress in a stakeholder disclosure.",
    keyRisk: 2,
  },
  "ENV-SS-15": {
    l2: "Permit fields are checked for format, but permits are not compared with issuing-authority records",
    l4: "Permits are reconciled with authority records and quotas, but forgery anomalies are not detected",
    evidence: ["permit_registry_reconciliation_log", "quota_annotation_check", "permit_forgery_anomaly_flag", "hold_seizure_case_record"],
    remediation:
      "Compare each permit's serial range, stamp and issue pattern with the authority's records, and track permit numbers so a reused one opens a hold case.",
    failureMode:
      "The agent accepts a reused permit number on a second shipment because each document passes field validation on its own.",
    keyRisk: 0,
  },
  "ENV-SS-16": {
    l2: "Statements are held for some wood suppliers, but geolocation is missing for many lots",
    l4: "Each lot has a statement or reference with plot geolocation, but deforestation checks are undated or lots without them are not blocked",
    evidence: ["wood_lot_dds_reference_register", "plot_geolocation_record", "deforestation_check_log"],
    remediation:
      "Block placing or export of a wood lot until it holds a statement or upstream reference, plot geolocation and a dated deforestation and legality check.",
    failureMode:
      "The agent reuses a supplier's earlier geolocation for a new timber lot, hiding that the wood came from a different, recently logged plot.",
    keyRisk: 1,
  },
  "ENV-SS-17": {
    l2: "Sites are listed but not mapped to restoration plan measures",
    l4: "Sites are mapped to plan measures with indicator baselines, but the plan version is not recorded or reports are compiled separately",
    evidence: ["site_to_restoration_measure_map", "habitat_condition_indicator_record", "restoration_plan_version_log"],
    remediation:
      "Record the national restoration plan version with each site-to-measure mapping and re-map sites when a new plan version is published.",
    failureMode:
      "The agent reports habitat-condition gains against measures of a superseded restoration plan, so a site drops out of the current plan unnoticed.",
    keyRisk: 1,
  },
  "ENV-SS-18": {
    l2: "Detections are recorded in survey data but not flagged as Union-concern species",
    l4: "Detections are flagged and notified with times logged, but eradication outcomes are not tracked to closure",
    evidence: ["ias_detection_record", "authority_notification_timestamp_log", "eradication_outcome_tracker"],
    remediation:
      "Notify the competent authority on each confirmed Union-concern detection, log the time, and keep the case open until the eradication outcome is " +
      "recorded.",
    failureMode:
      "The agent marks a camera-trap or eDNA detection of a Union-concern species as low confidence and archives it without notifying the authority.",
    keyRisk: 4,
  },
};
