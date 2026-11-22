import { plainCodeHtml } from "../plainError.js";

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatScore(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "UNKNOWN";
  }
  return Number(value).toFixed(2);
}

export function renderValueTile(params) {
  const label = escapeHtml(params.label ?? "Value");
  const status = plainCodeHtml(params.status ?? "OK");
  const score = formatScore(params.value);
  const tone = score === "UNKNOWN" ? "status-warn" : "status-ok";
  return `<div class="card">
    <div class="muted">${label}</div>
    <div class="tile-value">${escapeHtml(score)}</div>
    <div class="${tone}">${status}</div>
  </div>`;
}
