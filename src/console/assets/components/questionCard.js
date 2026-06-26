import { renderEvidenceChip } from "./evidenceChip.js";

function esc(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function renderQuestionCard(params) {
  const unknown = params.score?.unknown === true;
  const reasons = unknown ? (params.score?.reasons ?? []) : [];
  const refs = params.score?.evidenceRefs ?? [];
  const controls = params.score?.confidenceControls || {};
  const lowConfidence = controls.uncertaintyLevel === "high" || controls.presentationStatus === "needs_review";
  const highRisk = controls.decisivenessRisk >= 0.65 || controls.contradictionRisk >= 0.5;
  const chips = refs.map((row) => renderEvidenceChip(row)).join(" ");
  const examples = (params.question.tailoredEvidenceExamples ?? []).map((row) => `<li>${esc(row)}</li>`).join("");
  const drilldownHref = params.runId
    ? `./evidenceDrilldown?agent=${encodeURIComponent(params.agentId || "default")}&run=${encodeURIComponent(params.runId)}&question=${encodeURIComponent(params.question.qId)}`
    : null;
  return `
    <section class="card question-card" data-low-confidence="${lowConfidence ? "true" : "false"}" data-high-risk="${highRisk ? "true" : "false"}">
      <h3>${esc(params.question.qId)} — ${esc(params.question.title)}</h3>
      <p>${esc(params.question.howThisApplies)}</p>
      <div class="row wrap">
        <span><strong>Measured:</strong> ${typeof params.score?.measuredScore === "number" ? params.score.measuredScore : "n/a"}</span>
        <span><strong>Target:</strong> ${params.question.ownerTarget === null ? "(not set)" : params.question.ownerTarget}</span>
        <span><strong>Status:</strong> ${unknown ? "UNKNOWN" : "OK"}</span>
        <span><strong>Coverage:</strong> ${typeof params.score?.evidenceCoverage === "number" ? params.score.evidenceCoverage.toFixed(2) : "n/a"}</span>
        <span><strong>Uncertainty:</strong> ${esc(controls.uncertaintyLevel || "n/a")}</span>
        <span><strong>Auto-fix:</strong> ${controls.autoFixAllowed ? "allowed" : "review"}</span>
      </div>
      ${chips.length > 0 ? `<div class="row wrap">${chips}</div>` : ""}
      ${reasons.length > 0 ? `<p class="status-bad"><strong>UNKNOWN reasons:</strong> ${esc(reasons.join(" | "))}</p>` : ""}
      ${controls.downgradeReason ? `<p class="status-bad"><strong>Confidence gate:</strong> ${esc(controls.downgradeReason)}</p>` : ""}
      <div class="row wrap">
        ${drilldownHref ? `<a class="secondary" href="${drilldownHref}">Open evidence drilldown</a>` : `<span class="muted">Evidence drilldown appears after a run ID is available.</span>`}
      </div>
      <details>
        <summary>Evidence examples for this agent</summary>
        <ul>${examples}</ul>
      </details>
    </section>
  `;
}
