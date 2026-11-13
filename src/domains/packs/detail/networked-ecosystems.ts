/** Per-question detail for the networked-ecosystems pack, keyed by question id (see IndustryPackQuestionDetail). */
import type { PackQuestionDetail } from "../../industryPacks.js";

export const networkedEcosystemsDetail: PackQuestionDetail = {
  "TECH-NE-1": {
    l2: "Users can raise a support ticket for product data, but there is no defined request path or response record.",
    l4: "Access by design and a logged request path exist, but some trade-secret withholding lacks a documented identification or agreed measures.",
    evidence: ["product_data_access_interface_spec", "data_access_request_response_log", "trade_secret_withholding_record"],
    remediation:
      "Ship a self-service export for product and related-service data with metadata, and require a " +
      "trade-secret identification record before the agent withholds a field.",
    failureMode:
      "The agent refuses a user's product data request by labelling the whole dataset a trade secret, without identifying it or agreeing protective measures.",
    keyRisk: 0,
  },
  "TECH-NE-2": {
    l2: "Some endpoints check the caller's token but not object ownership; there is no API inventory.",
    l4:
      "Each API Top 10 category maps to a CI test and API8 checks run per deployment, but findings are " +
      "not tracked to closure or agent-created endpoints are missing.",
    evidence: ["api_inventory_api9", "owasp_api_top10_ci_test_map", "api8_misconfiguration_scan_report"],
    remediation:
      "Generate the API inventory from the gateway, map each OWASP API Top 10 2023 category to a CI test, and run a misconfiguration scan on every deployment.",
    failureMode:
      "The agent exposes a debug endpoint with verbose errors and permissive CORS during an " +
      "integration rollout, and an outside caller harvests partner records.",
    keyRisk: 1,
  },
  "TECH-NE-3": {
    l2: "Intermediation is offered while the notification is still being prepared; reuse of intermediated data is not restricted.",
    l4: "Notification, separate legal person and technical reuse blocks are in place, but the Art. 12 condition-to-control map is not reviewed on a schedule.",
    evidence: ["dga_art11_notification_receipt", "separate_legal_person_record", "intermediated_data_reuse_block_log"],
    remediation:
      "Tag intermediated data at ingestion and enforce a policy that denies any agent query outside the intermediation service purpose, logging each denial.",
    failureMode:
      "The agent pulls intermediated partner data into the operator's own analytics features, reusing it for a purpose outside the intermediation service.",
    keyRisk: 2,
  },
  "TECH-NE-4": {
    l2: "Exports are PDF summaries or screenshots; nothing machine-readable is offered.",
    l4: "Machine-readable export covers all provided data with request logs, but direct controller-to-controller transmission is missing where feasible.",
    evidence: ["art20_export_schema", "portability_request_completion_log", "controller_to_controller_transfer_record"],
    remediation:
      "Produce Art. 20 exports in a documented JSON schema covering every provided-data category and add a " +
      "direct transmit option to a receiving controller's endpoint.",
    failureMode: "The agent answers a portability request with a PDF summary, leaving the user unable to move their data to a competing service.",
    keyRisk: 0,
  },
  "TECH-NE-5": {
    l2: "Interface descriptions live in internal wikis only and drift from the running services.",
    l4:
      "Every API has a published description and open formats, but CI does not validate descriptions against the running service or deprecations lack notice.",
    evidence: ["published_openapi_3_1_descriptions", "api_contract_test_ci_report", "api_deprecation_notice_log"],
    remediation: "Publish an OpenAPI 3.1 description for every ecosystem API and add a CI contract test that fails when the running service diverges from it.",
    failureMode:
      "The agent changes a response field in a partner API without updating the published description, " +
      "breaking every third-party integration that relied on it.",
    keyRisk: 2,
  },
  "TECH-NE-6": {
    l2: "Human logins use MFA, but no assurance level is documented for any identity class.",
    l4: "IAL, AAL and FAL are mapped and enforced with step-up, but the mapping is not re-reviewed when a new agent or federation partner is added.",
    evidence: ["identity_assurance_level_matrix", "agent_workload_identity_register", "step_up_auth_test_results"],
    remediation:
      "Assign each agent and workload identity class an AAL and FAL, issue short-lived credentials to " +
      "match, and require step-up before sensitive ecosystem operations.",
    failureMode:
      "The agent authenticates to partner APIs with a long-lived shared secret at the lowest assurance " +
      "level and performs bulk exports no human identity could.",
    keyRisk: 1,
  },
  "TECH-NE-7": {
    l2: "Wallet acceptance is on the roadmap; strong-authentication flows accept proprietary methods only.",
    l4: "Wallets are accepted on every strong-authentication flow with registration on file, but acceptance is not tested against the validation mechanisms.",
    evidence: ["art5b_relying_party_registration", "wallet_acceptance_flow_inventory", "wallet_validation_test_report"],
    remediation:
      "Add EUDI Wallet presentation as an option on each strong-authentication flow and test it against the wallet validation mechanisms before release.",
    failureMode: "The agent forces a user who offers an EUDI Wallet through a proprietary identity check that collects more identity data than the flow needs.",
    keyRisk: 0,
  },
  "TECH-NE-8": {
    l2: "Ranking and access decisions are explained only on request, with no fairness assessment.",
    l4:
      "Transparency reports, non-discrimination monitoring and contest routes exist, but business-user " +
      "access audits or Art. 33 pricing transparency are missing.",
    evidence: ["ranking_access_decision_report", "business_user_access_audit", "non_discrimination_monitoring_dashboard"],
    remediation:
      "Log every ranking and access decision the agent makes for business users with its parameters, and " +
      "run a monthly disparity check across comparable business users.",
    failureMode:
      "The agent grants faster API quotas and better placement to an affiliated partner while recording nothing a rival business user could contest.",
    keyRisk: 2,
  },
  "TECH-NE-9": {
    l2: "Terms are negotiated per recipient by email; there are no standard terms and no compensation basis.",
    l4: "Standard terms and a documented compensation calculation exist per category, but deviations are not always recorded with reasons.",
    evidence: ["recipient_category_standard_terms", "compensation_calculation_sheet", "terms_deviation_register"],
    remediation:
      "Have the agent quote B2B data terms only from the standard template for the recipient category " +
      "and require a recorded reason for any compensation deviation.",
    failureMode: "The agent quotes a competitor a higher data-access fee than a comparable recipient, with no documented basis for the difference.",
    keyRisk: 2,
  },
  "TECH-NE-10": {
    l2: "PKCE is used by the newest clients, but a legacy single-page app still uses the implicit grant.",
    l4: "Every applicable RFC 9700 requirement has a conformance test, but authorization logs do not show PKCE on every request.",
    evidence: ["rfc9700_conformance_test_suite", "oauth_client_type_inventory", "authorization_pkce_log_sample"],
    remediation:
      "Reject public-client authorization requests that lack a PKCE code_challenge at the server, disable " +
      "the implicit grant, and add RFC 9700 conformance tests in CI.",
    failureMode:
      "The agent's public OAuth client obtains tokens through the implicit grant, and an intercepted " +
      "redirect lets an attacker replay them against partner APIs.",
    keyRisk: 1,
  },
  "TECH-NE-11": {
    l2: "Neutrality is stated in policy, but intermediary and commercial workloads share databases and staff access.",
    l4:
      "Separation, security measures and monitoring are enforced across services, but evidence bundles " +
      "or periodic attestations are incomplete for some partners.",
    evidence: ["intermediation_segregation_architecture", "intermediary_storage_access_log", "periodic_art12_attestation"],
    remediation:
      "Run intermediation workloads in a separate tenant with distinct credentials, and alert when any " +
      "principal from the commercial side reads intermediation storage.",
    failureMode: "The agent joins intermediated data from two partners in a shared warehouse and builds a cross-partner profile neither partner authorised.",
    keyRisk: 3,
  },
  "TECH-NE-12": {
    l2: "Ownership checks are coded in a few handlers; other endpoints trust the object id in the request.",
    l4: "Centralised authorisation covers every object access with per-endpoint tests, but decision logs lack the fields needed to reconstruct an incident.",
    evidence: ["policy_enforcement_point_config", "bola_negative_test_suite", "access_decision_log_sample"],
    remediation:
      "Move object ownership and tenant checks into one policy enforcement point, add negative tests " +
      "requesting another tenant's object ids, and log every decision.",
    failureMode: "The agent iterates object ids in a partner API call and retrieves records belonging to other tenants because ownership is never checked.",
    keyRisk: 1,
  },
  "TECH-NE-13": {
    l2: "Access is granted through manual extracts, with no record of when a request was fulfilled.",
    l4: "Secure interfaces with SLA monitoring exist, but continuity of access is not evidenced or SLA misses carry no recorded reason.",
    evidence: ["access_interface_sla_dashboard", "continuous_access_uptime_report", "access_fulfilment_audit_log"],
    remediation:
      "Instrument the access interface with per-request fulfilment timestamps and an SLA alert, and keep the audit log as evidence of no undue delay.",
    failureMode: "The agent queues a user's data access request behind batch jobs for weeks and nothing records the delay.",
    keyRisk: 0,
  },
  "TECH-NE-14-v2": {
    l2: "Data export exists, but the contract is silent on switching rights.",
    l4:
      "Written switching terms exist and exit to another provider is tested, but exit to on-premises is " +
      "untested or switching charges are not yet zero in billing.",
    evidence: ["switching_terms_contract_clause", "provider_exit_test_record", "billing_switching_charge_report"],
    remediation:
      "Run a timed exit test that moves a customer workload from the agent's platform to another provider and to on-premises, recording data completeness.",
    failureMode: "The agent stores customer data in a proprietary format with no tested export, so a customer attempting to switch is effectively locked in.",
    keyRisk: 4,
  },
  "TECH-NE-15-v2": {
    l2: "Third-party sharing happens through bespoke engineering requests with no standard path.",
    l4: "Self-service sharing with technical purpose restriction exists, but recipient-side use is not fully logged.",
    evidence: ["third_party_share_authorisation_record", "recipient_purpose_restriction_policy", "recipient_use_log"],
    remediation:
      "When the agent receives Data Act data as a recipient, tag it with the agreed purpose and block any query or model training outside that purpose.",
    failureMode: "The agent, as a data recipient, uses product data shared for a repair service to train a pricing model outside the purpose the user agreed.",
    keyRisk: 3,
  },
  "TECH-NE-16": {
    l2: "Responses list categories in prose; specific pieces of personal information are not returned.",
    l4: "All specific pieces are returned machine-readably, but transmission to another entity is not available on request.",
    evidence: ["request_to_know_response_schema", "verifiable_request_log", "entity_transmission_record"],
    remediation:
      "Generate request-to-know responses from the data inventory as structured JSON listing every specific " +
      "piece, and offer transmission to an entity the consumer names.",
    failureMode: "The agent answers a request to know with category summaries and omits the inferred profile it built by correlating ecosystem data.",
    keyRisk: 3,
  },
  "TECH-NE-17": {
    l2: "Ecosystem suppliers are listed, but none has a security assessment.",
    l4: "Every supplier is assessed with contractual security clauses, but re-assessment on change or incident is not triggered.",
    evidence: ["ecosystem_supplier_inventory", "supplier_security_assessment", "supplier_reassessment_trigger_log"],
    remediation:
      "Block the agent from adding an ecosystem integration until the supplier has a security assessment, and re-assess on supplier incident or major change.",
    failureMode: "The agent wires in a new partner connector on its own, and that supplier's compromise opens a path into the operator's network.",
    keyRisk: 4,
  },
  "TECH-NE-18": {
    l2: "Partners are treated as processors by default; joint processing is never identified.",
    l4: "Every joint-controller relationship has an arrangement and contact point, but arrangements are not reviewed when the joint processing changes.",
    evidence: ["joint_controller_inventory", "art26_arrangement", "data_subject_contact_point_record"],
    remediation:
      "Flag any agent workflow that combines personal data with a partner for a shared purpose and require an Art. 26 arrangement id before it runs.",
    failureMode:
      "The agent co-builds an audience segment with a partner, and a data subject's access request bounces between both because neither holds responsibility.",
    keyRisk: 3,
  },
  "TECH-NE-19": {
    l2: "Offered datasets are described on marketing pages only; there is no machine-readable metadata.",
    l4: "Machine-readable descriptions exist for every dataset and access API, but they are not validated on each release.",
    evidence: ["dataset_machine_readable_description", "access_api_terms_description", "description_release_validation_report"],
    remediation:
      "Publish a machine-readable description for each offered dataset and access API, including licence, " +
      "quality and terms of use, and validate it in the release pipeline.",
    failureMode:
      "The agent offers a dataset to data-space participants with no licence or quality metadata, so " +
      "automated consumers ingest it under the wrong use restriction.",
    keyRisk: 2,
  },
};
