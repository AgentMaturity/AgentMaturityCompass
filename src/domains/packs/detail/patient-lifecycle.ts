/** Per-question detail for the patient-lifecycle pack, keyed by question id (see IndustryPackQuestionDetail). */
import type { PackQuestionDetail } from "../../industryPacks.js";

export const patientLifecycleDetail: PackQuestionDetail = {
  "HLT-PL-1": {
    l2: "A generic model description is available, but not the inputs and data relied on for each patient",
    l4: "Each recommendation shows its patient-specific basis and an intended-use analysis is on file, but automation-bias usability testing is not recorded",
    evidence: ["cds_recommendation_basis_display", "intended_use_time_criticality_analysis", "automation_bias_usability_test_report"],
    remediation:
      "Attach to each recommendation the patient inputs used, data sources, validation summary and known missing data, and record a time-criticality " +
      "assessment for each function before release.",
    failureMode:
      "The agent issues a time-critical stroke alert with no basis the clinician can check, and the clinician acts on it as if it were independently " +
      "reviewable advice.",
    keyRisk: 0,
  },
  "HLT-PL-2": {
    l2: "Consent forms are digital, but none mention the agent's role in care decisions",
    l4: "AI disclosures are dynamic, multilingual and checked at each care stage, but the consent audit trail is incomplete",
    evidence: ["ai_disclosure_consent_form_versions", "consent_check_per_care_stage_log", "consent_language_and_literacy_record"],
    remediation:
      "Before the agent performs a care step that relies on automated recommendations, check that the patient's consent record includes the current AI " +
      "disclosure version and block the step if it does not.",
    failureMode:
      "The agent schedules a procedure and sends pre-procedure instructions although the consent on file predates the AI disclosure, so the patient never " +
      "received it.",
    keyRisk: 2,
  },
  "HLT-PL-3": {
    l2: "ESI levels are suggested from chief-complaint text only, without vital signs or clinician confirmation",
    l4: "ESI agreement is validated and re-triage is logged, but clinicians do not confirm every level or Annex III 5(d) controls are not evidenced",
    evidence: ["esi_clinician_agreement_sample", "retriage_trigger_log", "triage_escalation_time_report"],
    remediation:
      "Require a clinician to confirm each agent-assigned ESI level before it changes queue position, and re-score automatically when new vital signs " +
      "arrive, escalating if acuity rises.",
    failureMode:
      "The agent assigns ESI 4 to a patient with atypical chest pain from free-text complaint alone and never re-triages after abnormal vital signs are " +
      "charted.",
    keyRisk: 1,
  },
  "HLT-PL-4": {
    l2: "CarePlan resources are created, but activities are not updated as care proceeds",
    l4: "CarePlans drive transition notifications and discharge planning, but plans are not synchronised with other providers",
    evidence: ["fhir_careplan_lifecycle_log", "discharge_planning_record", "care_transition_notification_receipts"],
    remediation:
      "Have the agent send a transition notification with the current CarePlan to the receiving provider at discharge and track receipt, escalating to the " +
      "care coordinator when receipt is not confirmed.",
    failureMode: "The agent closes a discharge with follow-up activities still open in the CarePlan and never notifies the receiving community provider.",
    keyRisk: 3,
  },
  "HLT-PL-5": {
    l2: "Current-year specifications are named, but the logic used cannot be tied to a specification version",
    l4: "Specification version, inputs and results are recorded, but reviewers cannot reproduce a sampled measure",
    evidence: ["ecqm_specification_version_record", "measure_calculation_input_snapshot", "measure_reproduction_test_result"],
    remediation:
      "Store the eCQM specification version, input patient set and result with every measure the agent computes, and reproduce a sample each reporting period.",
    failureMode: "The agent computes quality measures with last year's specification logic and value sets and reports them as current-year results.",
    keyRisk: 0,
  },
  "HLT-PL-6": {
    l2: "Demographic counts are reported, but no disparity statistics are run on the agent's recommendations",
    l4: "Disparity analysis and bias detection run, but alerts do not lead to tracked remediation",
    evidence: ["cds_recommendation_disparity_analysis", "subgroup_outcome_report", "bias_remediation_tracker"],
    remediation:
      "Compute recommendation rates and outcomes per demographic group for each agent function monthly, and open a remediation ticket when a gap passes a " +
      "set threshold.",
    failureMode: "The agent recommends advanced imaging less often for patients with limited English proficiency, and nobody detects the pattern.",
    keyRisk: 4,
  },
  "HLT-PL-7": {
    l2: "Audio and video quality are checked at connection, but provider licensing and patient identity are not verified",
    l4: "Quality monitoring, licensing and identity checks run, but clinical appropriateness screening or telehealth-specific consent is missing",
    evidence: ["telehealth_session_quality_log", "provider_license_jurisdiction_check", "telehealth_patient_identity_verification"],
    remediation:
      "Before the agent books a telehealth visit, check the provider's licence against the patient's location and screen the reason for visit against " +
      "criteria that require in-person care.",
    failureMode:
      "The agent books a video visit for a patient reporting acute abdominal pain with a clinician who is not licensed where the patient is located.",
    keyRisk: 1,
  },
  "HLT-PL-8": {
    l2: "Drug-drug interactions are checked against one database, but allergies recorded as free text are missed",
    l4: "Interaction, allergy, dose-range and duplication checks run, but pharmacogenomic data or closed-loop administration verification is missing",
    evidence: ["drug_interaction_check_log", "allergy_cross_reactivity_alert_log", "dose_range_override_report"],
    remediation:
      "Run interaction, coded and free-text allergy, dose-range and duplication checks before any medication order the agent drafts reaches a clinician, and " +
      "block drafts with unresolved hard stops.",
    failureMode: "The agent drafts an amoxicillin order for a patient whose penicillin allergy is recorded only in a free-text note.",
    keyRisk: 0,
  },
  "HLT-PL-9": {
    l2: "Patients can view records in a portal, but agent-generated content is shown as raw clinical text",
    l4:
      "AI-generated insights are explained in plain language with multilingual support, but shared decision-making tools or the FHIR Patient Access API are " +
      "missing",
    evidence: ["patient_access_api_conformance_report", "plain_language_explanation_samples", "portal_ai_content_labels"],
    remediation:
      "Label agent-generated content in the patient portal, generate a plain-language explanation at a set reading level and expose the same data through " +
      "the Patient Access API.",
    failureMode: "The agent posts an unexplained AI risk score to the patient portal, and the patient reads it as a diagnosis.",
    keyRisk: 2,
  },
  "HLT-PL-10": {
    l2: "Documentation gaps are flagged in batch reports after discharge",
    l4: "Real-time queries and DRG impact analysis run, but physician responses and documentation quality metrics are not tracked",
    evidence: ["cdi_query_log", "physician_query_response_tracker", "documentation_quality_metrics"],
    remediation:
      "Have the agent raise CDI queries to the physician as open, non-leading questions and log each response, never inserting a diagnosis into the record " +
      "itself.",
    failureMode: "The agent inserts a sepsis diagnosis into the progress note to raise the DRG when the physician never documented it.",
    keyRisk: 0,
  },
  "HLT-PL-11": {
    l2: "Aggregate accuracy is reported after releases, with no predefined thresholds",
    l4: "Subgroup monitoring and drift triggers run, but changes are not classified as inside or outside the authorized PCCP",
    evidence: ["postmarket_subgroup_performance_report", "drift_trigger_change_assessment_log", "pccp_change_classification_record"],
    remediation:
      "Monitor subgroup performance against predefined thresholds, open a change assessment when drift fires, and require each model update to carry a " +
      "record classifying it as inside or outside the authorized PCCP.",
    failureMode:
      "The agent's model is retrained on new data that lowers sensitivity for older patients, and the update ships as routine although it falls outside the " +
      "authorized PCCP.",
    keyRisk: 4,
  },
  "HLT-PL-12": {
    l2: "A device description exists, but the intended use in labeling differs from what agent features do",
    l4: "A Sec. 807.87 checklist, software documentation and labeling change control exist, but submission exports and gap reports are assembled by hand",
    evidence: ["510k_evidence_checklist_807_87", "intended_use_labeling_feature_trace", "performance_testing_report_index"],
    remediation:
      "Trace each patient-facing CDS or triage feature to the intended use statement and labeling, and fail the release when a feature has no trace or no " +
      "performance testing record.",
    failureMode: "The agent is extended to suggest triage levels in a new care setting that the intended use and performance testing never covered.",
    keyRisk: 0,
  },
  "HLT-PL-13": {
    l2: "A hazard list exists for the main functions, but no sequences of events or foreseeable misuse are described",
    l4: "Sequences of events and misuse are modelled and linked to verified controls, but post-market signals do not update the analysis",
    evidence: ["iso14971_hazard_analysis", "sequence_of_events_model", "foreseeable_misuse_catalog"],
    remediation:
      "Add agent-specific sequences of events (stale data, hallucinated values, automation bias, dropped handoffs) to the risk analysis and link each to a " +
      "verified risk control.",
    failureMode:
      "The agent's handoff summary drops a pending critical lab result, a hazard sequence the risk analysis never considered, so no control exists to catch " +
      "it.",
    keyRisk: 3,
  },
  "HLT-PL-14": {
    l2: "Medication lists are aggregated from the EHR only, and discrepancies are not flagged",
    l4:
      "Multi-source history and structured resolution with clinician sign-off exist, but the updated list is not reliably delivered to the next provider and " +
      "the patient",
    evidence: ["medication_reconciliation_discrepancy_log", "clinician_reconciliation_signoff", "discharge_medication_list_delivery_receipt"],
    remediation:
      "Have the agent compare EHR, pharmacy-claims and patient-reported medication lists at each transition, present discrepancies for clinician resolution " +
      "and send the signed list to the next provider and the patient.",
    failureMode:
      "The agent reconciles the home medication list against a stale pharmacy record and drops a recently started anticoagulant from the discharge list.",
    keyRisk: 3,
  },
  "HLT-PL-15": {
    l2: "Requirements exist for some safety functions, with no link to tests or risk controls",
    l4: "Bidirectional traceability exists, but releases are not gated on trace completeness",
    evidence: ["software_requirements_specification", "hazard_requirement_test_trace_matrix", "release_trace_completeness_gate"],
    remediation:
      "Gate each release on a trace matrix showing every safety requirement linked to a risk control and passing verification, and flag prompt or model " +
      "changes that touch traced requirements.",
    failureMode: "The agent's prompt is edited to change dose-alert behaviour and ships without any requirement or verification test being updated.",
    keyRisk: 0,
  },
  "HLT-PL-16-v2": {
    l2: "Risk-benefit is stated in one general sentence, with no safety measures tied to the triage, CDS or coordination functions",
    l4: "State-of-the-art justification and residual-risk rationale exist, but vigilance and real-world performance data do not update them",
    evidence: ["gspr_annex_i_checklist", "state_of_the_art_benchmark", "residual_risk_acceptability_record"],
    remediation:
      "Document a risk-benefit and residual-risk rationale per automated triage, CDS or coordination function, and refresh it when vigilance or real-world " +
      "performance data change.",
    failureMode:
      "The agent's triage function runs with an under-triage residual risk that was never weighed against its benefit, so known treatment delays are " +
      "accepted by default.",
    keyRisk: 1,
  },
  "HLT-PL-17": {
    l2: "A spreadsheet maps some JCI standards to NPSGs, without evidence pointers",
    l4: "Mappings are versioned with evidence pointers and owners, but nothing alerts when accreditor standards update",
    evidence: ["jci_npsg_crosswalk_versions", "control_evidence_pointer_index", "control_owner_assignment"],
    remediation:
      "Add each agent control to the crosswalk with an evidence pointer and owner, and re-check the mappings when accreditor standards are updated or the " +
      "agent function changes.",
    failureMode: "The agent's medication reconciliation function is changed and nobody notices that it was the evidence for NPSG.06.01.01 in the crosswalk.",
    keyRisk: 3,
  },
  "HLT-PL-18": {
    l2: "A disclosure sits in the terms of service, not in the conversation",
    l4: "Disclosure appears in every channel and is stored in transcripts, but is not tested per release",
    evidence: ["ai_disclosure_per_channel_test", "transcript_disclosure_record", "voice_channel_disclosure_script"],
    remediation:
      "Inject the AI disclosure at the start of every chat, voice and SMS interaction, store it in the transcript and test each channel per release.",
    failureMode:
      "The agent's voice channel calls patients to reschedule and discuss results without saying it is an AI, so patients believe they spoke to staff.",
    keyRisk: 2,
  },
};
