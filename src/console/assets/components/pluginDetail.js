import { recordRows } from "../pageKit.js";

function esc(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function renderPluginDetail(container, detail) {
  if (!container) {
    return;
  }
  if (!detail) {
    container.innerHTML = "<p class=\"muted\">Select a plugin action to view details.</p>";
    return;
  }
  container.innerHTML = recordRows(detail);
}
