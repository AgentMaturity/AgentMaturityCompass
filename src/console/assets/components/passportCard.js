import { workspacePath } from "../pageKit.js";

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function iso(ts) {
  return Number.isFinite(Number(ts)) ? new Date(Number(ts)).toISOString() : "-";
}

export function renderPassportCard(row) {
  const status = String(row?.status ?? "INFORMATIONAL").toUpperCase();
  const css = status === "VERIFIED" ? "status-ok" : status === "INFORMATIONAL" ? "status-warn" : "status-bad";
  return `
    <div class="card">
      <div class="row spaced">
        <strong>${esc(row?.passportId ?? "unknown")}</strong>
        <span class="${css}">${esc(status)}</span>
      </div>
      <div class="muted">For: ${esc(String(row?.scopeType ?? "-").toLowerCase())} · made ${esc(iso(row?.generatedTs))}</div>
      <div><code>${esc(workspacePath(String(row?.file ?? "-")))}</code></div>
    </div>
  `;
}

