import { askInline, recordRows } from "./pageKit.js";
import { renderEvidenceRefList } from "./components/evidenceRefList.js";
import { renderControlStatusChip } from "./components/controlStatusChip.js";
import { renderBinderVerifyPanel } from "./components/binderVerifyPanel.js";

function esc(value) {
  return String(value ?? "")
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

export async function renderAuditBinderPage(params) {
  const listed = await params.apiGet("/audit/binders").catch(() => ({ exports: [], cache: { workspace: null } }));
  const exports = Array.isArray(listed?.exports) ? listed.exports : [];
  const selectedBinderId = query("binderId");
  const selected = selectedBinderId
    ? exports.find((row) => row.binderId === selectedBinderId) || null
    : exports[0] || null;
  const cached = listed?.cache?.workspace || null;
  // Only an exported binder has a signed file to check; the working copy (cache) is not one (it would answer 404).
  const verifyTarget = selected?.binderId || "";
  const verify = verifyTarget
    ? await params.apiGet(`/audit/binders/${encodeURIComponent(verifyTarget)}/verify`).catch(() => null)
    : null;
  const binder = verify?.binder || cached;

  const warnings = [];
  if (!binder) {
    warnings.push("<div class='card status-warn'><strong>No binder yet.</strong> Refresh the binder on the Audit page, or export a new one below.</div>");
  } else if (!selected) {
    warnings.push("<div class='card'><strong>This is the working copy</strong>, not an exported binder, so there is no signed file to check yet. Export a new binder to get one.</div>");
  } else if (!verify?.ok) {
    warnings.push("<div class='card status-bad'><strong>This binder did not pass its check:</strong> it was changed after signing, or AMC cannot confirm who signed it.</div>");
  }

  params.root.innerHTML = [
    ...warnings,
    params.card(
      "Binder",
      `
      <div class="grid">
        <div><div class="muted">binderId</div><div class="tile-value"><code>${esc(binder?.binderId || "-")}</code></div></div>
        <div><div class="muted">generated</div><div class="tile-value">${esc(iso(binder?.generatedTs))}</div></div>
        <div><div class="muted">scope</div><div class="tile-value">${esc(`${binder?.scope?.type || "?"}:${binder?.scope?.idHash || "?"}`)}</div></div>
        <div><div class="muted">trust</div><div class="tile-value">${renderControlStatusChip(binder?.trust?.trustLabel || "INSUFFICIENT_EVIDENCE")}</div></div>
      </div>
      <div class="muted">proof ids: ${renderEvidenceRefList(binder?.proofBindings?.includedEventProofIds || [])}</div>
      <div class="muted">controls map: <code>${esc(binder?.sections?.controls?.mapId || "-")}</code></div>
      <div class="row wrap">
        <button id="auditBinderRefresh">Refresh</button>
        <button id="auditBinderExport" class="secondary">Export new binder</button>
        <a href="./audit">Back to Dashboard</a>
      </div>
      `
    ),
    renderBinderVerifyPanel(verify),
    params.card(
      "Sections",
      `${recordRows({
        maturity: binder?.sections?.maturity || null,
        governance: binder?.sections?.governance || null,
        modelToolGovernance: binder?.sections?.modelToolGovernance || null,
        assurance: binder?.sections?.assurance || null,
        supplyChainIntegrity: binder?.sections?.supplyChainIntegrity || null,
        recurrence: binder?.sections?.recurrence || null
      })}`
    ),
    params.card(
      "Exports",
      exports.length > 0
        ? exports
            .map((row) => `<div class="row wrap"><a href="./auditBinder?binderId=${encodeURIComponent(row.binderId)}"><code>${esc(row.binderId)}</code></a><span class="muted">${esc(row.scopeType)}:${esc(row.scopeId)}</span><span class="muted">${esc(iso(row.generatedTs))}</span></div>`)
            .join("")
        : "<div class='muted'>No exported binders.</div>"
    )
  ].join("");

  document.getElementById("auditBinderRefresh")?.addEventListener("click", async () => {
    await renderAuditBinderPage(params);
  });

  document.getElementById("auditBinderExport")?.addEventListener("click", async (event) => {
    const outFile = await askInline(event.currentTarget, { label: "Save the new binder to (a path inside the workspace, ending in .amcaudit)",
      value: ".amc/audit/binders/exports/workspace/workspace/manual.amcaudit", submit: "Save", check: (text) => text.endsWith(".amcaudit") ? null : "The file name must end in .amcaudit." });
    if (!outFile) {
      return;
    }
    await params.apiPost("/audit/binder/export", {
      scopeType: "WORKSPACE",
      scopeId: "workspace",
      outFile: outFile.trim()
    });
    await renderAuditBinderPage(params);
  });
}
