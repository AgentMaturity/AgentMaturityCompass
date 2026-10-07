/**
 * Report renderers for `amc report`, moved out of src/cli.ts (P0-22). Each stamps the run's claim label and
 * the claim-kind legend.
 */
import { formatClaimLabel, renderClaimLabel, renderClaimLegend } from "../claims/eligibility/render.js";
import type { ClaimEnvelope } from "../claims/eligibility/types.js";
import type { explainDiagnosticReportStatus } from "../diagnostic/runner.js";
import type { DiagnosticReport } from "../types.js";

function escapeReportHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export interface DiagnosticReportHtmlInput {
  report: DiagnosticReport;
  runId: string;
  alias?: string;
  statusExplanation: ReturnType<typeof explainDiagnosticReportStatus>;
  claim: ClaimEnvelope;
}

/** `amc report --html` and `--share`: a styled, printable page. */
export function renderDiagnosticReportHtml(input: DiagnosticReportHtmlInput): string {
  const { report, statusExplanation } = input;
  const avgLayerScore = report.layerScores.length > 0
    ? report.layerScores.reduce((s: number, l: any) => s + l.avgFinalLevel, 0) / report.layerScores.length
    : 0;
  const levelNum = Math.min(5, Math.floor(avgLayerScore));
  const level = `L${levelNum}`;
  const riskLabel = levelNum >= 4 ? "Low" : levelNum >= 3 ? "Moderate" : levelNum >= 2 ? "Elevated" : "High";
  const riskColor = levelNum >= 4 ? "#4AEF79" : levelNum >= 3 ? "#f59e0b" : "#ff3355";
  const date = new Date(report.ts).toISOString().split("T")[0];
  const layerRows = report.layerScores.map((l: any) => {
    const lLevel = Math.min(5, Math.floor(l.avgFinalLevel));
    const lColor = lLevel >= 4 ? "#4AEF79" : lLevel >= 3 ? "#f59e0b" : "#ff3355";
    return `<tr><td>${escapeReportHtml(String(l.layerName ?? ""))}</td><td style="color:${lColor};font-weight:bold">L${lLevel}</td><td>${Number(l.avgFinalLevel).toFixed(1)}</td><td>${Number(l.questionCount ?? 0)} questions</td></tr>`;
  }).join("\n");
  const gapRows = ((report as any).gaps ?? []).slice(0, 10).map((g: any) =>
    `<tr><td>${escapeReportHtml(String(g.questionId ?? ""))}</td><td>${Number(g.currentLevel ?? 0)}→${Number(g.targetLevel ?? 0)}</td><td>${escapeReportHtml(String(g.narrative ?? ""))}</td></tr>`
  ).join("\n");
  const aliasHtml = input.alias ? ` &nbsp;|&nbsp; <strong>Alias:</strong> <code>${escapeReportHtml(input.alias)}</code>` : "";
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AMC Report — ${escapeReportHtml(String(report.agentId ?? "Agent"))}</title>
<style>
  :root{--bg:#0a0a0a;--surface:#111111;--surface2:#1a1a1a;--text:#fff;--muted:#a0a0a0;--accent:#4AEF79;--border:rgba(255,255,255,.10)}
  *{box-sizing:border-box}body{font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:860px;margin:40px auto;padding:0 20px;color:var(--text);background:var(--bg);line-height:1.6}
  .brandline{display:flex;justify-content:space-between;gap:16px;margin-bottom:28px;padding:10px 0;border-top:1px solid rgba(74,239,121,.28);border-bottom:1px solid var(--border);font:700 12px 'Space Mono','SFMono-Regular',Consolas,monospace;color:var(--muted)}
  .wordmark{color:var(--text)}.cursor{color:var(--accent)}
  h1{color:var(--text);border-bottom:2px solid var(--accent);padding-bottom:12px;letter-spacing:0}
  h2{color:var(--accent);margin-top:32px;font:700 14px 'Space Mono','SFMono-Regular',Consolas,monospace;text-transform:uppercase;letter-spacing:0}
  code{font-family:'Space Mono','SFMono-Regular',Consolas,monospace;color:var(--accent)}
  .score-box{background:var(--surface);border:2px solid ${riskColor};border-radius:8px;padding:24px;text-align:center;margin:24px 0}
  .score-box .level{font-size:48px;font-weight:bold;color:${riskColor}}
  .score-box .label{font-size:14px;color:var(--muted);margin-top:4px}
  table{width:100%;border-collapse:collapse;margin:16px 0}
  th,td{padding:8px 12px;border:1px solid var(--border);text-align:left}
  th{background:var(--surface2);font:700 10px 'Space Mono','SFMono-Regular',Consolas,monospace;color:var(--accent);text-transform:uppercase}
  .risk{display:inline-block;padding:4px 12px;border-radius:4px;font-weight:bold;color:#0a0a0a;background:${riskColor}}
  .status-note{background:var(--surface);border:1px solid var(--border);border-left:3px solid var(--accent);border-radius:6px;padding:14px 16px;margin:18px 0}
  .footer{margin-top:40px;padding-top:16px;border-top:1px solid var(--border);color:var(--muted);font-size:12px}
  @media(max-width:640px){body{margin:20px auto}.brandline{flex-direction:column;gap:4px}th,td{padding:7px;font-size:12px}}
  @media print{:root{--bg:#fff;--surface:#f7f7f7;--surface2:#efefef;--text:#111;--muted:#555;--border:#d1d5db}body{margin:0;padding:20px}.score-box{break-inside:avoid}.brandline{border-top-color:#111}}
</style></head><body>
<div class="brandline"><span class="wordmark">amc<span class="cursor">_</span> / report</span><span>Evidence over claims.</span></div>
<h1>Agent Maturity Compass Report</h1>
<p><strong>Agent:</strong> ${escapeReportHtml(String(report.agentId ?? "default"))} &nbsp;|&nbsp; <strong>Date:</strong> ${date} &nbsp;|&nbsp; <strong>Run:</strong> <code>${escapeReportHtml(input.runId)}</code>${aliasHtml}</p>
<div class="status-note">
  ${formatClaimLabel(renderClaimLabel(input.claim), "studio")}<br>
  <strong>Artifact Status:</strong> ${escapeReportHtml(report.status)} — ${escapeReportHtml(statusExplanation.artifactLabel)}<br>
  <strong>Evidence Readiness:</strong> ${escapeReportHtml(statusExplanation.evidenceStatus)} — ${escapeReportHtml(statusExplanation.readinessLabel)}<br>
  <strong>Claim Eligible:</strong> ${statusExplanation.strongClaimsAllowed ? "YES" : "NO"}<br>
  <strong>Claim boundary:</strong> ${escapeReportHtml(statusExplanation.claimBoundary)}<br>
  <strong>Next evidence step:</strong> ${escapeReportHtml(statusExplanation.nextStep)}<br>
  <strong>Share boundary:</strong> This static page was generated locally. Publishing, custody, access control, and distribution remain the workspace owner's responsibility.
</div>
<div class="score-box">
  <div class="level">${level}</div>
  <div class="label">Maturity Level (${avgLayerScore.toFixed(1)}/5 weighted)</div>
  <div style="margin-top:8px"><span class="risk">${riskLabel} Risk</span></div>
</div>
<h2>Dimension Scores</h2>
<table><thead><tr><th>Dimension</th><th>Level</th><th>Score</th><th>Coverage</th></tr></thead><tbody>
${layerRows}
</tbody></table>
${gapRows ? `<h2>Top Improvement Gaps</h2>
<table><thead><tr><th>Question</th><th>Gap</th><th>Recommendation</th></tr></thead><tbody>
${gapRows}
</tbody></table>` : ""}
<h2>What This Means</h2>
<p>${!statusExplanation.strongClaimsAllowed
  ? "This maturity result is a local baseline, not a deployment or compliance claim. Collect and verify sufficient evidence before relying on it externally."
  : levelNum >= 3
    ? "The maturity evidence passes AMC's claim-readiness gate for this scope. Review applicable controls and operating risk before any production decision."
    : levelNum >= 2
      ? "The evidence is claim-ready, but material maturity gaps remain. Address them before production deployment."
      : "The evidence is claim-ready and identifies significant governance gaps. Do not deploy without remediation."}</p>
<h2>Next Steps</h2>
<ol>
  <li>Run <code>amc guide --go</code> to generate framework-specific guardrails</li>
  <li>Run <code>amc assurance run --all</code> to test against adversarial scenarios</li>
  <li>Run <code>amc quickscore --eu-ai-act</code> for EU AI Act classification</li>
</ol>
<h2>How to read claim kinds</h2>
${renderClaimLegend("html")}
<div class="footer">
  Generated by <a href="https://github.com/AgentMaturity/AgentMaturityCompass">Agent Maturity Compass</a> — The Credit Score for AI Agents<br>
  Report generated: ${new Date().toISOString()} | Print this page (Ctrl+P) to save as PDF
</div>
</body></html>`;
}
