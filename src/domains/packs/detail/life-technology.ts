/** Per-question detail for the life-technology pack, keyed by question id (see IndustryPackQuestionDetail). */
import type { PackQuestionDetail } from "../../industryPacks.js";

export const lifeTechnologyDetail: PackQuestionDetail = {
  "HLT-LT-1": {
    l2: "Some functions are informally labelled wellness or medical, with no IMDRF category recorded",
    l4: "Each function has an IMDRF category and clinical evaluation, but real-world performance monitoring and a predetermined change plan are missing",
    evidence: ["imdrf_samd_category_record_per_function", "intended_use_statement", "samd_clinical_evaluation_summary"],
    remediation:
      "Record an IMDRF category for every agent function and block release of any function whose outputs exceed the significance of information recorded " +
      "for it.",
    failureMode:
      "The agent starts giving condition-specific treatment advice from a function registered as general information, operating as unclassified SaMD.",
    keyRisk: 0,
  },
  "HLT-LT-2": {
    l2: "An initial risk list and a dataset inventory exist, but neither is maintained as a controlled file",
    l4: "Risk management is updated per release and datasets carry versioned bias results, but special-category use for bias detection is not logged",
    evidence: ["ai_act_risk_management_file", "dataset_bias_and_representativeness_report", "special_category_bias_detection_access_log"],
    remediation:
      "Log every access to special-category health data used for bias detection with purpose, dataset version and safeguard applied, and refuse any other " +
      "purpose.",
    failureMode:
      "The agent pulls special-category health data into a general training or analytics job under the label of bias detection, repurposing it beyond the " +
      "permitted use.",
    keyRisk: 3,
  },
  "HLT-LT-3": {
    l2: "Hazards are identified for some features, with no risk management plan or acceptability criteria",
    l4: "Quantitative estimates, verified controls and risk-benefit analysis exist, but post-production information is not fed back on a defined cadence",
    evidence: ["risk_management_plan_digital_health", "risk_acceptability_criteria", "post_production_information_review"],
    remediation:
      "Define risk acceptability criteria in a risk management plan and require each agent prediction feature to show its estimated risk against them " +
      "before release.",
    failureMode:
      "The agent releases a new symptom-risk prediction with no hazard analysis, and a false reassurance delays care for a user with a serious condition.",
    keyRisk: 4,
  },
  "HLT-LT-4": {
    l2: "Accessibility issues are fixed when users report them, with no metrics or language support plan",
    l4: "WCAG 2.1 AA, low-bandwidth and multilingual support are tested, but there is no equity impact assessment or digital literacy testing",
    evidence: ["wcag_2_1_aa_test_report", "low_bandwidth_session_completion_metrics", "digital_literacy_usability_results"],
    remediation:
      "Measure task completion by language, device class and connection quality, and block releases that drop completion for any group below a set threshold.",
    failureMode:
      "The agent's conversational flow needs high bandwidth and fluent English, so low-literacy or rural users abandon sessions and lose access to care " +
      "pathways.",
    keyRisk: 1,
  },
  "HLT-LT-5": {
    l2: "Health software is versioned, but changes are deployed without change documentation or QMS linkage",
    l4: "Safety classification, development planning and verification are integrated with the QMS, but the Clause 6 maintenance process is not evidenced",
    evidence: ["software_safety_class_rationale", "qms_linked_change_record", "software_maintenance_plan"],
    remediation:
      "Link every agent software change to a QMS change record carrying the software safety class and the risk management file entry it affects.",
    failureMode:
      "The agent's risk-scoring module is updated outside the QMS, so the change reaches users without the safety-class testing it needs.",
    keyRisk: 4,
  },
  "HLT-LT-6": {
    l2: "Access is password-controlled, but record changes are not audit-trailed",
    l4: "Audit trails, electronic signatures and access controls meet 11.10, but periodic system validation documentation is not kept current",
    evidence: ["part_11_audit_trail_sample", "electronic_signature_manifestation_record", "system_validation_summary_report"],
    remediation:
      "Make the agent write records under its own unique identity with prior values captured in a secure audit trail, and deny it any use of human " +
      "e-signatures.",
    failureMode:
      "The agent overwrites an electronic health record value with no audit trail entry, or applies a clinician's electronic signature on their behalf.",
    keyRisk: 4,
  },
  "HLT-LT-7": {
    l2: "Outputs carry a generic disclaimer, but no explanation or confidence",
    l4:
      "Feature attribution and calibrated uncertainty are shown in clinician and patient modes, but counterfactuals and transparency documentation are " +
      "incomplete",
    evidence: ["confidence_calibration_report", "patient_facing_explanation_templates", "instructions_for_use_transparency_section"],
    remediation:
      "Show calibrated confidence and the main contributing inputs with every risk prediction, and suppress alarming wording when confidence is below a " +
      "validated threshold.",
    failureMode:
      "The agent tells a consumer they may have a serious condition with no confidence or explanation, causing anxiety and needless follow-up from a weak " +
      "prediction.",
    keyRisk: 2,
  },
  "HLT-LT-8": {
    l2: "A generic vulnerability scan runs, with no SBOM or medical-device threat model",
    l4: "The SBOM includes model and tool dependencies and the threat model links to safety risk, but postmarket vulnerability monitoring is not evidenced",
    evidence: ["sbom_including_model_and_tool_dependencies", "agent_threat_model_prompt_injection", "postmarket_vulnerability_monitoring_log"],
    remediation:
      "Add the model, prompt templates and tool connectors to the SBOM and threat model, including prompt injection via ingested documents, with a test per " +
      "mitigation.",
    failureMode:
      "The agent follows instructions planted in an uploaded health document and sends the user's health data to an attacker-controlled endpoint through a " +
      "tool call.",
    keyRisk: 3,
  },
  "HLT-LT-9": {
    l2: "Model changes are logged internally, but none is assessed for regulatory impact",
    l4: "The PCCP covers every modifiable component, but change records do not consistently show the impact assessment executed per the protocol",
    evidence: ["authorized_pccp_document", "modification_protocol_execution_record", "change_outside_pccp_decision_log"],
    remediation:
      "Classify every prompt, tool and model change against the authorized PCCP before deploy, and block changes outside it until a submission decision is " +
      "recorded.",
    failureMode:
      "The agent's prompt is rewritten to add a new diagnostic claim, a change outside the authorized PCCP, and it ships with no submission decision.",
    keyRisk: 0,
  },
  "HLT-LT-10": {
    l2: "Usage and engagement data is collected, but no clinical outcome or comparator data",
    l4: "JCA scope is recorded and evidence is structured for HTA bodies, but evidence gaps are not tracked",
    evidence: ["jca_scope_assessment_record", "comparative_effectiveness_dataset", "patient_reported_outcome_dataset"],
    remediation:
      "Have the agent's outcome logging capture patient-reported outcomes and comparator data per target population, and track evidence gaps for each " +
      "population.",
    failureMode:
      "The agent's evidence pipeline records outcomes only from well-connected users, so HTA evidence omits underserved groups and access decisions leave " +
      "them out.",
    keyRisk: 1,
  },
  "HLT-LT-11": {
    l2: "Functions are assumed to be non-device CDS without a written assessment",
    l4: "Each function has a dated record per criterion and feature changes trigger re-classification, but device functions lack a defined regulatory pathway",
    evidence: ["cds_criteria_assessment_per_function", "feature_change_reclassification_trigger_log", "device_function_pathway_record"],
    remediation:
      "Re-run classification against each 520(o)(1)(E) criterion when a feature change alters inputs, time-criticality or the clinician's ability to review " +
      "the basis.",
    failureMode:
      "The agent gains a time-critical alert that clinicians cannot independently review, turning non-device CDS into device software with no " +
      "reclassification.",
    keyRisk: 0,
  },
  "HLT-LT-12": {
    l2: "Training data sources are listed, but representativeness, errors and bias are not examined",
    l4: "Representativeness and bias suites and versioned provenance exist, but error-handling workflows or exportable audit evidence are incomplete",
    evidence: ["dataset_provenance_manifest", "representativeness_by_subgroup_report", "data_error_handling_log"],
    remediation:
      "Gate each training or validation dataset on a representativeness check against the intended-purpose population, recording subgroup counts in the " +
      "manifest.",
    failureMode:
      "The agent is trained on data that under-represents older or low-income users, so its predictions are least accurate for those least able to get a " +
      "second opinion.",
    keyRisk: 1,
  },
  "HLT-LT-13": {
    l2: "Requirements exist as backlog items, with no safety class or link to risk controls",
    l4: "Requirements are controlled and traced to risk controls with coverage checks, but release is not gated on trace completeness",
    evidence: ["software_requirements_specification", "hazard_requirement_test_trace_matrix", "change_impact_analysis_record"],
    remediation:
      "Gate release on a trace check that every hazard-derived requirement for the agent links to an implementation and a passing verification test.",
    failureMode:
      "The agent ships a change that removes a safety requirement's implementation because nothing traced the hazard to the requirement and its test.",
    keyRisk: 4,
  },
  "HLT-LT-14": {
    l2: "Accuracy figures exist from internal tests, with no performance evaluation plan",
    l4: "Plan, scientific validity and analytical and clinical performance are linked to intended purpose, but post-market follow-up has no drift triggers",
    evidence: ["performance_evaluation_plan", "analytical_performance_study_report", "clinical_performance_sensitivity_specificity_record"],
    remediation:
      "Set a clinical performance target (sensitivity, specificity, predictive value in the intended population) per biomarker claim and suppress claims " +
      "that lack one.",
    failureMode:
      "The agent reads a borderline biomarker result as a positive finding with no performance evidence for that population, producing false positives and " +
      "needless tests.",
    keyRisk: 2,
  },
  "HLT-LT-15": {
    l2: "A literature summary supports the general concept, but no analytical or clinical validation of the agent exists",
    l4: "Evidence is mapped to the three components with subgroup analysis, but real-world performance does not feed back into evaluation updates",
    evidence: ["valid_clinical_association_summary", "analytical_validation_report", "clinical_validation_subgroup_results"],
    remediation:
      "Split the agent's evidence into clinical association, analytical validation and clinical validation for the intended use, and block claims missing " +
      "any of the three.",
    failureMode:
      "The agent makes outcome predictions supported only by literature on the general association, with no analytical or clinical validation of its own " +
      "outputs.",
    keyRisk: 4,
  },
  "HLT-LT-16": {
    l2: "Device data is ingested with device identity, but units and timestamps are not validated",
    l4: "Semantic, unit and time validation and provenance logs exist, but downstream clinical logic is not gated on the integrity checks",
    evidence: ["device_measurement_unit_validation_log", "time_sync_offset_report", "rejected_device_reading_audit_log"],
    remediation:
      "Quarantine device readings whose units, nomenclature code or timestamp fail validation before the agent uses them in any clinical rule.",
    failureMode: "The agent reads a glucose value in mmol/L as mg/dL from a connected meter and issues a wrong safety alert.",
    keyRisk: 4,
  },
};
