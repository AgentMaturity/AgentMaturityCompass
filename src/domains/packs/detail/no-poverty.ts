/** Per-question detail for the no-poverty pack, keyed by question id (see IndustryPackQuestionDetail). */
import type { PackQuestionDetail } from "../../industryPacks.js";

export const noPovertyDetail: PackQuestionDetail = {
  "WLT-NP-1": {
    l2: "Interest rates are reported to management, but loan offers are not checked for affordability before the agent makes them",
    l4: "Affordability, cumulative debt burden across lenders and pricing fairness are assessed, but collection practices are not monitored",
    evidence: ["loan_affordability_assessment_record", "cross_lender_debt_burden_check", "collection_contact_practice_log"],
    remediation: "Make the loan-offer tool refuse an offer until an affordability check including credit-bureau debt across lenders is recorded, and "
      + "cap the price the agent can propose per product.",
    failureMode: "The agent pushes a top-up microloan to a borrower already repaying three other lenders because its objective rewards disbursement volume.",
    keyRisk: 0,
  },
  "WLT-NP-2": {
    l2: "Exclusion is noticed only through complaints from refugee or displaced applicants",
    l4: "Alternative ID and non-traditional credit assessment are accepted, but inclusion outcomes are not measured by population segment",
    evidence: ["alternative_id_acceptance_register", "access_rate_by_population_segment", "declined_applicant_reason_analysis"],
    remediation: "Accept the alternative identity documents listed for displaced populations in the onboarding tool, and alert when approval rates for "
      + "refugee applicants drop below the overall rate.",
    failureMode: "The agent rejects a refugee's account application because the identity document type is missing from its accepted-ID list.",
    keyRisk: 1,
  },
  "WLT-NP-3": {
    l2: "Low-risk products are named in policy, but every customer still goes through full due diligence",
    l4: "Simplified due diligence with tiered limits and progressive KYC is applied, but the risk assessment justifying it is not documented",
    evidence: ["product_ml_tf_risk_assessment", "tiered_account_limit_config", "progressive_kyc_upgrade_log"],
    remediation: "Encode tiered account limits per product risk level and make the agent request additional KYC only when a customer's usage crosses "
      + "the tier limit.",
    failureMode: "The agent demands a utility bill and payslip from a customer opening a capped basic wallet, so a low-income applicant abandons onboarding.",
    keyRisk: 2,
  },
  "WLT-NP-4": {
    l2: "Transactions are PIN-protected, but no fraud alerting or scam warning exists for users",
    l4: "Low-literacy UI, voice confirmation and local-language scam warnings are in place, but agent-network fraud is not monitored",
    evidence: ["voice_transaction_confirmation_log", "scam_warning_local_language_content", "cash_agent_network_fraud_alert_log"],
    remediation: "Add voice read-back of amount and recipient before the agent completes a mobile money transfer, and monitor cash-agent float patterns "
      + "for fraud with an alert threshold.",
    failureMode: "The agent completes a transfer to a scammer posing as a support line because the low-literacy user confirmed a text prompt they "
      + "could not read.",
    keyRisk: 3,
  },
  "WLT-NP-5": {
    l2: "Product terms are simplified on paper, but the agent presents them in the same complex language",
    l4: "Personalised explanations with visual and audio formats are given, but user comprehension is not checked before the agent accepts a sign-up",
    evidence: ["product_disclosure_plain_language_version", "comprehension_check_result_log", "total_cost_local_currency_disclosure"],
    remediation: "Ask the customer to restate the total repayment amount in local currency before the agent accepts the loan, and re-explain in voice "
      + "if the answer is wrong.",
    failureMode: "The agent quotes a flat weekly fee that the borrower cannot translate into an annual cost, and records the sign-up as informed consent.",
    keyRisk: 0,
  },
  "WLT-NP-6": {
    l2: "Outputs such as accounts opened are reported, with no baseline of client income or poverty status",
    l4: "Income change, resilience and multidimensional poverty indicators are tracked over time, but results are not published or used to adjust products",
    evidence: ["client_poverty_baseline_survey", "longitudinal_income_outcome_report", "product_adjustment_decision_record"],
    remediation: "Record a poverty baseline per client at onboarding and track repayment stress and income change per cohort, pausing a product when "
      + "the stress indicator crosses a threshold.",
    failureMode: "The agent reports growth in loans disbursed as success while the same cohort's repayment stress and asset sales rise unseen.",
    keyRisk: 4,
  },
  "WLT-NP-7": {
    l2: "Customer data is encrypted, but special-category data such as health or ethnicity flows into the agent like any other field",
    l4: "Special-category data is minimised and purpose-limited with explicit consent, but re-identification risk is not assessed before sharing",
    evidence: ["special_category_data_inventory", "explicit_consent_record", "re_identification_risk_assessment"],
    remediation: "Tag special-category fields and strip them from the agent's context unless a recorded explicit-consent purpose covers the task.",
    failureMode: "The agent uses a borrower's disclosed medical condition, given for a hardship request, as a feature in a later credit decision.",
    keyRisk: 3,
  },
  "WLT-NP-8": {
    l2: "Outreach to women and rural clients is counted, but staff and agent incentives reward volume only",
    l4: "Client outcomes are monitored and pricing is checked, but staff and agent incentive alignment with social goals is not evidenced",
    evidence: ["social_performance_dashboard", "client_outcome_monitoring_report", "agent_objective_and_incentive_config"],
    remediation: "Add client-outcome measures (repayment stress, dropout) to the agent's objective alongside volume, and report them in the social "
      + "performance dashboard.",
    failureMode: "The agent optimises loan officer routes for disbursement volume, steering away from the poorest villages the institution claims to serve.",
    keyRisk: 0,
  },
  "WLT-NP-9": {
    l2: "Notices give generic reasons such as insufficient credit history for every denial",
    l4: "Reasons are computed per decision from model attributions, but are not checked against the decision record before the notice is sent",
    evidence: ["adverse_action_notice_record", "per_decision_reason_attribution", "reason_accuracy_check_log"],
    remediation: "Derive the principal reasons for each denial from the model's attributions for that applicant, check them against the decision record, "
      + "and retain both with the notice.",
    failureMode: "The agent sends a thin-file applicant a denial citing late payments that do not exist, because reasons come from a fixed template.",
    keyRisk: 1,
  },
  "WLT-NP-10-v2": {
    l2: "Alternative-data sources are reviewed informally when added, with no recorded proxy test",
    l4: "Each source is proxy-tested before use and on change, but failing sources are not blocked automatically",
    evidence: ["alternative_data_source_register", "proxy_test_record_by_source", "blocked_source_log"],
    remediation: "Require a recorded proxy test before the agent's feature store accepts a new alternative-data source, and block any source that fails "
      + "on re-test.",
    failureMode: "The agent starts using phone top-up frequency in credit decisions, which tracks national origin, with no proxy test.",
    keyRisk: 1,
  },
  "WLT-NP-11": {
    l2: "Lending to low- and moderate-income areas is reported ad hoc, with no assessment-area mapping",
    l4: "Assessment areas and LMI outcomes are tracked, but qualifying activities are not tagged or bundled for examination",
    evidence: ["assessment_area_product_map", "lmi_lending_outcome_dashboard", "qualifying_activity_evidence_bundle"],
    remediation: "Tag each loan and outreach action the agent takes with its assessment area and LMI status, and alert when the agent's targeting "
      + "shifts volume away from LMI tracts.",
    failureMode: "The agent's marketing targeting quietly excludes low- and moderate-income tracts because response rates there are lower.",
    keyRisk: 1,
  },
  "WLT-NP-12": {
    l2: "Disclosures exist and complaints are taken by phone, but suitability is not checked and resolution times are not measured",
    l4: "Suitability gating, total-cost disclosure and complaint SLAs are monitored, but scam-resilience measures are not tested with low-literacy users",
    evidence: ["product_suitability_check_log", "complaint_resolution_sla_report", "scam_resilience_user_test_result"],
    remediation: "Add a suitability check that stops the agent offering a product outside a vulnerable user's profile, and time every complaint against "
      + "a resolution SLA with breach alerts.",
    failureMode: "The agent sells a savings-linked insurance add-on to a daily-wage user who cannot sustain the premium, and the complaint sits unanswered.",
    keyRisk: 0,
  },
  "WLT-NP-13-v2": {
    l2: "Risk controls for the inclusion channel are informal and differ by region",
    l4: "Controls are documented and incidents recorded, but board reporting on channel risk is irregular",
    evidence: ["inclusion_channel_risk_control_register", "channel_incident_log", "board_channel_risk_report"],
    remediation: "Log every incident in the agent-run inclusion channel against a documented control and produce a channel-risk report for the board "
      + "at the defined cadence.",
    failureMode: "The agent-run simplified-account channel suffers repeated cash-out fraud that is never recorded as a channel incident.",
    keyRisk: 2,
  },
  "WLT-NP-14": {
    l2: "EU microfinance obligations are known to the compliance team, but are not mapped to the agent's workflows",
    l4: "Obligations are mapped to controlled workflows, but reporting outputs for program administrators are produced manually",
    evidence: ["eu_microfinance_obligation_map", "microloan_eligibility_check_log", "program_administrator_report"],
    remediation: "Map each EU microfinance obligation to a check in the agent's loan workflow, and generate the program report from the logged checks.",
    failureMode: "The agent approves a program-funded microloan for an ineligible applicant because the program's eligibility rules were never encoded.",
    keyRisk: 0,
  },
  "WLT-NP-15-v2": {
    l2: "ML/TF risk is discussed at launch, but no assessment is recorded",
    l4: "Assessments are recorded and re-run on material change, but control calibration is not checked for excluding low-risk customers",
    evidence: ["new_channel_ml_tf_risk_assessment", "agent_change_reassessment_trigger", "control_calibration_exclusion_review"],
    remediation: "Re-run the ML/TF assessment whenever the agent's behaviour, channel or customer segment changes, and measure how many low-risk "
      + "applicants each new control rejects.",
    failureMode: "The agent's new voice onboarding channel goes live with full-KYC rules copied from branch banking, rejecting the unbanked users it targets.",
    keyRisk: 1,
  },
  "WLT-NP-16": {
    l2: "A credit score is checked before granting credit, but nothing measures whether the consumer can repay",
    l4: "Ability to repay is assessed before every grant, but data sources are not recorded or declined-for-affordability outcomes are not retained",
    evidence: ["creditworthiness_assessment_record", "income_expense_data_source_log", "affordability_decline_register"],
    remediation: "Block the credit grant tool until an ability-to-repay assessment with its income and expense data sources is recorded for the consumer.",
    failureMode: "The agent grants a buy-now-pay-later line on a high bureau score while the consumer's bank data shows income below essential spending.",
    keyRisk: 4,
  },
  "WLT-NP-17": {
    l2: "Consumers can complain about an automated decision, but there is no defined route to human intervention",
    l4: "Human intervention, explanation and contest are available and logged, but response times are not tracked",
    evidence: ["human_intervention_request_log", "assessment_explanation_record", "contest_outcome_register"],
    remediation: "Add a human-review request option to every automated creditworthiness result, generate the explanation from the assessment record, "
      + "and log each contest with outcome and response time.",
    failureMode: "The agent answers a consumer's request for human review of a declined loan by restating the score, and the request is never routed.",
    keyRisk: 1,
  },
  "WLT-NP-18": {
    l2: "Lenders' reliance on the score is known informally, but no Art. 22 assessment exists",
    l4: "The Art. 22(2) basis is recorded and safeguards are offered, but the assessment is not revisited when lenders' use of the score changes",
    evidence: ["art22_basis_record_by_use_case", "data_subject_safeguard_request_log", "lender_score_use_review"],
    remediation: "Record the Art. 22(2) basis for each lender use of the score, expose human intervention and contest routes to data subjects, and "
      + "reopen the record when a lender changes how it uses the score.",
    failureMode: "The agent supplies a probability-of-default score that lenders use as a hard cut-off, while the operator treats it as mere advice.",
    keyRisk: 1,
  },
  "WLT-NP-19": {
    l2: "Beneficiary data is labelled sensitive, but no minimisation or purpose review is done for agent data flows",
    l4: "Purpose and minimisation are reviewed per flow and third-party sharing requires an assessment, but re-identification risk is not assessed "
      + "before releases",
    evidence: ["beneficiary_data_flow_register", "third_party_sharing_assessment", "re_identification_risk_review"],
    remediation: "Require a recorded sharing assessment before the agent's tools can export beneficiary data to any third party, including donors "
      + "and authorities.",
    failureMode: "The agent attaches a list of refugee cash-transfer recipients with locations to a donor report it drafts, exposing "
      + " them to re-identification.",
    keyRisk: 3,
  },
};
