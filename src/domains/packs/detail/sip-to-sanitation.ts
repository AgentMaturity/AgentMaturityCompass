/** Per-question detail for the sip-to-sanitation pack, keyed by question id (see IndustryPackQuestionDetail). */
import type { PackQuestionDetail } from "../../industryPacks.js";

export const sipToSanitationDetail: PackQuestionDetail = {
  "ENV-STS-1": {
    l2: "Lab results are keyed in by hand and checked against parametric values only at monthly review",
    l4: "All programme parameters are checked against parametric values with sample links, but consumer-information decisions are not always recorded",
    evidence: ["parametric_value_check_log", "sampling_record_link", "exceedance_remedial_action_record", "consumer_information_decision"],
    remediation:
      "Open a remedial-action and consumer-information record for every Annex I exceedance that only a named water quality manager can close.",
    failureMode:
      "The agent averages an E. coli exceedance with clean samples from the same zone and reports the zone as meeting parametric values.",
    keyRisk: 0,
  },
  "ENV-STS-2": {
    l2: "Effluent results are compared with current limits monthly, but recast obligations are not listed",
    l4: "Current limits are evidenced and recast obligations and parameters are in the data model, but authority reports are compiled separately",
    evidence: ["effluent_limit_compliance_record", "recast_obligation_map", "micropollutant_parameter_schema"],
    remediation:
      "Map each treatment plant to its recast obligations with application dates and add recast monitoring parameters to the data model before the first " +
      "due date.",
    failureMode:
      "The agent bypasses nutrient removal to save energy during a storm and reports the plant within limits using the next day's sample.",
    keyRisk: 1,
  },
  "ENV-STS-3": {
    l2: "Chemical parameters are tracked per water body, but biological elements are missing",
    l4: "Biological, hydromorphological and chemical elements are assessed together, but programme-of-measures effectiveness is not tracked",
    evidence: ["water_body_status_classification", "biological_quality_element_dataset", "measures_effectiveness_tracker"],
    remediation:
      "Compute status from biological, hydromorphological and chemical elements together and record which element drives each water body's class.",
    failureMode:
      "The agent classifies a river as good status from chemistry alone while macroinvertebrate surveys show decline.",
    keyRisk: 1,
  },
  "ENV-STS-4": {
    l2: "Hazards are listed in a WSP document, but risk scores are not linked to operational data",
    l4: "Risk updates with operational data and control measures are verified, but incident escalation and periodic review are not documented",
    evidence: ["wsp_hazard_risk_register", "control_measure_verification_log", "incident_escalation_record"],
    remediation:
      "Feed turbidity, rainfall and source-quality alarms into the WSP risk register so a hazard's score is recalculated when its trigger occurs.",
    failureMode:
      "The agent keeps the catchment hazard score static after heavy rainfall, leaving coagulant dosing unchanged through a turbidity spike.",
    keyRisk: 0,
  },
  "ENV-STS-5": {
    l2: "Discharge entries are copied from logbooks but not checked against discharge conditions",
    l4: "Discharges are checked against conditions with AIS position and port reception data, but flag-state reporting is manual",
    evidence: ["sewage_discharge_position_log", "garbage_record_book_entry", "ais_track_reconciliation"],
    remediation:
      "Check each logged sewage or garbage discharge against the vessel's AIS position, speed and distance from land before accepting the entry.",
    failureMode:
      "The agent schedules a sewage discharge inside a restricted zone because it used planned route waypoints instead of the AIS position.",
    keyRisk: 1,
  },
  "ENV-STS-6": {
    l2: "Access metrics are reported for the service area, but not used in allocation or pricing",
    l4: "Underserved areas are prioritised with affordability modelling, but sanitation access and SDG 6 progress are not reported",
    evidence: ["access_gap_analysis", "affordability_impact_model", "distribution_priority_decision_log"],
    remediation:
      "Assess impact on underserved and low-income zones before any rationing or tariff change, and route changes that cut their supply first to human " +
      "approval.",
    failureMode:
      "The agent rations pressure in a drought by cutting zones with the lowest revenue per connection first, leaving informal settlements without water.",
    keyRisk: 2,
  },
  "ENV-STS-7": {
    l2: "Some KPIs are reported, but not to the ISO 24510 definitions",
    l4: "ISO 24510 indicators are calculated and benchmarked against peers, but improvement priorities and public reporting are not linked",
    evidence: ["iso24510_kpi_definition_register", "peer_benchmark_report", "service_complaint_dataset"],
    remediation:
      "Compute each ISO 24510 indicator from documented source data and flag any value that moved because of a definition change rather than performance.",
    failureMode:
      "The agent drops unresolved complaints from the service-reliability KPI to meet a target, publishing a figure that hides poor service in some districts.",
    keyRisk: 2,
  },
  "ENV-STS-8": {
    l2: "SCADA traffic is logged, but the agent's own connections are not segmented or monitored",
    l4: "Segmentation and access control are enforced and tested, but OT incident response for agent-touched systems is not exercised",
    evidence: ["it_ot_segmentation_test", "scada_tag_allowlist", "ot_incident_response_exercise_record"],
    remediation:
      "Put the agent on a dedicated, monitored conduit into SCADA with an allowlist of read and write tags, and exercise OT incident response for that path.",
    failureMode:
      "The agent connects to SCADA over a flat IT/OT network, so an attacker who compromises its corporate host can write chlorine dosing setpoints.",
    keyRisk: 4,
  },
  "ENV-STS-9": {
    l2: "PFAS results are stored, but not compared with the parametric values",
    l4: "Results carry validated method data and exceedances open remedial measures, but authority reporting is compiled separately",
    evidence: ["pfas_analytical_method_validation", "pfas_exceedance_remedial_record", "pfas_authority_report_export"],
    remediation:
      "Reject PFAS results lacking validated method data (LOQ, recovery) and open a remedial-measure record for each PFAS Total or Sum of PFAS exceedance.",
    failureMode:
      "The agent accepts PFAS results from a lab method that cannot quantify at the parametric value and reports the supply as meeting it.",
    keyRisk: 3,
  },
  "ENV-STS-10": {
    l2: "PFAS limits are configured without legal status and changed by editing code",
    l4: "Each limit has legal status and effective date and changes are logged, but reporting is not rechecked against the rule in force after a change",
    evidence: ["pfas_limit_legal_status_table", "pfas_rule_change_log", "monitoring_report_rule_version"],
    remediation:
      "Store each US PFAS limit with legal status and effective date, and apply a proposed rule change only after a human records it as final.",
    failureMode:
      "The agent stops PFHxS and HFPO-DA monitoring after reading a proposed rescission in a news feed, treating a proposal as final.",
    keyRisk: 3,
  },
  "ENV-STS-11": {
    l2: "A risk assessment covers the supply system, but catchment and domestic distribution are not covered",
    l4: "Each stage has a dated assessment and measures with verification, but reviews run on schedule only and are not triggered by change",
    evidence: ["catchment_risk_assessment", "supply_system_risk_assessment", "control_verification_record", "risk_review_trigger_log"],
    remediation:
      "Trigger a review of the affected stage's risk assessment whenever a new source, treatment change or distribution incident is logged.",
    failureMode:
      "The agent relies on a catchment risk assessment that predates a new upstream industrial discharge and leaves raw-water monitoring unchanged.",
    keyRisk: 0,
  },
  "ENV-STS-12": {
    l2: "Nutrient loads are reported, but not attributed to sub-basins",
    l4: "Loads are attributed and measures tracked against targets, but effectiveness over time is not shown",
    evidence: ["nutrient_load_attribution_model", "bsap_measure_tracker", "basin_load_report"],
    remediation:
      "Attribute each discharge's nitrogen and phosphorus load to its BSAP sub-basin and track each measure's load reduction against its target.",
    failureMode:
      "The agent shifts plant loading to an outfall in a sub-basin already over its nutrient target because it optimises only on treatment cost.",
    keyRisk: 1,
  },
  "ENV-STS-13": {
    l2: "The system assessment is documented, but operational limits and verification are missing",
    l4: "Operational monitoring, procedures and verification are in place, but independent review is irregular and documents are not controlled",
    evidence: ["operational_monitoring_limit_table", "wsp_independent_review_record", "controlled_sop_register"],
    remediation:
      "Set operational limits for every WSP control measure in the monitoring config and switch the agent to the incident procedure when a limit is breached.",
    failureMode:
      "The agent stays on the normal operating procedure after chlorine residual falls below its operational limit because the incident SOP is not linked " +
      "to it.",
    keyRisk: 0,
  },
  "ENV-STS-14": {
    l2: "Equipment documents are filed, but maintenance and alarms are not linked to discharge events",
    l4: "Equipment status and maintenance are tracked, but bypass and malfunction patterns are not reconciled with discharges",
    evidence: ["sewage_plant_approval_record", "maintenance_inspection_log", "bypass_alarm_event_log"],
    remediation:
      "Link each sewage discharge event to the treatment plant's alarm and bypass log, and refuse to record a discharge as treated while a bypass was active.",
    failureMode:
      "The agent records a discharge as treated effluent while the sewage treatment plant was in bypass after a pump fault.",
    keyRisk: 1,
  },
  "ENV-STS-15": {
    l2: "Monitoring data is ingested without programme or station tags",
    l4: "Each decision cites programme, station and sampling date, but decisions on under-monitored water bodies are not escalated",
    evidence: ["decision_monitoring_citation", "monitoring_coverage_gap_report", "programme_station_register"],
    remediation:
      "Require each water-quality decision to cite its monitoring programme, station and sampling date, and escalate decisions on bodies with coverage gaps.",
    failureMode:
      "The agent concludes a water body has no emerging contaminants because no station there measures them, treating missing data as a clean result.",
    keyRisk: 3,
  },
  "ENV-STS-16": {
    l2: "The RRA lists the agent's systems, but agent failure scenarios and an ERP fallback are not described",
    l4: "Agent failure and compromise scenarios are assessed and the fallback is exercised, but RRA and ERP due dates are not tracked",
    evidence: ["rra_agent_scenario_assessment", "erp_manual_fallback_exercise", "rra_erp_due_date_tracker"],
    remediation:
      "Add agent failure and compromise scenarios to the RRA and exercise the ERP manual fallback for the systems the agent operates, recording results.",
    failureMode:
      "The agent goes offline during an incident and operators have no rehearsed manual fallback for the pump and dosing control it was running.",
    keyRisk: 4,
  },
  "ENV-STS-17": {
    l2: "Classification is discussed but not recorded, and dosing actions are only partly logged",
    l4: "Logs, override, stop and fail-safe are drilled, but logs are not protected from alteration or the evidence pack is undated",
    evidence: ["water_annex_iii_classification_record", "dosing_action_event_log", "fail_safe_drill_record"],
    remediation:
      "Define a fail-safe dosing and pressure state the plant reverts to when the agent is stopped or loses data, and drill it with results in the evidence " +
      "pack.",
    failureMode:
      "The agent keeps dosing on frozen sensor values after a communication loss because no fail-safe state is defined.",
    keyRisk: 0,
  },
  "ENV-STS-18": {
    l2: "Agent vendors appear in procurement records, but not in the security supplier register",
    l4: "Reporting is rehearsed against the 24h and 72h steps, but agent-vendor security evidence or the one-month final report is not covered",
    evidence: ["agent_vendor_security_register", "nis2_incident_reporting_drill", "significant_incident_timeline_record"],
    remediation:
      "Add the agent's model and tool vendors to the NIS2 supplier register with security requirements, and run a timed reporting drill for an agent " +
      "compromise.",
    failureMode:
      "The agent takes a faulty vendor model update that disrupts wastewater control, and no one treats it as reportable until the early-warning window has " +
      "passed.",
    keyRisk: 4,
  },
};
