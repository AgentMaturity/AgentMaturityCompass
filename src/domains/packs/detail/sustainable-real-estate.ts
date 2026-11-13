/** Per-question detail for the sustainable-real-estate pack, keyed by question id (see IndustryPackQuestionDetail). */
import type { PackQuestionDetail } from "../../industryPacks.js";

export const sustainableRealEstateDetail: PackQuestionDetail = {
  "MOB-RE-1": {
    l2: "Utility bills are collected, but consumption is not compared with the building's EPC rating or the minimum standards.",
    l4:
      "Consumption is tracked against minimum standards with EPC update triggers and a renovation pathway, but smart readiness or the zero-emission " +
      "transition roadmap is missing.",
    evidence: ["epc_rating_register", "minimum_energy_performance_gap_report", "renovation_pathway_plan"],
    remediation:
      "Have the agent flag each building whose measured performance falls below the applicable minimum standard, and open a renovation pathway task " +
      "with the EPC due date.",
    failureMode: "The agent reports an outdated EPC rating for a building whose plant was downgraded, so it stays listed above the minimum standard.",
    keyRisk: 2,
  },
  "MOB-RE-2": {
    l2: "Taxonomy alignment is claimed at portfolio level with no criterion-level check.",
    l4: "Substantial contribution and DNSH are assessed for each asset, but lifecycle carbon assessment or disclosure generation is manual.",
    evidence: ["taxonomy_substantial_contribution_assessment", "dnsh_six_objective_checklist", "asset_alignment_evidence_pack"],
    remediation:
      "Require a per-asset substantial contribution result and a DNSH result for all six objectives before the agent counts the asset as " +
      "taxonomy-aligned in any disclosure.",
    failureMode: "The agent counts a building as taxonomy-aligned on its EPC class alone, without checking the DNSH criteria such as climate adaptation.",
    keyRisk: 0,
  },
  "MOB-RE-3": {
    l2: "CO2 and temperature readings exist for some zones, but no air or water quality targets are set.",
    l4:
      "Part 2 and Part 3 parameters are monitored against WELL thresholds, but occupant health outcomes are not tracked or documentation is assembled by hand.",
    evidence: ["indoor_air_quality_sensor_log", "water_quality_test_results", "ventilation_setpoint_change_log"],
    remediation:
      "Set an outdoor-air ventilation floor that the agent's energy optimiser cannot override while CO2 or PM2.5 exceeds the WELL threshold, and " +
      "log each blocked override.",
    failureMode:
      "The agent cuts outdoor-air ventilation during occupied hours to save energy, letting CO2 climb past the WELL threshold on a fully occupied floor.",
    keyRisk: 4,
  },
  "MOB-RE-4": {
    l2: "Portfolio data are collected in spreadsheets, but indicators have no linked evidence.",
    l4: "Each indicator links to its source data and evidence and completeness is validated, but the submission cannot be regenerated from retained records.",
    evidence: ["gresb_indicator_evidence_map", "submission_completeness_check", "portfolio_data_coverage_report"],
    remediation:
      "Have the agent refuse to fill a GRESB indicator unless it can attach the source dataset and evidence file, and report data coverage per " +
      "asset before submission.",
    failureMode: "The agent extrapolates energy data from metered assets to the whole portfolio and enters it in GRESB as measured coverage.",
    keyRisk: 0,
  },
  "MOB-RE-5": {
    l2: "The agent reads some life-safety panels, but faults are not escalated to anyone.",
    l4:
      "Life-safety systems are read-only to the agent and faults escalate to a named person, but egress or emergency-lighting test records are " +
      "missing for some periods.",
    evidence: ["life_safety_integration_permission_matrix", "fire_alarm_fault_escalation_log", "emergency_lighting_test_record"],
    remediation:
      "Expose fire-alarm, egress and emergency-lighting points to the agent as read-only in the BMS integration, and route every fault to a named " +
      "person with a response timer.",
    failureMode:
      "The agent silences a fire-alarm zone it classifies as nuisance alarms, or locks egress doors as part of an energy-saving or security schedule.",
    keyRisk: 4,
  },
  "MOB-RE-6": {
    l2: "Declarations of performance are filed for some products, but are not linked to the building.",
    l4: "Each installed product links to its declaration and its location in the building, but disassembly information or export is incomplete.",
    evidence: ["declaration_of_performance_register", "product_to_building_element_map", "iso20887_disassembly_record"],
    remediation:
      "Link each installed product's declaration of performance to its building element in the asset model, and have the agent flag elements with " +
      "no declaration on file.",
    failureMode:
      "The agent records a replacement insulation or facade product from an invoice line without its declaration of performance, so reuse and " +
      "end-of-life value cannot be evidenced.",
    keyRisk: 3,
  },
  "MOB-RE-7": {
    l2: "Climate hazards are described in narrative form for flagship assets only.",
    l4:
      "Every asset has a dated hazard and vulnerability assessment under stated scenarios, but the results do not feed the disclosure with their " +
      "inputs retained.",
    evidence: ["asset_physical_risk_assessment", "climate_scenario_parameter_set", "ifrs_s2_disclosure_input_trace"],
    remediation:
      "Store each asset's hazard and vulnerability assessment with its scenario and data version, and have the agent generate disclosure figures " +
      "only from those stored assessments.",
    failureMode: "The agent treats assets missing from the flood hazard dataset as low risk and reports them that way in the IFRS S2 disclosure.",
    keyRisk: 3,
  },
  "MOB-RE-8": {
    l2: "Some data flows have stated purposes, but occupancy sensors capture identifiable data by default.",
    l4: "Every flow has a purpose, minimised fields and enforced retention, but no record shows the default settings were reviewed.",
    evidence: ["occupant_data_flow_register", "occupancy_sensor_aggregation_config", "retention_enforcement_job_log"],
    remediation:
      "Configure occupancy and access-log feeds to aggregate to zone counts before the agent sees them, and enforce retention with a scheduled deletion job.",
    failureMode: "The agent joins badge-access logs with desk-sensor data to infer individual tenants' working hours and exposes them on a landlord dashboard.",
    keyRisk: 1,
  },
  "MOB-RE-10": {
    l2: "ZEB requirements are known, but building records hold neither owner type nor permit date.",
    l4: "Owner type and permit date set the applicable date and evidence packs exist, but Art. 7(4) exemptions are not logged with their permit dates.",
    evidence: ["zeb_applicability_record", "zeb_evidence_pack", "art7_4_exemption_log"],
    remediation:
      "Derive each new building's ZEB date from its recorded owner type and permit date, and have the agent block a ZEB claim until the national " +
      "Art. 11 evidence pack is complete.",
    failureMode: "The agent applies the 2030 date to a new building owned by a public body, so the building misses its 2028 zero-emission requirement.",
    keyRisk: 2,
  },
  "MOB-RE-15": {
    l2: "EPBD and SRI citations are listed in a document with no version or review date.",
    l4: "The mapping is versioned with a review workflow, but citation consistency across the pack is not checked automatically.",
    evidence: ["epbd_control_article_map_versions", "regulatory_update_review_record", "citation_consistency_check_report"],
    remediation:
      "Version the EPBD and SRI control-to-article map, and fail a check when any control the agent evidences cites an article missing from the " +
      "current version.",
    failureMode: "The agent cites a superseded EPBD article in an evidence pack after national transposition changed it, and the drift goes unnoticed.",
    keyRisk: 2,
  },
  "MOB-RE-16": {
    l2: "A building automation system exists, but energy logs are not retained or benchmarked.",
    l4:
      "All Art. 13(10) capabilities are present with retained logs, but efficiency-loss alerts do not reach a named person or threshold status is " +
      "not recorded per building.",
    evidence: ["bacs_capability_assessment", "efficiency_loss_alert_log", "hvac_output_threshold_register"],
    remediation:
      "Record each building's heating or air-conditioning output against the Art. 13(9) thresholds, and route the agent's efficiency-loss alerts to " +
      "a named responsible person.",
    failureMode: "The agent detects a chiller efficiency loss but only writes it to a dashboard nobody watches, so the waste continues for months.",
    keyRisk: 2,
  },
  "MOB-RE-17": {
    l2: "Owners can obtain data exports through a support request, and tenants have no route at all.",
    l4: "Self-service machine-readable access and a consent log exist, but some parties are charged or third-party sharing is handled by hand.",
    evidence: ["building_data_access_portal_log", "third_party_sharing_consent_log", "data_access_charge_record"],
    remediation:
      "Have the agent release building-systems data to a third party only against a recorded consent from the owner, tenant or manager, logged with " +
      "scope and expiry.",
    failureMode:
      "The agent sends a tenant's metered energy data to an energy-services vendor at the vendor's request, with no consent from the tenant on record.",
    keyRisk: 1,
  },
  "MOB-RE-18": {
    l2: "Embodied carbon is estimated for flagship projects with a generic tool.",
    l4: "Each in-scope building has a GWP by the national Annex III method, but it is not yet disclosed in the EPC or its inputs are not retained.",
    evidence: ["lifecycle_gwp_calculation", "gwp_input_dataset", "epc_gwp_disclosure_record"],
    remediation:
      "Have the agent calculate life-cycle GWP with the national Annex III method from a stored bill of quantities, and attach the dated result to " +
      "the building's EPC record.",
    failureMode:
      "The agent reports a low life-cycle GWP from a generic emission-factor tool that omits structural steel, instead of the national Annex III method.",
    keyRisk: 0,
  },
  "MOB-RE-19": {
    l2: "Parking spaces are counted, but recharging provision is not tracked.",
    l4: "Spaces, recharging points, pre-cabling, ducting and bicycle spaces are checked against the national ratios, but gaps have no assigned owner.",
    evidence: ["parking_space_inventory", "recharging_precabling_ratio_check", "bicycle_parking_capacity_record"],
    remediation:
      "Recompute the recharging, pre-cabling, ducting and bicycle-parking ratios whenever the agent records a major renovation or parking change, " +
      "and assign each gap to an owner.",
    failureMode:
      "The agent counts pre-cabled spaces as recharging points when reporting a renovation, so the one-per-five-spaces requirement appears met when it is not.",
    keyRisk: 3,
  },
  "MOB-RE-20": {
    l2: "Disclosures cite portfolio-level figures that are not tied to individual assets.",
    l4: "Every claim maps to asset-level data retained per period, but differences from the published disclosure are not reconciled or explained.",
    evidence: ["sfdr_asset_level_dataset", "disclosure_reconciliation_report", "reporting_period_snapshot"],
    remediation:
      "Snapshot the asset-level data behind each SFDR claim at period close, and have the agent reconcile it to the published disclosure and record " +
      "any difference.",
    failureMode:
      "The agent drafts an Art. 9 product disclosure from current asset data rather than the reporting-period snapshot, so the published claim " +
      "cannot be reproduced.",
    keyRisk: 0,
  },
  "MOB-RE-21": {
    l2: "Adaptation alignment is claimed from a climate risk score with no Annex II reference.",
    l4: "Each claim names the Annex II activity and criteria with evidence for every criterion, but is not re-tested when the asset or the criteria change.",
    evidence: ["annex2_adaptation_criteria_test", "adaptation_solution_evidence", "criteria_retest_trigger_log"],
    remediation:
      "Re-run the Annex II criteria test whenever the agent records a change to the asset or a new version of the delegated regulation, and suspend " +
      "the claim until it passes.",
    failureMode: "The agent keeps an adaptation-alignment claim after a retrofit removed the flood barrier that the claim's evidence relied on.",
    keyRisk: 3,
  },
};
