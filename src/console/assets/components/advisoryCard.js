import { plainCodeHtml } from "../plainError.js";

function htmlEscape(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function renderAdvisoryCards(container, advisories) {
  if (!container) {
    return;
  }
  const rows = Array.isArray(advisories) ? advisories : [];
  container.innerHTML = rows.length
    ? rows
        .map(
          (row) => `<article class="card">
        <div class="row spaced">
          <strong>${plainCodeHtml(row.severity || "INFO", { small: true })} · ${plainCodeHtml(row.category || "-", { small: true })}</strong>
          <code>${htmlEscape(row.advisoryId || "-")}</code>
        </div>
        <p>${htmlEscape(row.summary || "")}</p>
        <div class="muted">Scope: ${plainCodeHtml(row.scope?.type || "UNKNOWN", { small: true })} ${htmlEscape(row.scope?.id || "-")}</div>
        <div class="muted">Evidence refs: runs=${(row.evidenceRefs?.runIds || []).length}, events=${(row.evidenceRefs?.eventHashes || []).length}</div>
      </article>`
        )
        .join("")
    : "<p class='muted'>No advisories.</p>";
}

