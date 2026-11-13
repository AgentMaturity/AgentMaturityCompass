/** Per-question detail for the circular-economy pack, keyed by question id (see IndustryPackQuestionDetail). */
import type { PackQuestionDetail } from "../../industryPacks.js";

export const circularEconomyDetail: PackQuestionDetail = {
  "WLT-CE-1": {
    l2: "Activities are mapped to Taxonomy-eligible sectors by name, but technical screening criteria are not applied",
    l4: "Screening criteria and DNSH are assessed across objectives, but minimum safeguards or KPI calculation per delegated acts are incomplete",
    evidence: ["taxonomy_activity_screening_record", "dnsh_assessment_by_objective", "taxonomy_alignment_decision_log"],
    remediation: "Make the agent record a substantial-contribution test and a DNSH result for each environmental objective before it labels an activity "
      + "aligned.",
    failureMode: "The agent labels a building retrofit loan Taxonomy-aligned on substantial contribution alone, skipping the DNSH check on water and "
      + "pollution.",
    keyRisk: 0,
  },
  "WLT-CE-2": {
    l2: "Sustainability claims in product documents are checked by hand against a few portfolio metrics",
    l4: "Art. 8/9 classification and principal adverse impacts are verified, but disclosures are drafted by the agent without claim-level substantiation",
    evidence: ["sfdr_product_classification_record", "principal_adverse_impact_statement", "sustainability_claim_substantiation_log"],
    remediation: "Require each sustainability claim the agent writes into a product disclosure to cite a portfolio metric and data date, and block "
      + "publication of any unsupported claim.",
    failureMode: "The agent drafts an Article 9 fund factsheet claiming net-zero alignment that the portfolio's holdings do not support.",
    keyRisk: 0,
  },
  "WLT-CE-3": {
    l2: "Climate risk is described qualitatively for the loan book, with no scenario analysis",
    l4: "Documented scenarios cover all in-scope exposures, but results are not versioned or reruns do not reproduce reported figures",
    evidence: ["climate_scenario_definition", "exposure_transition_risk_assessment", "scenario_run_reproduction_log"],
    remediation: "Version the scenario set and input data for each climate risk run the agent performs, and fail the reporting step if a rerun does "
      + "not reproduce the reported figures.",
    failureMode: "The agent assesses a coal-heavy lending portfolio with an outdated transition scenario and reports low stranded-asset exposure.",
    keyRisk: 1,
  },
  "WLT-CE-4": {
    l2: "An exclusion list is applied, but social safeguards are not considered in alignment reporting",
    l4: "Art. 18 safeguards are checked per investee, but the evidence used and its date are not recorded with the alignment decision",
    evidence: ["minimum_safeguards_check_record", "investee_human_rights_controversy_screen", "safeguards_evidence_date_log"],
    remediation: "Withhold the Taxonomy-aligned flag until each investee's minimum-safeguards check is recorded with the evidence source and date.",
    failureMode: "The agent reports a solar manufacturer as Taxonomy-aligned despite open forced-labour allegations in its supply chain.",
    keyRisk: 0,
  },
  "WLT-CE-5": {
    l2: "ESG data is collected in spreadsheets with no consistent methodology or quality checks",
    l4: "Data is collected per GRI with quality scoring and double materiality, but primary-source validation is incomplete",
    evidence: ["esg_data_quality_score_report", "primary_source_validation_log", "double_materiality_assessment"],
    remediation: "Score each ESG data point the agent ingests for source quality, and require primary-source validation for points below a quality "
      + "threshold before they enter a report.",
    failureMode: "The agent fills missing investee emissions with a company's own press-release figure and reports it as measured data.",
    keyRisk: 2,
  },
  "WLT-CE-6": {
    l2: "Some scoring models are inventoried, but validation is informal and agentic components are not considered",
    l4: "Scoring models are validated and agentic components have documented governance, but reviews are not triggered on change",
    evidence: ["esg_scoring_model_inventory", "model_validation_report", "agentic_component_governance_record"],
    remediation: "Inventory and validate each ESG scoring model, and document scope limits, logging and human approval points for the agent's generative "
      + "components, re-reviewing both on every change.",
    failureMode: "The agent overrides a validated ESG score with its own generated rating in a portfolio recommendation, outside any model governance.",
    keyRisk: 3,
  },
  "WLT-CE-7": {
    l2: "Green bond proceeds are tracked in a ledger, but allocation is not matched to eligible project categories",
    l4: "Allocation and impact are reported, but external review and post-issuance monitoring are coordinated manually",
    evidence: ["green_bond_proceeds_allocation_register", "eligible_project_mapping", "annual_allocation_impact_report"],
    remediation: "Check every proceeds allocation the agent records against the bond's eligible project list, and reject allocations to projects "
      + "outside it.",
    failureMode: "The agent allocates green bond proceeds to a general corporate refinancing because the project code looked similar to an eligible one.",
    keyRisk: 0,
  },
  "WLT-CE-8": {
    l2: "Circularity is described in investee narratives, with no metric computed",
    l4: "Material Circularity Indicator and business-model evaluation are done, but recycled-content inputs are not validated",
    evidence: ["material_circularity_indicator_calculation", "recycled_input_validation_record", "circular_business_model_assessment"],
    remediation: "Compute the Material Circularity Indicator from validated mass-flow data, and reject investee recycled-content figures without "
      + "supplier or third-party evidence.",
    failureMode: "The agent scores an investee highly circular using a self-reported recycled-content figure that counts pre-consumer scrap.",
    keyRisk: 4,
  },
  "WLT-CE-9": {
    l2: "ESRS data points are produced, but neither source data nor a materiality decision is recorded",
    l4: "Each data point traces to its materiality decision, source data and method, but no sample is reproduced before publication",
    evidence: ["esrs_datapoint_lineage_record", "double_materiality_assessment_record", "scope3_estimation_method_log"],
    remediation: "Attach a materiality decision reference, source dataset and estimation method to every ESRS data point the agent generates, and "
      + "reproduce a sample before publication.",
    failureMode: "The agent drops a material water-use disclosure from the ESRS report because it never linked the data point to the materiality record.",
    keyRisk: 2,
  },
  "WLT-CE-10": {
    l2: "Emissions figures are computed in spreadsheets, but boundaries and methods are not documented",
    l4: "Figures reproduce from logged inputs with documented methods, but the assurance sample has open exceptions",
    evidence: ["ghg_organisational_boundary_record", "scope1_scope2_calculation_log", "assurance_sample_reproduction_report"],
    remediation: "Log every activity datum and emission factor the agent uses for scope 1 and 2, and keep a change history so an assurance provider "
      + "can recompute each figure.",
    failureMode: "The agent recomputes scope 2 with a market-based factor in one quarter and location-based in the next without noting the change.",
    keyRisk: 2,
  },
  "WLT-CE-11": {
    l2: "Scope 3 is estimated for one or two categories with no boundary documentation",
    l4: "Categories are mapped, boundaries documented and estimates quality-scored, but evidence packs and change logs are incomplete",
    evidence: ["scope3_category_coverage_map", "estimation_hierarchy_quality_score", "scope3_change_log"],
    remediation: "Map each relevant Scope 3 category, record the estimation tier and quality score for every figure the agent produces, and log each "
      + "method change.",
    failureMode: "The agent swaps supplier-specific data for spend-based estimates when supplier responses are late, cutting reported Scope 3 without "
      + "disclosure.",
    keyRisk: 2,
  },
  "WLT-CE-12": {
    l2: "Taxonomy KPIs are calculated for a few activities, with no reconciliation to financial statements",
    l4: "KPIs are mapped and reconciled, but eligibility and alignment evidence links are incomplete for some line items",
    evidence: ["taxonomy_kpi_line_item_mapping", "financial_statement_reconciliation", "eligibility_alignment_evidence_link"],
    remediation: "Map each turnover, CapEx and OpEx line to its economic activity, reconcile totals to the financial statements, and block KPI "
      + "publication when reconciliation fails.",
    failureMode: "The agent counts the same CapEx line in both eligible and aligned totals, inflating the aligned share above the financial statements.",
    keyRisk: 0,
  },
  "WLT-CE-13": {
    l2: "LCAs follow a template, but goal, scope and functional unit change between studies",
    l4: "Goal, scope, allocation and data-quality rules are controlled, but critical review is not triggered when an LCA supports an external claim",
    evidence: ["lca_goal_scope_definition", "allocation_cut_off_rule_record", "lca_critical_review_trigger_log"],
    remediation: "Require the agent to record goal, scope, functional unit and allocation rules for each LCA, and trigger critical review before any "
      + "external claim cites it.",
    failureMode: "The agent cites an LCA that allocates recycling credits twice in a public claim that a product is carbon negative.",
    keyRisk: 4,
  },
  "WLT-CE-14": {
    l2: "Circular targets are stated, but progress is not reported or linked to decisions",
    l4: "Targets are reported and benchmarked, but investment decisions are not gated on verified circular outcomes",
    evidence: ["circular_target_kpi_register", "circular_progress_report", "investment_decision_gate_record"],
    remediation: "Add a decision gate that requires verified circular-outcome data before the agent recommends an investment framed as circular.",
    failureMode: "The agent recommends further capital for a circular packaging venture whose recovery-rate targets have missed three reporting periods.",
    keyRisk: 4,
  },
  "WLT-CE-15": {
    l2: "Scope is described in a memo, but the agent's reporting outputs are not checked against it",
    l4: "A formal ESRS scope map gates outputs, but scope changes are not version-controlled with evidence",
    evidence: ["esrs_scope_map", "reporting_output_gate_result", "scope_change_control_record"],
    remediation: "Encode the ESRS scope map as a checklist the agent's report generator must satisfy, failing output when an in-scope standard or "
      + "Scope 3 disclosure is missing.",
    failureMode: "The agent generates a CSRD report omitting an in-scope social standard because the scope lived only in a memo it never read.",
    keyRisk: 2,
  },
  "WLT-CE-16": {
    l2: "Recipient size is self-declared but not checked before the agent sends requests",
    l4: "Requests to protected undertakings are limited to the cap and extra requests flagged, but size self-declarations are not retained",
    evidence: ["value_chain_request_log", "recipient_size_self_declaration", "extra_request_decline_notice_text"],
    remediation: "Check recipient headcount before the agent sends a sustainability questionnaire, limit protected recipients to the cap, and label any "
      + "extra question as optional.",
    failureMode: "The agent mails a full ESRS questionnaire to a small supplier as mandatory, presenting optional data points as required.",
    keyRisk: 2,
  },
  "WLT-CE-17": {
    l2: "Names with ESG-type terms are noted for legal review, but no check confirms an investment policy",
    l4: "The policy is checked and quarterly reviews run, but departures and their return to the policy are not recorded",
    evidence: ["fund_name_term_screen", "eighty_percent_policy_record", "quarterly_portfolio_review_log"],
    remediation: "Block the agent from proposing a fund name with ESG-type terms unless an 80% investment policy is on file, and record each quarterly "
      + "review and departure.",
    failureMode: "The agent suggests renaming a fund to include sustainable with no 80% investment policy adopted for that term.",
    keyRisk: 0,
  },
  "WLT-CE-18": {
    l2: "Workforce effects are mentioned in some investment memos, without structure",
    l4: "Each decision records an assessment against the ILO guidelines, but it is not reviewed when the decision is revisited",
    evidence: ["just_transition_assessment", "affected_worker_community_map", "decision_revisit_review_log"],
    remediation: "Add a just-transition assessment field the agent must complete for each transition-related decision, and reopen it when the decision "
      + "is revisited.",
    failureMode: "The agent recommends divesting a regional plant on emissions grounds with no assessment of the workers and community it employs.",
    keyRisk: 1,
  },
};
