import { recordRows } from "./pageKit.js";
import { plainCodeHtml } from "./plainError.js";
import { renderWaiverBanner } from "./components/waiverBanner.js";

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function iso(ts) {
  return Number.isFinite(Number(ts)) ? new Date(Number(ts)).toISOString() : "-";
}

export async function renderAssuranceCertPage(params) {
  const latest = await params.apiGet("/assurance/cert/latest");
  const cert = latest?.latest?.cert || null;
  const verify = latest?.latest?.verify || null;
  const file = latest?.latest?.file || null;

  if (!cert) {
    params.root.innerHTML = params.card(
      "Assurance certificate",
      "<p class='muted'>No certificate issued yet.</p>"
    );
    return;
  }

  params.root.innerHTML = [
    renderWaiverBanner(latest?.waiver || null),
    params.card(
      "Certificate",
      `
      <div class="grid">
        <div><div class="muted">Cert ID</div><div class="tile-value"><code>${escapeHtml(cert.certId)}</code></div></div>
        <div><div class="muted">Run ID</div><div class="tile-value"><code>${escapeHtml(cert.runId)}</code></div></div>
        <div><div class="muted">Status</div><div class="tile-value">${plainCodeHtml(cert.status)}</div></div>
        <div><div class="muted">Issued</div><div class="tile-value">${escapeHtml(iso(cert.issuedTs))}</div></div>
      </div>
      <div class="muted">file: <code>${escapeHtml(file || "-")}</code></div>
      <div class="muted">Record check: ${plainCodeHtml(verify?.ok ? "PASS" : "FAIL")}</div>
      ${recordRows({
        riskAssuranceScore: cert.riskAssuranceScore,
        findingCounts: cert.findingCounts,
        gates: cert.gates,
        bindings: cert.bindings,
        proofBindings: cert.proofBindings,
        verifyErrors: verify?.errors || []
      })}
      `
    )
  ].join("");
}
