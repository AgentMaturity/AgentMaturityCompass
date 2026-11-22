import { plainCodeHtml } from "../plainError.js";

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function renderPromptStatusChip(label, state) {
  const normalized = String(state || "UNKNOWN").toUpperCase();
  const cls =
    normalized === "PASS" || normalized === "ENFORCE"
      ? "status-ok"
      : normalized === "FAIL" || normalized === "INVALID"
        ? "status-bad"
        : "muted";
  return `<span class="${cls}" style="padding:2px 8px;border-radius:999px;border:1px solid var(--line);display:inline-block">${escapeHtml(label)}: ${plainCodeHtml(normalized)}</span>`;
}

