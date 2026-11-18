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

/** The viewer as AMC wrote it before the timeline (UX-05); a page it rendered still verifies. */
const LEGACY_VIEWER_SCRIPT = `(function () {
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
  el("p", null, "Rows: " + doc.rows.length + "; lifecycle: " + (doc.record && doc.record.ended_ts !== null ? "sealed" : "open or released (tail unproven)") + "; content: " + (doc.content ? "included (redacted, bounded)" : "payload digests only (the signed row metadata is embedded in full)"), head);
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
    if (c && c.unavailable !== undefined) el("p", "unavailable", "content not exported for this row (the reason is in the JSON; the verifier does not check that text)", box);
    else if (c) { var pre = el("pre", "content", c.text, box); if (c.truncated) el("p", "note", "truncated; full digest " + c.sha256, box); if (c.redactions) el("p", "note", c.redactions + " secret(s) redacted; digest not checkable on this copy", box); if (c.source === "spill") el("p", "note", "spilled output; commitment " + c.sha256, box); }
  });
})();`;

const LEGACY_STYLE = `body{font-family:system-ui,sans-serif;margin:1.5rem;color:#1b1b1b;background:#fafafa;max-width:70rem}
h1{font-size:1.4rem}h2{font-size:1.1rem;margin-top:1.5rem}h3{font-size:0.95rem;margin:0}
.warn{background:#fff3cd;border:1px solid #c9a227;padding:.6rem;font-weight:600}
.row{border:1px solid #ddd;background:#fff;padding:.6rem;margin:.4rem 0}
.row.assistant-block{border-left:4px solid #2a6}.row.user-message{border-left:4px solid #26a}.row.tool-call,.row.tool-result{border-left:4px solid #a62}
.digest{color:#666;font-size:.8rem;word-break:break-all}pre.content{white-space:pre-wrap;word-break:break-word;background:#f4f4f4;padding:.5rem;max-height:30rem;overflow:auto}
.note,.unavailable{color:#a33;font-size:.85rem}`;

/**
 * The viewer (UX-05): a readable timeline first (who asked, what the agent did, what was asked of a person and who
 * answered, the results), then the signed rows with their hashes behind a "Show the record" control. Every node is
 * built from the embedded document with createElement/textContent; nothing is fetched and nothing is checked here.
 */
const VIEWER_SCRIPT = `(function () {
  var raw = document.getElementById(${JSON.stringify(SESSION_EXPORT_JSON_ID)}).textContent;
  var doc = JSON.parse(raw);
  var root = document.getElementById("amc-view");
  var LIMIT = 1200;
  function el(tag, cls, text, parent) { var e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined && text !== null) e.textContent = String(text); (parent || root).appendChild(e); return e; }
  function meta(row) { try { return JSON.parse(row.meta_json); } catch (e) { return {}; } }
  function content(row) { if (!doc.content) return null; var c = doc.content[row.id]; return c || null; }
  function when(row) { var d = new Date(row.ts); return isNaN(d.getTime()) ? "" : d.toISOString().replace("T", " ").replace(/\\.\\d+Z$/, " UTC"); }
  function body(row, parent) {
    var c = content(row);
    if (!c) { el("p", "muted", doc.content ? "No text was recorded for this step." : "Text not included in this export (it holds the record only).", parent); return; }
    if (c.unavailable !== undefined) { el("p", "muted", "content not exported for this row", parent); return; }
    var text = String(c.text);
    if (text.length <= LIMIT) { el("pre", "content", text, parent); }
    else { el("pre", "content", text.slice(0, LIMIT) + " …", parent); var more = el("details", null, null, parent); el("summary", null, "Show all (" + text.length + " characters)", more); el("pre", "content", text, more); }
    if (c.truncated) el("p", "note", "Shortened in this export; the record holds the full text.", parent);
    if (c.redactions) el("p", "note", c.redactions + " secret(s) hidden in this copy.", parent);
  }
  var head = el("header", "head");
  el("h1", null, "What happened in this agent session", head);
  var sealed = doc.record && doc.record.ended_ts !== null && doc.record.ended_ts !== undefined;
  el("p", null, "Session " + doc.sessionId + " · " + doc.rows.length + " recorded events · " + (sealed ? "sealed: the record was closed and signed at its end" : "not sealed: the session was left open (a chat closed with /exit can be continued), so later events would not be noticed"), head);
  el("p", "warn", "This page shows the signed record and does not check it. To check it, run: amc session verify-export <this file> --expect-monitor <fingerprint you were given>, or amc-verify verify <this file> with your trust list.", head);
  var list = el("ol", "timeline");
  var pending = {};
  doc.rows.forEach(function (row) {
    var m = meta(row), item = null, title = null, kind = "";
    if (row.event_type === "user/message") { title = "A person asked"; kind = "person"; }
    else if (row.event_type === "assistant/block" && (m.blockKind === "text" || m.blockKind === undefined)) { title = "The agent replied"; kind = "agent"; }
    else if (row.event_type === "tool/call") { title = "The agent asked to use " + (m.toolName || "a tool"); kind = "tool"; pending[m.toolCallId] = m.toolName; }
    else if (row.event_type === "approval/request") { title = "A person was asked to approve " + (m.toolName || "a step") + (m.actionClass ? " (" + m.actionClass + ")" : ""); kind = "ask"; }
    else if (row.event_type === "approval/answer") { title = (m.answer === "allow" ? "Approved by " : m.answer === "deny" ? "Refused by " : "No answer from ") + (m.answeredBy || "nobody") + (m.reason ? ": " + m.reason : ""); kind = m.answer === "allow" ? "ok" : "bad"; }
    else if (row.event_type === "tool/result") { var name = pending[m.toolCallId] || "the tool"; title = m.outcome === "OK" ? name + " ran" + (m.exitCode !== undefined && m.exitCode !== null ? " (exit " + m.exitCode + ")" : "") : m.outcome === "DENIED" ? name + " was refused and did not run" : m.outcome === "CANCELLED" ? name + " was cancelled" : m.outcome === "ERROR" ? name + " failed" : name + ": outcome unknown, it may have run"; kind = m.outcome === "OK" ? "ok" : "bad"; }
    else if (row.event_type === "request/failure") { title = "A model request failed"; kind = "bad"; }
    else if (row.event_type === "session/close") { title = "The session was closed"; kind = "end"; }
    if (title === null) return;
    item = el("li", "step " + kind, null, list);
    el("p", "when", when(row), item);
    el("h3", null, title, item);
    if (row.event_type === "approval/request") el("p", null, m.question || "", item);
    else if (row.event_type !== "approval/answer" && row.event_type !== "session/close" && row.event_type !== "request/failure") body(row, item);
  });
  if (!list.firstChild) el("li", "step", "No conversation steps were recorded.", list);
  var rec = el("details", "record");
  el("summary", null, "Show the record (signed events and their hashes)", rec);
  el("p", "warn", "This page renders the embedded signed rows and performs no verification.", rec);
  el("p", null, "Embedded monitor key fingerprint (display only, not a trust anchor): " + doc.monitorKeyFingerprint, rec);
  doc.rows.forEach(function (row) {
    var m = meta(row);
    var box = el("article", "row", null, rec);
    var title = row.event_type;
    if (row.event_type === "tool/call") title += " " + (m.toolName || "") + " [" + (m.toolCallId || "") + "]";
    if (row.event_type === "tool/result") title += " " + (m.outcome || "") + " [" + (m.toolCallId || "") + "]";
    el("h4", null, title, box);
    el("p", "digest", "event " + row.id + " · ts " + new Date(row.ts).toISOString() + " · event sha256 " + row.event_hash + " · payload sha256 " + row.payload_sha256, box);
    var c = content(row);
    if (c && c.unavailable !== undefined) el("p", "muted", "content not exported for this row", box);
  });
})();`;

const STYLE = `:root{color-scheme:light dark;--bg:#fafafa;--fg:#1b1b1b;--card:#fff;--line:#ddd;--muted:#666;--ok:#1f7a3a;--bad:#a3261b;--ask:#8a5a00;--warn-bg:#fff3cd;--warn-line:#c9a227}
@media (prefers-color-scheme:dark){:root{--bg:#141414;--fg:#ececec;--card:#1e1e1e;--line:#333;--muted:#a0a0a0;--ok:#5cc27a;--bad:#ef7a6e;--ask:#e0b050;--warn-bg:#3a3010;--warn-line:#7a6420}}
body{font-family:system-ui,sans-serif;margin:0 auto;padding:1rem;color:var(--fg);background:var(--bg);max-width:60rem}
h1{font-size:1.4rem}h3{font-size:1rem;margin:.1rem 0}h4{font-size:.9rem;margin:0}
.warn{background:var(--warn-bg);border:1px solid var(--warn-line);padding:.6rem}
.timeline{list-style:none;padding:0;margin:1rem 0}.step{background:var(--card);border:1px solid var(--line);border-left:4px solid var(--line);padding:.6rem;margin:.5rem 0}
.step.person{border-left-color:#3a6fd0}.step.agent{border-left-color:#888}.step.tool{border-left-color:var(--ask)}.step.ask{border-left-color:var(--ask)}.step.ok{border-left-color:var(--ok)}.step.bad{border-left-color:var(--bad)}
.when,.muted,.digest{color:var(--muted);font-size:.8rem;margin:0}.digest{word-break:break-all}
pre.content{white-space:pre-wrap;word-break:break-word;background:var(--bg);padding:.5rem;margin:.4rem 0;max-height:24rem;overflow:auto}
.note{color:var(--bad);font-size:.85rem}.record{margin-top:1.5rem}.record summary{cursor:pointer;font-weight:600}.row{border-top:1px solid var(--line);padding:.4rem 0}`;

function renderWith(doc: SessionExportDocument, script: string, style: string): string {
  const scriptHash = createHash("sha256").update(script, "utf8").digest("base64");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'sha256-${scriptHash}'; img-src 'none'; connect-src 'none'; form-action 'none'; base-uri 'none'">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>AMC session ${doc.sessionId.replace(/[^A-Za-z0-9._-]/g, "_")}</title>
<style>${style}</style>
</head>
<body>
<noscript><p>This viewer needs JavaScript to render the embedded rows. The signed data is in the application/json block below; verify it with amc session verify-export.</p></noscript>
<main id="amc-view"></main>
<script type="application/json" id="${SESSION_EXPORT_JSON_ID}">${embedJson(doc)}</script>
<script>${script}</script>
</body>
</html>
`;
}

export function renderSessionExportHtml(doc: SessionExportDocument): string {
  return renderWith(doc, VIEWER_SCRIPT, STYLE);
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
  if (renderSessionExportHtml(doc as SessionExportDocument) !== html && renderWith(doc as SessionExportDocument, LEGACY_VIEWER_SCRIPT, LEGACY_STYLE) !== html) {
    return { doc: null, error: "the file is not the canonical rendering of its embedded document: it was edited or carries extra content" };
  }
  return { doc, error: null };
}
