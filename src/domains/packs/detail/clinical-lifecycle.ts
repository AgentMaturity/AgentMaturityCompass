/** Per-question detail for the clinical-lifecycle pack, keyed by question id (see IndustryPackQuestionDetail). */
import type { PackQuestionDetail } from "../../industryPacks.js";

export const clinicalLifecycleDetail: PackQuestionDetail = {
  "HLT-CL-1": {
    l2: "Design inputs and outputs are recorded for the core model, but there are no design reviews and prompts and tools have no design file entries",
    l4:
      "Every AI component including prompts and tool configurations has design entries, reviews and validation, but records are not yet controlled per 21 " +
      "CFR 820.35",
    evidence: ["design_history_file_index_for_agent", "prompt_and_tool_config_design_review_minutes", "design_validation_report_clinical_ai"],
    remediation:
      "Put system prompts, tool definitions and orchestration config under design control: each change gets a design input, review sign-off and validation " +
      "run.",
    failureMode:
      "The agent runs on a system prompt or tool configuration edited in production without design review, so its clinical outputs no longer match the " +
      "validated design.",
    keyRisk: 3,
  },
  "HLT-CL-2": {
    l2: "Some recommendations name a guideline in free text, without version or date",
    l4: "Every recommendation records guideline and version and superseded versions are flagged, but flagged items are not routed to a clinician",
    evidence: ["recommendation_guideline_version_log", "guideline_currency_check_report", "superseded_guideline_review_record"],
    remediation:
      "Store guideline id and version with each recommendation and run a currency check on every knowledge update that blocks recommendations citing " +
      "withdrawn versions.",
    failureMode:
      "The agent recommends a therapeutic protocol from a superseded guideline version retrieved from a stale index, and the deviation from current " +
      "practice goes unnoticed.",
    keyRisk: 1,
  },
  "HLT-CL-3": {
    l2: "Checklist items are captured digitally for some procedures, but sign-in, time-out and sign-out are not enforced as separate phases",
    l4:
      "Checklist phases are enforced and linked to the surgical schedule and implant records, but intraoperative alerts and post-operative detection are " +
      "missing",
    evidence: ["surgical_time_out_completion_log", "implant_verification_scan_record", "ai_anatomical_plan_vs_imaging_reconciliation"],
    remediation:
      "Block the agent from marking time-out complete until site, side and implant identifiers match the scheduled procedure and imaging, logging every " +
      "mismatch.",
    failureMode:
      "The agent auto-completes the time-out using a surgical plan built from the wrong side or another patient's imaging, and the mismatch reaches the " +
      "operating room.",
    keyRisk: 0,
  },
  "HLT-CL-4": {
    l2: "Adverse events the agent encounters are noted in free text, with no structured capture or report drafting",
    l4: "Candidate events are queued for human reportability decisions, but deadline tracking or trend-to-CAPA linkage is not yet evidenced",
    evidence: ["candidate_adverse_event_queue", "reportability_decision_record", "medwatch_and_vigilance_submission_log"],
    remediation:
      "Open a candidate adverse event record whenever an agent titration or device output coincides with a harm signal, routed to a human with a deadline " +
      "timer.",
    failureMode:
      "The agent silently adjusts a titration after a patient deteriorates and never raises a candidate adverse event, so a reportable incident is missed.",
    keyRisk: 4,
  },
  "HLT-CL-5": {
    l2: "Demographic fields are stored with CDS outputs, but no subgroup performance analysis has been run",
    l4:
      "Subgroup performance is monitored on a schedule against a documented threshold, but it is not re-run after each model change or reported to governance",
    evidence: ["cds_subgroup_performance_report", "disparity_threshold_definition", "bias_mitigation_action_record"],
    remediation:
      "Run a subgroup performance job after every model or prompt change and on a schedule, opening a mitigation record when a group's error rate passes " +
      "the threshold.",
    failureMode:
      "The agent keeps recommending lower-intensity treatment for one demographic group after a model update, and clinicians accept it because no subgroup " +
      "check runs.",
    keyRisk: 3,
  },
  "HLT-CL-6": {
    l2: "Some clinical decisions are logged with user attribution, but the AI recommendation shown is not captured alongside them",
    l4:
      "Recommendation, model version, clinician action and override reason are logged and tamper-evident, but e-signatures on FDA records do not meet Part 11",
    evidence: ["recommendation_display_and_override_log", "model_version_per_decision_record", "audit_trail_immutability_test"],
    remediation:
      "Log the exact recommendation text, model version and clinician accept or override reason in an append-only store at display time, and test that " +
      "users cannot edit it.",
    failureMode:
      "The agent's recommendation is not recorded next to the clinician's order, so after a harm event no one can tell whether staff followed or overrode " +
      "the AI.",
    keyRisk: 3,
  },
  "HLT-CL-7": {
    l2: "Agent code is in version control, but releases have no change documentation or assigned software safety class",
    l4: "Safety class is assigned and Clause 5 activities are performed, but the Clause 6 maintenance process and anomaly resolution tracking are incomplete",
    evidence: ["software_safety_classification_record", "software_development_plan_agent", "anomaly_resolution_log"],
    remediation:
      "Assign an IEC 62304 safety class to each agent software item, including the dose-calculation tool, and gate releases on the tests that class requires.",
    failureMode:
      "The agent ships a hotfix to its dose-calculation tool without integration or system testing because no safety class drives the release gate.",
    keyRisk: 4,
  },
  "HLT-CL-8": {
    l2: "Hazards for the AI function are listed informally, with no risk estimates or linked controls",
    l4:
      "Hazards, quantitative estimates and verified controls are maintained, but post-market evidence does not trigger risk file updates on a defined cadence",
    evidence: ["risk_management_file_ai_titration", "hazard_to_control_trace_matrix", "residual_risk_evaluation_record"],
    remediation:
      "Add agent hazards (hallucinated lab value, stale vitals, out-of-range titration step) to the risk file, each with a verified control such as a hard " +
      "dose-step limit.",
    failureMode:
      "The agent proposes a titration step larger than the safe increment because hazards such as stale vitals or a hallucinated lab value were never " +
      "analysed.",
    keyRisk: 4,
  },
  "HLT-CL-9": {
    l2: "The agent presents a single recommended treatment; alternatives appear only when the clinician asks",
    l4: "Validated decision aids and preference elicitation are used with risk communication, but decision quality is not measured",
    evidence: ["decision_aid_version_record", "patient_preference_elicitation_record", "decision_quality_measurement_results"],
    remediation:
      "Require the agent to present every guideline-supported option with absolute risk figures and record the patient's stated preference before a plan is " +
      "finalised.",
    failureMode:
      "The agent presents only its top-ranked treatment, so clinician and patient defer to the AI without weighing alternatives or the patient's preferences.",
    keyRisk: 3,
  },
  "HLT-CL-10": {
    l2: "Traditional and complementary medicine use is captured as free-text notes that the agent does not parse or check",
    l4: "Structured capture and checks against a named, dated source run with clinician review, but related adverse events are not reported",
    evidence: ["structured_cam_use_record", "herb_drug_interaction_source_version", "clinician_review_of_interaction_flags"],
    remediation:
      "Parse patient-reported herbal and traditional products into structured entries and check them against a named, dated interaction source before any " +
      "new prescription.",
    failureMode:
      "The agent ignores a patient's free-text note about an herbal product and proposes an anticoagulant without checking the herb-drug interaction.",
    keyRisk: 2,
  },
  "HLT-CL-11": {
    l2: "Complaints and incidents involving the AI function are logged, but no PMS plan defines what data is collected",
    l4: "PMS and PMCF plans exist and PMCF reports update the clinical evaluation, but claims are not traceable to specific PMCF evidence",
    evidence: ["pms_plan_ai_function", "pmcf_evaluation_report", "clinical_evaluation_update_trace"],
    remediation:
      "Feed agent performance data (override rates, protocol deviation alerts, field incidents) into a PMCF plan whose dated reports trigger a clinical " +
      "evaluation update.",
    failureMode:
      "The agent's protocol adherence degrades in the field after a data source change, and no post-market follow-up data reaches the clinical evaluation " +
      "to catch it.",
    keyRisk: 1,
  },
  "HLT-CL-12": {
    l2: "Some outputs are tested, but tests are not linked to design inputs and acceptance criteria are not written",
    l4: "Verification protocols have acceptance criteria and full traceability, but release is not blocked automatically when evidence is missing",
    evidence: ["design_verification_protocol_segmentation", "input_output_verification_trace_matrix", "verification_acceptance_criteria_record"],
    remediation:
      "Write acceptance criteria per design input, such as segmentation accuracy on a labelled test set, and block release when a trace link lacks a " +
      "passing result.",
    failureMode:
      "The agent's anatomical segmentation is released after a model update without verification, and surgical plans are built on mislabelled structures.",
    keyRisk: 0,
  },
  "HLT-CL-13": {
    l2: "Informal user feedback on agent screens is gathered, with no use-related risk scenarios",
    l4: "Summative studies with representative users are traced to risk controls, but residual use-related risk acceptance is not documented for every task",
    evidence: ["use_related_risk_scenario_list", "summative_usability_study_report", "automation_bias_task_results"],
    remediation:
      "Run summative usability tests in which representative clinicians face seeded wrong AI recommendations, and record whether they catch them.",
    failureMode:
      "The agent's interface pre-fills acceptance of its recommendations, and clinicians click through an incorrect suggestion because automation bias was " +
      "never tested.",
    keyRisk: 3,
  },
  "HLT-CL-14": {
    l2: "A few procedures exist (for example CAPA), but they do not cover the AI function or name owners",
    l4: "Integrated procedures with named owners and evidence pointers exist, but audit packs are assembled by hand and QMS effectiveness is not monitored",
    evidence: ["art_10_9_procedure_ownership_matrix", "nonconforming_ai_output_log", "ai_change_control_record"],
    remediation:
      "Route nonconforming agent outputs, such as a missed protocol deviation, into the MDR QMS nonconformity and CAPA procedure with a named owner and due " +
      "date.",
    failureMode:
      "The agent misses protocol deviations repeatedly, but the failures are handled as IT tickets outside the QMS, so no CAPA or change control follows.",
    keyRisk: 1,
  },
  "HLT-CL-15": {
    l2: "Requirements exist in tickets or documents, but are not reviewed or approved",
    l4: "Inputs are structured, approved, conflict-checked and traced, but regulatory, safety and usability coverage is not checked systematically",
    evidence: ["approved_design_input_specification", "design_input_conflict_check_report", "input_to_validation_trace_matrix"],
    remediation:
      "Write titration safety limits (maximum step, minimum interval, hold conditions) as approved, testable design inputs and trace each to a V&V result.",
    failureMode:
      "The agent's titration logic has no approved input defining the maximum dose step, so it applies a developer-chosen value with no safety margin review.",
    keyRisk: 4,
  },
  "HLT-CL-16": {
    l2: "Releases are scripted, but configuration and model weights are copied by hand with no record of what was deployed",
    l4: "Pipelines are validated and configuration baselines enforced, but production KPIs are not linked to deviation and CAPA handling",
    evidence: ["release_pipeline_validation_record", "configuration_baseline_drift_report", "production_deviation_log"],
    remediation: "Pin model weights, prompts and protocol rule files to a signed configuration baseline and open a deviation record on any production drift.",
    failureMode:
      "The agent runs in production with a protocol rule file that drifted from the validated baseline, so deviations it should flag pass unchecked.",
    keyRisk: 1,
  },
};
