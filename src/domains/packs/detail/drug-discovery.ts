/** Per-question detail for the drug-discovery pack, keyed by question id (see IndustryPackQuestionDetail). */
import type { PackQuestionDetail } from "../../industryPacks.js";

export const drugDiscoveryDetail: PackQuestionDetail = {
  "HLT-DD-1": {
    l2: "Some lab systems have validation documents, but systems the agent writes to have no access or change control",
    l4: "Validation covers the agent integration and restore is tested, but periodic review is overdue or attributable-record sampling is not done",
    evidence: ["agent_integration_validation_report", "backup_restore_test_record", "computerised_system_periodic_review"],
    remediation:
      "Bring the agent's write path into each GMP system's validated scope: a dedicated agent account, input checks on every write and change control on " +
      "its connector.",
    failureMode:
      "The agent writes CMC results into a LIMS through an unvalidated connector on a shared account, so the records are neither attributable nor " +
      "input-checked.",
    keyRisk: 1,
  },
  "HLT-DD-2": {
    l2: "Operating ranges are recorded, but no design space or QRM record covers AI-proposed parameters",
    l4: "Design-space boundaries with evidence and QRM records exist, but out-of-boundary agent proposals are flagged rather than blocked",
    evidence: ["design_space_boundary_definition", "qrm_record_ai_influenced_parameter", "out_of_design_space_change_request"],
    remediation:
      "Check every agent-proposed process parameter against the documented design-space boundaries and block values outside them until change control " +
      "approves.",
    failureMode:
      "The agent recommends a granulation parameter outside the approved design space as an optimisation, and operators apply it as a routine adjustment.",
    keyRisk: 3,
  },
  "HLT-DD-3": {
    l2: "Datasets sit in shared folders with file-name conventions only, no identifiers or metadata",
    l4: "Persistent identifiers, rich metadata, machine-readable formats and provenance exist, but licence terms or automated FAIR assessment are missing",
    evidence: ["dataset_persistent_identifier_register", "assay_metadata_completeness_report", "training_data_provenance_record"],
    remediation:
      "Require a persistent identifier, assay protocol and provenance record for every dataset the agent trains on or retrieves, and reject datasets " +
      "missing them.",
    failureMode:
      "The agent trains a target-ranking model on an assay dataset with no provenance or protocol metadata, so its target hits cannot be reproduced by " +
      "another lab.",
    keyRisk: 2,
  },
  "HLT-DD-4": {
    l2: "In silico toxicity is run ad hoc on some compounds with an unrecorded tool and version",
    l4: "The M7 workflow, ADMET and structural-alert screening run on every candidate, but confidence is not calibrated against experimental results",
    evidence: ["ich_m7_mutagenicity_assessment_record", "qsar_model_applicability_domain_log", "in_silico_vs_experimental_concordance_report"],
    remediation:
      "Run every agent-generated candidate through the M7 in silico workflow before ranking, and send predictions outside a model's applicability domain to " +
      "expert review.",
    failureMode:
      "The agent ranks a generated molecule highly without mutagenicity screening, or trusts a QSAR call outside its applicability domain, hiding a toxic " +
      "structural alert.",
    keyRisk: 0,
  },
  "HLT-DD-5": {
    l2: "Contributions are mentioned in meeting notes, but agent prompts and outputs are not retained",
    l4: "AI and human contributions are logged per invention disclosure with inventorship analysis, but freedom-to-operate and prior-art checks are not linked",
    evidence: ["ai_contribution_log_per_invention", "prompt_and_output_retention_record", "inventorship_analysis_memo"],
    remediation:
      "Retain each prompt, agent output and the human edits that followed, linked to the invention disclosure, so the human contribution can be shown per " +
      "claim.",
    failureMode: "The agent's generated structure is filed with no record of which person conceived and modified it, leaving inventorship open to challenge.",
    keyRisk: 4,
  },
  "HLT-DD-6": {
    l2: "Batch records are kept, but AI-suggested parameter changes are applied without a written procedure",
    l4: "AI-recommended changes pass formal change control within the validated design space, but deviation and CAPA linkage is incomplete",
    evidence: ["batch_production_record_ai_parameter_entries", "change_control_record_ai_recommendation", "deviation_investigation_record"],
    remediation:
      "Write an AI-recommended parameter into the batch record only after approved change control, recording recommendation, approver and procedure version.",
    failureMode: "The agent adjusts a manufacturing parameter mid-batch and the batch record shows the new value with no change control or approver.",
    keyRisk: 3,
  },
  "HLT-DD-7": {
    l2: "Module 3 sections are drafted by hand from exported spreadsheets, with no cross-reference checks",
    l4: "Extraction from LIMS and ELN, cross-reference validation and completeness checks run, but human sign-off before submission is not recorded",
    evidence: ["module_3_source_data_trace", "cross_reference_validation_report", "submission_sign_off_record"],
    remediation:
      "Link every value the agent places in Module 3 to its LIMS or ELN source record and block compilation when a value has no source or differs from it.",
    failureMode: "The agent writes a specification value into Module 3 that it paraphrased or hallucinated rather than extracted from the source record.",
    keyRisk: 1,
  },
  "HLT-DD-8": {
    l2: "Model training data is described informally, with no bias check",
    l4: "Data diversity, bias testing across therapeutic areas and interpretability documentation exist, but population pharmacogenomics is not reported",
    evidence: ["training_data_diversity_assessment", "target_identification_bias_test_report", "model_methodology_disclosure"],
    remediation:
      "Test target-identification models for skew toward well-studied targets and populations, report it with each nomination and require review of skewed " +
      "ones.",
    failureMode:
      "The agent nominates targets that mirror the over-studied genes and ancestries in its training corpus, so hits fail to replicate in broader populations.",
    keyRisk: 2,
  },
  "HLT-DD-9": {
    l2: "ELN entries are user-attributed, but edits overwrite prior content without an audit trail",
    l4: "Part 11 signatures and Annex 11 audit trails are enforced, but audit trail review is manual and periodic integrity checks are not scheduled",
    evidence: ["eln_audit_trail_review_record", "agent_authored_entry_attribution_sample", "eln_backup_verification_record"],
    remediation:
      "Mark every ELN entry the agent drafts as agent-authored, require a scientist's e-signature to finalise it, and include agent entries in audit trail " +
      "review.",
    failureMode: "The agent edits an ELN experiment entry after it was witnessed, and the prior result is overwritten without a visible audit trail.",
    keyRisk: 1,
  },
  "HLT-DD-10": {
    l2: "Study protocols are stored, but raw data the agent processes is not retained in original form",
    l4: "Raw data integrity, QA audit tracking and specimen accountability are in place, but archive management and reports are not linked to the study",
    evidence: ["glp_raw_data_retention_record", "study_director_approval_of_agent_analysis", "qa_unit_inspection_report"],
    remediation:
      "Keep the raw instrument data behind every agent-processed preclinical result and require study director approval of agent analysis steps.",
    failureMode:
      "The agent summarises preclinical toxicity findings from processed data, drops an adverse histopathology finding, and the raw data to catch it is gone.",
    keyRisk: 0,
  },
  "HLT-DD-11": {
    l2: "Some AI-influenced quality decisions have a risk assessment, but formality is not matched to risk and batch-release use is unrestricted",
    l4: "Batch release is technically restricted to a Qualified Person action, but the restriction is untested or QRM formality is not risk-matched everywhere",
    evidence: ["qrm_formality_rationale_record", "qualified_person_release_action_log", "batch_release_restriction_test"],
    remediation:
      "Technically prevent the agent from setting batch status to released; only a Qualified Person action in the validated system can, tested each release.",
    failureMode: "The agent sets a batch status to released based on its own trend analysis, bypassing the Qualified Person decision.",
    keyRisk: 3,
  },
  "HLT-DD-12": {
    l2: "Quality roles exist on paper, but AI-driven changes are not handled by CAPA or change management",
    l4: "Governance, KPIs, CAPA effectiveness checks and change management for AI exist, but management review does not cover AI performance on a cadence",
    evidence: ["pqs_management_review_minutes_ai", "ai_model_change_management_record", "capa_effectiveness_check"],
    remediation:
      "Add AI model and prompt changes to the PQS change management procedure and report agent-related deviations and CAPAs at each management review.",
    failureMode:
      "The agent's CMC trend model is retrained and redeployed outside PQS change management, and management review never sees the resulting deviation spike.",
    keyRisk: 3,
  },
  "HLT-DD-13": {
    l2: "Post-approval changes are tracked, but Established Conditions are not identified",
    l4: "ECs, PACMP workflows and regional categorisation exist, but impact assessments are not tied to QRM or evidence bundles are built by hand",
    evidence: ["established_conditions_register", "pacmp_protocol", "change_reporting_category_assessment"],
    remediation:
      "Check each agent-proposed process or model change against the Established Conditions register and route EC-affecting changes to regulatory assessment.",
    failureMode: "The agent implements a process change that alters an Established Condition as a routine internal change, so no regulatory filing is made.",
    keyRisk: 3,
  },
  "HLT-DD-14": {
    l2: "Critical data fields are identified, but entries have no second check and raw data is not linked to reported results",
    l4: "Second-person or validated electronic checks and raw-data linkage are enforced, but anomaly detection and periodic review are not in place",
    evidence: ["critical_data_second_check_record", "raw_data_to_result_linkage_report", "data_storage_protection_test"],
    remediation:
      "Treat the agent as a data entry source: require a second-person or validated electronic check on each critical value it transcribes, storing the " +
      "raw-data link.",
    failureMode:
      "The agent transcribes a potency value from an instrument printout into LIMS with a misplaced decimal, and no second check catches it before release " +
      "testing.",
    keyRisk: 1,
  },
  "HLT-DD-15": {
    l2: "One or two flagship systems are validated; the ELN, LIMS and instrument interfaces the agent uses are not inventoried",
    l4: "Risk-based validation, documented checks and backup verification cover every lab system the agent uses, but configuration is not monitored",
    evidence: ["lab_computerised_system_inventory", "instrument_integration_input_output_check_log", "validation_package_eln_lims"],
    remediation:
      "Inventory every ELN, LIMS and instrument interface the agent calls with a validation risk level, and refuse tool calls to interfaces not in the " +
      "inventory.",
    failureMode:
      "The agent calls a newly added instrument export API that was never validated and ingests truncated chromatography results into the batch dataset.",
    keyRisk: 1,
  },
  "HLT-DD-16": {
    l2: "Single-factor operating ranges exist from development batches, with no multivariate study or linkage to CQAs",
    l4: "Evidence-backed boundaries linked to CQAs and CPPs with change workflows exist, but alignment to Q9 QRM and the Q10 control strategy is not shown",
    evidence: ["multivariate_doe_study_report", "cqa_cpp_linkage_matrix", "design_space_justification_report"],
    remediation:
      "Require the agent to cite the multivariate study behind each design-space boundary it uses, and refuse to extrapolate beyond the experimentally " +
      "covered region.",
    failureMode:
      "The agent extrapolates its process model beyond the region covered by development experiments and presents the result as inside the design space.",
    keyRisk: 3,
  },
  "HLT-DD-17": {
    l2: "LLM use in GMP work is discouraged informally, with no inventory of uses",
    l4:
      "Each use is classified and model-type restrictions are technically enforced, but restriction tests or qualified personnel review records are incomplete",
    evidence: ["gmp_ai_use_criticality_register", "llm_restriction_enforcement_test", "qualified_personnel_review_record"],
    remediation:
      "Classify every GMP AI use as critical or non-critical and technically block LLM tools from writing to critical GMP records, testing the block each " +
      "release.",
    failureMode: "The agent, an LLM, drafts a deviation closure that flows into a critical GMP decision with no qualified person reviewing its output.",
    keyRisk: 3,
  },
  "HLT-DD-18": {
    l2: "AI use is noted in submission drafts, with no context of use written",
    l4: "Context of use, model-risk rationale and credibility assessment exist, but lifecycle maintenance records are missing",
    evidence: ["context_of_use_statement", "model_risk_assessment", "credibility_assessment_report"],
    remediation:
      "Write a context of use and model-risk rating for each AI output used in regulatory decisions, and scale the validation set and acceptance criteria " +
      "to it.",
    failureMode:
      "The agent's safety or efficacy prediction enters a regulatory package with no defined context of use, so a model trained on biased data drives an " +
      "untested decision.",
    keyRisk: 2,
  },
};
