/** Per-question detail for the sustainable-communities pack, keyed by question id (see IndustryPackQuestionDetail). */
import type { PackQuestionDetail } from "../../industryPacks.js";

export const sustainableCommunitiesDetail: PackQuestionDetail = {
  "MOB-SC-2": {
    l2: "The prohibited practices are listed in a policy, but use cases are deployed with no recorded screening against them.",
    l4:
      "Every use case is screened before deployment and on each change of use, data source or model, but matches are only flagged for review or the " +
      "screening records are not retained.",
    evidence: ["art5_use_case_screening_record", "smart_city_use_case_change_log", "blocked_use_case_register"],
    remediation:
      "Add a pre-deployment gate that re-runs the Art. 5 screening whenever a smart-city use case, data source or model version changes, and blocks " +
      "rollout on a match.",
    failureMode:
      "The agent enables a new camera feed or model version for an existing use case that now performs untargeted facial-image scraping, because " +
      "screening ran only at first deployment.",
    keyRisk: 0,
  },
  "MOB-SC-3": {
    l2: "Distributional effects are discussed informally, but no assessment is recorded for any siting recommendation.",
    l4:
      "Every siting recommendation links to an assessment that names its data and community input, but the decision taken is not recorded against " +
      "it or the records are not retained.",
    evidence: ["siting_distributional_assessment", "neighbourhood_burden_benefit_map", "community_consultation_record"],
    remediation:
      "Block the agent from issuing a siting recommendation until a distributional assessment, with its neighbourhood data and community input " +
      "references, is attached to the recommendation record.",
    failureMode:
      "The agent recommends siting a waste-transfer station or bus depot on land cost alone, concentrating noise and emissions in an already " +
      "overburdened neighbourhood with no assessment on file.",
    keyRisk: 3,
  },
  "MOB-SC-4": {
    l2: "Urban AI decisions are announced publicly after the fact, but residents have no channel to comment on them.",
    l4:
      "Structured engagement and a community AI governance board exist and the agent records their input, but feedback channels are not accessible " +
      "to all groups or decisions do not show how input was used.",
    evidence: ["community_ai_board_minutes", "participatory_budget_ai_input_log", "public_comment_response_record"],
    remediation:
      "Route each urban AI policy change the agent proposes through a recorded consultation step, and log per decision which citizen inputs were " +
      "received and how they changed the outcome.",
    failureMode:
      "The agent changes a participatory-budget ranking model or service allocation rule without putting it to the community governance board, " +
      "presenting it as technical tuning.",
    keyRisk: 4,
  },
  "MOB-SC-5": {
    l2: "Some meters feed a dashboard, but no data source is mapped to an adopted credit or criterion.",
    l4:
      "Each adopted credit or criterion maps to a metered source and gaps are flagged before the period closes, but the submission evidence set is " +
      "still compiled by hand.",
    evidence: ["credit_to_meter_mapping", "performance_period_gap_report", "metered_energy_water_dataset"],
    remediation:
      "Map each adopted LEED O+M credit or BREEAM In-Use criterion to a named meter, and have the agent flag missing or estimated readings well " +
      "before the performance period closes.",
    failureMode:
      "The agent fills gaps in sub-meter data with estimated values and reports them as metered, overstating a building's energy and water " +
      "performance in the rating submission.",
    keyRisk: 3,
  },
  "MOB-SC-6": {
    l2: "Hazard maps exist, but the agent does not use resilience indicators or link to emergency response.",
    l4:
      "ISO 37123 indicators, adaptation planning and early-warning integration are in place, but infrastructure interdependency analysis or " +
      "community resilience measures are partial.",
    evidence: ["iso37123_indicator_dataset", "infrastructure_interdependency_map", "early_warning_dispatch_log"],
    remediation:
      "Have the agent model interdependencies between power, water, telecoms and transport assets, and test each adaptation plan against a " +
      "cascading-failure scenario with results recorded per district.",
    failureMode:
      "The agent ranks flood-defence and early-warning upgrades by insured asset value, leaving low-income districts with older drainage unprotected.",
    keyRisk: 3,
  },
  "MOB-SC-7": {
    l2: "Some smart-city datasets have named owners, but quality checks and publication are ad hoc.",
    l4:
      "Datasets pass quality checks and are published openly to interoperability standards, but citizen data rights or data-usage documentation are " +
      "incomplete.",
    evidence: ["open_data_publication_register", "urban_dataset_quality_report", "dataset_usage_disclosure"],
    remediation:
      "Give each urban dataset the agent uses a register entry with owner, quality score, publication status and access formats, and block " +
      "publication of datasets that fail quality checks.",
    failureMode:
      "The agent publishes service-availability data only through an API and a smartphone app, so residents without broadband or a smartphone " +
      "cannot see where services are offered.",
    keyRisk: 2,
  },
  "MOB-SC-8": {
    l2: "A device inventory exists, but IoT devices share credentials and network zones with city IT.",
    l4:
      "Segmentation, threat modelling, incident response and supply chain checks are in place, but urban AI systems are not penetration-tested on a " +
      "regular schedule.",
    evidence: ["iot_device_inventory", "urban_network_segmentation_diagram", "smart_city_pentest_report"],
    remediation:
      "Restrict the agent's service account to the segmented OT zones it needs, and add the agent's tool calls into traffic and sensor controllers " +
      "to the threat model and penetration-test scope.",
    failureMode:
      "The agent trusts telemetry from a compromised streetlight or traffic sensor and pushes control changes back across a flat network, giving an " +
      "attacker a path to camera and signal controllers.",
    keyRisk: 0,
  },
  "MOB-SC-9": {
    l2: "A written policy forbids real-time remote biometric identification, but the agent has no technical block.",
    l4:
      "Activation requires a recorded objective and authorisation reference, but the urgency route, deletion on rejection or the per-use " +
      "notification log is not fully enforced.",
    evidence: ["rbi_activation_request_log", "art5_3_authorisation_reference", "rbi_urgency_deletion_record"],
    remediation:
      "Make real-time biometric identification an off-by-default tool the agent can call only with a recorded Art. 5(1)(h) objective and a matching " +
      "Art. 5(3) authorisation reference.",
    failureMode:
      "The agent switches on live face matching across public-space cameras when a police user asks for it in chat, with no authorisation record " +
      "tied to that use.",
    keyRisk: 0,
  },
  "MOB-SC-10": {
    l2: "Citywide targets are stated, but no sector milestones are defined.",
    l4: "Every sector milestone has a measured indicator, data source and owner and reports regenerate from data, but deviations are not flagged to owners.",
    evidence: ["sector_milestone_register", "climate_progress_report_dataset", "milestone_deviation_alert_log"],
    remediation:
      "Bind every progress figure the agent reports to a sector milestone, a named data source and a stored query, and alert the owner when the " +
      "measured trend leaves the pathway.",
    failureMode:
      "The agent reports transport-sector emission cuts from modelled estimates or a vendor press figure as measured progress, so the city's " +
      "climate report cannot be reproduced.",
    keyRisk: 3,
  },
  "MOB-SC-12": {
    l2: "Some indicators have written definitions, but boundaries and data sources are undocumented.",
    l4:
      "Every indicator has a versioned definition, boundary and source and passes quality checks, but recomputation from retained data has not been " +
      "demonstrated.",
    evidence: ["iso37120_indicator_definition_register", "indicator_quality_check_log", "indicator_recompute_record"],
    remediation:
      "Version each ISO 37120 indicator definition and boundary, and have the agent refuse to publish a value whose definition or boundary changed " +
      "without a change-control record.",
    failureMode:
      "The agent silently redraws the boundary of a housing or poverty indicator after a redevelopment, making displacement of low-income residents " +
      "look like improvement.",
    keyRisk: 1,
  },
  "MOB-SC-13": {
    l2: "Core integrations are listed, but data models and the reference-architecture mapping are undocumented.",
    l4: "Data models are versioned and every integration has a tested export path, but no component or vendor replacement test is on record.",
    evidence: ["iso30141_architecture_mapping", "published_data_model_versions", "vendor_replacement_test_record"],
    remediation:
      "Require each integration the agent depends on to publish its data model and pass a scheduled export test that reloads its data into a " +
      "neutral store, recorded per vendor.",
    failureMode:
      "The agent writes city sensor history only into a vendor's proprietary schema, so the city cannot change vendor or audit past decisions " +
      "without losing the data.",
    keyRisk: 4,
  },
  "MOB-SC-14": {
    l2: "Priority themes are selected, but the agent does not track action plans or stakeholders.",
    l4:
      "Action plans, coordination workflows and outcome KPIs are tracked, but results and learnings are not disseminated in formats every " +
      "stakeholder group can reach.",
    evidence: ["partnership_action_plan_tracker", "stakeholder_coordination_log", "results_dissemination_record"],
    remediation:
      "Have the agent publish each action-plan outcome in accessible offline formats as well as online, and record which stakeholder groups received it.",
    failureMode:
      "The agent gathers stakeholder input and disseminates partnership results only through online portals, so residents without internet access " +
      "never shape the action plan.",
    keyRisk: 2,
  },
  "MOB-SC-15": {
    l2: "A DPIA is planned or in draft, but public-space monitoring already runs.",
    l4:
      "The DPIA is reviewed on each change of sensors, purpose or recipients, but residual-risk sign-off or the Article 36 consultation decision is " +
      "not recorded.",
    evidence: ["public_space_monitoring_dpia", "dpia_change_trigger_log", "residual_risk_signoff"],
    remediation: "Block the agent from ingesting a new camera, sensor or recipient feed until the DPIA has a recorded review covering that change.",
    failureMode:
      "The agent starts ingesting mobility traces from a new ride-share data partner into an existing monitoring pipeline without the DPIA being reopened.",
    keyRisk: 0,
  },
  "MOB-SC-16": {
    l2: "Responsibility for the traffic system sits with a department, not named overseers, and logs are kept ad hoc.",
    l4:
      "Named overseers, suspension triggers and six-month log retention are documented, but suspension has not been tested or the " +
      "provider-notification runbook is missing.",
    evidence: ["traffic_ai_overseer_roster", "suspension_trigger_test_record", "traffic_ai_log_retention_policy"],
    remediation:
      "Give named overseers a tested kill switch that suspends the agent's signal-timing changes and reverts to fixed-time plans, and log every " +
      "suspension with its trigger.",
    failureMode:
      "The agent keeps retiming signals during a detector fault that creates unsafe intersections, because no named overseer has the authority or a " +
      "tested way to suspend it.",
    keyRisk: 4,
  },
  "MOB-SC-17": {
    l2: "Incidents are recorded in a ticket system, but the awareness time and affected ITS services are not captured.",
    l4:
      "Significance is assessed against criteria and the three deadlines are tracked automatically, but submissions are drafted by hand from " +
      "scattered evidence.",
    evidence: ["its_incident_significance_assessment", "nis2_submission_timeline", "traffic_control_incident_evidence_pack"],
    remediation:
      "Start the 24-hour, 72-hour and one-month clocks in the incident record when the agent or an operator first detects an ITS incident, and " +
      "draft each submission from that record.",
    failureMode:
      "The agent treats a traffic-management outage as routine maintenance and silently retries the controllers, so the awareness time is lost and " +
      "the 24-hour early warning is missed.",
    keyRisk: 4,
  },
  "MOB-SC-18": {
    l2: "A record of processing exists, but it does not state a lawful basis per purpose.",
    l4: "Every purpose has a recorded Art. 6(1) basis, with its Art. 6(3) law where required, but processing for an unrecorded purpose is not blocked.",
    evidence: ["processing_purpose_lawful_basis_register", "art6_3_legal_basis_reference", "purpose_change_review_record"],
    remediation:
      "Tag every data pipeline the agent runs with a registered processing purpose, and refuse to run a job whose purpose has no recorded Art. 6(1) basis.",
    failureMode:
      "The agent reuses traffic-camera footage collected for congestion management to track individual residents' movements, a new purpose with no " +
      "recorded lawful basis.",
    keyRisk: 0,
  },
};
