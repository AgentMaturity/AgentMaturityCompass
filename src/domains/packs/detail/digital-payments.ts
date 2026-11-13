/** Per-question detail for the digital-payments pack, keyed by question id (see IndustryPackQuestionDetail). */
import type { PackQuestionDetail } from "../../industryPacks.js";

export const digitalPaymentsDetail: PackQuestionDetail = {
  "WLT-DP-1": {
    l2: "Stored account data is encrypted, but transmissions or agent prompts, transcripts and logs may still carry clear-text PAN",
    l4: "Prompts, transcripts and logs are scanned for PAN on every release with no findings, but the agent components are not yet inside the PCI DSS "
      + "assessment scope",
    evidence: ["pan_scan_report_prompts_transcripts_logs", "cardholder_data_flow_diagram_agent", "pci_dss_scope_inventory_agent_components"],
    remediation: "Tokenise PAN before it reaches the agent context, redact card numbers from tool payloads and logs, and fail the release if the PAN "
      + "scanner finds a hit in any transcript.",
    failureMode: "The agent echoes a customer's full card number into a support transcript and a third-party LLM log while handling a chargeback query.",
    keyRisk: 3,
  },
  "WLT-DP-2": {
    l2: "Identity documents are collected by the agent, but verification and sanctions screening are run manually and inconsistently",
    l4: "Risk-based CDD, enhanced due diligence for PEPs and high-risk jurisdictions and ongoing monitoring run, but SAR preparation is manual and "
      + "alert dispositions are not linked to the customer risk rating",
    evidence: ["customer_identification_program_record", "edd_case_file_pep_high_risk", "transaction_monitoring_alert_disposition_log"],
    remediation: "Block account activation until CIP verification and sanctions screening pass, and route PEP or high-risk-jurisdiction customers to an "
      + "enhanced due diligence queue the agent cannot close itself.",
    failureMode: "The agent opens an account for a politically exposed person after a name-match was dismissed as a false positive with no enhanced due "
      + "diligence.",
    keyRisk: 2,
  },
  "WLT-DP-3": {
    l2: "Prohibited-basis attributes are excluded in policy, but the feature pipeline is not checked and no proxy test exists",
    l4: "Every model version has a proxy test, but remediation of flagged features is not recorded or retained with the model version",
    evidence: ["credit_model_feature_inventory", "proxy_test_result_by_model_version", "flagged_feature_remediation_record"],
    remediation: "Run a proxy test (correlation of each feature with prohibited bases) for every credit-scoring model version and block deployment "
      + "while any flagged feature has no recorded remediation.",
    failureMode: "The agent's credit score leans on postcode and device type, which act as proxies for race, and the new model version ships untested.",
    keyRisk: 1,
  },
  "WLT-DP-4": {
    l2: "Strong customer authentication is applied in one channel, but agent-initiated payments in other channels complete without it",
    l4: "Every agent-initiated payment uses an amount- and payee-specific code shown to the payer, but tests cover only one channel",
    evidence: ["sca_authentication_event_log", "authentication_code_binding_test", "post_authentication_change_rejection_log"],
    remediation: "Bind the authentication code to amount and payee, invalidate it on any change the agent makes after authentication, and test the "
      + "flow in web and app channels.",
    failureMode: "The agent edits the payee IBAN after the customer authenticated a payment, because a prompt-injected invoice told it the supplier's "
      + "bank details changed.",
    keyRisk: 0,
  },
  "WLT-DP-5": {
    l2: "Fees are published on a tariff page, but the agent does not show charges or rates before the payer confirms",
    l4: "Total cost, exchange rate markup and recurring cost projections are shown before confirmation, but fee schedules are not machine-readable or "
      + "versioned",
    evidence: ["pre_transaction_charges_disclosure_record", "fx_markup_disclosure_snapshot", "fee_schedule_version_history"],
    remediation: "Make the payment tool refuse confirmation until the agent has rendered total charges and the exchange rate from the current fee "
      + "schedule version, and store the disclosure with the transaction.",
    failureMode: "The agent confirms a cross-currency payment quoting the mid-market rate while the executed rate carries an undisclosed markup.",
    keyRisk: 3,
  },
  "WLT-DP-6": {
    l2: "Fraud review happens after authorisation on a sample of transactions",
    l4: "Behavioural models and device fingerprinting score transactions in real time, but fraud cases are not managed end to end or fed back into models",
    evidence: ["real_time_fraud_score_log", "3ds_risk_based_authentication_decision_log", "fraud_case_outcome_feedback_record"],
    remediation: "Score every transaction before authorisation and step up to 3-D Secure challenge above a risk threshold, feeding confirmed fraud "
      + "outcomes back into the model.",
    failureMode: "The agent approves a burst of card-testing transactions from one device because it checks only per-transaction amount limits.",
    keyRisk: 0,
  },
  "WLT-DP-7": {
    l2: "Payer and payee fields are filled by the agent from free text, with no check before sending",
    l4: "Incomplete transfers are held or rejected, but the rule is not documented or evidence is not retained per transfer",
    evidence: ["transfer_information_completeness_check_log", "held_transfer_queue_record", "payer_payee_field_mapping_spec"],
    remediation: "Validate payer and payee information on every transfer before the agent submits it, and hold or reject incomplete ones under a "
      + "documented rule with the outcome stored per transfer.",
    failureMode: "The agent sends a transfer with the payer address truncated because an upstream field was empty, and the bank passes it on.",
    keyRisk: 2,
  },
  "WLT-DP-8": {
    l2: "Transaction records are kept, but fraud and risk decisions are logged only as a final approve or decline",
    l4: "Each record links to the agent's inputs, rules or model version and is retained five years, but no dispute has been reconstructed from records",
    evidence: ["transaction_decision_record", "fraud_rule_version_register", "quarterly_dispute_reconstruction_test"],
    remediation: "Store the inputs, rule set or model version and outcome of every agent fraud decision with the transaction record for five years, and "
      + "reconstruct one sampled dispute per quarter.",
    failureMode: "The agent declines a merchant's payment and, in the later dispute, nobody can show which rule version fired or what data it saw.",
    keyRisk: 0,
  },
  "WLT-DP-9": {
    l2: "The main payment processor is in the register, but LLM, embedding and data APIs the agent calls are not",
    l4: "Every provider is in the register with risk assessment and contract terms, but the register is not reconciled with the agent's live dependencies",
    evidence: ["dora_register_of_information_extract", "ict_provider_risk_assessment", "agent_dependency_reconciliation_report"],
    remediation: "Generate the agent's outbound dependency list from its tool and model configuration on each release and fail the build if a provider "
      + "is missing from the DORA register.",
    failureMode: "The agent starts calling a new hosted model API added by a prompt change, and the provider never enters the register or exit plan.",
    keyRisk: 4,
  },
  "WLT-DP-10": {
    l2: "Scripts on payment pages are listed once, but there is no authorisation or integrity check",
    l4: "Authorised scripts are allow-listed with integrity hashes and CSP, but unauthorised changes are alerted, not blocked, and evidence is not bundled",
    evidence: ["payment_page_script_inventory", "script_integrity_hash_register", "unauthorised_script_change_alert_log"],
    remediation: "Allow-list payment-page scripts with SRI hashes and CSP, and block the agent from deploying any page change that adds or modifies a "
      + "script without an approval record.",
    failureMode: "The agent adds a third-party analytics tag to the checkout page during a conversion fix, opening a path for card-skimming code.",
    keyRisk: 3,
  },
  "WLT-DP-11": {
    l2: "Agent incidents are logged in the IT ticketing system, but are not classified against DORA criteria",
    l4: "Classification runs and reporting timers are enforced, but late-submission notices to the authority are not retained",
    evidence: ["ict_incident_classification_record", "major_incident_report_timer_log", "authority_submission_receipt"],
    remediation: "Classify every agent incident against DORA criteria at creation and start the 4h, 24h, 72h and one-month timers automatically when "
      + "it is classified as major.",
    failureMode: "The agent's runaway retry loop double-charges customers for hours and the incident is treated as a bug, missing the initial "
      + "notification window.",
    keyRisk: 4,
  },
  "WLT-DP-12": {
    l2: "Multi-factor authentication is used, but the authentication result is not linked to transaction details",
    l4: "Authentication is cryptographically bound to amount and payee in both channels, but tamper detection and binding audit logs are incomplete",
    evidence: ["dynamic_linking_binding_proof", "payer_confirmation_display_record", "transaction_tamper_detection_log"],
    remediation: "Sign the amount and payee into the authentication challenge, verify the signature at execution, and log a tamper event whenever the "
      + "executed values differ.",
    failureMode: "The agent reuses one authentication result to execute a second payment with a higher amount in the same session.",
    keyRisk: 0,
  },
  "WLT-DP-13-v2": {
    l2: "Verification of payee runs for some transfers, but its result is not shown to the payer",
    l4: "Close-match and no-match force a payer decision, but not-possible outcomes and their handling are not tested",
    evidence: ["verification_of_payee_result_log", "payer_mismatch_decision_record", "vop_outcome_test_suite"],
    remediation: "Call verification of payee before every euro credit transfer, show close-match and no-match to the payer, and make the agent's "
      + "authorise tool refuse after a mismatch without an explicit payer decision.",
    failureMode: "The agent authorises a supplier payment after a no-match verification result because it treats the result as a soft warning.",
    keyRisk: 0,
  },
  "WLT-DP-14": {
    l2: "Originator and beneficiary fields exist for fiat transfers only, and are often empty",
    l4: "Information is validated for fiat and crypto-asset transfers, but incomplete transfers are handled case by case without a documented policy",
    evidence: ["originator_beneficiary_validation_log", "crypto_transfer_information_record", "incomplete_transfer_handling_policy"],
    remediation: "Apply the same originator and beneficiary validation to crypto-asset transfers as to fiat, and hold or reject incomplete transfers "
      + "under a documented policy with the decision retained.",
    failureMode: "The agent routes a stablecoin transfer to an exchange without beneficiary details because its validation applies only to fiat rails.",
    keyRisk: 2,
  },
  "WLT-DP-15-v2": {
    l2: "Agent hosts are in the vulnerability scan list, but the agent's model and API dependencies are not",
    l4: "A risk-based test plan covers the agent and its dependencies with scenario tests, but testers are not independent or findings are not tracked "
      + "to closure",
    evidence: ["resilience_test_plan_agent_scope", "scenario_test_result_report", "test_finding_remediation_tracker"],
    remediation: "Add scenario tests where the agent's model provider, payment API or fraud service is slow or down, and track each finding to closure "
      + "with an owner and date.",
    failureMode: "The agent keeps queueing payments during a fraud-service outage and releases them unscored when the queue drains.",
    keyRisk: 4,
  },
  "WLT-DP-16": {
    l2: "A risk memo on credit scoring exists, but it is not a fundamental rights impact assessment",
    l4: "The assessment is versioned with the deployed system, but it is not updated when the model or affected groups change",
    evidence: ["fundamental_rights_impact_assessment", "credit_model_deployment_version_link", "fria_change_trigger_log"],
    remediation: "Block deployment of a creditworthiness model version unless a fundamental rights impact assessment tied to that version is on file, "
      + "and reopen it on every material change.",
    failureMode: "The agent's creditworthiness model is retrained on a new market segment while the impact assessment still describes the old one.",
    keyRisk: 1,
  },
  "WLT-DP-17": {
    l2: "Fees are disclosed for remittances, but the exchange rate and amount to be received are not shown before payment",
    l4: "A full disclosure is shown before payment in user-initiated flows, but agent-initiated transfers skip it or the disclosure shown is not retained",
    evidence: ["remittance_prepayment_disclosure_record", "disclosure_element_completeness_check", "agent_initiated_transfer_disclosure_log"],
    remediation: "Make the remittance tool refuse payment until a pre-payment disclosure with every applicable element is shown to the sender, for "
      + "agent-initiated transfers too, and store it with the transfer.",
    failureMode: "The agent sends a remittance on a user's chat instruction without showing the exchange rate and amount to be received before payment.",
    keyRisk: 2,
  },
};
