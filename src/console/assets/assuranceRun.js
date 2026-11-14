import { renderFindingCard } from "./components/findingCard.js";
import { renderScoreGauge } from "./components/scoreGauge.js";

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function query(name) {
  const url = new URL(window.location.href);
  return url.searchParams.get(name);
}

function iso(ts) {
  return Number.isFinite(Number(ts)) ? new Date(Number(ts)).toISOString() : "-";
}

export async function renderAssuranceRunPage(params) {
  let runId = query("runId");
  if (!runId) {
    const rows = await params.apiGet("/assurance/runs");
    const run = Array.isArray(rows?.runs) ? rows.runs[0] : null;
    runId = run?.runId || null;
  }

  if (!runId) {
    params.root.innerHTML = params.card("Assurance Run", "<p class='muted'>No test runs yet. Start one from the Assurance page.</p>");
    return;
  }

  const detail = await params.apiGet(`/assurance/runs/${encodeURIComponent(runId)}`);
  const run = detail?.run || null;
  const findings = Array.isArray(detail?.findings?.findings) ? detail.findings.findings : [];
  const refs = Array.isArray(detail?.traceRefs?.refs) ? detail.traceRefs.refs : [];

  params.root.innerHTML = [
    params.card(
      "Run Summary",
      `
      ${renderScoreGauge({ label: "Risk Assurance Score", score: run?.score?.riskAssuranceScore, status: run?.score?.status || "UNKNOWN" })}
      <div class="grid">
        <div><div class="muted">Run ID</div><div class="tile-value"><code>${escapeHtml(run?.runId || runId)}</code></div></div>
        <div><div class="muted">Generated</div><div class="tile-value">${escapeHtml(iso(run?.generatedTs))}</div></div>
        <div><div class="muted">Scope</div><div class="tile-value">${escapeHtml(`${run?.scope?.type || "?"}:${run?.scope?.id || "?"}`)}</div></div>
        <div><div class="muted">Pass</div><div class="tile-value">${escapeHtml(String(run?.score?.pass ?? false))}</div></div>
      </div>
      <div class="muted">Packs: ${(run?.selectedPacks || []).map((row) => `<code>${escapeHtml(row)}</code>`).join(" ") || "none"}</div>
      <div class="muted">Evidence gates: integrity=${escapeHtml(String(run?.evidenceGates?.integrityIndex ?? "-"))}, correlation=${escapeHtml(String(run?.evidenceGates?.correlationRatio ?? "-"))}, observed=${escapeHtml(String(run?.evidenceGates?.observedShare ?? "-"))}</div>
      `
    ),
    params.card(
      `Findings (${findings.length})`,
      findings.length > 0 ? findings.map((row) => renderFindingCard(row)).join("") : "<div class='muted'>No findings.</div>"
    ),
    params.card(
      `Trace Refs (${refs.length})`,
      `<pre class="scroll">${escapeHtml(JSON.stringify(refs.slice(0, 50), null, 2))}</pre>`
    )
  ].join("");
}
