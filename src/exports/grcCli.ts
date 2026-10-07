import { resolve } from "node:path";
import chalk from "chalk";
import { formatClaimLabel, renderClaimLabel } from "../claims/eligibility/index.js";
import { sealedRunReportVerifies } from "../diagnostic/reportSeal.js";
import { resolveRunReport } from "../diagnostic/runReportResolution.js";
import type { DiagnosticReport } from "../types.js";
import { writeFileAtomic } from "../utils/fs.js";
import { buildGrcEvidenceManifest, grcManifestToSarif, type GrcFramework } from "./grcEvidenceExport.js";

const ALLOWED: GrcFramework[] = ["SOC2", "NIST_AI_RMF", "ISO_42001", "EU_AI_ACT"];

function latestRun(workspace: string, agentId: string): DiagnosticReport {
  try {
    return resolveRunReport(workspace, "latest", agentId).report;
  } catch {
    throw new Error("No run reports found. Run `amc` first.");
  }
}

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
  // resolveRunReport selects the agent's newest run by ts and skips other agents' runs; it does not
  // verify, so the seal is checked here and decides what the run may claim.
  const report = latestRun(params.workspace, params.agentId);
  const sealVerified = sealedRunReportVerifies(params.workspace, report as unknown as Record<string, unknown>);
  const manifest = buildGrcEvidenceManifest(fw, { ...report, agentId: report.agentId || params.agentId },
    { sealVerified, now: Date.now() });
  writeFileAtomic(resolve(params.workspace, params.out), JSON.stringify(manifest, null, 2), 0o644);
  if (params.sarif) {
    writeFileAtomic(resolve(params.workspace, params.sarif), JSON.stringify(grcManifestToSarif(manifest), null, 2), 0o644);
  }
  if (params.json) {
    console.log(JSON.stringify(manifest, null, 2));
    return;
  }
  console.log(`Run ${manifest.runId} (agent ${manifest.agentId}) · seal ${sealVerified ? "verified" : "not verified"}`);
  console.log(formatClaimLabel(renderClaimLabel(manifest.run.claim), "cli"));
  console.log(chalk.gray("Framework:"), manifest.framework, chalk.gray("(experimental mapping, not expert-reviewed)"));
  for (const c of manifest.controls) {
    console.log(`  ${c.controlId} not evaluated — ${c.title}`);
    console.log(chalk.gray(`    ${formatClaimLabel(renderClaimLabel(c.claim), "cli")}`));
  }
  console.log(chalk.gray("Controls stay not evaluated until evidence is bound to them (P1-11). See docs/GRC_EXPORT.md."));
  console.log(chalk.gray("Manifest:"), params.out);
  if (params.sarif) console.log(chalk.gray("SARIF:"), params.sarif);
}
