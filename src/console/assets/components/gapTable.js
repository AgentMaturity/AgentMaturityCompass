import { plainCodeHtml } from "../plainError.js";

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function renderGapTable(container, gap) {
  if (!container) {
    return;
  }
  const rows = Array.isArray(gap?.perQuestion) ? gap.perQuestion : [];
  container.innerHTML = `
    <div class="scroll">
      <table>
        <thead>
          <tr>
            <th>Question</th>
            <th>Measured</th>
            <th>Target</th>
            <th>Gap</th>
            <th>Status</th>
            <th>Coverage</th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .map(
              (row) => `
            <tr>
              <td>${esc(row.qId)}</td>
              <td>${Number(row.measured || 0).toFixed(2)}</td>
              <td>${Number(row.desired || 0).toFixed(2)}</td>
              <td>${Number(row.gap || 0).toFixed(2)}</td>
              <td>${plainCodeHtml(row.status || "OK", { small: true })}</td>
              <td>${(Number(row.evidenceCoverage || 0) * 100).toFixed(1)}%</td>
            </tr>`
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

