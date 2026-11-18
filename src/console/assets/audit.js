import { askInline, recordRows } from "./pageKit.js";
import { renderControlFamilyCard } from "./components/controlFamilyCard.js";
import { renderControlStatusChip } from "./components/controlStatusChip.js";

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function iso(ts) {
  return Number.isFinite(Number(ts)) ? new Date(Number(ts)).toISOString() : "-";
}

function familySummary(families) {
  const rows = Array.isArray(families) ? families : [];
  return rows.reduce(
    (acc, family) => {
      acc.pass += Number(family?.statusSummary?.pass ?? 0);
      acc.fail += Number(family?.statusSummary?.fail ?? 0);
      acc.insufficient += Number(family?.statusSummary?.insufficient ?? 0);
      return acc;
    },
    { pass: 0, fail: 0, insufficient: 0 }
  );
}

export async function renderAuditPage(params) {
  const status = await params.apiGet("/status").catch(() => null);
  const policy = await params.apiGet("/audit/policy").catch((error) => ({
    error: error?.message || String(error),
    signature: { valid: false }
  }));
  const activeMap = await params.apiGet("/audit/map/active").catch((error) => ({
    error: error?.message || String(error)
  }));
  const binders = await params.apiGet("/audit/binders").catch(() => ({ exports: [], cache: { workspace: null } }));
  const latest = binders?.cache?.workspace || null;
  const families = latest?.sections?.controls?.families || [];
  const summary = familySummary(families);
  const trust = latest?.trust || null;
  const assurance = latest?.sections?.assurance || null;
  const recurrence = latest?.sections?.recurrence || null;

  const warnings = [];
  const auditReadiness = status?.audit || null;
  if (policy?.signature?.valid !== true) {
    warnings.push("<div class='card status-bad'><strong>AUDIT POLICY UNTRUSTED</strong></div>");
  }
  if (activeMap?.signatures?.active?.valid !== true) {
    warnings.push("<div class='card status-bad'><strong>ACTIVE COMPLIANCE MAP UNTRUSTED</strong></div>");
  }
  if (auditReadiness?.readyGateOk === false) {
    warnings.push(`<div class='card status-warn'><strong>Evidence-strong claims are limited</strong>: ${esc((auditReadiness.readyGateReasons || []).join(", ") || "gates unmet")}</div>`);
  }

  const tiles = [
    { label: "Trust", value: trust ? renderControlStatusChip(trust.trustLabel) : renderControlStatusChip("INSUFFICIENT_EVIDENCE") },
    { label: "Assurance cert", value: renderControlStatusChip(assurance?.lastCert?.status || "INSUFFICIENT_EVIDENCE") },
    { label: "Controls pass", value: `${summary.pass}` },
    { label: "Controls fail", value: `${summary.fail}` },
    { label: "Controls insufficient", value: `${summary.insufficient}` },
    { label: "Binder ID", value: `<code>${esc(latest?.binderId || "-")}</code>` }
  ];

  params.root.innerHTML = [
    ...warnings,
    params.card(
      "Audit",
      `
      <div class="grid">
        ${tiles.map((tile) => `<div><div class="muted">${esc(tile.label)}</div><div class="tile-value">${tile.value}</div></div>`).join("")}
      </div>
      <div class="row wrap">
        <button id="auditRefreshCache">Refresh Binder Cache</button>
        <button id="auditExportNow" class="secondary">Export Binder</button>
        <a href="./auditBinder">Open Binder Detail</a>
        <a href="./auditRequests">Open Evidence Requests</a>
      </div>
      <div class="muted">integrity=${esc(trust?.integrityIndex ?? "-")} correlation=${esc(trust?.correlationRatio ?? "-")} observed=${esc(trust?.evidenceCoverage?.observedShare ?? "-")}</div>
      <div class="muted">diagnostic cadence: configured=${esc(recurrence?.diagnosticCadence?.configuredHours ?? "-")}h next=${esc(iso(recurrence?.diagnosticCadence?.nextRunTs))}</div>
      <div class="muted">assurance cadence: configured=${esc(recurrence?.assuranceCadence?.configuredHours ?? "-")}h next=${esc(iso(recurrence?.assuranceCadence?.nextRunTs))}</div>
      ${recordRows({
        policySignature: policy?.signature || null,
        activeMapSignature: activeMap?.signatures?.active || null,
        readiness: auditReadiness || null
      })}
      `
    ),
    params.card(
      "Control Families",
      families.length > 0
        ? families.map((family) => renderControlFamilyCard(family)).join("")
        : "<div class='card muted'>No binder cache available yet. Run audit scheduler or create binder.</div>"
    )
  ].join("");

  document.getElementById("auditRefreshCache")?.addEventListener("click", async () => {
    await params.apiPost("/audit/scheduler/run-now", {
      scopeType: "WORKSPACE",
      scopeId: "workspace"
    });
    await renderAuditPage(params);
  });

  document.getElementById("auditExportNow")?.addEventListener("click", async (event) => {
    const outFile = await askInline(event.currentTarget, { label: "Save the binder to (a path inside the workspace, ending in .amcaudit)",
      value: ".amc/audit/binders/exports/workspace/workspace/manual.amcaudit", submit: "Save", check: (text) => text.endsWith(".amcaudit") ? null : "The file name must end in .amcaudit." });
    if (!outFile) {
      return;
    }
    await params.apiPost("/audit/binder/export", {
      scopeType: "WORKSPACE",
      scopeId: "workspace",
      outFile: outFile.trim()
    });
    await renderAuditPage(params);
  });
}
