import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildProviderDriftCiGate,
  buildProviderDriftEvalPack,
  buildProviderDriftWatchAlerts,
  runProviderDriftBenchmark,
  type ProviderDriftCanaryRow,
} from "../src/benchmarks/providerDriftBenchmark.js";

const DOC = "docs/source-reviews/GAP-0841-legal-rag-kubernetes-jenkins-provider-drift.md";
const REPO = "nguyenthai-duong/Deploying-RAG-on-Kubernetes-with-Jenkins-for-Legal-Document-Retrieval";
const URL = "https://github.com/nguyenthai-duong/Deploying-RAG-on-Kubernetes-with-Jenkins-for-Legal-Document-Retrieval";
const TITLE = "Deploying RAG on K8s with Jenkins for Legal Document Retrieval";

const implementationFiles = [
  "src/benchmarks/providerDriftBenchmark.ts",
  "src/watch/providerDriftAlerts.ts",
  "src/api/benchmarkRouter.ts",
];

const hash = (seed: string): string => seed.repeat(64).slice(0, 64);

const baseRow = (side: "baseline" | "candidate", overrides: Partial<ProviderDriftCanaryRow> = {}): ProviderDriftCanaryRow => ({
  provider: "self-hosted-huggingface",
  model: "Vistral-7B-Chat",
  version: side === "baseline" ? "2026-06-01" : "2026-06-21",
  canaryId: "legal-rag-kubernetes-provider-canary",
  benchmarkFamily: "legal-rag-provider-drift",
  capabilityId: "legal-rag-retrieval-generation-stability",
  evaluationFrameworkId: "amc-owned-legal-rag-provider-drift-eval",
  evaluationFrameworkVersion: "2026.06.21",
  providerRouteId: `huggingface:tgi:vistral-7b:${side}:legal-rag`,
  metricSuiteId: "legal-rag-provider-drift-suite",
  metricIds: ["rag_answer_score", "retrieval_hit_rate", "citation_grounding", "refusal_rate", "latency", "cost"],
  metricCount: 6,
  evaluatorConfigHash: hash(side === "baseline" ? "a" : "b"),
  generatedTestDataHash: hash(side === "baseline" ? "c" : "d"),
  verdictAggregation: "mean",
  verdictAggregationConfigHash: hash(side === "baseline" ? "e" : "f"),
  dashboardArtifactHash: hash(side === "baseline" ? "1" : "2"),
  pipelineOrchestratorId: "amc-legal-rag-provider-drift-canary",
  pipelineRunId: `legal-rag-${side}`,
  experimentTrackerId: "amc-provider-drift-ledger",
  experimentRunId: `legal-rag-canary-${side}`,
  observabilityProjectId: "amc-legal-rag-observability",
  datastoreId: "amc-owned-legal-rag-fixtures",
  retrievalIndexHash: hash(side === "baseline" ? "3" : "4"),
  contentDatasetHash: hash("5"),
  summaryArtifactHash: hash(side === "baseline" ? "6" : "7"),
  qaDatasetHash: hash("8"),
  traceExportHash: hash(side === "baseline" ? "9" : "0"),
  metricReportHash: hash(side === "baseline" ? "a" : "b"),
  pipelineConfigHash: hash(side === "baseline" ? "c" : "d"),
  sampleSize: 34,
  trajectoryCount: 34,
  scoreMean0to1: side === "baseline" ? 0.82 : 0.807,
  refusalRate0to1: side === "baseline" ? 0.035 : 0.039,
  invalidActionRate0to1: side === "baseline" ? 0.026 : 0.029,
  evaluatorCoverage0to1: side === "baseline" ? 0.982 : 0.979,
  guardrailPassRate0to1: side === "baseline" ? 0.958 : 0.951,
  latencyMsP95: side === "baseline" ? 2400 : 2530,
  costUsdMean: side === "baseline" ? 0.018 : 0.019,
  evidenceRefs: [`legal-rag:${side}:canary`],
  signedEvidenceRefs: [`ledger:legal-rag-${side}`],
  ...overrides,
});

describe("GAP-0841 legal RAG Kubernetes provider-drift boundary", () => {
  it("documents live GitHub metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0841");
    expect(doc).toContain(REPO);
    expect(doc).toContain(URL);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("HTTP/2 200");
    expect(doc).toContain("api.github.com repository metadata");
    expect(doc).toContain("README.md");
    expect(doc).toContain("license API returned Not Found");
    expect(doc).toContain("stargazers_count");
    expect(doc).toContain("81");
    expect(doc).toContain("Jupyter Notebook");
    expect(doc).toContain("LLM retrieval APIs");
    expect(doc).toContain("hybrid GCP architecture");
    expect(doc).toContain("CI/CD");
    expect(doc).toContain("IaC");
    expect(doc).toContain("monitoring");
    expect(doc).toContain("Google Kubernetes Engine");
    expect(doc).toContain("Jenkins");
    expect(doc).toContain("Terraform");
    expect(doc).toContain("Ansible");
    expect(doc).toContain("FastAPI");
    expect(doc).toContain("Docker");
    expect(doc).toContain("Kubernetes");
    expect(doc).toContain("Helm");
    expect(doc).toContain("Weaviate");
    expect(doc).toContain("Prometheus");
    expect(doc).toContain("Loki");
    expect(doc).toContain("Grafana");
    expect(doc).toContain("Jaeger");
    expect(doc).toContain("OpenTelemetry");
    expect(doc).toContain("Vistral-7B-Chat");
    expect(doc).toContain("throughput");
    expect(doc).toContain("latency");
    expect(doc).toContain("provider version");
    expect(doc).toContain("canary results");
    expect(doc).toContain("drift statistic");
    expect(doc).toContain("alert or waiver");
    expect(doc).toContain("## Relevance decision");
    expect(doc).toContain("## AMC/8 surface check");
    expect(doc).toContain("## Product closure");
    expect(doc).toContain("## Fail-closed rule");
    expect(doc).toContain("## No-bloat boundary");
    expect(doc).toContain("## Verification");
  });

  it("uses existing provider-drift evaluator for legal RAG deployment context", () => {
    const report = runProviderDriftBenchmark({
      agentId: "legal-rag-kubernetes-reviewed-agent",
      baseline: [baseRow("baseline")],
      candidate: [baseRow("candidate")],
      thresholds: {
        minEvaluationMetricCount: 6,
        minTrajectoryCount: 30,
        maxGuardrailPassRateDrop0to1: 0.02,
      },
    });

    const pack = buildProviderDriftEvalPack(report, {
      packId: "provider-drift-legal-rag-kubernetes-v1",
      datasetHash: hash("f"),
      sourceRefs: [URL],
    });

    expect(report.recommendation).toBe("approve");
    expect(report.failClosed).toBe(false);
    expect(pack.replayable).toBe(true);
    expect(pack.sourceRefs).toEqual([URL]);
    expect(pack.rows[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);
    expect(buildProviderDriftWatchAlerts(report)).toEqual([]);
    expect(buildProviderDriftCiGate(report, { mode: "ci" }).passed).toBe(true);
  });

  it("fails closed when deployment metadata replaces AMC-owned provider-drift proof", () => {
    const report = runProviderDriftBenchmark({
      agentId: "legal-rag-kubernetes-reviewed-agent",
      baseline: [baseRow("baseline", { evidenceRefs: [URL], signedEvidenceRefs: [] })],
      candidate: [
        baseRow("candidate", {
          metricIds: [],
          metricCount: 1,
          evaluatorConfigHash: undefined,
          generatedTestDataHash: undefined,
          dashboardArtifactHash: undefined,
          pipelineRunId: undefined,
          traceExportHash: undefined,
          metricReportHash: undefined,
          evidenceRefs: [URL],
          signedEvidenceRefs: [],
        }),
      ],
      thresholds: { minEvaluationMetricCount: 6, minTrajectoryCount: 30 },
    });

    expect(report.recommendation).toBe("alert");
    expect(report.failClosed).toBe(true);
    expect(report.alerts.map((alert) => alert.metricId)).toEqual(expect.arrayContaining([
      "signedEvidenceRefs",
      "evaluationFrameworkEvidence",
      "observabilityPipelineEvidence",
    ]));
    expect(buildProviderDriftCiGate(report, { mode: "ci" }).failClosed).toBe(true);
  });

  it("keeps legal RAG deployment identifiers out of provider-drift implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(REPO);
      expect(source).not.toContain(URL);
      expect(source).not.toContain("legal_rag_kubernetes_provider_drift");
      expect(source).not.toContain(TITLE);
    }
  });
});
