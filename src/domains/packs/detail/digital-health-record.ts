/** Per-question detail for the digital-health-record pack, keyed by question id (see IndustryPackQuestionDetail). */
import type { PackQuestionDetail } from "../../industryPacks.js";

export const digitalHealthRecordDetail: PackQuestionDetail = {
  "HLT-DHR-1": {
    l2: "The agent has a named service account, but it is shared across agent instances or tools and the person it acts for is not recorded",
    l4:
      "Every EHR path carries a unique agent identity and the represented person, but emergency access is not reviewed after use or logs cannot be exported " +
      "on request",
    evidence: ["ehr_agent_service_account_register", "on_behalf_of_token_claims_sample", "break_glass_access_review_log"],
    remediation:
      "Issue each agent instance its own EHR credential and require an on-behalf-of user claim on every FHIR and batch call, rejecting calls missing either. " +
      "Wrap emergency access in a time-boxed break-glass grant that opens a post-use review ticket.",
    failureMode:
      "The agent reads charts through a shared clinician login or a pooled batch credential, so a bulk pull of PHI cannot be traced to the agent or to the " +
      "user who asked for it.",
    keyRisk: 0,
  },
  "HLT-DHR-2": {
    l2:
      "Most requests are fulfilled, but automated clients are throttled or deprioritised by default and limitations carry free-text reasons rather than a " +
      "named exception",
    l4:
      "Every limitation names a Part 171 exception and fulfilment time is measured, but parity between automated and human requests is not tested or the " +
      "HTI-5 proposal is not tracked",
    evidence: ["ehi_request_limitation_register", "part171_exception_record_sample", "ehi_request_fulfilment_time_report"],
    remediation:
      "Route every EHI request denial, delay or partial response the agent produces through a gate that requires a selected Part 171 exception and its " +
      "conditions before the limitation is sent. Measure request-to-fulfilment time separately for automated and human requesters.",
    failureMode:
      "The agent rate-limits or silently drops a third-party app's automated EHI request as suspected bot traffic and records no Part 171 exception for the " +
      "refusal.",
    keyRisk: 4,
  },
  "HLT-DHR-3": {
    l2: "Provenance is written only for creates, and the agent and source entities are free text rather than resource references",
    l4: "All agent writes carry complete Provenance, but gaps are found only by manual sampling, not by an automated check",
    evidence: ["fhir_provenance_resource_sample", "provenance_gap_check_report", "agent_write_transaction_bundle_log"],
    remediation:
      "Wrap every FHIR create, update and delete the agent issues in a transaction Bundle that must include a Provenance with Provenance.agent set to the " +
      "agent and Provenance.entity referencing each source read. Add a nightly query that flags agent-written resources without Provenance.",
    failureMode:
      "The agent merges a medication list from an outside record into the chart and writes no Provenance, so clinicians cannot tell which entries came from " +
      "the agent's reconciliation or from which source document.",
    keyRisk: 1,
  },
  "HLT-DHR-4": {
    l2: "FHIR Consent resources are recorded, but the agent does not evaluate them before it reads or shares data",
    l4:
      "Purpose-of-use Consent is enforced at the access point and patients can change it, but changes do not propagate to federated systems the agent has " +
      "already shared with",
    evidence: ["fhir_consent_resource_sample", "consent_decision_point_log", "consent_change_propagation_record"],
    remediation:
      "Call a consent decision point that evaluates the patient's FHIR Consent provisions for the requested purpose of use before every read or share the " +
      "agent performs, and block on deny or missing consent. Log the Consent version used in each decision.",
    failureMode: "The agent shares a patient's records with a research partner because a treatment-only Consent resource was treated as blanket permission.",
    keyRisk: 3,
  },
  "HLT-DHR-5": {
    l2: "Primary databases are encrypted at rest, but prompts, retrieved context and agent logs sit unencrypted in caches or vendor consoles",
    l4:
      "Every store and interface is encrypted, including model endpoints and logs, but exceptions lack a documented risk analysis or key management is " +
      "informal",
    evidence: [
      "agent_phi_data_flow_encryption_inventory", "model_endpoint_tls_and_storage_config",
      "prompt_log_encryption_at_rest_setting", "kms_key_rotation_record",
    ],
    remediation:
      "Inventory every place the agent writes PHI, including prompt caches, vector stores, tool payload logs and model-provider retention, and turn on " +
      "encryption at rest with managed keys for each. Record a risk analysis and compensating control for any store left unencrypted.",
    failureMode:
      "The agent writes full patient context into debug logs and a vector store that are stored unencrypted, exposing PHI to anyone with log or index access.",
    keyRisk: 0,
  },
  "HLT-DHR-6": {
    l2:
      "Patient summaries are exchanged with one other Member State over a bilateral or proprietary interface, and secondary-use jobs run in any available " +
      "environment",
    l4:
      "Primary-use exchange goes through the national contact point and secondary-use jobs cite a permit, but jobs can still run outside the permitted " +
      "environment or Art. 105 dates are not tracked",
    evidence: ["myhealth_eu_ncp_exchange_log", "secondary_use_data_permit_register", "secure_processing_environment_job_log"],
    remediation:
      "Before the agent starts any secondary-use processing job, require a data permit identifier and check that the job is scheduled in the environment " +
      "named on the permit, refusing jobs that fail either check. Keep the Art. 105 application dates in the gate's configuration.",
    failureMode:
      "The agent assembles a cross-border cohort for model training from primary-care records with no data permit and runs it outside the permitted " +
      "processing environment.",
    keyRisk: 0,
  },
  "HLT-DHR-7": {
    l2: "Genetic data is tagged as a separate class, but the agent can still retrieve and summarise it under ordinary PHI permissions",
    l4:
      "Genetic data has enhanced access controls and inference from non-genetic data is tested, but research-use and counselling consent are tracked manually",
    evidence: ["genetic_data_classification_tags", "genetic_inference_red_team_results", "genetic_research_consent_register"],
    remediation:
      "Tag genomic, family-history and hereditary-condition data as a separate class and deny the agent access unless the request carries a purpose " +
      "permitted for that class. Add a red-team set that checks whether the agent infers hereditary risk from non-genetic fields in outputs for insurers.",
    failureMode:
      "The agent answers an insurer-facing request by summarising a patient's family history and a BRCA result that it retrieved under general PHI access.",
    keyRisk: 2,
  },
  "HLT-DHR-8": {
    l2: "Access control is configured for the agent, but cryptographic controls and the rest of the ISO 27799 control set are not mapped to it",
    l4:
      "A statement of applicability covers the agent and its tools with implementation evidence, but it omits the model endpoints or has not been reviewed " +
      "in the last year",
    evidence: ["iso27799_statement_of_applicability_agent_scope", "health_security_control_implementation_evidence", "annual_soa_review_minutes"],
    remediation:
      "Extend the statement of applicability to name the agent, its model endpoints and each tool connector as in-scope assets with implementation evidence " +
      "per applicable control. Re-run the review yearly and whenever a new model endpoint or tool is added.",
    failureMode:
      "The agent is connected to a new third-party model endpoint and tool that sit outside the organisation's health information security control set, so " +
      "no access or cryptographic control covers them.",
    keyRisk: 0,
  },
  "HLT-DHR-9": {
    l2: "XDS.b registration and query work within one affinity domain, but required metadata is often missing or defaulted",
    l4: "XDS.b and XCA pass interoperability testing, but metadata validation errors are not logged or tracked to resolution",
    evidence: ["xds_b_xca_interoperability_test_report", "document_entry_metadata_validation_log", "xca_cross_gateway_query_trace"],
    remediation:
      "Validate every DocumentEntry the agent registers against the required XDS.b metadata before submission and reject entries with missing or defaulted " +
      "values. Add XCA cross-gateway query cases to the release test suite.",
    failureMode:
      "The agent registers discharge summaries with defaulted document metadata, so a cross-community query from the next provider does not return them and " +
      "the record looks complete when it is not.",
    keyRisk: 4,
  },
  "HLT-DHR-10": {
    l2: "Completeness is checked against a handful of data classes with no report of what is missing",
    l4: "Every record is checked against USCDI v3 and missing elements are reported by source system, but completeness rates are not tracked over time",
    evidence: ["uscdi_v3_completeness_check_report", "missing_data_element_by_source_log", "completeness_rate_trend_by_source"],
    remediation:
      "Run a USCDI v3 data-class check on every record the agent produces or exchanges and attach a missing-elements list naming the source system. Trend " +
      "completeness per source and alert when a source drops.",
    failureMode:
      "The agent sends a referral record that lacks the allergy and medication data classes and reports no gap, so the receiving clinician treats the record " +
      "as complete.",
    keyRisk: 4,
  },
  "HLT-DHR-11": {
    l2: "The agent runs under one broad role that returns whole charts for every task",
    l4: "Access is filtered by purpose of use and clinical context, but de-identification for non-treatment uses or field-level access logging is missing",
    evidence: ["purpose_of_use_access_filter_config", "field_level_phi_access_log", "non_treatment_deidentification_job_record"],
    remediation:
      "Bind each agent task type to a purpose of use and a field allowlist, and have the retrieval tool return only the allowed FHIR elements for that " +
      "purpose. Log which fields were returned per request.",
    failureMode: "The agent pulls the entire chart, including psychotherapy and HIV history, into its context to answer a billing or scheduling question.",
    keyRisk: 0,
  },
  "HLT-DHR-12": {
    l2: "A classification exists for the main use only, with no reasoning on whether the MDR/IVDR path or the Annex III path applies",
    l4:
      "Each intended purpose has a reasoned classification and the amended dates, but Art. 49 registration is not checked before market placement or dates " +
      "are not re-checked on new amending acts",
    evidence: ["ai_act_classification_record_per_intended_purpose", "art49_registration_entry", "application_date_tracking_log"],
    remediation:
      "Add a release gate that blocks enabling a new EHR agent function until a classification record for its intended purpose states the legal path and, " +
      "where Annex III applies, an Art. 49 registration reference. Store the amended application dates in that record.",
    failureMode:
      "The agent is given a new intended purpose, such as ranking patients for service eligibility, and is switched on with no classification or " +
      "registration because the original record covered only summarisation.",
    keyRisk: 1,
  },
  "HLT-DHR-13": {
    l2: "Common blocking scenarios are listed, but delays are found only through complaints",
    l4:
      "Request intake has SLAs and exception evidence bundles are generated, but limitations are not reviewed by governance or reports are not complaint-ready",
    evidence: ["ehi_request_sla_breach_report", "exception_evidence_bundle_sample", "information_blocking_governance_review_minutes"],
    remediation:
      "Instrument the agent's EHI request pipeline with SLA timers per request type and alert when a request ages past its threshold. Generate an evidence " +
      "bundle for each limitation and queue it for governance review.",
    failureMode:
      "The agent holds portal release of lab results behind a clinician-review queue with no recorded exception and no timer, so results sit unreleased for " +
      "days.",
    keyRisk: 4,
  },
  "HLT-DHR-14": {
    l2: "TLS is used on the public FHIR API, but internal and partner channels the agent calls are plaintext with no recorded decision",
    l4: "Every transmission channel enforces encryption and exceptions have a risk analysis, but configuration is not validated continuously",
    evidence: ["per_interface_tls_configuration_scan", "ephi_transmission_exception_risk_analysis", "mtls_partner_channel_inventory"],
    remediation:
      "Make the agent's outbound tool client refuse any endpoint that does not negotiate TLS at the configured minimum, and scan every interface's TLS " +
      "settings on a schedule. Record a risk analysis and compensating control for each approved exception.",
    failureMode:
      "The agent posts a referral packet to a partner's legacy endpoint over plaintext because its tool connector silently falls back when TLS negotiation " +
      "fails.",
    keyRisk: 0,
  },
  "HLT-DHR-15": {
    l2: "Agent changes to FDA-regulated records are logged with timestamps, but prior values are overwritten and administrators can edit the log",
    l4:
      "Audit trails record who, when and the prior value and cannot be edited, but retention is not tied to record retention or export for inspection is " +
      "manual",
    evidence: ["part11_audit_trail_sample_with_prior_values", "audit_trail_immutability_config", "audit_trail_retention_mapping"],
    remediation:
      "Write each agent change to an FDA-regulated record into an append-only audit table holding actor (agent or person), timestamp and prior value, with " +
      "no update or delete grant for any user. Tie its retention to the record's retention.",
    failureMode:
      "The agent corrects a value in an FDA-regulated record and the old value is overwritten, so the change cannot be reconstructed during an inspection.",
    keyRisk: 1,
  },
  "HLT-DHR-16": {
    l2: "A clinical evaluation plan exists, but agent features and claims are not linked to the evidence behind them",
    l4: "Evidence is linked to features and changes trigger evaluation updates, but post-market data is added manually and irregularly",
    evidence: ["clinical_evaluation_plan", "feature_to_clinical_evidence_trace", "post_market_signal_intake_log"],
    remediation:
      "Link each agent feature and clinical claim to its clinical evidence entry, and add a change-control hook that opens a clinical evaluation update when " +
      "a linked feature or model changes. Feed post-market complaints and incidents into the same queue.",
    failureMode:
      "The agent's model is updated to summarise new record types and ships without a clinical evaluation update, so the evaluation no longer describes what " +
      "the software does.",
    keyRisk: 1,
  },
  "HLT-DHR-17": {
    l2: "A CapabilityStatement is published, but it is hand-written and does not match what the endpoints support",
    l4: "The CapabilityStatement is versioned and tested on each release, but production exchange failures are not logged or tracked",
    evidence: ["fhir_capabilitystatement_versions", "fhir_conformance_test_results", "fhir_exchange_failure_tracker"],
    remediation:
      "Generate the CapabilityStatement from the server's configured interactions and run a conformance suite against every declared interaction on each " +
      "release, failing the release on any mismatch.",
    failureMode:
      "The agent's FHIR endpoint declares search parameters it does not implement, so client apps receive silently unfiltered or empty results and act on " +
      "them.",
    keyRisk: 4,
  },
  "HLT-DHR-18": {
    l2: "ITI-18 FindDocuments works on the happy path, but error and partial-success responses are not handled",
    l4: "ITI-18 is tested for parameters, errors and security assertions, but regression tests do not run across every connected community",
    evidence: ["iti18_stored_query_test_cases", "registry_error_list_handling_log", "xua_security_assertion_config"],
    remediation:
      "Treat ITI-18 PartialSuccess and RegistryError responses as incomplete results in the agent's retrieval tool and tell the user instead of summarising. " +
      "Add error-path cases for each community to the regression suite.",
    failureMode:
      "The agent gets a PartialSuccess response to a Registry Stored Query, treats the subset as the full document list and summarises a history missing " +
      "recent documents.",
    keyRisk: 4,
  },
  "HLT-DHR-19": {
    l2: "Interactive API calls are logged under the agent's identity, but bulk exports are logged only as a job start with no scope",
    l4: "Every access carries agent identity, user, purpose and scope, but logs are not reviewed on a schedule or anomalies have no investigation record",
    evidence: ["fhir_api_access_log_with_purpose", "bulk_export_job_scope_log", "api_access_log_review_record"],
    remediation:
      "Require purpose and scope fields on every FHIR and bulk $export request the agent makes and reject requests without them. Alert when an agent " +
      "identity exports more patients than its baseline.",
    failureMode:
      "The agent launches a bulk $export of the whole patient population for a narrow quality question and the log records only a service account and a job " +
      "id.",
    keyRisk: 0,
  },
  "HLT-DHR-20": {
    l2: "Source attributes exist for one predictive model in a static document that clinicians cannot reach from the workflow",
    l4: "Every predictive DSI has versioned source attributes, but risk management evidence is not linked per release or the HTI-5 status flag is missing",
    evidence: ["predictive_dsi_source_attribute_versions", "dsi_risk_management_evidence_per_release", "hti5_regulatory_status_flag"],
    remediation:
      "Store source attributes as versioned data tied to each model release and block deployment of a new model version until its attributes and risk " +
      "management evidence are filled in.",
    failureMode:
      "The agent surfaces a sepsis-risk score from a retrained model while the displayed source attributes still describe the previous model's training data " +
      "and validation.",
    keyRisk: 4,
  },
  "HLT-DHR-21": {
    l2: "Agent access is logged with timestamps under a service identity, without the person it acted for, and patients cannot see it",
    l4: "Each access is attributed and available to the patient, but Art. 8 restrictions are enforced by manual checks rather than by the system",
    evidence: ["patient_access_log_portal_export", "ehds_restriction_enforcement_test_results", "access_log_three_year_retention_config"],
    remediation:
      "Record provider or person, timestamp and data accessed on every agent read and expose it in the patient's access log view. Enforce patient " +
      "restrictions in the retrieval tool so restricted data is withheld without telling the provider it exists.",
    failureMode: "The agent tells a provider that some records are hidden at the patient's request, revealing the existence of a restriction the patient set.",
    keyRisk: 3,
  },
  "HLT-DHR-22": {
    l2: "Part 2 records are tagged, but the agent can summarise them into general notes without a consent check",
    l4: "Disclosures are gated on consent and carry the Sec. 2.32 notice, but segmentation is not tested or disclosures are not logged per recipient",
    evidence: ["part2_consent_scope_check_log", "sec2_32_notice_attachment_sample", "part2_segmentation_test_results"],
    remediation:
      "Gate every agent summary, route or disclosure that includes Part 2-tagged data on a matching Sec. 2.31 consent for that recipient and purpose, " +
      "attaching the Sec. 2.32 notice and consent copy automatically. Fail closed when no consent matches.",
    failureMode:
      "The agent writes substance use disorder treatment details from a Part 2 program into a discharge summary sent to an outside provider with no matching " +
      "consent or notice.",
    keyRisk: 3,
  },
};
