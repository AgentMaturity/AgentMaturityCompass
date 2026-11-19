function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function clampPercent(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return 0;
  }
  return Math.max(0, Math.min(100, Math.round(n)));
}

export function renderScoreGauge(params) {
  const label = params?.label || "Risk Assurance Score";
  const score = params?.score;
  const status = String(params?.status || "UNKNOWN").toUpperCase();
  if (score === null || score === undefined || !Number.isFinite(Number(score))) {
    return `
      <div class="card status-warn">
        <div><strong>${escapeHtml(label)}</strong></div>
        <div class="muted">${escapeHtml(status)} (numeric score unavailable)</div>
      </div>
    `;
  }
  // An ERROR run's number is not a score: it is shown as the error it is, never as a gauge reading.
  if (status === "ERROR") {
    return `
      <div class="card status-bad">
        <div><strong>${escapeHtml(label)}</strong></div>
        <div>Error: this run ended with status ERROR, so its number is not a score.</div>
      </div>
    `;
  }
  const value = Number(score);
  const pct = clampPercent(value);
  // A score is drawn in ink: green or red beside a self-reported number would read as "safe" or "unsafe".
  return `
    <div class="card">
      <div class="row wrap">
        <strong>${escapeHtml(label)}</strong>
        <span>${escapeHtml(status)}</span>
      </div>
      <div class="row wrap">
        <div style="flex:1;min-width:180px;border:1px solid var(--line);border-radius:6px;overflow:hidden;height:16px;background:var(--surface-2);">
          <div style="height:100%;width:${pct}%;background:var(--ink);"></div>
        </div>
        <strong>${value.toFixed(1)}/100</strong>
      </div>
    </div>
  `;
}
