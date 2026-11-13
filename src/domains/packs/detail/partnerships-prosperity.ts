/** Per-question detail for the partnerships-prosperity pack, keyed by question id (see IndustryPackQuestionDetail). */
import type { PackQuestionDetail } from "../../industryPacks.js";

export const partnershipsProsperityDetail: PackQuestionDetail = {
  "TECH-PP-1": {
    l2: "Ownership of joint outputs is discussed per project, without written allocation.",
    l4: "Ownership is tracked with agreements and AI authorship disclosure, but contribution tracking or IP conflict detection is partial.",
    evidence: ["joint_ip_ownership_agreement", "contribution_tracking_ledger", "ai_authorship_disclosure_record"],
    remediation:
      "Record every partner and AI contribution to a joint output in a contribution ledger at creation, " +
      "and check new outputs against existing IP claims before release.",
    failureMode: "The agent attributes a jointly developed design to the partner that hosts the collaboration workspace, handing that partner the IP.",
    keyRisk: 0,
  },
  "TECH-PP-2": {
    l2: "Licences of direct dependencies are listed by hand in a README.",
    l4: "Every component including generated code is recorded with compatibility gates, but attribution files are not generated.",
    evidence: ["spdx_license_expression_manifest", "license_compatibility_gate_log", "generated_snippet_provenance_scan"],
    remediation:
      "Scan generated code for matches to licensed sources, record SPDX expressions for every component, and block release when compatibility rules fail.",
    failureMode: "The agent pastes a GPL-licensed snippet into a permissively licensed partner library with no licence recorded.",
    keyRisk: 1,
  },
  "TECH-PP-3": {
    l2: "Partner participation is discussed at steering meetings without metrics.",
    l4: "Metrics, thresholds and recorded actions exist per partner, but governance reports do not reach the partners.",
    evidence: ["partner_contribution_benefit_metrics", "imbalance_threshold_definition", "imbalance_action_record"],
    remediation:
      "Compute contribution and benefit per partner each quarter and open a recorded action when any " +
      "partner, including developing-economy partners, falls below threshold.",
    failureMode:
      "The agent schedules partnership work in languages and time zones that suit the largest partners, and smaller partners' participation falls unmeasured.",
    keyRisk: 4,
  },
  "TECH-PP-4": {
    l2: "Declarations are kept in individual partners' files with no shared tracking.",
    l4: "Every declaration is linked to its standard, patent family and undertaking, but the register is not reviewed on each standard release.",
    evidence: ["etsi_ipr_declaration_register", "frand_undertaking_link", "licensing_negotiation_record"],
    remediation:
      "Link each essential IPR declaration to its standard clause, patent family and FRAND undertaking " +
      "in a register the agent checks before drafting contributions.",
    failureMode: "The agent drafts a standards contribution embodying a partner's patent without flagging the need for a timely essential IPR disclosure.",
    keyRisk: 0,
  },
  "TECH-PP-5": {
    l2: "The risk is acknowledged but not assessed, and contracts are silent on governmental access.",
    l4: "Technical, organisational and contractual measures and a procedure exist, but the request log or legal review records are incomplete.",
    evidence: ["third_country_access_risk_assessment", "government_access_request_procedure", "access_request_legal_review_log"],
    remediation:
      "Encrypt partners' non-personal data with keys held in the Union and route any third-country " +
      "access request through a written procedure with legal review.",
    failureMode:
      "The agent replicates partners' non-personal data to a third-country region where a governmental access request can reach it without legal review.",
    keyRisk: 3,
  },
  "TECH-PP-6": {
    l2: "Confidential material is marked, but nothing stops it being pasted into AI tools.",
    l4: "Inventory, AI-scope access controls and partner agreements exist, but the misappropriation response procedure has not been exercised.",
    evidence: ["trade_secret_inventory_classified", "ai_prompt_log_access_control", "partner_confidentiality_agreement"],
    remediation:
      "Classify trade secrets and apply DLP to prompts, logs and outputs of partnership AI tools so " +
      "classified content is blocked or redacted before reaching the model.",
    failureMode: "The agent includes one partner's confidential process parameters in an answer to another partner using the same collaboration assistant.",
    keyRisk: 3,
  },
  "TECH-PP-7": {
    l2: "Activity counts are reported, with no economic impact estimate.",
    l4: "SDG 17 and GRI 203 reporting are in place, but prosperity distribution across partners is not analysed.",
    evidence: ["sdg_17_16_1_monitoring_record", "gri_203_indirect_impact_report", "partner_value_distribution_analysis"],
    remediation:
      "Report GRI 203 indirect economic impacts per partner alongside activity metrics, and disclose how value created by the partnership is distributed.",
    failureMode: "The agent reports partnership success as output volume while most of the value flows to one partner, and no metric shows the imbalance.",
    keyRisk: 2,
  },
  "TECH-PP-8": {
    l2: "A lead partner is responsible in general, but individual decision types are not assigned.",
    l4: "Every decision type is assigned with a redress mechanism, but accountability is not reviewed or reported on schedule.",
    evidence: ["partnership_ai_accountability_matrix", "ai_harm_redress_case_log", "accountability_review_report"],
    remediation:
      "Assign each partnership AI decision type to a named partner in an accountability matrix the agent " +
      "reads, and refuse to execute decision types with no owner.",
    failureMode:
      "The agent executes a resource-allocation decision for the consortium that no partner owns, so the harmed partner has nobody to seek redress from.",
    keyRisk: 2,
  },
  "TECH-PP-9": {
    l2: "Generic access controls cover partnership data; AI-generated IP has no technological protection.",
    l4: "AI-specific classification, protection measures and an inventory exist, but misappropriation detection or the audit trail is partial.",
    evidence: ["ai_generated_ip_tpm_config", "misappropriation_detection_alert_log", "ip_protection_audit_trail"],
    remediation:
      "Apply technological protection measures to AI-generated partnership assets at export, and alert " +
      "when an asset is accessed outside the partner's entitlement.",
    failureMode: "The agent exports AI-generated partnership models without protection measures, and a departing partner walks away with the full asset.",
    keyRisk: 3,
  },
  "TECH-PP-10": {
    l2: "Inventions are noted in meeting minutes; inventorship and ownership are not recorded.",
    l4: "Inventorship, ownership and licence scope are recorded, but provenance logs are missing for some inventions.",
    evidence: ["invention_inventorship_record", "licence_field_of_use_scope", "model_training_provenance_log"],
    remediation:
      "Capture inventorship, ownership and licence scope at invention disclosure, and attach the agent's " +
      "contribution and model training provenance logs to each record.",
    failureMode:
      "The agent proposes the key claim of an invention but keeps no contribution log, so one partner " +
      "files alone and the others cannot show joint inventorship.",
    keyRisk: 0,
  },
  "TECH-PP-11": {
    l2: "Some performer releases are on file, but AI voice tools are used without checking them.",
    l4: "Every reproduction is linked to a scoped authorisation, but scope is not checked before every use.",
    evidence: ["performer_authorisation_register", "authorisation_scope_check_log", "voice_capture_use_link"],
    remediation:
      "Check the performer authorisation register for media, territory and term before the agent " +
      "reproduces or trains on a fixed performance, blocking on no match.",
    failureMode: "The agent clones a session musician's recorded performance into a new partner track without any authorisation covering that use.",
    keyRisk: 2,
  },
  "TECH-PP-12": {
    l2: "Trade secrets are identified ad hoc, only after a recipient asks for data.",
    l4: "Identification and gating exist per recipient, but trade secrets in metadata are missed or some gate decisions are not logged.",
    evidence: ["dataset_trade_secret_identification", "protective_measure_agreement", "disclosure_gate_decision_log"],
    remediation:
      "Gate every Data Act disclosure on a recorded protective-measure agreement for that recipient and on trade-secret tagging that includes metadata fields.",
    failureMode:
      "The agent shares a dataset whose metadata reveals a partner's proprietary formulation before any protective measures were agreed with the recipient.",
    keyRisk: 3,
  },
  "TECH-PP-13": {
    l2: "Precaution is applied informally, with the rationale scattered across emails.",
    l4: "Insufficiency triggers, templates and evidence plans exist, but review deadlines are not tracked.",
    evidence: ["sps_insufficiency_trigger_record", "provisional_measure_rationale", "measure_review_schedule"],
    remediation:
      "Mark any SPS recommendation the agent makes on insufficient evidence as provisional, attach an " +
      "information-gathering plan, and set a review date that alerts the owner.",
    failureMode:
      "The agent recommends a permanent import restriction on a developing-economy partner's produce on " +
      "thin evidence, with no provisional status or review date.",
    keyRisk: 4,
  },
  "TECH-PP-14": {
    l2: "Treaty references are generic WIPO notes attached to workflows.",
    l4: "A versioned mapping with legal review exists, but it is not used to gate AI content operations.",
    evidence: ["wct_wppt_workflow_map", "treaty_mapping_legal_review_log", "workflow_gate_check_record"],
    remediation:
      "Map each content workflow step (capture, reproduction, distribution, TPM) to the WCT or WPPT article " +
      "it implicates and gate the agent's workflow on that rights check.",
    failureMode: "The agent treats a performer's recording as a pure authors'-rights asset and skips the neighbouring-rights check the workflow needed.",
    keyRisk: 0,
  },
  "TECH-PP-15-v2": {
    l2: "An SBOM is assembled manually for major releases only.",
    l4: "A machine-readable SBOM per build covers transitive dependencies, but lacks component hashes or the build does not fail when generation fails.",
    evidence: ["build_sbom_machine_readable", "sbom_component_hash_list", "sbom_generation_build_gate"],
    remediation: "Generate a machine-readable SBOM in each build the agent triggers, include component hashes, and fail the build when SBOM generation fails.",
    failureMode: "The agent assembles a release with an untracked transitive dependency and ships no SBOM that would reveal it.",
    keyRisk: 1,
  },
  "TECH-PP-16": {
    l2: "Actively exploited vulnerabilities reach the security team informally, with no owner.",
    l4: "A timed workflow with an early-warning template exists, but no timed rehearsal is on record.",
    evidence: ["exploited_vulnerability_detection_alert", "early_warning_submission_record", "reporting_rehearsal_timing"],
    remediation:
      "Connect exploitation detection to a workflow that starts a 24-hour timer and pre-fills the early-warning template for the single reporting platform.",
    failureMode: "The agent quietly patches an actively exploited vulnerability in a partner product and never triggers the 24-hour early warning.",
    keyRisk: 1,
  },
  "TECH-PP-17": {
    l2: "Incidents are shared in a partner channel with no list of who must be told.",
    l4: "A matrix exists and incident records show who was informed, but the matrix is not reviewed after incidents.",
    evidence: ["incident_communication_matrix", "incident_notification_record", "affected_community_channel_list"],
    remediation:
      "Maintain a matrix of every partner AI actor and affected-community channel, and have the incident workflow record each notification sent against it.",
    failureMode:
      "The agent corrupts shared partnership data and only the operating partner is told, leaving downstream partners and communities on bad outputs.",
    keyRisk: 4,
  },
  "TECH-PP-18": {
    l2: "Partners assert secure development practices without evidence.",
    l4: "SP 800-218A practices are mapped per model release with evidence, but gaps are not tracked or partner attestations are missing.",
    evidence: ["sp800_218a_practice_evidence_map", "model_release_gap_tracker", "partner_ssdf_attestation"],
    remediation:
      "Require each partner model release to arrive with SP 800-218A practice-level evidence, and refuse to load a model version whose evidence is missing.",
    failureMode:
      "The agent loads a partner fine-tuned model whose training data held other partners' confidential documents, which no development practice screened.",
    keyRisk: 3,
  },
  "TECH-PP-19": {
    l2: "Templates were reviewed informally once, with no record of the outcome.",
    l4: "Every term set is screened with clause-cited findings, but review outcomes are not always retained.",
    evidence: ["art13_unfair_term_screening_report", "legal_review_routing_log", "review_outcome_record"],
    remediation:
      "Screen every proposed data-sharing term set against the Article 13 list and route each hit to legal " +
      "with the clause cited before the agent accepts or proposes it.",
    failureMode:
      "The agent accepts a dominant partner's unilaterally imposed term granting it unlimited use of shared data without flagging it for legal review.",
    keyRisk: 2,
  },
  "TECH-PP-20": {
    l2: "Third-party components are chosen by popularity, with occasional security checks.",
    l4: "Every component is assessed before integration and on update, but vulnerabilities found are not reported to maintainers.",
    evidence: ["component_due_diligence_record", "component_update_assessment_log", "maintainer_vulnerability_report"],
    remediation:
      "Require a due-diligence record (provenance, known vulnerabilities, maintenance status) before the agent adds or updates any third-party component.",
    failureMode: "The agent pulls in an abandoned open-source package with known vulnerabilities because it was the first search result.",
    keyRisk: 1,
  },
};
