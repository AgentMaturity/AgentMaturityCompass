/**
 * `amc eval run` — One-shot evaluation command.
 *
 * Reads amcconfig.yaml, runs the full diagnostic suite, and outputs results
 * in JSON, HTML, or terminal format.
 *
 * Flags:
 *   --fail-on-error   Exit with code 1 if any question scores below threshold
 *   --threshold <n>   Minimum acceptable IntegrityIndex (0–1, default 0)
 *   --output <path>   Write report to file (format inferred from extension, or use --format)
 *   --format <fmt>    Output format: json | html | terminal (default: terminal)
 *   --window <window> Evidence window (default: 30d)
 *   --agent <id>      Agent ID (defaults to active agent)
 */

import { resolve, extname } from "node:path";
import chalk from "chalk";
import { loadAMCConfig } from "../workspace.js";
import { runDiagnostic } from "../diagnostic/runner.js";
import { formatClaimLabel, renderClaimLabel, renderClaimLegend, type ClaimEnvelope } from "../claims/eligibility/index.js";
import { printLabelledReport, runClaimEnvelope, withClaimFields } from "../cli/claimOutput.js";
import type { DiagnosticReport } from "../types.js";
import { writeFileAtomic } from "../utils/fs.js";
import { emitEvalRunTelemetry } from "../observability/evalTracing.js";
import { getSharedObservabilityExporter } from "../observability/otelExporter.js";

export type EvalOutputFormat = "json" | "html" | "terminal";

export interface EvalRunOptions {
  workspace: string;
  window: string;
  agentId?: string;
  format: EvalOutputFormat;
  output?: string;
  failOnError: boolean;
  threshold: number;
}

/**
 * Infer output format from file extension when --format is not explicitly set.
 */
export function inferFormat(outputPath: string | undefined, explicitFormat?: string): EvalOutputFormat {
  if (explicitFormat) {
    return explicitFormat as EvalOutputFormat;
  }
  if (!outputPath) {
    return "terminal";
  }
  const ext = extname(outputPath).toLowerCase();
  if (ext === ".json") return "json";
  if (ext === ".html" || ext === ".htm") return "html";
  return "terminal";
}

/**
 * Render a DiagnosticReport as an HTML document.
 */
function renderHtml(report: DiagnosticReport, claim: ClaimEnvelope): string {
  const overallScore = report.integrityIndex;
  const scoreColor = overallScore >= 0.7 ? "#22c55e" : overallScore >= 0.4 ? "#eab308" : "#ef4444";

  const layerRows = report.layerScores
    .map(
      (l) =>
        `<tr><td>${esc(l.layerName)}</td><td>${l.avgFinalLevel.toFixed(2)}</td><td>${l.confidenceWeightedFinalLevel.toFixed(2)}</td></tr>`
    )
    .join("\n");

  const questionRows = report.questionScores
    .map(
      (q) =>
        `<tr>
          <td>${esc(q.questionId)}</td>
          <td>${q.claimedLevel}</td>
          <td>${q.supportedMaxLevel}</td>
          <td>${q.finalLevel}</td>
          <td>${q.confidence.toFixed(2)}</td>
          <td>${q.flags.length ? esc(q.flags.join(", ")) : "—"}</td>
        </tr>`
    )
    .join("\n");

  const inflationRows =
    report.inflationAttempts.length > 0
      ? report.inflationAttempts
          .map((r) => `<li>${esc(r.questionId)}: claimed ${r.claimed}, supported ${r.supported}</li>`)
          .join("\n")
      : "<li>None</li>";

  const upgradeList = report.prioritizedUpgradeActions.length
    ? report.prioritizedUpgradeActions.map((a) => `<li>${esc(a)}</li>`).join("\n")
    : "<li>None</li>";

  const evidenceList = report.evidenceToCollectNext.length
    ? report.evidenceToCollectNext.map((e) => `<li>${esc(e)}</li>`).join("\n")
    : "<li>None</li>";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>AMC Eval Report — ${esc(report.runId)}</title>
<style>
  :root { --bg: #0f172a; --surface: #1e293b; --border: #334155; --text: #e2e8f0; --muted: #94a3b8; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace; background: var(--bg); color: var(--text); padding: 2rem; line-height: 1.6; }
  h1 { font-size: 1.5rem; margin-bottom: .5rem; }
  h2 { font-size: 1.1rem; margin-top: 2rem; margin-bottom: .5rem; border-bottom: 1px solid var(--border); padding-bottom: .25rem; }
  .meta { color: var(--muted); font-size: .85rem; margin-bottom: 1.5rem; }
  .score-badge { display: inline-block; font-size: 2rem; font-weight: bold; padding: .25rem .75rem; border-radius: .5rem; color: #fff; background: ${scoreColor}; }
  table { width: 100%; border-collapse: collapse; margin-top: .5rem; font-size: .85rem; }
  th, td { padding: .35rem .5rem; border: 1px solid var(--border); text-align: left; }
  th { background: var(--surface); }
  tr:nth-child(even) { background: rgba(255,255,255,.02); }
  ul { padding-left: 1.25rem; }
  li { margin: .15rem 0; }
  .status-valid { color: #22c55e; } .status-invalid { color: #ef4444; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-top: .5rem; }
  .card { background: var(--surface); padding: 1rem; border-radius: .5rem; border: 1px solid var(--border); }
  .card dt { color: var(--muted); font-size: .75rem; text-transform: uppercase; } .card dd { font-size: 1rem; margin-bottom: .5rem; }
</style>
</head>
<body>
<h1>🧭 AMC Eval Report</h1>
<p class="meta">Run <code>${esc(report.runId)}</code> · Agent <code>${esc(report.agentId)}</code> · ${new Date(report.ts).toISOString()}</p>
<p>${formatClaimLabel(renderClaimLabel(claim), "studio")}</p>

<div class="score-badge">${report.integrityIndex.toFixed(3)} (${esc(report.trustLabel)})</div>
<span class="${report.status === "VALID" ? "status-valid" : "status-invalid"}" style="margin-left:1rem;font-weight:bold">${report.status}</span>

<div class="grid">
  <div class="card">
    <dl>
      <dt>Verification</dt><dd>${report.verificationPassed ? "✅ PASSED" : "❌ FAILED"}</dd>
      <dt>Trust Boundary</dt><dd>${report.trustBoundaryViolated ? "⚠️ VIOLATED" : "✅ OK"}</dd>
      <dt>Evidence Coverage</dt><dd>${(report.evidenceCoverage * 100).toFixed(1)}%</dd>
      <dt>Correlation Ratio</dt><dd>${(typeof report.correlationRatio === "number" ? report.correlationRatio : 0).toFixed(3)}</dd>
    </dl>
  </div>
  <div class="card">
    <dl>
      <dt>Contradictions</dt><dd>${report.contradictionCount}</dd>
      <dt>Unsupported Claims</dt><dd>${report.unsupportedClaimCount}</dd>
      <dt>Invalid Receipts</dt><dd>${typeof report.invalidReceiptsCount === "number" ? report.invalidReceiptsCount : 0}</dd>
      <dt>Inflation Attempts</dt><dd>${report.inflationAttempts.length}</dd>
    </dl>
  </div>
</div>

<h2>Layer Scores</h2>
<table>
  <thead><tr><th>Layer</th><th>Avg Final Level</th><th>Confidence Weighted</th></tr></thead>
  <tbody>${layerRows}</tbody>
</table>

<h2>Per-Question Scores</h2>
<table>
  <thead><tr><th>Question</th><th>Claimed</th><th>Supported</th><th>Final</th><th>Confidence</th><th>Flags</th></tr></thead>
  <tbody>${questionRows}</tbody>
</table>

<h2>Inflation Attempts</h2>
<ul>${inflationRows}</ul>

<h2>Prioritized Upgrade Actions</h2>
<ul>${upgradeList}</ul>

<h2>Evidence to Collect Next</h2>
<ul>${evidenceList}</ul>

<h2>How to read claim kinds</h2>
${renderClaimLegend("html")}

<footer style="margin-top:2rem;color:var(--muted);font-size:.75rem">Generated by <code>amc eval run</code> · Agent Maturity Compass</footer>
</body>
</html>`;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * Render report to terminal with chalk.
 */
function renderTerminal(report: DiagnosticReport, claim: ClaimEnvelope): string {
  const lines: string[] = [];
  const scoreColor =
    report.integrityIndex >= 0.7 ? chalk.green : report.integrityIndex >= 0.4 ? chalk.yellow : chalk.red;

  lines.push(chalk.bold.cyan("🧭 AMC Eval Report"));
  lines.push(formatClaimLabel(renderClaimLabel(claim), "cli"));
  lines.push(chalk.gray(`   Run: ${report.runId}`));
  lines.push(chalk.gray(`   Agent: ${report.agentId}`));
  lines.push(chalk.gray(`   Time: ${new Date(report.ts).toISOString()}`));
  lines.push("");
  lines.push(`   ${chalk.bold("IntegrityIndex:")} ${scoreColor(report.integrityIndex.toFixed(3))} (${report.trustLabel})`);
  lines.push(`   ${chalk.bold("Status:")} ${report.status === "VALID" ? chalk.green("VALID") : chalk.red("INVALID")}`);
  lines.push(`   ${chalk.bold("Verification:")} ${report.verificationPassed ? chalk.green("PASSED") : chalk.red("FAILED")}`);
  lines.push(
    `   ${chalk.bold("Trust Boundary:")} ${report.trustBoundaryViolated ? chalk.red("VIOLATED") : chalk.green("OK")}`
  );
  lines.push(`   ${chalk.bold("Evidence Coverage:")} ${(report.evidenceCoverage * 100).toFixed(1)}%`);
  lines.push("");

  lines.push(chalk.bold("   Layer Scores"));
  for (const layer of report.layerScores) {
    const bar = progressBar(layer.avgFinalLevel, 5, 20);
    lines.push(`   ${chalk.white(layer.layerName.padEnd(28))} ${bar} ${layer.avgFinalLevel.toFixed(2)}/5`);
  }
  lines.push("");

  if (report.inflationAttempts.length > 0) {
    lines.push(chalk.bold.yellow("   ⚠ Inflation Attempts"));
    for (const row of report.inflationAttempts) {
      lines.push(chalk.yellow(`     ${row.questionId}: claimed ${row.claimed}, supported ${row.supported}`));
    }
    lines.push("");
  }

  if (report.prioritizedUpgradeActions.length > 0) {
    lines.push(chalk.bold("   Prioritized Upgrades"));
    for (const action of report.prioritizedUpgradeActions.slice(0, 5)) {
      lines.push(`   • ${action}`);
    }
    if (report.prioritizedUpgradeActions.length > 5) {
      lines.push(chalk.gray(`   ... and ${report.prioritizedUpgradeActions.length - 5} more`));
    }
    lines.push("");
  }

  return lines.join("\n");
}

function progressBar(value: number, max: number, width: number): string {
  const ratio = Math.min(value / max, 1);
  const filled = Math.round(ratio * width);
  const empty = width - filled;
  const color = ratio >= 0.7 ? chalk.green : ratio >= 0.4 ? chalk.yellow : chalk.red;
  return color("█".repeat(filled)) + chalk.gray("░".repeat(empty));
}

/**
 * Main entry point for `amc eval run`.
 */
export async function evalRunCli(opts: EvalRunOptions): Promise<{
  report: DiagnosticReport;
  exitCode: number;
  claim: ClaimEnvelope;
}> {
  // Step 1: Load config to validate workspace
  const config = loadAMCConfig(opts.workspace);

  // Step 2: Run the full diagnostic
  const report = await runDiagnostic(
    {
      workspace: opts.workspace,
      window: opts.window,
      agentId: opts.agentId,
    },
    undefined // We'll handle output ourselves
  );

  // Step 3: Format output, each format stamped with the run's claim label
  const claim = runClaimEnvelope(report, opts.workspace);
  let rendered: string;
  switch (opts.format) {
    case "json":
      rendered = JSON.stringify(withClaimFields(report, claim), null, 2);
      break;
    case "html":
      rendered = renderHtml(report, claim);
      break;
    case "terminal":
    default:
      rendered = renderTerminal(report, claim);
      break;
  }

  // Step 4: Write to file or stdout (the CLI prints the claim line beside a written file)
  if (opts.output) {
    const absPath = resolve(opts.output);
    writeFileAtomic(absPath, rendered, 0o644);
  } else {
    printLabelledReport(rendered);
  }

  // Step 5: Emit OpenTelemetry spans/metrics for the eval run
  try {
    emitEvalRunTelemetry(report, {
      agentId: opts.agentId ?? report.agentId,
      runId: report.runId,
      workspace: opts.workspace,
    });
    const exporter = getSharedObservabilityExporter();
    await exporter.flush();
  } catch {
    // Observability must never block eval output
  }

  // Step 6: Threshold / fail-on-error gate
  let exitCode = 0;
  if (opts.failOnError) {
    if (report.status === "INVALID") {
      exitCode = 1;
    }
    if (opts.threshold > 0 && report.integrityIndex < opts.threshold) {
      if (opts.format === "terminal") {
        console.error(
          chalk.red(
            `\n✗ IntegrityIndex ${report.integrityIndex.toFixed(3)} is below threshold ${opts.threshold}`
          )
        );
      }
      exitCode = 1;
    }
  }

  return { report, exitCode, claim };
}
