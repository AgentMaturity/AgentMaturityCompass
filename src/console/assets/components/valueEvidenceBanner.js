function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/**
 * The value pages' first line (C-02): no snapshot is "no value data yet", never a green "OK". `missingCode` is the
 * read's refusal code: NO_SNAPSHOT means value tracking is set up and no report has been made yet.
 */
export function renderValueEvidenceBanner(snapshot, missingCode = null) {
  if (!snapshot && missingCode === "NO_SNAPSHOT") {
    return `<div class="card"><strong>No value report yet.</strong> Value tracking is set up, and no report has been made
      for this scope. Make one on the <a href="./value">Value page</a> with "Make a value report".</div>`;
  }
  if (!snapshot) {
    return `<div class="card"><strong>No value data yet.</strong> AMC has no value snapshot for this scope, so there is nothing to
      judge. A workspace owner starts value tracking with <code>amc value init</code> in the workspace folder.</div>`;
  }
  if (snapshot.status !== "INSUFFICIENT_EVIDENCE") {
    return "<div class='card status-ok'><strong>Value checks passed:</strong> the records behind these value figures meet the workspace's value policy.</div>";
  }
  const reasons = Array.isArray(snapshot.reasons) ? snapshot.reasons : [];
  return `<div class="card status-bad">
    <strong>Not enough records for value claims.</strong> The figures below are for information only.
    <ul>${reasons.map((reason) => `<li>${escapeHtml(reason)}</li>`).join("")}</ul>
  </div>`;
}
