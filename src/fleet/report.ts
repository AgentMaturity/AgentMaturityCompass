import { join } from "node:path";
import { listAgents } from "./registry.js";
import { openLedger } from "../ledger/ledger.js";
import { parseWindowToMs } from "../utils/time.js";
import { parseEvidenceEvent } from "../diagnostic/gates.js";
import { runDiagnostic } from "../diagnostic/runner.js";
import { ensureDir, writeFileAtomic } from "../utils/fs.js";
import type { DiagnosticReport } from "../types.js";

function countModels(events: Array<ReturnType<typeof parseEvidenceEvent>>): Array<{ provider: string; model: string; count: number }> {
  const map = new Map<string, number>();
  for (const event of events) {
    if (event.event_type !== "llm_request" && event.event_type !== "llm_response") {
      continue;
    }
    const provider = typeof event.meta.providerId === "string" ? event.meta.providerId : "unknown";
    const model = typeof event.meta.model === "string" && event.meta.model.length > 0 ? event.meta.model : "unknown";
    const key = `${provider}::${model}`;
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return [...map.entries()]
    .map(([key, count]) => {
      const [provider, model] = key.split("::");
      return { provider: provider ?? "unknown", model: model ?? "unknown", count };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
}

function renderFleetMarkdown(params: {
  window: string;
  reports: DiagnosticReport[];
  modelUsageByAgent: Map<string, Array<{ provider: string; model: string; count: number }>>;
  evidenceGaps: string[];
}): string {
  const summaryRows = params.reports
    .map((report) => {
      const overall = report.layerScores.reduce((sum, layer) => sum + layer.avgFinalLevel, 0) / Math.max(report.layerScores.length, 1);
      const topGaps = report.targetDiff
        .filter((row) => row.gap > 0)
        .slice(0, 5)
        .map((row) => `${row.questionId}:${row.gap}`)
        .join(", ");
      return `| ${report.agentId} | ${overall.toFixed(2)} | ${report.integrityIndex.toFixed(3)} (${report.trustLabel}) | ${topGaps || "-"} |`;
    })
    .join("\n");

  const heatmapHeader = `| Question | ${params.reports.map((report) => report.agentId).join(" | ")} |\n|---|${params.reports.map(() => "---:").join("|")}|`;
  const questionIds = params.reports[0]?.questionScores.map((score) => score.questionId) ?? [];
  const heatmapRows = questionIds
    .map((questionId) => {
      const cells = params.reports.map((report) => report.questionScores.find((score) => score.questionId === questionId)?.finalLevel ?? 0);
      return `| ${questionId} | ${cells.join(" | ")} |`;
    })
    .join("\n");

  const riskHotspots = params.reports
    .filter((report) => {
      const q8 = report.questionScores.find((score) => score.questionId === "AMC-1.8")?.finalLevel ?? 0;
      const q14 = report.questionScores.find((score) => score.questionId === "AMC-2.5")?.finalLevel ?? 0;
      const q26 = report.questionScores.find((score) => score.questionId === "AMC-3.3.1")?.finalLevel ?? 0;
      return q8 < 3 || q14 < 3 || q26 < 3;
    })
    .map((report) => `- ${report.agentId}: governance/honesty hotspot`)
    .join("\n");

  const modelLines = [...params.modelUsageByAgent.entries()]
    .map(([agentId, rows]) => `- ${agentId}: ${rows.map((row) => `${row.provider}/${row.model} (${row.count})`).join(", ") || "none"}`)
    .join("\n");

  return [
    "# AMC Fleet Report",
    "",
    `- Window: ${params.window}`,
    "",
    "## Per-Agent Summary",
    "| Agent | Overall Avg | Integrity | Top 5 Gaps |",
    "|---|---:|---|---|",
    summaryRows,
    "",
    "## Model Usage",
    modelLines || "- none",
    "",
    "## Cross-Agent Heatmap (67 Questions)",
    heatmapHeader,
    heatmapRows,
    "",
    "## Risk Hotspots",
    riskHotspots || "- none",
    "",
    "## Evidence Gaps (No OBSERVED evidence in window)",
    params.evidenceGaps.length > 0 ? params.evidenceGaps.map((line) => `- ${line}`).join("\n") : "- none",
    ""
  ].join("\n");
}

export async function generateFleetReport(params: {
  workspace: string;
  window: string;
  outputPath?: string;
}): Promise<{
  reportPath: string;
  agentCount: number;
}> {
  const agents = listAgents(params.workspace).map((row) => row.id);
  const effectiveAgents = agents.length > 0 ? agents : ["default"];
  const reports: DiagnosticReport[] = [];
  for (const agentId of effectiveAgents) {
    const report = await runDiagnostic({
      workspace: params.workspace,
      window: params.window,
      targetName: "default",
      claimMode: "auto",
      agentId
    });
    reports.push(report);
  }

  const ledger = openLedger(params.workspace);
  const now = Date.now();
  const start = now - parseWindowToMs(params.window);
  const events = ledger.getEventsBetween(start, now).map(parseEvidenceEvent);
  ledger.close();

  const modelUsageByAgent = new Map<string, Array<{ provider: string; model: string; count: number }>>();
  const evidenceGaps: string[] = [];
  for (const agentId of effectiveAgents) {
    const agentEvents = events.filter((event) => event.meta.agentId === agentId);
    modelUsageByAgent.set(agentId, countModels(agentEvents));
    const observedCount = agentEvents.filter((event) => event.trustTier === "OBSERVED").length;
    if (observedCount === 0) {
      evidenceGaps.push(agentId);
    }
  }

  const markdown = renderFleetMarkdown({
    window: params.window,
    reports,
    modelUsageByAgent,
    evidenceGaps
  });

  const reportPath = params.outputPath ?? join(params.workspace, ".amc", "reports", "fleet.md");
  ensureDir(join(params.workspace, ".amc", "reports"));
  writeFileAtomic(reportPath, markdown, 0o644);
  return {
    reportPath,
    agentCount: effectiveAgents.length
  };
}
