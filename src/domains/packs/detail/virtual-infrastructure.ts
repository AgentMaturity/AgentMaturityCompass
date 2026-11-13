/** Per-question detail for the virtual-infrastructure pack, keyed by question id (see IndustryPackQuestionDetail). */
import type { PackQuestionDetail } from "../../industryPacks.js";

export const virtualInfrastructureDetail: PackQuestionDetail = {
  "MOB-VI-1": {
    l2: "Some Annex A controls are documented, but there is no Statement of Applicability or effectiveness measure.",
    l4:
      "Annex A controls are monitored continuously with risk assessment and a maintained Statement of Applicability, but corrective actions are " +
      "tracked by hand.",
    evidence: ["statement_of_applicability", "annex_a_control_effectiveness_metrics", "isms_corrective_action_log"],
    remediation:
      "Run a control check after every infrastructure change the agent applies, and open a corrective action automatically when a mapped Annex A " +
      "control fails.",
    failureMode:
      "The agent disables a logging or encryption setting to fix a performance issue, and no control monitor notices the Annex A control has " +
      "stopped operating.",
    keyRisk: 2,
  },
  "MOB-VI-2": {
    l2: "Continuity plans exist on paper but have never been exercised.",
    l4: "Recovery times and recovery points are tested on schedule and recorded against targets, but failed tests do not lead to a recorded plan change.",
    evidence: ["bc_exercise_rto_rpo_results", "continuity_plan_revision_log", "failover_test_record"],
    remediation:
      "Schedule failover exercises for every service the agent manages, record measured recovery time and point against target, and open a plan " +
      "change on each miss.",
    failureMode:
      "The agent consolidates workloads onto one region to cut cost, breaking the failover path the continuity plan assumes, and no exercise reveals it.",
    keyRisk: 1,
  },
  "MOB-VI-3": {
    l2: "Transfer mechanisms appear in contracts, but no register maps them to destinations.",
    l4: "Every transfer path has a recorded mechanism and unmapped destinations are blocked, but a change in adequacy status does not trigger a review.",
    evidence: ["transfer_mechanism_register", "transfer_impact_assessment", "blocked_transfer_event_log"],
    remediation:
      "Check the target region and sub-processor of every replication, backup or migration the agent schedules against the transfer register, and " +
      "block it when no mechanism is recorded.",
    failureMode:
      "The agent replicates a database holding EU personal data to a cheaper region outside the EEA for disaster recovery, with no transfer " +
      "mechanism on record.",
    keyRisk: 0,
  },
  "MOB-VI-4": {
    l2: "Controls are listed against some CCM domains, but their status is not tracked.",
    l4: "All 17 domains are mapped with automated evidence, but the shared-responsibility matrix or the STAR Level 2 evidence is out of date.",
    evidence: ["ccm_v4_1_control_mapping", "automated_control_evidence_snapshot", "shared_responsibility_matrix"],
    remediation:
      "Map each cloud resource type the agent can create to its CCM controls, and collect evidence automatically whenever the agent provisions or changes one.",
    failureMode: "The agent provisions a managed service outside the CCM mapping, so no evidence is collected and the gap surfaces only at assessment.",
    keyRisk: 2,
  },
  "MOB-VI-6": {
    l2: "Energy figures come from provider invoices once a year, with no link to workloads.",
    l4: "Workload placement considers carbon intensity and Scope 2 and 3 emissions are calculated, but ESRS E1 reporting or target alignment is incomplete.",
    evidence: ["workload_carbon_intensity_log", "scope2_scope3_calculation", "region_grid_intensity_dataset"],
    remediation:
      "Add grid carbon intensity per region as an input to the agent's placement of deferrable workloads, and log the intensity used with each placement.",
    failureMode:
      "The agent schedules large batch and training jobs in the lowest-price region regardless of grid intensity and leaves idle GPU clusters running.",
    keyRisk: 3,
  },
  "MOB-VI-7": {
    l2: "The agent's infrastructure changes appear in change tickets without stated reasons.",
    l4:
      "Decisions are explainable with causal audit trails and human oversight of critical changes, but transparency documentation is not available " +
      "to affected stakeholders.",
    evidence: ["infra_decision_explanation_record", "critical_change_approval_log", "deployer_instructions_for_use"],
    remediation:
      "Record the inputs, rule or model output and expected effect of every infrastructure change the agent makes, and require human approval for " +
      "changes on essential-service paths.",
    failureMode:
      "The agent drains traffic from a data centre on an anomaly score it cannot explain, and operators cannot tell why essential services lost capacity.",
    keyRisk: 1,
  },
  "MOB-VI-8": {
    l2: "A vendor list exists, but security assessments cover only the largest suppliers.",
    l4:
      "Lifecycle controls, contractual requirements and continuous monitoring cover all ICT vendors, but supply chain incidents are not tied into " +
      "incident response.",
    evidence: ["ict_vendor_risk_register", "vendor_security_assessment_record", "supplier_incident_response_link"],
    remediation:
      "Block the agent from adding a new ICT vendor, SaaS tool or container registry to the environment until it has a vendor risk record and " +
      "contractual security terms.",
    failureMode: "The agent pulls an image from an unvetted third-party container registry to fix a build, bringing an unassessed supplier into production.",
    keyRisk: 2,
  },
  "MOB-VI-9": {
    l2: "Hosted models are listed, but none is classified for systemic risk.",
    l4:
      "Classification and provider evidence for each Art. 55(1) obligation are retained, but evidence is not re-requested on a model version change " +
      "or observed incidents are not passed on.",
    evidence: ["hosted_model_classification_register", "gpai_provider_art55_evidence", "model_incident_forwarding_log"],
    remediation:
      "Have the agent block deployment of a new hosted model version until its systemic-risk classification is recorded and the provider's Art. " +
      "55(1) evidence is attached.",
    failureMode: "The agent upgrades a hosted model to a new version classed as systemic risk without requesting the provider's adversarial-testing evidence.",
    keyRisk: 2,
  },
  "MOB-VI-10": {
    l2: "Accounts are created through tickets, but privileged and external accounts follow no separate process.",
    l4: "Lifecycle automation and privileged and external account governance are in place, but periodic reconciliation or exception handling is incomplete.",
    evidence: ["account_type_approval_workflow", "privileged_account_review_record", "deprovisioning_event_log"],
    remediation:
      "Give the agent's own service identities defined AC-2 account types with expiry, and reconcile every account the agent created against its " +
      "approval at each periodic review.",
    failureMode:
      "The agent creates service accounts and access keys to automate a task and never deprovisions them, leaving standing privileged access with no owner.",
    keyRisk: 2,
  },
  "MOB-VI-11": {
    l2: "A cloud policy exists, but services are adopted without onboarding criteria.",
    l4: "Onboarding, shared responsibility, contract controls and baselines are governed, but drift monitoring or Statement of Applicability mapping has gaps.",
    evidence: ["cloud_service_onboarding_record", "configuration_baseline_drift_report", "a5_23_soa_evidence_map"],
    remediation: "Restrict the agent to an allowlist of onboarded cloud services, and alert on configuration drift from each service's approved baseline.",
    failureMode: "The agent enables a new cloud service in a production account to meet a deadline, bypassing onboarding and the hardened baseline.",
    keyRisk: 2,
  },
  "MOB-VI-12": {
    l2: "Export tools exist for some data, but there is no switching plan or equivalence mapping.",
    l4:
      "Switching runbooks are tested and functional equivalence is mapped, but timeline and charge governance or post-exit deletion verification is " +
      "incomplete.",
    evidence: ["cloud_switching_runbook_test", "functional_equivalence_map", "post_exit_deletion_verification"],
    remediation:
      "Have the agent prefer portable services where the equivalence map lists one, and run a switching rehearsal that exports data and " +
      "applications in documented formats.",
    failureMode:
      "The agent adopts provider-proprietary managed services for every new workload because they score best on cost, leaving no tested export path.",
    keyRisk: 4,
  },
  "MOB-VI-13": {
    l2: "NIS2 is referenced in policy, but categories (a)-(j) are not mapped to controls.",
    l4: "Each category is mapped with evidence and effectiveness testing, but reporting to the management body is irregular.",
    evidence: ["nis2_art21_category_control_map", "measure_effectiveness_test_results", "management_body_reporting_record"],
    remediation:
      "Map each action class the agent can take to the Art. 21(2) categories it affects, and include the agent's own controls in the category " +
      "effectiveness tests.",
    failureMode: "The agent turns off MFA on an administrative interface to unblock an automation, weakening category (j) with no record reaching management.",
    keyRisk: 1,
  },
  "MOB-VI-14": {
    l2: "Citations are collected in a spreadsheet with no version or owner.",
    l4: "The mapping is versioned with a review workflow, but evidence linkage and citation consistency are not checked automatically.",
    evidence: ["regulatory_mapping_version_history", "citation_review_record", "control_evidence_linkage_check"],
    remediation:
      "Version the FedRAMP, NIS2, ISO 27001 and Data Act mapping, and fail a check when any agent control cites a clause missing from the current version.",
    failureMode:
      "The agent cites a superseded clause in an evidence bundle, so the data-residency and switching obligations it claims to meet cannot be " +
      "traced to the current text.",
    keyRisk: 0,
  },
  "MOB-VI-15": {
    l2: "Incidents reach the CSIRT when someone remembers, with no significance classification step.",
    l4: "Agent telemetry feeds significance classification and the stages are tracked, but each submission is drafted by hand.",
    evidence: ["significance_classification_record", "nis2_reporting_stage_timeline", "csirt_submission_archive"],
    remediation:
      "Feed the agent's own incident telemetry into significance classification, and start the 24-hour, 72-hour and one-month clocks from the " +
      "classification timestamp.",
    failureMode:
      "The agent self-heals a region-wide outage through repeated restarts and closes the incident, so it is never classified as significant or reported.",
    keyRisk: 1,
  },
  "MOB-VI-16": {
    l2: "An on-call team is responsible for the agent, but no named overseer has authority to stop it.",
    l4: "Overseers, suspension triggers and six-month log retention are documented, but suspension has not been tested or the provider runbook is missing.",
    evidence: ["infra_agent_overseer_assignment", "suspension_drill_record", "agent_log_retention_config"],
    remediation:
      "Give named overseers a tested control that freezes the agent's write access to infrastructure APIs, and retain the agent's logs for at least " +
      "six months under a written policy.",
    failureMode: "The agent keeps scaling down a critical service in a feedback loop, because no overseer can suspend it without escalating to the vendor.",
    keyRisk: 1,
  },
  "MOB-VI-17": {
    l2: "Financial-entity customers are tagged, but their Art. 11 and Art. 12 requirements are not mapped to the service.",
    l4: "Arrangements are mapped to contracts and tested on schedule, but the test evidence is not shared as the contract requires.",
    evidence: ["dora_customer_requirement_map", "backup_restoration_test_record", "customer_evidence_share_log"],
    remediation:
      "Tag every resource serving a DORA customer, and have the agent refuse changes to its backup or restoration configuration unless a " +
      "restoration test is recorded afterwards.",
    failureMode:
      "The agent shortens backup retention on a financial-entity customer's storage to cut cost, breaking the restoration arrangement in that " +
      "customer's contract.",
    keyRisk: 1,
  },
};
