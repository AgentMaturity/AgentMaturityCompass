import { readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import chalk from "chalk";
import { pathExists, readUtf8, writeFileAtomic } from "../utils/fs.js";
import { buildGrcEvidenceManifest, grcManifestToSarif, type GrcFramework } from "./grcEvidenceExport.js";

const ALLOWED: GrcFramework[] = ["SOC2", "NIST_AI_RMF", "ISO_42001", "EU_AI_ACT"];

export function runGrcExportCli(params: {
  workspace: string;
  agentId: string;
  framework: string;
  out: string;
  sarif?: string;
  json?: boolean;
}): void {
  const fw = params.framework.toUpperCase() as GrcFramework;
  if (!ALLOWED.includes(fw)) {
    throw new Error(`--framework must be one of: ${ALLOWED.join(", ")}`);
  }
  const runsDir = join(params.workspace, ".amc", "runs");
  if (!pathExists(runsDir)) {
    throw new Error("No runs found. Run `amc` first.");
  }
  const files = readdirSync(runsDir).filter((f) => f.endsWith(".json")).sort();
  if (files.length === 0) {
    throw new Error("No run reports found. Run `amc` first.");
  }
  const report = JSON.parse(readUtf8(join(runsDir, files[files.length - 1]!))) as Record<string, unknown>;
  const layerScores = Array.isArray(report.layerScores)
    ? (report.layerScores as Array<{ layerName: string; avgFinalLevel: number }>)
    : [];
  const overallLevel = layerScores.length > 0
    ? layerScores.reduce((a, l) => a + (l.avgFinalLevel ?? 0), 0) / layerScores.length
    : 0;
  const readinessObj = report.evidenceReadiness as { status?: string } | undefined;
  const manifest = buildGrcEvidenceManifest(fw, {
    agentId: params.agentId,
    runId: String(report.runId ?? "unknown"),
    ts: Number(report.ts ?? 0),
    status: (report.status as "VALID" | "INVALID" | "UNSIGNED") ?? "UNSIGNED",
    verificationPassed: Boolean(report.verificationPassed),
    integrityIndex: Number(report.integrityIndex ?? 0),
    evidenceCoverage: Number(report.evidenceCoverage ?? 0),
    overallLevel,
    layers: layerScores.map((l) => ({ name: l.layerName, level: l.avgFinalLevel })),
    evidenceReadiness: readinessObj?.status ?? "UNVERIFIED"
  });
  writeFileAtomic(resolve(params.workspace, params.out), JSON.stringify(manifest, null, 2), 0o644);
  if (params.sarif) {
    writeFileAtomic(resolve(params.workspace, params.sarif), JSON.stringify(grcManifestToSarif(manifest), null, 2), 0o644);
  }
  if (params.json) {
    console.log(JSON.stringify(manifest, null, 2));
    return;
  }
  console.log(chalk.green(`GRC evidence manifest written: ${params.out}`));
  console.log(chalk.gray("Framework:"), manifest.framework, chalk.gray("| Claim-eligible:"),
    manifest.claimEligible ? chalk.green("yes") : chalk.yellow("no (evidence not READY)"));
  for (const c of manifest.controls) {
    const color = c.status === "PASS" ? chalk.green : c.status === "FAIL" ? chalk.red : chalk.yellow;
    console.log(`  ${c.controlId} ${color(c.status)} — ${c.title} (${c.amcSurface})`);
  }
  if (params.sarif) console.log(chalk.gray("SARIF:"), params.sarif);
}
