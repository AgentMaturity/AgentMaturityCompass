/** Per-question detail for the cognition-to-intelligence pack, keyed by question id (see IndustryPackQuestionDetail). */
import type { PackQuestionDetail } from "../../industryPacks.js";

export const cognitionToIntelligenceDetail: PackQuestionDetail = {
  "TECH-CI-1": {
    l2: "Free-text explanations accompany a few output types; no confidence or limitation fields, and instructions for use are an unpublished draft.",
    l4:
      "Every output type carries an explanation record enforced by a release test, but instructions " +
      "for use are not re-issued when the model or prompts change.",
    evidence: ["explanation_record_schema", "instructions_for_use_art13_3b", "release_explanation_coverage_test"],
    remediation:
      "Add a release test that enumerates every intelligence output type and fails when one ships without an " +
      "explanation record holding inputs, confidence and limitations.",
    failureMode:
      "The agent hands a deployer a risk score with no stated inputs or confidence, so the reviewer accepts an output whose known limitation applied.",
    keyRisk: 2,
  },
  "TECH-CI-2": {
    l2: "Bias checks ran once on the training set with no named metrics; special-category data was pulled for bias work without any necessity record.",
    l4:
      "Bias examination with metrics covers training, validation and testing data each release, but " +
      "special-category processing lacks access or deletion records.",
    evidence: ["dataset_bias_examination_report", "special_category_strict_necessity_record", "bias_mitigation_action_log"],
    remediation:
      "Gate each dataset version on a bias examination job that computes named group metrics on the train, " +
      "validation and test splits and blocks release above threshold.",
    failureMode:
      "The agent is retrained on a refreshed dataset that under-represents a protected group and starts " +
      "ranking that group lower, with no examination catching it.",
    keyRisk: 0,
  },
  "TECH-CI-3": {
    l2: "An AI policy exists, but no AI risk assessment covers the agent's intelligence pipelines.",
    l4:
      "Statement of applicability, internal audit and management review are on record, but " +
      "nonconformities raised against the agent are not tracked to closure.",
    evidence: ["aims_statement_of_applicability", "ai_risk_treatment_plan", "aims_internal_audit_report", "nonconformity_register"],
    remediation:
      "Write a statement of applicability mapping each Annex A control to the agent's pipelines and open a " +
      "tracked nonconformity for every control that lacks evidence.",
    failureMode:
      "The agent's retrieval sources and model are swapped in production with no AI risk assessment rerun, so a degraded inference chain ships unnoticed.",
    keyRisk: 3,
  },
  "TECH-CI-4": {
    l2: "Intended purpose is described informally for the flagship system; deployment context and applicable laws are not recorded for any system.",
    l4: "MAP records cover MAP 1.1-5.2 for every deployed system and are updated on change, but are not linked to MEASURE and MANAGE entries.",
    evidence: ["map_context_record_per_system", "impact_characterisation_worksheet", "material_change_log"],
    remediation:
      "Make a MAP 1.1 context record (purpose, users, setting, laws) a deploy precondition and reopen " +
      "it automatically whenever a material change ticket is filed.",
    failureMode:
      "The agent built for internal analytics is redeployed to score consumers without re-mapping " +
      "context, so it applies enterprise assumptions to individuals.",
    keyRisk: 1,
  },
  "TECH-CI-5": {
    l2: "Log retention is set informally; prompts, traces and inference caches keep personal data indefinitely.",
    l4: "Every store has a purpose and automated deletion, but erasure requests reach logs and caches and not fine-tuning sets, or lack completion records.",
    evidence: ["personal_data_store_inventory", "retention_deletion_job_log", "erasure_propagation_record"],
    remediation:
      "Inventory every store the inference pipeline writes (prompts, traces, vector caches, fine-tuning " +
      "sets) and attach a TTL deletion job and an erasure hook to each.",
    failureMode: "The agent retrieves an erased user profile from a stale vector cache and keeps personalising on data the user had asked to delete.",
    keyRisk: 4,
  },
  "TECH-CI-6": {
    l2: "Operators can switch personalization off globally, but nobody can review or override an individual personalization decision.",
    l4: "Every decision type has a named reviewer and logged overrides, but override outcomes are not reviewed on a documented schedule.",
    evidence: ["personalization_override_log", "decision_type_reviewer_roster", "override_outcome_review_minutes"],
    remediation:
      "Expose a per-decision override control to the named reviewer for each personalization decision type " +
      "and write every override with its reason to an append-only log.",
    failureMode: "The agent keeps pushing high-margin content to a vulnerable user and no human holds a control to override that personalization decision.",
    keyRisk: 4,
  },
  "TECH-CI-7": {
    l2: "Some material-decision recommendations carry a short explanation; there are no robustness tests and no contest route.",
    l4:
      "Explanations, robustness tests and a contestation channel exist for every decision type, but " +
      "the accountability review does not run on a fixed schedule.",
    evidence: ["robustness_perturbation_test_report", "contestation_case_log", "decision_type_transparency_sheet"],
    remediation:
      "Add a contest link to every material-decision output that opens a case with the decision id, and run " +
      "perturbation robustness tests per decision type before release.",
    failureMode: "The agent's recommendation flips under a trivial input perturbation and the affected person has no route to contest the resulting decision.",
    keyRisk: 2,
  },
  "TECH-CI-8": {
    l2: "Ad hoc prompt-injection attempts before a launch; results undocumented and no coverage of extraction, excessive agency or tool misuse.",
    l4: "The suite covers every named category and re-runs on each change, but does not block release or omits threat-model categories beyond the named four.",
    evidence: ["adversarial_test_suite_results", "agent_threat_model", "measure_2_7_release_block_record"],
    remediation:
      "Build a red-team suite for prompt injection, model extraction, excessive agency and tool misuse, run it on " +
      "every model, prompt or tool change, and fail release on regression.",
    failureMode: "The agent follows an instruction hidden in a retrieved web page and calls a write tool it was only meant to read with.",
    keyRisk: 3,
  },
  "TECH-CI-9": {
    l2: "A generic AI-generated footer appears on some outputs; applicable laws are known to staff but not listed anywhere.",
    l4:
      "Synthetic media labeling is automated and the register exists, but register entries lack an owner or review date, or some outputs carry no provenance.",
    evidence: ["synthetic_media_label_test_log", "govern_1_1_legal_requirements_register", "content_provenance_manifest"],
    remediation:
      "Stamp every generated output with a provenance manifest at the generation call, and keep a " +
      "legal-requirements register with an owner and review date per entry.",
    failureMode: "The agent inserts a generated chart image into a report with no AI label or provenance, and readers take it as measured data.",
    keyRisk: 2,
  },
  "TECH-CI-10": {
    l2: "Disclosure appears on the web chat only after several turns, or only in the terms of service.",
    l4: "Every channel discloses at first interaction with a regression test, but 'obvious from context' exceptions are not individually justified in writing.",
    evidence: ["channel_inventory_disclosure_matrix", "first_interaction_disclosure_test", "obvious_context_exception_rationale"],
    remediation:
      "Inject the AI-interaction notice into the first-turn template of every channel in the inventory " +
      "and add one regression test per channel that asserts it.",
    failureMode: "The agent answers customers by voice and email as if it were a human because disclosure was only wired into the web widget.",
    keyRisk: 2,
  },
  "TECH-CI-11": {
    l2: "Users can email support to dispute a decision, but there is no defined human intervention step for Art. 22 decisions.",
    l4: "Each request is logged with reviewer, outcome and reasons, but response times are not measured against a documented target.",
    evidence: ["art22_decision_register", "human_intervention_request_log", "contestation_outcome_record"],
    remediation:
      "Attach to every Art. 22 decision an endpoint for human intervention, viewpoint and contest, " +
      "logging reviewer, outcome, reasons and timestamps per request.",
    failureMode:
      "The agent auto-declines an applicant and the appeal loops back to the same model, so no human ever intervenes in a legally significant decision.",
    keyRisk: 0,
  },
  "TECH-CI-12": {
    l2: "Risks are listed in a spreadsheet with no owners or due dates for the actions.",
    l4: "The register is versioned and actions are wired into change and release, but no effectiveness metric is collected when an action closes.",
    evidence: ["ai_risk_opportunity_register", "risk_action_change_ticket_links", "action_effectiveness_metrics"],
    remediation:
      "Link every open AI risk action to a change or release ticket with an owner and due date, and record an effectiveness metric when the action closes.",
    failureMode:
      "The agent keeps running a hallucination-prone summarisation step after the risk was logged, " +
      "because the agreed action never reached the release process.",
    keyRisk: 3,
  },
  "TECH-CI-13": {
    l2: "Narrative explanations are logged, but inputs and transformations cannot be replayed to reproduce an output.",
    l4: "Explanations are traceable and reproducible with role views, but transparency-process templates and review records are not maintained.",
    evidence: ["explanation_replay_trace", "role_specific_explanation_views", "transparency_process_review_record"],
    remediation:
      "Persist inputs, retrieval ids, model version and seed for every output so its explanation can be " +
      "replayed, and test reproducibility on a sample each release.",
    failureMode:
      "The agent's explanation cites a source document that was never in its context, and the trace cannot be replayed to show what it actually used.",
    keyRisk: 2,
  },
  "TECH-CI-14": {
    l2: "Owners are known informally; there are no escalation thresholds for harm, drift or bias and no model-provider due diligence.",
    l4: "Thresholds, register and provider criteria exist, but the playbook has never been exercised or the register missed its annual review.",
    evidence: ["ai_raci_matrix", "escalation_trigger_thresholds", "model_provider_due_diligence_file", "incident_playbook_exercise_record"],
    remediation:
      "Define numeric escalation triggers for harm, drift and bias that page a named owner, and run one " +
      "tabletop exercise of the AI incident playbook with records.",
    failureMode:
      "The agent's output drift crosses a harmful level with no trigger threshold or named owner, so it keeps serving degraded intelligence for weeks.",
    keyRisk: 3,
  },
  "TECH-CI-15-v2": {
    l2: "Visible labels appear on generated images only; nothing machine-readable is embedded in any modality.",
    l4: "Every modality is marked and detection is tested, but marking is stripped on an export or API path, or the Code of Practice mapping is missing.",
    evidence: ["modality_marking_detection_test", "export_path_marking_survival_test", "code_of_practice_conformance_map"],
    remediation:
      "Embed a machine-readable mark at generation for each modality and test that a detector still finds it after export through every API and download path.",
    failureMode: "The agent's generated audio loses its watermark when the export API re-encodes it, so downstream platforms cannot detect it as synthetic.",
    keyRisk: 2,
  },
  "TECH-CI-16": {
    l2: "The model is called through a floating alias; the provider's documentation was read once and not retained.",
    l4: "Documentation is retained per pinned version with a significance assessment, but a model version change does not trigger re-review.",
    evidence: ["annex_xii_integrator_docs_by_version", "model_version_pin_manifest", "modification_significance_assessment"],
    remediation:
      "Pin the model by exact version id, store the provider's Annex XII documentation beside the pin, and " +
      "fail deploy when the pin changes without a re-review record.",
    failureMode:
      "The agent silently starts using a new upstream model version through a floating alias, and a capability its tasks depend on regresses unreviewed.",
    keyRisk: 3,
  },
  "TECH-CI-17": {
    l2: "Significant-decision uses are known to the team but not inventoried; no Pre-use Notice exists.",
    l4:
      "Inventory, Pre-use Notice and opt-out logging are in place, but some requests lack response timestamps or evidence is not dated before 1 January 2027.",
    evidence: ["admt_significant_decision_inventory", "pre_use_notice_delivery_log", "admt_opt_out_request_log"],
    remediation:
      "Route every ADMT opt-out into a tracked queue that records receipt and response timestamps and suppresses the agent for that consumer once honoured.",
    failureMode:
      "The agent keeps making significant decisions about a California consumer who opted out, because " +
      "the opt-out arrived by email and never reached the pipeline.",
    keyRisk: 0,
  },
  "TECH-CI-18": {
    l2: "Engineers can roll back the deployment, but overseers have no override control or stop procedure of their own.",
    l4: "Override and stop exist on every channel and are logged, but the stop procedure is not tested each release or time to halt is not recorded.",
    evidence: ["overseer_override_reverse_log", "stop_procedure_release_test", "time_to_halt_measurement"],
    remediation:
      "Give named overseers a stop control that halts the agent's queue and tool calls on every channel, and test it each release with time to halt recorded.",
    failureMode: "The agent keeps executing a batch of flawed outputs after an overseer spots the problem, because the only way to interrupt it is a redeploy.",
    keyRisk: 2,
  },
};
