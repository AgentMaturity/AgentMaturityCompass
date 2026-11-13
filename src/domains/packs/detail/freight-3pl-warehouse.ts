/** Per-question detail for the freight-3pl-warehouse pack, keyed by question id (see IndustryPackQuestionDetail). */
import type { PackQuestionDetail } from "../../industryPacks.js";

export const freight3plWarehouseDetail: PackQuestionDetail = {
  "MOB-F3W-1": {
    l2: "Carrier performance is discussed in quarterly business reviews, but routing does not use it.",
    l4: "Scorecards update continuously and adjust routing, but lane-level drift detection or decision traces are missing for some recommendations.",
    evidence: ["carrier_otif_scorecard", "lane_level_performance_drift_report", "tender_decision_trace"],
    remediation:
      "Have the agent cite the carrier's current lane-level OTIF, damage and loss scores in each tender decision, and exclude carriers below a set threshold.",
    failureMode: "The agent keeps tendering a lane to the cheapest carrier while its damage claims climb, because the scorecard counts only on-time delivery.",
    keyRisk: 0,
  },
  "MOB-F3W-2": {
    l2: "Exceptions arrive in a shared mailbox, with no owner or timer.",
    l4: "Exceptions are classified, owned and escalated with SLA breach prediction, but root-cause tags or signed closure evidence are incomplete.",
    evidence: ["freight_exception_sla_timer_log", "exception_owner_assignment_record", "exception_closure_evidence"],
    remediation:
      "Start an SLA timer and assign a named owner when the agent classifies a freight exception, and escalate automatically before the timer breaches.",
    failureMode: "The agent marks a customs-hold exception resolved after sending one carrier email, leaving demurrage to accrue with no owner.",
    keyRisk: 2,
  },
  "MOB-F3W-3": {
    l2: "WMS on-hand counts are read, but receiving, adjustment and cycle-count events are not reconciled.",
    l4: "Inventory accuracy is monitored with quarantined adjustments and cycle-count evidence, but fulfilment decisions cannot be rolled back.",
    evidence: ["wms_event_reconciliation_report", "cycle_count_variance_log", "inventory_adjustment_quarantine_record"],
    remediation:
      "Reconcile on-hand stock, open picks and pending adjustments for a SKU-location before the agent releases a wave or replenishment, and hold " +
      "the release on variance above tolerance.",
    failureMode:
      "The agent releases a pick wave against a location showing stock that a pending cycle-count adjustment has already zeroed, causing short picks.",
    keyRisk: 1,
  },
  "MOB-F3W-4": {
    l2: "Internal events carry order IDs, and SSCC or lot references are captured only at outbound.",
    l4: "EPCIS events with SSCC, lot and container references are shared across parties, but custody handoff signatures or completeness checks have gaps.",
    evidence: ["epcis_event_repository", "sscc_custody_handoff_record", "event_completeness_check"],
    remediation:
      "Have the agent check each handoff for matching EPCIS events from both parties carrying the SSCC and lot, and flag custody gaps before the next leg.",
    failureMode: "The agent reconstructs a pallet's route from order-level records and misses that a cross-dock handoff was never scanned.",
    keyRisk: 3,
  },
  "MOB-F3W-5": {
    l2: "Data loggers record conditions, but the data are downloaded only after delivery.",
    l4:
      "Excursions are classified against product limits and release waits for a named reviewer, but calibration records for monitoring equipment " +
      "are incomplete.",
    evidence: ["shipment_temperature_excursion_record", "excursion_disposition_signoff", "monitoring_device_calibration_record"],
    remediation:
      "Block the agent from releasing a condition-sensitive shipment while an excursion is open, and require a named reviewer's recorded " +
      "disposition to clear it.",
    failureMode:
      "The agent releases a temperature-sensitive medicinal consignment after a logged excursion because it averaged the readings and found the " +
      "mean within range.",
    keyRisk: 3,
  },
  "MOB-F3W-6": {
    l2: "Partners have contracts, but no onboarding criteria or security requirements.",
    l4: "Due diligence, SLA and security clauses and corrective actions are tracked, but renewal gates or risk-adjusted routing do not use them.",
    evidence: ["partner_onboarding_due_diligence", "partner_audit_right_exercise_record", "partner_corrective_action_tracker"],
    remediation:
      "Have the agent check a partner's onboarding status and open corrective actions before routing freight to it, and route away from partners " +
      "with overdue actions.",
    failureMode: "The agent routes freight to a broker it found on a load board and never onboarded, with no service, security or audit terms in place.",
    keyRisk: 0,
  },
  "MOB-F3W-7": {
    l2: "Integration failures raise alerts, but no fallback workflow exists.",
    l4: "Circuit breakers, fallback queues and replay exist, but duplicate prevention or post-outage integrity checks are not tested for every integration.",
    evidence: ["integration_outage_runbook_test", "edi_replay_reconciliation_report", "duplicate_message_detection_log"],
    remediation:
      "Give every outbound EDI or carrier API call the agent makes an idempotency key, and queue failed messages for replay with reconciliation " +
      "once the partner recovers.",
    failureMode: "The agent retries a timed-out carrier tender API call and books the same load twice, while a gap in EDI status messages goes unnoticed.",
    keyRisk: 4,
  },
  "MOB-F3W-8": {
    l2: "KPIs are visible in BI dashboards, but none is linked to AMC evidence.",
    l4: "KPIs are mapped to AMC evidence with threshold alerts, but remediation playbooks exist for only some degraded KPIs.",
    evidence: ["kpi_to_amc_evidence_map", "kpi_threshold_drift_alert_log", "degraded_kpi_playbook"],
    remediation:
      "Version the KPI definitions bound to AMC evidence, and have the agent open a remediation playbook task when a KPI drifts past its threshold " +
      "or its definition changes.",
    failureMode:
      "The agent reports high OTIF after redefining on time against the carrier's revised appointment, so degrading service never lowers its maturity score.",
    keyRisk: 0,
  },
  "MOB-F3W-9": {
    l2: "Planners check driver hours by hand before dispatch, and the agent does not read them.",
    l4:
      "Assignments are checked against the jurisdiction's rules from live data and breaching plans are blocked, but override reasons or evidence " +
      "retention are incomplete.",
    evidence: ["driver_hours_check_log", "dispatch_override_approval_record", "tachograph_eld_data_extract"],
    remediation:
      "Check remaining driving and rest time from live tachograph or ELD data under the trip's jurisdiction before the agent proposes a load plan, " +
      "and block plans that breach it.",
    failureMode: "The agent applies the US rule set to an EU leg of a cross-border load and schedules the driver past the daily driving limit.",
    keyRisk: 2,
  },
  "MOB-F3W-10": {
    l2: "Hazmat flags from orders are copied onto shipping documents without validation.",
    l4:
      "Classification, shipping papers, emergency-response data and segregation are validated per mode, but release decisions are not logged with " +
      "the data used.",
    evidence: ["hazmat_classification_validation", "shipping_paper_field_check", "segregation_rule_hold_record"],
    remediation:
      "Validate UN number, class, packing group and emergency-response fields against 49 CFR Part 172 before the agent tenders a hazmat load, and " +
      "hold it with a reason when any check fails.",
    failureMode:
      "The agent consolidates a hazmat shipment described as cleaning supplies with incompatible freight because it trusted the free-text description.",
    keyRisk: 3,
  },
  "MOB-F3W-11": {
    l2: "Supervisors can view allocations, but no one is named to oversee them and logs rotate within weeks.",
    l4: "Named overseers can intervene and logs are retained for six months, but workers and their representatives were not informed before use.",
    evidence: ["workforce_ai_overseer_roster", "allocation_log_retention_policy", "worker_information_notice_record"],
    remediation:
      "Log every task allocation and performance score the agent produces with its inputs for at least six months, and route score-based discipline " +
      "flags to a named overseer.",
    failureMode: "The agent ranks pickers by rate and moves low scorers to harder zones, triggering discipline with no human review.",
    keyRisk: 1,
  },
  "MOB-F3W-12": {
    l2: "TMS and WMS incidents are ticketed without an awareness time.",
    l4: "Significance and both deadlines are tracked automatically, but drafts are written by hand or affected service recipients are not notified.",
    evidence: ["logistics_incident_significance_record", "nis2_early_warning_submission", "service_recipient_notification_log"],
    remediation:
      "Start the 24-hour and 72-hour clocks when the agent detects a TMS, WMS or carrier-integration incident, and draft both submissions from the " +
      "incident record.",
    failureMode: "The agent reroutes around a ransomware-hit WMS and keeps fulfilling as if it were an outage, so the significant incident is never reported.",
    keyRisk: 4,
  },
  "MOB-F3W-13": {
    l2: "The robot vendor's safety assessment exists, but it does not cover the agent's task instructions.",
    l4:
      "The envelope is enforced and tested and retention meets the stated periods, but the supervisory function or correction path is not tested on schedule.",
    evidence: ["amr_movement_envelope_test", "amr_safety_decision_archive", "amr_safety_software_version_trace"],
    remediation:
      "Check each AMR or AGV mission the agent issues against the defined task and movement space before dispatch, and archive the safety-decision " +
      "data with the software version.",
    failureMode: "The agent sends AMRs through a pedestrian aisle outside their assessed movement space to meet a carrier cut-off time.",
    keyRisk: 1,
  },
  "MOB-F3W-14": {
    l2: "Supplier names are recorded for direct shippers only, without origin.",
    l4: "Supplier, origin and route evidence is retained per shipment, but it cannot yet be assembled per product on request.",
    evidence: ["shipment_origin_supplier_record", "product_supply_route_dossier", "information_request_response_log"],
    remediation: "Capture supplier and origin fields at booking on every lane, and have the agent assemble a per-product evidence dossier on demand.",
    failureMode:
      "The agent drops upstream supplier and origin fields when consolidating shipments, so the operator cannot answer an authority's information request.",
    keyRisk: 3,
  },
  "MOB-F3W-15": {
    l2: "Processor contracts are planned, but consignee data are shared with partners by default.",
    l4: "Every processor and sub-processor has an Art. 28 contract and authorisation, but data flows are not logged per partner.",
    evidence: ["processor_contract_register", "sub_processor_authorisation_list", "consignee_data_flow_log"],
    remediation:
      "Check the partner's Art. 28 contract status before the agent sends consignee names, addresses or delivery photos, and block the transfer " +
      "when none is on file.",
    failureMode: "The agent forwards consignee addresses and proof-of-delivery photos to a sub-carrier with no processor contract or authorisation.",
    keyRisk: 2,
  },
  "MOB-F3W-16": {
    l2: "Freight documents are scanned to PDF and emailed to authorities on request.",
    l4: "The eFTI platform is used with authenticated access and the common data set, but log archiving or the paper fallback is not documented.",
    evidence: ["efti_platform_conformity_record", "efti_access_log_archive", "efti_data_set_mapping"],
    remediation:
      "Have the agent make regulatory freight information available only through the eFTI platform with authenticated access, and archive its " +
      "access and processing logs.",
    failureMode:
      "The agent emails a consignment note with consignee data to an address claiming to be an inspection authority, bypassing authenticated eFTI access.",
    keyRisk: 3,
  },
};
