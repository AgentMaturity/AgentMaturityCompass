import { plainCodeHtml } from "../plainError.js";

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function renderActionCard(action) {
  const evidence = Array.isArray(action?.evidenceToVerify) ? action.evidenceToVerify : [];
  return `
    <article class="card">
      <div class="row spaced">
        <strong>${plainCodeHtml(action?.kind || "ACTION", { small: true })}</strong>
        <span class="pill">${action?.requiresApproval ? "Approval Required" : "Direct"}</span>
      </div>
      <p>${esc(action?.effect || "")}</p>
      ${evidence.length > 0 ? `<ul class="list">${evidence.map((row) => `<li>${esc(row)}</li>`).join("")}</ul>` : ""}
    </article>
  `;
}

