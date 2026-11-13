/** Per-question detail for the privacy-security-mobility pack, keyed by question id (see IndustryPackQuestionDetail). */
import type { PackQuestionDetail } from "../../industryPacks.js";

export const privacySecurityMobilityDetail: PackQuestionDetail = {
  "MOB-PS-1": {
    l2: "Minimisation is a stated principle, but data flows collect full records by default.",
    l4:
      "Minimisation, pseudonymisation and technical purpose limitation are enforced, but some high-risk processing has no DPIA or the controls are " +
      "not mapped to ISO/IEC 27701:2025.",
    evidence: ["processing_activity_minimisation_config", "pseudonymisation_key_management_record", "purpose_binding_enforcement_log"],
    remediation: "Bind each data field the agent can read to its declared processing purpose, and reject queries that request fields outside that purpose.",
    failureMode:
      "The agent pulls raw location traces and device identifiers into an analytics job that needed only aggregated counts, building a movement " +
      "history of individuals.",
    keyRisk: 0,
  },
  "MOB-PS-2": {
    l2: "Security controls exist per ECU, but there is no CSMS or threat analysis process.",
    l4: "A CSMS with continuous TARA and event detection is in place, but OTA update governance or type-approval documentation has gaps.",
    evidence: ["csms_process_documentation", "vehicle_security_event_detection_log", "ota_update_approval_record"],
    remediation:
      "Route every OTA campaign or vehicle configuration change the agent prepares through the CSMS change process, with a TARA impact check before release.",
    failureMode:
      "The agent pushes an OTA configuration change to a vehicle fleet that opens a diagnostic service on the gateway ECU without a CSMS risk review.",
    keyRisk: 2,
  },
  "MOB-PS-3": {
    l2: "A device credential policy exists, but shipped and reset devices are not tested for default passwords.",
    l4:
      "Fleet-wide tests show unique credentials including after reset and updates are integrity-checked, but some baseline provisions do not map to evidence.",
    evidence: ["fleet_default_credential_test", "firmware_update_integrity_log", "vulnerability_disclosure_policy"],
    remediation:
      "Have the agent test each managed device for universal default credentials after provisioning and after factory reset, and quarantine any " +
      "device that fails.",
    failureMode: "The agent factory-resets a fleet of cameras to clear a fault and leaves them on a shared default password reachable from the internet.",
    keyRisk: 1,
  },
  "MOB-PS-4": {
    l2: "Users log in with identity-based access, but devices and workloads are trusted by network location.",
    l4: "Microsegmentation, continuous verification and least privilege cover most traffic, but east-west encryption or the maturity assessment is incomplete.",
    evidence: ["microsegmentation_policy_set", "continuous_verification_decision_log", "agent_tool_scope_grants"],
    remediation:
      "Issue the agent short-lived, per-tool credentials scoped to the segment each tool needs, and verify device and workload identity on every call.",
    failureMode:
      "The agent holds a long-lived network-wide credential, so a prompt-injected instruction in a device log can pivot it into unrelated IoT segments.",
    keyRisk: 4,
  },
  "MOB-PS-6": {
    l2: "Incidents are logged, but containment steps and decisions are not recorded.",
    l4:
      "Each incident records management, analysis, communication and mitigation, but forensic evidence is not preserved or lessons are not fed back " +
      "into controls.",
    evidence: ["incident_response_case_record", "forensic_evidence_chain_log", "post_incident_control_change"],
    remediation: "Have the agent snapshot affected device and log state before any containment action, and record the snapshot reference in the incident case.",
    failureMode: "The agent reimages a compromised gateway as its first response, destroying the forensic evidence needed to learn what data left the network.",
    keyRisk: 1,
  },
  "MOB-PS-7": {
    l2: "Privacy notices exist, but rights requests are handled by email with no deadline tracking.",
    l4: "DSAR processing, consent withdrawal and deadline tracking are automated, but portability exports or notice version control are incomplete.",
    evidence: ["dsar_fulfilment_timeline", "consent_withdrawal_enforcement_log", "privacy_notice_version_history"],
    remediation:
      "Propagate each consent withdrawal or deletion request to every system the agent writes to, and track the 30-day and 45-day clocks per request.",
    failureMode:
      "The agent keeps feeding a user's driving data into a profiling model after the user withdrew consent, because the withdrawal reached only the CRM.",
    keyRisk: 3,
  },
  "MOB-PS-8": {
    l2: "Components are inventoried for some products, but no CRA scope decision is recorded.",
    l4: "Scope decisions, SSDF practices and a per-release SBOM are evidenced, but vulnerability handling timelines or the Art. 32 route are not documented.",
    evidence: ["cra_scope_decision_record", "release_sbom", "vulnerability_handling_timeline"],
    remediation:
      "Record a CRA scope decision per product, and make the release pipeline the agent drives refuse a release when the SBOM is missing or a known " +
      "exploited component is unresolved.",
    failureMode: "The agent ships a firmware release containing a library with a known exploited vulnerability because no SBOM check runs before release.",
    keyRisk: 1,
  },
  "MOB-PS-10": {
    l2: "Obligations are listed in a document, but it is not versioned.",
    l4: "The register is versioned and each enforced control cites its obligation, but a register change does not trigger a control review.",
    evidence: ["versioned_obligation_register", "control_to_obligation_citation_map", "register_change_review_record"],
    remediation:
      "Store each enforced control's obligation citation in its configuration, and fail deployment when a control cites no obligation or a withdrawn version.",
    failureMode:
      "The agent reports controls as meeting R156 and ETSI provisions from a stale register entry while the enforced configuration no longer implements them.",
    keyRisk: 4,
  },
  "MOB-PS-11": {
    l2: "Threats are listed informally per item, without feasibility or impact ratings.",
    l4: "Each item has a versioned TARA traced to cybersecurity goals, but re-assessment after a change or incident is not always recorded.",
    evidence: ["item_tara_versions", "attack_path_analysis", "cybersecurity_goal_traceability_matrix"],
    remediation:
      "Trigger a TARA re-run whenever the agent records a change to an item's interfaces or software or a related field incident, and block release " +
      "until it is recorded.",
    failureMode:
      "The agent approves a new telematics interface on an ECU using a TARA that predates it, so the attack path from cellular to braking is never rated.",
    keyRisk: 2,
  },
  "MOB-PS-12": {
    l2: "Vulnerability feeds are watched for the backend only, with no fleet or supplier coverage.",
    l4: "Monitoring covers fleet, backend and supply chain with governed escalation, but corrective-action effectiveness is not verified or CSMS records lag.",
    evidence: ["fleet_cyber_event_monitoring_log", "escalation_decision_record", "corrective_action_effectiveness_check"],
    remediation:
      "Link every fleet or supplier vulnerability the agent monitors to an escalation decision and a corrective action, and verify effectiveness " +
      "with a recorded retest.",
    failureMode: "The agent closes a fleet vulnerability ticket once a patch is scheduled, without verifying that the patch reached the vehicles or worked.",
    keyRisk: 4,
  },
  "MOB-PS-14": {
    l2: "Vehicle and passenger data are encrypted in transit only, with no documented measure set.",
    l4:
      "Each Article 32(1) measure maps to controls with test evidence, but restoration is not exercised on a schedule or measures are not reviewed " +
      "when risk changes.",
    evidence: ["art32_measure_control_map", "passenger_data_restoration_test", "encryption_key_rotation_log"],
    remediation:
      "Schedule restoration tests for vehicle and passenger data stores, and block the agent from writing those data to any store outside the " +
      "Article 32 control map.",
    failureMode: "The agent writes passenger trip histories to an unencrypted debug bucket while troubleshooting, outside the Article 32 measures.",
    keyRisk: 1,
  },
  "MOB-PS-15-v2": {
    l2: "A CSIRT contact is known, but actively exploited vulnerabilities are not distinguished from ordinary bugs.",
    l4: "Events are classified and all three deadlines are tracked from evidence, but no reporting drill is on record.",
    evidence: ["exploited_vulnerability_classification", "cra_art14_submission_timeline", "reporting_drill_record"],
    remediation:
      "Classify every vulnerability report the agent triages for evidence of active exploitation, and start the 24-hour and 72-hour clocks from the " +
      "awareness timestamp.",
    failureMode:
      "The agent triages an actively exploited firmware flaw as a routine backlog bug, so the 24-hour early warning to the CSIRT and ENISA is never sent.",
    keyRisk: 4,
  },
  "MOB-PS-16": {
    l2: "Users can request a data export by support ticket, delivered without metadata.",
    l4: "Self-service access with metadata and third-party sharing exist, but the Art. 3(1) design obligation is not recorded per product.",
    evidence: ["vehicle_data_access_request_log", "third_party_share_audit_trail", "art3_design_obligation_record"],
    remediation: "Have the agent share vehicle data with a third party only on a recorded user request naming that third party, and log each transfer.",
    failureMode:
      "The agent shares a driver's vehicle data with an insurer at the insurer's request rather than the user's, enabling profiling the user never asked for.",
    keyRisk: 3,
  },
  "MOB-PS-17": {
    l2: "Field occurrences are logged as free text without a critical or non-critical classification.",
    l4: "Occurrences are classified and notifications are drafted from logs, but deadline tracking or retention of the supporting data is incomplete.",
    evidence: ["ads_occurrence_classification_log", "critical_occurrence_notification_record", "occurrence_data_retention_index"],
    remediation:
      "Classify each ADS field occurrence by the Annex III Part 5 definitions at ingestion, and draft critical notifications immediately with the " +
      "logs they rely on.",
    failureMode: "The agent classifies a near-collision in its own driving logs as non-critical, delaying the manufacturer's notification.",
    keyRisk: 2,
  },
  "MOB-PS-18": {
    l2: "Backend incidents are tracked in tickets, without an awareness time or significance criteria.",
    l4: "Significance criteria and deadlines are tracked automatically, but submissions are drafted by hand from scattered sources.",
    evidence: ["nis2_significance_assessment", "incident_submission_timeline", "connected_fleet_incident_evidence"],
    remediation:
      "Capture the awareness time of every vehicle-backend or network incident in the incident record, and generate each NIS2 submission draft from " +
      "that record.",
    failureMode:
      "The agent records a telematics backend breach as a performance incident, so significance is never assessed and the 72-hour notification is missed.",
    keyRisk: 4,
  },
};
