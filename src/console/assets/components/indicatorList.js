import { plainCodeHtml } from "../plainError.js";

function htmlEscape(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function renderIndicatorList(container, indicators) {
  if (!container) {
    return;
  }
  const rows = Array.isArray(indicators) ? indicators : [];
  container.innerHTML = rows.length
    ? `<ul class="list">${rows
        .map(
          (row) => `<li>
        <strong>${htmlEscape(row.label || row.id)}</strong>:
        ${plainCodeHtml(row.direction, { small: true })} (z=${Number(row.robustZ || 0).toFixed(2)}, mag=${Number(row.magnitude || 0).toFixed(3)})
        ${row.explanationTemplateId ? `<small class="code-note">${htmlEscape(row.explanationTemplateId)}</small>` : ""}
      </li>`
        )
        .join("")}</ul>`
    : "<p class='muted'>No leading indicators.</p>";
}

