import { renderFindingCard } from "./components/findingCard.js";
import { renderScoreGauge } from "./components/scoreGauge.js";
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

function renderConfirmationProofRows(proofs) {
  return proofs.map((row) => {
    const proof = row.proof || row;
    return `<tr>
      <td><code>${escapeHtml(proof.proofId || "-")}</code></td>
      <td>${escapeHtml(proof.confirmationStatus || "-")}</td>
      <td>${escapeHtml(proof.findingId || "-")}</td>
      <td>${escapeHtml(proof.technique || "-")}</td>
      <td>${escapeHtml(proof.safeMode || "-")}</td>
      <td>${escapeHtml(String(proof.safeProof?.signalCount ?? 0))}</td>
    </tr>`;
  }).join("");
}

function renderConfirmationScopeRows(scopes) {
  return scopes.map((row) => {
    const scope = row.scope || row;
    return `<tr>
      <td><code>${escapeHtml(scope.scopeId || "-")}</code></td>
      <td>${escapeHtml(`${scope.target?.type || "-"}:${scope.target?.id || "-"}`)}</td>
      <td>${escapeHtml((scope.allowedTechniques || []).join(", ") || "-")}</td>
      <td>${escapeHtml(scope.safeMode || "-")}</td>
      <td>${escapeHtml(iso(scope.windowEndTs))}</td>
    </tr>`;
  }).join("");
}

export async function renderAssurancePage(params) {
  const policy = await params.apiGet("/assurance/policy");
  const runsResponse = await params.apiGet("/assurance/runs");
  const certLatest = await params.apiGet("/assurance/cert/latest");
  const waiverStatus = await params.apiGet("/assurance/waiver/status").catch(() => ({ active: null }));
  const status = await params.apiGet("/status").catch(() => null);
  const confirmationScopesResponse = await params.apiGet("/shield/exploit-confirmation/scopes").catch(() => ({ scopes: [] }));
  const confirmationProofsResponse = await params.apiGet("/shield/exploit-confirmation/proofs").catch(() => ({ proofs: [] }));

  const runs = Array.isArray(runsResponse?.runs) ? runsResponse.runs : [];
  const confirmationScopes = Array.isArray(confirmationScopesResponse?.scopes) ? confirmationScopesResponse.scopes : [];
  const confirmationProofs = Array.isArray(confirmationProofsResponse?.proofs) ? confirmationProofsResponse.proofs : [];
  const latestRun = runs[0] || null;
  const latestRunDetail = latestRun
    ? await params.apiGet(`/assurance/runs/${encodeURIComponent(latestRun.runId)}`).catch(() => null)
    : null;
  const findings = Array.isArray(latestRunDetail?.findings?.findings) ? latestRunDetail.findings.findings : [];
  const topFindings = findings.slice(0, 8);

  const gate = status?.assurance || null;
  const policySigValid = policy?.signature?.valid === true;
  const breach = gate && gate.readyGateOk === false && Array.isArray(gate.readyGateReasons) && gate.readyGateReasons.includes("ASSURANCE_THRESHOLD_BREACH");

  const warnings = [];
  if (!policySigValid) {
    warnings.push("<div class='card status-bad'><strong>ASSURANCE POLICY UNTRUSTED</strong></div>");
  }
  if (breach) {
    warnings.push("<div class='card status-bad'><strong>Assurance breach blocks readiness</strong></div>");
  }

  const score = latestRun ? latestRun.score : null;
  const scoreStatus = latestRun ? latestRun.status : "UNKNOWN";

  const certSummary = certLatest?.latest?.cert || null;

  const findingsHtml = topFindings.length > 0
    ? topFindings.map((row) => renderFindingCard(row)).join("")
    : "<div class='card muted'>No findings for latest run.</div>";

  params.root.innerHTML = [
    ...warnings,
    renderWaiverBanner(waiverStatus?.active || certLatest?.waiver || null),
    params.card(
      "Assurance Dashboard",
      `
      ${renderScoreGauge({ label: "Risk Assurance Score", score, status: scoreStatus })}
      <div class="grid">
        <div><div class="muted">Latest run</div><div class="tile-value"><code>${escapeHtml(latestRun?.runId || "-")}</code></div></div>
        <div><div class="muted">Latest run ts</div><div class="tile-value">${escapeHtml(iso(latestRun?.generatedTs))}</div></div>
        <div><div class="muted">Latest cert</div><div class="tile-value"><code>${escapeHtml(certSummary?.certId || "-")}</code></div></div>
        <div><div class="muted">Cert status</div><div class="tile-value">${escapeHtml(certSummary?.status || "MISSING")}</div></div>
      </div>
      <div class="row wrap">
        <button id="assuranceRunNow">Run Assurance Now</button>
        <button id="assuranceIssueCert" class="secondary">Issue Certificate</button>
        <button id="assuranceRequestWaiver" class="secondary">Request Waiver</button>
      </div>
      <div class="row wrap">
        <a href="./assuranceRun${latestRun ? `?runId=${encodeURIComponent(latestRun.runId)}` : ""}">Open Run Detail</a>
        <a href="./assuranceCert">Open Certificate</a>
      </div>
      <p class="muted">Defensive assurance runs against AMC-controlled interfaces only. Trace storage is hashes/refs, not raw prompts/outputs.</p>
      <pre class="scroll">${escapeHtml(JSON.stringify({
        policySignature: policy?.signature,
        readinessGate: gate,
        lastCertStatus: certSummary?.status || null,
        thresholds: policy?.policy?.assurancePolicy?.thresholds || null
      }, null, 2))}</pre>
      `
    ),
    params.card(
      "Authorized Security Confirmation",
      `
      <div class="grid">
        <div><div class="muted">Active scopes</div><div class="tile-value">${confirmationScopes.length}</div></div>
        <div><div class="muted">Safe proofs</div><div class="tile-value">${confirmationProofs.length}</div></div>
        <div><div class="muted">Raw payload storage</div><div class="tile-value">disabled</div></div>
        <div><div class="muted">Export mode</div><div class="tile-value">safe proof</div></div>
      </div>
      <p class="muted">Exploit confirmation is fail-closed. It requires an explicit signed scope and exports hashes, signal refs, and receipts instead of exploit instructions.</p>
      <div class="scroll">
        <table>
          <thead><tr><th>Proof</th><th>Status</th><th>Finding</th><th>Technique</th><th>Mode</th><th>Signals</th></tr></thead>
          <tbody>${renderConfirmationProofRows(confirmationProofs) || "<tr><td colspan='6' class='muted'>No confirmation proofs yet.</td></tr>"}</tbody>
        </table>
      </div>
      <div class="scroll">
        <table>
          <thead><tr><th>Scope</th><th>Target</th><th>Techniques</th><th>Safe Mode</th><th>Ends</th></tr></thead>
          <tbody>${renderConfirmationScopeRows(confirmationScopes) || "<tr><td colspan='5' class='muted'>No authorization scopes yet.</td></tr>"}</tbody>
        </table>
      </div>
      `
    ),
    params.card("Top Findings", findingsHtml)
  ].join("");

  document.getElementById("assuranceRunNow")?.addEventListener("click", async () => {
    await params.apiPost("/assurance/run", {
      scope: "workspace",
      pack: "all"
    });
    await renderAssurancePage(params);
  });

  document.getElementById("assuranceIssueCert")?.addEventListener("click", async () => {
    if (!latestRun?.runId) {
      alert("No assurance run available to certify.");
      return;
    }
    await params.apiPost("/assurance/cert/issue", {
      runId: latestRun.runId
    });
    await renderAssurancePage(params);
  });

  document.getElementById("assuranceRequestWaiver")?.addEventListener("click", async () => {
    const reason = window.prompt("Waiver reason (required)", "Temporary business continuity while remediating assurance findings");
    if (!reason || reason.trim().length === 0) {
      return;
    }
    const hoursRaw = window.prompt("Waiver hours (1-72)", "24");
    const hours = Math.max(1, Math.min(72, Number.parseInt(hoursRaw || "24", 10) || 24));
    await params.apiPost("/assurance/waiver/request", {
      reason: reason.trim(),
      hours
    });
    await renderAssurancePage(params);
  });
}
