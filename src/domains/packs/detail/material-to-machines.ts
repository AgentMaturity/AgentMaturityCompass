/** Per-question detail for the material-to-machines pack, keyed by question id (see IndustryPackQuestionDetail). */
import type { PackQuestionDetail } from "../../industryPacks.js";

export const materialToMachinesDetail: PackQuestionDetail = {
  "ENV-MM-1": {
    l2: "Supplier RoHS declarations are filed, but the agent does not check concentrations against Annex II values",
    l4: "Each component has declarations and test evidence checked against Annex II values, but Annex III/IV exemption expiry is not tracked",
    evidence: ["rohs_annex_ii_screening_log", "xrf_test_result_record", "exemption_expiry_register"],
    remediation:
      "Gate component approval in the substitution tool on an Annex II screen with linked declaration and test evidence, alerting before a used exemption " +
      "expires.",
    failureMode:
      "The agent substitutes an alternate solder or cable during a shortage using a part whose RoHS declaration was never checked, exceeding a lead or " +
      "phthalate limit.",
    keyRisk: 2,
  },
  "ENV-MM-2": {
    l2: "Repairability and durability are scored after design freeze and do not shape design decisions",
    l4: "Designs are optimised against repairability, durability and recyclability, but the Art. 5 documentation is assembled by hand",
    evidence: ["design_repairability_score_record", "durability_test_prediction_report", "recyclability_assessment"],
    remediation:
      "Add repairability, durability and recyclability thresholds as hard constraints in the design optimiser so a cheaper design that fails them is rejected.",
    failureMode:
      "The agent cuts housing cost by replacing screws with adhesive bonding, making the battery non-replaceable with no repairability check.",
    keyRisk: 1,
  },
  "ENV-MM-3": {
    l2: "Producer registration is recorded per country, but the agent does not track collection volumes",
    l4: "Collection volumes are monitored against targets and recovery is tracked, but recovery evidence from treatment partners is not verified",
    evidence: ["weee_producer_registration_register", "collection_volume_report", "treatment_partner_recovery_evidence"],
    remediation:
      "Accept a WEEE collection or recovery figure only with a treatment-partner evidence record attached, and flag partners reporting recovery without " +
      "documents.",
    failureMode:
      "The agent counts e-waste handed to a broker as recycled on the broker's invoice, though the load was exported for informal dismantling.",
    keyRisk: 4,
  },
  "ENV-MM-4-v2": {
    l2: "Labels are drafted manually from test results and EPREL registration is tracked in a spreadsheet",
    l4: "Labels and sheets are generated from linked test reports and EPREL registration precedes release, but label changes are not versioned",
    evidence: ["energy_label_test_report_link", "eprel_registration_record", "label_version_history"],
    remediation:
      "Block release until the model's EPREL registration exists and the label class is recomputed from the full linked test report under the delegated " +
      "regulation.",
    failureMode:
      "The agent computes the energy class from its best test run or a non-standard test condition and issues a label one class better than the test set " +
      "supports.",
    keyRisk: 3,
  },
  "ENV-MM-5": {
    l2: "CMRTs are requested from some suppliers but not validated or checked against smelter lists",
    l4: "CMRTs are validated and smelters risk-assessed with the OECD steps applied, but CAHRA coverage and Art. 7 reporting are incomplete",
    evidence: ["cmrt_validation_log", "smelter_risk_assessment", "cahra_origin_screen"],
    remediation:
      "Validate every CMRT for completeness, match each declared smelter to a recognised smelter audit list, and hold 3TG purchases from unmatched smelters.",
    failureMode:
      "The agent awards a tantalum capacitor contract to the cheapest supplier whose CMRT lists an unaudited smelter sourcing from a conflict-affected area.",
    keyRisk: 0,
  },
  "ENV-MM-6": {
    l2: "Basic passports exist for some products, but no data carrier links to a maintained record",
    l4: "Mandatory attributes carry evidence links and the carrier resolves, but recycler views are missing or lifecycle updates are unversioned",
    evidence: ["dpp_mandatory_attribute_check", "data_carrier_resolution_log", "recycler_view_export"],
    remediation:
      "Validate every mandatory DPP attribute of the adopted delegated act against its source evidence before publishing, and version each lifecycle update.",
    failureMode:
      "The agent publishes a DPP whose recycler view omits battery and hazardous-component locations because the field was optional in its template.",
    keyRisk: 4,
  },
  "ENV-MM-7": {
    l2: "LCA data is consulted ad hoc for some designs with no hotspot analysis",
    l4: "IEC 62430 principles and ISO 14044 LCA are applied to main products, but impact reduction is not verified after launch",
    evidence: ["lca_hotspot_report", "ecd_design_review_record", "impact_reduction_tracking"],
    remediation:
      "Record a hotspot analysis and IEC 62430 design-review outcome before a design change is approved, and compare predicted with measured impact after " +
      "launch.",
    failureMode:
      "The agent picks a material that cuts manufacturing emissions but shortens product life, with no lifecycle comparison of the trade-off.",
    keyRisk: 1,
  },
  "ENV-MM-8": {
    l2: "Battery chemistry and capacity are recorded, but carbon footprint and recycled content are unsourced estimates",
    l4: "Carbon footprint and recycled content are calculated from sourced data with performance tracked, but the battery passport is incomplete",
    evidence: ["battery_carbon_footprint_calculation", "recycled_content_supplier_evidence", "battery_passport_record"],
    remediation:
      "Compute battery carbon footprint and recycled-content shares only from supplier-evidenced inputs, recording each source and flagging any default value.",
    failureMode:
      "The agent fills missing cell-supplier data with industry-average defaults and declares a recycled cobalt share that no supplier evidence supports.",
    keyRisk: 4,
  },
  "ENV-MM-9": {
    l2: "Zones are sketched, but conduits and target levels are not defined for the systems the agent touches",
    l4: "Achieved levels are assessed against SL-T with gaps tracked, but agent changes to OT systems are not reassessed before deployment",
    evidence: ["zone_conduit_diagram", "security_level_gap_assessment", "ot_change_reassessment_record"],
    remediation:
      "Reassess the achieved security level of each zone and conduit an agent change touches against its SL-T before deployment, blocking on any new gap.",
    failureMode:
      "The agent opens a new path from the IT network to a PLC zone to pull production data, bypassing the conduit model and dropping the zone below its SL-T.",
    keyRisk: 2,
  },
  "ENV-MM-10": {
    l2: "An EHSR checklist exists, but software and ML updates to safety functions bypass it",
    l4: "Each safety-function update passes an EHSR impact assessment before release, but no notified-body plan exists for self-evolving components",
    evidence: ["ehsr_impact_assessment_record", "safety_function_release_gate_log", "notified_body_assessment_plan"],
    remediation:
      "Block release of any model or software update touching a machinery safety function until an EHSR impact assessment and documentation update are " +
      "recorded.",
    failureMode:
      "The agent retrains a vision model that drives a guard-interlock decision and ships it as a routine update with no EHSR reassessment.",
    keyRisk: 2,
  },
  "ENV-MM-11": {
    l2: "Human users have unique IDs, but the agent and other services share one service account",
    l4: "Users, services and devices have unique identities with rotation, but continuous verification across all zones is incomplete",
    evidence: ["ot_identity_inventory", "credential_rotation_log", "agent_service_account_register"],
    remediation:
      "Give the agent its own machine identity per zone with rotated credentials and strong authentication, and retire any shared account it uses.",
    failureMode:
      "The agent writes to PLCs and HMIs under a shared engineering account, so its control actions cannot be told apart from an operator's in the audit " +
      "trail.",
    keyRisk: 2,
  },
  "ENV-MM-12": {
    l2: "Major changes get a risk assessment, but control-software changes made by the agent are not treated as OH&S changes",
    l4: "All changes, including agent software changes, pass hazard review with worker consultation, but pre-startup verification is not always recorded",
    evidence: ["moc_hazard_review_record", "worker_consultation_record", "pre_startup_safety_verification"],
    remediation:
      "Route every agent-proposed change to machine parameters, tooling or control software through an MOC record needing hazard review and worker " +
      "consultation.",
    failureMode:
      "The agent raises a press line's cycle speed to hit throughput targets with no management-of-change review, exposing operators to a new pinch hazard.",
    keyRisk: 2,
  },
  "ENV-MM-13": {
    l2: "Spare-parts lists are drafted for some products, but repair information and disassembly are not assessed",
    l4: "Repairability parameters gate design release, but spare-parts availability and repair-information publication are not tracked after launch",
    evidence: ["spare_parts_availability_register", "disassembly_step_score", "repair_information_publication_log"],
    remediation:
      "Make PLM design release conditional on the delegated act's repairability parameters, with spare-parts and repair-information records attached.",
    failureMode:
      "The agent drops a spare part from the service catalogue to cut inventory cost without checking the repairability parameters set for that product group.",
    keyRisk: 1,
  },
  "ENV-MM-14": {
    l2: "BOM declarations are aggregated, but no product-level sign-off exists before market placement",
    l4: "Release is gated on product-level evidence with exemptions tracked, but sampling and testing are not integrated",
    evidence: ["product_rohs_technical_file", "bom_declaration_rollup", "release_gate_decision_log"],
    remediation:
      "Aggregate each BOM line's RoHS evidence at release and block market placement if any line lacks a declaration, test result or valid exemption.",
    failureMode:
      "The agent approves market placement after an engineering change added an unscreened part, because its RoHS roll-up used the previous BOM revision.",
    keyRisk: 2,
  },
  "ENV-MM-15": {
    l2: "Treatment information exists for a few product lines, written by hand from drawings",
    l4: "Per-type records are generated from the BOM and published within a year, but design changes do not create a new version",
    evidence: ["weee_treatment_information_record", "bom_dangerous_substance_location_map", "treatment_info_publication_log"],
    remediation:
      "Generate treatment information per equipment type from the BOM, including dangerous-substance locations, and republish it on every design change.",
    failureMode:
      "The agent publishes treatment information from an older design that omits a newly added battery, so a recycler shreds it and starts a fire.",
    keyRisk: 4,
  },
  "ENV-MM-16": {
    l2: "Vulnerabilities are tracked internally, but no one owns reporting to the Single Reporting Platform",
    l4: "Reporting to the platform is rehearsed and timed, but final-report content is still assembled by hand",
    evidence: ["cra_report_timing_drill", "exploited_vulnerability_case_log", "final_report_root_cause_record"],
    remediation:
      "Open a reporting case with 24h and 72h timers when an exploited vulnerability is confirmed in a managed product, and draft final-report content from " +
      "logs.",
    failureMode:
      "The agent auto-patches an actively exploited firmware flaw across connected appliances and closes the ticket, so the CRA report is never started.",
    keyRisk: 2,
  },
};
