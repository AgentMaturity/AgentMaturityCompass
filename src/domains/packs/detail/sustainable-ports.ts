/** Per-question detail for the sustainable-ports pack, keyed by question id (see IndustryPackQuestionDetail). */
import type { PackQuestionDetail } from "../../industryPacks.js";

export const sustainablePortsDetail: PackQuestionDetail = {
  "MOB-SP-1": {
    l2: "Access events are logged by the gate system, but the agent does not know the current security level.",
    l4:
      "Security-level transitions apply the plan's measures with timestamped records and Declarations of Security are kept, but drill records " +
      "cannot be retrieved for every required period.",
    evidence: ["security_level_transition_log", "declaration_of_security_record", "pfsp_drill_record"],
    remediation:
      "Have the agent read the current ISPS security level before every access decision, apply that level's measures from the port facility " +
      "security plan, and log the level used with each decision.",
    failureMode:
      "The agent keeps approving gate access under security level 1 measures after the facility moved to level 2, because it cached the level at " +
      "the start of the shift.",
    keyRisk: 0,
  },
  "MOB-SP-2": {
    l2: "Declarations are stored as received, with field presence checked but no rule validation.",
    l4:
      "Declarations and Ch. 7.1 segregation are checked against the in-force amendment, but emergency-response information is not attached to every " +
      "unit or exceptions are logged without the rule applied.",
    evidence: ["dg_declaration_validation_log", "stowage_segregation_check_record", "imdg_amendment_version_register"],
    remediation:
      "Pin the IMDG amendment the rule engine uses to a dated register, and block loading of any unit whose segregation check ran against a " +
      "superseded amendment.",
    failureMode:
      "The agent approves a stowage plan placing incompatible dangerous-goods classes in adjacent bays because its segregation table predates Amendment 42-24.",
    keyRisk: 1,
  },
  "MOB-SP-4": {
    l2: "Security requirements are listed, but no risk assessment covers the port operations the agent touches.",
    l4:
      "An ISO 28000 management system covers port operations with container integrity checks and personnel security, but improvement actions are " +
      "not tracked to closure.",
    evidence: ["iso28000_security_risk_assessment", "container_integrity_inspection_log", "security_improvement_action_tracker"],
    remediation:
      "Require the agent to check a container's integrity inspection result before releasing it to a vessel or gate, and record each failed " +
      "inspection in the security risk register.",
    failureMode:
      "The agent releases a container with a damaged seal and a skipped integrity inspection to the gate because its release workflow checks only " +
      "payment and customs status.",
    keyRisk: 3,
  },
  "MOB-SP-5": {
    l2: "Customs documents are generated from templates, but are submitted by email or manual portal upload.",
    l4:
      "Single-window submission and advance cargo information are in place, but proposed classifications are not reconciled with commercial " +
      "documents or proofs of origin are handled outside the window.",
    evidence: ["single_window_submission_log", "advance_cargo_information_record", "hs_classification_decision_trace"],
    remediation:
      "Reconcile every HS code and value the agent proposes against the commercial invoice and packing list, and hold the declaration for a customs " +
      "broker when they disagree.",
    failureMode:
      "The agent copies an HS code and declared value from a shipper's email into the single-window declaration without reconciling them to the " +
      "invoice, enabling undervaluation.",
    keyRisk: 2,
  },
  "MOB-SP-6": {
    l2: "Safety zones are drawn on site plans, but the agent's routing does not enforce them.",
    l4:
      "Zones, speed limits and proximity rules are versioned and enforced and stop tests are scheduled, but some safety incidents lack an " +
      "investigation record.",
    evidence: ["agv_safety_zone_config_versions", "human_stop_path_test_record", "terminal_equipment_incident_investigation"],
    remediation:
      "Have the agent refuse any AGV or straddle-carrier route that crosses an active personnel zone, and test the human stop path on a fixed " +
      "schedule with recorded results.",
    failureMode:
      "The agent reroutes an automated straddle carrier through a lashing-crew zone to recover a delayed vessel schedule, overriding the " +
      "worker-proximity rule.",
    keyRisk: 4,
  },
  "MOB-SP-7": {
    l2: "The minimum requirements are listed, but providers are onboarded without a recorded check against them.",
    l4: "Providers are checked against Art. 4 and charges are published, but not every complaint is logged and closed through the Art. 16 procedure.",
    evidence: ["port_service_provider_requirement_check", "published_port_service_charges", "art16_complaint_handling_log"],
    remediation:
      "Gate the agent's assignment of a pilotage, towage or mooring provider on a current Art. 4 requirement check, and file every user complaint " +
      "it receives into the Art. 16 log.",
    failureMode:
      "The agent assigns towage to a provider whose insurance or crew qualification evidence has lapsed, because it checked the minimum " +
      "requirements only at onboarding.",
    keyRisk: 3,
  },
  "MOB-SP-8": {
    l2: "Container moves are recorded per system, but seal numbers are free text and are not compared between handoffs.",
    l4: "Multi-modal tracking and automated seal verification are in place, but condition monitoring or chain-of-custody records have gaps for some modes.",
    evidence: ["container_custody_event_chain", "iso17712_seal_verification_log", "multimodal_handoff_record"],
    remediation: "Compare the seal number read at each handoff with the one on the bill of lading, and stop the container's next move when they differ.",
    failureMode:
      "The agent accepts a rail-to-terminal handoff whose seal number differs from the bill of lading and lets the container move on, hiding " +
      "possible tampering or substitution.",
    keyRisk: 2,
  },
  "MOB-SP-9": {
    l2: "Some port IT systems have endpoint protection and backups, but no risk assessment covers OT or ship-port interfaces.",
    l4: "An accountable person, asset inventory, protections and detection are evidenced, but response and recovery have been tested only on paper.",
    evidence: ["ship_port_interface_asset_inventory", "maritime_cyber_accountable_designation", "terminal_os_recovery_test_record"],
    remediation:
      "Add the agent and every terminal-operating-system API it calls to the maritime cyber asset inventory, and run a recovery test that restores " +
      "those integrations from backup.",
    failureMode:
      "The agent keeps issuing berth and crane instructions from a tampered terminal operating system, because no detection covers the integration " +
      "it reads from.",
    keyRisk: 3,
  },
  "MOB-SP-10": {
    l2: "Fuel sulphur is recorded from the bunker delivery note, but ECA boundaries are not considered.",
    l4:
      "ECA boundaries come from a dated register and bunker notes and changeover logs are checked per call, but the evidence pack for a finding is " +
      "assembled by hand.",
    evidence: ["dated_eca_boundary_register", "bunker_delivery_note_check", "fuel_changeover_log_review"],
    remediation:
      "Load ECA boundaries from a register keyed to entry-into-force dates, and have the agent check each call's changeover log against the " +
      "boundaries in force on the call date.",
    failureMode: "The agent passes a vessel that burned 0.50% fuel inside the Norwegian Sea ECA after 1 March 2026 because its ECA list predates that area.",
    keyRisk: 1,
  },
  "MOB-SP-11": {
    l2: "Ship security documents are collected, but the agent does not compare them with the facility's security level.",
    l4:
      "SSP content and security-level alignment are checked and Declarations of Security are supported, but exceptions do not hold access or cargo operations.",
    evidence: ["ssp_interface_validation_record", "ship_port_security_level_alignment_check", "dos_exchange_record"],
    remediation:
      "When the ship's security level is below the facility's, have the agent hold cargo operations and open a Declaration of Security workflow " +
      "before granting ship-side access.",
    failureMode:
      "The agent starts cargo operations for a vessel at a lower security level than the facility, with no Declaration of Security agreeing who " +
      "controls the gangway.",
    keyRisk: 0,
  },
  "MOB-SP-12": {
    l2: "Dangerous-goods training records are kept on paper, but roles are not mapped to the training they require.",
    l4: "Roles map to the training elements and refreshers trigger automatically, but task assignment is not blocked for every DG role when competence lapses.",
    evidence: ["dg_role_training_matrix", "imdg_training_record_archive", "dg_task_assignment_gate_log"],
    remediation:
      "Check the assignee's current IMDG 1.3 training against the role matrix before the agent assigns any dangerous-goods task, and block the " +
      "assignment when it has lapsed.",
    failureMode:
      "The agent assigns a dangerous-goods packing or labelling task to a worker whose function-specific training lapsed, because it schedules on " +
      "availability alone.",
    keyRisk: 1,
  },
  "MOB-SP-14": {
    l2: "Partners are screened at onboarding, but no written security expectations are agreed with them.",
    l4:
      "Partners are segmented by risk with contractual controls and continuous monitoring, but partners failing controls are not blocked from " +
      "operations automatically.",
    evidence: ["partner_security_vetting_record", "partner_security_agreement", "partner_remediation_tracker"],
    remediation: "Block the agent from tendering cargo to a partner whose security attestation is overdue or whose audit finding is past its remediation date.",
    failureMode: "The agent books a drayage carrier with an open C-TPAT audit finding because it ranks partners on rate and transit time only.",
    keyRisk: 3,
  },
  "MOB-SP-15": {
    l2: "Charge criteria exist internally, but are not published to port users.",
    l4: "Every charge and reduction is computed from published criteria and explained per call, but users are not always told in advance of changes.",
    evidence: ["published_infrastructure_charge_criteria", "per_call_charge_calculation_trace", "charge_change_notice_record"],
    remediation:
      "Compute every environmental reduction the agent grants from the published criteria version, and attach the calculation and version to the call invoice.",
    failureMode:
      "The agent grants an environmental-performance discount on a ship agent's claim of shore-power use, with no published criterion or evidence behind it.",
    keyRisk: 2,
  },
  "MOB-SP-16": {
    l2: "Port system incidents go to the IT helpdesk, but the awareness time and affected services are not recorded.",
    l4: "Significance criteria and deadline tracking are automated, but VTS and terminal incidents are drafted into submissions by hand.",
    evidence: ["port_incident_significance_assessment", "csirt_submission_timeline", "vts_incident_evidence_pack"],
    remediation:
      "Open the 24-hour, 72-hour and one-month clocks from the first detection timestamp of a port or VTS incident, and have the agent draft each " +
      "submission from the incident record.",
    failureMode:
      "The agent auto-restarts a failing VTS or port community system integration in a loop and closes the alert, so no one assesses significance " +
      "before the 24-hour window lapses.",
    keyRisk: 3,
  },
  "MOB-SP-17": {
    l2: "The machinery supplier's safety assessment exists, but it does not cover instructions the agent sends.",
    l4:
      "The movement envelope is enforced and tested and decision-data and version retention meet the stated periods, but the supervisory function " +
      "or correction path is not tested on schedule.",
    evidence: ["crane_movement_envelope_test_record", "safety_decision_data_archive", "safety_software_version_trace"],
    remediation:
      "Validate each move instruction the agent sends against the defined task and movement space before dispatch, and archive the safety-decision " +
      "data and software version with it.",
    failureMode:
      "The agent sends an automated stacking crane a move outside its assessed movement space to clear a congested block, and no decision record " +
      "survives to show why.",
    keyRisk: 4,
  },
};
