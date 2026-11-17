import { recordRows } from "../pageKit.js";

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function renderPromptViewer(params) {
  const systemText = typeof params.systemText === "string" ? params.systemText : "";
  const allowlists = params.allowlists && typeof params.allowlists === "object" ? params.allowlists : {};
  const recurrence = params.recurrence && typeof params.recurrence === "object" ? params.recurrence : {};
  const lines = [
    `<h4>Provider Prompt (${escapeHtml(params.provider || "generic")})</h4>`,
    `<pre style="max-height:240px;overflow:auto;white-space:pre-wrap">${escapeHtml(systemText)}</pre>`,
    `<h4>What the agent may use</h4>`,
    recordRows(allowlists),
    `<h4>When the pack is rebuilt</h4>`,
    recordRows(recurrence)
  ];
  return lines.join("");
}

