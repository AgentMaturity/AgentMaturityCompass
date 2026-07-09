import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, extname, join } from "node:path";
import type { DiagnosticReport } from "../types.js";
import { resolveRunReport, type ResolvedRunReport } from "../diagnostic/runner.js";
import { evaluateDiagnosticEvidenceReadiness } from "../diagnostic/evidenceReadiness.js";

export type ExecutiveBriefFormat = "html" | "markdown";

export interface ExecutiveBriefOptions {
  workspace: string;
  agentId?: string;
  runId?: string;
  title?: string;
  outputPath?: string;
  format?: ExecutiveBriefFormat;
  now?: Date;
}

export interface ExecutiveBriefArtifact {
  path: string;
  format: ExecutiveBriefFormat;
  content: string;
  resolved: ResolvedRunReport;
}

interface ExecutiveBriefModel {
  title: string;
  agentId: string;
  runId: string;
  generatedAt: string;
  resolvedBy: string;
  artifactStatus: string;
  evidenceStatus: string;
  claimEligible: boolean;
  claimBoundary: string;
  maturityLevel: string;
  maturityScore: number;
  integrityPct: number;
  riskLabel: string;
  boardDecision: string;
  topGaps: Array<{ name: string; score: number; action: string }>;
  nextActions: string[];
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function averageLayerScore(report: DiagnosticReport): number {
  if (report.layerScores.length > 0) {
    return report.layerScores.reduce((sum, row) => sum + row.avgFinalLevel, 0) / report.layerScores.length;
  }
  return Math.max(0, Math.min(5, report.integrityIndex * 5));
}

function maturityLevel(score: number): string {
  return `L${Math.max(0, Math.min(5, Math.floor(score)))}`;
}

function riskLabel(score: number): string {
  if (score >= 4) return "Low";
  if (score >= 3) return "Moderate";
  if (score >= 2) return "Elevated";
  return "High";
}

function claimBoundary(report: DiagnosticReport): string {
  return evaluateDiagnosticEvidenceReadiness(report).claimBoundary;
}

function boardDecision(score: number, risk: string, claimEligible: boolean): string {
  if (!claimEligible) {
    return "Do not approve expansion from this run. Treat the score as a local baseline until evidence readiness is READY and the underlying bundle verifies.";
  }
  if (score >= 4) {
    return "Maintain board visibility, require regression monitoring, and allow controlled expansion only when evidence remains current.";
  }
  if (score >= 3) {
    return "Approve limited production use with explicit owners, remediation dates, and drift monitoring before broader rollout.";
  }
  if (score >= 2) {
    return "Hold expansion until the top maturity gaps have owner-backed remediation plans and fresh evidence.";
  }
  return `Do not expand autonomous use while board risk is ${risk.toLowerCase()}; require a remediation plan before production approval.`;
}

function actionForLayer(score: number): string {
  if (score >= 4) return "Maintain controls and monitor for regression.";
  if (score >= 3) return "Close remaining evidence gaps and set an owner for the next maturity step.";
  if (score >= 2) return "Assign an executive owner and require dated remediation evidence.";
  return "Stop expansion until minimum controls and evidence are in place.";
}

function buildModel(resolved: ResolvedRunReport, opts: ExecutiveBriefOptions): ExecutiveBriefModel {
  const report = resolved.report;
  const score = averageLayerScore(report);
  const risk = riskLabel(score);
  const readiness = evaluateDiagnosticEvidenceReadiness(report);
  const generatedAt = (opts.now ?? new Date()).toISOString();
  const layerRows = report.layerScores
    .slice()
    .sort((a, b) => a.avgFinalLevel - b.avgFinalLevel)
    .slice(0, 5)
    .map((row) => ({
      name: row.layerName,
      score: row.avgFinalLevel,
      action: actionForLayer(row.avgFinalLevel)
    }));
  const topGaps = layerRows.length > 0
    ? layerRows
    : [{ name: "Evidence coverage", score, action: actionForLayer(score) }];

  return {
    title: opts.title ?? "Board AI Risk Brief",
    agentId: report.agentId ?? opts.agentId ?? "default",
    runId: resolved.resolvedRunId,
    generatedAt,
    resolvedBy: resolved.resolvedBy,
    artifactStatus: report.status,
    evidenceStatus: readiness.status,
    claimEligible: readiness.claimEligible,
    claimBoundary: claimBoundary(report),
    maturityLevel: maturityLevel(score),
    maturityScore: Number(score.toFixed(2)),
    integrityPct: Number((report.integrityIndex * 100).toFixed(1)),
    riskLabel: risk,
    boardDecision: boardDecision(score, risk, readiness.claimEligible),
    topGaps,
    nextActions: [
      "Ask the accountable owner to accept or reject each remediation action in writing.",
      "Require a fresh AMC run after remediation and before expanding scope.",
      "Share the signed certificate or report bundle only when artifact status is VALID and evidence readiness is READY."
    ]
  };
}

export function inferExecutiveBriefFormat(outputPath: string | undefined, format: string | undefined): ExecutiveBriefFormat {
  if (format !== undefined) {
    const normalized = format.trim().toLowerCase();
    if (normalized === "html" || normalized === "markdown") return normalized;
    if (normalized === "md") return "markdown";
    throw new Error("--format must be html or markdown.");
  }
  const ext = outputPath ? extname(outputPath).toLowerCase() : "";
  return ext === ".md" || ext === ".markdown" ? "markdown" : "html";
}

export function defaultExecutiveBriefPath(workspace: string, runId: string, format: ExecutiveBriefFormat): string {
  const ext = format === "markdown" ? "md" : "html";
  return join(workspace, ".amc", "reports", `executive-brief-${runId}.${ext}`);
}

export function renderExecutiveBriefMarkdown(resolved: ResolvedRunReport, opts: ExecutiveBriefOptions = { workspace: process.cwd() }): string {
  const model = buildModel(resolved, opts);
  const gapRows = model.topGaps
    .map((gap) => `| ${gap.name} | L${gap.score.toFixed(1)} | ${gap.action} |`)
    .join("\n");
  const nextActions = model.nextActions.map((item) => `- ${item}`).join("\n");

  return [
    `# ${model.title}`,
    "",
    `Agent: ${model.agentId}`,
    `Run: ${model.runId} (${model.resolvedBy})`,
    `Generated: ${model.generatedAt}`,
    "",
    "## Board Snapshot",
    "",
    `- Maturity: ${model.maturityLevel} (${model.maturityScore.toFixed(2)}/5)`,
    `- Integrity index: ${model.integrityPct.toFixed(1)}%`,
    `- Board risk: ${model.riskLabel}`,
    `- Artifact status: ${model.artifactStatus}`,
    `- Evidence readiness: ${model.evidenceStatus}`,
    `- Claim eligible: ${model.claimEligible ? "YES" : "NO"}`,
    "",
    "## Recommended Board Decision",
    "",
    model.boardDecision,
    "",
    "## Top Maturity Gaps",
    "",
    "| Area | Current | Board action |",
    "|------|---------|--------------|",
    gapRows,
    "",
    "## Claim Boundary",
    "",
    model.claimBoundary,
    "",
    "## Next Actions",
    "",
    nextActions,
    ""
  ].join("\n");
}

export function renderExecutiveBriefHtml(resolved: ResolvedRunReport, opts: ExecutiveBriefOptions = { workspace: process.cwd() }): string {
  const model = buildModel(resolved, opts);
  const riskColor = model.riskLabel === "Low" ? "#4AEF79" : model.riskLabel === "Moderate" ? "#f59e0b" : "#ff3355";
  const gapRows = model.topGaps
    .map((gap) => `<tr><td>${escapeHtml(gap.name)}</td><td>L${gap.score.toFixed(1)}</td><td>${escapeHtml(gap.action)}</td></tr>`)
    .join("\n");
  const actions = model.nextActions.map((item) => `<li>${escapeHtml(item)}</li>`).join("\n");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(model.title)} - ${escapeHtml(model.agentId)}</title>
<style>
  :root{--bg:#0a0a0a;--surface:#111111;--surface2:#1a1a1a;--text:#ffffff;--muted:#a0a0a0;--accent:#4AEF79;--border:rgba(255,255,255,.10);color:var(--text);background:var(--bg);font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
  *{box-sizing:border-box}
  body{margin:0;padding:32px;background:var(--bg);color:var(--text)}
  main{max-width:900px;margin:0 auto}
  .brandline{display:flex;justify-content:space-between;gap:16px;margin-bottom:28px;padding:10px 0;border-top:1px solid rgba(74,239,121,.28);border-bottom:1px solid var(--border);font:700 12px "Space Mono","SFMono-Regular",Consolas,monospace;color:var(--muted)}
  .wordmark{color:var(--text)}.cursor{color:var(--accent)}
  h1{font-size:30px;line-height:1.15;margin:0 0 8px}
  h2{font:700 13px "Space Mono","SFMono-Regular",Consolas,monospace;letter-spacing:0;text-transform:uppercase;margin:28px 0 10px;color:var(--accent)}
  p,li,td{font-size:14px;line-height:1.45}
  .meta{color:var(--muted);font-size:13px;margin-bottom:22px}
  .snapshot{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:18px 0}
  .metric{border:1px solid var(--border);background:var(--surface);padding:12px;border-radius:6px;min-width:0}
  .label{font:700 10px "Space Mono","SFMono-Regular",Consolas,monospace;text-transform:uppercase;color:var(--muted);letter-spacing:0}
  .value{font-size:22px;font-weight:700;margin-top:4px}
  .risk{color:${riskColor}}
  .decision{border-left:3px solid ${riskColor};background:var(--surface);padding:14px 16px;margin:12px 0}
  table{width:100%;border-collapse:collapse;margin-top:8px}
  th,td{border:1px solid var(--border);padding:9px 10px;text-align:left;vertical-align:top}
  th{background:var(--surface2);font:700 10px "Space Mono","SFMono-Regular",Consolas,monospace;text-transform:uppercase;color:var(--accent)}
  .boundary{background:var(--surface);border:1px solid #f59e0b;border-radius:6px;padding:12px 14px}
  .footer{margin-top:26px;padding-top:12px;border-top:1px solid var(--border);color:var(--muted);font-size:12px}
  @page{size:letter;margin:0.55in}
  @media(max-width:720px){body{padding:20px}.snapshot{grid-template-columns:repeat(2,minmax(0,1fr))}.brandline{align-items:flex-start;flex-direction:column}}
  @media print{:root{--bg:#fff;--surface:#f7f7f7;--surface2:#efefef;--text:#111;--muted:#555;--border:#d1d5db}body{padding:0}.snapshot{break-inside:avoid}.metric{break-inside:avoid}a{color:inherit}.brandline{border-top-color:#111}}
</style>
</head>
<body>
<main>
  <div class="brandline"><span class="wordmark">amc<span class="cursor">_</span> / executive</span><span>Evidence over claims.</span></div>
  <h1>${escapeHtml(model.title)}</h1>
  <div class="meta">Agent ${escapeHtml(model.agentId)} | Run ${escapeHtml(model.runId)} (${escapeHtml(model.resolvedBy)}) | Generated ${escapeHtml(model.generatedAt)}</div>
  <section class="snapshot" aria-label="Board risk snapshot">
    <div class="metric"><div class="label">Maturity</div><div class="value">${escapeHtml(model.maturityLevel)}</div><div>${model.maturityScore.toFixed(2)}/5</div></div>
    <div class="metric"><div class="label">Integrity</div><div class="value">${model.integrityPct.toFixed(1)}%</div><div>evidence-weighted</div></div>
    <div class="metric"><div class="label">Board Risk</div><div class="value risk">${escapeHtml(model.riskLabel)}</div><div>current posture</div></div>
    <div class="metric"><div class="label">Evidence</div><div class="value">${escapeHtml(model.evidenceStatus)}</div><div>artifact ${escapeHtml(model.artifactStatus)} | claims ${model.claimEligible ? "eligible" : "blocked"}</div></div>
  </section>
  <h2>Recommended Board Decision</h2>
  <p class="decision">${escapeHtml(model.boardDecision)}</p>
  <h2>Top Maturity Gaps</h2>
  <table>
    <thead><tr><th>Area</th><th>Current</th><th>Board action</th></tr></thead>
    <tbody>${gapRows}</tbody>
  </table>
  <h2>Claim Boundary</h2>
  <p class="boundary">${escapeHtml(model.claimBoundary)}</p>
  <h2>Next Actions</h2>
  <ol>${actions}</ol>
  <div class="footer">Print-ready HTML: open this file in a browser and use Print to PDF for a board packet.</div>
</main>
</body>
</html>`;
}

export function writeExecutiveBriefArtifact(opts: ExecutiveBriefOptions): ExecutiveBriefArtifact {
  const format = inferExecutiveBriefFormat(opts.outputPath, opts.format);
  const resolved = resolveRunReport(opts.workspace, opts.runId ?? "latest", opts.agentId);
  const outputPath = opts.outputPath ?? defaultExecutiveBriefPath(opts.workspace, resolved.resolvedRunId, format);
  const content = format === "html"
    ? renderExecutiveBriefHtml(resolved, opts)
    : renderExecutiveBriefMarkdown(resolved, opts);

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, content, "utf8");
  return {
    path: outputPath,
    format,
    content,
    resolved
  };
}
