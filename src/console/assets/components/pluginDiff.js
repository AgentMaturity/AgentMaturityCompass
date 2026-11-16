import { recordRows } from "../pageKit.js";
function esc(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function renderPluginDiff(container, diff) {
  if (!container) {
    return;
  }
  if (!diff) {
    container.innerHTML = "<p class=\"muted\">No diff available.</p>";
    return;
  }
  container.innerHTML = `
    <div class="grid">
      <div class="card"><h4>Added</h4>${recordRows(diff.added || [])}</div>
      <div class="card"><h4>Changed</h4>${recordRows(diff.changed || [])}</div>
      <div class="card"><h4>Removed</h4>${recordRows(diff.removed || [])}</div>
    </div>
  `;
}
