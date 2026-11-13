/** Per-question detail for the blockchain pack, keyed by question id (see IndustryPackQuestionDetail). */
import type { PackQuestionDetail } from "../../industryPacks.js";

export const blockchainDetail: PackQuestionDetail = {
  "WLT-BC-1": {
    l2: "MiCA obligations are listed, but no record shows which services the agent provides under which authorization",
    l4: "Prudential requirements and client asset segregation are monitored, but complaints, conflicts and outsourcing are tracked manually",
    evidence: ["casp_authorization_service_map", "client_asset_segregation_reconciliation", "prudential_requirement_monitor_log"],
    remediation: "Map each tool the agent can call to an authorized crypto-asset service, and refuse calls for services outside the authorization.",
    failureMode: "The agent starts offering crypto-asset transfer services in a member state where the firm holds no authorization for that service.",
    keyRisk: 1,
  },
  "WLT-BC-2": {
    l2: "Contracts are reviewed by reading verified source on a block explorer before interaction",
    l4: "Static and dynamic analysis and formal verification run, but runtime monitoring of contracts the agent interacts with is missing",
    evidence: ["smart_contract_static_analysis_report", "contract_interaction_allowlist", "upgrade_proxy_change_monitor_log"],
    remediation: "Restrict the agent to an allow-list of analysed contract addresses, and re-check a contract when its proxy implementation changes.",
    failureMode: "The agent approves an unlimited token allowance to a lookalike contract surfaced in a forum post, which drains the wallet.",
    keyRisk: 0,
  },
  "WLT-BC-3": {
    l2: "Travel-rule data is collected in a form, but not transmitted to the counterparty VASP",
    l4: "Data is collected and transmitted with counterparty VASP verification, but protocol interoperability and cross-jurisdiction reporting are manual",
    evidence: ["travel_rule_message_log", "counterparty_vasp_verification_record", "sunrise_jurisdiction_handling_policy"],
    remediation: "Verify the counterparty VASP before the agent sends a virtual asset transfer, and send originator and beneficiary data over a "
      + "travel-rule protocol in the same step.",
    failureMode: "The agent sends a transfer to an unverified counterparty VASP and drops travel-rule data because the protocol handshake failed.",
    keyRisk: 1,
  },
  "WLT-BC-4": {
    l2: "Token types are noted in listing notes, with no consistent classification",
    l4: "Classifications are recorded with facts and uncertain cases escalated, but are not re-run when token facts change",
    evidence: ["token_classification_record", "legal_escalation_decision_log", "token_fact_change_trigger"],
    remediation: "Record a MiCA classification with the facts relied on before the agent handles a token, and escalate uncertain cases to legal before "
      + "any listing or transfer.",
    failureMode: "The agent lists a token as a utility token while its issuer redesign makes it reference a basket of assets, with no reclassification.",
    keyRisk: 1,
  },
  "WLT-BC-5": {
    l2: "Reserve balances are reported periodically by the custodian, but composition is not checked",
    l4: "Composition and adequacy are tracked in real time, but stress tests or attestations are missing",
    evidence: ["reserve_composition_snapshot", "reserve_adequacy_ratio_log", "reserve_stress_test_report"],
    remediation: "Reconcile reserve holdings against tokens in circulation on a fixed schedule, and halt agent-initiated reserve trades when the "
      + "adequacy ratio falls below a threshold.",
    failureMode: "The agent moves reserve assets into higher-yield instruments outside the investment policy, leaving redemptions underfunded.",
    keyRisk: 3,
  },
  "WLT-BC-6": {
    l2: "Generic risk warnings are shown, but the agent's trading strategy and positions are not disclosed",
    l4: "Positions, strategy explanations and fees are visible in real time, but governance proposal impacts are not analysed for users",
    evidence: ["agent_strategy_disclosure", "real_time_position_dashboard", "fee_slippage_disclosure_log"],
    remediation: "Publish the agent's strategy parameters and live positions to users, and show expected fee and slippage before each agent trade.",
    failureMode: "The agent rebalances user funds into a thin liquidity pool with high slippage while users see only a generic risk warning.",
    keyRisk: 2,
  },
  "WLT-BC-7": {
    l2: "A restricted list exists, but the agent's orders are not checked against it",
    l4: "Orders are checked against the restricted list and manipulation patterns, but checks are not tested on each release",
    evidence: ["pre_submission_order_check_log", "restricted_list_version", "blocked_order_reason_register"],
    remediation: "Run every agent order through a pre-submission check for restricted-list hits, self-matching and front-running patterns, and log "
      + "each block with its reason.",
    failureMode: "The agent places buy orders ahead of a large client order it has seen in the queue, front-running the client.",
    keyRisk: 2,
  },
  "WLT-BC-8": {
    l2: "Exchange records exist, but orders are not linked to the agent's decision context",
    l4: "Records link to agent decisions and are retained with an extension flag, but no reconstruction is tested",
    evidence: ["order_decision_link_record", "record_retention_extension_flag", "quarterly_order_reconstruction_test"],
    remediation: "Write the agent's inputs and reasoning summary to each order and transaction record, retain five years with an authority-extension "
      + "flag, and reconstruct a sample each quarter.",
    failureMode: "The agent's suspicious order burst cannot be explained to the authority because its decision inputs were never stored with the orders.",
    keyRisk: 2,
  },
  "WLT-BC-9": {
    l2: "Travel-rule data is collected, but TFR completeness rules are not separated from MiCA obligations",
    l4: "TFR completeness is enforced and missing data rejected, but competent authority reporting is manual",
    evidence: ["tfr_completeness_rule_config", "missing_data_rejection_log", "tfr_mica_obligation_map"],
    remediation: "Encode the TFR data-completeness rules separately from MiCA service rules, and make the agent reject VASP-to-VASP transfers that fail them.",
    failureMode: "The agent passes a VASP transfer as MiCA-ready while originator data required under the transfer of funds rules is missing.",
    keyRisk: 1,
  },
  "WLT-BC-10": {
    l2: "Market abuse alerts are generated, but not on the order flow the agent arranges or executes",
    l4: "Alerts cover the agent's order flow with case records, but suspicious-order reports are not evidenced as submitted without delay",
    evidence: ["market_abuse_alert_case_record", "suspicious_order_report_submission", "agent_order_flow_surveillance_coverage"],
    remediation: "Feed the agent's order flow into market-abuse surveillance, open a case for each alert, and record the report submission time for "
      + "each reasonable suspicion.",
    failureMode: "The agent executes a client's layered spoofing orders and surveillance never sees them because agent flow bypasses the alert engine.",
    keyRisk: 2,
  },
  "WLT-BC-11": {
    l2: "Self-hosted address transfers are flagged, but ownership is not assessed",
    l4: "Ownership is assessed for each self-hosted transfer over EUR 1 000, but the method is not recorded or relies on clustering the user's history",
    evidence: ["self_hosted_ownership_assessment_record", "ownership_proof_signed_message", "transfer_value_fx_rate_log"],
    remediation: "Assess self-hosted address ownership with a signed-message proof stored with the transfer, rather than by clustering the user's "
      + "on-chain history, and value the transfer including fees and FX.",
    failureMode: "The agent infers wallet ownership by clustering a user's on-chain history and stores the linked addresses, de-anonymising unrelated "
      + "transactions.",
    keyRisk: 4,
  },
  "WLT-BC-12": {
    l2: "Outgoing transfers carry some originator data, and incoming transfers are not checked",
    l4: "Outgoing transfers are validated and incoming missing information detected, but decisions are not recorded with reasons",
    evidence: ["outgoing_transfer_validation_log", "incoming_missing_information_alert", "execute_reject_return_suspend_decision_record"],
    remediation: "Check incoming crypto-asset transfers for missing originator or beneficiary information and record each execute, reject, return "
      + "or suspend decision with its reason.",
    failureMode: "The agent credits an incoming transfer with empty originator fields to a customer account without detecting the gap.",
    keyRisk: 1,
  },
  "WLT-BC-13": {
    l2: "A commodity versus security note exists for some assets, without product-type mapping",
    l4: "CEA 1a(9) analysis and product mapping are documented, but reassessment is not scheduled",
    evidence: ["cftc_perimeter_analysis_record", "product_type_mapping", "perimeter_reassessment_log"],
    remediation: "Record a commodity-perimeter analysis before the agent offers leveraged or derivative products on a digital asset, and escalate to "
      + "legal when the analysis is uncertain.",
    failureMode: "The agent offers leveraged exposure on a digital asset to retail users with no analysis of whether it falls in the commodity perimeter.",
    keyRisk: 1,
  },
  "WLT-BC-14": {
    l2: "Promotional language is reviewed occasionally, with no structured fact intake",
    l4: "Facts are scored and communications gated, but secondary-sale context is not captured",
    evidence: ["token_distribution_fact_intake", "communication_gate_review_record", "investment_contract_risk_score"],
    remediation: "Gate every token communication the agent drafts on a risk score built from distribution, marketing and secondary-sale facts, with "
      + "legal sign-off above a threshold.",
    failureMode: "The agent drafts social posts promising price appreciation from the team's efforts for a token being sold to retail buyers.",
    keyRisk: 1,
  },
  "WLT-BC-15": {
    l2: "Citations are corrected when someone notices drift",
    l4: "Mapping is versioned and reviewed, but no automated check flags inconsistent citations",
    evidence: ["mica_article_control_map", "citation_consistency_check_result", "mapping_review_approval_log"],
    remediation: "Add an automated check that compares each control's MiCA citation to the mapped obligation and fails the pack update on mismatch.",
    failureMode: "The agent enforces a record-keeping rule where the mapped article actually covers market abuse, so the abuse control is never checked.",
    keyRisk: 1,
  },
  "WLT-BC-16": {
    l2: "Suitability questions are asked at onboarding only and never refreshed",
    l4: "Recommendations are blocked without a current assessment, but assessments are not retained with the recommendations",
    evidence: ["suitability_assessment_record", "recommendation_block_log", "assessment_staleness_check"],
    remediation: "Block crypto-asset advice and portfolio actions until a current suitability assessment exists, and store it with each recommendation.",
    failureMode: "The agent recommends a leveraged staking product to a first-time investor whose suitability record is two years old.",
    keyRisk: 2,
  },
  "WLT-BC-17": {
    l2: "Howey analysis is done for flagship tokens only, without distribution facts",
    l4: "Analyses with facts and escalations exist for every token, but are not re-run when facts change",
    evidence: ["howey_analysis_record", "us_person_offer_gate_log", "investment_contract_indicator_escalation"],
    remediation: "Block the agent from offering a token to US persons until a dated Howey analysis with distribution and marketing facts is recorded.",
    failureMode: "The agent makes a new token available to US users after the issuer launched a staking yield programme, with no fresh securities analysis.",
    keyRisk: 1,
  },
  "WLT-BC-18": {
    l2: "One threshold is applied to all non-EU corridors, and fees and FX are ignored",
    l4: "Thresholds are configured per jurisdiction with fees and FX, but split transfers are not aggregated",
    evidence: ["jurisdiction_threshold_config_version", "transfer_valuation_log", "split_transfer_aggregation_record"],
    remediation: "Configure a versioned travel-rule threshold per non-EU jurisdiction, value each transfer including fees and FX, and aggregate linked "
      + "split transfers.",
    failureMode: "The agent splits a large transfer into several just-below-threshold transfers to avoid collecting originator data.",
    keyRisk: 1,
  },
};
