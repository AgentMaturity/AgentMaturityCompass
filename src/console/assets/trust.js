// No imports: tests run this module alone (tests/keys/consoleProtectionBasis.test.ts). Records read as rows here, with the
// raw record, escaped, under "Show the record" (C-09).
function rows(params, value) {
  const words = (key) => key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase().replace(/^./, (c) => c.toUpperCase());
  const shown = (item) => item === null || item === undefined || item === "" ? "none" : Array.isArray(item)
    ? (item.length ? item.map((part) => typeof part === "object" ? JSON.stringify(part) : String(part)).join(", ") : "none") : typeof item === "object" ? JSON.stringify(item) : String(item);
  return `<div class="scroll"><table class="record-rows"><tbody>${Object.entries(value).map(([key, item]) =>
    `<tr><th scope="row">${params.htmlEscape(words(key))}</th><td>${params.htmlEscape(shown(item))}</td></tr>`).join("")}</tbody></table></div>
    <details class="record"><summary>Show the record</summary><pre class="scroll">${params.htmlEscape(JSON.stringify(value, null, 2))}</pre></details>`;
}

export async function renderTrustPage(params) {
  const trust = await params.apiGet("/trust/status");
  const signature = trust?.signature || {};
  const state = trust?.trust || {};
  const tail = trust?.notaryLogTail || { entries: [], ok: false, error: "unavailable" };

  params.root.innerHTML = `
    ${params.card("Trust Mode", `
      <div class="grid">
        <div><div class="muted">Mode</div><div class="tile-value">${(params.plainCodeHtml || params.htmlEscape)(state.mode || "unknown")}</div></div>
        <div><div class="muted">Setup checks pass</div><div class="tile-value">${state.ok ? "YES" : "NO"}</div></div>
        <div><div class="muted">Settings file signature</div><div class="tile-value">${signature.valid ? "VALID" : "INVALID"}</div></div>
        <div><div class="muted">Signing service reachable</div><div class="tile-value">${state.notaryReachable ? "YES" : "NO"}</div></div>
      </div>
      ${rows(params, {
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
      ${rows(params, {
        ok: tail.ok,
        status: tail.status,
        error: tail.error,
        entries: Array.isArray(tail.entries) ? tail.entries : []
      })}
    `)}
  `;
}
