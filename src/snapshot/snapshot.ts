import { dirname, join, resolve } from "node:path";
import { readdirSync } from "node:fs";
import { agentDashboardDir } from "../dashboard/build.js";
import { getAgentPaths, resolveAgentId } from "../fleet/paths.js";
import { loadRunReport } from "../diagnostic/runner.js";
import { loadTargetProfile } from "../targets/targetProfile.js";
import { latestAssuranceByPack } from "../assurance/assuranceRunner.js";
import { computeFailureRiskIndices } from "../assurance/indices.js";
import { ensureDir, pathExists, readUtf8, writeFileAtomic } from "../utils/fs.js";

function latestRunId(runsDir: string): string {
  const runs = readdirSync(runsDir)
    .filter((name) => name.endsWith(".json"))
    .map((name) => JSON.parse(readUtf8(join(runsDir, name))) as { runId?: string; ts?: number })
    .sort((a, b) => (b.ts ?? 0) - (a.ts ?? 0));
  const runId = runs[0]?.runId;
  if (!runId) {
    throw new Error("No diagnostic runs found for snapshot.");
  }
  return runId;
}

function latestFileIfAny(dir: string, ext: string): string | null {
  if (!pathExists(dir)) {
    return null;
  }
  const names = readdirSync(dir)
    .filter((name) => name.endsWith(ext))
    .sort((a, b) => a.localeCompare(b));
  return names.length > 0 ? join(dir, names[names.length - 1]!) : null;
}

export function createUnifiedClaritySnapshot(params: {
  workspace: string;
  agentId?: string;
  outFile: string;
}): { outFile: string; runId: string } {
  const agentId = resolveAgentId(params.workspace, params.agentId);
  const paths = getAgentPaths(params.workspace, agentId);
  if (!pathExists(paths.runsDir)) {
    throw new Error(`No runs directory for agent ${agentId}`);
  }

  const runId = latestRunId(paths.runsDir);
  const run = loadRunReport(params.workspace, runId, agentId);
  const target = loadTargetProfile(params.workspace, "default", agentId);

  const topGaps = run.questionScores
    .map((row) => {
      const targetLevel = target.mapping[row.questionId] ?? 0;
      return {
        questionId: row.questionId,
        current: row.finalLevel,
        target: targetLevel,
        gap: targetLevel - row.finalLevel,
        whyCapped: row.flags.join(", ") || "none"
      };
    })
    .filter((row) => row.gap > 0)
    .sort((a, b) => b.gap - a.gap || a.questionId.localeCompare(b.questionId))
    .slice(0, 7);

  const indices = computeFailureRiskIndices({ run });
  const assuranceByPack = latestAssuranceByPack({
    workspace: params.workspace,
    agentId,
    windowStartTs: run.windowStartTs,
    windowEndTs: run.windowEndTs
  });
  const assuranceSummary = [...assuranceByPack.values()]
    .map((pack) => `- ${pack.packId}: ${pack.score0to100.toFixed(1)} (${pack.passCount}/${pack.scenarioCount} pass)`)
    .join("\n") || "- none";

  const dashboardPath = join(agentDashboardDir(params.workspace, agentId), "index.html");
  const bundlePath = latestFileIfAny(paths.bundlesDir, ".amcbundle") ?? "none";
  const certPath = latestFileIfAny(paths.bundlesDir, ".amccert") ?? "none";

  const markdown = [
    `# Unified Clarity Snapshot (${agentId})`,
    "",
    `Run ID: ${run.runId}`,
    `Generated: ${new Date().toISOString()}`,
    `IntegrityIndex: ${run.integrityIndex.toFixed(3)} (${run.trustLabel})`,
    "",
    "## Overall + Layers",
    `- Overall: ${(run.layerScores.reduce((sum, row) => sum + row.avgFinalLevel, 0) / Math.max(1, run.layerScores.length)).toFixed(2)}`,
    ...run.layerScores.map((layer) => `- ${layer.layerName}: ${layer.avgFinalLevel.toFixed(2)}`),
    "",
    "## Top 7 Gaps To Target",
    ...(topGaps.length > 0
      ? topGaps.map((row) => `- ${row.questionId}: ${row.current} -> ${row.target} (gap ${row.gap}) | capped: ${row.whyCapped}`)
      : ["- none"]),
    "",
    "## Evidence To Collect Next (Top 5)",
    ...run.evidenceToCollectNext.slice(0, 5).map((line) => `- ${line}`),
    "",
    "## Failure-Risk Indices",
    ...indices.indices.map((index) => `- ${index.id}: ${index.score0to100.toFixed(2)} | causes: ${index.topCauses.join("; ")}`),
    "",
    "## Assurance Summary",
    assuranceSummary,
    "",
    "## References",
    `- Dashboard: ${dashboardPath}`,
    `- Latest bundle: ${bundlePath}`,
    `- Latest cert: ${certPath}`,
    `- Report JSON: ${join(paths.runsDir, `${runId}.json`)}`,
    ""
  ].join("\n");

  const outFile = resolve(params.workspace, params.outFile);
  ensureDir(dirname(outFile));
  writeFileAtomic(outFile, markdown, 0o644);

  return {
    outFile,
    runId
  };
}
