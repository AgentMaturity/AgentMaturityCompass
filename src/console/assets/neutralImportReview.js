function esc(value) {
  return String(value ?? "unknown").replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}
function rows(value) { return Array.isArray(value) ? value : []; }
function count(value) { return Number.isSafeInteger(value) && value >= 0 ? String(value) : "unknown"; }
function time(value) {
  if (typeof value !== "number" || !Number.isFinite(value) || Math.abs(value) > 8.64e15) return "unknown";
  return new Date(value).toISOString();
}
function fieldList(label, values) {
  const items = rows(values);
  return items.length ? `<p><strong>${label}:</strong> ${items.map(value => `<code>${esc(value)}</code>`).join(", ")}</p>` : "";
}

/** Pure display only. Source text and argv never become executable markup or command handlers. */
export function renderNeutralImportReview(plan, { applied = false } = {}) {
  const receipt = plan?.normalization;
  if (!receipt) return '<p class="muted">Legacy receipt: normalization and record mapping details are unavailable. Inspect the original manifest; review a fresh import before applying.</p>';
  const mapping = receipt.recordMapping, totals = receipt.counts || {}, records = rows(mapping?.records), coverage = mapping?.detailCoverage;
  const sourceRows = mapping ? rows(mapping.sources) : rows(plan?.candidates).map(source => ({
    path: source.path, digest: source.digest, version: source.sourceFormat?.version ?? null,
    format: source.sourceFormat?.name ?? source.format, disposition: "recognized", recordCount: null
  }));
  const detailLimit = 100, shown = records.slice(0, detailLimit);
  const argv = rows(receipt.nextActions).filter(action => Array.isArray(action?.argv) && action.argv.every(value => typeof value === "string"))
    .filter(action => !applied || !action.argv.includes("--expected-digest"));
  return `<section class="neutral-import-review">
    <p><strong>SELF_REPORTED · NOT_EVALUATED.</strong> ${applied ? "Import saved as source claims." : "Import review only."} No maturity evaluation, verified success or cost is inferred.</p>
    <p>Normalizer <code>${esc(receipt.normalizerVersion)}</code>; mapping <code>${esc(mapping?.schemaVersion ?? "legacy detail unavailable")}</code>.</p>
    <p>Ingest/review time: ${esc(plan?.detectedAt)}. Source event times appear separately below.</p>
    <p>${count(totals.recognizedFiles)} recognized files; ${count(totals.skippedFiles)} skipped
      (${count(totals.malformedFiles)} malformed, ${count(totals.unsupportedFiles)} unsupported, ${count(totals.oversizedFiles)} oversized).
      ${count(totals.normalizedTraces)} traces; ${count(totals.failureTraces)} source-reported failures.
      ${count(totals.unknownTimestamps)} unknown event times; ${count(totals.unknownDurations)} unknown durations.</p>
    ${mapping ? `<p>${count(mapping.counts?.records)} records accounted for: ${count(mapping.counts?.mapped)} mapped,
      ${count(mapping.counts?.retainedOnly)} retained context, ${count(mapping.counts?.malformed)} malformed,
      ${count(mapping.counts?.unsupported)} unsupported. ${count(mapping.counts?.unlinkedTraces)} traces lack a proven primary record link.
      Skipped-file record counts remain unknown.</p>` : '<p class="muted">This legacy receipt has no per-record mapping detail.</p>'}
    <details><summary>Source files, versions and digests</summary>
      <table><thead><tr><th>Source</th><th>Format / version</th><th>Mapping</th><th>SHA-256</th></tr></thead><tbody>
      ${sourceRows.map(source => `<tr><td>${esc(source.path)}</td><td>${esc(source.format)} / ${esc(source.version ?? "unversioned or unknown")}</td>
        <td>${esc(source.disposition)}; ${count(source.recordCount)} records${source.reason ? `<br>${esc(source.reason)}` : ""}</td><td><code>${esc(source.digest)}</code></td></tr>`).join("")}
      </tbody></table></details>
    ${mapping ? `<p>${count(coverage?.emittedRecords)} record details retained; ${count(coverage?.omittedRecords)} omitted by receipt limits;
      ${count(coverage?.omittedFields)} field details and ${count(coverage?.omittedTraceLinks)} trace links omitted;
      ${count(coverage?.boundedTextValues)} text values shortened. Detail coverage: ${coverage?.complete === true ? "complete" : "partial"}.
      ${records.length > shown.length ? `Showing the first ${shown.length} of ${records.length} retained details; use the JSON receipt for the rest.` : ""}</p>
      <div class="scroll">${shown.map(record => `<details><summary>${esc(record.source)} ${esc(record.pointer === null ? "(no parsed record)" : record.pointer || "(artifact context)")}${record.sourceLine === null || record.sourceLine === undefined ? "" : ` · line ${esc(record.sourceLine)}`} — ${esc(record.disposition)}</summary>
        <p>${esc(record.reason)}</p>
        ${fieldList("Projected fields (possibly transformed)", record.fields?.projected)}
        ${fieldList("Partially projected fields", record.fields?.partial)}
        ${fieldList("Source fields outside this record’s primary trace projection", record.fields?.retainedOnly)}
        ${fieldList("Fields containing redaction markers", record.fields?.redactionMarkers)}
        ${rows(record.traces).length ? `<table><thead><tr><th>Trace</th><th>Source event time</th><th>Duration</th><th>Outcome / cost</th></tr></thead><tbody>
          ${rows(record.traces).map(trace => `<tr><td>#${esc(trace.index)} <code>${esc(trace.traceId)}</code></td>
            <td>${esc(time(trace.sourceTime))} (${esc(trace.sourceTimeStatus)})</td>
            <td>${typeof trace.durationMs === "number" && Number.isFinite(trace.durationMs) && trace.durationMs >= 0 ? `${esc(trace.durationMs)} ms (source reported)` : "unknown — no duration inferred"}</td>
            <td>${trace.failure === true ? "source-reported failure" : "unknown or not classified"}; cost not normalized</td></tr>`).join("")}</tbody></table>` : '<p class="muted">No independent trace was projected from this record. This is not a successful execution.</p>'}
        </details>`).join("") || '<p class="muted">No record details are available. Review skipped-file reasons and source format.</p>'}</div>` : ""}
    <details><summary>Projection limits and warnings</summary><ul>${[...rows(receipt.losses), ...rows(mapping?.semantics), ...rows(plan?.warnings)].map(loss => `<li>${esc(loss)}</li>`).join("")}</ul></details>
    <p>Review source claims and missing fields before applying. Follow-up arguments below are copy/review data; Studio does not execute them.</p>
    ${argv.map(action => `<p>${esc(action.label)}</p><pre>${esc(JSON.stringify(action.argv))}</pre>`).join("")}
    <details><summary>Receipt identities</summary><p>Source semantic SHA-256: <code>${esc(receipt.semanticDigest)}</code></p>
      <p>Mapping SHA-256: <code>${esc(mapping?.digestSha256)}</code></p></details>
  </section>`;
}
