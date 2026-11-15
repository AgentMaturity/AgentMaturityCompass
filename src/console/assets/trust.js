import { recordRows } from "./pageKit.js";
export async function renderTrustPage(params) {
  const trust = await params.apiGet("/trust/status");
  const signature = trust?.signature || {};
  const state = trust?.trust || {};
  const tail = trust?.notaryLogTail || { entries: [], ok: false, error: "unavailable" };

  params.root.innerHTML = `
    ${params.card("Trust Mode", `
      <div class="grid">
        <div><div class="muted">Mode</div><div class="tile-value">${params.htmlEscape(state.mode || "unknown")}</div></div>
        <div><div class="muted">Setup checks pass</div><div class="tile-value">${state.ok ? "YES" : "NO"}</div></div>
        <div><div class="muted">Settings file signature</div><div class="tile-value">${signature.valid ? "VALID" : "INVALID"}</div></div>
        <div><div class="muted">Signing service reachable</div><div class="tile-value">${state.notaryReachable ? "YES" : "NO"}</div></div>
      </div>
      ${recordRows({
        configSignatureReason: signature.reason || null,
        reasons: state.reasons || [],
        pinnedFingerprint: state.pinnedFingerprint || null,
        currentFingerprint: state.currentFingerprint || null,
        attestationLevel: state.attestationLevel || null,
        attestationBasis: state.attestationBasis || null,
        requiredAttestationLevel: state.requiredAttestationLevel || null,
        lastAttestationTs: state.lastAttestationTs || null
      })}
    `)}
    ${params.card("Notary Log Tail", `
      <div class="muted">Hash-only view (no payloads)</div>
      ${recordRows({
        ok: tail.ok,
        status: tail.status,
        error: tail.error,
        entries: Array.isArray(tail.entries) ? tail.entries : []
      })}
    `)}
  `;
}
