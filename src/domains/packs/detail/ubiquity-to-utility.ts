/** Per-question detail for the ubiquity-to-utility pack, keyed by question id (see IndustryPackQuestionDetail). */
import type { PackQuestionDetail } from "../../industryPacks.js";

export const ubiquityToUtilityDetail: PackQuestionDetail = {
  "ENV-UU-1": {
    l2: "Agent hosts appear in the asset inventory but are not rated in the CIP-002 categorisation",
    l4: "Every agent component is categorised and additions are re-categorised before use, but the inventory is not reconciled with deployments",
    evidence: ["bes_cyber_system_categorization_inventory", "agent_component_impact_rating", "deployment_reconciliation_report"],
    remediation:
      "Block any new agent host, tool or integration from reaching BES operations until it is in the CIP-002 inventory with an impact rating.",
    failureMode:
      "The agent is given a new SCADA read connector that is never categorised, opening an unprotected path into a medium impact BES Cyber System.",
    keyRisk: 1,
  },
  "ENV-UU-2": {
    l2: "Renewable share is reported after the fact; dispatch decisions do not record forecast inputs or curtailment reasons",
    l4: "Stability constraints are checked before dispatch and curtailment reasons recorded, but the renewable-share method is undocumented",
    evidence: ["dispatch_decision_log", "pre_dispatch_stability_check", "curtailment_reason_record", "renewable_share_calculation_method"],
    remediation:
      "Run the grid-stability check (inertia, reserves, line limits) as a pre-dispatch gate in the optimiser, recording forecast inputs and curtailment " +
      "reasons.",
    failureMode:
      "The agent maximises wind dispatch and displaces synchronous units below the inertia or reserve floor just ahead of a forecast ramp-down.",
    keyRisk: 0,
  },
  "ENV-UU-3": {
    l2: "Consumption data is collected, but no baseline or EnPI is defined",
    l4: "EnPIs are tracked against normalised baselines and deviations investigated, but the energy review is not updated on significant changes",
    evidence: ["energy_review_record", "enpi_baseline_normalisation_model", "deviation_investigation_record"],
    remediation:
      "Open an investigation for every EnPI deviation beyond its threshold and update the energy review when a significant energy use is added or changed.",
    failureMode:
      "The agent reports an EnPI improvement that comes from milder weather because it compares raw consumption without normalising for degree days.",
    keyRisk: 0,
  },
  "ENV-UU-4": {
    l2: "GO issue and transfer records are held, but cancellation is not checked before claims are disclosed",
    l4: "Claims are matched to cancelled GOs before disclosure, but no automated double-counting check runs across portfolios",
    evidence: ["go_cancellation_record", "claim_to_go_match_log", "double_counting_check_report"],
    remediation:
      "Match each renewable claim by GO ID and production period to a cancelled GO, and run a cross-customer double-counting check before any disclosure.",
    failureMode:
      "The agent assigns the same cancelled GO batch to two customers' renewable claims because the portfolio was not locked after the first allocation.",
    keyRisk: 3,
  },
  "ENV-UU-5": {
    l2: "Setpoint limits are documented, but the agent's actions are not checked against them",
    l4: "Out-of-envelope actions are blocked pending human confirmation and logged, but the operator stop has not been tested to a safe state",
    evidence: ["approved_setpoint_envelope_config", "out_of_envelope_confirmation_log", "operator_stop_test_record"],
    remediation:
      "Enforce the approved setpoint envelope in the control interface so out-of-envelope commands need human confirmation, and test the operator stop on " +
      "schedule.",
    failureMode:
      "The agent sheds feeders beyond its approved envelope to correct frequency, tripping adjacent protection and starting a cascading outage.",
    keyRisk: 4,
  },
  "ENV-UU-6": {
    l2: "Energy-poor households are known from external data, but not linked to pricing decisions",
    l4: "Each pricing decision carries a vulnerable-consumer affordability impact, but targeted programmes and Art. 24 reporting are not produced",
    evidence: ["vulnerable_consumer_indicator_set", "tariff_affordability_impact_assessment", "energy_poverty_metric_report"],
    remediation:
      "Run an affordability impact assessment on vulnerable segments before any tariff change and send changes that raise their bills to a pricing committee.",
    failureMode:
      "The agent's dynamic tariff optimisation raises peak prices for prepayment-meter households, pushing energy-poor customers into self-disconnection.",
    keyRisk: 2,
  },
  "ENV-UU-7": {
    l2: "Credit provenance is recorded, but corresponding adjustments are not tracked",
    l4: "Corresponding adjustments are calculated and ITMOs tracked, but registry reconciliation and integrity checks are manual",
    evidence: ["itmo_transfer_ledger", "corresponding_adjustment_record", "registry_reconciliation_report"],
    remediation:
      "Reconcile each ITMO transfer with the host-country registry and refuse to report a credit as transferable until its corresponding adjustment is " +
      "recorded.",
    failureMode:
      "The agent sells credits as Article 6 ITMOs before the host country applies a corresponding adjustment, so the same reduction is counted twice.",
    keyRisk: 3,
  },
  "ENV-UU-8": {
    l2: "State of charge and temperature are logged, but no thresholds raise alerts",
    l4: "Cell-level parameters are monitored against thresholds with the documented response, but safety-system tests are not recorded on schedule",
    evidence: ["cell_level_telemetry_threshold_config", "thermal_event_response_log", "safety_system_test_record", "degradation_trend_report"],
    remediation:
      "Bar the agent from dispatching a storage string whose cell temperature or voltage exceeds its documented threshold, and log the response to each " +
      "breach.",
    failureMode:
      "The agent keeps cycling a battery string at full power for an arbitrage window while one module's cell temperature climbs toward thermal runaway.",
    keyRisk: 0,
  },
  "ENV-UU-9-v2": {
    l2: "IBR changes are logged, but ride-through settings are not considered",
    l4: "Each change has a recorded ride-through check with approver, but changes that alter ride-through capability are not held for engineering review",
    evidence: ["ibr_change_record", "ride_through_settings_check", "engineering_review_hold_log"],
    remediation:
      "Compare every proposed IBR setting or firmware change with the PRC-029-1 ride-through settings and hold changes that alter them for engineering review.",
    failureMode:
      "The agent pushes inverter firmware that tightens voltage trip settings, so the plant trips on a fault its ride-through settings were meant to " +
      "withstand.",
    keyRisk: 0,
  },
  "ENV-UU-10": {
    l2: "Port and service lists are captured once, but not baselined or compared",
    l4: "Baselines with documented business need cover all systems and drift is detected, but evidence bundles are assembled by hand",
    evidence: ["ports_services_baseline", "service_business_need_justification", "drift_detection_alert_log"],
    remediation:
      "Compare enabled ports and services on each BES Cyber System with its approved baseline daily and alert on any service lacking a documented need.",
    failureMode:
      "The agent enables a remote management port on a substation gateway to collect data and never records or justifies it.",
    keyRisk: 1,
  },
  "ENV-UU-11": {
    l2: "Roles are named, but the agent runs with an engineering role that allows control actions",
    l4: "Roles are engineered and enforced across OT interfaces, but break-glass use is not governed or audited",
    evidence: ["ot_role_rights_matrix", "agent_role_assignment", "break_glass_use_log"],
    remediation:
      "Give the agent a least-privilege IEC 62351-8 role limited to the control points it needs, with human-approved break-glass elevation for anything else.",
    failureMode:
      "The agent, holding an engineer role, operates a breaker through IEC 61850 control when it was meant only to read measurements.",
    keyRisk: 1,
  },
  "ENV-UU-12": {
    l2: "Some logical nodes are mapped, but SCL files are edited by hand",
    l4: "SCL workflows are validated and messaging constraints applied, but protection coordination is not tested before configuration changes",
    evidence: ["scl_configuration_version_log", "goose_message_constraint_test", "protection_coordination_test_record"],
    remediation:
      "Validate every SCL change the agent proposes against the substation configuration and protection coordination study on a test bench before loading.",
    failureMode:
      "The agent loads an SCL change that remaps a GOOSE trip signal, so a protection relay stops receiving the breaker-fail message.",
    keyRisk: 4,
  },
  "ENV-UU-13": {
    l2: "Permit milestones are tracked in a spreadsheet, but statutory deadlines are not computed",
    l4: "Dossiers are generated with deadlines tracked and authority contacts logged, but grid-connection dependencies are not linked",
    evidence: ["permit_dossier_version_history", "statutory_deadline_tracker", "contact_point_interaction_log"],
    remediation:
      "Compute each permit's statutory deadline from filing date and procedure type, link grid-connection data, and alert the project owner before any lapse.",
    failureMode:
      "The agent files a permit dossier with outdated grid-connection data, so the authority returns it and the project loses its connection slot.",
    keyRisk: 0,
  },
  "ENV-UU-14": {
    l2: "Main agent vendors are listed, but the plan does not address model or tool updates",
    l4: "Model, tool and software updates are verified for integrity and authenticity, but vendor remote access and notifications lack evidence",
    evidence: ["vendor_risk_plan_scope", "model_update_integrity_verification", "vendor_remote_access_log"],
    remediation:
      "Verify the signature and hash of every model, tool or software update before the agent loads it, and log the result under the CIP-013 plan.",
    failureMode:
      "The agent auto-installs a new tool plugin version from its vendor's repository without integrity checks, pulling in a tampered package.",
    keyRisk: 1,
  },
  "ENV-UU-15": {
    l2: "IBR models are validated once at commissioning and not after changes",
    l4: "Event-based revalidation triggers exist and drift is detected, but model updates are not change-controlled or exported",
    evidence: ["ibr_model_drift_report", "event_revalidation_trigger_log", "model_update_change_record"],
    remediation:
      "Compare measured IBR responses after each grid event with the model and open a revalidation record when the deviation exceeds a set tolerance.",
    failureMode:
      "The agent keeps running planning studies on an IBR model that predates a control upgrade, overstating the plant's fault response.",
    keyRisk: 0,
  },
  "ENV-UU-16": {
    l2: "The agent's classification is discussed but not recorded, and its logs are partial",
    l4: "Classification and Art. 12 logs exist and override and stop are drilled, but logs are not protected from alteration or the pack is undated",
    evidence: ["annex_iii_classification_record", "art12_event_log_retention", "override_stop_drill_record"],
    remediation:
      "Write the agent's Art. 12 event log to append-only storage and drill operator override and stop to safe state, recording results in the evidence pack.",
    failureMode:
      "The agent's actions during a supply disturbance cannot be reconstructed because it logs only summaries that it can overwrite.",
    keyRisk: 4,
  },
  "ENV-UU-17": {
    l2: "Agent hosts sit inside the ESP, but their traffic is excluded from INSM feeds",
    l4: "Agent traffic is baselined and anomalies are evaluated and escalated, but INSM data retention and protection are not evidenced",
    evidence: ["insm_agent_traffic_baseline", "anomaly_evaluation_record", "insm_data_retention_log"],
    remediation:
      "Correlate the agent's action log with INSM detections so each anomaly involving agent traffic is evaluated and recorded with the matching action.",
    failureMode:
      "The agent's hijacked credentials are used for lateral movement inside the ESP, unseen because agent flows were allowlisted out of monitoring.",
    keyRisk: 1,
  },
  "ENV-UU-18": {
    l2: "Re-verification is discussed after major changes, but not triggered from change records",
    l4: "Each IBR change opens a re-verification record linked to the change, but evidence is not exported to the planning entities",
    evidence: ["mod026_reverification_record", "ibr_change_link", "planning_entity_export_log"],
    remediation:
      "Open a MOD-026-2 re-verification record automatically when an IBR control-setting or firmware change is logged, closing it only with result and date.",
    failureMode:
      "The agent logs a plant-controller gain change as maintenance and never triggers model re-verification, leaving planners with an outdated model.",
    keyRisk: 0,
  },
};
