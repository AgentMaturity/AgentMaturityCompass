/** Per-question detail for the petition-to-law pack, keyed by question id (see IndustryPackQuestionDetail). */
import type { PackQuestionDetail } from "../../industryPacks.js";

export const petitionToLawDetail: PackQuestionDetail = {
  "GOV-PL-1": {
    l2: "An internal list covers some agent tasks, but owners are not named and the list is not public",
    l4: "A public register lists every agent task and owner, but changes overwrite entries without keeping their history",
    evidence: ["public_agent_task_register", "task_owner_assignment_record", "register_change_history"],
    remediation:
      "Generate the public register from the agent's deployed task configuration, so adding or changing a task without a named owner fails deployment and " +
      "every change is versioned.",
    failureMode:
      "The agent starts summarising committee evidence for members after a configuration change, and the public register never shows that task or who owns " +
      "it.",
    keyRisk: 1,
  },
  "GOV-PL-2": {
    l2: "Consultation runs online in one language, with accessibility checked on the main form only",
    l4: "Multi-channel, multilingual and accessible consultation exists, but representativeness of responses is not monitored against the affected population",
    evidence: ["consultation_channel_mix_report", "minority_language_submission_volume", "respondent_representativeness_analysis"],
    remediation:
      "Add a check that compares consultation respondents with the affected population and has the agent flag under-represented groups to staff for " +
      "targeted outreach before the consultation closes.",
    failureMode: "The agent summarises consultation responses as public opinion, though almost all came from one digitally active district.",
    keyRisk: 0,
  },
  "GOV-PL-3": {
    l2: "Bills are published as PDFs only; petitions and process data are not machine-readable",
    l4:
      "Core documents and the legislative corpus are open and reachable by API, but geographic legislative data is not INSPIRE-aligned or reuse licensing " +
      "is unclear",
    evidence: ["legislative_open_data_catalogue", "legislative_api_access_log", "inspire_geodata_conformance_report"],
    remediation:
      "Have the agent publish each bill, petition and stage change to the open data catalogue in a machine-readable format with an open licence, in the " +
      "same workflow step that updates the internal record.",
    failureMode:
      "The agent updates bill status in the internal system but publishes only a PDF snapshot, so the open dataset goes stale and reusers miss the change.",
    keyRisk: 3,
  },
  "GOV-PL-4": {
    l2: "A lawful basis for petition processing is recorded, but signatory data is kept indefinitely and sensitive petitions get no extra protection",
    l4:
      "Proportionality is assessed, Art. 9 protection applies to sensitive petitions and retention is minimised, but public reporting is not anonymised or " +
      "petitioner rights are handled by hand",
    evidence: ["petition_proportionality_assessment", "sensitive_petition_art9_classification", "signatory_data_retention_job_log"],
    remediation:
      "Have the agent classify each new petition for special-category topics at intake, apply restricted access and short retention to its signatory list, " +
      "and run a logged scheduled deletion job.",
    failureMode: "The agent copies the signatory list of a petition about a health condition into a committee briefing pack, exposing who signed it.",
    keyRisk: 0,
  },
  "GOV-PL-5": {
    l2: "One of the two practices is covered by an intake question, but the agent can still use persuasion templates or score petitioners",
    l4: "Intake assesses both points and runtime rules block petitioner scoring and manipulative templates, but blocked requests are not reviewed each release",
    evidence: ["art5_1_a_c_intake_assessment", "petitioner_scoring_feature_block_log", "persuasion_template_review_record"],
    remediation:
      "Remove petitioner-level behavioural features from the agent's triage inputs and add a runtime rule that blocks any petitioner-scoring or " +
      "persuasion-template request, logging each block.",
    failureMode: "The agent down-ranks petitions from signatories it scores as frequent complainants based on their past submissions.",
    keyRisk: 4,
  },
  "GOV-PL-6": {
    l2: "A petition's current status is shown, but nothing links it to the bill, amendment or vote it led to",
    l4: "Machine-readable links connect petitions to later documents, but petitioners are not notified of each stage or there is no public trace view",
    evidence: ["petition_to_bill_link_records", "akoma_ntoso_document_identifiers", "petitioner_stage_notification_log"],
    remediation:
      "Have the agent write a machine-readable link, using Akoma Ntoso identifiers or a documented equivalent, from the petition record to each bill, " +
      "amendment, vote and enacted act it touches.",
    failureMode:
      "The agent closes a petition as responded when a related amendment is tabled and drops the link to the later vote, so petitioners cannot see the " +
      "outcome.",
    keyRisk: 3,
  },
  "GOV-PL-7": {
    l2: "Requests are logged, but deadlines are tracked by hand and decisions are recorded inconsistently",
    l4: "Every request has a deadline, a named official's determination and the exemption cited for each withholding, but on-time rates are not reported",
    evidence: ["access_request_deadline_tracker", "withholding_exemption_record", "official_determination_log"],
    remediation:
      "Have the agent compute each request's statutory deadline at intake and draft, but never issue, the determination, routing it to a named official " +
      "whose sign-off and cited exemption are logged.",
    failureMode:
      "The agent issues a withholding response to an access request on its own, citing an exemption it guessed, with no accountable official deciding.",
    keyRisk: 3,
  },
  "GOV-PL-8": {
    l2: "Ethics review happens informally when a legislative AI use is proposed, and no human oversight point is defined",
    l4:
      "Human oversight, ethics review and a democratic legitimacy assessment exist, but parliamentary oversight is not integrated or the inclusive growth " +
      "assessment is missing",
    evidence: ["legislative_ai_ethics_review_record", "democratic_legitimacy_assessment", "human_oversight_checkpoint_log"],
    remediation:
      "Define the drafting steps where the agent's output must be accepted, amended or rejected by a named official before it enters a bill, and log each " +
      "decision with the official's id.",
    failureMode:
      "The agent's suggested amendment wording is pasted into a bill by a clerk with no recorded human judgement on whether it changes the policy intent.",
    keyRisk: 1,
  },
  "GOV-PL-9": {
    l2: "An oversight body knows informally that the agent is used, but it has neither documentation nor log access",
    l4: "A named body has standing access to documentation and logs and reports annually, but its findings are not followed up on record",
    evidence: ["oversight_body_access_grant", "annual_agent_use_report", "oversight_finding_follow_up_log"],
    remediation:
      "Give the named oversight body standing read access to the agent's documentation and logs through a dedicated account, and track each of its findings " +
      "to a recorded response.",
    failureMode: "The agent's logs of how it prioritised petitions are reachable only by the vendor, so the parliamentary committee cannot inspect its use.",
    keyRisk: 1,
  },
  "GOV-PL-10": {
    l2: "Some datasets are offered as feeds, but metadata is sparse and there is neither bulk download nor an API",
    l4:
      "Machine-readable releases with metadata, bulk download and APIs exist, but publication and update SLAs are not measured or the evidence artifacts " +
      "are incomplete",
    evidence: ["dataset_metadata_completeness_report", "bulk_download_and_api_docs", "publication_sla_uptime_metrics", "dataset_change_log"],
    remediation:
      "Add a monitored publication-lag metric with a threshold for each petition and legislative dataset, and have the agent block a release that lacks the " +
      "required metadata fields.",
    failureMode: "The agent publishes a petition dataset update without metadata or a change log, so reusers cannot tell which records changed.",
    keyRisk: 3,
  },
  "GOV-PL-11": {
    l2: "Geospatial legislative data is published in ad hoc formats with no harmonised schema",
    l4:
      "Datasets follow INSPIRE models and conformance is validated automatically, but transformations are undocumented or conformance reports are not " +
      "published",
    evidence: ["inspire_schema_mapping", "geodata_conformance_validation_result", "transformation_pipeline_documentation"],
    remediation:
      "Run the INSPIRE conformance validator on every geospatial dataset the agent produces or transforms before publication, and publish the report with " +
      "the dataset.",
    failureMode:
      "The agent re-projects a constituency boundary dataset with the wrong coordinate reference system, and the misaligned map is published with a bill.",
    keyRisk: 3,
  },
  "GOV-PL-12": {
    l2: "Ad hoc checks catch some missing fields, but no quality model is defined",
    l4: "Measures are mapped to ISO/IEC 25012 and computed for every release, but results are not published or defects are not tracked to closure",
    evidence: ["iso25012_quality_measure_definitions", "per_release_data_quality_report", "data_defect_tracker"],
    remediation:
      "Compute completeness, accuracy, consistency and currentness for each petition-to-law dataset in the release pipeline, and block the agent from using " +
      "records that fail the thresholds.",
    failureMode: "The agent ranks petitions by signature counts drawn from a dataset with duplicated rows, overstating some petitions' support.",
    keyRisk: 4,
  },
  "GOV-PL-13": {
    l2: "e-information is offered online, but e-consultation and e-decision-making are absent or digital-only",
    l4:
      "All three stages run on digital and non-digital channels with WCAG 2.1 AA evidence, but representativeness is not monitored or metrics are not " +
      "published each year",
    evidence: ["e_participation_stage_coverage_matrix", "wcag_2_1_aa_participation_audit", "annual_participation_metrics_report"],
    remediation:
      "Log each participant's channel and stage, and publish an annual report from that log showing participation by stage, channel and group against the " +
      "affected population.",
    failureMode:
      "The agent offers e-decision-making votes only in its web chat, so residents who rely on phone or paper channels are left out of the decision stage.",
    keyRisk: 0,
  },
  "GOV-PL-14": {
    l2: "Legacy 2003/98 references are corrected by hand when someone notices them",
    l4: "The citation map is versioned and reviewed periodically, but consistency across datasets and evidence exports is not checked automatically",
    evidence: ["psi_open_data_citation_map", "citation_consistency_scan_output", "legacy_reference_remediation_log"],
    remediation:
      "Scan agent outputs, dataset metadata and evidence exports for statutory references, and fail the publish step when one does not match the versioned " +
      "citation map.",
    failureMode: "The agent writes a superseded open-data directive reference into dataset licence notes, leaving reusers with the wrong legal anchor.",
    keyRisk: 3,
  },
  "GOV-PL-15": {
    l2: "Disclosure is added to some public texts by hand, and there is no record of human review",
    l4: "Every AI-generated text carries a disclosure or a review record, but the check is not run before publication",
    evidence: ["public_text_ai_disclosure_record", "editorial_review_record", "pre_publication_disclosure_check_log"],
    remediation:
      "Add a pre-publication check in the publishing tool that blocks agent-generated legislative or petition text unless it carries a disclosure or a " +
      "record naming the human reviewer and responsible editor.",
    failureMode: "The agent drafts a committee's public response to a petition that is published as if written by staff, with no disclosure and no reviewer.",
    keyRisk: 1,
  },
  "GOV-PL-16": {
    l2: "Interoperability is discussed for some changes, but no assessment is written down",
    l4: "An assessment is done and published for each in-scope change, but it is not redone on substantial modification or not linked to the reused solutions",
    evidence: ["interoperability_assessment_per_change", "published_assessment_link", "reused_interoperability_solution_register"],
    remediation:
      "Add a change-control step that flags any new or modified binding requirement for a trans-European service the agent delivers, and block adoption " +
      "until the Art. 3 assessment is published.",
    failureMode:
      "The agent's petition-intake interface changes its required data fields and breaks another Member State's connected service with no interoperability " +
      "assessment.",
    keyRisk: 3,
  },
  "GOV-PL-17": {
    l2: "Exact duplicates are removed, but nobody checks for automated or AI-generated submissions",
    l4:
      "Automated and AI-generated submissions are detected with documented error rates and exclusions are reviewed by a human, but no public note says what " +
      "was excluded",
    evidence: ["submission_authenticity_detection_report", "detection_error_rate_measurement", "excluded_submission_review_log", "published_exclusion_note"],
    remediation:
      "Run detection for automated and near-duplicate AI-generated submissions before counts are published, and route each exclusion batch to a named human " +
      "reviewer whose decision is logged.",
    failureMode:
      "The agent counts thousands of near-identical AI-written consultation responses from a bot network as separate public views and reports them as " +
      "majority opinion.",
    keyRisk: 2,
  },
  "GOV-PL-18": {
    l2: "The agent's introduction was announced publicly, but no consultation was held",
    l4: "Consultation was held before introduction and on each significant change, but the body's response to the input is not published",
    evidence: ["agent_introduction_consultation_record", "significant_change_consultation_log", "published_response_to_input"],
    remediation:
      "Define which changes to the agent's role count as significant, and block their deployment until a public consultation record and the body's response " +
      "are published.",
    failureMode:
      "The agent is expanded from sorting petitions to drafting proposed responses without public discussion, so citizens never weigh in on that role.",
    keyRisk: 0,
  },
};
