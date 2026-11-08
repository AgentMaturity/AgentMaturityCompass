/**
 * Self-contained HTML viewer for a session export (SH-OBS-03). The document JSON is embedded with `<`, `>` and `&`
 * escaped as JSON unicode escapes, so model or tool text can never close the script tag or inject markup. The viewer
 * script builds every node through createElement/textContent, loads nothing, and performs NO verification: the page
 * says so, and names the command that does.
 */
import { createHash } from "node:crypto";
import type { SessionExportDocument } from "./sessionExport.js";

const SESSION_EXPORT_JSON_ID = "amc-session-export";

/** JSON that is safe inside a <script> element and immune to U+2028/2029 line terminators. */
export function embedJson(value: unknown): string {
  const unsafe = new RegExp("[<>&\\u2028\\u2029]", "g");
  return JSON.stringify(value).replace(unsafe, (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`);
}

const VIEWER_SCRIPT = `(function () {
  var raw = document.getElementById(${JSON.stringify(SESSION_EXPORT_JSON_ID)}).textContent;
  var doc = JSON.parse(raw);
  var root = document.getElementById("amc-view");
  function el(tag, cls, text, parent) { var e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined && text !== null) e.textContent = String(text); (parent || root).appendChild(e); return e; }
  function meta(row) { try { return JSON.parse(row.meta_json); } catch (e) { return {}; } }
  function content(row) { if (!doc.content) return null; var c = doc.content[row.id]; return c || null; }
  var head = el("section", "head");
  el("h1", null, "AMC session " + doc.sessionId, head);
  el("p", "warn", "This page renders the embedded signed rows and performs no verification. Verify authenticity with: amc session verify-export <this file> --expect-monitor <fingerprint obtained out of band>", head);
  el("p", null, "Embedded monitor key fingerprint (display only, not a trust anchor): " + doc.monitorKeyFingerprint, head);
  el("p", null, "Rows: " + doc.rows.length + "; lifecycle: " + (doc.record && doc.record.ended_ts !== null ? "sealed" : "open or released (tail unproven)") + "; content: " + (doc.content ? "included (redacted, bounded)" : "digests only"), head);
  var usage = el("section", "usage");
  el("h2", null, "Usage", usage);
  var u = doc.usage || {};
  el("p", null, "status " + u.status + "; requests " + u.requests + " (" + u.syntheticRequests + " synthetic, " + u.reportedRequests + " reported, " + u.unreportedRequests + " unreported)", usage);
  var totals = u.totals || {};
  ["inputTokens", "outputTokens", "cacheReadTokens", "cacheWriteTokens"].forEach(function (k) { var m = totals[k] || {}; el("p", null, k + ": " + (m.observedTokens === null || m.observedTokens === undefined ? "unreported" : m.observedTokens), usage); });
  if (u.cost) el("p", null, "cost: reported " + (u.cost.reportedSubtotalUsd === null ? "unavailable" : "$" + u.cost.reportedSubtotalUsd) + "; catalog estimate " + (u.cost.estimatedSubtotalUsd === null ? "unavailable" : "$" + u.cost.estimatedSubtotalUsd) + " (" + u.cost.status + ")", usage);
  var conv = el("section", "rows");
  el("h2", null, "Rows", conv);
  doc.rows.forEach(function (row) {
    var m = meta(row);
    var box = el("article", "row " + row.event_type.replace(/[^a-z]/g, "-"), null, conv);
    var title = row.event_type;
    if (row.event_type === "tool/call") title += " " + (m.toolName || "") + " [" + (m.toolCallId || "") + "]";
    if (row.event_type === "tool/result") title += " " + (m.outcome || "") + (m.exitCode !== undefined && m.exitCode !== null ? " exit " + m.exitCode : "") + " [" + (m.toolCallId || "") + "]";
    if (row.event_type === "assistant/block") title += " " + (m.blockKind || "");
    if (row.event_type === "turn/end") title += " " + (m.reason || "");
    if (row.event_type === "request/header") title += " " + (m.providerId || "") + "/" + (m.model || "");
    if (row.event_type === "request/response" || row.event_type === "request/failure") title += " " + (m.finishReason || "") + (m.durationMs !== undefined ? " " + m.durationMs + " ms" : "");
    el("h3", null, title, box);
    el("p", "digest", "event " + row.id + " · ts " + new Date(row.ts).toISOString() + " · payload sha256 " + row.payload_sha256, box);
    var c = content(row);
    if (c && c.unavailable) el("p", "unavailable", "content unavailable: " + c.unavailable, box);
    else if (c) { var pre = el("pre", "content", c.text, box); if (c.truncated) el("p", "note", "truncated; full digest " + c.sha256, box); if (c.redactions) el("p", "note", c.redactions + " secret(s) redacted; digest not checkable on this copy", box); if (c.source === "spill") el("p", "note", "spilled output; commitment " + c.sha256, box); }
  });
})();`;

const STYLE = `body{font-family:system-ui,sans-serif;margin:1.5rem;color:#1b1b1b;background:#fafafa;max-width:70rem}
h1{font-size:1.4rem}h2{font-size:1.1rem;margin-top:1.5rem}h3{font-size:0.95rem;margin:0}
.warn{background:#fff3cd;border:1px solid #c9a227;padding:.6rem;font-weight:600}
.row{border:1px solid #ddd;background:#fff;padding:.6rem;margin:.4rem 0}
.row.assistant-block{border-left:4px solid #2a6}.row.user-message{border-left:4px solid #26a}.row.tool-call,.row.tool-result{border-left:4px solid #a62}
.digest{color:#666;font-size:.8rem;word-break:break-all}pre.content{white-space:pre-wrap;word-break:break-word;background:#f4f4f4;padding:.5rem;max-height:30rem;overflow:auto}
.note,.unavailable{color:#a33;font-size:.85rem}`;

export function renderSessionExportHtml(doc: SessionExportDocument): string {
  const scriptHash = createHash("sha256").update(VIEWER_SCRIPT, "utf8").digest("base64");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'sha256-${scriptHash}'; img-src 'none'; connect-src 'none'; form-action 'none'; base-uri 'none'">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>AMC session ${doc.sessionId.replace(/[^A-Za-z0-9._-]/g, "_")}</title>
<style>${STYLE}</style>
</head>
<body>
<noscript><p>This viewer needs JavaScript to render the embedded rows. The signed data is in the application/json block below; verify it with amc session verify-export.</p></noscript>
<main id="amc-view"></main>
<script type="application/json" id="${SESSION_EXPORT_JSON_ID}">${embedJson(doc)}</script>
<script>${VIEWER_SCRIPT}</script>
</body>
</html>
`;
}

export type ExtractedSessionExport = { readonly doc: unknown; readonly error: null } | { readonly doc: null; readonly error: string };

/**
 * The embedded document of an export file. The file must be, byte for byte, the canonical rendering of that document
 * (S14): a decoy block ahead of the real one, an edited page around a valid document, a comment or trailing bytes are
 * all refused, so what the verifier checks is exactly what the page shows. Parsing only: nothing in the file runs.
 */
export function extractSessionExportJson(html: string): ExtractedSessionExport {
  const open = `<script type="application/json" id="${SESSION_EXPORT_JSON_ID}">`;
  const start = html.indexOf(open);
  if (start < 0) return { doc: null, error: "the file carries no embedded session export" };
  const end = html.indexOf("</script>", start + open.length);
  if (end < 0) return { doc: null, error: "the embedded session export is not terminated" };
  let doc: unknown;
  try { doc = JSON.parse(html.slice(start + open.length, end)); } catch { return { doc: null, error: "the embedded session export is not valid JSON" }; }
  if (!doc || typeof doc !== "object" || typeof (doc as { sessionId?: unknown }).sessionId !== "string") return { doc: null, error: "the embedded JSON is not a session export document" };
  if (renderSessionExportHtml(doc as SessionExportDocument) !== html) {
    return { doc: null, error: "the file is not the canonical rendering of its embedded document: it was edited or carries extra content" };
  }
  return { doc, error: null };
}
