import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import {
  AMC_PUBLIC_METHODOLOGY_ID,
  AMC_PUBLIC_METHODOLOGY_VERSION,
  getPublicMethodologyManifest,
  getPublicMethodologyReference,
  renderPublicMethodologyMarkdown
} from "../src/methodology/publicMethodology.js";
import { generateReport, runDiagnostic } from "../src/diagnostic/runner.js";
import { initWorkspace } from "../src/workspace.js";
import { buildAgentConfig, initFleet, scaffoldAgent } from "../src/fleet/registry.js";
import { getAllQuestions } from "../src/diagnostic/fullDiagnostic.js";

const roots: string[] = [];

function workspace(): string {
  const dir = mkdtempSync(join(tmpdir(), "amc-methodology-"));
  roots.push(dir);
  initWorkspace({ workspacePath: dir, trustBoundaryMode: "isolated" });
  initFleet(dir, { orgName: "Methodology Test Fleet" });
  scaffoldAgent(dir, buildAgentConfig({
    agentId: "methodology-test-agent",
    agentName: "Methodology Test Agent",
    role: "Auditor-facing scoring fixture",
    domain: "methodology",
    primaryTasks: ["Produce a deterministic local scoring report for methodology binding tests."],
    stakeholders: ["auditor", "operator"],
    riskTier: "low",
    templateId: "bedrock",
    baseUrl: "http://localhost/methodology-test",
    routePrefix: "/methodology-test",
    auth: { type: "none" }
  }));
  return dir;
}

afterEach(() => {
  while (roots.length > 0) {
    const root = roots.pop();
    if (root) rmSync(root, { recursive: true, force: true });
  }
});

describe("public methodology manifest", () => {
  test("publishes a deterministic public methodology id, version, and hash", () => {
    const first = getPublicMethodologyManifest();
    const second = getPublicMethodologyManifest();

    expect(first.id).toBe(AMC_PUBLIC_METHODOLOGY_ID);
    expect(first.version).toBe(AMC_PUBLIC_METHODOLOGY_VERSION);
    expect(first.status).toBe("public");
    expect(first.questionSet.version).toBe("amc-legacy-240-v1");
    expect(first.questionSet.questionCount).toBe(getAllQuestions().length);
    expect(first.changelog[0]?.version).toBe(AMC_PUBLIC_METHODOLOGY_VERSION);
    expect(first.changelog[0]?.migration).toContain("Reports generated under 2026.06.20-r215");
    expect(first.changelog[0]?.summary).toContain("ChemGraph-style agentic computational chemistry workflow");
    expect(first.changelog[0]?.summary).toContain("LM Evaluation Harness-style metric-validity source-review boundaries");

    expect(first.changelog[1]?.summary).toContain("OpenAI Evals-style public-methodology source-review boundaries");
    expect(first.changelog[2]?.summary).toContain("fact-checking and factuality-evaluation review methodology boundaries");
    expect(first.changelog[2]?.summary).toContain("Google ADK-style agent-toolkit evaluation metric-validity boundaries");
    for (const previousVersion of [
      "2026.06.20-r215",
      "2026.06.20-r214",
      "2026.06.20-r215",
      "2026.06.20-r213",
      "2026.06.20-r212",
      "2026.06.20-r211",
      "2026.06.20-r210",
      "2026.06.19-r209",
      "2026.06.19-r208",
      "2026.06.19-r207",
      "2026.06.19-r206",
      "2026.06.19-r205",
      "2026.06.19-r204",
      "2026.06.19-r203",
      "2026.06.19-r202",
      "2026.06.19-r201",
      "2026.06.19-r200",
      "2026.06.19-r199",
      "2026.06.19-r198",
      "2026.06.19-r197",
      "2026.06.19-r196",
      "2026.06.19-r195",
      "2026.06.19-r194",
      "2026.06.19-r193",
      "2026.06.19-r192",
      "2026.06.19-r191",
      "2026.06.19-r190",
      "2026.06.19-r189",
      "2026.06.19-r188",
      "2026.06.19-r187",
      "2026.06.19-r186",
      "2026.06.19-r185",
      "2026.06.19-r184",
      "2026.06.19-r183",
      "2026.06.19-r182",
      "2026.06.19-r181",
      "2026.06.19-r180",
      "2026.06.19-r179",
      "2026.06.19-r178",
      "2026.06.19-r177",
      "2026.06.19-r176",
      "2026.06.19-r175",
      "2026.06.19-r174",
      "2026.06.19-r173",
      "2026.06.19-r172",
      "2026.06.19-r171",
      "2026.06.19-r170",
      "2026.06.19-r169",
      "2026.06.19-r168",
      "2026.06.19-r167",
      "2026.06.19-r166",
      "2026.06.19-r165",
      "2026.06.19-r164",
      "2026.06.19-r163",
      "2026.06.19-r162",
      "2026.06.19-r161",
      "2026.06.19-r160",
      "2026.06.19-r159",
      "2026.06.19-r158",
      "2026.06.19-r157",
      "2026.06.19-r156",
      "2026.06.19-r155",
      "2026.06.19-r154",
      "2026.06.19-r153",
      "2026.06.19-r152",
      "2026.06.19-r151",
      "2026.06.19-r150",
      "2026.06.19-r149",
      "2026.06.17-r148",
      "2026.06.17-r147",
      "2026.06.17-r146",
      "2026.06.17-r145",
      "2026.06.17-r144",
      "2026.06.17-r143",
      "2026.06.17-r142",
      "2026.06.13-r128",
      "2026.06.13-r127",
      "2026.06.13-r126",
      "2026.06.13-r125",
      "2026.06.13-r124",
      "2026.06.13-r123",
      "2026.06.13-r122",
      "2026.06.13-r121",
      "2026.06.13-r120",
      "2026.06.13-r119",
      "2026.06.13-r118",
      "2026.06.13-r117",
      "2026.06.13-r116",
      "2026.06.13-r115",
      "2026.06.13-r114",
      "2026.06.13-r113",
      "2026.06.13-r112",
      "2026.06.13-r111",
      "2026.06.13-r110",
      "2026.06.13-r109",
      "2026.06.13-r108",
      "2026.06.13-r107",
      "2026.06.13-r106",
      "2026.06.13-r105",
      "2026.06.13-r104",
      "2026.06.13-r103",
      "2026.06.13-r102",
      "2026.06.13-r101",
      "2026.06.13-r100",
      "2026.06.13-r99",
      "2026.06.13-r98",
      "2026.06.13-r97",
      "2026.06.13-r96",
      "2026.06.13-r95",
      "2026.06.13-r94",
      "2026.06.13-r93",
      "2026.06.13-r92",
      "2026.06.13-r91",
      "2026.06.13-r90",
      "2026.06.13-r89",
      "2026.06.13-r88",
      "2026.06.13-r87",
      "2026.06.13-r86",
      "2026.06.13-r85",
      "2026.06.13-r84",
      "2026.06.13-r83",
      "2026.06.13-r82",
      "2026.06.13-r81",
      "2026.06.13-r80",
      "2026.06.13-r79",
      "2026.06.13-r78",
      "2026.06.13-r77",
      "2026.06.13-r76",
      "2026.06.13-r75",
      "2026.06.13-r74",
      "2026.06.13-r73",
      "2026.06.13-r72",
      "2026.06.13-r71",
      "2026.06.13-r70",
      "2026.06.13-r69",
      "2026.06.13-r68",
      "2026.06.13-r67",
      "2026.06.13-r66",
      "2026.06.13-r65",
      "2026.06.13-r64",
      "2026.06.13-r63",
      "2026.06.13-r62",
      "2026.06.13-r61",
      "2026.06.13-r60",
      "2026.06.13-r59",
      "2026.06.13-r58",
      "2026.06.13-r57",
      "2026.06.13-r56",
      "2026.06.13-r55",
      "2026.06.13-r54",
      "2026.06.13-r53",
      "2026.06.13-r52",
      "2026.06.13-r51",
      "2026.06.13-r50",
      "2026.06.13-r49",
      "2026.06.13-r48",
      "2026.06.13-r47",
      "2026.06.13-r46",
      "2026.06.13-r45",
      "2026.06.13-r44",
      "2026.06.13-r43",
      "2026.06.13-r42",
      "2026.06.13-r41",
      "2026.06.13-r40",
      "2026.06.13-r39",
      "2026.06.13-r38",
      "2026.06.13-r37",
      "2026.06.13-r36",
      "2026.06.13-r35",
      "2026.06.13-r34",
      "2026.06.13-r33",
      "2026.06.13-r32",
      "2026.06.13-r31",
      "2026.06.13-r30",
      "2026.06.13-r29",
      "2026.06.13-r28",
      "2026.06.13-r27",
      "2026.06.13-r26",
      "2026.06.13-r25",
      "2026.06.13-r24",
      "2026.06.13-r23",
      "2026.06.13-r22",
      "2026.06.13-r21",
      "2026.06.13-r20",
      "2026.06.13-r19",
      "2026.06.13-r18",
      "2026.06.13-r17",
      "2026.06.13-r16",
      "2026.06.13-r15",
      "2026.06.13-r14",
      "2026.06.13-r13",
      "2026.06.13-r12",
      "2026.06.13-r11",
      "2026.06.13-r10",
      "2026.06.13-r9",
      "2026.06.13-r8",
      "2026.06.13-r7",
      "2026.06.13-r6",
      "2026.06.13-r5",
      "2026.06.13-r4",
      "2026.06.13-r3",
      "2026.06.13-r2",
      "2026.06.13"
    ]) {
      expect(first.changelog.some((row) => row.migration.includes(`Reports generated under ${previousVersion}`))).toBe(true);
    }
    expect(first.changelog.some((row) => row.migration.includes("Reports without a methodology block"))).toBe(true);
    expect(first.evaluationModeTaxonomy.map((mode) => mode.mode)).toEqual([
      "maturity_score",
      "metric_validation",
      "benchmark_replay",
      "live_drift",
      "provider_drift",
      "security_guardrail",
      "methodology_binding"
    ]);
    expect(first.evaluationModeTaxonomy.find((mode) => mode.mode === "methodology_binding")?.proofBinding).toContain("Awesome-AI-Evaluation-Guide");
    expect(first.scoreClaimBoundaries.map((boundary) => boundary.boundary)).toContain("divergent_trajectory_reasoning");
    expect(first.scoreClaimBoundaries.map((boundary) => boundary.boundary)).toContain("social_simulation_realism");
    expect(first.scoreClaimBoundaries.map((boundary) => boundary.boundary)).toContain("persona_policy_realism");
    expect(first.scoreClaimBoundaries.map((boundary) => boundary.boundary)).toContain("ctf_live_evaluation_integrity");
    expect(first.scoreClaimBoundaries.map((boundary) => boundary.boundary)).toContain("ctf_agent_benchmark_live_drift_integrity");
    expect(first.scoreClaimBoundaries.map((boundary) => boundary.boundary)).toContain("llm_fighter_live_drift_integrity");
    expect(first.scoreClaimBoundaries.map((boundary) => boundary.boundary)).toContain("darwin_godel_machine_live_drift_integrity");
    expect(first.scoreClaimBoundaries.map((boundary) => boundary.boundary)).toContain("ctf_partial_credit_validity");
    expect(first.scoreClaimBoundaries.map((boundary) => boundary.boundary)).toContain("multi_agent_privacy_leakage");
    expect(first.scoreClaimBoundaries.map((boundary) => boundary.boundary)).toContain("architectural_smell_repair");
    expect(first.scoreClaimBoundaries.map((boundary) => boundary.boundary)).toContain("iterative_tournament_learning");
    expect(first.scoreClaimBoundaries.map((boundary) => boundary.boundary)).toContain("enterprise_agent_eval_interop");
    expect(first.scoreClaimBoundaries.map((boundary) => boundary.boundary)).toContain("a2a_negotiation_transaction_methodology_integrity");
    expect(first.scoreClaimBoundaries.map((boundary) => boundary.boundary)).toContain("metronous_telemetry_calibration_methodology_integrity");
    expect(first.scoreClaimBoundaries.map((boundary) => boundary.boundary)).toContain("multimodal_rag_methodology_versioning");
    expect(first.scoreClaimBoundaries.map((boundary) => boundary.boundary)).toContain("rag_audit_methodology_versioning");
    expect(first.scoreClaimBoundaries.map((boundary) => boundary.boundary)).toContain("soc_dataset_replay_integrity");
    expect(first.scoreClaimBoundaries.map((boundary) => boundary.boundary)).toContain("network_troubleshooting_metric_validity");
    expect(first.scoreClaimBoundaries.map((boundary) => boundary.boundary)).toContain("inference_optimization_metric_validity");
    expect(first.scoreClaimBoundaries.map((boundary) => boundary.boundary)).toContain("java_coding_agent_metric_validity");
    expect(first.scoreClaimBoundaries.map((boundary) => boundary.boundary)).toContain("ai_agent_benchmark_comparison_replay_integrity");
    expect(first.scoreClaimBoundaries.map((boundary) => boundary.boundary)).toContain("gaia_agent_replay_integrity");
    expect(first.scoreClaimBoundaries.map((boundary) => boundary.boundary)).toContain("paperarena_replay_integrity");
    expect(first.scoreClaimBoundaries.map((boundary) => boundary.boundary)).toContain("social_reasoning_bench_replay_integrity");
    expect(first.scoreClaimBoundaries.map((boundary) => boundary.boundary)).toContain("academiclaw_metric_validity");
    expect(first.scoreClaimBoundaries.map((boundary) => boundary.boundary)).toContain("agent_scenario_test_metric_validity");
    expect(first.scoreClaimBoundaries.map((boundary) => boundary.boundary)).toContain("opencode_lab_metric_validity");
    expect(first.scoreClaimBoundaries.map((boundary) => boundary.boundary)).toContain("cc_plugin_eval_metric_validity");
    expect(first.scoreClaimBoundaries.map((boundary) => boundary.boundary)).toContain("realign_simulation_metric_validity");
    expect(first.scoreClaimBoundaries.map((boundary) => boundary.boundary)).toContain("humanstudybench_metric_validity");
    expect(first.scoreClaimBoundaries.map((boundary) => boundary.boundary)).toContain("ragas_notebook_metric_validity");
    expect(first.scoreClaimBoundaries.map((boundary) => boundary.boundary)).toContain("web_eval_dataset_metric_validity");
    expect(first.scoreClaimBoundaries.map((boundary) => boundary.boundary)).toContain("mobile_agent_metric_validity");
    expect(first.scoreClaimBoundaries.map((boundary) => boundary.boundary)).toContain("bioinformatics_agent_metric_validity");
    expect(first.scoreClaimBoundaries.map((boundary) => boundary.boundary)).toContain("document_rag_memory_replay_integrity");
    expect(first.scoreClaimBoundaries.map((boundary) => boundary.boundary)).toContain("clonemem_long_term_memory_replay_integrity");
    expect(first.scoreClaimBoundaries.map((boundary) => boundary.boundary)).toContain("researchharness_agent_replay_integrity");
    expect(first.scoreClaimBoundaries.map((boundary) => boundary.boundary)).toContain("agent_mont_monitoring_replay_integrity");
    expect(first.scoreClaimBoundaries.map((boundary) => boundary.boundary)).toContain("nuclia_rag_triad_replay_integrity");
    expect(first.scoreClaimBoundaries.map((boundary) => boundary.boundary)).toContain("navi_bench_web_agent_live_drift_integrity");
    expect(first.scoreClaimBoundaries.map((boundary) => boundary.boundary)).toContain("edge_ai_agent_replay_integrity");
    expect(first.scoreClaimBoundaries.map((boundary) => boundary.boundary)).toContain("agent_workflow_kit_replay_integrity");
    expect(first.scoreClaimBoundaries.map((boundary) => boundary.boundary)).toContain("medask_clinical_benchmark_replay_integrity");
    expect(first.scoreClaimBoundaries.map((boundary) => boundary.boundary)).toContain("ollama_metrics_live_drift_integrity");
    expect(first.scoreClaimBoundaries.map((boundary) => boundary.boundary)).toContain("recovery_bench_live_drift_integrity");
    expect(first.scoreClaimBoundaries.map((boundary) => boundary.boundary)).toContain("geospatial_tool_calling_provider_drift");
    expect(first.scoreClaimBoundaries.map((boundary) => boundary.boundary)).toContain("llm_rag_eval_suite_live_drift_integrity");
    expect(first.scoreClaimBoundaries.map((boundary) => boundary.boundary)).toContain("kite_rag_live_drift_integrity");
    expect(first.scoreClaimBoundaries.map((boundary) => boundary.boundary)).toContain("poker_eval_live_drift_integrity");
    expect(first.scoreClaimBoundaries.map((boundary) => boundary.boundary)).toContain("nomiracl_multilingual_rag_live_drift_integrity");
    expect(first.scoreClaimBoundaries.map((boundary) => boundary.boundary)).toContain("scaling_law_discovery_live_drift_integrity");
    expect(first.scoreClaimBoundaries.map((boundary) => boundary.boundary)).toContain("scenario_simulation_replay_integrity");
    expect(first.scoreClaimBoundaries.map((boundary) => boundary.boundary)).toContain("warehouse_native_llm_eval_replay_integrity");
    expect(first.scoreClaimBoundaries.map((boundary) => boundary.boundary)).toContain("llm_workflow_observability_methodology_integrity");
    expect(first.scoreClaimBoundaries.map((boundary) => boundary.boundary)).toContain("research_run_live_drift_integrity");
    expect(first.scoreClaimBoundaries.map((boundary) => boundary.boundary)).toContain("rag_eval_flow_replay_integrity");
    expect(first.scoreClaimBoundaries.map((boundary) => boundary.boundary)).toContain("rag_eval_dataset_replay_integrity");
    expect(first.scoreClaimBoundaries.map((boundary) => boundary.boundary)).toContain("encourage_rag_replay_integrity");
    expect(first.scoreClaimBoundaries.map((boundary) => boundary.boundary)).toContain("bio_kg_bench_replay_integrity");
    expect(first.scoreClaimBoundaries.map((boundary) => boundary.boundary)).toContain("biomedarena_replay_integrity");
    expect(first.scoreClaimBoundaries.map((boundary) => boundary.boundary)).toContain("mirage_drug_repositioning_metric_validity");
    expect(first.scoreClaimBoundaries.map((boundary) => boundary.boundary)).toContain("gui_navigation_live_drift_integrity");
    expect(first.scoreClaimBoundaries.map((boundary) => boundary.boundary)).toContain("physical_risk_awareness_methodology_integrity");
    expect(first.scoreClaimBoundaries.map((boundary) => boundary.boundary)).toContain("llmops_pipeline_methodology_integrity");
    expect(first.scoreClaimBoundaries.map((boundary) => boundary.boundary)).toContain("professional_task_question_explainability_integrity");
    expect(first.scoreClaimBoundaries.map((boundary) => boundary.boundary)).toContain("continual_learning_question_explainability_integrity");
    expect(first.scoreClaimBoundaries.map((boundary) => boundary.boundary)).toContain("hermes_turbo_question_explainability_integrity");
    expect(first.scoreClaimBoundaries.map((boundary) => boundary.boundary)).toContain("rss_market_impact_methodology_integrity");
    expect(first.scoreClaimBoundaries.map((boundary) => boundary.boundary)).toContain("credence_engine_live_drift_integrity");
    expect(first.scoreClaimBoundaries.map((boundary) => boundary.boundary)).toContain("skill_forge_autoresearch_replay_integrity");
    expect(first.scoreClaimBoundaries.map((boundary) => boundary.boundary)).toContain("kubernetes_operational_agent_metric_validity");
    expect(first.scoreClaimBoundaries.map((boundary) => boundary.boundary)).toContain("secure_vibe_bench_metric_validity");
    expect(first.scoreClaimBoundaries.map((boundary) => boundary.boundary)).toContain("ai_evaluation_guide_methodology_integrity");
    expect(first.scoreClaimBoundaries.map((boundary) => boundary.boundary)).toContain("agent_trial_statistical_question_explainability_integrity");
    expect(first.scoreClaimBoundaries.map((boundary) => boundary.boundary)).toContain("codequest_quality_question_explainability_integrity");
    expect(first.scoreClaimBoundaries.map((boundary) => boundary.boundary)).toContain("parallel_research_skill_metric_validity");
    expect(first.scoreClaimBoundaries.map((boundary) => boundary.boundary)).toContain("resume_rag_evaluator_metric_validity");
    expect(first.scoreClaimBoundaries.map((boundary) => boundary.boundary)).toContain("chipbenchmark_metric_validity");
    expect(first.scoreClaimBoundaries.map((boundary) => boundary.boundary)).toContain("hermes_bench_metric_validity");
    expect(first.scoreClaimBoundaries.map((boundary) => boundary.boundary)).toContain("cooperbench_metric_validity");
    expect(first.scoreClaimBoundaries.map((boundary) => boundary.boundary)).toContain("codercup_metric_validity");
    expect(first.scoreClaimBoundaries.map((boundary) => boundary.boundary)).toContain("awesome_agent_memory_live_drift_integrity");
    expect(first.scoreClaimBoundaries.map((boundary) => boundary.boundary)).toContain("agent_reading_test_live_drift_integrity");
    expect(first.scoreClaimBoundaries.map((boundary) => boundary.boundary)).toContain("ai_reputation_claude_live_drift_integrity");
    expect(first.scoreClaimBoundaries.map((boundary) => boundary.boundary)).toContain("sutro_batch_methodology_versioning_integrity");
    expect(first.scoreClaimBoundaries.map((boundary) => boundary.boundary)).toContain("agentkernelarena_gpu_kernel_replay_integrity");
    expect(first.scoreClaimBoundaries.map((boundary) => boundary.boundary)).toContain("llm_evaluation_system_jury_replay_integrity");
    expect(first.scoreClaimBoundaries.map((boundary) => boundary.boundary)).toContain("innovatorbench_research_replay_integrity");
    expect(first.scoreClaimBoundaries.map((boundary) => boundary.boundary)).toContain("iot_firmware_question_explainability_integrity");
    expect(first.scoreClaimBoundaries.map((boundary) => boundary.boundary)).toContain("retail_sales_question_explainability_integrity");
    expect(first.scoreClaimBoundaries.map((boundary) => boundary.boundary)).toContain("scorable_studio_drilldown_integrity");
    expect(first.scoreClaimBoundaries.map((boundary) => boundary.boundary)).toContain("knowlytics_ai_replay_integrity");
    expect(first.scoreClaimBoundaries.map((boundary) => boundary.boundary)).toContain("sap_agent_eval_tutorial_live_drift_integrity");
    expect(first.scoreClaimBoundaries.map((boundary) => boundary.boundary)).toContain("agent_eval_observability_live_drift_integrity");
    expect(first.scoreClaimBoundaries.map((boundary) => boundary.boundary)).toContain("agent_eval_harness_live_drift_integrity");
    expect(first.scoreClaimBoundaries.map((boundary) => boundary.boundary)).toContain("strands_benchmark_harness_live_drift_integrity");
    expect(first.scoreClaimBoundaries.map((boundary) => boundary.boundary)).toContain("costnav_physical_navigation_replay_integrity");
    expect(first.scoreClaimBoundaries.map((boundary) => boundary.boundary)).toContain("terminalworld_replay_integrity");
    expect(first.scoreClaimBoundaries.map((boundary) => boundary.boundary)).toContain("arize_phoenix_eval_observability_metric_validity");
    expect(first.scoreClaimBoundaries[0]?.requiredEvidence).toContain("off-path attempts");
    expect(first.scoreClaimBoundaries[1]?.requiredEvidence).toContain("harm prevalence");
    expect(first.scoreClaimBoundaries[2]?.requiredEvidence).toContain("task-goal preservation");
    expect(first.scoreClaimBoundaries[3]?.requiredEvidence).toContain("first-correct-flag forwarding");
    expect(first.scoreClaimBoundaries[4]?.requiredEvidence).toContain("dataset DOI/version");
    expect(first.scoreClaimBoundaries[4]?.requiredEvidence).toContain("checkpoint rubric");
    expect(first.scoreClaimBoundaries[5]?.requiredEvidence).toContain("social-pressure context");
    expect(first.scoreClaimBoundaries[6]?.requiredEvidence).toContain("false-positive");
    expect(first.scoreClaimBoundaries[7]?.requiredEvidence).toContain("opponent pool");
    expect(first.scoreClaimBoundaries[7]?.requiredEvidence).toContain("relative-ranking uncertainty");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "enterprise_agent_eval_interop")?.requiredEvidence).toContain("agent endpoint contract hash");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "enterprise_agent_eval_interop")?.requiredEvidence).toContain("tool-call trace");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "a2a_negotiation_transaction_methodology_integrity")?.requiredEvidence).toContain("buyer-role policy hash");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "a2a_negotiation_transaction_methodology_integrity")?.requiredEvidence).toContain("anomaly taxonomy hash");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "a2a_negotiation_transaction_methodology_integrity")?.migration).toContain("A2A-NT");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "metronous_telemetry_calibration_methodology_integrity")?.requiredEvidence).toContain("telemetry schema hash");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "metronous_telemetry_calibration_methodology_integrity")?.requiredEvidence).toContain("model-calibration report hash");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "metronous_telemetry_calibration_methodology_integrity")?.migration).toContain("Metronous");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "multimodal_rag_methodology_versioning")?.requiredEvidence).toContain("image coherence/helpfulness/reference/recall metrics");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "multimodal_rag_methodology_versioning")?.migration).toContain("M2RAG-style");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "rag_audit_methodology_versioning")?.requiredEvidence).toContain("failure-diagnosis taxonomy");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "rag_audit_methodology_versioning")?.migration).toContain("RagScore-style");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "soc_dataset_replay_integrity")?.requiredEvidence).toContain("ATT&CK mapping hash");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "soc_dataset_replay_integrity")?.migration).toContain("AD-GEN-style");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "network_troubleshooting_metric_validity")?.requiredEvidence).toContain("topology tier manifest");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "network_troubleshooting_metric_validity")?.requiredEvidence).toContain("MCP/tool manifest");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "network_troubleshooting_metric_validity")?.migration).toContain("NIKA");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "inference_optimization_metric_validity")?.requiredEvidence).toContain("hardware budget manifest");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "inference_optimization_metric_validity")?.requiredEvidence).toContain("supervised relaunch result");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "inference_optimization_metric_validity")?.migration).toContain("InferenceBench");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "java_coding_agent_metric_validity")?.requiredEvidence).toContain("YAML benchmark manifest");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "java_coding_agent_metric_validity")?.requiredEvidence).toContain("JaCoCo coverage report");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "java_coding_agent_metric_validity")?.migration).toContain("Agent Bench");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "gaia_agent_replay_integrity")?.requiredEvidence).toContain("fixed seed");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "gaia_agent_replay_integrity")?.requiredEvidence).toContain("tool trace coverage");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "gaia_agent_replay_integrity")?.migration).toContain("GAIA-agent");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "paperarena_replay_integrity")?.requiredEvidence).toContain("Hugging Face dataset snapshot hash");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "paperarena_replay_integrity")?.requiredEvidence).toContain("tool-surface ids");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "paperarena_replay_integrity")?.requiredEvidence).toContain("tool-trace coverage");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "paperarena_replay_integrity")?.migration).toContain("PaperArena");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "social_reasoning_bench_replay_integrity")?.requiredEvidence).toContain("data tree hash");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "social_reasoning_bench_replay_integrity")?.requiredEvidence).toContain("scenario mode coverage");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "social_reasoning_bench_replay_integrity")?.migration).toContain("Social Reasoning Bench");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "academiclaw_metric_validity")?.requiredEvidence).toContain("bilingual language manifest");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "academiclaw_metric_validity")?.requiredEvidence).toContain("meta-eval manifest");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "academiclaw_metric_validity")?.migration).toContain("AcademiClaw");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "rag_chunking_technique_metric_validity")?.requiredEvidence).toContain("smart chunking notebook manifest");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "rag_chunking_technique_metric_validity")?.requiredEvidence).toContain("policy corpus manifest");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "rag_chunking_technique_metric_validity")?.migration).toContain("rag-chunking-techniques");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "kubernetes_operational_agent_metric_validity")?.requiredEvidence).toContain("Kubernetes tool inventory manifest");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "kubernetes_operational_agent_metric_validity")?.requiredEvidence).toContain("log-analysis manifest");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "kubernetes_operational_agent_metric_validity")?.publicDisclosure).toContain("source metadata alone");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "kubernetes_operational_agent_metric_validity")?.migration).toContain("k8s-ai-style");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "secure_vibe_bench_metric_validity")?.requiredEvidence).toContain("vulnerability scenario manifest");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "secure_vibe_bench_metric_validity")?.requiredEvidence).toContain("test script manifest");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "secure_vibe_bench_metric_validity")?.publicDisclosure).toContain("source metadata alone");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "secure_vibe_bench_metric_validity")?.migration).toContain("SecureVibeBench");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "ai_evaluation_guide_methodology_integrity")?.requiredEvidence).toContain("benchmark guide manifest");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "ai_evaluation_guide_methodology_integrity")?.requiredEvidence).toContain("migration guidance hash");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "ai_evaluation_guide_methodology_integrity")?.publicDisclosure).toContain("source metadata alone");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "ai_evaluation_guide_methodology_integrity")?.migration).toContain("Awesome-AI-Evaluation-Guide");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "agent_scenario_test_metric_validity")?.requiredEvidence).toContain("tool mock manifest");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "agent_scenario_test_metric_validity")?.requiredEvidence).toContain("LLM judge metric manifest");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "agent_scenario_test_metric_validity")?.migration).toContain("Agentest-style");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "opencode_lab_metric_validity")?.requiredEvidence).toContain("fork agreement report");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "opencode_lab_metric_validity")?.requiredEvidence).toContain("model variance report");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "opencode_lab_metric_validity")?.migration).toContain("OpenCode lab");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "cc_plugin_eval_metric_validity")?.requiredEvidence).toContain("programmatic detection report");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "cc_plugin_eval_metric_validity")?.requiredEvidence).toContain("trigger accuracy");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "cc_plugin_eval_metric_validity")?.migration).toContain("cc-plugin-eval-style");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "realign_simulation_metric_validity")?.requiredEvidence).toContain("YAML config manifest");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "realign_simulation_metric_validity")?.requiredEvidence).toContain("judge agreement");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "realign_simulation_metric_validity")?.migration).toContain("Realign simulation");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "humanstudybench_metric_validity")?.requiredEvidence).toContain("default-branch snapshot");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "humanstudybench_metric_validity")?.requiredEvidence).toContain("inter-rater agreement");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "humanstudybench_metric_validity")?.migration).toContain("HumanStudy-Bench");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "legacybench_metric_validity")?.requiredEvidence).toContain("task corpus tree hash");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "legacybench_metric_validity")?.requiredEvidence).toContain("replay pass-rate proof");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "legacybench_metric_validity")?.migration).toContain("Legacy-Bench");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "subtlememory_metric_validity")?.requiredEvidence).toContain("relation taxonomy manifest");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "subtlememory_metric_validity")?.publicDisclosure).toContain("source metadata alone");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "subtlememory_metric_validity")?.migration).toContain("SubtleMemory");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "ai_reputation_claude_live_drift_integrity")?.requiredEvidence).toContain("skill catalog hash");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "ai_reputation_claude_live_drift_integrity")?.requiredEvidence).toContain("hallucinated citation rate");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "ai_reputation_claude_live_drift_integrity")?.publicDisclosure).toContain("source metadata alone");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "ai_reputation_claude_live_drift_integrity")?.migration).toContain("AI Reputation Claude");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "ragas_notebook_metric_validity")?.requiredEvidence).toContain("RAGAS metric suite");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "ragas_notebook_metric_validity")?.requiredEvidence).toContain("LangFuse trace and score export");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "ragas_notebook_metric_validity")?.migration).toContain("RAGAS notebook");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "web_eval_dataset_metric_validity")?.requiredEvidence).toContain("generated query manifest");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "web_eval_dataset_metric_validity")?.requiredEvidence).toContain("answer grounding metric");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "web_eval_dataset_metric_validity")?.migration).toContain("tavily-web-eval-generator");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "parallel_research_skill_metric_validity")?.requiredEvidence).toContain("citation provenance report hash");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "parallel_research_skill_metric_validity")?.requiredEvidence).toContain("batch execution manifest hash");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "parallel_research_skill_metric_validity")?.migration).toContain("clawdbot-skill-parallel");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "resume_rag_evaluator_metric_validity")?.requiredEvidence).toContain("resume parser manifest hash");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "resume_rag_evaluator_metric_validity")?.requiredEvidence).toContain("candidate rating report hash");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "resume_rag_evaluator_metric_validity")?.migration).toContain("ollama-resume-parser");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "chipbenchmark_metric_validity")?.requiredEvidence).toContain("hardware profile manifest hash");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "chipbenchmark_metric_validity")?.requiredEvidence).toContain("pricing dataset hash");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "chipbenchmark_metric_validity")?.migration).toContain("chipbenchmark");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "hermes_bench_metric_validity")?.requiredEvidence).toContain("backend tree hash");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "hermes_bench_metric_validity")?.requiredEvidence).toContain("frontend regression test manifest");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "hermes_bench_metric_validity")?.publicDisclosure).toContain("source metadata alone");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "hermes_bench_metric_validity")?.migration).toContain("Hermes Bench");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "cooperbench_metric_validity")?.requiredEvidence).toContain("dataset tree hash");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "cooperbench_metric_validity")?.requiredEvidence).toContain("agent-adapter roster hash");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "cooperbench_metric_validity")?.publicDisclosure).toContain("source metadata alone");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "cooperbench_metric_validity")?.migration).toContain("CooperBench");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "codercup_metric_validity")?.requiredEvidence).toContain("runner contract");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "codercup_metric_validity")?.requiredEvidence).toContain("cost-methodology hash");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "codercup_metric_validity")?.publicDisclosure).toContain("source metadata alone");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "codercup_metric_validity")?.migration).toContain("CoderCup");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "agentic_graph_rag_metric_validity")?.requiredEvidence).toContain("experiment-tracker hash");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "agentic_graph_rag_metric_validity")?.requiredEvidence).toContain("retrieval grounding score");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "agentic_graph_rag_metric_validity")?.publicDisclosure).toContain("source metadata alone");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "agentic_graph_rag_metric_validity")?.migration).toContain("Agentic Graph RAG");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "awesome_agent_memory_live_drift_integrity")?.publicDisclosure).toContain("copied catalog row");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "awesome_agent_memory_live_drift_integrity")?.requiredEvidence).toContain("README blob hash");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "awesome_agent_memory_live_drift_integrity")?.requiredEvidence).toContain("drift statistic hash");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "awesome_agent_memory_live_drift_integrity")?.migration).toContain("Awesome Agent Memory");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "agent_reading_test_live_drift_integrity")?.publicDisclosure).toContain("copied canary token");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "agent_reading_test_live_drift_integrity")?.requiredEvidence).toContain("answer key hash");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "agent_reading_test_live_drift_integrity")?.requiredEvidence).toContain("raw content capture hash");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "agent_reading_test_live_drift_integrity")?.migration).toContain("Agent Reading Test");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "llm_fighter_live_drift_integrity")?.publicDisclosure).toContain("aggregate win rate");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "llm_fighter_live_drift_integrity")?.requiredEvidence).toContain("game engine hash");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "llm_fighter_live_drift_integrity")?.requiredEvidence).toContain("exported log hash");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "llm_fighter_live_drift_integrity")?.migration).toContain("LLM Fighter");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "darwin_godel_machine_live_drift_integrity")?.publicDisclosure).toContain("copied agent code");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "darwin_godel_machine_live_drift_integrity")?.requiredEvidence).toContain("score-movement manifest hash");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "darwin_godel_machine_live_drift_integrity")?.requiredEvidence).toContain("mutation accepted flag");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "darwin_godel_machine_live_drift_integrity")?.migration).toContain("Darwin Godel Machine");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "effect_autoagent_replay_integrity")?.publicDisclosure).toContain("source metadata alone");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "effect_autoagent_replay_integrity")?.requiredEvidence).toContain("benchmark runner hash");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "effect_autoagent_replay_integrity")?.requiredEvidence).toContain("fixed seed");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "effect_autoagent_replay_integrity")?.migration).toContain("effect-autoagent");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "falcon_evaluate_provider_drift_integrity")?.publicDisclosure).toContain("source metadata alone");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "falcon_evaluate_provider_drift_integrity")?.requiredEvidence).toContain("provider route id");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "falcon_evaluate_provider_drift_integrity")?.requiredEvidence).toContain("candidate canary result hash");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "falcon_evaluate_provider_drift_integrity")?.migration).toContain("Falcon Evaluate");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "agent_defense_bench_provider_drift_integrity")?.publicDisclosure).toContain("source metadata alone");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "agent_defense_bench_provider_drift_integrity")?.requiredEvidence).toContain("MCP server manifest hash");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "agent_defense_bench_provider_drift_integrity")?.requiredEvidence).toContain("prompt-injection block rate");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "agent_defense_bench_provider_drift_integrity")?.migration).toContain("AgentDefense-Bench");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "paper_read_skill_live_drift_integrity")?.publicDisclosure).toContain("source metadata alone");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "paper_read_skill_live_drift_integrity")?.requiredEvidence).toContain("llms manifest hash");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "paper_read_skill_live_drift_integrity")?.requiredEvidence).toContain("no-prompt-copy proof hash");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "paper_read_skill_live_drift_integrity")?.migration).toContain("paper-read-skill");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "eval_ai_library_question_explainability_integrity")?.publicDisclosure).toContain("source metadata alone");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "eval_ai_library_question_explainability_integrity")?.requiredEvidence).toContain("metric result hash");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "eval_ai_library_question_explainability_integrity")?.requiredEvidence).toContain("rejected evidence ledger hash");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "eval_ai_library_question_explainability_integrity")?.requiredEvidence).toContain("repair hint hash");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "eval_ai_library_question_explainability_integrity")?.migration).toContain("eval-ai-library");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "open_model_rag_question_explainability_integrity")?.publicDisclosure).toContain("source metadata alone");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "open_model_rag_question_explainability_integrity")?.requiredEvidence).toContain("LangChain4j integration hash");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "open_model_rag_question_explainability_integrity")?.requiredEvidence).toContain("retrieval grounding");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "open_model_rag_question_explainability_integrity")?.migration).toContain("Open Models");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "fore_public_methodology_versioning_integrity")?.publicDisclosure).toContain("source metadata alone");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "fore_public_methodology_versioning_integrity")?.requiredEvidence).toContain("methodology changelog hash");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "fore_public_methodology_versioning_integrity")?.requiredEvidence).toContain("deprecation notice hash");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "fore_public_methodology_versioning_integrity")?.requiredEvidence).toContain("migration guidance hash");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "fore_public_methodology_versioning_integrity")?.migration).toContain("fore");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "heurekabench_scientific_replay_integrity")?.publicDisclosure).toContain("source metadata alone");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "heurekabench_scientific_replay_integrity")?.requiredEvidence).toContain("benchmark JSON hash");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "heurekabench_scientific_replay_integrity")?.requiredEvidence).toContain("agent-output extraction hash");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "heurekabench_scientific_replay_integrity")?.requiredEvidence).toContain("dataset no-copy proof hash");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "heurekabench_scientific_replay_integrity")?.migration).toContain("HeurekaBench");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "rag_contradiction_detector_replay_integrity")?.publicDisclosure).toContain("source metadata alone");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "rag_contradiction_detector_replay_integrity")?.requiredEvidence).toContain("SciFact fixture manifest hash");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "rag_contradiction_detector_replay_integrity")?.requiredEvidence).toContain("quality-gate report hash");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "rag_contradiction_detector_replay_integrity")?.requiredEvidence).toContain("no-PubMed-abstract-copy proof hash");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "rag_contradiction_detector_replay_integrity")?.migration).toContain("RAG_Contradiction_Detector");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "skillmatch_resume_live_drift_integrity")?.publicDisclosure).toContain("source metadata alone");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "skillmatch_resume_live_drift_integrity")?.requiredEvidence).toContain("frontend analyzer component hash");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "skillmatch_resume_live_drift_integrity")?.requiredEvidence).toContain("no-resume-copy proof hash");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "skillmatch_resume_live_drift_integrity")?.migration).toContain("SkillMatch");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "decibench_voice_live_drift_integrity")?.publicDisclosure).toContain("source metadata alone");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "decibench_voice_live_drift_integrity")?.requiredEvidence).toContain("audio tree hash");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "decibench_voice_live_drift_integrity")?.requiredEvidence).toContain("no-transcript-copy proof hash");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "decibench_voice_live_drift_integrity")?.migration).toContain("Decibench");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "evidra_provider_drift_integrity")?.publicDisclosure).toContain("source metadata alone");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "evidra_provider_drift_integrity")?.requiredEvidence).toContain("MCP server tree hash");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "evidra_provider_drift_integrity")?.requiredEvidence).toContain("prescribe/report protocol proof hash");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "evidra_provider_drift_integrity")?.migration).toContain("Evidra");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "ravig_bench_metric_validity_integrity")?.publicDisclosure).toContain("source metadata alone");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "ravig_bench_metric_validity_integrity")?.requiredEvidence).toContain("content-eval tree hash");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "ravig_bench_metric_validity_integrity")?.requiredEvidence).toContain("multi-modal evaluator ids");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "ravig_bench_metric_validity_integrity")?.migration).toContain("RAViG-Bench");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "mobile_agent_metric_validity")?.requiredEvidence).toContain("mobile environment manifest");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "mobile_agent_metric_validity")?.requiredEvidence).toContain("checkpoint metric rubric");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "mobile_agent_metric_validity")?.migration).toContain("MobileBench");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "bioinformatics_agent_metric_validity")?.requiredEvidence).toContain("truth/reference manifest");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "bioinformatics_agent_metric_validity")?.requiredEvidence).toContain("perturbation suite manifest");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "bioinformatics_agent_metric_validity")?.migration).toContain("BioAgentBench");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "document_rag_memory_replay_integrity")?.requiredEvidence).toContain("session-KG manifest hash");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "document_rag_memory_replay_integrity")?.requiredEvidence).toContain("memory-recall trace hash");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "document_rag_memory_replay_integrity")?.migration).toContain("DocThinker");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "clonemem_long_term_memory_replay_integrity")?.requiredEvidence).toContain("digital-trace manifest hash");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "clonemem_long_term_memory_replay_integrity")?.requiredEvidence).toContain("bilingual config hash");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "clonemem_long_term_memory_replay_integrity")?.migration).toContain("CloneMem");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "researchharness_agent_replay_integrity")?.requiredEvidence).toContain("native tool-call trace hash");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "researchharness_agent_replay_integrity")?.requiredEvidence).toContain("OpenAI-compatible API hash");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "researchharness_agent_replay_integrity")?.migration).toContain("ResearchHarness");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "agent_mont_monitoring_replay_integrity")?.requiredEvidence).toContain("token-usage manifest hash");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "agent_mont_monitoring_replay_integrity")?.requiredEvidence).toContain("visualization artifact hash");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "agent_mont_monitoring_replay_integrity")?.migration).toContain("Agent Mont");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "nuclia_rag_triad_replay_integrity")?.requiredEvidence).toContain("question-answer-context manifest hash");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "nuclia_rag_triad_replay_integrity")?.requiredEvidence).toContain("no-raw-context-copy boundary proof");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "nuclia_rag_triad_replay_integrity")?.migration).toContain("Nuclia");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "navi_bench_web_agent_live_drift_integrity")?.requiredEvidence).toContain("Hugging Face dataset reference hash");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "navi_bench_web_agent_live_drift_integrity")?.requiredEvidence).toContain("lower-bound score");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "navi_bench_web_agent_live_drift_integrity")?.migration).toContain("Navi-Bench");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "miniappbench_interactive_html_replay_integrity")?.requiredEvidence).toContain("browser-automation trace hash");
    expect(first.benchmarkMethodologyVersioning.changeTriggers.map((trigger) => trigger.trigger)).toContain("miniappbench_interactive_html_replay_change");
    expect(first.benchmarkMethodologyVersioning.changeTriggers.map((trigger) => trigger.trigger)).toContain("knowlytics_ai_replay_change");
    expect(first.benchmarkMethodologyVersioning.changeTriggers.map((trigger) => trigger.trigger)).toContain("effect_autoagent_replay_change");
    expect(first.benchmarkMethodologyVersioning.changeTriggers.map((trigger) => trigger.trigger)).toContain("falcon_evaluate_provider_drift_change");
    expect(first.benchmarkMethodologyVersioning.changeTriggers.map((trigger) => trigger.trigger)).toContain("agent_defense_bench_provider_drift_change");
    expect(first.benchmarkMethodologyVersioning.changeTriggers.map((trigger) => trigger.trigger)).toContain("paper_read_skill_live_drift_change");
    expect(first.benchmarkMethodologyVersioning.changeTriggers.map((trigger) => trigger.trigger)).toContain("eval_ai_library_question_explainability_change");
    expect(first.benchmarkMethodologyVersioning.changeTriggers.map((trigger) => trigger.trigger)).toContain("open_model_rag_question_explainability_change");
    expect(first.benchmarkMethodologyVersioning.changeTriggers.map((trigger) => trigger.trigger)).toContain("fore_public_methodology_versioning_change");
    expect(first.benchmarkMethodologyVersioning.changeTriggers.map((trigger) => trigger.trigger)).toContain("heurekabench_scientific_replay_change");
    expect(first.benchmarkMethodologyVersioning.changeTriggers.map((trigger) => trigger.trigger)).toContain("rag_contradiction_detector_replay_change");
    expect(first.benchmarkMethodologyVersioning.changeTriggers.map((trigger) => trigger.trigger)).toContain("skillmatch_resume_live_drift_change");
    expect(first.benchmarkMethodologyVersioning.changeTriggers.map((trigger) => trigger.trigger)).toContain("decibench_voice_live_drift_change");
    expect(first.benchmarkMethodologyVersioning.changeTriggers.map((trigger) => trigger.trigger)).toContain("evidra_provider_drift_change");
    expect(first.benchmarkMethodologyVersioning.changeTriggers.map((trigger) => trigger.trigger)).toContain("ravig_bench_metric_validity_change");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "edge_ai_agent_replay_integrity")?.requiredEvidence).toContain("device profile hash");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "edge_ai_agent_replay_integrity")?.requiredEvidence).toContain("energy per task");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "edge_ai_agent_replay_integrity")?.migration).toContain("edge AI agent");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "agent_workflow_kit_replay_integrity")?.requiredEvidence).toContain("risk-scoring rubric hash");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "agent_workflow_kit_replay_integrity")?.requiredEvidence).toContain("external-approval requirement and gate proof");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "agent_workflow_kit_replay_integrity")?.migration).toContain("Agent Workflow Kit");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "medask_clinical_benchmark_replay_integrity")?.requiredEvidence).toContain("SymptomCheck vignette manifest hash");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "medask_clinical_benchmark_replay_integrity")?.requiredEvidence).toContain("urgency-class coverage");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "medask_clinical_benchmark_replay_integrity")?.migration).toContain("MedAsk");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "ollama_metrics_live_drift_integrity")?.requiredEvidence).toContain("Prometheus scrape config hash");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "ollama_metrics_live_drift_integrity")?.requiredEvidence).toContain("time per token");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "ollama_metrics_live_drift_integrity")?.migration).toContain("ollama-metrics");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "recovery_bench_live_drift_integrity")?.requiredEvidence).toContain("failed-trajectory hash");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "recovery_bench_live_drift_integrity")?.requiredEvidence).toContain("message mode");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "recovery_bench_live_drift_integrity")?.migration).toContain("Recovery-Bench");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "geospatial_tool_calling_provider_drift")?.requiredEvidence).toContain("tool-registry hash");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "geospatial_tool_calling_provider_drift")?.requiredEvidence).toContain("token-cost report hash");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "geospatial_tool_calling_provider_drift")?.migration).toContain("GeoBenchX");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "llm_rag_eval_suite_live_drift_integrity")?.requiredEvidence).toContain("candidate-manifest hash");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "llm_rag_eval_suite_live_drift_integrity")?.requiredEvidence).toContain("hallucination or faithfulness metric id");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "llm_rag_eval_suite_live_drift_integrity")?.migration).toContain("AIAnytime");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "kite_rag_live_drift_integrity")?.requiredEvidence).toContain("query-set hash");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "kite_rag_live_drift_integrity")?.requiredEvidence).toContain("small-sample warning");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "kite_rag_live_drift_integrity")?.migration).toContain("KITE");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "poker_eval_live_drift_integrity")?.requiredEvidence).toContain("hand-history manifest hash");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "poker_eval_live_drift_integrity")?.requiredEvidence).toContain("VPIP rate");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "poker_eval_live_drift_integrity")?.migration).toContain("PokerEval");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "multi_user_question_explainability_integrity")?.requiredEvidence).toContain("user-role manifest hash");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "multi_user_question_explainability_integrity")?.requiredEvidence).toContain("queue fairness score");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "multi_user_question_explainability_integrity")?.migration).toContain("Multi-User-LLM-Agent");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "professional_task_question_explainability_integrity")?.requiredEvidence).toContain("world-model config hash");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "professional_task_question_explainability_integrity")?.requiredEvidence).toContain("verifier vote count");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "professional_task_question_explainability_integrity")?.migration).toContain("OccuBench");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "continual_learning_question_explainability_integrity")?.requiredEvidence).toContain("state mutation trace hash");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "continual_learning_question_explainability_integrity")?.requiredEvidence).toContain("retention score");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "continual_learning_question_explainability_integrity")?.migration).toContain("CL-Bench");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "agent_trial_statistical_question_explainability_integrity")?.requiredEvidence).toContain("Wilson confidence level");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "agent_trial_statistical_question_explainability_integrity")?.requiredEvidence).toContain("non-regression p-value threshold");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "agent_trial_statistical_question_explainability_integrity")?.migration).toContain("AgentTrial");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "codequest_quality_question_explainability_integrity")?.requiredEvidence).toContain("source archive/status hash");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "codequest_quality_question_explainability_integrity")?.requiredEvidence).toContain("optimizer-grounding coverage");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "codequest_quality_question_explainability_integrity")?.migration).toContain("CodeQuest");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "besttester_replay_integrity")?.requiredEvidence).toContain("Playwright config hash");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "besttester_replay_integrity")?.requiredEvidence).toContain("LLM judge agreement");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "besttester_replay_integrity")?.migration).toContain("BestTester");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "critic_rubrics_methodology_integrity")?.requiredEvidence).toContain("rubric feature taxonomy hash");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "critic_rubrics_methodology_integrity")?.requiredEvidence).toContain("function-calling schema hash");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "critic_rubrics_methodology_integrity")?.requiredEvidence).toContain("sparse outcome proxy manifest hash");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "critic_rubrics_methodology_integrity")?.migration).toContain("Critic Rubrics");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "agent_belt_methodology_versioning_integrity")?.requiredEvidence).toContain("workspace-diff check hash");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "agent_belt_methodology_versioning_integrity")?.requiredEvidence).toContain("pass^k reliability policy hash");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "agent_belt_methodology_versioning_integrity")?.requiredEvidence).toContain("package release digest");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "agent_belt_methodology_versioning_integrity")?.publicDisclosure).toContain("source metadata alone");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "agent_belt_methodology_versioning_integrity")?.migration).toContain("Agent Belt");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "agentkernelarena_gpu_kernel_replay_integrity")?.requiredEvidence).toContain("GPU profile hash");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "agentkernelarena_gpu_kernel_replay_integrity")?.requiredEvidence).toContain("speedup delta");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "agentkernelarena_gpu_kernel_replay_integrity")?.migration).toContain("AgentKernelArena");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "llm_evaluation_system_jury_replay_integrity")?.requiredEvidence).toContain("MCP install manifest hash");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "llm_evaluation_system_jury_replay_integrity")?.requiredEvidence).toContain("OpenTelemetry trace hash");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "llm_evaluation_system_jury_replay_integrity")?.migration).toContain("LLM Evaluation System");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "innovatorbench_research_replay_integrity")?.requiredEvidence).toContain("ResearchGym config hash");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "innovatorbench_research_replay_integrity")?.requiredEvidence).toContain("checkpoint-restore coverage");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "innovatorbench_research_replay_integrity")?.migration).toContain("InnovatorBench");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "iot_firmware_question_explainability_integrity")?.requiredEvidence).toContain("hardware session hash");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "iot_firmware_question_explainability_integrity")?.requiredEvidence).toContain("token-efficiency ratio");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "iot_firmware_question_explainability_integrity")?.migration).toContain("Adsum-IoT-Coder");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "retail_sales_question_explainability_integrity")?.requiredEvidence).toContain("order ledger hash");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "retail_sales_question_explainability_integrity")?.requiredEvidence).toContain("model provider matrix hash");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "retail_sales_question_explainability_integrity")?.migration).toContain("ShampooSalesAgent");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "scorable_studio_drilldown_integrity")?.requiredEvidence).toContain("CLI execution-log command hash");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "scorable_studio_drilldown_integrity")?.requiredEvidence).toContain("empty-state hash");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "scorable_studio_drilldown_integrity")?.migration).toContain("scorable-sdk");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "knowlytics_ai_replay_integrity")?.requiredEvidence).toContain("AMC-owned synthetic document corpus hash");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "knowlytics_ai_replay_integrity")?.requiredEvidence).toContain("secret-placeholder review proof");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "knowlytics_ai_replay_integrity")?.publicDisclosure).toContain("source metadata alone");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "knowlytics_ai_replay_integrity")?.migration).toContain("Knowlytics-AI");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "calibra_public_methodology_integrity")?.requiredEvidence).toContain("campaign matrix hash");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "calibra_public_methodology_integrity")?.requiredEvidence).toContain("methodology deprecation notice");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "calibra_public_methodology_integrity")?.publicDisclosure).toContain("source metadata alone");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "calibra_public_methodology_integrity")?.migration).toContain("Calibra");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "garage_rag_grounding_live_drift_integrity")?.requiredEvidence).toContain("grounding annotation schema hash");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "garage_rag_grounding_live_drift_integrity")?.requiredEvidence).toContain("citation support");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "garage_rag_grounding_live_drift_integrity")?.publicDisclosure).toContain("source metadata alone");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "garage_rag_grounding_live_drift_integrity")?.migration).toContain("GaRAGe");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "llm_prompting_tests_public_methodology_integrity")?.requiredEvidence).toContain("prompt catalog tree hash");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "llm_prompting_tests_public_methodology_integrity")?.requiredEvidence).toContain("prompt taxonomy hash");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "llm_prompting_tests_public_methodology_integrity")?.requiredEvidence).toContain("methodology deprecation notice");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "llm_prompting_tests_public_methodology_integrity")?.publicDisclosure).toContain("source metadata alone");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "llm_prompting_tests_public_methodology_integrity")?.migration).toContain("llm-prompting-tests");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "hermes_turbo_question_explainability_integrity")?.requiredEvidence).toContain("perf-budget workflow hash");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "hermes_turbo_question_explainability_integrity")?.requiredEvidence).toContain("p95 latency and threshold");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "hermes_turbo_question_explainability_integrity")?.publicDisclosure).toContain("source metadata alone");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "hermes_turbo_question_explainability_integrity")?.migration).toContain("Hermes Turbo Agent");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "rss_market_impact_methodology_integrity")?.requiredEvidence).toContain("feed source hash");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "rss_market_impact_methodology_integrity")?.requiredEvidence).toContain("prompt/schema policy hash");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "rss_market_impact_methodology_integrity")?.publicDisclosure).toContain("source metadata alone");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "rss_market_impact_methodology_integrity")?.migration).toContain("trump_rss_trade");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "credence_engine_live_drift_integrity")?.requiredEvidence).toContain("value-of-information policy hash");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "credence_engine_live_drift_integrity")?.requiredEvidence).toContain("expected-utility gain");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "credence_engine_live_drift_integrity")?.publicDisclosure).toContain("source metadata alone");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "credence_engine_live_drift_integrity")?.migration).toContain("credence-engine");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "gto_wizard_poker_replay_integrity")?.requiredEvidence).toContain("no-solver-access policy hash");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "gto_wizard_poker_replay_integrity")?.requiredEvidence).toContain("AIVAT score delta");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "gto_wizard_poker_replay_integrity")?.migration).toContain("GTO Wizard");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "sap_agent_eval_tutorial_live_drift_integrity")?.requiredEvidence).toContain("objective taxonomy value");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "sap_agent_eval_tutorial_live_drift_integrity")?.requiredEvidence).toContain("role-access policy hash");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "sap_agent_eval_tutorial_live_drift_integrity")?.migration).toContain("SAP agent evaluation");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "agent_eval_observability_live_drift_integrity")?.requiredEvidence).toContain("OpenTelemetry trace hash");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "agent_eval_observability_live_drift_integrity")?.requiredEvidence).toContain("Fabric dashboard hash");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "agent_eval_observability_live_drift_integrity")?.migration).toContain("agent-evaluation observability");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "agent_eval_harness_live_drift_integrity")?.requiredEvidence).toContain("trace collector hash");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "agent_eval_harness_live_drift_integrity")?.requiredEvidence).toContain("tool-success rate");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "agent_eval_harness_live_drift_integrity")?.migration).toContain("agent-eval-harness");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "strands_benchmark_harness_live_drift_integrity")?.requiredEvidence).toContain("trajectory manifest hash");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "strands_benchmark_harness_live_drift_integrity")?.requiredEvidence).toContain("patch apply rate");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "strands_benchmark_harness_live_drift_integrity")?.migration).toContain("Strands benchmark harness");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "costnav_physical_navigation_replay_integrity")?.requiredEvidence).toContain("economic-cost model hash");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "costnav_physical_navigation_replay_integrity")?.requiredEvidence).toContain("navigation success rate");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "costnav_physical_navigation_replay_integrity")?.migration).toContain("CostNav");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "terminalworld_replay_integrity")?.requiredEvidence).toContain("AllPassing/Nop/Partial trial hashes");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "terminalworld_replay_integrity")?.requiredEvidence).toContain("human verification hash");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "terminalworld_replay_integrity")?.migration).toContain("TerminalWorld");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "nomiracl_multilingual_rag_live_drift_integrity")?.requiredEvidence).toContain("qrels manifest hash");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "nomiracl_multilingual_rag_live_drift_integrity")?.requiredEvidence).toContain("abstention accuracy");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "nomiracl_multilingual_rag_live_drift_integrity")?.migration).toContain("NoMIRACL");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "scaling_law_discovery_live_drift_integrity")?.requiredEvidence).toContain("train split hash");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "scaling_law_discovery_live_drift_integrity")?.requiredEvidence).toContain("R2, NMSE, NMAE");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "scaling_law_discovery_live_drift_integrity")?.migration).toContain("SLDBench-style");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "scenario_simulation_replay_integrity")?.requiredEvidence).toContain("action trace hash");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "scenario_simulation_replay_integrity")?.requiredEvidence).toContain("checkpoint resume proof");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "scenario_simulation_replay_integrity")?.migration).toContain("leaf-playground-style");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "warehouse_native_llm_eval_replay_integrity")?.requiredEvidence).toContain("warehouse AI function manifest hash");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "warehouse_native_llm_eval_replay_integrity")?.requiredEvidence).toContain("data-egress-blocked proof");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "warehouse_native_llm_eval_replay_integrity")?.migration).toContain("dbt-llm-evals-style");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "llm_workflow_observability_methodology_integrity")?.requiredEvidence).toContain("trace schema version");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "llm_workflow_observability_methodology_integrity")?.requiredEvidence).toContain("user-feedback collection schema hash");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "llm_workflow_observability_methodology_integrity")?.migration).toContain("AgiFlow-style");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "sutro_batch_methodology_versioning_integrity")?.requiredEvidence).toContain("input-order preservation hash");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "sutro_batch_methodology_versioning_integrity")?.requiredEvidence).toContain("dry-run cost estimate hash");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "sutro_batch_methodology_versioning_integrity")?.migration).toContain("Sutro");
    expect(first.limitations.some((limitation) => limitation.includes("Sutro-style batch methodology-versioning claims require"))).toBe(true);
    expect(first.limitations.some((limitation) => limitation.includes("Kubernetes operational-agent metric-validity claims require"))).toBe(true);
    expect(first.limitations.some((limitation) => limitation.includes("SecureVibeBench-style secure-coding metric-validity claims require"))).toBe(true);
    expect(first.limitations.some((limitation) => limitation.includes("Awesome-AI-Evaluation-Guide-style public methodology claims require"))).toBe(true);
    expect(first.limitations.some((limitation) => limitation.includes("Darwin Godel Machine-style live-drift claims require"))).toBe(true);
    expect(first.limitations.some((limitation) => limitation.includes("Effect-autoagent-style replay-corpus claims require"))).toBe(true);
    expect(first.limitations.some((limitation) => limitation.includes("llm-prompting-tests-style public methodology claims require"))).toBe(true);
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "research_run_live_drift_integrity")?.requiredEvidence).toContain("pruned repository hash");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "research_run_live_drift_integrity")?.requiredEvidence).toContain("inspection report hash");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "research_run_live_drift_integrity")?.migration).toContain("ResearchGym");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "rag_eval_flow_replay_integrity")?.requiredEvidence).toContain("pipeline config hash");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "rag_eval_flow_replay_integrity")?.requiredEvidence).toContain("score-delta report hash");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "rag_eval_flow_replay_integrity")?.migration).toContain("Rag-Eval-flow");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "rag_eval_dataset_replay_integrity")?.requiredEvidence).toContain("endpoint response trace hash");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "rag_eval_dataset_replay_integrity")?.requiredEvidence).toContain("endpoint response coverage");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "rag_eval_dataset_replay_integrity")?.migration).toContain("rag-eval");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "bio_kg_bench_replay_integrity")?.requiredEvidence).toContain("knowledge graph manifest hash");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "bio_kg_bench_replay_integrity")?.requiredEvidence).toContain("KGCheck/KGQA/SCV task-kind coverage");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "bio_kg_bench_replay_integrity")?.migration).toContain("BioKGBench");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "biomedarena_replay_integrity")?.requiredEvidence).toContain("harness CLI hash");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "biomedarena_replay_integrity")?.requiredEvidence).toContain("tool sandbox verification");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "biomedarena_replay_integrity")?.migration).toContain("BioMedArena");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "mirage_drug_repositioning_metric_validity")?.requiredEvidence).toContain("train/test split manifest hash");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "mirage_drug_repositioning_metric_validity")?.requiredEvidence).toContain("similarity matrix manifest hash");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "mirage_drug_repositioning_metric_validity")?.migration).toContain("ARIASHA/MiRAGE");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "gui_navigation_live_drift_integrity")?.requiredEvidence).toContain("validator config hash");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "gui_navigation_live_drift_integrity")?.requiredEvidence).toContain("screenshot trace hash");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "gui_navigation_live_drift_integrity")?.migration).toContain("OSUniverse-style");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "physical_risk_awareness_methodology_integrity")?.requiredEvidence).toContain("physical-risk scenario manifest hash");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "physical_risk_awareness_methodology_integrity")?.requiredEvidence).toContain("task risk rate threshold");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "physical_risk_awareness_methodology_integrity")?.migration).toContain("EARBench");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "llmops_pipeline_methodology_integrity")?.requiredEvidence).toContain("model registry or artifact manifest hash");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "llmops_pipeline_methodology_integrity")?.requiredEvidence).toContain("monitoring telemetry baseline hash");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "llmops_pipeline_methodology_integrity")?.migration).toContain("LLMOPS");
    expect(first.benchmarkMethodologyVersioning.requiredAuditFields).toEqual([
      "corpusVersion",
      "harnessVersion",
      "modelPoolVersion",
      "tierPolicyVersion",
      "verificationProtocolVersion",
      "scoringFormulaVersion",
      "costAccountingVersion",
      "telemetrySchemaVersion",
      "calibrationProtocolVersion"
    ]);
    expect(first.benchmarkMethodologyVersioning.tracks.map((track) => track.track)).toEqual([
      "static_offline",
      "live_dynamic"
    ]);
    expect(first.benchmarkMethodologyVersioning.changeTriggers.map((trigger) => trigger.trigger)).toContain("model_pool_or_tier_policy_change");
    expect(first.benchmarkMethodologyVersioning.changeTriggers.map((trigger) => trigger.trigger)).toContain("verification_protocol_or_scoring_change");
    expect(first.benchmarkMethodologyVersioning.changeTriggers.map((trigger) => trigger.trigger)).toContain("tournament_or_leaderboard_protocol_change");
    expect(first.benchmarkMethodologyVersioning.changeTriggers.map((trigger) => trigger.trigger)).toContain("multimodal_rag_corpus_or_metric_change");
    expect(first.benchmarkMethodologyVersioning.changeTriggers.map((trigger) => trigger.trigger)).toContain("rag_audit_dataset_or_diagnosis_change");
    expect(first.benchmarkMethodologyVersioning.changeTriggers.map((trigger) => trigger.trigger)).toContain("soc_dataset_schema_or_label_quality_change");
    expect(first.benchmarkMethodologyVersioning.changeTriggers.map((trigger) => trigger.trigger)).toContain("legal_code_rag_metric_validity_change");
    expect(first.benchmarkMethodologyVersioning.changeTriggers.map((trigger) => trigger.trigger)).toContain("network_troubleshooting_metric_or_scenario_change");
    expect(first.benchmarkMethodologyVersioning.changeTriggers.map((trigger) => trigger.trigger)).toContain("inference_optimization_metric_validity_change");
    expect(first.benchmarkMethodologyVersioning.changeTriggers.map((trigger) => trigger.trigger)).toContain("java_coding_agent_metric_validity_change");
    expect(first.benchmarkMethodologyVersioning.changeTriggers.map((trigger) => trigger.trigger)).toContain("web_eval_dataset_metric_validity_change");
    expect(first.benchmarkMethodologyVersioning.changeTriggers.map((trigger) => trigger.trigger)).toContain("resume_rag_evaluator_metric_validity_change");
    expect(first.benchmarkMethodologyVersioning.changeTriggers.map((trigger) => trigger.trigger)).toContain("chipbenchmark_metric_validity_change");
    expect(first.benchmarkMethodologyVersioning.changeTriggers.map((trigger) => trigger.trigger)).toContain("cooperbench_metric_validity_change");
    expect(first.benchmarkMethodologyVersioning.changeTriggers.map((trigger) => trigger.trigger)).toContain("codercup_metric_validity_change");
    expect(first.benchmarkMethodologyVersioning.changeTriggers.map((trigger) => trigger.trigger)).toContain("awesome_agent_memory_live_drift_change");
    expect(first.benchmarkMethodologyVersioning.changeTriggers.map((trigger) => trigger.trigger)).toContain("agent_reading_test_live_drift_change");
    expect(first.benchmarkMethodologyVersioning.changeTriggers.map((trigger) => trigger.trigger)).toContain("agent_scenario_test_metric_validity_change");
    expect(first.benchmarkMethodologyVersioning.changeTriggers.map((trigger) => trigger.trigger)).toContain("opencode_lab_metric_validity_change");
    expect(first.benchmarkMethodologyVersioning.changeTriggers.map((trigger) => trigger.trigger)).toContain("cc_plugin_eval_metric_validity_change");
    expect(first.benchmarkMethodologyVersioning.changeTriggers.map((trigger) => trigger.trigger)).toContain("realign_simulation_metric_validity_change");
    expect(first.benchmarkMethodologyVersioning.changeTriggers.map((trigger) => trigger.trigger)).toContain("humanstudybench_metric_validity_change");
    expect(first.benchmarkMethodologyVersioning.changeTriggers.map((trigger) => trigger.trigger)).toContain("bioinformatics_agent_metric_validity_change");
    expect(first.benchmarkMethodologyVersioning.changeTriggers.map((trigger) => trigger.trigger)).toContain("mobile_agent_metric_validity_change");
    expect(first.benchmarkMethodologyVersioning.changeTriggers.map((trigger) => trigger.trigger)).toContain("document_rag_memory_replay_change");
    expect(first.benchmarkMethodologyVersioning.changeTriggers.map((trigger) => trigger.trigger)).toContain("clonemem_long_term_memory_replay_change");
    expect(first.benchmarkMethodologyVersioning.changeTriggers.map((trigger) => trigger.trigger)).toContain("researchharness_agent_replay_change");
    expect(first.benchmarkMethodologyVersioning.changeTriggers.map((trigger) => trigger.trigger)).toContain("gto_wizard_poker_replay_change");
    expect(first.benchmarkMethodologyVersioning.changeTriggers.map((trigger) => trigger.trigger)).toContain("agent_mont_monitoring_replay_change");
    expect(first.benchmarkMethodologyVersioning.changeTriggers.map((trigger) => trigger.trigger)).toContain("nuclia_rag_triad_replay_change");
    expect(first.benchmarkMethodologyVersioning.changeTriggers.map((trigger) => trigger.trigger)).toContain("edge_ai_agent_replay_change");
    expect(first.benchmarkMethodologyVersioning.changeTriggers.map((trigger) => trigger.trigger)).toContain("agent_workflow_kit_replay_change");
    expect(first.benchmarkMethodologyVersioning.changeTriggers.map((trigger) => trigger.trigger)).toContain("medask_clinical_benchmark_replay_change");
    expect(first.benchmarkMethodologyVersioning.changeTriggers.map((trigger) => trigger.trigger)).toContain("mirage_multimodal_rag_dataset_replay_change");
    expect(first.benchmarkMethodologyVersioning.changeTriggers.map((trigger) => trigger.trigger)).toContain("bio_kg_bench_replay_change");
    expect(first.benchmarkMethodologyVersioning.changeTriggers.map((trigger) => trigger.trigger)).toContain("biomedarena_replay_change");
    expect(first.benchmarkMethodologyVersioning.changeTriggers.map((trigger) => trigger.trigger)).toContain("mirage_drug_repositioning_metric_validity_change");
    expect(first.benchmarkMethodologyVersioning.changeTriggers.map((trigger) => trigger.trigger)).toContain("ai_agent_benchmark_comparison_replay_change");
    expect(first.benchmarkMethodologyVersioning.changeTriggers.map((trigger) => trigger.trigger)).toContain("gaia_agent_replay_change");
    expect(first.benchmarkMethodologyVersioning.changeTriggers.map((trigger) => trigger.trigger)).toContain("paperarena_replay_change");
    expect(first.benchmarkMethodologyVersioning.changeTriggers.map((trigger) => trigger.trigger)).toContain("besttester_replay_change");
    expect(first.benchmarkMethodologyVersioning.changeTriggers.map((trigger) => trigger.trigger)).toContain("academiclaw_metric_validity_change");
    expect(first.benchmarkMethodologyVersioning.changeTriggers.map((trigger) => trigger.trigger)).toContain("rag_eval_flow_replay_change");
    expect(first.benchmarkMethodologyVersioning.changeTriggers.map((trigger) => trigger.trigger)).toContain("rag_eval_dataset_replay_change");
    expect(first.benchmarkMethodologyVersioning.changeTriggers.map((trigger) => trigger.trigger)).toContain("a2a_negotiation_transaction_methodology_change");
    expect(first.benchmarkMethodologyVersioning.changeTriggers.map((trigger) => trigger.trigger)).toContain("metronous_telemetry_calibration_methodology_change");
    expect(first.benchmarkMethodologyVersioning.changeTriggers.map((trigger) => trigger.trigger)).toContain("research_run_live_drift_change");
    expect(first.benchmarkMethodologyVersioning.changeTriggers.map((trigger) => trigger.trigger)).toContain("geospatial_provider_drift_change");
    expect(first.benchmarkMethodologyVersioning.changeTriggers.map((trigger) => trigger.trigger)).toContain("llm_rag_eval_suite_live_drift_change");
    expect(first.benchmarkMethodologyVersioning.changeTriggers.map((trigger) => trigger.trigger)).toContain("kite_rag_live_drift_change");
    expect(first.benchmarkMethodologyVersioning.changeTriggers.map((trigger) => trigger.trigger)).toContain("poker_eval_live_drift_change");
    expect(first.benchmarkMethodologyVersioning.changeTriggers.map((trigger) => trigger.trigger)).toContain("physical_risk_awareness_methodology_change");
    expect(first.benchmarkMethodologyVersioning.changeTriggers.map((trigger) => trigger.trigger)).toContain("llmops_pipeline_methodology_change");
    expect(first.benchmarkMethodologyVersioning.changeTriggers.map((trigger) => trigger.trigger)).toContain("sap_agent_eval_tutorial_live_drift_change");
    expect(first.benchmarkMethodologyVersioning.changeTriggers.map((trigger) => trigger.trigger)).toContain("agent_eval_observability_live_drift_change");
    expect(first.benchmarkMethodologyVersioning.changeTriggers.map((trigger) => trigger.trigger)).toContain("agent_eval_harness_live_drift_change");
    expect(first.benchmarkMethodologyVersioning.changeTriggers.map((trigger) => trigger.trigger)).toContain("strands_benchmark_harness_live_drift_change");
    expect(first.benchmarkMethodologyVersioning.changeTriggers.map((trigger) => trigger.trigger)).toContain("costnav_physical_navigation_replay_change");
    expect(first.benchmarkMethodologyVersioning.changeTriggers.map((trigger) => trigger.trigger)).toContain("terminalworld_replay_change");
    expect(first.benchmarkMethodologyVersioning.changeTriggers.map((trigger) => trigger.trigger)).toContain("continual_learning_question_explainability_change");
    expect(first.benchmarkMethodologyVersioning.changeTriggers.map((trigger) => trigger.trigger)).toContain("iot_firmware_question_explainability_change");
    expect(first.benchmarkMethodologyVersioning.changeTriggers.map((trigger) => trigger.trigger)).toContain("retail_sales_question_explainability_change");
    expect(first.benchmarkMethodologyVersioning.changeTriggers.map((trigger) => trigger.trigger)).toContain("ragas_notebook_metric_validity_change");
    expect(first.benchmarkMethodologyVersioning.changeTriggers.map((trigger) => trigger.trigger)).toContain("legacybench_metric_validity_change");
    expect(first.benchmarkMethodologyVersioning.changeTriggers.map((trigger) => trigger.trigger)).toContain("subtlememory_metric_validity_change");
    expect(first.benchmarkMethodologyVersioning.changeTriggers.map((trigger) => trigger.trigger)).toContain("ai_reputation_claude_live_drift_change");
    expect(first.benchmarkMethodologyVersioning.changeTriggers.map((trigger) => trigger.trigger)).toContain("ctf_agent_benchmark_live_drift_change");
    expect(first.benchmarkMethodologyVersioning.changeTriggers.map((trigger) => trigger.trigger)).toContain("llm_fighter_live_drift_change");
    expect(first.benchmarkMethodologyVersioning.changeTriggers.map((trigger) => trigger.trigger)).toContain("darwin_godel_machine_live_drift_change");
    expect(first.benchmarkMethodologyVersioning.changeTriggers.map((trigger) => trigger.trigger)).toContain("nomiracl_multilingual_rag_live_drift_change");
    expect(first.benchmarkMethodologyVersioning.changeTriggers.map((trigger) => trigger.trigger)).toContain("scaling_law_discovery_live_drift_change");
    expect(first.benchmarkMethodologyVersioning.changeTriggers.map((trigger) => trigger.trigger)).toContain("ollama_metrics_live_drift_change");
    expect(first.benchmarkMethodologyVersioning.changeTriggers.map((trigger) => trigger.trigger)).toContain("recovery_bench_live_drift_change");
    expect(first.benchmarkMethodologyVersioning.changeTriggers.map((trigger) => trigger.trigger)).toContain("navi_bench_web_agent_live_drift_change");
    expect(first.benchmarkMethodologyVersioning.changeTriggers.map((trigger) => trigger.trigger)).toContain("agent_trial_statistical_question_explainability_change");
    expect(first.benchmarkMethodologyVersioning.changeTriggers.map((trigger) => trigger.trigger)).toContain("codequest_quality_question_explainability_change");
    expect(first.benchmarkMethodologyVersioning.changeTriggers.map((trigger) => trigger.trigger)).toContain("agentkernelarena_gpu_kernel_replay_change");
    expect(first.benchmarkMethodologyVersioning.changeTriggers.map((trigger) => trigger.trigger)).toContain("llm_evaluation_system_jury_replay_change");
    expect(first.benchmarkMethodologyVersioning.changeTriggers.map((trigger) => trigger.trigger)).toContain("innovatorbench_research_replay_change");
    expect(first.benchmarkMethodologyVersioning.changeTriggers.map((trigger) => trigger.trigger)).toContain("scenario_simulation_replay_change");
    expect(first.benchmarkMethodologyVersioning.changeTriggers.map((trigger) => trigger.trigger)).toContain("warehouse_native_llm_eval_replay_change");
    expect(first.benchmarkMethodologyVersioning.changeTriggers.map((trigger) => trigger.trigger)).toContain("llm_workflow_observability_methodology_change");
    expect(first.benchmarkMethodologyVersioning.changeTriggers.map((trigger) => trigger.trigger)).toContain("sutro_batch_methodology_versioning_change");
    expect(first.benchmarkMethodologyVersioning.changeTriggers.map((trigger) => trigger.trigger)).toContain("agent_belt_methodology_versioning_change");
    expect(first.benchmarkMethodologyVersioning.changeTriggers.map((trigger) => trigger.trigger)).toContain("rss_market_impact_methodology_change");
    expect(first.benchmarkMethodologyVersioning.changeTriggers.map((trigger) => trigger.trigger)).toContain("credence_engine_live_drift_change");
    expect(first.benchmarkMethodologyVersioning.changeTriggers.map((trigger) => trigger.trigger)).toContain("skill_forge_autoresearch_replay_change");
    expect(first.benchmarkMethodologyVersioning.changeTriggers.map((trigger) => trigger.trigger)).toContain("rail_score_live_drift_change");
    expect(first.benchmarkMethodologyVersioning.changeTriggers.map((trigger) => trigger.trigger)).toContain("garage_rag_grounding_live_drift_change");
    expect(first.benchmarkMethodologyVersioning.changeTriggers.map((trigger) => trigger.trigger)).toContain("llm_prompting_tests_public_methodology_change");
    expect(first.benchmarkMethodologyVersioning.changeTriggers.map((trigger) => trigger.trigger)).toContain("agent_defense_bench_provider_drift_change");
    expect(first.benchmarkMethodologyVersioning.changeTriggers.map((trigger) => trigger.trigger)).toContain("paper_read_skill_live_drift_change");
    expect(first.benchmarkMethodologyVersioning.changeTriggers.map((trigger) => trigger.trigger)).toContain("eval_ai_library_question_explainability_change");
    expect(first.benchmarkMethodologyVersioning.changeTriggers.map((trigger) => trigger.trigger)).toContain("open_model_rag_question_explainability_change");
    expect(first.benchmarkMethodologyVersioning.changeTriggers.map((trigger) => trigger.trigger)).toContain("fore_public_methodology_versioning_change");
    expect(first.benchmarkMethodologyVersioning.changeTriggers.map((trigger) => trigger.trigger)).toContain("skillmatch_resume_live_drift_change");
    expect(first.benchmarkMethodologyVersioning.changeTriggers.map((trigger) => trigger.trigger)).toContain("decibench_voice_live_drift_change");
    expect(first.benchmarkMethodologyVersioning.changeTriggers.map((trigger) => trigger.trigger)).toContain("evidra_provider_drift_change");
    expect(first.benchmarkMethodologyVersioning.changeTriggers.map((trigger) => trigger.trigger)).toContain("scorable_studio_drilldown_change");
    expect(first.benchmarkMethodologyVersioning.changeTriggers.map((trigger) => trigger.trigger)).toContain("calibra_public_methodology_change");
    expect(first.benchmarkMethodologyVersioning.changeTriggers.map((trigger) => trigger.trigger)).toContain("langsmith_eval_observability_metric_validity_change");
    expect(first.benchmarkMethodologyVersioning.changeTriggers.map((trigger) => trigger.trigger)).toContain("kubernetes_operational_agent_metric_validity_change");
    expect(first.benchmarkMethodologyVersioning.changeTriggers.map((trigger) => trigger.trigger)).toContain("secure_vibe_bench_metric_validity_change");
    expect(first.benchmarkMethodologyVersioning.changeTriggers.map((trigger) => trigger.trigger)).toContain("ai_evaluation_guide_methodology_change");
    expect(first.benchmarkMethodologyVersioning.changeTriggers.map((trigger) => trigger.trigger)).toContain("encourage_rag_replay_change");
    expect(first.metricValidationGates.map((gate) => gate.gate)).toContain("agent_mont_monitoring_replay_evidence");
    expect(first.metricValidationGates.map((gate) => gate.gate)).toContain("edge_ai_agent_replay_evidence");
    expect(first.metricValidationGates.map((gate) => gate.gate)).toContain("web_eval_dataset_coverage");
    expect(first.metricValidationGates.map((gate) => gate.gate)).toContain("langsmith_eval_observability_metric_validity");
    expect(first.metricValidationGates.map((gate) => gate.gate)).toContain("chipbenchmark_coverage");
    expect(first.metricValidationGates.map((gate) => gate.gate)).toContain("cooperbench_metric_validity");
    expect(first.metricValidationGates.map((gate) => gate.gate)).toContain("codercup_metric_validity");
    expect(first.metricValidationGates.map((gate) => gate.gate)).toContain("agent_scenario_test_coverage");
    expect(first.metricValidationGates.map((gate) => gate.gate)).toContain("open_code_lab_coverage");
    expect(first.metricValidationGates.map((gate) => gate.gate)).toContain("cc_plugin_eval_coverage");
    expect(first.metricValidationGates.map((gate) => gate.gate)).toContain("realign_simulation_coverage");
    expect(first.metricValidationGates.map((gate) => gate.gate)).toContain("academiclaw_coverage");
    expect(first.metricValidationGates.map((gate) => gate.gate)).toContain("rag_chunking_technique_coverage");
    expect(first.metricValidationGates.map((gate) => gate.gate)).toContain("kubernetes_operational_agent_coverage");
    expect(first.metricValidationGates.map((gate) => gate.gate)).toContain("secure_vibe_bench_coverage");
    expect(first.metricValidationGates.map((gate) => gate.gate)).toContain("humanstudybench_coverage");
    expect(first.metricValidationGates.map((gate) => gate.gate)).toContain("legacybench_coverage");
    expect(first.metricValidationGates.map((gate) => gate.gate)).toContain("subtlememory_metric_validity");
    expect(first.metricValidationGates.map((gate) => gate.gate)).toContain("ragas_notebook_metric_validity");
    expect(first.metricValidationGates.map((gate) => gate.gate)).toContain("agent_workflow_kit_replay_evidence");
    expect(first.metricValidationGates.map((gate) => gate.gate)).toContain("medask_clinical_benchmark_replay_evidence");
    expect(first.metricValidationGates.map((gate) => gate.gate)).toContain("biomedarena_replay_evidence");
    expect(first.metricValidationGates.map((gate) => gate.gate)).toContain("ollama_metrics_live_drift_evidence");
    expect(first.metricValidationGates.map((gate) => gate.gate)).toContain("recovery_bench_live_drift_evidence");
    expect(first.metricValidationGates.map((gate) => gate.gate)).toContain("poker_eval_live_drift_evidence");
    expect(first.metricValidationGates.map((gate) => gate.gate)).toContain("darwin_godel_machine_live_drift_evidence");
    expect(first.metricValidationGates.map((gate) => gate.gate)).toContain("rail_score_live_drift_evidence");
    expect(first.metricValidationGates.map((gate) => gate.gate)).toContain("garage_rag_grounding_live_drift_evidence");
    expect(first.metricValidationGates.map((gate) => gate.gate)).toContain("llm_prompting_tests_public_methodology_evidence");
    expect(first.metricValidationGates.map((gate) => gate.gate)).toContain("agent_defense_bench_provider_drift_evidence");
    expect(first.metricValidationGates.map((gate) => gate.gate)).toContain("paper_read_skill_live_drift_evidence");
    expect(first.metricValidationGates.map((gate) => gate.gate)).toContain("eval_ai_library_question_explainability_evidence");
    expect(first.metricValidationGates.map((gate) => gate.gate)).toContain("fore_public_methodology_versioning_evidence");
    expect(first.metricValidationGates.map((gate) => gate.gate)).toContain("heurekabench_scientific_replay_evidence");
    expect(first.metricValidationGates.map((gate) => gate.gate)).toContain("rag_contradiction_detector_replay_evidence");
    expect(first.metricValidationGates.map((gate) => gate.gate)).toContain("skillmatch_resume_live_drift_evidence");
    expect(first.metricValidationGates.map((gate) => gate.gate)).toContain("decibench_voice_live_drift_evidence");
    expect(first.metricValidationGates.map((gate) => gate.gate)).toContain("evidra_provider_drift_evidence");
    expect(first.metricValidationGates.map((gate) => gate.gate)).toContain("ravig_bench_metric_validity_evidence");
    expect(first.metricValidationGates.map((gate) => gate.gate)).toContain("scorable_studio_drilldown_evidence");
    expect(first.metricValidationGates.map((gate) => gate.gate)).toContain("knowlytics_ai_replay_evidence");
    expect(first.metricValidationGates.map((gate) => gate.gate)).toContain("calibra_public_methodology_evidence");
    expect(first.metricValidationGates.map((gate) => gate.gate)).toContain("gto_wizard_poker_replay_evidence");
    expect(first.metricValidationGates.map((gate) => gate.gate)).toContain("sap_agent_eval_tutorial_live_drift_evidence");
    expect(first.metricValidationGates.map((gate) => gate.gate)).toContain("agent_eval_observability_live_drift_evidence");
    expect(first.metricValidationGates.map((gate) => gate.gate)).toContain("hedrarag_artifact_eval_live_drift_evidence");
    expect(first.metricValidationGates.map((gate) => gate.gate)).toContain("agent_eval_harness_live_drift_evidence");
    expect(first.metricValidationGates.map((gate) => gate.gate)).toContain("strands_benchmark_harness_live_drift_evidence");
    expect(first.metricValidationGates.map((gate) => gate.gate)).toContain("rag_eval_dataset_replay_evidence");
    expect(first.metricValidationGates.map((gate) => gate.gate)).toContain("costnav_physical_navigation_replay_evidence");
    expect(first.metricValidationGates.map((gate) => gate.gate)).toContain("terminalworld_replay_evidence");
    expect(first.metricValidationGates.map((gate) => gate.gate)).toContain("encourage_rag_replay_evidence");
    expect(first.metricValidationGates.map((gate) => gate.gate)).toContain("nuclia_rag_triad_replay_evidence");
    expect(first.metricValidationGates.map((gate) => gate.gate)).toContain("navi_bench_web_agent_live_drift_evidence");
    expect(first.metricValidationGates.map((gate) => gate.gate)).toContain("agent_trial_statistical_question_explainability_evidence");
    expect(first.metricValidationGates.map((gate) => gate.gate)).toContain("codequest_quality_question_explainability_evidence");
    expect(first.metricValidationGates.map((gate) => gate.gate)).toContain("agentkernelarena_gpu_kernel_replay_evidence");
    expect(first.metricValidationGates.map((gate) => gate.gate)).toContain("llm_evaluation_system_jury_replay_evidence");
    expect(first.metricValidationGates.map((gate) => gate.gate)).toContain("innovatorbench_research_replay_evidence");
    expect(first.externalSourceVerificationPolicy.requiredForExternalClaims).toBe(true);
    expect(first.externalSourceVerificationPolicy.acceptedStatuses).toContain("metadata_only_rejected");
    expect(first.externalSourceVerificationPolicy.metadataOnlyBoundary).toContain("Repository search metadata");
    expect(first.externalSourceVerificationPolicy.unavailableSourceGuidance).toContain("mark the source as unavailable");
    expect(first.externalSourceVerificationPolicy.legalBoundary).toContain("must not copy third-party code");
    expect(first.evaluationModeTaxonomy.find((mode) => mode.mode === "live_drift")?.publicMeaning).toContain("ADK runtime proof");
    expect(first.evaluationModeTaxonomy.find((mode) => mode.mode === "live_drift")?.proofBinding).toContain("ADK runtime");
    expect(first.evaluationModeTaxonomy.find((mode) => mode.mode === "live_drift")?.publicMeaning).toContain("PhysicianBench-style clinical EHR proof");
    expect(first.evaluationModeTaxonomy.find((mode) => mode.mode === "live_drift")?.proofBinding).toContain("PhysicianBench-style clinical EHR");
    expect(first.evaluationModeTaxonomy.find((mode) => mode.mode === "live_drift")?.publicMeaning).toContain("PIArena-style prompt-injection proof");
    expect(first.evaluationModeTaxonomy.find((mode) => mode.mode === "live_drift")?.proofBinding).toContain("PIArena-style prompt-injection");
    expect(first.evaluationModeTaxonomy.find((mode) => mode.mode === "live_drift")?.publicMeaning).toContain("RAIL Score responsible-AI guardrail proof");
    expect(first.evaluationModeTaxonomy.find((mode) => mode.mode === "live_drift")?.proofBinding).toContain("RAIL Score source/package/release/client/policy");
    expect(first.evaluationModeTaxonomy.find((mode) => mode.mode === "live_drift")?.publicMeaning).toContain("BackdoorAgent-style backdoor proof");
    expect(first.evaluationModeTaxonomy.find((mode) => mode.mode === "live_drift")?.proofBinding).toContain("BackdoorAgent-style stage-aware backdoor");
    expect(first.evaluationModeTaxonomy.find((mode) => mode.mode === "live_drift")?.publicMeaning).toContain("ResearchGym-style research-run proof");
    expect(first.evaluationModeTaxonomy.find((mode) => mode.mode === "live_drift")?.proofBinding).toContain("ResearchGym-style research-run");
    expect(first.evaluationModeTaxonomy.find((mode) => mode.mode === "live_drift")?.publicMeaning).toContain("OSUniverse-style GUI-navigation proof");
    expect(first.evaluationModeTaxonomy.find((mode) => mode.mode === "live_drift")?.proofBinding).toContain("OSUniverse-style GUI-navigation");
    expect(first.evaluationModeTaxonomy.find((mode) => mode.mode === "live_drift")?.publicMeaning).toContain("LLM/RAG multi-metric eval-suite proof");
    expect(first.evaluationModeTaxonomy.find((mode) => mode.mode === "live_drift")?.proofBinding).toContain("LLM/RAG eval-suite");
    expect(first.evaluationModeTaxonomy.find((mode) => mode.mode === "live_drift")?.publicMeaning).toContain("NoMIRACL-style multilingual RAG relevance proof");
    expect(first.evaluationModeTaxonomy.find((mode) => mode.mode === "live_drift")?.proofBinding).toContain("NoMIRACL-style multilingual RAG relevance");
    expect(first.evaluationModeTaxonomy.find((mode) => mode.mode === "live_drift")?.publicMeaning).toContain("SLDBench-style scaling-law discovery proof");
    expect(first.evaluationModeTaxonomy.find((mode) => mode.mode === "live_drift")?.proofBinding).toContain("SLDBench-style scaling-law discovery");
    expect(first.evaluationModeTaxonomy.find((mode) => mode.mode === "live_drift")?.publicMeaning).toContain("Ollama-metrics-style local LLM proxy/Prometheus proof");
    expect(first.evaluationModeTaxonomy.find((mode) => mode.mode === "live_drift")?.proofBinding).toContain("Ollama-metrics-style local LLM proxy/Prometheus");
    expect(first.evaluationModeTaxonomy.find((mode) => mode.mode === "live_drift")?.publicMeaning).toContain("Recovery-Bench-style recovery proof");
    expect(first.evaluationModeTaxonomy.find((mode) => mode.mode === "live_drift")?.proofBinding).toContain("Recovery-Bench-style failure replay/recovery");
    expect(first.evaluationModeTaxonomy.find((mode) => mode.mode === "live_drift")?.publicMeaning).toContain("Navi-Bench-style real-website web-agent proof");
    expect(first.evaluationModeTaxonomy.find((mode) => mode.mode === "live_drift")?.proofBinding).toContain("Navi-Bench real-website task/config/evaluator/browser/result/trajectory/visualization/score-bound evidence");
    expect(first.evaluationModeTaxonomy.find((mode) => mode.mode === "live_drift")?.publicMeaning).toContain("PokerEval-style partial-information poker simulation proof");
    expect(first.evaluationModeTaxonomy.find((mode) => mode.mode === "live_drift")?.proofBinding).toContain("PokerEval-style package/citation/simulation");
    expect(first.evaluationModeTaxonomy.find((mode) => mode.mode === "live_drift")?.publicMeaning).toContain("Strands benchmark-harness proof");
    expect(first.evaluationModeTaxonomy.find((mode) => mode.mode === "live_drift")?.proofBinding).toContain("Strands benchmark-harness source/config/task/runtime/trajectory/patch/test evidence");
    expect(first.evaluationModeTaxonomy.find((mode) => mode.mode === "provider_drift")?.publicMeaning).toContain("geospatial tool-calling proof");
    expect(first.evaluationModeTaxonomy.find((mode) => mode.mode === "provider_drift")?.proofBinding).toContain("geospatial task/dataset/tool/trace/judge proof fields");
    expect(first.evaluationModeTaxonomy.find((mode) => mode.mode === "metric_validation")?.publicMeaning).toContain("MIRAGE-style RAG metric proof");
    expect(first.evaluationModeTaxonomy.find((mode) => mode.mode === "metric_validation")?.proofBinding).toContain("MIRAGE-style");
    expect(first.evaluationModeTaxonomy.find((mode) => mode.mode === "metric_validation")?.publicMeaning).toContain("ARIASHA/MiRAGE-style drug-repositioning metric proof");
    expect(first.evaluationModeTaxonomy.find((mode) => mode.mode === "metric_validation")?.proofBinding).toContain("ARIASHA/MiRAGE-style drug-repositioning");
    expect(first.evaluationModeTaxonomy.find((mode) => mode.mode === "metric_validation")?.publicMeaning).toContain("Legal Code RAG metric proof");
    expect(first.evaluationModeTaxonomy.find((mode) => mode.mode === "metric_validation")?.proofBinding).toContain("Legal Code RAG legal-corpus");
    expect(first.evaluationModeTaxonomy.find((mode) => mode.mode === "metric_validation")?.publicMeaning).toContain("GuardBench-style guardrail metric proof");
    expect(first.evaluationModeTaxonomy.find((mode) => mode.mode === "metric_validation")?.proofBinding).toContain("GuardBench-style guardrail metric proof");
    expect(first.evaluationModeTaxonomy.find((mode) => mode.mode === "metric_validation")?.publicMeaning).toContain("NIKA-style network troubleshooting benchmark proof");
    expect(first.evaluationModeTaxonomy.find((mode) => mode.mode === "metric_validation")?.proofBinding).toContain("NIKA-style network scenario");
    expect(first.evaluationModeTaxonomy.find((mode) => mode.mode === "metric_validation")?.publicMeaning).toContain("InferenceBench-style inference optimization proof");
    expect(first.evaluationModeTaxonomy.find((mode) => mode.mode === "metric_validation")?.proofBinding).toContain("InferenceBench-style scenario");
    expect(first.evaluationModeTaxonomy.find((mode) => mode.mode === "metric_validation")?.publicMeaning).toContain("Agent Bench-style Java coding-agent proof");
    expect(first.evaluationModeTaxonomy.find((mode) => mode.mode === "metric_validation")?.proofBinding).toContain("Agent Bench-style Java task");
    expect(first.evaluationModeTaxonomy.find((mode) => mode.mode === "metric_validation")?.publicMeaning).toContain("Tavily-style web eval dataset proof");
    expect(first.evaluationModeTaxonomy.find((mode) => mode.mode === "metric_validation")?.proofBinding).toContain("Tavily-style subject/query/search-provider");
    expect(first.evaluationModeTaxonomy.find((mode) => mode.mode === "metric_validation")?.publicMeaning).toContain("BioAgentBench-style bioinformatics agent proof");
    expect(first.evaluationModeTaxonomy.find((mode) => mode.mode === "metric_validation")?.proofBinding).toContain("BioAgentBench-style task/dataset/truth");
    expect(first.evaluationModeTaxonomy.find((mode) => mode.mode === "metric_validation")?.publicMeaning).toContain("cc-plugin-eval-style component-trigger proof");
    expect(first.evaluationModeTaxonomy.find((mode) => mode.mode === "metric_validation")?.proofBinding).toContain("cc-plugin-eval-style");
    expect(first.evaluationModeTaxonomy.find((mode) => mode.mode === "metric_validation")?.publicMeaning).toContain("Realign-style simulation proof");
    expect(first.evaluationModeTaxonomy.find((mode) => mode.mode === "metric_validation")?.proofBinding).toContain("Realign-style");
    expect(first.evaluationModeTaxonomy.find((mode) => mode.mode === "metric_validation")?.publicMeaning).toContain("AcademiClaw-style academic-task proof");
    expect(first.evaluationModeTaxonomy.find((mode) => mode.mode === "metric_validation")?.proofBinding).toContain("AcademiClaw-style");
    expect(first.evaluationModeTaxonomy.find((mode) => mode.mode === "metric_validation")?.publicMeaning).toContain("RAG chunking technique proof");
    expect(first.evaluationModeTaxonomy.find((mode) => mode.mode === "metric_validation")?.proofBinding).toContain("IBM/rag-chunking-techniques-style");
    expect(first.evaluationModeTaxonomy.find((mode) => mode.mode === "metric_validation")?.publicMeaning).toContain("HumanStudy-Bench-style participant-simulation proof");
    expect(first.evaluationModeTaxonomy.find((mode) => mode.mode === "metric_validation")?.proofBinding).toContain("HumanStudy-Bench-style");
    expect(first.evaluationModeTaxonomy.find((mode) => mode.mode === "metric_validation")?.publicMeaning).toContain("Legacy-Bench-style legacy-software proof");
    expect(first.evaluationModeTaxonomy.find((mode) => mode.mode === "metric_validation")?.proofBinding).toContain("Legacy-Bench-style");
    expect(first.evaluationModeTaxonomy.find((mode) => mode.mode === "metric_validation")?.publicMeaning).toContain("SubtleMemory-style relational-memory proof");
    expect(first.evaluationModeTaxonomy.find((mode) => mode.mode === "metric_validation")?.proofBinding).toContain("SubtleMemory-style");
    expect(first.evaluationModeTaxonomy.find((mode) => mode.mode === "maturity_score")?.publicMeaning).toContain("hardware");
    expect(first.evaluationModeTaxonomy.find((mode) => mode.mode === "maturity_score")?.proofBinding).toContain("Adsum IoT Coder-style firmware hardware task");
    expect(first.evaluationModeTaxonomy.find((mode) => mode.mode === "maturity_score")?.publicMeaning).toContain("retail-sales");
    expect(first.evaluationModeTaxonomy.find((mode) => mode.mode === "maturity_score")?.proofBinding).toContain("ShampooSalesAgent-style retail sales task");
    expect(first.evaluationModeTaxonomy.find((mode) => mode.mode === "benchmark_replay")?.publicMeaning).toContain("AgentBench-style");
    expect(first.evaluationModeTaxonomy.find((mode) => mode.mode === "benchmark_replay")?.proofBinding).toContain("AgentBench-style");
    expect(first.evaluationModeTaxonomy.find((mode) => mode.mode === "benchmark_replay")?.publicMeaning).toContain("AI-agent benchmark comparison replay");
    expect(first.evaluationModeTaxonomy.find((mode) => mode.mode === "benchmark_replay")?.proofBinding).toContain("AI-agent benchmark comparison source/repository/license");
    expect(first.evaluationModeTaxonomy.find((mode) => mode.mode === "benchmark_replay")?.publicMeaning).toContain("PaperArena-style scientific-literature tool-use replay");
    expect(first.evaluationModeTaxonomy.find((mode) => mode.mode === "benchmark_replay")?.proofBinding).toContain("PaperArena source/no-license/README/requirements");
    expect(first.evaluationModeTaxonomy.find((mode) => mode.mode === "benchmark_replay")?.publicMeaning).toContain("Rag-Eval-flow-style local RAG pipeline replay");
    expect(first.evaluationModeTaxonomy.find((mode) => mode.mode === "benchmark_replay")?.proofBinding).toContain("Rag-Eval-flow-style source/repository/license");
    expect(first.evaluationModeTaxonomy.find((mode) => mode.mode === "benchmark_replay")?.publicMeaning).toContain("MiRAGE-style multimodal multihop RAG dataset-generation replay");
    expect(first.evaluationModeTaxonomy.find((mode) => mode.mode === "benchmark_replay")?.proofBinding).toContain("MiRAGE-style source/repository/license");
    expect(first.evaluationModeTaxonomy.find((mode) => mode.mode === "benchmark_replay")?.publicMeaning).toContain("Encourage-style modular RAG replay");
    expect(first.evaluationModeTaxonomy.find((mode) => mode.mode === "benchmark_replay")?.proofBinding).toContain("Encourage-style source/repository/license");
    expect(first.evaluationModeTaxonomy.find((mode) => mode.mode === "benchmark_replay")?.publicMeaning).toContain("ResearchHarness-style tool-using harness");
    expect(first.evaluationModeTaxonomy.find((mode) => mode.mode === "benchmark_replay")?.proofBinding).toContain("ResearchHarness-style source/repository/license");
    expect(first.evaluationModeTaxonomy.find((mode) => mode.mode === "benchmark_replay")?.publicMeaning).toContain("Nuclia-style RAG-triad replay");
    expect(first.evaluationModeTaxonomy.find((mode) => mode.mode === "benchmark_replay")?.proofBinding).toContain("Nuclia-style RAG-triad source/repository/license");
    expect(first.evaluationModeTaxonomy.find((mode) => mode.mode === "benchmark_replay")?.publicMeaning).toContain("AgentKernelArena-style GPU-kernel replay");
    expect(first.evaluationModeTaxonomy.find((mode) => mode.mode === "benchmark_replay")?.proofBinding).toContain("AgentKernelArena-style source/repository/license");
    expect(first.evaluationModeTaxonomy.find((mode) => mode.mode === "benchmark_replay")?.publicMeaning).toContain("LLM Evaluation System-style jury scoring replay");
    expect(first.evaluationModeTaxonomy.find((mode) => mode.mode === "benchmark_replay")?.proofBinding).toContain("LLM Evaluation System-style source/repository/license/package");
    expect(first.evaluationModeTaxonomy.find((mode) => mode.mode === "benchmark_replay")?.publicMeaning).toContain("InnovatorBench-style LLM research replay");
    expect(first.evaluationModeTaxonomy.find((mode) => mode.mode === "benchmark_replay")?.proofBinding).toContain("InnovatorBench-style source/repository/license/paper");
    expect(first.evaluationModeTaxonomy.find((mode) => mode.mode === "benchmark_replay")?.publicMeaning).toContain("Agent Workflow Kit-style workflow replay");
    expect(first.evaluationModeTaxonomy.find((mode) => mode.mode === "benchmark_replay")?.proofBinding).toContain("Agent Workflow Kit-style source/repository/license");
    expect(first.evaluationModeTaxonomy.find((mode) => mode.mode === "benchmark_replay")?.publicMeaning).toContain("MedAsk-style clinical diagnostic and triage benchmark");
    expect(first.evaluationModeTaxonomy.find((mode) => mode.mode === "benchmark_replay")?.proofBinding).toContain("MedAsk-style source/repository/license");
    expect(first.evaluationModeTaxonomy.find((mode) => mode.mode === "benchmark_replay")?.publicMeaning).toContain("BioKGBench-style biomedical KG checking");
    expect(first.evaluationModeTaxonomy.find((mode) => mode.mode === "benchmark_replay")?.proofBinding).toContain("BioKGBench-style source/repository/paper/license");
    expect(first.evaluationModeTaxonomy.find((mode) => mode.mode === "benchmark_replay")?.publicMeaning).toContain("BioMedArena-style biomedical harness replay");
    expect(first.evaluationModeTaxonomy.find((mode) => mode.mode === "benchmark_replay")?.proofBinding).toContain("BioMedArena-style source/repository/license");
    expect(first.evaluationModeTaxonomy.find((mode) => mode.mode === "benchmark_replay")?.publicMeaning).toContain("Social Reasoning Bench social-domain replay");
    expect(first.evaluationModeTaxonomy.find((mode) => mode.mode === "benchmark_replay")?.proofBinding).toContain("Social Reasoning Bench source/repository/license");
    expect(first.evaluationModeTaxonomy.find((mode) => mode.mode === "benchmark_replay")?.publicMeaning).toContain("BestTester QA-agent replay");
    expect(first.evaluationModeTaxonomy.find((mode) => mode.mode === "benchmark_replay")?.proofBinding).toContain("BestTester source/repository/license");
    expect(first.evaluationModeTaxonomy.find((mode) => mode.mode === "methodology_binding")?.publicMeaning).toContain("Critic Rubrics rubric-supervised critic methodology assurance");
    expect(first.evaluationModeTaxonomy.find((mode) => mode.mode === "methodology_binding")?.proofBinding).toContain("OpenHands/critic-rubrics source/repository/no-license");
    expect(first.evaluationModeTaxonomy.find((mode) => mode.mode === "methodology_binding")?.publicMeaning).toContain("Agent Belt-style reproducible coding-agent eval methodology assurance");
    expect(first.evaluationModeTaxonomy.find((mode) => mode.mode === "methodology_binding")?.proofBinding).toContain("Agent Belt source/repository/license/release");
    expect(first.evaluationModeTaxonomy.find((mode) => mode.mode === "benchmark_replay")?.publicMeaning).toContain("TerminalWorld-style");
    expect(first.evaluationModeTaxonomy.find((mode) => mode.mode === "benchmark_replay")?.proofBinding).toContain("TerminalWorld-style source/repository/paper/dataset/license");
    expect(first.limitations).toContain("BioKGBench-style biomedical KG replay claims require benchmark id/version, source/repository/paper/license refs, dataset release, knowledge graph manifest, KG build config, task/KGCheck/KGQA/SCV manifests, agent/RAG/Neo4j configs, evaluation script, result manifest, error-discovery report, replay command, CI receipt, deterministic seed, KGCheck/KGQA/SCV task-kind coverage, dataset and task counts, KGCheck/KGQA/SCV metrics, error discovery count, replay pass rate, score delta, thresholds, signed evidence refs, and row hashes; a BioKGBench label, paper abstract, dataset link, KGCheck/KGQA/SCV task name, local KG build, Neo4j mention, aggregate score, discovered-error count, README result, or copied benchmark row alone is not enough.");
    expect(first.limitations).toContain("BioMedArena-style biomedical harness replay claims require benchmark id/version, source/repository/license refs, README, pyproject, config, matrix config, harness tree, harness CLI, benchmark config, eval suite, adapter registry, tool registry, vendor manifest, baseline agent, quick-run, release-gate, result, replay, CI, benchmark-family coverage, tool-mode coverage, deterministic seed, benchmark/tool/adapter/vendor counts, baseline and candidate scores, score delta, replay pass rate, tool coverage, benchmark coverage, tool sandbox verification, thresholds, signed evidence refs, and row hashes; a BioMedArena label, repository metadata, README overview, benchmark count, tool count, local run log, aggregate score, copied result table, or harness name alone is not enough.");
    expect(first.limitations).toContain("ARIASHA/MiRAGE-style drug-repositioning metric-validity claims require benchmark identity, source/repository/paper refs, dataset release, train/test split, drug-disease mapping, drug feature, disease feature, similarity matrix, negative-sampling protocol, classifier config, feature-selection report, score-calculation manifest, evaluation report, case-study validation, metric owner, sample size, confidence interval, signed evidence refs, and row hashes; a MiRAGE label, GitHub metadata, paper link, dataset folder, notebook output, aggregate score, random-forest mention, feature-importance table, case-study name, README result, or copied dataset row alone is not enough.");
    expect(first.limitations).toContain("EARBench-style physical-risk-awareness methodology claims require benchmark identity, source/repository/paper/license refs, EARDataset or equivalent dataset manifest, physical-risk scenario manifest, domain and scene coverage, safety-guideline manifest, textual or visual observation manifest, task instruction manifest, plan-generation config, plan assessment rubric, task-risk-rate metric definition, effectiveness metric definition, mitigation prompt or policy manifest where used, signed evidence refs, row hashes, and threshold policy; a repository title, arXiv abstract, aggregate TRR, demo command, dataset filename, or copied benchmark row alone is not enough.");
    expect(first.limitations).toContain("LLMOPS-style lifecycle methodology claims require source/repository/license refs, task or pipeline manifest, dataset and split manifests, model registry or artifact manifest, training or fine-tuning config where used, evaluation config, RAG evaluation config where used, QA deployment manifest, CI/CD pipeline receipt, container or orchestration manifest, infrastructure-as-code manifest where used, monitoring telemetry baseline, model/service performance thresholds, signed evidence refs, row hashes, and migration policy; a repository title, README diagram, notebook demo, local command, cloud deployment note, dashboard screenshot, or copied pipeline config alone is not enough.");
    expect(first.limitations).toContain("Metronous-style methodology-versioning claims require methodology id, methodology version, methodology hash, question-set version, changelog row, deprecation notice, migration guidance, telemetry schema, benchmark corpus, threshold policy, model calibration report, cost-accounting policy, local archive manifest, export-sanitization policy, badge query-parameter hash, diagnostic methodology-versioning receipt, accepted evidence, rejected-evidence reasons, and row hashes; a Metronous label, repository metadata, README description, local CLI output, benchmark summary, threshold file, archive folder, model name, dashboard screenshot, or badge URL alone is not enough.");
    expect(first.limitations).toContain("Agent Belt-style coding-agent methodology claims require methodology id, methodology version, methodology hash, source repository snapshot, Apache-2.0 license boundary, release tag, README/docs refs, scenario schema and manifest, agent-adapter roster, custom-agent contract, workspace-diff checks, rule-check policy, multi-judge consensus config, per-turn judge config, pass@k reliability policy, pass^k reliability policy, worktree isolation policy, Docker sandbox policy, export format manifest, CI workflow, package release digest, diagnostic methodology-versioning receipt, accepted/rejected evidence, signed evidence refs, and row hashes; an Agent Belt label, repository metadata, README description, release tag, local eval output, scenario filename, agent adapter name, workspace diff summary, rule-check result, judge name, aggregate pass@k/pass^k number, CI badge, package artifact, or source metadata alone is not enough.");
    expect(first.limitations).toContain("MiniAppBench-style interactive HTML replay claims require benchmark id/version, source/repository/license-review refs, dataset and query-set manifests, evaluation-reference manifest, generated MiniApp and generated source-code manifests, live-instance manifest, browser-automation trace, interaction rubric, visual-render and dynamic-interaction reports, result manifest, replay command, CI receipt, task-category and query-count thresholds, deterministic seed, withheld-reference boundary proof, no-copy source-boundary proof, browser-automation success, interaction coverage, human-alignment score, replay pass rate, score delta, thresholds, signed evidence refs, and row hashes; a MiniAppBench label, repository metadata, query count, leaderboard row, copied evaluation reference, generated HTML sample, local Playwright run, screenshot, aggregate MiniAppEval score, or model/provider label alone is not enough.");
    expect(first.limitations).toContain("Spent-style session-cost replay claims require benchmark id/version, source/repository/license refs, Claude Code hook config, JSONL log manifest, pricing snapshot, classifier rules, command transcript, dashboard export, result manifest, replay command, CI receipt, privacy/no-telemetry boundary, session and tool-event counts, deterministic seed, efficiency and cost deltas, replay pass rate, classification coverage, JSON export validity, thresholds, signed evidence refs, and row hashes; a spent label, repository metadata, CLI score, local cost number, dashboard screenshot, JSON export, copied session log, aggregate efficiency score, model/provider label, or source metadata alone is not enough.");
    expect(first.limitations).toContain("FIRE-style fact-checking replay claims require benchmark id/version, source/repository/paper refs, dataset and atomic-claim manifests, retriever and verifier configs, decision policy, search-provider config, evidence/query/label traces, cost report, result manifest, replay command, CI receipt, atomic-claim and retrieval-step counts, max retrieval depth, deterministic seed, factuality and LLM/search cost deltas, replay pass rate, evidence recall, label agreement, dynamic retrieval and search-provider boundaries, thresholds, signed evidence refs, and row hashes; a FIRE label, repository metadata, paper abstract, copied diagram, local run, aggregate factuality score, cost-reduction number, search-provider label, model/provider label, or source metadata alone is not enough.");
    expect(first.limitations).toContain("Nuclia-style RAG-triad replay claims require benchmark id/version, source/repository/license refs, package version, model-card refs, model-cache policy, Hugging Face auth boundary, evaluator config, dataset manifest, question-answer-context manifest, metric manifest, answer-relevance trace, context-relevance trace, groundedness trace, result manifest, replay command, CI receipt, query/context/metric counts, deterministic seed, baseline/candidate answer relevance, context relevance, groundedness and composite scores, composite delta, regression threshold, replay pass rate, model-access boundary, no-raw-context-copy boundary, signed evidence refs, and row hashes; a Nuclia label, repository metadata, README metric list, package version, local Python snippet, Hugging Face model name, model-cache path, aggregate RAG triad score, copied question/context/answer sample, screenshot, or source metadata alone is not enough.");
    expect(first.limitations).toContain("AgentTrial-style statistical question-explainability claims require suite/source/package identity, adapter taxonomy, case id/name, suite/case/run/trial manifests, statistical report, trajectory bundle, failure-attribution proof, baseline/candidate result hashes, CI config and run id, dashboard snapshot when claimed, repeated trial counts, pass count/rate, Wilson confidence interval, bootstrap cost/latency, Agent Reliability Score, failure-attribution p-value, non-regression p-value, accepted evidence, rejected-evidence reasons, repair hint, and row-hash evidence; an AgentTrial label, repository metadata, PyPI version, local CLI output, aggregate pass rate, CI green check, dashboard screenshot, README result, or source metadata alone is not enough.");
    expect(first.limitations).toContain("CodeQuest-style quality question-explainability claims require framework id, source/repository/license/source-status proof, task id, language, code artifact, evaluator prompt/config, optimizer prompt/config, baseline and candidate evaluation hashes, evaluator feedback, optimizer grounding, improvement patch, actor-critic loop trace, regression suite, replay command, CI run/config, no-source-copy boundary, dimension count, before/after overall scores, score delta, dimension-regression count, evaluator-feedback coverage, optimizer-grounding coverage, per-dimension score deltas/statuses, accepted evidence, rejected-evidence reasons, repair hint, and row-hash evidence; a CodeQuest label, repository metadata, archived/public status, README evaluator/optimizer description, local notebook run, OpenAI API key setup, code-quality dimension name, aggregate quality score, copied prompt/config, or source metadata alone is not enough.");
    expect(first.limitations).toContain("AgentKernelArena-style GPU-kernel replay claims require benchmark id/version, source/repository/license refs, task manifest, task config, agent roster, agent config, prompt template, workspace isolation, environment manifest, GPU profile, dependency lock, compile/correctness/performance commands, baseline and candidate kernels, compile/correctness results, performance profile, score report, run log, replay command, CI receipt, comparison report, task categories, agent types, task count, deterministic seed, compilation success, correctness pass rate, speedup delta, replay pass rate, result coverage, workspace-isolation proof, no-leaderboard-only boundary, thresholds, signed evidence refs, and row hashes; an AgentKernelArena label, repository metadata, README architecture, demo URL, local run log, GPU label, agent roster name, task category, aggregate speedup, leaderboard placeholder, or source metadata alone is not enough.");
    expect(first.limitations).toContain("LLM Evaluation System-style jury replay claims require benchmark id/version, source/repository/license/package/MCP refs, dataset, synthetic QA, document-grounding, judge config, jury roster, criteria, binary-scoring policy, execution, agent trace, OpenTelemetry, Bedrock access boundary, result, analysis report, PDF report, S3 sync, replay command, CI receipt, no-config-only boundary, no-synthetic-data-copy boundary, no-PDF-report-only boundary, mode and judge-family coverage, dataset/evaluation-case counts, deterministic seed, jury-score delta, binary-scoring coverage, judge agreement, replay pass rate, report coverage, agent-trace coverage, thresholds, signed evidence refs, and row hashes; an LLM Evaluation System label, repository metadata, PyPI version, MCP install command, local run, model family, PDF screenshot, S3 bucket name, aggregate jury score, copied prompt/config, or source metadata alone is not enough.");
    expect(first.limitations).toContain("InnovatorBench-style research replay claims require benchmark id/version, source/repository/license/paper/dataset refs, task manifest, task config, ResearchGym config, agent config, tool registry, workspace dataset-path policy, environment manifest, Docker/web backend, multi-GPU/node manifest, checkpoint manifest, execution manifest, result manifest, metric manifest, score report, replay command, CI receipt, no-leaderboard-only and no-dataset-copy boundary hashes, research-domain/tool-surface/environment-mode coverage, task count, max eval times, deterministic seed, final and best score deltas, replay pass rate, result coverage, checkpoint-restore coverage, tool-evidence coverage, thresholds, signed evidence refs, and row hashes; an InnovatorBench label, repository metadata, ICLR acceptance note, Hugging Face dataset name, README leaderboard placeholder, local ResearchGym run, task-domain name, agent name, tool list, aggregate final score, copied task config, or source metadata alone is not enough.");
    expect(first.limitations).toContain("Strands benchmark-harness live-drift claims require source/repository/license refs, agent-package, harness-config, model-route, prompt-template, benchmark-suite, runtime, task-family, task-manifest, dataset-snapshot, Docker-image, environment-setup, tool-policy, trajectory, patch-artifact, test-report, result/upload manifests, safety-isolation, baseline/live run, alert-policy, task-success, patch-apply, test-pass, trajectory/evidence coverage, latency/cost, baseline/live distributions, thresholds, signed evidence refs, and row hashes; a Strands label, repository metadata, local run, benchmark name, shell transcript, copied prompt/config, aggregate score, screenshot, leaderboard/result summary, or source metadata alone is not enough.");
    expect(first.limitations).toContain("rag-eval-style document QA replay claims require source/repository/license refs, input-document manifests, processor config, prompt template, generator config, generated QA dataset, endpoint config, endpoint-response trace, ranking report, evaluation run, replay command, CI receipt, dataset id, data formats, endpoint modes, metric ids, question and endpoint counts, deterministic seed, baseline/candidate scores, score delta, replay pass rate, endpoint response coverage, thresholds, signed evidence refs, and row hashes; a rag-eval label, repository metadata, README workflow, copied generated QA pair, output JSON, endpoint URL, model/provider label, local run log, ranking report, or source metadata alone is not enough.");
    expect(first.limitations).toContain("Encourage-style modular RAG replay claims require source/repository/license refs, package and dependency manifests, RAG method, inference-runner, template, vector DB, dataset, query, reference answer, metric suite, MLflow run, result manifest, replay command, CI receipt, method/backend/vector-DB/metric ids, document and question counts, deterministic seed, baseline/candidate scores, score delta, replay pass rate, metric coverage, thresholds, signed evidence refs, and row hashes; an Encourage label, repository metadata, package version, dependency list, README feature claim, local run, vector DB label, MLflow screenshot, aggregate metric, or source metadata alone is not enough.");
    expect(first.reportBindings.badgeQueryParams).toContain("amc_methodology_assurance");
    expect(first.reportBindings.requiredAuditFields).toContain("methodologyVersioning.receiptHash");
    expect(first.methodologyVersioningAssurance.sourceRef).toBe("github:kiosvantra/metronous");
    expect(first.methodologyVersioningAssurance.requiredAuditFields).toContain("telemetrySchemaHash");
    expect(first.methodologyVersioningAssurance.requiredAuditFields).toContain("modelCalibrationReportHash");
    expect(first.methodologyVersioningAssurance.noCopyBoundary).toContain("does not copy Metronous code");
    expect(first.sutroBatchMethodologyAssurance.sourceRef).toBe("github:sutro-sh/sutro");
    expect(first.sutroBatchMethodologyAssurance.requiredAuditFields).toContain("judgeClassifierExtractorSchemaHash");
    expect(first.sutroBatchMethodologyAssurance.requiredAuditFields).toContain("dryRunCostEstimateHash");
    expect(first.sutroBatchMethodologyAssurance.noCopyBoundary).toContain("does not copy Sutro code");
    expect(first.agentBeltMethodologyAssurance.sourceRef).toBe("github:jfrog/agent-belt");
    expect(first.agentBeltMethodologyAssurance.requiredAuditFields).toContain("scenarioSchemaHash");
    expect(first.agentBeltMethodologyAssurance.requiredAuditFields).toContain("passPowerKReliabilityPolicyHash");
    expect(first.agentBeltMethodologyAssurance.requiredAuditFields).toContain("packageReleaseDigest");
    expect(first.agentBeltMethodologyAssurance.noCopyBoundary).toContain("does not copy Agent Belt code");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "encourage_rag_replay_integrity")?.requiredEvidence).toContain("MLflow run hash");
    expect(first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "encourage_rag_replay_integrity")?.publicDisclosure).toContain("source metadata alone");
    const langSmithBoundary = first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "langsmith_eval_observability_metric_validity");
    expect(langSmithBoundary?.appliesWhen).toContain("Score report");
    expect(langSmithBoundary?.appliesWhen).toContain("Shield receipt");
    expect(langSmithBoundary?.appliesWhen).toContain("Watch alert");
    expect(langSmithBoundary?.requiredEvidence).toContain("validation table artifact");
    expect(langSmithBoundary?.requiredEvidence).toContain("metric owner");
    expect(langSmithBoundary?.requiredEvidence).toContain("sample size");
    expect(langSmithBoundary?.requiredEvidence).toContain("confidence interval");
    expect(langSmithBoundary?.publicDisclosure).toContain("source metadata alone");
    const arizePhoenixBoundary = first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "arize_phoenix_eval_observability_metric_validity");
    expect(arizePhoenixBoundary?.appliesWhen).toContain("Score report");
    expect(arizePhoenixBoundary?.appliesWhen).toContain("Shield receipt");
    expect(arizePhoenixBoundary?.appliesWhen).toContain("Watch alert");
    expect(arizePhoenixBoundary?.requiredEvidence).toContain("live primary-source docs retrieval refs");
    expect(arizePhoenixBoundary?.requiredEvidence).toContain("trace/span export manifest");
    expect(arizePhoenixBoundary?.requiredEvidence).toContain("evaluator task and evaluator config manifests");
    expect(arizePhoenixBoundary?.requiredEvidence).toContain("dataset manifest");
    expect(arizePhoenixBoundary?.requiredEvidence).toContain("fail-closed threshold policy");
    expect(arizePhoenixBoundary?.requiredEvidence).toContain("signed evidence refs");
    expect(arizePhoenixBoundary?.publicDisclosure).toContain("source metadata alone");
    expect(arizePhoenixBoundary?.publicDisclosure).toContain("not a parity claim");
    expect(arizePhoenixBoundary?.publicDisclosure).toContain("does not authorize copied Phoenix website prose");
    const arizePhoenixGate = first.metricValidationGates.find((gate) => gate.gate === "arize_phoenix_observability_eval_coverage");
    expect(arizePhoenixGate?.defaultThreshold).toContain(">= 1.00 when required");
    expect(arizePhoenixGate?.migration).toContain("signed-evidence refs");
    const googleAdkBoundary = first.scoreClaimBoundaries.find((boundary) => boundary.boundary === "google_adk_eval_metric_validity");
    expect(googleAdkBoundary?.appliesWhen).toContain("Score report");
    expect(googleAdkBoundary?.appliesWhen).toContain("Shield receipt");
    expect(googleAdkBoundary?.appliesWhen).toContain("Watch alert");
    expect(googleAdkBoundary?.requiredEvidence).toContain("validation table artifact");
    expect(googleAdkBoundary?.requiredEvidence).toContain("evaluator-suite proof using existing primitives");
    expect(googleAdkBoundary?.requiredEvidence).toContain("trace-evaluation proof when traces or Watch are claimed");
    expect(googleAdkBoundary?.requiredEvidence).toContain("metric owner");
    expect(googleAdkBoundary?.requiredEvidence).toContain("sample size");
    expect(googleAdkBoundary?.requiredEvidence).toContain("confidence interval");
    expect(googleAdkBoundary?.publicDisclosure).toContain("not a Google ADK subsystem, adapter, importer, or parity claim");
    expect(googleAdkBoundary?.publicDisclosure).toContain("does not authorize copied Google ADK code");
    const googleAdkGate = first.metricValidationGates.find((gate) => gate.gate === "google_adk_eval_metric_validity");
    expect(googleAdkGate?.defaultThreshold).toContain("validationTable present");
    expect(googleAdkGate?.proofField).toContain("evaluatorSuiteCoverage");
    expect(googleAdkGate?.proofField).toContain("traceEvaluationCoverage");
    expect(first.deprecationNotice).toContain("2026.06.20-r214");
    expect(first.migrationGuidance.join("\n")).toContain("Google ADK-style agent evaluation");
    const methodologyDoc = readFileSync("docs/SCORING_METHODOLOGY.md", "utf8");
    expect(methodologyDoc).toContain("`2026.06.20-r214`");
    expect(methodologyDoc).toContain("Google ADK-style agent-toolkit evaluation metric-validity boundaries");
    expect(methodologyDoc).toContain("AMC must not add a Google ADK subsystem");
    expect(methodologyDoc).toContain("AMC must not copy Phoenix website prose");
    expect(methodologyDoc).toContain("`2026.06.19-r164`");
    expect(methodologyDoc).toContain("`2026.06.19-r163`");
    expect(methodologyDoc).toContain("`2026.06.19-r162`");
    expect(methodologyDoc).toContain("`2026.06.19-r161`");
    expect(methodologyDoc).toContain("`2026.06.19-r160`");
    expect(methodologyDoc).toContain("`2026.06.19-r159`");
    expect(methodologyDoc).toContain("Encourage-style modular RAG replay receipts");
    expect(methodologyDoc).toContain("Awesome-Agent-Memory-style memory-catalog live-drift receipts");
    expect(methodologyDoc).toContain("Agent Reading Test-style web-content reading live-drift receipts");
    expect(methodologyDoc).toContain("FishCodeTech CTF-agent benchmark live-drift receipts");
    expect(methodologyDoc).toContain("Sutro-style batch methodology-versioning");
    expect(methodologyDoc).toContain("Critic Rubrics rubric-supervised critic methodology");
    expect(methodologyDoc).toContain("`2026.06.19-r150`");
    expect(methodologyDoc).toContain("`2026.06.19-r149`");
    expect(methodologyDoc).toContain("`2026.06.17-r148`");
    expect(methodologyDoc).toContain("`2026.06.17-r147`");
    expect(methodologyDoc).toContain("`2026.06.17-r146`");
    expect(methodologyDoc).toContain("`2026.06.17-r145`");
    expect(methodologyDoc).toContain("`2026.06.17-r144`");
    expect(methodologyDoc).toContain("`2026.06.17-r143`");
    expect(methodologyDoc).toContain("`2026.06.17-r142`");
    expect(methodologyDoc).toContain("`2026.06.17-r141`");
    expect(methodologyDoc).toContain("`2026.06.17-r140`");
    expect(methodologyDoc).toContain("`2026.06.17-r133`");
    expect(methodologyDoc).toContain("`2026.06.17-r137`");
    expect(methodologyDoc).toContain("`2026.06.17-r138`");
    expect(methodologyDoc).toContain("TerminalWorld-style");
    expect(methodologyDoc).toContain("HedraRAG artifact-eval");
    expect(methodologyDoc).toContain("agent-eval-harness");
    expect(methodologyDoc).toContain("Strands benchmark-harness");
    expect(methodologyDoc).toContain("EARBench-style physical-risk-awareness");
    expect(methodologyDoc).toContain("LLMOPS-style lifecycle");
    expect(methodologyDoc).toContain("Metronous-style methodology-versioning");
    expect(first.evaluationModeTaxonomy.find((mode) => mode.mode === "benchmark_replay")?.publicMeaning).toContain("DeepMath-style math-agent");
    expect(first.evaluationModeTaxonomy.find((mode) => mode.mode === "benchmark_replay")?.proofBinding).toContain("DeepMath-style");
    expect(first.evaluationModeTaxonomy.find((mode) => mode.mode === "benchmark_replay")?.publicMeaning).toContain("JudgeIt-style LLM-as-judge");
    expect(first.evaluationModeTaxonomy.find((mode) => mode.mode === "benchmark_replay")?.proofBinding).toContain("JudgeIt-style");
    expect(first.evaluationModeTaxonomy.find((mode) => mode.mode === "benchmark_replay")?.publicMeaning).toContain("BenchLoop-style local benchmark");
    expect(first.evaluationModeTaxonomy.find((mode) => mode.mode === "benchmark_replay")?.publicMeaning).toContain("CloneMem-style non-conversational long-term-memory replay receipts");
    expect(first.evaluationModeTaxonomy.find((mode) => mode.mode === "benchmark_replay")?.proofBinding).toContain("CloneMem-style repository/source/license");
    expect(first.evaluationModeTaxonomy.find((mode) => mode.mode === "benchmark_replay")?.proofBinding).toContain("BenchLoop-style");
    expect(first.evaluationModeTaxonomy.find((mode) => mode.mode === "benchmark_replay")?.publicMeaning).toContain("scenario-simulation action-level replay");
    expect(first.evaluationModeTaxonomy.find((mode) => mode.mode === "benchmark_replay")?.proofBinding).toContain("scenario-simulation repository/source");
    expect(first.evaluationModeTaxonomy.find((mode) => mode.mode === "benchmark_replay")?.publicMeaning).toContain("warehouse-native LLM eval replay");
    expect(first.evaluationModeTaxonomy.find((mode) => mode.mode === "benchmark_replay")?.proofBinding).toContain("warehouse-native LLM eval");
    expect(first.evaluationModeTaxonomy.find((mode) => mode.mode === "benchmark_replay")?.publicMeaning).toContain("AD-GEN-style SOC dataset");
    expect(first.evaluationModeTaxonomy.find((mode) => mode.mode === "benchmark_replay")?.proofBinding).toContain("AD-GEN-style");
    expect(first.evaluationModeTaxonomy.find((mode) => mode.mode === "benchmark_replay")?.publicMeaning).toContain("DocThinker-style document");
    expect(first.evaluationModeTaxonomy.find((mode) => mode.mode === "benchmark_replay")?.proofBinding).toContain("DocThinker-style");
    expect(first.evaluationModeTaxonomy.find((mode) => mode.mode === "benchmark_replay")?.publicMeaning).toContain("FreshStack-style IR/RAG retrieval");
    expect(first.evaluationModeTaxonomy.find((mode) => mode.mode === "benchmark_replay")?.proofBinding).toContain("FreshStack-style");
    expect(first.evaluationModeTaxonomy.find((mode) => mode.mode === "benchmark_replay")?.publicMeaning).toContain("DB context enrichment");
    expect(first.evaluationModeTaxonomy.find((mode) => mode.mode === "benchmark_replay")?.proofBinding).toContain("DB context enrichment");
    expect(first.evaluationModeTaxonomy.find((mode) => mode.mode === "benchmark_replay")?.publicMeaning).toContain("rag-eval-style document QA dataset");
    expect(first.evaluationModeTaxonomy.find((mode) => mode.mode === "benchmark_replay")?.proofBinding).toContain("rag-eval-style source/repository/license");
    expect(first.limitations).toContain("Architectural repair claims must disclose false-positive handling and net codebase impact separately from repair counts.");
    expect(first.limitations).toContain("Persona-policy realism claims require evidence of human-likeness, behavior coverage, and task-goal preservation; cooperative simulator success alone is insufficient.");
    expect(first.limitations).toContain("Live CTF or cybersecurity flag-solving claims require contamination, competition-impact, first-correct-flag forwarding, and per-agent independence evidence; static or score-only CTF results are not enough.");
    expect(first.limitations).toContain("Partial-credit CTF or VM-challenge claims require dataset DOI/version, VM image version or hash, checkpoint rubrics, execution traces, environment snapshots, judge/label evidence, and isolation context; binary solved/unsolved outcomes are not enough.");
    expect(first.limitations).toContain("Checkpoint or model-ranking claims require ranking-stability evidence; pointwise scores alone are not externally reliable when evaluation noise, tail failures, data quality, or OCR readability can change ordering.");
    expect(first.limitations).toContain("Continual or lifelong-learning claims require task-sequence, retention, adaptation, forgetting-rate, environment/config, controller-log, longitudinal-run, game-build/mod/config, memory, conversation log, run-summary JSON, gameplay log, decision trace, outcome metric, improvement trend, fallback-mode, sample-size, and confidence-interval evidence where applicable; point-in-time task success is not enough.");
    expect(first.limitations).toContain("OpenCode-lab-style metric-validity claims require source reference, lab benchmark manifest, agent context manifest, prompt-variant manifest, tool-description manifest, AGENTS policy manifest, repeated-run trace, fork-agreement report, model-variance report, ground-truth correction manifest, metric-definition manifest, CI reporter, result artifact, metric owner, sample-size, confidence-interval, signed evidence, and row-hash proof; repository metadata, a README recipe, a copied prompt, a shell transcript, a context dump, a single deterministic run, or an aggregate pass rate alone is not enough.");
    expect(first.limitations).toContain("cc-plugin-eval-style metric-validity claims require source repository and license refs, plugin manifest, component inventory, trigger phrase manifest, scenario generation manifest, scenario-type coverage, execution transcript bundle, programmatic detection report, LLM judge calibration, conflict detection report, checkpoint/resume state, cost estimate report, CI reporter, result artifact, trigger accuracy, false-positive rate, false-negative rate, metric owner, sample-size, confidence-interval, signed evidence, and row-hash proof; a plugin label, README workflow, component list, trigger phrase list, generated scenario, transcript snippet, judge score, cost estimate, checkpoint file, CI status, aggregate activation rate, or source metadata alone is not enough.");
    expect(first.limitations).toContain("Realign-style simulation metric-validity claims require source repository and license refs, YAML config manifest, app-under-test manifest, dataset manifest, scenario manifest, synthetic-user persona manifest, evaluator registry, evaluator target, simulation trace, repeated-run trace, LLM judge calibration, statistical rigor report, CI regression manifest, experiment tracking manifest, result artifact, judge agreement, regression pass rate, metric owner, sample-size, confidence-interval, signed evidence, and row-hash proof; a Realign label, README claim, copied config or scenario, local simulation output, evaluator name list, single judge score, ELO-style aggregate, CI status, experiment dashboard note, archived repository status, or source metadata alone is not enough.");
    expect(first.limitations).toContain("AcademiClaw-style academic-task metric-validity claims require source repository and license/no-assertion review refs, live default-branch snapshot, README and CITATION manifests, academic task corpus, bilingual task manifest, workspace query manifest, Docker environment manifest, evaluation rubric manifest, eval-task runner manifest, OpenClaw result manifest, conversation trace manifest, meta-eval manifest, model roster manifest, metric definition, CI regression, metric owner, sample-size, confidence-interval, signed evidence, and row-hash proof; an AcademiClaw label, homepage, repository metadata, README abstract, copied task prompt, copied rubric, local OpenClaw run, model roster, aggregate score, conversation-log excerpt, meta-eval file name, or source metadata alone is not enough.");
    expect(first.limitations).toContain("IBM/rag-chunking-techniques-style metric-validity claims require source repository and license refs, live default-branch snapshot, README manifest, policy corpus manifest, simple RAG notebook manifest, smart chunking notebook manifest, RAG evaluation notebook manifest, chunking strategy manifest, retrieval pipeline manifest, embedding/vectorstore manifest, evaluation dataset manifest, metric definition, CI regression, metric owner, sample-size, confidence-interval, signed evidence, and row-hash proof; a repository label, README sentence, notebook filename, copied policy text, local notebook run, chunking strategy name, vectorstore label, aggregate RAG score, chart, or source metadata alone is not enough.");
    expect(first.limitations).toContain("HumanStudy-Bench-style participant-simulation metric-validity claims require source repository and license refs, live default-branch snapshot, study config manifest, participant-background manifest, human-response manifest, agent-response manifest, evaluator registry, metric definitions, response validator, scorer and standardizer, inter-rater agreement, test-retest reliability, validation pipeline, result artifact, CI regression, metric owner, sample-size, confidence-interval, signed evidence, and row-hash proof; a HumanStudy-Bench label, homepage, repository metadata, README abstract, copied study config, copied participant or response row, local validation output, evaluator filename, aggregate score, or source metadata alone is not enough.");
    expect(first.limitations).toContain("Legacy-Bench-style legacy-software metric-validity claims require source repository and license refs, live default-branch snapshot, README manifest, task corpus manifest, legacy-language coverage, environment manifest, harness runner manifest, agent-task manifest, patch-submission manifest, test-oracle manifest, evaluator registry, scoring metric manifest, CI regression, result artifact, replay command, metric owner, sample-size, confidence-interval, signed evidence, and row-hash proof; a Legacy-Bench label, repository metadata, README claim, task directory name, copied task prompt, copied test script, local Docker output, solution script, aggregate pass rate, language list, CI badge, replay transcript, or source metadata alone is not enough.");
    expect(first.limitations).toContain("SubtleMemory-style relational-memory metric-validity claims require source repository and license refs, live default-branch snapshot, arXiv version, Hugging Face dataset release, persona split manifest, bench-instance manifest, history-session manifest, relation taxonomy, construction pipeline, staged evaluation protocol, adapter roster, judge/evaluator config, score summary, diagnostic protocol, CI validation, metric owner, sample-size, confidence-interval, signed evidence, artifact hashes, and row-hash proof; a SubtleMemory label, repository metadata, README abstract, arXiv abstract, Hugging Face dataset card, persona folder name, copied JSON row, local run, aggregate memory score, model/provider label, or source metadata alone is not enough.");
    expect(first.limitations).toContain("Hermes Bench-style local benchmark metric-validity claims require source repository and license refs, live default-branch snapshot, README blob, build spec, backend runner, judge calibration, task registry, model/server config, adapter coverage, result schema, frontend result-review surface, backend regression, frontend regression, Docker runtime, metric owner, sample-size, confidence-interval, signed evidence refs, artifact hashes, and row hashes; a Hermes Bench label, repository metadata, README claim, local UI screenshot, benchmark-runner filename, judge filename, task registry name, adapter list, copied result row, frontend component name, Docker command, aggregate benchmark score, or source metadata alone is not enough.");
    expect(first.limitations).toContain("CooperBench-style cooperative coding benchmark metric-validity claims require source repository and no-license-boundary refs, live default-branch snapshot, release tag, README/changelog, dataset/task manifest, feature-conflict manifest, runner/coop harness, eval backend, team harness, agent-adapter roster, CI workflow, package lock, public report, metric owner, sample-size, confidence-interval, signed evidence refs, artifact hashes, and row hashes; a CooperBench label, repository metadata, README claim, release tag, local run, task folder name, feature patch, agent adapter name, team-harness file name, public report page, aggregate cooperation score, conflict-resolution rate, or source metadata alone is not enough.");
    expect(first.limitations).toContain("CoderCup-style continuous coding-agent benchmark metric-validity claims require source/license/homepage refs, live default-branch snapshot, README/contributing, CI workflow, package lock, task spec, test suite and suite indexes, runner contract, score ledger, live artifact, methodology/reference pages, cost accounting, metric owner, sample-size, confidence-interval, inter-rater agreement, test-retest reliability, regression pass rate, signed evidence refs, artifact hashes, and row hashes; a CoderCup label, repository metadata, CI badge, live leaderboard screenshot, copied score row, composite score, vendor rank, cost total, or source metadata alone is not enough.");
    expect(first.limitations).toContain("Agentic Graph RAG metric-validity claims require source repository and no-license-boundary refs, live default-branch snapshot, README manifest, graph workflow and orchestrator manifests, RAG pipeline manifest, database and vector-store manifests, evaluation metric manifest, experiment-tracking manifest, UI question-surface manifest, dependency lock manifest, metric owner, sample-size, confidence-interval, signed evidence refs, artifact hashes, and row hashes; an Agentic Graph RAG label, repository metadata, README claim, graph filename, Neo4j mention, vector-store mention, evaluation file, experiment tracker filename, Streamlit screenshot, predefined question, dependency file, aggregate retrieval score, or source metadata alone is not enough.");
    expect(first.limitations).toContain("LLM Fighter-style live-drift claims require source repository snapshot, MIT license reference, homepage reference, README blob, API and UI tree hashes, game-result endpoint, persistence schema, game engine, game runner, LLM adapter, YAML export, game UI component, baseline/live result, drift statistic, alert receipt, combat log, exported log, win-rate, game score, action-validity, combat-stability, arena/ruleset/model-roster context, evidence refs, signed evidence refs, and row hashes; an LLM Fighter label, repository metadata, README claim, homepage screenshot, game UI screenshot, copied battle log, copied YAML export, aggregate win rate, aggregate game score, model/provider label, local game run, or source metadata alone is not enough.");
    expect(first.limitations).toContain("AI Reputation Claude-style live-drift claims require source repository snapshot, no-license-boundary proof, README blob, agent roster, skill catalog, install script, review-source manifest, sentiment pipeline, competitor benchmark, response policy, crisis playbook, report template, baseline/live results, drift statistic, alert receipt, reputation score, normalized sentiment score, response quality, crisis readiness, review coverage, hallucinated citation rate, PII leak rate, response-policy compliance, platform/task/context distributions, evidence refs, signed evidence refs, and row hashes; an AI Reputation Claude label, repository metadata, README feature list, agent or skill filename, local review sample, aggregate sentiment score, competitor table, generated response, crisis-playbook excerpt, PDF report, model/provider label, or source metadata alone is not enough.");
    expect(first.limitations).toContain("FishCodeTech CTF-agent benchmark live-drift claims require source snapshot, GPL license, README, challenge catalog, challenge manifest, Docker/runtime, platform compose, backend API, MCP tool, sidecar collector, agent template, scoring service, scoreboard, flag-submission log, baseline/live result, drift statistic, alert receipt, CTF solve, first-flag-forwarding, contamination, independence, partial-credit, trace, sandbox, evidence refs, signed evidence refs, and row hashes; a benchmark label, repository metadata, README claim, copied challenge source, copied exploit path, copied flag, local Docker output, scoreboard screenshot, aggregate solve rate, sidecar log excerpt, or source metadata alone is not enough.");
    expect(first.limitations).toContain("RAGAS notebook metric-validity claims require source repository refs, no-license-boundary or license refs, notebook manifest, dependency manifest, document corpus, chunking config, testset generator config, simple/reasoning/multi_context evolution mix, generated testset manifest, RAG chain config, retriever/vectorstore config, model and embedding config, answer-context trace, RAGAS metric suite, RAGAS evaluation result, LangFuse score export, visualization artifact, metric owner, sample size, confidence interval, signed evidence refs, and row hashes; a RAGAS label, notebook filename, GitHub metadata, README claim, local notebook run, dependency list, copied output table, heatmap, LangFuse screenshot, metric names, aggregate RAGAS score, or source metadata alone is not enough.");
    expect(first.limitations).toContain("TerminalWorld-style terminal-task replay claims require benchmark id/version, source/repository/paper/dataset/license refs, public recording and metadata manifests, privacy and quality filter reports, synthesized task instruction, reference solution, task metadata, Dockerfile and Docker image proof, environment reproduction log, pre/post execution snapshots, state-test suite and result hashes, AllPassing/Nop/Partial trial proof, agent run trace, result manifest, replay command, CI receipt, verified-subset human verification when claimed, task/category/unique-command/reproduced-environment counts, deterministic seed, trial pass/failure metrics, state-assertion coverage, replay pass rate, score delta, thresholds, signed evidence refs, and row hashes; a TerminalWorld label, repository metadata, dataset card, copied README table, task count, local Docker run, aggregate pass rate, command count, or model/provider label alone is not enough.");
    expect(first.limitations).toContain("Adsum IoT Coder-style firmware question-explainability claims require benchmark/source identity, task id, platform, board id, chip family, firmware project, toolchain, SDK version, hardware session, device logs, build/flash/test artifacts, knowledge pack, task manifest, evaluator config, result artifact, privacy boundary, benchmark report, hardware-run and device counts, bug-closure, token-efficiency, log-capture thresholds, accepted evidence, rejected-evidence reasons, repair hint, and row-hash evidence; a firmware-agent label, package metadata, README capability summary, local build output, copied hardware task, aggregate BLE result, token-efficiency ratio, model/provider label, or source metadata alone is not enough.");
    expect(first.limitations).toContain("ShampooSalesAgent-style retail sales question-explainability claims require benchmark/source identity, task id, sales channel, product catalog, product description, customer scenario, conversation trace, customer intent, order-capture schema, order ledger, pricing policy, discount policy, model adapter manifest, model-provider matrix, prompt policy, recommendation policy, safety policy, privacy boundary, evaluator config, result artifact, benchmark report, provider/scenario/order counts, order-capture accuracy, policy compliance, recommendation grounding, PII redaction thresholds, accepted evidence, rejected-evidence reasons, repair hint, and row-hash evidence; a retail-sales-agent label, repository metadata, README capability summary, product-description file, local CLI/chat transcript, copied order CSV, aggregate order count, model/provider list, screenshot, or source metadata alone is not enough.");
    expect(first.limitations).toContain("Agent-eval-harness live-drift claims require run/source/repository/license proof, trace schema/collector/writer proof, adapter config, framework/trace-mode/metric-context taxonomy, trace/dataset/task/tool manifests, hallucination/pricing/metrics configs, baseline/live run hashes, comparison report, dashboard snapshot, local-storage policy, alert policy, reproducibility command, tool-success, hallucination, latency, cost, trace coverage, evidence coverage, baseline/live distributions, thresholds, signed evidence refs, and row hashes; a repository title, README feature list, copied example, copied config, dashboard screenshot, local JSON trace, CLI output, framework label, aggregate metric, or source metadata alone is not enough.");
    expect(first.limitations).toContain("Strategic multi-agent claims require public transcript, private action, rule/collision, scoring/rating, baseline, truncation/context, and uncertainty evidence; leaderboard rank alone is not enough.");
    expect(first.limitations).toContain("Iterative tournament-learning claims require tournament configuration, environment/version variant, player roster and opponent pool, code artifact hashes, battle logs or replay refs, round/seed/generation counts, ranking aggregation, repeated validation, relative-ranking uncertainty, learning deltas, opponent-code access policy, and contamination boundaries; a leaderboard row or single tournament score alone is not enough.");
    expect(first.limitations).toContain("Agent architecture reality claims require signed wrapper-agent, marketing-agent, and real-agent baselines; planning, memory, and recovery evidence; stress, network, cost, and ensemble evidence; and statistical-confidence evidence; an aggregate agent score alone is not enough.");
    expect(first.limitations).toContain("External source-backed methodology changes require live or primary-source verification with retrieval date; repository search metadata, cached snippets, local corpus fields, unavailable sources, or stale summaries can only seed triage and must be disclosed instead of used as parity proof.");
    expect(first.limitations).toContain("RAG evaluation claims require custom document/test sets, domain/jurisdiction/language/task coverage where applicable, corpus/chunking, index provenance, solution roster/config, retriever/reranker/model/judge configs, selected metrics, query-level results, metric-computation traces, logged samples with retrieved documents, evaluator evidence, report/export artifacts, and performance/cost evidence; explicit RAG evaluation-pipeline claims additionally require signed ground-truth question/answer sets, pipeline config, metric definitions, query/retrieval/generation traces, evaluation report, metric owner, sample size, and confidence interval evidence; MIRAGE-style metric-intensive RAG claims additionally require benchmark identity, dataset, QA-pair, context-pool, retrieval-pool, base/oracle/mixed protocol, retriever config, model config, LLM result, retriever result, MIRAGE metric, overall-score formula, owner, sample-size, confidence-interval, signed evidence, and row-hash proof; aggregate answer quality alone is not enough.");
    expect(first.limitations).toContain("M2RAG-style multimodal RAG methodology claims require methodology version, corpus/query/source-provenance hashes, text and image extraction/filtering/deduplication evidence, retrieval or in-document selection traces, modality representation and output-image insertion policy, evaluator/judge model and rubric hashes, text-modal metric definitions, image coherence/helpfulness/reference/recall metric definitions, overall-score formula, domain/topic coverage, thresholds, signed evidence refs, and row hashes; a text-only RAG run, aggregate multimodal score, demo transcript, README example, local evaluation log, copied benchmark row, or dataset card alone is not enough.");
    expect(first.limitations).toContain("RagScore-style RAG audit methodology claims require methodology version, generated QA dataset manifest hash, source document manifest hash, support-span provenance, QA generation prompt/audience/purpose config hash, RAG endpoint contract hash, judge model/provider config hash, evaluation run config hash, per-question result hash, detailed metric definitions for correctness/completeness/relevance/conciseness/faithfulness, failure-diagnosis taxonomy, retriever/generator attribution evidence, output report/export hashes, privacy local-vs-cloud disclosure, MCP/server telemetry boundary where used, thresholds, signed evidence refs, and row hashes; a generated QA file, notebook plot, CLI summary, screenshot, average score, provider/model label, README example, or copied evaluation row alone is not enough.");
    expect(first.limitations).toContain("DocThinker-style document RAG replay claims require benchmark identity, repository/paper/license references, document corpus, text and image-text carrier manifests, PDF processing, query and unanswerable-query sets, complexity-router config, routing decisions, perception and reasoning traces, session-KG and KG-expansion artifacts, memory policy and recall traces, retrieval/generation/observability traces, eval config, metrics report, report artifact, environment, dependency lock, replay command, deterministic seed, carrier/query/memory/retrieval coverage, document/query/memory-layer counts, routing accuracy, evidence recall, answer accuracy, unanswerable robustness, token/cost reduction, replay pass rate, score delta, thresholds, signed evidence refs, and row hashes; a local UI demo, README architecture diagram, paper abstract, upload transcript, or aggregate RAG score alone is not enough.");
    expect(first.limitations).toContain("AD-GEN-style SOC dataset replay claims require benchmark id/version, repository snapshot hash, release manifest hash, source corpus manifest hash, LAB and REAL dataset hashes, conversion script hash, labeling prompt hash, output schema hash, ATT&CK mapping hash, SOC action schema hash, validation report hash, label-quality report hash, cross-model audit report hash, dataset and code license hashes, replay command hash, deterministic seed, environment, label source, raw event count, validated record count, risk-class coverage, MITRE tactic coverage, supported action coverage, parse-success, schema-validity, verdict-consistency, unknown tactic and technique rates, invalid action count, evidence-support and ATT&CK-alignment scores, replay pass rate, score delta, thresholds, evidence refs, signed evidence, and row hashes; raw telemetry counts, generated narratives, JSONL samples, ATT&CK labels, model-audit summaries, README tables, or dataset release notes alone are not enough.");
    expect(first.limitations).toContain("MIRAGE-style RAG metric-validity claims require benchmark identity, dataset manifest, QA-pair manifest, context-pool manifest, retrieval-pool manifest, base/oracle/mixed protocol proof, retriever config, model config, LLM result report, retriever result report, MIRAGE metric report, overall-score formula, metric owner, sample size, confidence interval, signed evidence refs, and row hashes; a generic RAG score, final answer accuracy, retriever metric table, local command log, copied benchmark rows, or README result alone is not enough.");
    expect(first.limitations).toContain("Legal Code RAG metric-validity claims require repository/source/license refs, legal corpus manifests, Legifrance source-boundary proof, retriever config, vector database config, embedding model config, windowing, hybrid-search, query-rewrite, routing-policy configs, evaluation dataset, reference answers, metric definitions, evaluator config, evaluation report, legal code and jurisdiction ids, retrieval technique ids, vector-store and embedding-model ids, evaluation dataset ids, metric owner, sample size, confidence interval, signed evidence refs, and row hashes; a Legal Code RAG label, France legal-code corpus mention, Legifrance mention, Qdrant config, notebook run, local query output, README example, or aggregate RAG score alone is not enough.");
    expect(first.limitations).toContain("GuardBench-style guardrail metric-validity claims require benchmark identity, dataset manifest, dataset access policy, standardized-format proof, moderation-function contract, guardrail-model config, threshold config, prediction-score manifest, metric-suite report, confusion-matrix report, language coverage, leaderboard/export report, metric owner, sample size, confidence interval, signed evidence refs, and row hashes; a leaderboard row, final F1 score, model label, local command log, README example, copied dataset row, or export table alone is not enough.");
    expect(first.limitations).toContain("Tavily-style web eval dataset metric-validity claims require benchmark identity, source repository reference, subject manifest, generated query manifest, search provider config, retrieved document manifest, document filter manifest, QA generation manifest, reference answer manifest, dataset export manifest, output target manifest, validation report artifact, freshness snapshot, provider diversity, source coverage, answer grounding, metric owner, sample size, confidence interval, signed evidence refs, and row hashes; a web-eval generator label, source metadata, README workflow, local run, generated QA pair, saved dataset, API/provider name, screenshot, or aggregate RAG score alone is not enough.");
    expect(first.limitations).toContain("Advanced RAG notebook replay claims require course and lesson identity, notebook and notebook-output hashes, environment and dependency-lock hashes, corpus/index/query/reference-answer evidence, retrieval/generation/eval/observability traces, replay command, deterministic seed, query count, context relevance, groundedness, answer relevance, and thresholds; a notebook file or generic RAG score alone is not enough.");
    expect(first.limitations).toContain("Unified evaluation-engine replay claims require engine version, run id, modality, harness mode, run/config registry, dataset, model backend, role adapter, metric config, output contract, events JSONL, samples JSONL, summary JSON, sample/raw/visual artifact manifests where applicable, output directory, environment, dependency lock, replay command, deterministic seed, sample/metric/artifact counts, replay-artifact coverage, score mean, and thresholds; a summary file or benchmark label alone is not enough.");
    expect(first.limitations).toContain("VLA/world-model replay claims require survey and taxonomy version, paradigm, metric family, foundation model id, model/dataset/benchmark/metric/environment hashes, observation-action and predicted-observation traces, generated trajectory manifest, simulator and reward proof when claimed, policy config, replay command, deterministic seed, task/benchmark/metric counts, trajectory coverage, task success, world-model score, thresholds, evidence refs, and signed evidence; curated paper lists or aggregate embodied-AI scores alone are not enough.");
    expect(first.limitations).toContain("Web-agent privacy leakage live drift claims require benchmark id, dataset hash, task-config hash, browser environment, observation mode, action-set tag, instruction config, cookie state, environment reset, data-minimization policy, allowed/sensitive info manifests, trajectory, result artifact, leakage judge, model route, captioning model for image/SoM mode, data-minimization and leakage metrics, task success, modal leakage delta, evidence refs, signed evidence, and row hashes; a generic privacy score, final task success, or prompt variant label alone is not enough.");
    expect(first.limitations).toContain("ML-development workflow replay claims require benchmark id/version, paper or source reference, task-suite hash, task category, problem domain, task/config/workspace/runtime/dependency evidence, agent harness/config, Calipers config, Hydra override, metrics config, scoring mode, validation script, replay command, deterministic seed, run count, report and trace artifacts, baseline/candidate metrics, score delta, task pass rate, thresholds, evidence refs, signed evidence, and row hashes; an agent leaderboard row, final model metric, task label, or local command log alone is not enough.");
    expect(first.limitations).toContain("Text2SQL business-database replay claims require benchmark id/version, source reference, dataset id/version, database engine and snapshot, schema and business-domain manifests, query set, reference SQL, expected result manifest, agent harness/config, model config, tool registry, schema memory, schema-retrieval mode and trace, SQL governance config, security-control manifest, audit log, prompt/policy hash, execution trace, result artifact, replay command, deterministic seed, query count, execution accuracy, exact match, retrieval grounding, unsafe-SQL rate, RLS-violation rate, thresholds, evidence refs, signed evidence, and row hashes; a final SQL accuracy number, demo transcript, or generated query alone is not enough.");
    expect(first.limitations).toContain("AgentBench-style replay claims require benchmark id/version, paper/source reference hash, repository snapshot hash, dataset manifest hash, agent config hash, global config hash, model-server config hash, environment manifest hash, dependency lock hash, run and replay command hashes, trace-path and sample-trace hashes, result manifest hash, metrics report hash, architecture and workload labels, deterministic seed, sample/shuffle settings, saved trace proof, baseline/candidate metrics, score delta, replay pass rate, trace coverage, thresholds, evidence refs, signed evidence, and row hashes; aggregate benchmark scores, local command logs, GitHub metadata, README snippets, or copied benchmark rows alone are not enough.");
    expect(first.limitations).toContain("AI-agent benchmark comparison replay claims require source/repository/license refs, agent roster, benchmark dataset, source manifest, pricing snapshot, user-report manifest, leaderboard snapshot, score manifest, eval-pack manifest, fixture hash, replay command, result manifest, score-delta report, CI receipt, comparison run id, agent-under-test identity, family/source-category coverage, agent/source/benchmark counts, deterministic seed, baseline/candidate scores, replay pass rate, source/pricing/user-report coverage, thresholds, signed evidence refs, and row hashes; README tables, aggregate rankings, GitHub metadata, copied data rows, pricing snippets, user-report quotes, or leaderboard context alone are not enough.");
    expect(first.limitations).toContain("PaperArena replay claims require source repository refs, a no-license-boundary receipt, README/requirements/config/runner/scorer proof, dataset-builder/tool/RAG/reflector/run-script tree refs, Hugging Face dataset snapshot proof, paper and QA manifests, result and score reports, replay command, CI/lifecycle receipt, tool-surface coverage, question/paper/tool/run-script counts, deterministic seed, max steps, replay pass rate, score delta, evaluator agreement, trace coverage, result coverage, signed evidence refs, and row hashes; a PaperArena label, GitHub metadata, README abstract, project page, arXiv link, Hugging Face dataset card, run script name, model name, aggregate accuracy, performance image, or source metadata alone is not enough.");
    expect(first.limitations).toContain("Hermes Turbo-style performance question-explainability claims require source repository and license refs, live default-branch commit/tree, README and package manifests, benchmark, perf-budget, and daily-score workflow hashes, turbo-score script, performance dashboard, benchmark report, baseline/candidate results, latency and throughput traces, score manifest, regression thresholds, CI config/run, performance facet, run count, p50/p95 latency, throughput, speedup, dashboard coverage, regression pass rate, accepted evidence, rejected-evidence reasons, repair hint, and row-hash evidence; a repository title, default branch, star count, README claim, local command, dashboard screenshot, aggregate speedup, CI badge, model/provider label, or source metadata alone is not enough.");
    expect(first.limitations).toContain("RSS market-impact alert methodology claims require methodology id/version/hash, changelog row, deprecation notice, migration guidance, source repository snapshot, no-license boundary, feed source, polling window, model provider route, prompt/schema policy, importance taxonomy, asset-class taxonomy, dedupe ledger, analysis ledger, push policy, rate-limit policy, alert threshold, evaluator/backtest report, outcome-window policy, cost and latency accounting, accepted evidence, rejected-evidence reasons, signed evidence refs, and row hashes; a repository title, README summary, copied config, copied RSS or tweet row, copied analysis row, provider name, local daemon run, alert screenshot, push notification, star count, or source metadata alone is not enough.");
    expect(first.limitations).toContain("Credence Engine-style live-drift claims require source repository, AGPL license, archive status, README/SPEC/package/lock/results artifact, experiment manifest, benchmark harness, test suite, posterior trace, value-of-information policy, expected-utility policy, baseline/live result, drift statistic, alert receipt, experiment-mode and decision-policy taxonomy, decision-quality, posterior-calibration, VOI-efficiency, expected-utility-gain, evidence coverage, context-distribution, signed evidence refs, and row hashes; a repository title, archive badge, README/SPEC summary, experiment filename, aggregate decision score, posterior chart, VOI label, expected-utility claim, model/provider label, or source metadata alone is not enough.");
    expect(first.limitations).toContain("Skill Forge-style autoresearch replay claims require source repository, MIT license, homepage, README, release notes, skill spec, agent-role manifest, orchestrator/mutator/scorer/hypothesis agents, composite scoring script, templates, example session, improvement-loop manifest, mutation and revert policies, skill manifest, baseline and with-skill agent configs, eval-suite and eval-case manifests, deterministic grader, static analysis, security scan, baseline/with-skill/rerun outputs, result report, replay command, replay manifest, release-gate receipt, CI receipt, deterministic seed, eval-case count, correctness/security/completeness/robustness metrics, score delta, thresholds, signed evidence refs, and row hashes; a repository title, README summary, agent filename, example session, composite score, CI badge, local loop output, or source metadata alone is not enough.");
    expect(first.limitations).toContain("Social Reasoning Bench replay claims require source repository and license refs, README, pyproject, lockfile, data/docs/experiments/outputs/packages/scripts tree refs, runner, collector, validation script, workflow, result artifact, CI receipt, domain/package/scenario-mode coverage, data-domain count, fixture count, pipeline-output count, test count, output-artifact count, deterministic seed, replay pass rate, score delta, result coverage, signed evidence refs, and row hashes; a Social Reasoning Bench label, repository metadata, homepage, README description, local validation command, task-domain name, YAML data filename, output folder, aggregate score, model/provider label, or source metadata alone is not enough.");
    expect(first.limitations).toContain("BestTester replay claims require source repository and license refs, README, package.json, lockfile, tsconfig, Playwright config, source/test/agent/MCP/config/script/mutation/report/workflow tree refs, MCP server/client refs, LLM judge rubric, security fuzzer, Jira report, result artifact, CI receipt, capability/test-surface/agent-role coverage, workflow count, agent count, TypeScript file count, test file count, page-object count, security-signal count, Jira/Slack integration count, deterministic seed, replay pass rate, score delta, LLM judge agreement, security coverage, CI coverage, signed evidence refs, and row hashes; a BestTester label, repository metadata, README description, package keyword, local Playwright run, AI workflow name, agent filename, Jira/Slack mention, aggregate pass rate, model/provider label, or source metadata alone is not enough.");
    expect(first.limitations).toContain("Critic Rubrics methodology claims require source repository and no-license boundary refs, README, pyproject, lockfile, arXiv version, release tags, rubric base and trajectory implementations, annotator and prediction modules, typed function-calling schema, rubric feature taxonomy, trajectory converter, batch annotation docs/scripts, tests, workflows, sparse outcome proxy manifest, reranking and early-stopping metric reports, signed evidence refs, and row hashes; a Critic Rubrics label, repository metadata, arXiv abstract, README description, local batch-annotation run, model output, aggregate best-of-N or early-stopping number, or source metadata alone is not enough.");
    expect(first.limitations).toContain("Agent_Mont-style monitoring replay claims require benchmark id/version, Agent Mont benchmark id, source/repository/license refs, monitoring config, agent framework, agent/task/run traces, token-usage manifest, cost rate card, latency trace, resource-utilization proof, carbon-estimate config, log artifact, visualization artifact, metrics report, replay command, visualization modes, token/cost/latency/throughput/CPU/memory/carbon metrics, replay pass rate, metric and log coverage, thresholds, signed evidence refs, and row hashes; a dashboard screenshot, CLI summary, local log, token counter, cost number, README example, or visualization alone is not enough.");
    expect(first.limitations).toContain("Agent Workflow Kit-style workflow replay claims require source/repository/license refs, guide hash, skill-package manifest, template manifest, risk-scoring rubric, workflow-level policy, spec-layer policy, approval policy, verification-command manifest, docs-check workflow, evaluation manifest, replay command, risk score, recommended and applied levels, workflow-level match flag, spec-layer decision validity, external-approval requirement and gate proof, deterministic seed, verification/template/docs-check/replay pass rates, thresholds, signed evidence refs, and row hashes; a guide label, risk score, AGENTS.md template, copied checklist, skill package name, docs badge, or local docs check alone is not enough.");
    expect(first.limitations).toContain("MedAsk-style clinical benchmark replay claims require benchmark id/version, source/repository/license refs, requirements and setup hashes, SymptomCheck and Triage vignette manifests, evaluation scripts, patient simulator config, doctor and triage model configs, result manifests, paired analysis, run and replay commands, deterministic seed, clinical-task coverage, symptom and triage vignette counts, top-5 diagnostic accuracy, triage accuracy, urgency-class coverage, replay pass rate, score delta, thresholds, signed evidence refs, and row hashes; a MedAsk label, README run, blog result, clinical-vignette count, local model output, aggregate diagnostic accuracy, triage accuracy, or copied result table alone is not enough.");
    expect(first.limitations).toContain("DeepMath-style math-agent replay claims require benchmark id/version, repository snapshot hash, source reference hash, model config hash, base-model reference hash, GRPO config hash, vLLM config hash, agent-interface hash, sandbox policy hash, executor allowlist hash, few-shot trace hash, dataset manifest hash, evaluation script hash, inference and training run-config hashes, generated-output JSONL hash, metrics report hash, replay command hash, deterministic seed, dataset family, run mode, sample count, majority@16 accuracy, exact-answer accuracy, code-snippet use, sandbox-violation rate, execution-timeout rate, output-token reduction, replay pass rate, score delta, thresholds, evidence refs, signed evidence, and row hashes; aggregate math accuracy, README examples, local command logs, model cards, copied snippets, or a single generated solution alone is not enough.");
    expect(first.limitations).toContain("JudgeIt-style LLM-as-judge replay claims require benchmark id/version, repository snapshot hash, dataset manifest hash, golden-text manifest hash, generated-text manifest hash, pipeline config hash, judge-model config hash, judge-prompt rubric hash, human-evaluation reference hash, evaluation config hash, batch-run config hash, result export hash, metrics report hash, replay command hash, deterministic seed, pipeline type, scoring mode, sample count, baseline/candidate metrics, score delta, precision, recall, F1, human-agreement F1, false-negative rate, replay pass rate, blackbox score, whitebox trace validity, negative-testing harmful rate, thresholds, evidence refs, signed evidence, and row hashes; a UI screenshot, local command log, README metric claim, leaderboard/export table, copied dataset row, or aggregate LLM-judge score alone is not enough.");
    expect(first.limitations).toContain("BenchLoop-style local LLM benchmark replay claims require benchmark id/version, repository snapshot hash, package version hash, suite/task/frozen-task manifests, scorer/harness/provider/endpoint/model configs, machine profile, dependency lock, run config, run output manifest, metrics report, agent-loop trace, tool-call trace, token-latency trace, run persistence, export artifact, replay command, deterministic seed, suite, provider, harness, deployment mode, task/tool/turn counts, overall, quality, speed, reliability, agent, pass-rate, token-speed, time-to-first-token, replay-pass, score-delta metrics, thresholds, signed evidence refs, and row hashes; a local console score, leaderboard row, hardware label, model name, CLI transcript, README example, copied task row, or screenshot alone is not enough.");
    expect(first.limitations).toContain("FreshStack-style IR/RAG retrieval replay claims require benchmark id/version, repository snapshot hash, paper reference hash, query dataset hash, corpus dataset hash, StackOverflow query manifest hash, GitHub corpus manifest hash, dataset and code license reference hashes, BEIR-format manifest hash, nugget qrels hash, query qrels hash, query-to-nugget map hash, chunking config hash, retriever config hash, index artifact hash, runfile hash, evaluator config hash, metrics report hash, leaderboard snapshot hash, replay command hash, deterministic seed, topic, retriever kind, query count, corpus document count, topic coverage, baseline/candidate metrics, score delta, alpha-nDCG@10, coverage@20, recall@50, replay pass rate, thresholds, evidence refs, signed evidence, and row hashes; a leaderboard row, README example, local runfile, copied dataset row, model name, or aggregate retrieval score alone is not enough.");
    expect(first.limitations).toContain("DB context enrichment replay claims require benchmark id/version, repository snapshot hash, extension manifest hash, database schema hash, schema-discovery trace hash, context-set hash, template-set hash, facet-set hash, value-search-set hash, golden dataset hash, Evalbench db/model/run config hashes, LLM-rater config hash, evaluation result hash, failure-case manifest hash, hill-climb plan hash, context mutation patch hash, final-validation result hash, replay command hash, deterministic seed, database engine, context artifact mode, workflow stage, golden question count, context item count, baseline/candidate SQL accuracy, context reuse coverage, executable SQL rate, hallucinated-column rate, replay pass rate, thresholds, evidence refs, signed evidence, and row hashes; a generated context file, schema dump, local eval log, golden dataset sample, Gemini CLI transcript, README example, or aggregate SQL accuracy alone is not enough.");
    expect(first.limitations).toContain("PIArena-style prompt-injection live-drift claims require benchmark id, dataset hash/name, attack id/mode/config, defense id/config, injected-prompt hash, model config, evaluation config, result artifact, agent benchmark and suite, attack success, defense block, false-positive, agent-task success, tool-call success, evidence refs, signed evidence refs, and row hashes; generic red-team labels, unsafe-response rates, local command logs, README examples, or copied prompt-injection benchmark rows alone are not enough.");
    expect(first.limitations).toContain("BackdoorAgent-style live-drift claims require benchmark id, dataset hash, task id/family, workflow stage, attack id/family, trigger hash, poison config hash, model config hash, agent config hash, run config hash, trajectory trace hash, result artifact hash, attack success, clean task success, trigger activation, trigger persistence, trigger propagation, trajectory capture, evidence refs, signed evidence refs, and row hashes; generic red-team labels, attack demos, local command logs, aggregate ASR or clean-accuracy numbers, README examples, or copied backdoor benchmark rows alone are not enough.");
    expect(first.limitations).toContain("PhysicianBench-style clinical EHR live-drift claims require benchmark id, task-set version, paper/source reference hash, task id, specialty, task type, FHIR server image hash, FHIR API schema hash, patient-record manifest hash, patient cohort hash, verifier checkpoint hash, trajectory hash, workspace artifact hash, eval-log hash, metadata hash, model config hash, tool manifest hash, run config hash, task success, checkpoint pass rate, FHIR data-access accuracy, clinical-action safety, documentation quality, trajectory and artifact coverage, evidence refs, signed evidence refs, and row hashes; aggregate pass@1, a model ranking, a local run log, a website trajectory, or copied clinical benchmark rows alone are not enough.");
    expect(first.limitations).toContain("Business workflow automation claims require domain/task coverage, simple-baseline evidence, public/private score caveats, toolset/config controls, programmatic end-state assertions, partial-credit and strict pass-rate semantics, export artifacts, and multi-run comparison evidence; a final automation score alone is not enough.");
    expect(first.limitations).toContain("Data-agent analytical benchmark claims require task-type coverage, database/source-modality coverage, difficulty distribution, metric-computation traces, agent-workflow roster/config evidence, expert-validation evidence, cost/latency traces, and submission-schema evidence; aggregate accuracy or rubric score alone is not enough.");
    expect(first.limitations).toContain("Embodied-agent benchmark claims require task-type coverage, simulator environment config, scene or dataset package, random/human/model baselines, action-observation trajectories, result folders, overall and task-type metric reports, metric owner, sample size, and confidence interval evidence; aggregate simulator score alone is not enough.");
    expect(first.limitations).toContain("Document-to-dataset live drift claims require corpus/index/document/page/cell manifests, generated sample/export manifests, bench metric and report artifacts, numeric-guard coverage, quality metrics, token-efficiency, throughput, memory, and task/format/export context evidence; aggregate RAG score alone is not enough.");
    expect(first.limitations).toContain("Model-harness benchmark replay claims require model id, harness id, task id/source, scenario/capability/complexity/modality/environment taxonomy, grading mode, prompt/workspace/timeout/task metadata hashes, grader or judge rubric evidence, transcript and metric artifacts, submission and slice payloads, replay command, result-version path, deterministic seed, task count, and open-environment preservation evidence; an aggregate leaderboard row alone is not enough.");
    expect(first.limitations).toContain("Comparative coding-agent report replay claims require report and source identity, source-material hash, standardized prompt hash, agent roster hash, scoring rubric hash, category-score manifest hash, implementation artifact hash, screenshot manifest hash, report artifact hash, replay command, deterministic seed, agent-count coverage, category-score coverage, recommendation use cases, normalized score threshold, evidence refs, signed evidence refs, and row hashes; aggregate rankings, report PDFs, screenshots, local metadata, or copied implementation examples alone are not enough.");
    expect(first.limitations).toContain("Benchmark-hackability audit replay claims require scanner id/version, target benchmark id, source ref, target task manifest, audit config, phase traces, static-tool reports when static or hybrid analysis is claimed, AI-inspection trace when AI or hybrid analysis is claimed, vulnerability-finding manifest, dashboard/event stream, report artifact, replay command, sandbox config, sandbox network/read-only/capability controls, PoC validation, vulnerability-class coverage, task-count coverage, exploitability threshold, evidence refs, signed evidence refs, and row hashes; a dashboard screenshot, vulnerability label, generated exploit snippet, or local command log alone is not enough.");
    expect(first.limitations).toContain("Evaluator-suite metric-validity claims require deterministic assertion, LLM judge, safety assertion, red-team attack, dataset eval manifest, custom judge, reporter output, framework integration, threshold config, metric owner, sample size, and confidence interval evidence; a judge score or report artifact alone is not enough.");
    expect(first.limitations).toContain("LangSmith-style observability and evaluation metric-validity claims require an AMC-owned eval pack, validation table, project or run identity reference, dataset and experiment manifests, trace export, evaluator or feedback config, fail-closed threshold policy, metric owner, sample size, confidence interval, signed evidence refs, artifact hashes, and row hashes before Score, Shield, or Watch claims can use them; public product-page metadata, a LangSmith label, dashboard screenshot, trace id, copied evaluator name, local export, cost/latency total, aggregate score, or source metadata alone is not enough.");
    expect(first.limitations).toContain("Pentesting and threat-model benchmark metric-validity claims require Dockerized app manifests, language-stack coverage, vulnerability-class coverage, difficulty distribution, multi-step chain coverage, flag ground truth, threat-model ground truth, false-positive traps, security-control effectiveness, exploit execution trace, threat-model report, metric owner, sample size, confidence interval, signed evidence refs, and row hashes; a flag solve rate, exploit script, or threat-model score alone is not enough.");
    expect(first.limitations).toContain("Trace-derived agent-evaluation metric-validity claims require Bedrock Converse-style model config, agent-parameter manifest, tool registry, trace manifest, repeatable case manifest, dynamic expectation validator, bulk case run manifest, run permutation manifest, mock LLM backend control, metric definition manifest, measurement export manifest, production monitor binding, threshold alarm config, metric owner, sample size, confidence interval, signed evidence refs, and row hashes; a trace viewer, case list, metric table, or production alarm alone is not enough.");
    expect(first.limitations).toContain("Living-environment metric-validity claims require task-program, living-environment, environment-mutation, capability, sandbox-provider, agent-adapter, multi-turn trajectory, stage-checker, checker-result, trial-result, aggregate-metric, pass-at-k, proactive-trigger, metric-owner, sample-size, confidence-interval, signed evidence refs, and row hashes; a demo video, final task score, or static benchmark label alone is not enough.");
    expect(first.limitations).toContain("Persona-agent metric-validity claims require persona manifests, static environment manifests, benchmark question sets, persona-agent configs, model/provider configs, response traces, rubric manifests, PersonaScore-style metric definitions, human-alignment calibration, evaluation outputs, benchmark result manifests, metric owner, sample size, confidence interval, signed evidence refs, and row hashes; a persona label, final PersonaScore, demo transcript, or static benchmark name alone is not enough.");
    expect(first.limitations).toContain("Network troubleshooting metric-validity claims require benchmark manifests, paper or source references, scenario manifests, topology tier manifests, incident catalogs, fault-injection manifests, session traces, agent interface manifests, MCP/tool manifests, environment runtime manifests, evaluation metric manifests, judge config manifests, batch summaries, root-cause and localization ground truth, traffic workload manifests, metric owner, sample size, confidence interval, signed evidence refs, and row hashes; a network benchmark name, topology label, aggregate troubleshooting score, local CLI output, README example, or copied incident row alone is not enough.");
    expect(first.limitations).toContain("Inference optimization metric-validity claims require benchmark manifests, paper or source references, scenario objective manifests, hardware budget manifests, server contract manifests, runtime backend manifests, search space manifests, baseline comparison manifests, quality gate results, integrity gate results, supervised relaunch results, latency and throughput metrics, tail latency metrics, exploration trace manifests, metric owner, sample size, confidence interval, signed evidence refs, and row hashes; an inference benchmark name, aggregate speedup, local server run, GPU label, backend label, single latency number, throughput number, README result, or copied leaderboard row alone is not enough.");
    expect(first.limitations).toContain("BioAgentBench-style bioinformatics agent metric-validity claims require benchmark manifests, paper or source references, bioinformatics task manifests, input dataset manifests, truth/reference manifests, workflow reproduction manifests, Docker or environment manifests, tool-version manifests, agent-harness manifests, grader config manifests, result artifact manifests, perturbation-suite manifests, privacy-boundary manifests, metric owner, sample size, confidence interval, signed evidence refs, and row hashes; a task prompt, local pipeline run, result file, aggregate completion score, README claim, Docker command, notebook, copied task text, or copied task row alone is not enough.");
    expect(first.limitations).toContain("RAG QA dataset-builder live drift claims require builder id, dataset version, source-document manifest, source license, QA-pair manifest, passage manifest, builder config, tier, question type, stage, passage grounding, human verification, citation, answer-support, cost, batch/concurrency, source/question counts, evidence refs, signed evidence, and row hashes; a generic RAG score or dataset size alone is not enough.");
    expect(first.limitations).toContain("KITE-style RAG live-drift claims require source/repository/license refs, corpus manifest, document set, query set, ground-truth answer, rubric, RAG pipeline config, response manifest, result manifest, judge config, dataset family, RAG configuration id, grading scale, question count, document count, native and normalized grades, small-sample warning, baseline/live distributions, thresholds, signed evidence refs, and row hashes; a KITE label, folder list, judge model label, copied query, copied rubric, aggregate grade, README result, local run output, or source metadata alone is not enough.");
    expect(first.limitations).toContain("Multi-user LLM-agent question-explainability claims require benchmark/source identity, scenario id/family, capability label, dataset manifest hash, user-role manifest hash, scenario-specific permission/preference/queue/instruction proof, interaction trace hash, evaluator config hash, result artifact hash, metric report hash, user-role and turn counts, scenario-specific metric thresholds, accepted evidence, rejected-evidence reasons, repair hint, and row-hash evidence; a README scenario summary, aggregate score, local run output, copied dataset path, transcript snippet, or source metadata alone is not enough.");
    expect(first.limitations).toContain("CL-Bench-style continual-learning question-explainability claims require benchmark/source identity, domain id, workflow id, dataset manifest, state schema, initial state, state mutation trace, conversation trace, entity-relationship graph, tool-execution trace, evaluator config, result artifact, replay command, memory policy when claimed, adaptive-learning trace when claimed, scenario/turn/state-mutation/entity counts, task-completion, response-quality, state-accuracy, retention, token-cost thresholds where claimed, accepted evidence, rejected-evidence reasons, repair hint, and row-hash evidence; a repository title, CRM label, seed label, local transcript, copied task prompt, aggregate score, task-completion percentage, response-quality score, token cost, model/provider label, or source metadata alone is not enough.");
    expect(first.limitations).toContain("CPU-centric agentic workload live drift claims require benchmark id, paper reference hash, workload family, framework id, runtime, schedule mode, environment and conda hashes, hardware profile, system requirements, model-server config, API-key boundary, workload config, dataset and tool manifests, run script, result manifest, batch size, worker count, latency percentiles, throughput, CPU/GPU utilization, memory, bottleneck share metrics, evidence refs, signed evidence, and row hashes; a generic score or single latency number alone is not enough.");
    expect(first.limitations).toContain("12-technique evaluator live drift claims require technique id, suite id, notebook or recipe hash, dataset hash, LangChain or LangSmith config evidence, technique-specific reference, judge, ground-truth, trajectory, tool-schema, RAG-source, callback, or batch artifacts, per-technique metric outputs, baseline/live distributions, evidence refs, signed evidence, and row hashes; a notebook, demo, or aggregate evaluator score alone is not enough.");
    expect(first.limitations).toContain("Agent-security control live-drift claims require guard identity, policy hash, taint trace, proxy/secret-guard trace, tamper-evident audit trail, runtime telemetry, eval-pack hash, classifier/origin proof, source-origin coverage, taint-propagation coverage, policy decision accuracy, secret-scrub rate, audit integrity, attack-effectiveness rate, false-positive rate, guard latency, signed evidence refs, and row hashes; a red-team score, unsafe-response label, local proxy log, screenshot, or command output alone is not enough.");
    expect(first.limitations).toContain("Agent-testing methodology live-drift claims require taxonomy id, methodology hash, scenario-catalog hash, fault-injection plan hash, observability plan hash, safety plan hash, standards-map hash, category, testing approach, fault model, benchmark family, methodology/scenario/fault-injection coverage, resilience pass rate, safety-regression rate, observability signal coverage, signed evidence refs, and row hashes; a curated awesome list, category label, local test command, or aggregate score alone is not enough.");
    expect(first.limitations).toContain("Chaos-reliability live-drift claims require benchmark id, scenario id, chaos profile, injection plan hash, mutation manifest hash, endpoint contract hash, judge config hash, trace bundle hash, score ledger hash, agent-card hash, improvement-eval hash, framework id, modality, benchmark family, production reliability, resilience score, chaos drop, recovery pass rate, failure-trace coverage, signed evidence refs, and row hashes; a badge, dashboard screenshot, local CLI output, leaderboard row, or aggregate reliability score alone is not enough.");
    expect(first.limitations).toContain("ADK runtime live-drift claims require runtime id, framework version, agent graph hash, tool registry hash, eval dataset hash, eval case hashes, runner config hash, session state hash, live request queue hash when streaming is claimed, API server route hash when API execution is claimed, deployment manifest hash when deployment readiness is claimed, model route, execution mode, deployment target, eval pass rate, tool-call success rate, graph coverage, streaming stability, deployment readiness, evidence refs, signed evidence refs, and row hashes; a CLI run, web UI screen, graph visualization, local eval command, or aggregate pass rate alone is not enough.");
    expect(first.limitations).toContain("Graph-eval judge calibration claims require graph id/version, node graph hash, scan and metric-node hashes, aggregation node hash, report artifact hash, cache-key hash, model-routing hash, prompt/parser/cost/report/schema/dataset/execution hashes, required and executed metric branches, branch coverage, per-case report coverage, cost-estimate drift, signed evidence refs, and proof hashes; a CLI report, cache directory, model label, GEval rubric label, or aggregate judge score alone is not enough.");
    expect(first.limitations).toContain("Enterprise agent interop evaluation claims require dataset id/version, test-case ids, agent registration hash, agent endpoint contract hash, evaluation-run id, MCP or tool registry hash, tool-call trace hashes, response artifact hashes, result metric manifest, persistence/export receipt, signed evidence refs, and row hashes; a web UI result, local API response, sample-agent demo, or aggregate evaluation score alone is not enough.");
    expect(first.limitations).toContain("REALTALK-style long-term conversation replay claims require benchmark identity, paper and license references, raw-export and preprocessed-conversation manifests, participant and speaker manifests, temporal split, privacy/consent proof, LoCoMo comparison boundary, 21-day conversation-span evidence, task-specific QA or persona or emotional-intelligence evaluator artifacts, OpenAI/API boundary proof where used, metrics, thresholds, signed evidence, and row hashes; raw chat exports, aggregate memory scores, or a persona-simulation label alone are not enough.");
    expect(first.limitations).toContain("CloneMem-style long-term-memory replay claims require benchmark identity, repository snapshot, source and license references, persona manifest, digital-trace manifests for diary/social/direct-message/email evidence, question set, ground-truth evidence, temporal split, bilingual config, evaluation config, baseline retriever, memory-system config, result artifact, replay command, deterministic seed, trace-kind/category/language coverage, persona/question/context counts, evidence-grounding, temporal-consistency, unanswerable-accuracy, trajectory-reasoning, replay pass rate, score delta, thresholds, signed evidence refs, and row hashes; a CloneMem label, AI-clone memory label, aggregate score, chat-only memory benchmark, local run log, README result, copied dataset row, or persona summary alone is not enough.");
    expect(first.limitations).toContain("Logic and symbolic benchmark replay claims require benchmark identity, paper/source reference hash, dataset id and manifest, dataset access receipt, license reference, submodule manifest, environment and setup hashes, inference-provider and chat-completion-module proof, secret boundary, logic-agent and auxiliary-tool manifests, tool-kind coverage, replay command, deterministic seed, output JSON, evaluator evidence such as ZeroEval for ZebraLogicBench, unit-test evidence when claimed, task count, logic accuracy, solver agreement, tool-use coverage, replay pass rate, thresholds, evidence refs, signed evidence, and row hashes; aggregate accuracy or a local command log alone is not enough.");
    expect(first.limitations).toContain("Local-system monitor live drift claims require monitor profile, device profile, hardware scanner, process catalog, sensor log, alert receipt, workload context, thermal-baseline deviation, voltage SPC anomaly, process identity, ghost-driver handling, proactive alert, and local-only privacy evidence; generic health score alone is not enough.");
    expect(first.limitations).toContain("AI-coding landscape or leaderboard question-explainability claims require source category, dataset refs and SHA-256 hashes, update cadence, freshness, cohort refs, benchmark or tool/model refs, accepted evidence, rejected-evidence reasons, and a repair hint; a fast-moving category listing alone is not enough.");
    expect(first.limitations).toContain("Benchmark-submission question-explainability claims require benchmark/source identity, submission id/version, agent version, submission timestamp, task id/category/status, grading type, overall and category scores, speed and cost metrics where claimed, leaderboard metric views, submission metadata hash, task-breakdown hash, leaderboard snapshot hash, criterion-level scores, accepted evidence, rejected-evidence reasons, repair hint, and row-hash evidence; an aggregate submission score alone is not enough.");
    expect(first.limitations).toContain("Test-suite question-explainability claims require suite id, language, framework, adapter, dataset ref/hash, test-case hash, evaluator ids/config, judge model where claimed, experiment run/result/export artifacts, CI run/config, agent trace and tool-call validation when agent behavior is claimed, pass-rate and score thresholds, cost/latency/tokens where claimed, accepted evidence, rejected-evidence reasons, repair hint, and row-hash evidence; a console output, passing unit test, aggregate pass rate, or local CI log alone is not enough.");
    expect(first.limitations).toContain("SRE incident-triage question-explainability claims require OpenEnv config, scenario manifest, incident report, raw log bundle, metric snapshot, user report, action payload, deterministic grader config, feedback, reward, root-cause, red-herring, ordered-remediation, step-bound, accepted evidence, rejected-evidence, repair hint, and row-hash evidence; a final incident score alone is not enough.");
    expect(first.limitations).toContain("Azure agent lab or workshop replay claims require lab and module id, workshop guide and notebook hashes, Azure service config hashes, AI project/search/RAG/tool/evaluator config, cloud-run artifact, credential and managed-identity scope proof, replay command, deterministic seed, scenario count, score, and groundedness thresholds; notebook completion or a generic RAG score alone is not enough.");
    expect(first.limitations).toContain("Environment-generation replay claims require toolkit version, dataset id/version hash, generated task config, task schema, generation prompt, fixture manifest, mock-service catalog and state, audit log, trajectory capture, verification config, scoring rubric, safety-check config, harness tier/id, adapter config, Docker or agent-loop proof, replay command, deterministic seed, service/task/check counts, component scores, final score, and safety-gate evidence; a generated task or benchmark score alone is not enough.");
    expect(first.limitations).toContain("Deep-research replay claims require framework version, research task id, workflow/LLM/search/local-runtime configs, knowledge-base/tool-description/interaction-history context, task plan, progressive-search trace, tool-call trace, knowledge extraction, cross-evaluation trace, iteration log, final report and outline hashes, lockfile, replay command, deterministic seed, search/source counts, cross-evaluation pass rate, hallucination-check pass rate, final report score, and thresholds; a generated report alone is not enough.");
    expect(first.limitations).toContain("Web-operator live drift claims require benchmark, dataset, task, provider, agent-version, browser-mode, judge model, run-config, replay artifact, result JSON, screenshot, trajectory, self-report, independent evaluation, retry reliability, step-limit, task-time, evidence refs, and signed evidence; an agent self-report or single web-task success alone is not enough.");
    expect(first.limitations).toContain("Navi-Bench-style real-website web-agent live-drift claims require benchmark id, source/repository/license refs, Hugging Face dataset ref, task id, website-domain taxonomy, task config, evaluator config, agent config, browser mode and provider proof, baseline/live result hashes, saved trajectory, visualization artifact, screenshot trace, alert receipt, task finished/crashed/success flags, lower-bound score, excluding-crashed score, upper-bound score, step limits, evidence coverage, baseline/live distributions, thresholds, signed evidence refs, and row hashes; a Navi-Bench label, README screenshot, dataset card, local demo, aggregate score, task URL, browser label, model/provider label, or source metadata alone is not enough.");
    expect(first.limitations).toContain("Awesome-Agent-Memory-style live-drift claims require source repository snapshot, no-license-boundary proof, README blob, catalog snapshot, entry source, taxonomy, benchmark manifest, evaluation dataset, baseline/live results, drift statistic, alert receipt, retrieval/persistence/forgetting/hallucination metrics, evidence refs, signed evidence refs, and row hashes; a catalog label, repository metadata, star count, README section, copied list entry, project or paper title, link list, aggregate memory score, or source metadata alone is not enough.");
    expect(first.limitations).toContain("Agent Reading Test-style live-drift claims require source repository snapshot, license reference, homepage reference, README blob, answer key, task manifest, score form, live-site snapshot, raw content capture, expected/reported canary proof, baseline/live results, drift statistic, alert receipt, reading score, canary recall, task completion, evidence refs, signed evidence refs, and row hashes; a benchmark label, repository metadata, homepage screenshot, README task list, copied test page, copied canary token, answer-key excerpt, scoring-form screenshot, self-reported score, raw HTML/markdown snippet, or source metadata alone is not enough.");
    expect(first.limitations).toContain("Legal-agent live drift claims require benchmark, dataset, corpus, task, task type, difficulty, planning-tree, tool-manifest, tool-run trace, intermediate-step annotation, process trace, output, reference answer, evaluation report, final-success, process-rate, tool-use accuracy, citation coverage, token-cost where claimed, evidence refs, and signed evidence; final success rate alone is not enough.");
    expect(first.limitations).toContain("ResearchGym-style research-run live drift claims require benchmark id, paper/source reference, task id/domain, task/pruned-repo/dataset/evaluation-harness/baseline/grading/withheld-solution/run/runtime/agent-adapter/workspace/transcript/cost/status/plan/inspection/violation artifacts, baseline and candidate score improvement, subtask completion, experiment and async-job counts, runtime and API budget controls, inspection pass, budget-overrun and violation rates, task-domain and runtime-context distributions, evidence refs, signed evidence, and row hashes; a local research run, aggregate score, README result, task family, or transcript alone is not enough.");
    expect(first.limitations).toContain("OSUniverse-style GUI-navigation live drift claims require benchmark id, source/repository/license/paper refs, testcase id, task category, complexity level, testcase manifest, agent config, runner config, runtime and runtime-image proof when applicable, dependency lock, validator config, validation report, result artifact, viewer artifact, trajectory, screenshot trace, task success, automated-validation pass, validation error rate, action-step count, max-step threshold, category/level/runtime-context distributions, evidence refs, signed evidence, and row hashes; a GUI-agent label, aggregate score, local run output, README result, viewer screenshot, copied testcase, task category, or single trajectory alone is not enough.");
    expect(first.limitations).toContain("Rag-Eval-flow-style local RAG replay claims require source/repository/license refs, pipeline config, data-source manifest, model config, judge config, metric definition, prompt-template, eval-pack manifest, fixture, replay command, result manifest, score-delta report, CI receipt, pipeline id, data format, model backend, judge backend, metric ids, sample size, deterministic seed, baseline/candidate scores, score delta, replay pass rate, metric coverage, thresholds, signed evidence refs, and row hashes; a local RAG eval label, config filename, aggregate score, README result, copied prompt, metric name, model label, judge label, local run output, or copied dataset row alone is not enough.");
    expect(first.limitations).toContain("MiRAGE-style multimodal multihop RAG dataset-generation replay claims require source/repository/license refs, input-document manifests, semantic chunks, multihop context graph, domain/expert role manifest, generate-select-verify-correct trace, multimodal carrier manifest, backend/embedding/reranker configs, token-usage trace, checkpoint/resume proof, deduplication report, evaluation report, replay command, output dataset, visualization artifact, dataset/backend/modality/stage ids, question counts, deterministic seed, quality score delta, replay pass rate, metric coverage, thresholds, signed evidence refs, and row hashes; a MiRAGE label, README feature list, local run output, copied generated QA pair, output JSON, visualization file, or aggregate dataset quality claim alone is not enough.");
    expect(first.limitations).toContain("Mobile-agent metric-validity claims require benchmark manifests, paper or source references, mobile environment manifests, app inventory manifests, API catalog manifests, UI automation traces, task dataset manifests, task-complexity manifests, multi-app task manifests, checkpoint metric rubrics, checkpoint result artifacts, environment reset policies, device-state fixtures, result report artifacts, dataset license boundaries, metric owner, sample size, confidence interval, signed evidence refs, and row hashes; a MobileBench-style label, app demo, emulator run, aggregate success rate, screenshot, API trace, local command output, copied task row, or README result alone is not enough.");
    expect(first.limitations).toContain("Agent Bench-style Java coding-agent metric-validity claims require benchmark manifests, source/repository/license refs, Java task manifests, YAML benchmark manifests, workspace templates, isolated sandbox manifests, provide lifecycle traces, setup/post script manifests, CLI-agent configs, cascaded jury manifests, judge-tier policies, Maven build checks, JUnit test results, JaCoCo coverage reports, result JSON manifests, accuracy/pass@k metrics, metric owner, sample size, confidence interval, signed evidence refs, and row hashes; a Java benchmark label, YAML file, CLI run, local Maven output, README example, project name, judge-tier label, coverage number, result JSON, aggregate accuracy/pass@k score, or copied benchmark row alone is not enough.");
    expect(first.limitations).toContain("Parallel/OpenClaw research-skill metric-validity claims require source repository reference, license boundary reference, skill manifest, API surface manifest, search-mode manifest, deep-research task manifest, chat-grounding manifest, extract-content manifest, citation provenance report, source policy manifest, batch execution manifest, monitoring manifest, security boundary, dependency lock, benchmark-claim validation report, metric owner, sample size, confidence interval, signed evidence refs, and row hashes; a Parallel skill label, repository metadata, README feature list, SKILL manifest title, API surface name, fast or agentic search mode, local wrapper run, citation excerpt, monitoring note, batch-size claim, benchmark claim, or source metadata alone is not enough.");
    expect(first.limitations).toContain("Resume-RAG evaluator metric-validity claims require source repository reference, license or no-license-boundary reference, resume upload manifest, parser manifest, job-description manifest, RAG strategy manifest, query expansion manifest, retrieval config manifest, vector-store manifest, Ollama model manifest, embedding model manifest, evaluation endpoint manifest, candidate rating report, batch evaluation manifest, privacy boundary, dependency lock, metric owner, sample size, confidence interval, signed evidence refs, and row hashes; a resume parser label, repository metadata, README feature list, local upload demo, model name, RAG strategy name, candidate score, batch-evaluation mode, endpoint name, screenshot, or source metadata alone is not enough.");
    expect(first.limitations).toContain("Agentest-style scenario-test metric-validity claims require source/repository/license refs, agent endpoint contract, scenario, simulated-user persona, goal/knowledge, tool mock, scripted-turn, trajectory-assertion, LLM-judge metric, comparison-run, CI-reporter, result artifact, owner, sample-size, confidence-interval, signed evidence refs, and row hashes; source metadata, labels, README examples, copied scenarios, config snippets, local run output, screenshots, aggregate pass rate, tool-mock transcript, or judge score alone is not enough.");
    expect(first.limitations).toContain("GTO Wizard-style poker-agent replay claims require source/repository/license refs, API documentation and scope proof, no-solver-access policy, eval-pack and fixture hashes, agent-policy manifest, hand-history manifest, legal-action trace, result manifest, AIVAT metric report, replay command, CI receipt, agent-type coverage, game variant, hand count, deterministic seed, baseline/candidate AIVAT bb/100, replay pass rate, legal-action rate, thresholds, signed evidence refs, and row hashes; repository metadata, copied README commands, local hand logs, leaderboard context, aggregate chip results, or model labels alone are not enough.");
    expect(first.limitations).toContain("SAP agent-evaluation tutorial live-drift claims require tutorial/source/repository/license refs, notebook, dataset, baseline log, live sample, metric config, tooling config, role-access policy, reliability policy, compliance policy, alert receipt, objective taxonomy, evaluation-process taxonomy, enterprise-context taxonomy, coverage metrics, baseline/live distributions, thresholds, signed evidence refs, and row hashes; repository metadata, notebook names, dataset folders, sample log paths, local notebook runs, abstract summaries, aggregate eval scores, copied log rows, or model labels alone are not enough.");
    expect(first.limitations).toContain("Agent-evaluation observability live-drift claims require source/repository/license refs, agent config, eval dataset, prompt variant, model config, RAG index, metric config, baseline eval result, live eval result, OpenTelemetry trace, Application Insights, Event Hub, Kusto policy, Fabric dashboard, alert receipt, metric-set taxonomy, telemetry taxonomy, config/telemetry/evidence coverage, baseline/live distributions, thresholds, signed evidence refs, and row hashes; repository metadata, README screenshots, copied configs, copied Kusto scripts, dashboard labels, local run output, aggregate eval scores, Azure service labels, prompt variant labels, or model labels alone are not enough.");
    expect(first.limitations).toContain("CostNav-style physical navigation replay claims require source/repository/license refs, benchmark spec, scenario manifest, route graph, economic-cost model, physical-agent config, simulator config, trajectory manifest, result manifest, metrics report, replay command, CI receipt, route-type coverage, deterministic seed, scenario count, baseline and candidate economic cost, economic-cost delta, navigation success, replay pass rate, score delta, thresholds, signed evidence refs, and row hashes; a repository title, benchmark label, route label, screenshot, copied map/config/script, local simulator output, aggregate cost, model/provider label, or source metadata alone is not enough.");
    expect(first.limitations).toContain("Edge AI agent replay claims require source/repository/license refs, device profiles, runtime manifests, optimization manifests, benchmark datasets, task manifests, application scenarios, replay commands, metric reports, device-class coverage, modality coverage, runtime-kind coverage, on-device execution, offline capability, privacy boundary, latency p95, memory p95, energy per task, accuracy, replay pass rate, score delta, thresholds, signed evidence refs, and row hashes; a curated list entry, paper link, benchmark name, framework/runtime label, device claim, local run, aggregate score, latency number, screenshot, README example, copied list row, or application example alone is not enough.");
    expect(first.limitations).toContain("GeoBenchX-style geospatial provider-drift claims require benchmark identity, task-set hashes, dataset snapshots, tool registries, reference-solution manifests, tool-call trace exports, judge panel/config proof, human-calibration evidence, result reports, token-cost reports, complexity groups, solvable and unsolvable task counts, tool counts, max-iteration thresholds, signed evidence refs, and row hashes; notebooks, generated maps, HTML transcripts, aggregate scores, model rankings, README results, local run logs, copied task rows, or copied datasets alone are not enough.");
    expect(first.limitations).toContain("AIAnytime-style LLM/RAG eval-suite live drift claims require eval-suite and run ids, candidate/reference manifests, semantic-similarity metric, bias metric, hallucination or faithfulness metric, judge config, report artifact, baseline/live distributions, thresholds, signed evidence refs, and row hashes; notebooks, copied examples, local metric scripts, aggregate scores, model labels, or README claims alone are not enough.");
    expect(first.limitations).toContain("Recovery-Bench-style live-drift claims require failed initial traces, replay command logs, fresh replay environments, corrupted-environment hashes, recovery agent/model/run configs, declared message modes, transcripts, result/score reports, recovery success/reward metrics, signed evidence refs, and row hashes; aggregate recovery success rates, task labels, replay logs, README workflow, or model names alone are not enough.");
    expect(first.limitations).toContain("Ollama metrics live-drift claims require sidecar id, source/repository/license refs, proxy and Ollama host configs, Prometheus scrape config, metrics endpoint snapshot, baseline/live snapshots, alert policy, model id, deployment mode, prompt and generated token counts, request-duration p95, time per token, loaded-model count/status, model RAM, request error rate, model/deployment/proxy-context distributions, thresholds, signed evidence refs, and row hashes; a dashboard screenshot, raw metrics endpoint, model label, token count, latency number, README example, or local log alone is not enough.");
    expect(first.limitations).toContain("Darwin Godel Machine-style live-drift claims require source repository snapshot, no-license-boundary proof, README, security, CI, controller, archive, self-modification, evaluation harness, scorer, sandbox, live-run config, live-proof config, model matrix, benchmark manifest, score-movement manifest, verifiers, baseline/live results, drift statistic, alert receipt, lineage, provider/model route, score movement, pass rate, mutation acceptance, regression failure rate, context distributions, evidence refs, signed evidence refs, and row hashes; a DGM label, repository metadata, research-paper title, local evolution run, copied benchmark config, copied agent code, copied archive row, aggregate candidate score, aggregate pass rate, model label, local sandbox output, or source metadata alone is not enough.");
    expect(first.limitations).toContain("Effect-autoagent-style replay-corpus claims require source repository snapshot, MIT license proof, default branch proof, README, package manifest, lockfile, CI workflow, benchmark runner, harness spec, task spec, metrics, experiment log, agent blueprint, runner, run result, trajectory converter, container manager, task manifest, instruction, fixture test, Docker environment, replay command, fixed seed, baseline/candidate results, score delta, replay pass rate, CI receipt, evidence refs, signed evidence refs, and row hashes; an effect-autoagent label, repository metadata, README heading, package name, task directory, benchmark runner filename, Dockerfile name, local command, example agent, provider label, aggregate score, CI badge, or source metadata alone is not enough.");
    expect(first.limitations).toContain("Falcon Evaluate-style provider-drift claims require source repository snapshot, MIT license proof, default branch proof, release tag, package manifest, lockfile, requirements, README, docs index, CI workflow, evaluation/context/fairness/reliability/security/ethics/results/plot/user-analytics modules, validation data schema, metric-family and metric ids, metric count, provider route, baseline and candidate canary results, drift statistic, alert or waiver receipt, evidence refs, signed evidence refs, and row hashes; a Falcon Evaluate label, repository metadata, release tag, package name, README summary, docs page, workflow filename, module filename, metric-family name, provider label, aggregate score, local run output, CI badge, or source metadata alone is not enough.");
    expect(first.limitations).toContain("Evidra-style provider-drift claims require source repository snapshot, Apache-2.0 license proof, default branch proof, release tag, README, go.mod, CI and release workflows, Dockerfiles, CLI tree, MCP tree, API command, evidence signer/package, evlock, execcontract, export, MCP server, proxy, lifecycle service, pipeline bridge, score compare, tests/docs/signal-validation refs, prescribe/report/record/validate/scorecard command hashes, prescribe/report protocol proof, provider route, baseline and live sample manifests, canary results, drift statistic, alert or waiver receipt, replay command, CI receipt, no-source-copy proof, signed evidence-chain proof, evidence refs, signed evidence refs, and row hashes; an Evidra label, repository metadata, README summary, protocol name, local report, scorecard output, evidence entry, provider label, aggregate reliability score, CI badge, or source metadata alone is not enough.");
    expect(first.limitations).toContain("RAViG-Bench-style metric-validity claims require source repository snapshot, Apache-2.0 license proof, default branch proof, README and legal refs, dependency and config refs, content/design/execution evaluation refs, function scoring refs, dataset/test-case/model-result refs, visually-rich generation taxonomy, RAG retrieval context, multi-modal evaluator ids, screenshot and run-script refs, metric definitions, CI reporter, validation pass rate, dataset case count, visual-design check count, evaluator count, metric owner, sample size, confidence interval, no-source-copy proof, evidence refs, signed evidence refs, report artifact hashes, and row hashes; a RAViG-Bench label, source metadata, README summary, prompt filename, copied dataset row, copied model result, screenshot, evaluator filename, aggregate score, or CI badge alone is not enough.");
    expect(first.limitations).toContain("RAIL Score-style live-drift claims require source repository snapshot, MIT license proof, GitHub release, PyPI package/wheel/sdist hashes, README, pyproject, requirements, CI/publish workflows, client/model/policy/session/middleware proof, telemetry proof, compliance proof, agent proof, integration proof, baseline/live results, drift statistic, alert receipt, evaluation dimension, guardrail mode, compliance framework, model provider, score, guardrail pass rate, safe-regeneration rate, tool-call accuracy, compliance pass rate, telemetry coverage, prompt-injection block rate, context distributions, evidence refs, signed evidence refs, and row hashes; a RAIL Score label, source metadata, package name, release tag, README summary, SDK class name, local score output, aggregate responsible-AI score, model label, or CI badge alone is not enough.");
    expect(first.limitations).toContain("Calibra-style public methodology claims require source repository snapshot, MIT license proof, homepage/default-branch refs, README, pyproject, lockfile, package tree, task fixture tree, test suite tree, campaign config hash, campaign matrix hash, agent instructions hash, model/provider matrix, skill/MCP/environment overlays, deterministic seed policy, budget policy, trial report schema, analysis report, comparison report, web-dashboard/export proof, methodology version, changelog, deprecation notice, migration guidance, evidence refs, signed evidence refs, and row hashes; a Calibra label, repository metadata, README claim, dashboard screenshot, copied task, local run output, aggregate pass rate, model ranking, cost number, or source metadata alone is not enough.");
    expect(first.limitations).toContain("SLDBench-style scaling-law discovery live drift claims require benchmark id, paper/source reference, eval-run id, task id, task type, dataset manifest, train/test split hashes, source-experiment manifest, task/evolution/evaluator configs, model-route hash, program artifact, checkpoint trace, result report, formula family, extrapolation regime, R2, NMSE, NMAE, baseline/live distributions, thresholds, signed evidence refs, and row hashes; aggregate R2, a task label, local script output, result folder, README result, copied config, or model label alone is not enough.");
    expect(first.limitations).toContain("Scenario-simulation replay claims require benchmark id/version, repository and source references, scenario project, scene and role definitions, human participant policy, agent roster, LLM agent config, evaluator config, action schema, task dataset, web UI build, server config, container image, persistence store, checkpoint manifest, run config, event log, action trace, evaluation report, visualization artifact, replay command, deterministic seed, agent/evaluation/visualization modes, scenario/agent/action/evaluated-action counts, action evaluation coverage, task success, action score, replay pass rate, score delta, thresholds, persistence flag, checkpoint resume proof, signed evidence refs, and row hashes; a scenario label, local server demo, UI screenshot, transcript, participant roster, aggregate task score, README example, or copied scenario row alone is not enough.");
    expect(first.limitations).toContain("Warehouse-native LLM evaluation replay claims require benchmark id/version, repository and source references, dbt project and package lock manifests, warehouse adapter config, warehouse AI function manifest, model manifest, capture config, prompt/input/output schema, baseline dataset, baseline version manifest, evaluation criteria, judge model config, sampling and threshold configs, raw capture, raw baseline, judge evaluation, eval score, performance summary, drift detection, alert, compiled SQL, run result, data-egress policy, replay command, deterministic seed, warehouse, evaluation mode, model/capture/baseline/evaluated/criteria counts, capture coverage, judge score, pass rate, drift alert rate, replay pass rate, score delta, thresholds, data-egress-blocked proof, signed evidence refs, and row hashes; a warehouse label, dashboard result, local dbt run log, SQL snippet, config snippet, README example, prompt/input/output sample, aggregate score, or copied table row alone is not enough.");
    expect(first.limitations).toContain("LLM workflow observability methodology claims require methodology id, methodology version, methodology hash, trace schema version, SDK/instrumentation manifest, workflow graph or span-model proof, telemetry sampling and redaction policies, prompt and model registry snapshots, evaluation template, judge/rubric config, development test-window id, production monitoring-window id, frontend analytics schema, session replay artifact manifest, user-feedback collection schema, data-security boundary, retention policy, alert threshold config, report or badge migration guidance, signed evidence refs, and row hashes; a dashboard screenshot, trace id, SDK hook, visual debugger view, local telemetry run, aggregate evaluation score, frontend analytics event, user-feedback widget, or README example alone is not enough.");
    expect(first.limitations).toContain("Static offline benchmark receipts and live dynamic execution receipts are not interchangeable unless versioned corpus, harness, model-pool, tier-policy, verification, scoring, and cost-accounting context is disclosed.");
    expect(first.limitations).toContain("Awesome AI Pentest-style curated-index claims require live source repository snapshot, default-branch and README blob refs, no-root-license boundary proof, no-source-copy proof, and underlying benchmark-specific manifests, hashes, execution traces, scoring configs, CI receipts, owners, sample sizes, confidence intervals, signed evidence refs, and row hashes through pentest_benchmark_coverage before Score, Shield, or Watch metric-validity claims; repository metadata, README benchmark lists, paper-result percentages, tool names, or source-index labels alone are discovery metadata and fail closed.");
    expect(first.limitations).toContain("ChemGraph-style agentic computational chemistry workflow metric-validity claims require DOI/OpenAlex metadata verification, AMC-owned eval-pack manifest, validation table, existing metric-validity primitive mapping, trace/evaluator proof when claimed, threshold policy, metric owner, sample size, confidence interval, signed evidence refs, artifact hashes, row hashes, and no-copy/source-review proof before Score, Shield, or Watch claims can use them; DOI metadata, OpenAlex metadata, paper title, abstract summary, computational-chemistry label, benchmark-task count, LLM/model name, aggregate accuracy, workflow claim, or source metadata alone is not enough and does not establish a chemistry/domain subsystem, connector, importer, or parity claim.");
    expect(first.limitations).toContain("Red-team/offensive-security benchmark regression claims require benchmark id/version, question-set hash, reference-answer manifest hash, scoring config hash, scoring modes, provider backend, model config hash, result export hashes, rerun output hash, release gate receipt, question count, pass/refusal/hallucination/semantic scores where claimed, judge rubric for LLM-judge scoring, prompt-optimization config/count where claimed, signed evidence refs, and row hashes; raw prompts, exploit content, reference answers, or final percentage alone is not enough.");
    expect(first.metricValidationGates.map((gate) => gate.gate)).toEqual([
      "construct_validity",
      "counterfactual_responsiveness",
      "validation_facet_coverage",
      "confounder_control_coverage",
      "target_outcome_alignment",
      "process_evidence_coverage",
      "safety_utility_coverage",
      "modality_transformation_coverage",
      "lifecycle_observability_coverage",
      "arize_phoenix_observability_eval_coverage",
      "lunary_observability_metric_validity",
      "google_adk_eval_metric_validity",
      "lm_evaluation_harness_metric_validity",
      "openai_evals_public_methodology",
      "digital_materials_ecosystem_metric_validity",
      "chemgraph_agentic_chemistry_workflow_metric_validity",
      "ranking_stability_coverage",
      "tool_sandbox_coverage",
      "continual_learning_coverage",
      "strategic_interaction_coverage",
      "architecture_reality_coverage",
      "rag_pipeline_coverage",
      "rag_evaluation_pipeline_coverage",
      "mirage_rag_metric_coverage",
      "mirage_drug_repositioning_coverage",
      "legal_code_rag_metric_coverage",
      "business_workflow_coverage",
      "data_agent_analytical_coverage",
      "embodied_agent_coverage",
      "evaluator_suite_coverage",
      "pentest_benchmark_coverage",
      "trace_evaluation_coverage",
      "langsmith_eval_observability_metric_validity",
      "living_environment_coverage",
      "persona_agent_coverage",
      "scientific_literature_coverage",
      "bioinformatics_agent_coverage",
      "network_troubleshooting_coverage",
      "inference_optimization_coverage",
      "java_coding_agent_coverage",
      "web_eval_dataset_coverage",
      "parallel_research_skill_coverage",
      "resume_rag_evaluator_coverage",
      "chipbenchmark_coverage",
      "hermes_bench_metric_validity",
      "cooperbench_metric_validity",
      "codercup_metric_validity",
      "agentic_graph_rag_metric_validity",
      "agent_scenario_test_coverage",
      "open_code_lab_coverage",
      "cc_plugin_eval_coverage",
      "realign_simulation_coverage",
      "academiclaw_coverage",
      "rag_chunking_technique_coverage",
      "kubernetes_operational_agent_coverage",
      "secure_vibe_bench_coverage",
      "humanstudybench_coverage",
      "legacybench_coverage",
      "subtlememory_metric_validity",
      "ragas_notebook_metric_validity",
      "mobile_agent_coverage",
      "geospatial_provider_drift_evidence",
      "llm_rag_eval_suite_live_drift_evidence",
      "kite_rag_live_drift_evidence",
      "poker_eval_live_drift_evidence",
      "nomiracl_multilingual_rag_live_drift_evidence",
      "scaling_law_discovery_live_drift_evidence",
      "scenario_simulation_replay_evidence",
      "effect_autoagent_replay_evidence",
      "falcon_evaluate_provider_drift_evidence",
      "agent_defense_bench_provider_drift_evidence",
      "paper_read_skill_live_drift_evidence",
      "eval_ai_library_question_explainability_evidence",
      "open_model_rag_question_explainability_evidence",
      "fore_public_methodology_versioning_evidence",
      "heurekabench_scientific_replay_evidence",
      "rag_contradiction_detector_replay_evidence",
      "skillmatch_resume_live_drift_evidence",
      "decibench_voice_live_drift_evidence",
      "evidra_provider_drift_evidence",
      "ravig_bench_metric_validity_evidence",
      "rail_score_live_drift_evidence",
      "garage_rag_grounding_live_drift_evidence",
      "llm_prompting_tests_public_methodology_evidence",
      "scorable_studio_drilldown_evidence",
      "knowlytics_ai_replay_evidence",
      "calibra_public_methodology_evidence",
      "warehouse_native_llm_eval_replay_evidence",
      "rag_eval_dataset_replay_evidence",
      "encourage_rag_replay_evidence",
      "clonemem_long_term_memory_replay_evidence",
      "researchharness_agent_replay_evidence",
      "gto_wizard_poker_replay_evidence",
      "sap_agent_eval_tutorial_live_drift_evidence",
      "agent_eval_observability_live_drift_evidence",
      "hedrarag_artifact_eval_live_drift_evidence",
      "agent_eval_harness_live_drift_evidence",
      "strands_benchmark_harness_live_drift_evidence",
      "costnav_physical_navigation_replay_evidence",
      "terminalworld_replay_evidence",
      "agent_mont_monitoring_replay_evidence",
      "spent_session_cost_replay_evidence",
      "fire_fact_checking_replay_evidence",
      "fact_checking_factuality_review_methodology_evidence",
      "nuclia_rag_triad_replay_evidence",
      "navi_bench_web_agent_live_drift_evidence",
      "agent_trial_statistical_question_explainability_evidence",
      "codequest_quality_question_explainability_evidence",
      "agentkernelarena_gpu_kernel_replay_evidence",
      "llm_evaluation_system_jury_replay_evidence",
      "innovatorbench_research_replay_evidence",
      "edge_ai_agent_replay_evidence",
      "agent_workflow_kit_replay_evidence",
      "medask_clinical_benchmark_replay_evidence",
      "bio_kg_bench_replay_evidence",
      "biomedarena_replay_evidence",
      "ollama_metrics_live_drift_evidence",
      "recovery_bench_live_drift_evidence",
      "ai_reputation_claude_live_drift_evidence",
      "llm_fighter_live_drift_evidence",
      "darwin_godel_machine_live_drift_evidence",
      "confidence_interval_width"
    ]);
    expect(first.deprecationNotice).toContain("legacy outputs");
    expect(first.migrationGuidance).toContain("Run amc methodology --json and store the manifest hash with audit evidence.");
    expect(first.hash).toMatch(/^[a-f0-9]{64}$/);
    expect(second.hash).toBe(first.hash);
  });

  test("renders auditor-readable methodology metadata", () => {
    const manifest = getPublicMethodologyManifest();
    const markdown = renderPublicMethodologyMarkdown(manifest);
    const ref = getPublicMethodologyReference();

    expect(markdown).toContain(`# AMC Public Methodology ${manifest.version}`);
    expect(markdown).toContain(`- Methodology hash: ${manifest.hash}`);
    expect(markdown).toContain("## Changelog");
    expect(markdown).toContain("## Evaluation Mode Taxonomy");
    expect(markdown).toContain("provider_drift");
    expect(markdown).toContain("local-system monitor");
    expect(markdown).toContain("Ollama-metrics-style");
    expect(markdown).toContain("AI-coding landscape");
    expect(markdown).toContain("benchmark-submission");
    expect(markdown).toContain("test-suite");
    expect(markdown).toContain("comparative coding-agent report");
    expect(markdown).toContain("benchmark-hackability audit");
    expect(markdown).toContain("agent-security control");
    expect(markdown).toContain("Agent-testing methodology");
    expect(markdown).toContain("Chaos-reliability");
    expect(markdown).toContain("ADK runtime");
    expect(markdown).toContain("Graph-eval judge calibration");
    expect(markdown).toContain("enterprise_agent_eval_interop");
    expect(markdown).toContain("SRE incident-triage");
    expect(markdown).toContain("Advanced RAG");
    expect(markdown).toContain("RAG QA dataset-builder");
    expect(markdown).toContain("CPU-centric agentic workload");
    expect(markdown).toContain("web-agent privacy");
    expect(markdown).toContain("ML-development workflow");
    expect(markdown).toContain("Text2SQL business-database");
    expect(markdown).toContain("RAG chunking-strategy");
    expect(markdown).toContain("AutoResearchBench-style");
    expect(markdown).toContain("scientific literature discovery");
    expect(markdown).toContain("NIKA-style");
    expect(markdown).toContain("network_troubleshooting_metric_validity");
    expect(markdown).toContain("network_troubleshooting_coverage");
    expect(markdown).toContain("InferenceBench-style");
    expect(markdown).toContain("inference_optimization_metric_validity");
    expect(markdown).toContain("inference_optimization_coverage");
    expect(markdown).toContain("inference_optimization_metric_validity_change");
    expect(markdown).toContain("Agent Bench-style Java coding-agent");
    expect(markdown).toContain("java_coding_agent_metric_validity");
    expect(markdown).toContain("java_coding_agent_coverage");
    expect(markdown).toContain("java_coding_agent_metric_validity_change");
    expect(markdown).toContain("AI-agent benchmark comparison replay");
    expect(markdown).toContain("ai_agent_benchmark_comparison_replay_integrity");
    expect(markdown).toContain("ai_agent_benchmark_comparison_replay_change");
    expect(markdown).toContain("GAIA-agent");
    expect(markdown).toContain("gaia_agent_replay_integrity");
    expect(markdown).toContain("gaia_agent_replay_change");
    expect(markdown).toContain("PaperArena");
    expect(markdown).toContain("paperarena_replay_integrity");
    expect(markdown).toContain("paperarena_replay_change");
    expect(markdown).toContain("hermes_turbo_question_explainability_integrity");
    expect(markdown).toContain("hermes_turbo_question_explainability_change");
    expect(markdown).toContain("rss_market_impact_methodology_integrity");
    expect(markdown).toContain("rss_market_impact_methodology_change");
    expect(markdown).toContain("credence_engine_live_drift_integrity");
    expect(markdown).toContain("credence_engine_live_drift_change");
    expect(markdown).toContain("skill_forge_autoresearch_replay_integrity");
    expect(markdown).toContain("skill_forge_autoresearch_replay_change");
    expect(markdown).toContain("Social Reasoning Bench");
    expect(markdown).toContain("social_reasoning_bench_replay_integrity");
    expect(markdown).toContain("social_reasoning_bench_replay_change");
    expect(markdown).toContain("BestTester");
    expect(markdown).toContain("besttester_replay_integrity");
    expect(markdown).toContain("besttester_replay_change");
    expect(markdown).toContain("Critic Rubrics rubric-supervised critic methodology");
    expect(markdown).toContain("critic_rubrics_methodology_integrity");
    expect(markdown).toContain("critic_rubrics_methodology_change");
    expect(markdown).toContain("Agent Belt-style reproducible coding-agent evaluation");
    expect(markdown).toContain("agent_belt_methodology_versioning_integrity");
    expect(markdown).toContain("agent_belt_methodology_versioning_change");
    expect(markdown).toContain("AcademiClaw-style academic-task");
    expect(markdown).toContain("academiclaw_metric_validity");
    expect(markdown).toContain("academiclaw_coverage");
    expect(markdown).toContain("academiclaw_metric_validity_change");
    expect(markdown).toContain("RAG chunking technique");
    expect(markdown).toContain("rag_chunking_technique_metric_validity");
    expect(markdown).toContain("rag_chunking_technique_coverage");
    expect(markdown).toContain("rag_chunking_technique_metric_validity_change");
    expect(markdown).toContain("Kubernetes operational-agent metric-validity");
    expect(markdown).toContain("kubernetes_operational_agent_metric_validity");
    expect(markdown).toContain("kubernetes_operational_agent_coverage");
    expect(markdown).toContain("kubernetes_operational_agent_metric_validity_change");
    expect(markdown).toContain("SecureVibeBench secure-coding metric-validity");
    expect(markdown).toContain("secure_vibe_bench_metric_validity");
    expect(markdown).toContain("secure_vibe_bench_coverage");
    expect(markdown).toContain("secure_vibe_bench_metric_validity_change");
    expect(markdown).toContain("Darwin Godel Machine live-drift receipts");
    expect(markdown).toContain("darwin_godel_machine_live_drift_integrity");
    expect(markdown).toContain("darwin_godel_machine_live_drift_evidence");
    expect(markdown).toContain("darwin_godel_machine_live_drift_change");
    expect(markdown).toContain("effect-autoagent replay-corpus receipts");
    expect(markdown).toContain("effect_autoagent_replay_integrity");
    expect(markdown).toContain("effect_autoagent_replay_evidence");
    expect(markdown).toContain("effect_autoagent_replay_change");
    expect(markdown).toContain("Falcon Evaluate provider-drift receipts");
    expect(markdown).toContain("falcon_evaluate_provider_drift_integrity");
    expect(markdown).toContain("falcon_evaluate_provider_drift_evidence");
    expect(markdown).toContain("falcon_evaluate_provider_drift_change");
    expect(markdown).toContain("AgentDefense-Bench provider-drift receipts");
    expect(markdown).toContain("agent_defense_bench_provider_drift_integrity");
    expect(markdown).toContain("agent_defense_bench_provider_drift_evidence");
    expect(markdown).toContain("agent_defense_bench_provider_drift_change");
    expect(markdown).toContain("paper-read-skill live-drift receipts");
    expect(markdown).toContain("paper_read_skill_live_drift_integrity");
    expect(markdown).toContain("paper_read_skill_live_drift_evidence");
    expect(markdown).toContain("paper_read_skill_live_drift_change");
    expect(markdown).toContain("eval-ai-library question-explainability receipts");
    expect(markdown).toContain("eval_ai_library_question_explainability_integrity");
    expect(markdown).toContain("eval_ai_library_question_explainability_evidence");
    expect(markdown).toContain("eval_ai_library_question_explainability_change");
    expect(markdown).toContain("Open Models RAG question-explainability receipts");
    expect(markdown).toContain("open_model_rag_question_explainability_integrity");
    expect(markdown).toContain("open_model_rag_question_explainability_evidence");
    expect(markdown).toContain("open_model_rag_question_explainability_change");
    expect(markdown).toContain("fore public methodology versioning receipts");
    expect(markdown).toContain("fore_public_methodology_versioning_integrity");
    expect(markdown).toContain("fore_public_methodology_versioning_evidence");
    expect(markdown).toContain("fore_public_methodology_versioning_change");
    expect(markdown).toContain("HeurekaBench scientific co-scientist replay receipts");
    expect(markdown).toContain("heurekabench_scientific_replay_integrity");
    expect(markdown).toContain("heurekabench_scientific_replay_evidence");
    expect(markdown).toContain("heurekabench_scientific_replay_change");
    expect(markdown).toContain("RAG contradiction detector replay receipts");
    expect(markdown).toContain("rag_contradiction_detector_replay_integrity");
    expect(markdown).toContain("rag_contradiction_detector_replay_evidence");
    expect(markdown).toContain("rag_contradiction_detector_replay_change");
    expect(markdown).toContain("SkillMatch resume live-drift receipts");
    expect(markdown).toContain("skillmatch_resume_live_drift_integrity");
    expect(markdown).toContain("skillmatch_resume_live_drift_evidence");
    expect(markdown).toContain("skillmatch_resume_live_drift_change");
    expect(markdown).toContain("Decibench voice live-drift receipts");
    expect(markdown).toContain("decibench_voice_live_drift_integrity");
    expect(markdown).toContain("decibench_voice_live_drift_evidence");
    expect(markdown).toContain("decibench_voice_live_drift_change");
    expect(markdown).toContain("Evidra provider-drift receipts");
    expect(markdown).toContain("evidra_provider_drift_integrity");
    expect(markdown).toContain("evidra_provider_drift_evidence");
    expect(markdown).toContain("evidra_provider_drift_change");
    expect(markdown).toContain("RAViG-Bench metric-validity receipts");
    expect(markdown).toContain("ravig_bench_metric_validity_integrity");
    expect(markdown).toContain("ravig_bench_metric_validity_evidence");
    expect(markdown).toContain("ravig_bench_metric_validity_change");
    expect(markdown).toContain("RAIL Score live-drift receipts");
    expect(markdown).toContain("rail_score_live_drift_integrity");
    expect(markdown).toContain("rail_score_live_drift_evidence");
    expect(markdown).toContain("rail_score_live_drift_change");
    expect(markdown).toContain("GaRAGe live-drift receipts");
    expect(markdown).toContain("garage_rag_grounding_live_drift_integrity");
    expect(markdown).toContain("garage_rag_grounding_live_drift_evidence");
    expect(markdown).toContain("garage_rag_grounding_live_drift_change");
    expect(markdown).toContain("llm-prompting-tests public-methodology receipts");
    expect(markdown).toContain("llm_prompting_tests_public_methodology_integrity");
    expect(markdown).toContain("llm_prompting_tests_public_methodology_evidence");
    expect(markdown).toContain("llm_prompting_tests_public_methodology_change");
    expect(markdown).toContain("Scorable SDK Studio drilldown receipts");
    expect(markdown).toContain("scorable_studio_drilldown_integrity");
    expect(markdown).toContain("scorable_studio_drilldown_evidence");
    expect(markdown).toContain("scorable_studio_drilldown_change");
    expect(markdown).toContain("Knowlytics-AI MCQ/RAG replay-corpus receipts");
    expect(markdown).toContain("knowlytics_ai_replay_integrity");
    expect(markdown).toContain("knowlytics_ai_replay_evidence");
    expect(markdown).toContain("knowlytics_ai_replay_change");
    expect(markdown).toContain("Calibra public-methodology receipts");
    expect(markdown).toContain("calibra_public_methodology_integrity");
    expect(markdown).toContain("calibra_public_methodology_evidence");
    expect(markdown).toContain("calibra_public_methodology_change");
    expect(markdown).toContain("Awesome AI Evaluation Guide");
    expect(markdown).toContain("ai_evaluation_guide_methodology_integrity");
    expect(markdown).toContain("ai_evaluation_guide_methodology_change");
    expect(markdown).toContain("Rag-Eval-flow-style local RAG replay");
    expect(markdown).toContain("rag_eval_flow_replay_integrity");
    expect(markdown).toContain("rag_eval_flow_replay_change");
    expect(markdown).toContain("rag-eval-style document QA replay");
    expect(markdown).toContain("rag_eval_dataset_replay_integrity");
    expect(markdown).toContain("rag_eval_dataset_replay_change");
    expect(markdown).toContain("rag_eval_dataset_replay_evidence");
    expect(markdown).toContain("BioKGBench-style biomedical KG");
    expect(markdown).toContain("bio_kg_bench_replay_integrity");
    expect(markdown).toContain("bio_kg_bench_replay_change");
    expect(markdown).toContain("BioMedArena-style biomedical harness");
    expect(markdown).toContain("biomedarena_replay_integrity");
    expect(markdown).toContain("biomedarena_replay_change");
    expect(markdown).toContain("biomedarena_replay_evidence");
    expect(markdown).toContain("ARIASHA/MiRAGE-style drug-repositioning");
    expect(markdown).toContain("mirage_drug_repositioning_metric_validity");
    expect(markdown).toContain("mirage_drug_repositioning_metric_validity_change");
    expect(markdown).toContain("Agentest-style scenario-test");
    expect(markdown).toContain("agent_scenario_test_metric_validity");
    expect(markdown).toContain("agent_scenario_test_coverage");
    expect(markdown).toContain("agent_scenario_test_metric_validity_change");
    expect(markdown).toContain("OpenCode-lab-style");
    expect(markdown).toContain("opencode_lab_metric_validity");
    expect(markdown).toContain("open_code_lab_coverage");
    expect(markdown).toContain("opencode_lab_metric_validity_change");
    expect(markdown).toContain("cc-plugin-eval-style");
    expect(markdown).toContain("cc_plugin_eval_metric_validity");
    expect(markdown).toContain("cc_plugin_eval_coverage");
    expect(markdown).toContain("cc_plugin_eval_metric_validity_change");
    expect(markdown).toContain("Realign-style simulation");
    expect(markdown).toContain("realign_simulation_metric_validity");
    expect(markdown).toContain("realign_simulation_coverage");
    expect(markdown).toContain("realign_simulation_metric_validity_change");
    expect(markdown).toContain("HumanStudy-Bench-style participant-simulation");
    expect(markdown).toContain("humanstudybench_metric_validity");
    expect(markdown).toContain("humanstudybench_coverage");
    expect(markdown).toContain("humanstudybench_metric_validity_change");
    expect(markdown).toContain("Legacy-Bench-style legacy-software");
    expect(markdown).toContain("legacybench_metric_validity");
    expect(markdown).toContain("legacybench_coverage");
    expect(markdown).toContain("legacybench_metric_validity_change");
    expect(markdown).toContain("SubtleMemory-style relational-memory");
    expect(markdown).toContain("subtlememory_metric_validity");
    expect(markdown).toContain("subtlememory_metric_validity_change");
    expect(markdown).toContain("RAGAS notebook");
    expect(markdown).toContain("ragas_notebook_metric_validity");
    expect(markdown).toContain("ragas_notebook_metric_validity_change");
    expect(markdown).toContain("OSUniverse-style GUI-navigation");
    expect(markdown).toContain("gui_navigation_live_drift_integrity");
    expect(markdown).toContain("gui_navigation_live_drift_change");
    expect(markdown).toContain("BioAgentBench-style");
    expect(markdown).toContain("bioinformatics_agent_metric_validity");
    expect(markdown).toContain("bioinformatics_agent_coverage");
    expect(markdown).toContain("bioinformatics_agent_metric_validity_change");
    expect(markdown).toContain("mobile_agent_metric_validity");
    expect(markdown).toContain("mobile_agent_coverage");
    expect(markdown).toContain("DocThinker-style");
    expect(markdown).toContain("document_rag_memory_replay_integrity");
    expect(markdown).toContain("document_rag_memory_replay_change");
    expect(markdown).toContain("CloneMem-style");
    expect(markdown).toContain("clonemem_long_term_memory_replay_integrity");
    expect(markdown).toContain("clonemem_long_term_memory_replay_evidence");
    expect(markdown).toContain("clonemem_long_term_memory_replay_change");
    expect(markdown).toContain("ResearchHarness-style");
    expect(markdown).toContain("researchharness_agent_replay_integrity");
    expect(markdown).toContain("researchharness_agent_replay_evidence");
    expect(markdown).toContain("researchharness_agent_replay_change");
    expect(markdown).toContain("Agent_Mont-style");
    expect(markdown).toContain("agent_mont_monitoring_replay_integrity");
    expect(markdown).toContain("agent_mont_monitoring_replay_evidence");
    expect(markdown).toContain("agent_mont_monitoring_replay_change");
    expect(markdown).toContain("Nuclia-style RAG-triad");
    expect(markdown).toContain("nuclia_rag_triad_replay_integrity");
    expect(markdown).toContain("nuclia_rag_triad_replay_evidence");
    expect(markdown).toContain("nuclia_rag_triad_replay_change");
    expect(markdown).toContain("Navi-Bench-style real-website web-agent");
    expect(markdown).toContain("navi_bench_web_agent_live_drift_integrity");
    expect(markdown).toContain("navi_bench_web_agent_live_drift_evidence");
    expect(markdown).toContain("navi_bench_web_agent_live_drift_change");
    expect(markdown).toContain("AgentTrial-style statistical question-explainability");
    expect(markdown).toContain("agent_trial_statistical_question_explainability_integrity");
    expect(markdown).toContain("agent_trial_statistical_question_explainability_evidence");
    expect(markdown).toContain("agent_trial_statistical_question_explainability_change");
    expect(markdown).toContain("CodeQuest-style");
    expect(markdown).toContain("codequest_quality_question_explainability_integrity");
    expect(markdown).toContain("codequest_quality_question_explainability_evidence");
    expect(markdown).toContain("codequest_quality_question_explainability_change");
    expect(markdown).toContain("Parallel/OpenClaw research-skill");
    expect(markdown).toContain("parallel_research_skill_metric_validity");
    expect(markdown).toContain("parallel_research_skill_coverage");
    expect(markdown).toContain("parallel_research_skill_metric_validity_change");
    expect(markdown).toContain("resume_rag_evaluator_metric_validity");
    expect(markdown).toContain("resume_rag_evaluator_coverage");
    expect(markdown).toContain("resume_rag_evaluator_metric_validity_change");
    expect(markdown).toContain("chipbenchmark_metric_validity");
    expect(markdown).toContain("chipbenchmark_coverage");
    expect(markdown).toContain("chipbenchmark_metric_validity_change");
    expect(markdown).toContain("Hermes Bench");
    expect(markdown).toContain("hermes_bench_metric_validity");
    expect(markdown).toContain("hermes_bench_metric_validity_change");
    expect(markdown).toContain("CooperBench");
    expect(markdown).toContain("cooperbench_metric_validity");
    expect(markdown).toContain("cooperbench_metric_validity_change");
    expect(markdown).toContain("CoderCup");
    expect(markdown).toContain("codercup_metric_validity");
    expect(markdown).toContain("codercup_metric_validity_change");
    expect(markdown).toContain("Agentic Graph RAG");
    expect(markdown).toContain("agentic_graph_rag_metric_validity");
    expect(markdown).toContain("agentic_graph_rag_metric_validity_change");
    expect(markdown).toContain("Awesome-Agent-Memory-style memory-catalog live-drift");
    expect(markdown).toContain("awesome_agent_memory_live_drift_integrity");
    expect(markdown).toContain("awesome_agent_memory_live_drift_change");
    expect(markdown).toContain("Agent Reading Test-style web-content reading live-drift");
    expect(markdown).toContain("agent_reading_test_live_drift_integrity");
    expect(markdown).toContain("agent_reading_test_live_drift_change");
    expect(markdown).toContain("AI Reputation Claude");
    expect(markdown).toContain("ai_reputation_claude_live_drift_integrity");
    expect(markdown).toContain("ai_reputation_claude_live_drift_change");
    expect(markdown).toContain("FishCodeTech CTF-agent benchmark live-drift");
    expect(markdown).toContain("ctf_agent_benchmark_live_drift_integrity");
    expect(markdown).toContain("ctf_agent_benchmark_live_drift_change");
    expect(markdown).toContain("LLM Fighter");
    expect(markdown).toContain("llm_fighter_live_drift_integrity");
    expect(markdown).toContain("llm_fighter_live_drift_change");
    expect(markdown).toContain("AgentKernelArena-style GPU-kernel replay");
    expect(markdown).toContain("agentkernelarena_gpu_kernel_replay_integrity");
    expect(markdown).toContain("agentkernelarena_gpu_kernel_replay_evidence");
    expect(markdown).toContain("agentkernelarena_gpu_kernel_replay_change");
    expect(markdown).toContain("LLM Evaluation System-style jury replay");
    expect(markdown).toContain("llm_evaluation_system_jury_replay_integrity");
    expect(markdown).toContain("llm_evaluation_system_jury_replay_evidence");
    expect(markdown).toContain("llm_evaluation_system_jury_replay_change");
    expect(markdown).toContain("InnovatorBench-style");
    expect(markdown).toContain("innovatorbench_research_replay_integrity");
    expect(markdown).toContain("innovatorbench_research_replay_evidence");
    expect(markdown).toContain("innovatorbench_research_replay_change");
    expect(markdown).toContain("Edge AI agent");
    expect(markdown).toContain("MiniAppBench-style interactive HTML replay");
    expect(markdown).toContain("edge_ai_agent_replay_integrity");
    expect(markdown).toContain("edge_ai_agent_replay_evidence");
    expect(markdown).toContain("edge_ai_agent_replay_change");
    expect(markdown).toContain("Agent Workflow Kit-style");
    expect(markdown).toContain("agent_workflow_kit_replay_integrity");
    expect(markdown).toContain("agent_workflow_kit_replay_evidence");
    expect(markdown).toContain("agent_workflow_kit_replay_change");
    expect(markdown).toContain("Legal Code RAG");
    expect(markdown).toContain("legal_code_rag_metric_validity");
    expect(markdown).toContain("legal_code_rag_metric_coverage");
    expect(markdown).toContain("legal_code_rag_metric_validity_change");
    expect(markdown).toContain("A2A-NT-style");
    expect(markdown).toContain("a2a_negotiation_transaction_methodology_integrity");
    expect(markdown).toContain("a2a_negotiation_transaction_methodology_change");
    expect(markdown).toContain("Metronous-style local AI agent telemetry");
    expect(markdown).toContain("metronous_telemetry_calibration_methodology_integrity");
    expect(markdown).toContain("metronous_telemetry_calibration_methodology_change");
    expect(markdown).toContain("## Methodology Versioning Assurance");
    expect(markdown).toContain("## Sutro Batch Methodology Assurance");
    expect(markdown).toContain("Sutro-style grounded LLM judges");
    expect(markdown).toContain("sutro_batch_methodology_versioning_integrity");
    expect(markdown).toContain("sutro_batch_methodology_versioning_change");
    expect(markdown).toContain("## Agent Belt Methodology Assurance");
    expect(markdown).toContain("Encourage-style modular RAG replay");
    expect(markdown).toContain("encourage_rag_replay_integrity");
    expect(markdown).toContain("encourage_rag_replay_change");
    expect(markdown).toContain("amc_methodology_assurance");
    expect(markdown).toContain("Eval-ai-library-style");
    expect(markdown).toContain("provider evaluator framework");
    expect(markdown).toContain("Opik-style provider observability pipeline");
    expect(markdown).toContain("provider_observability_pipeline_integrity");
    expect(markdown).toContain("GeoBenchX-style geospatial provider-drift");
    expect(markdown).toContain("geospatial_tool_calling_provider_drift");
    expect(markdown).toContain("geospatial_provider_drift_evidence");
    expect(markdown).toContain("AIAnytime-style LLM/RAG eval-suite live drift");
    expect(markdown).toContain("llm_rag_eval_suite_live_drift_integrity");
    expect(markdown).toContain("llm_rag_eval_suite_live_drift_evidence");
    expect(markdown).toContain("llm_rag_eval_suite_live_drift_change");
    expect(markdown).toContain("KITE-style RAG live-drift");
    expect(markdown).toContain("kite_rag_live_drift_integrity");
    expect(markdown).toContain("kite_rag_live_drift_evidence");
    expect(markdown).toContain("kite_rag_live_drift_change");
    expect(markdown).toContain("SAP agent-evaluation tutorial");
    expect(markdown).toContain("sap_agent_eval_tutorial_live_drift_integrity");
    expect(markdown).toContain("sap_agent_eval_tutorial_live_drift_evidence");
    expect(markdown).toContain("sap_agent_eval_tutorial_live_drift_change");
    expect(markdown).toContain("agent-evaluation observability");
    expect(markdown).toContain("agent_eval_observability_live_drift_integrity");
    expect(markdown).toContain("agent_eval_observability_live_drift_evidence");
    expect(markdown).toContain("agent_eval_observability_live_drift_change");
    expect(markdown).toContain("HedraRAG");
    expect(markdown).toContain("hedrarag_artifact_eval_live_drift_integrity");
    expect(markdown).toContain("hedrarag_artifact_eval_live_drift_evidence");
    expect(markdown).toContain("hedrarag_artifact_eval_live_drift_change");
    expect(markdown).toContain("agent-eval-harness");
    expect(markdown).toContain("agent_eval_harness_live_drift_integrity");
    expect(markdown).toContain("agent_eval_harness_live_drift_evidence");
    expect(markdown).toContain("agent_eval_harness_live_drift_change");
    expect(markdown).toContain("CostNav-style physical navigation");
    expect(markdown).toContain("costnav_physical_navigation_replay_integrity");
    expect(markdown).toContain("costnav_physical_navigation_replay_evidence");
    expect(markdown).toContain("costnav_physical_navigation_replay_change");
    expect(markdown).toContain("Multi-User-LLM-Agent-style");
    expect(markdown).toContain("multi_user_question_explainability_integrity");
    expect(markdown).toContain("multi_user_question_explainability_change");
    expect(markdown).toContain("CL-Bench-style continual-learning");
    expect(markdown).toContain("continual_learning_question_explainability_integrity");
    expect(markdown).toContain("continual_learning_question_explainability_change");
    expect(markdown).toContain("Adsum IoT Coder-style");
    expect(markdown).toContain("iot_firmware_question_explainability_integrity");
    expect(markdown).toContain("iot_firmware_question_explainability_change");
    expect(markdown).toContain("ShampooSalesAgent-style");
    expect(markdown).toContain("retail_sales_question_explainability_integrity");
    expect(markdown).toContain("retail_sales_question_explainability_change");
    expect(markdown).toContain("NoMIRACL-style multilingual RAG live-drift");
    expect(markdown).toContain("nomiracl_multilingual_rag_live_drift_integrity");
    expect(markdown).toContain("nomiracl_multilingual_rag_live_drift_evidence");
    expect(markdown).toContain("nomiracl_multilingual_rag_live_drift_change");
    expect(markdown).toContain("SLDBench-style scaling-law discovery");
    expect(markdown).toContain("scaling_law_discovery_live_drift_integrity");
    expect(markdown).toContain("scaling_law_discovery_live_drift_evidence");
    expect(markdown).toContain("scaling_law_discovery_live_drift_change");
    expect(markdown).toContain("Recovery-Bench-style");
    expect(markdown).toContain("recovery_bench_live_drift_integrity");
    expect(markdown).toContain("recovery_bench_live_drift_evidence");
    expect(markdown).toContain("recovery_bench_live_drift_change");
    expect(markdown).toContain("scenario_simulation_replay_integrity");
    expect(markdown).toContain("scenario_simulation_replay_evidence");
    expect(markdown).toContain("scenario_simulation_replay_change");
    expect(markdown).toContain("warehouse_native_llm_eval_replay_integrity");
    expect(markdown).toContain("warehouse_native_llm_eval_replay_evidence");
    expect(markdown).toContain("warehouse_native_llm_eval_replay_change");
    expect(markdown).toContain("warehouse-native LLM eval");
    expect(markdown).toContain("llm_workflow_observability_methodology_integrity");
    expect(markdown).toContain("llm_workflow_observability_methodology_change");
    expect(markdown).toContain("AgiFlow-style");
    expect(markdown).toContain("AICrypto-style cryptography benchmark");
    expect(markdown).toContain("cryptography_benchmark_methodology_integrity");
    expect(markdown).toContain("REALTALK-style long-term conversation");
    expect(markdown).toContain("Living-environment metric-validity");
    expect(markdown).toContain("PersonaGym-style");
    expect(markdown).toContain("Polymath-style");
    expect(markdown).toContain("GAGE-style");
    expect(markdown).toContain("VLA/world-model");
    expect(markdown).toContain("Awesome AI Pentest-style curated-index");
    expect(markdown).toContain("Red-team/offensive-security");
    expect(markdown).toContain("web-operator");
    expect(markdown).toContain("multimodal_rag_methodology_versioning");
    expect(markdown).toContain("M2RAG-style multimodal RAG methodology");
    expect(markdown).toContain("RagScore-style RAG audit methodology");
    expect(markdown).toContain("continual-game");
    expect(markdown).toContain("Azure agent-lab");
    expect(markdown).toContain("ClawEnvKit-style");
    expect(markdown).toContain("DeepResearch-style");
    expect(markdown).toContain("## Benchmark Methodology Versioning");
    expect(markdown).toContain("static_offline");
    expect(markdown).toContain("live_dynamic");
    expect(markdown).toContain("model_pool_or_tier_policy_change");
    expect(markdown).toContain("tournament_or_leaderboard_protocol_change");
    expect(markdown).toContain("## Score Claim Boundaries");
    expect(markdown).toContain("divergent_trajectory_reasoning");
    expect(markdown).toContain("social_simulation_realism");
    expect(markdown).toContain("persona_policy_realism");
    expect(markdown).toContain("ctf_live_evaluation_integrity");
    expect(markdown).toContain("ctf_partial_credit_validity");
    expect(markdown).toContain("multi_agent_privacy_leakage");
    expect(markdown).toContain("architectural_smell_repair");
    expect(markdown).toContain("iterative_tournament_learning");
    expect(markdown).toContain("## Metric Validation Gates");
    expect(markdown).toContain("counterfactual_responsiveness");
    expect(markdown).toContain("confounder_control_coverage");
    expect(markdown).toContain("target_outcome_alignment");
    expect(markdown).toContain("process_evidence_coverage");
    expect(markdown).toContain("safety_utility_coverage");
    expect(markdown).toContain("modality_transformation_coverage");
    expect(markdown).toContain("ranking_stability_coverage");
    expect(markdown).toContain("tool_sandbox_coverage");
    expect(markdown).toContain("architecture_reality_coverage");
    expect(markdown).toContain("business_workflow_coverage");
    expect(markdown).toContain("data_agent_analytical_coverage");
    expect(markdown).toContain("embodied_agent_coverage");
    expect(markdown).toContain("evaluator_suite_coverage");
    expect(markdown).toContain("pentest_benchmark_coverage");
    expect(markdown).toContain("trace_evaluation_coverage");
    expect(markdown).toContain("## External Source Verification Policy");
    expect(markdown).toContain("metadata_only_rejected");
    expect(markdown).toContain("source_unavailable_disclosed");
    expect(markdown).toContain("Pentesting and threat-model benchmark");
    expect(markdown).toContain("Trace-derived agent-evaluation");
    expect(markdown).toContain("## Deprecation Notice");
    expect(markdown).toContain("## Migration Guidance");
    expect(ref.hash).toBe(manifest.hash);
    expect(ref.id).toBe(manifest.id);
  });

  test("binds the methodology manifest into diagnostic reports and markdown", async () => {
    const ws = workspace();
    const report = await runDiagnostic({
      workspace: ws,
      agentId: "methodology-test-agent",
      window: "14d",
      targetName: "default",
      claimMode: "auto",
      noSign: true
    });

    expect(report.methodology?.id).toBe(AMC_PUBLIC_METHODOLOGY_ID);
    expect(report.methodology?.version).toBe(AMC_PUBLIC_METHODOLOGY_VERSION);
    expect(report.methodology?.hash).toMatch(/^[a-f0-9]{64}$/);
    expect(report.methodologyVersioning?.status).toBe("ready");
    expect(report.methodologyVersioning?.sourceRef).toContain("github:kiosvantra/metronous");
    expect(report.methodologyVersioning?.sourceRef).toContain("github:sutro-sh/sutro");
    expect(report.methodologyVersioning?.sourceRef).toContain("github:jfrog/agent-belt");
    expect(report.methodologyVersioning?.sourceRef).toContain("https://phoenix.arize.com");
    expect(report.methodologyVersioning?.sourceRef).toContain("github:google/adk-python");
    expect(report.methodologyVersioning?.receiptHash).toMatch(/^[a-f0-9]{64}$/);
    expect(report.methodologyVersioning?.badgeQueryParams).toContain("amc_methodology_assurance");
    expect(report.methodologyVersioning?.requiredAuditFields).toContain("arizePhoenixThresholdPolicy");
    expect(report.methodologyVersioning?.requiredAuditFields).toContain("googleAdkValidationTable");
    expect(report.methodologyVersioning?.presentAuditFields).toContain("sourceReview.arizePhoenix.metricGate");
    expect(report.methodologyVersioning?.presentAuditFields).toContain("sourceReview.googleAdk.metricGate");
    expect(report.methodologyVersioning?.evidenceRefs).toContain("amc:arize-phoenix-source-review-boundary");
    expect(report.methodologyVersioning?.evidenceRefs).toContain("amc:google-adk-source-review-boundary");
    expect(report.methodologyVersioning?.rejectedEvidenceRefs).toContain("metadata-only:phoenix.arize.com");
    expect(report.methodologyVersioning?.rejectedEvidenceRefs).toContain("metadata-only:google/adk-python");
    expect(report.methodologyVersioning?.batchMethodologyProof?.dryRunCostEstimateRequired).toBe(true);
    expect(report.methodologyVersioning?.batchMethodologyProof?.resultExportRequired).toBe(true);
    expect(report.methodologyVersioning?.agentBeltMethodologyProof?.passPowerKReliabilityRequired).toBe(true);
    expect(report.methodologyVersioning?.agentBeltMethodologyProof?.packageReleaseDigestRequired).toBe(true);
    expect(report.methodologyVersioning?.missingAuditFields).toEqual([]);
    expect(report.metricValidation?.rows.length).toBeGreaterThan(0);
    expect(report.metricValidation?.rows[0]?.owner).toBe("AMC Score");
    expect(report.metricValidation?.rows[0]?.confidenceInterval.level).toBe(0.95);
    expect(report.reportJsonSha256).toMatch(/^[a-f0-9]{64}$/);

    const markdown = generateReport(report, "md") as string;
    expect(markdown).toContain(`- Methodology: ${AMC_PUBLIC_METHODOLOGY_ID} ${AMC_PUBLIC_METHODOLOGY_VERSION}`);
    expect(markdown).toContain(`- Methodology Hash: ${report.methodology?.hash}`);
    expect(markdown).toContain("## Methodology Versioning Assurance");
    expect(markdown).toContain(`- Methodology Versioning Receipt Hash: ${report.methodologyVersioning?.receiptHash}`);
    expect(markdown).toContain("## Metric Validity and Reliability");
    expect(markdown).toContain("| Metric | Owner | Sample | Construct Validity |");
  }, 120_000);
});
