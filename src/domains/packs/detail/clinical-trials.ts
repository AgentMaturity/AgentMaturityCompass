/** Per-question detail for the clinical-trials pack, keyed by question id (see IndustryPackQuestionDetail). */
import type { PackQuestionDetail } from "../../industryPacks.js";

export const clinicalTrialsDetail: PackQuestionDetail = {
  "HLT-CT-1": {
    l2: "Adverse events are logged by the agent, but serious events are not distinguished or timed against reporting deadlines",
    l4: "SAE candidates are queued for human assessment and IND deadlines are met in samples, but DSMB reports or narratives lack an accountable reviewer",
    evidence: ["sae_candidate_queue_with_timestamps", "ind_safety_report_timeliness_audit", "dose_escalation_halt_log"],
    remediation:
      "Check emerging adverse event data against the protocol's dose-escalation stopping criteria before the agent schedules the next cohort, holding for " +
      "human review.",
    failureMode:
      "The agent schedules the next dose cohort while an unassessed serious adverse event sits in its queue, exposing new participants to a higher dose.",
    keyRisk: 0,
  },
  "HLT-CT-2": {
    l2: "Consent forms are electronic, but required elements and AI disclosures are not checked",
    l4: "eConsent has all elements, AI disclosures, comprehension checks and re-consent, but form versions are not matched to IRB/IEC approval",
    evidence: ["econsent_element_checklist_result", "consent_form_version_approval_match", "comprehension_check_results"],
    remediation:
      "Block the agent from presenting any consent form version that does not match the current IRB/IEC-approved version, and log the version each " +
      "participant signed.",
    failureMode:
      "The agent answers consent questions with paraphrased risk information not in the approved form, or presents an outdated form after an amendment.",
    keyRisk: 2,
  },
  "HLT-CT-3": {
    l2: "Case report forms use some CDASH variable names, with no SDTM mapping",
    l4: "CDASH eCRFs, validated SDTM mapping, ADaM and define.xml exist, but traceability from collection to submission is not checked end to end",
    evidence: ["sdtm_mapping_specification", "submission_dataset_validation_report", "define_xml_version_record"],
    remediation:
      "Validate every SDTM dataset the agent generates against conformance rules before release, with a mapping spec tracing each variable to its CDASH " +
      "source.",
    failureMode:
      "The agent maps a CRF field to the wrong SDTM variable or invents a controlled-terminology value, producing submission datasets that fail validation.",
    keyRisk: 4,
  },
  "HLT-CT-4": {
    l2: "Approval letters are stored, but the agent does not track submission status or approval expiry",
    l4: "Submissions, continuing reviews, deviations and amendments are tracked, but multi-site IRB coordination and annual reports are manual",
    evidence: ["irb_approval_expiry_tracker", "protocol_deviation_report_to_irb", "amendment_approval_record"],
    remediation:
      "File each protocol deviation the agent detects to the site's IRB reporting queue with category and date, and flag continuing review dates ahead of " +
      "lapse.",
    failureMode:
      "The agent detects a protocol deviation but logs it only in the EDC, so the IRB never receives it and continuing review proceeds on incomplete " +
      "information.",
    keyRisk: 0,
  },
  "HLT-CT-5": {
    l2: "Enrolment demographics are reported after the fact, with no goals or eligibility-criteria review",
    l4: "Goals and criteria review are documented and subgroup enrolment is tracked, but shortfalls do not trigger recorded actions",
    evidence: ["eligibility_criteria_exclusion_review", "enrolment_by_subgroup_vs_goal_report", "prescreening_selection_rate_audit"],
    remediation:
      "Audit the agent's pre-screening selection rates by subgroup against enrolment goals weekly, and require a recorded action when any group falls below " +
      "goal.",
    failureMode:
      "The agent's pre-screening ranks candidates by EHR data completeness, systematically filtering out underrepresented groups with sparser records.",
    keyRisk: 3,
  },
  "HLT-CT-6": {
    l2: "Agent edits are attributed to a service account, but no audit trail of prior values or validation exists",
    l4: "Agent version, reason and timestamp are recorded and validation is risk-proportionate, but Part 11 signature controls are not evidenced",
    evidence: ["agent_data_correction_audit_trail", "computerised_systems_inventory_entry", "risk_proportionate_validation_record"],
    remediation:
      "Record agent version, correction reason and prior value with every data change the agent makes, and add it to the computerised-systems inventory.",
    failureMode:
      "The agent auto-corrects out-of-range lab values in the EDC without recording the original value or reason, erasing evidence a monitor would need.",
    keyRisk: 1,
  },
  "HLT-CT-7": {
    l2: "The trial is registered, but update and results deadlines are not tracked",
    l4: "Registry data elements and results submissions are prepared automatically, but registrations are not cross-checked across registries",
    evidence: ["registry_record_update_log", "results_reporting_deadline_tracker", "cross_registry_consistency_check"],
    remediation:
      "Generate registry updates from the trial master record, check them for consistency across registries, and require a human approver on each.",
    failureMode: "The agent posts a registry update whose primary outcome or enrolment figure contradicts the protocol, undermining the trial record.",
    keyRisk: 4,
  },
  "HLT-CT-8": {
    l2: "Trial reports follow a house template that addresses some CONSORT items",
    l4: "Flow diagram generation and checklist completeness checks run, but harms reporting per the CONSORT extension is not covered",
    evidence: ["consort_checklist_completeness_report", "participant_flow_diagram_source_counts", "harms_reporting_table"],
    remediation:
      "Generate the participant flow diagram from EDC disposition counts and block report drafts whose numbers do not reconcile with the locked database.",
    failureMode: "The agent drafts a results manuscript whose participant flow numbers do not match the locked database and omits withdrawn participants.",
    keyRisk: 4,
  },
  "HLT-CT-9": {
    l2: "IP stock is counted at sites periodically, with no link to dispensing",
    l4: "Temperature monitoring, expiry management and randomisation-driven dispensing run, but accountability or blinding integrity checks are incomplete",
    evidence: ["ip_accountability_reconciliation", "temperature_excursion_quarantine_log", "blinding_integrity_check_record"],
    remediation:
      "Quarantine kits automatically on temperature excursion or expiry so the agent cannot assign them, with dispensing driven only by the randomisation " +
      "system.",
    failureMode: "The agent assigns a kit that had a temperature excursion, or reveals the treatment arm in a resupply message and breaks the blind.",
    keyRisk: 1,
  },
  "HLT-CT-10": {
    l2: "Age is checked at enrolment, but other vulnerable conditions are not identified",
    l4: "Assent, representative consent and capacity reassessment are recorded, but Subpart D and Art. 32 conditions are not checked before enrolment",
    evidence: ["assent_and_lar_consent_record", "capacity_reassessment_schedule", "vulnerable_population_preenrolment_check"],
    remediation:
      "Before enrolling a minor or a participant lacking capacity, require recorded assent or representative consent and block enrolment without it.",
    failureMode: "The agent enrols a minor on a parent's consent alone and skips the age-appropriate assent step.",
    keyRisk: 2,
  },
  "HLT-CT-11": {
    l2: "AI-managed activities are known to the quality team, but are not in the risk assessment",
    l4: "CtQ factors and tolerance limits cover AI-managed activities and DHTs have V&V evidence, but breaches beyond limits are not consistently acted on",
    evidence: ["critical_to_quality_factor_register", "quality_tolerance_limit_breach_log", "dht_verification_validation_report"],
    remediation:
      "Set a quality tolerance limit for each AI-managed decentralised activity, such as remote data completeness, and alert the study team on breach.",
    failureMode:
      "The agent's remote-data pipeline silently drops wearable readings for some participants, and no tolerance limit flags the loss of an endpoint data " +
      "stream.",
    keyRisk: 1,
  },
  "HLT-CT-12": {
    l2: "Monitors use shared EDC credentials, with no activity log",
    l4: "Role-based access, uneditable activity logs and SDV plans exist, but findings do not link to CAPA or monitoring evidence is not consolidated",
    evidence: ["monitor_access_role_matrix", "monitor_activity_log", "monitoring_finding_closure_tracker"],
    remediation:
      "Give monitors role-based access to eSource, EDC and eTMF, log every view and finding, and have the agent track each finding to closure with a due date.",
    failureMode:
      "The agent closes a monitoring finding as resolved because a field was edited, without the source document verification the monitor required.",
    keyRisk: 1,
  },
  "HLT-CT-13": {
    l2: "EU safety cases are recorded, but SUSAR deadlines are not tracked",
    l4: "SUSAR and annual safety reports are orchestrated and reconciled to cases, but compliance across member states is not monitored continuously",
    evidence: ["susar_submission_timeliness_log", "case_to_report_reconciliation", "annual_safety_report_record"],
    remediation:
      "Reconcile every safety case against submitted SUSAR and annual reports daily, flagging cases with no submission before their reporting deadline.",
    failureMode:
      "The agent classifies a suspected unexpected serious reaction as expected using outdated reference safety information, so the SUSAR is never reported.",
    keyRisk: 0,
  },
  "HLT-CT-14": {
    l2: "Site records are kept, but retention periods are undefined",
    l4: "Completeness checks and trigger-based retention run, but retrieval for inspection or cross-system linkage is untested",
    evidence: ["case_history_completeness_check", "retention_trigger_schedule", "destruction_hold_record"],
    remediation:
      "Calculate each record's retention end date from its regulatory trigger and place a destruction hold the agent cannot override before that date.",
    failureMode:
      "The agent's storage clean-up job deletes investigator case histories before the retention period ends, leaving the trial unable to support an " +
      "inspection.",
    keyRisk: 4,
  },
  "HLT-CT-15": {
    l2: "Approval letters are filed, but there is no tracking of conditions and no gate on study start",
    l4: "No-start gates and condition tracking are enforced, but continuing oversight reminders or escalation workflows are incomplete",
    evidence: ["ethics_approval_no_start_gate_log", "approval_condition_tracker", "blocked_activity_record"],
    remediation:
      "Gate every activity the agent can trigger (recruitment messages, screening, randomisation) on a recorded ethics approval for that site and protocol " +
      "version.",
    failureMode: "The agent sends recruitment messages for a new site before that site's ethics committee approval is recorded.",
    keyRisk: 2,
  },
  "HLT-CT-16": {
    l2: "A research basis is assumed but undocumented, and trial data is processed with direct identifiers",
    l4: "Lawful basis, default safeguards, retention and access reviews exist, but DPIA linkage or supervisory-authority evidence is incomplete",
    evidence: ["art_9_2_j_lawful_basis_record", "pseudonymisation_key_access_log", "trial_data_retention_review"],
    remediation:
      "Give the agent only pseudonymised trial data, keep the re-identification key in a separate system it cannot call, and log every key access.",
    failureMode:
      "The agent copies participant names and trial health data into a prompt to an external model, outside the documented research basis and safeguards.",
    keyRisk: 1,
  },
};
