/** Per-question detail for the os-sustainable-outcomes pack, keyed by question id (see IndustryPackQuestionDetail). */
import type { PackQuestionDetail } from "../../industryPacks.js";

export const osSustainableOutcomesDetail: PackQuestionDetail = {
  "TECH-OS-1": {
    l2: "An ICT risk framework exists for the wider entity but does not name the agent orchestration layer.",
    l4: "Art. 9 measures are mapped per component with owners, but the framework was not reviewed after the last major ICT-related incident.",
    evidence: ["ict_risk_framework_scope_statement", "art9_measure_component_map", "framework_review_record"],
    remediation:
      "List each orchestration component (planner, tool router, payment connectors) in the ICT risk " +
      "framework and map Art. 9 protection measures to it with an owner.",
    failureMode: "The agent's tool router reaches payment rails through a path outside the ICT risk framework, so a compromise there goes unmonitored.",
    keyRisk: 4,
  },
  "TECH-OS-2": {
    l2: "Orchestration services run without catalogue entries; incidents are handled in chat with no records.",
    l4: "Catalogue, SLAs and monthly attainment reports exist, but incident, problem and change records are not linked or improvement actions stall.",
    evidence: ["orchestration_service_catalogue", "sla_attainment_report", "linked_incident_change_records"],
    remediation:
      "Register each agent-run orchestration service in the catalogue with an SLA, and require every " +
      "agent-initiated change to carry a change record linked to the service.",
    failureMode:
      "The agent changes a routing rule in a live orchestration service without a change record, and the resulting SLA breach cannot be traced to its cause.",
    keyRisk: 1,
  },
  "TECH-OS-3": {
    l2: "Access controls exist but are not mapped to the TSC, and no auditor has examined the agent.",
    l4: "CC6-CC9 are mapped with automated evidence and a Type II report exists, but its system description omits the agent layer or exceptions remain open.",
    evidence: ["tsc_cc6_cc9_control_map", "soc2_type2_system_description", "exception_remediation_record"],
    remediation:
      "Bring the agent's service accounts, tool permissions and change pipeline into the SOC 2 system " +
      "description and collect CC6-CC9 evidence for them automatically.",
    failureMode: "The agent's service account holds standing production access outside the SOC 2 scope, so its privileged changes are never reviewed.",
    keyRisk: 1,
  },
  "TECH-OS-4": {
    l2: "Only throughput and cost metrics are tracked; no economic or social outcome measures exist.",
    l4: "GRI 201-207 reporting and SDG impact measurement are in place, but stakeholder outcome distribution or negative externalities are not analysed.",
    evidence: ["gri_201_207_economic_report", "sdg_impact_measurement_record", "negative_externality_register"],
    remediation:
      "Add outcome metrics per stakeholder group beside efficiency metrics in the orchestration objective, " +
      "and report the negative externalities the optimisation produces.",
    failureMode: "The agent optimises routing for lowest cost and quietly shifts delays onto rural customers because only efficiency is measured.",
    keyRisk: 2,
  },
  "TECH-OS-5": {
    l2: "Backups exist, but there is no business impact analysis and no RTO or RPO for orchestration pathways.",
    l4: "The BIA covers every critical pathway and exercises measure achieved RTO/RPO, but gaps found in exercises are not tracked to closure.",
    evidence: ["business_impact_analysis", "rto_rpo_exercise_results", "continuity_gap_tracker"],
    remediation:
      "Set RTO and RPO for each critical orchestration pathway in the BIA and run a failover exercise that measures achieved recovery time against them.",
    failureMode: "The agent resumes after a state-store failover from a snapshot hours old and replays payment instructions that had already settled.",
    keyRisk: 4,
  },
  "TECH-OS-6": {
    l2: "Complaints about unequal service are handled one by one; no disparity metric exists.",
    l4: "Disparity metrics and thresholds run on schedule with tracked remediation, but results are not reported to stakeholders.",
    evidence: ["group_disparity_metric_report", "disparity_threshold_definition", "disparity_remediation_ticket"],
    remediation:
      "Compute access and outcome rates per defined user group weekly from orchestration logs and open a " +
      "remediation ticket whenever a gap exceeds the documented threshold.",
    failureMode: "The agent's allocation policy gives one region systematically slower service and no disparity metric surfaces it.",
    keyRisk: 2,
  },
  "TECH-OS-7": {
    l2: "A few security measures (backups, MFA) exist with no mapping to Art. 21.",
    l4:
      "Most Art. 21 measures are in place with regular testing, but at least one, such as cryptography " +
      "or supply chain, lacks evidence for the orchestration system.",
    evidence: ["art21_measure_coverage_matrix", "orchestration_security_test_report", "crypto_policy_orchestration_scope"],
    remediation:
      "Build an Art. 21(2) coverage matrix for the orchestration system with one evidence link per measure, and " +
      "schedule recurring security tests of the agent's tool interfaces.",
    failureMode: "The agent's orchestration network has no segmentation, so one compromised connector propagates to every downstream transaction system.",
    keyRisk: 0,
  },
  "TECH-OS-8": {
    l2: "The record of processing describes the product in general; new agent tools are added without updating it.",
    l4: "Every agent activity has a complete versioned entry, but the record is not reconciled against the processing inventory on schedule.",
    evidence: ["art30_record_entries_agent", "processing_inventory_reconciliation", "ropa_version_history"],
    remediation:
      "Fail the deploy of any agent tool that processes personal data until a matching Art. 30 record entry " +
      "exists, and reconcile entries against tool manifests monthly.",
    failureMode: "The agent starts sending customer data to a new third-country analytics tool that no record of processing entry mentions.",
    keyRisk: 1,
  },
  "TECH-OS-9-v2": {
    l2: "The orchestration layer receives only vulnerability scans and sits outside the resilience testing programme.",
    l4: "The layer is in the programme and in TLPT scope, but findings are not retested or tester requirements are only partly evidenced.",
    evidence: ["resilience_testing_programme_scope", "tlpt_scope_document", "tlpt_finding_retest_record"],
    remediation:
      "Add the agent orchestration environment, including its tool connectors, to the Art. 25 test plan " +
      "and to TLPT scope, and retest each finding before closure.",
    failureMode: "The agent's orchestration layer is carved out of TLPT, so no red team discovers that its tool router can be hijacked to move funds.",
    keyRisk: 4,
  },
  "TECH-OS-10": {
    l2: "Annual penetration tests and occasional scenario exercises run, with no TLPT policy or independence controls.",
    l4: "TLPT policy, governance, threat-intelligence red teaming and remediation exist, but evidence bundles lack retest outcomes or rules of engagement.",
    evidence: ["tlpt_policy_scoping_method", "tlpt_rules_of_engagement", "red_team_threat_intel_report", "supervisor_evidence_bundle"],
    remediation:
      "Write a TLPT policy whose scoping includes agent attack paths such as prompt injection driving tool " +
      "calls, and assemble an evidence bundle per test with retests.",
    failureMode:
      "The agent is never attacked through agent-specific paths in red-team scenarios, so a prompt injection that drives its payment tools stays untested.",
    keyRisk: 0,
  },
  "TECH-OS-11": {
    l2: "Backups run nightly but have never been restored in a drill.",
    l4: "Restore objectives and drills exist with integrity checks, but access restoration is not verified or drill evidence is not retained.",
    evidence: ["personal_data_restore_drill_report", "restore_integrity_checksum_log", "access_restoration_verification"],
    remediation:
      "Run a quarterly restore drill of each personal-data store the agent uses, verify checksums and " +
      "access permissions after restore, and keep the drill report.",
    failureMode:
      "The agent restores a customer database after an outage with permissions reset to open, exposing personal data that was access-controlled before.",
    keyRisk: 4,
  },
  "TECH-OS-12": {
    l2: "A high-level continuity plan exists; recovery steps live in individual engineers' heads.",
    l4: "Executable runbooks with invocation criteria and roles are exercised, but after-action improvements are not fed back into the runbooks.",
    evidence: ["recovery_runbook_per_pathway", "invocation_criteria_matrix", "exercise_after_action_report"],
    remediation:
      "Write an executable runbook per critical orchestration pathway with invocation criteria, including " +
      "how to pause the agent and drain its queue, and exercise it.",
    failureMode: "The agent keeps retrying failed downstream calls while humans recover from an outage, because no runbook step pauses it first.",
    keyRisk: 0,
  },
  "TECH-OS-13": {
    l2: "Availability is monitored for the front end only; dependencies are not mapped.",
    l4: "Targets per service, mapped dependencies and annual tests exist, but exceptions are approved informally or availability trend is not reported.",
    evidence: ["service_dependency_map", "availability_target_register", "continuity_test_report"],
    remediation:
      "Map every model provider, tool API and data store each orchestration service depends on, and set " +
      "availability targets that account for the weakest dependency.",
    failureMode: "The agent depends on a single model endpoint that nobody mapped, and when it degrades every orchestration service fails at once.",
    keyRisk: 0,
  },
  "TECH-OS-14": {
    l2: "Incident handling follows habit; there is no practice owner and no KPIs.",
    l4: "Owned KPIs, runbooks and an improvement backlog exist, but evidence of sustained execution over several periods is missing.",
    evidence: ["practice_kpi_dashboard", "continual_improvement_backlog", "recovery_drill_success_rate"],
    remediation: "Name a practice owner, publish MTTR, availability and drill-success KPIs for agent-run services, and review the improvement backlog monthly.",
    failureMode: "The agent auto-closes incidents it cannot resolve, inflating its success rate while MTTR for real recoveries rises unmeasured.",
    keyRisk: 4,
  },
  "TECH-OS-15": {
    l2: "Control citations were copied into a spreadsheet once and never revisited.",
    l4: "The mapping is versioned and reviewed, but no automated check flags controls whose cited clause changed.",
    evidence: ["control_to_clause_map_versions", "citation_review_log", "citation_consistency_check_output"],
    remediation: "Version the control-to-clause map, run a CI check that every control cites a mapped article, and log each periodic review.",
    failureMode:
      "The agent applies a superseded clause when routing a cross-border transaction and picks the laxer jurisdiction's rule because the mapping drifted.",
    keyRisk: 3,
  },
  "TECH-OS-16": {
    l2: "AI providers are used under click-through terms and are absent from the third-party register.",
    l4: "Every provider is registered with an Art. 30 clause map, but exit strategies are documented and never tested.",
    evidence: ["ict_third_party_register_ai_providers", "art30_contract_clause_map", "exit_strategy_test_record"],
    remediation:
      "Add each model and AI tool provider to the ICT third-party register, map their contracts to Art. 30, and test the exit to an alternative provider.",
    failureMode: "The agent depends on a model provider outside the third-party register, so a provider outage halts a critical function with no tested exit.",
    keyRisk: 0,
  },
  "TECH-OS-17": {
    l2: "Incidents are logged, but significance is not classified and no reporting owner exists.",
    l4: "All three deadlines are timed and templates are ready, but no timed rehearsal is on record.",
    evidence: ["significant_incident_classification_log", "nis2_deadline_timer_record", "early_warning_template"],
    remediation:
      "Start 24-hour, 72-hour and one-month timers automatically when an incident is classified significant, and rehearse the full sequence once a year.",
    failureMode: "The agent auto-remediates a significant incident and closes the ticket, so the 24-hour early warning clock never starts.",
    keyRisk: 3,
  },
  "TECH-OS-18": {
    l2: "Incidents are logged without applying the DORA classification criteria.",
    l4: "Reports are produced from the templates, but rehearsals are missing or a past report was filed late.",
    evidence: ["dora_incident_classification_record", "major_incident_report_set", "reporting_rehearsal_record"],
    remediation:
      "Apply the DORA classification criteria to every agent-related incident at triage and generate " +
      "initial, intermediate and final reports from the templates.",
    failureMode:
      "The agent's failed batch of payment instructions is logged as a routine error and never classified, so a major ICT-related incident goes unreported.",
    keyRisk: 1,
  },
  "TECH-OS-19": {
    l2: "Breaches are escalated by email; detection and notification times are not recorded.",
    l4: "Timestamps are recorded and a breach register is kept, but no rehearsal is on record.",
    evidence: ["breach_awareness_timestamp", "supervisory_notification_record", "breach_register"],
    remediation:
      "Record the awareness timestamp at breach triage and start a 72-hour countdown that alerts the " +
      "DPO, logging the notification time or the reason for delay.",
    failureMode:
      "The agent sends customer records to the wrong partner endpoint and nobody records when awareness began, so the 72-hour window cannot be shown.",
    keyRisk: 1,
  },
  "TECH-OS-20": {
    l2: "Serious incidents are discussed internally, with no criteria and no reporting owner.",
    l4: "Timestamps are recorded and reports filed, but no timed rehearsal is on record.",
    evidence: ["serious_incident_criteria", "causal_link_timestamp_log", "market_surveillance_report"],
    remediation:
      "Add serious-incident criteria to triage for the high-risk AI system, record awareness and " +
      "causal-link timestamps, and alert at day 10 of the 15-day limit.",
    failureMode:
      "The agent's high-risk component contributes to a serious incident that is handled as an ordinary outage, so no market surveillance report is filed.",
    keyRisk: 1,
  },
  "TECH-OS-21": {
    l2: "Scanner findings are triaged ad hoc; no disclosure channel exists.",
    l4: "A disclosure channel and severity deadlines are tracked, but security requirements are not applied to every acquired component such as agent plugins.",
    evidence: ["vulnerability_disclosure_policy", "vulnerability_remediation_tracker", "component_security_requirement_check"],
    remediation:
      "Publish a disclosure channel, set remediation deadlines per severity, and require a security check before the agent loads any new plugin or connector.",
    failureMode: "The agent installs a vulnerable third-party tool plugin with no security review, and an exploit in it reaches the orchestration environment.",
    keyRisk: 0,
  },
};
