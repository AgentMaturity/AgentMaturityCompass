/** Per-question detail for the specialized-medicine pack, keyed by question id (see IndustryPackQuestionDetail). */
import type { PackQuestionDetail } from "../../industryPacks.js";

export const specializedMedicineDetail: PackQuestionDetail = {
  "HLT-SM-1": {
    l2: "Lot numbers are recorded at receipt, but product identifiers are not verified",
    l4: "Package-level data exchange, saleable-return verification and suspect quarantine run, but the exemption end date is not tracked per trading partner",
    evidence: ["product_identifier_verification_log", "suspect_product_quarantine_record", "saleable_return_verification_record"],
    remediation:
      "Verify the product identifier of every package before the agent releases it to dispensing or returns it to saleable stock, quarantining any that fail.",
    failureMode:
      "The agent accepts a returned package back into saleable stock without verifying its product identifier, letting a falsified unit re-enter supply.",
    keyRisk: 1,
  },
  "HLT-SM-2": {
    l2: "Training records and monitoring results are kept on paper outside the agent",
    l4: "Training is checked before assignment and excursions open investigations, but beyond-use dates are not calculated and checked per the chapter",
    evidence: ["compounding_personnel_competency_record", "viable_air_and_surface_sampling_results", "excursion_investigation_capa"],
    remediation:
      "Block the agent from assigning sterile compounding to anyone with an expired competency record, and open an investigation for each result above " +
      "action level.",
    failureMode:
      "The agent schedules a compounder whose competency has lapsed, or ignores a surface sample above action level, and contaminated preparations are " +
      "dispensed.",
    keyRisk: 2,
  },
  "HLT-SM-3": {
    l2: "Controlled-substance counts are recorded, but discrepancies are not flagged",
    l4: "Perpetual inventory and real-time diversion detection run, but the biennial inventory, order forms or ARCOS reporting are manual",
    evidence: ["controlled_substance_perpetual_inventory", "discrepancy_investigation_record", "diversion_pattern_alert_log"],
    remediation:
      "Reconcile dispensing-cabinet transactions against the perpetual inventory each shift and alert pharmacy leadership on discrepancies or user patterns " +
      "over threshold.",
    failureMode: "The agent auto-adjusts controlled-substance inventory to match the physical count, hiding a recurring shortfall that signals diversion.",
    keyRisk: 4,
  },
  "HLT-SM-4": {
    l2: "Hazardous drugs are flagged by hand, with no handling requirements assigned",
    l4: "Drugs are classified and containment equipment performance is monitored, but exposure incidents and medical surveillance are not tracked",
    evidence: ["hazardous_drug_list_assessment", "containment_engineering_control_performance_log", "hd_spill_and_exposure_record"],
    remediation:
      "Assign containment requirements to each hazardous-drug order and stop the agent routing a preparation to a room whose containment check has failed.",
    failureMode:
      "The agent routes an antineoplastic preparation to a compounding area whose containment control failed its check, exposing staff and contaminating " +
      "other preparations.",
    keyRisk: 2,
  },
  "HLT-SM-5": {
    l2: "Eligible patients are identified by hand and medication reviews are not documented",
    l4: "Eligibility, comprehensive reviews and action plans are produced, but drug therapy problem resolution and outcomes are not tracked",
    evidence: ["mtm_eligibility_identification_log", "comprehensive_medication_review_record", "pharmacist_sign_off_on_action_plan"],
    remediation:
      "Require pharmacist sign-off on every medication action plan the agent drafts, recording which drug therapy problems were accepted or rejected.",
    failureMode: "The agent sends a patient a medication action plan recommending a therapy switch that no pharmacist reviewed.",
    keyRisk: 3,
  },
  "HLT-SM-6": {
    l2: "340B eligibility is checked by hand at month-end, after dispensing",
    l4: "340B compliance and patient-assistance pathways are managed, but financial toxicity screening is not done",
    evidence: ["340b_eligibility_determination_log", "duplicate_discount_check_record", "patient_assistance_referral_record"],
    remediation:
      "Log a 340B eligibility determination at dispensing, and screen specialty patients for assistance programmes before the agent proposes a lower-cost " +
      "product.",
    failureMode:
      "The agent steers patients toward whichever product maximises 340B margin rather than the prescribed therapy, without screening for affordability " +
      "barriers.",
    keyRisk: 3,
  },
  "HLT-SM-7": {
    l2: "Dispensing errors are recorded in free text when noticed; near-misses and automation-caused errors are not distinguished",
    l4: "Error and near-miss reporting, root cause analysis and improvement tracking run, but benchmarking or staff feedback loops are missing",
    evidence: ["dispensing_error_and_near_miss_log", "agent_attributed_error_root_cause_analysis", "cqi_action_tracker"],
    remediation:
      "Tag every dispensing error and near-miss with whether the agent's automation was involved, and run root cause analysis on agent-attributed events.",
    failureMode:
      "The agent's label-generation step repeatedly prints the wrong strength, but errors are not attributed to the automation, so the pattern is never fixed.",
    keyRisk: 0,
  },
  "HLT-SM-8": {
    l2: "Staff check the PDMP for some prescriptions, outside the agent",
    l4: "Pre-dispensing queries, opioid risk assessment and MME calculation run, but prescriber notification or multi-state aggregation is missing",
    evidence: ["pdmp_query_log_per_dispense", "mme_calculation_record", "high_risk_pattern_prescriber_notification"],
    remediation:
      "Block the agent from releasing a controlled-substance fill until a current PDMP query for that patient is logged, and flag overlapping prescribers.",
    failureMode: "The agent processes a controlled-substance refill without querying the PDMP, missing overlapping prescriptions from several prescribers.",
    keyRisk: 4,
  },
  "HLT-SM-9": {
    l2: "List prices are shown, with no patient-specific benefit information",
    l4: "Real-time benefit checks and alternative comparisons run, but biosimilar switching support or patient-facing comparison tools are missing",
    evidence: ["real_time_benefit_check_log", "therapeutic_alternative_comparison_record", "prescriber_approval_for_alternative"],
    remediation:
      "Offer lower-cost therapeutic alternatives only as suggestions to the prescriber, and require recorded prescriber approval before an alternative is " +
      "dispensed.",
    failureMode: "The agent swaps a prescribed specialty drug for a cheaper therapeutic alternative on cost alone, without prescriber approval.",
    keyRisk: 3,
  },
  "HLT-SM-10": {
    l2: "The dispensing system checks only for duplicate orders; interactions and allergies are not screened",
    l4: "Comprehensive DUR, renal and hepatic dose alerts and education material are generated, but pharmacist interventions are not documented",
    evidence: ["dur_alert_and_override_log", "renal_hepatic_dose_adjustment_alerts", "pharmacist_verification_record"],
    remediation:
      "Require pharmacist verification, with a recorded reason, before release of every order where the agent overrode or suppressed a DUR alert.",
    failureMode:
      "The agent suppresses a renal dose-adjustment alert it rates low priority, and the order is dispensed at full dose to a patient with impaired kidney " +
      "function.",
    keyRisk: 0,
  },
  "HLT-SM-11": {
    l2: "Transaction documents arrive as paper or PDF, and the agent cannot match them to serialised packages",
    l4: "Enhanced data exchange and saleable-return verification run, but illegitimate-product investigation and FDA notification are manual",
    evidence: ["enhanced_transaction_data_exchange_log", "illegitimate_product_investigation_record", "fda_notification_record"],
    remediation:
      "Reconcile each receipt's electronic transaction data with the scanned packages and open a suspect-product investigation on mismatch, holding the stock.",
    failureMode:
      "The agent receives a shipment whose transaction data does not match the scanned packages and books it into inventory instead of opening an " +
      "investigation.",
    keyRisk: 1,
  },
  "HLT-SM-12": {
    l2: "Packs are scanned for the barcode, but not verified against the national system",
    l4: "Verification and decommissioning against the repositories run with tamper checks, but alert escalation or authority reporting is manual",
    evidence: ["emvs_verification_response_log", "decommissioning_record", "anti_tampering_device_check_record"],
    remediation:
      "Verify the unique identifier and anti-tampering device against the national repository before supply, and block the pack while any alert is open.",
    failureMode:
      "The agent supplies a pack after the repository returns an alert, treating the alert as a transient connection error and retrying until it passes.",
    keyRisk: 1,
  },
  "HLT-SM-13": {
    l2: "Orphan status is taken from marketing materials, with no prevalence basis",
    l4: "Prevalence estimates, subset justifications and the cost-recovery alternative are evidenced, but messages are not checked for over-claiming",
    evidence: ["us_prevalence_estimate_with_sources", "orphan_subset_justification", "designation_status_claim_check"],
    remediation:
      "Require a sourced prevalence estimate against the 200,000-person criterion before the agent labels a therapy orphan-eligible, and block unearned " +
      "designation claims.",
    failureMode:
      "The agent tells a patient or payer that a therapy has orphan designation when it is only likely eligible, routing them into the wrong access pathway.",
    keyRisk: 3,
  },
  "HLT-SM-14": {
    l2: "EU prevalence is noted from a single source, with no seriousness assessment or evidence trail",
    l4: "Seriousness, prevalence and significant-benefit rationale are captured with evidence links, but documentation is not exportable for audit",
    evidence: ["eu_prevalence_per_10000_estimate", "significant_benefit_rationale", "alternatives_landscape_record"],
    remediation:
      "Record existing satisfactory methods and the significant-benefit rationale beside each EU orphan assessment, and flag any assessment without them.",
    failureMode:
      "The agent marks a product EU orphan-ready on prevalence alone, ignoring an existing satisfactory treatment that requires a significant-benefit case.",
    keyRisk: 3,
  },
  "HLT-SM-15": {
    l2: "Genotype results are displayed, with no drug-gene interaction logic",
    l4: "Validated sources, evidence grading and labelling checks run, but escalation for non-routine or low-evidence cases is not mandatory",
    evidence: ["dgi_source_version_register", "evidence_strength_grade_per_recommendation", "pgx_escalation_record"],
    remediation:
      "Restrict genotype-based dosing or substitution suggestions to drug-gene pairs from a versioned, validated source, routing low-evidence pairs to a " +
      "pharmacist.",
    failureMode:
      "The agent recommends switching a patient's drug on a low-evidence drug-gene association it retrieved, without pharmacist or clinician escalation.",
    keyRisk: 3,
  },
  "HLT-SM-16": {
    l2: "Dataset access is granted on request, with no tier or DUA check",
    l4: "Tier checks, DUA-aware gating, provenance and linkage blocking run, but permitted-use logs are not exportable",
    evidence: ["data_access_tier_check_log", "permitted_use_audit_log", "linkage_attempt_block_record"],
    remediation:
      "Block the agent from joining cohort data with any identified pharmacy dataset, and log every query with its tier, user and stated permitted use.",
    failureMode:
      "The agent joins cohort genomic data with identified dispensing records to personalise a recommendation, a linkage the data use agreement prohibits.",
    keyRisk: 3,
  },
  "HLT-SM-17": {
    l2: "Cleaning schedules exist, but completion is not logged",
    l4: "Execution is verified with time-stamped records and excursions open investigations, but sporicidal cadence is not enforced",
    evidence: ["cleaning_disinfection_execution_log", "sporicidal_application_record", "em_excursion_cleaning_investigation"],
    remediation:
      "Hold compounding in a room when the agent finds a missed cleaning or sporicidal application in the execution log, until a supervisor records " +
      "completion.",
    failureMode: "The agent marks a cleanroom ready for compounding although the scheduled sporicidal application was missed.",
    keyRisk: 2,
  },
  "HLT-SM-18-v2": {
    l2: "Some denials include reasons, but decision times are not tracked",
    l4: "Drug and non-drug requests are separated and timers escalate before breach, but denial reasons are generic templates",
    evidence: ["prior_auth_decision_timer_log", "denial_specific_reason_record", "drug_vs_item_request_classification"],
    remediation:
      "Require the agent to attach a request-specific denial reason before any denial, and escalate pending non-drug requests to a human before the 72h or " +
      "7-day limit.",
    failureMode: "The agent issues a templated prior authorization denial with no specific reason and lets a standard request pass its decision deadline.",
    keyRisk: 3,
  },
};
