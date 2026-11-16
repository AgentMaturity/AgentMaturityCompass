import { renderPassportCard } from "./components/passportCard.js";
import { renderBadgeChip } from "./components/badgeChip.js";
import { askInline, codeWords, recordDetails, workspacePath } from "./pageKit.js";

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function tile(label, value) {
  return `<div><div class="muted">${esc(label)}</div><div class="tile-value">${value}</div></div>`;
}

async function loadPassportData(params) {
  const [status, exportsRes, cacheRes, agentsRes] = await Promise.all([
    params.apiGet("/status").catch(() => null),
    params.apiGet("/passport/exports").catch(() => ({ exports: [] })),
    params.apiGet(`/passport/cache/latest?scope=agent&id=${encodeURIComponent(params.currentAgent())}`).catch(() => ({ passport: null })),
    params.apiGet("/agents").catch(() => ({ agents: [] }))
  ]);
  const agents = Array.isArray(agentsRes?.agents) ? agentsRes.agents : [];
  // Each agent's latest passport, read only (C-01): the badge route makes a passport when none exists, so it is not used here.
  const badges = await Promise.all(agents.slice(0, 20).map((agent) => String(agent?.id ?? "")).filter(Boolean).map(async (agentId) => {
    const row = await params.apiGet(`/passport/cache/latest?scope=agent&id=${encodeURIComponent(agentId)}`).catch(() => null);
    return { agentId, label: row?.passport?.status?.label ?? null };
  }));
  return {
    status,
    exports: Array.isArray(exportsRes?.exports) ? exportsRes.exports : [],
    cache: cacheRes?.passport ?? null,
    badges
  };
}

export async function renderPassportPage(params) {
  params.root.innerHTML = params.card("Agent Passport", "<p aria-busy=\"true\">Reading the passports…</p>");
  const data = await loadPassportData(params);
  const passport = data.cache;
  const warnings = [];
  if (data.status?.passport?.policySignatureValid === false) {
    warnings.push("<div class='card status-bad'><strong>PASSPORT POLICY UNTRUSTED</strong></div>");
  }
  if (passport?.status?.label === "UNTRUSTED") {
    warnings.push("<div class='card status-bad'><strong>UNTRUSTED PASSPORT</strong></div>");
  } else if (passport?.status?.label === "INFORMATIONAL") {
    const reasons = (passport.status.reasons || []).map(codeWords).join(", ");
    warnings.push(`<div class='card status-warn'><strong>For information only.</strong> This passport does not meet the bar for claims: ${reasons || "some checks were not met"}.</div>`);
  }

  const maturity = typeof passport?.maturity?.overall === "number" ? passport.maturity.overall.toFixed(1) : "UNKNOWN";
  const assurance = typeof passport?.checkpoints?.lastAssuranceCert?.riskAssuranceScore === "number"
    ? String(Math.round(passport.checkpoints.lastAssuranceCert.riskAssuranceScore))
    : "UNKNOWN";
  const value = typeof passport?.valueDimensions?.valueScore === "number"
    ? String(Math.round(passport.valueDimensions.valueScore))
    : "UNKNOWN";
  const risks = [
    passport?.strategyFailureRisks?.ecosystemFocusRisk,
    passport?.strategyFailureRisks?.clarityPathRisk,
    passport?.strategyFailureRisks?.economicSignificanceRisk,
    passport?.strategyFailureRisks?.riskAssuranceRisk,
    passport?.strategyFailureRisks?.digitalDualityRisk
  ].filter((row) => typeof row === "number");
  const riskSummary = risks.length > 0 ? String(Math.round(risks.reduce((sum, row) => sum + row, 0) / risks.length)) : "UNKNOWN";

  params.root.innerHTML = [
    ...warnings,
    params.card(
      "Agent Passport",
      `
      <p class="muted">A passport is a signed summary of an agent's latest score that you can hand to someone else. The signature shows
      who made it and that it has not changed since; it does not make the score true.</p>
      <p class="muted">Every passport is self-issued: this workspace signs it about its own agent, using its own clock. "Verified"
      means this workspace's own checks passed, not that anyone outside checked it.</p>
      ${passport ? "" : `<p>No passport yet for <strong>${esc(params.currentAgent())}</strong>. Create one to see its status here.</p>`}
      <div class="grid">
        ${tile("Status", renderBadgeChip({ status: passport?.status?.label === "INFORMATIONAL" ? "INFO" : passport?.status?.label ?? "UNTRUSTED", badge: passport?.status?.label ?? "UNTRUSTED" }))}
        ${tile("Maturity", esc(`${maturity}/5`))}
        ${tile("Assurance", esc(assurance))}
        ${tile("Value", esc(value))}
        ${tile("Risk avg", esc(riskSummary))}
      </div>
      <div class="row wrap">
        <button id="passportCreateBtn" data-roles="OWNER,OPERATOR">Create a passport for this agent</button>
        <button id="passportExportBtn" class="secondary" data-roles="OWNER,OPERATOR">Save it to a file</button>
        <button id="passportVerifyBtn" class="secondary">Check a passport file</button>
      </div>
      <div id="passportOut" aria-live="polite"></div>
      `
    ),
    params.card(
      "Every agent's passport",
      data.badges.length > 0
        ? data.badges
          .map((row) => `<div class="row wrap"><code>${esc(row.agentId)}</code>${row.label
            ? renderBadgeChip({ status: row.label === "INFORMATIONAL" ? "INFO" : row.label, badge: row.label })
            : '<span class="muted">No passport yet</span>'}</div>`)
          .join("")
        : "<div class='muted'>No agents found.</div>"
    ),
    params.card(
      "Exports",
      data.exports.length > 0
        ? data.exports.map((row) => renderPassportCard(row)).join("")
        : "<div class='muted'>No passport exports yet.</div>"
    )
  ].join("");

  const view = document.getElementById("passportOut");
  const say = (html) => { if (view) view.innerHTML = html; };
  document.getElementById("passportCreateBtn")?.addEventListener("click", async () => {
    await params.apiPost("/passport/create", { scopeType: "AGENT", scopeId: params.currentAgent() });
    await renderPassportPage(params);
  });

  document.getElementById("passportExportBtn")?.addEventListener("click", async (event) => {
    const outFile = await askInline(event.currentTarget, { label: "Save to (a path inside the workspace, ending in .amcpass)",
      value: `.amc/passport/exports/agent/${params.currentAgent()}/manual.amcpass`, submit: "Save",
      check: (text) => text.endsWith(".amcpass") ? null : "The file name must end in .amcpass." });
    if (!outFile) return;
    const out = await params.apiPost("/passport/export", { scopeType: "AGENT", scopeId: params.currentAgent(), outFile });
    say(`<p class="status-ok">Saved to <code>${esc(workspacePath(String(out?.outFile ?? out?.path ?? outFile)))}</code>.</p>${recordDetails(out)}`);
  });

  document.getElementById("passportVerifyBtn")?.addEventListener("click", async (event) => {
    const file = await askInline(event.currentTarget, { label: "Passport file to check (a path inside the workspace)",
      value: `.amc/passport/exports/agent/${params.currentAgent()}/latest.amcpass`, submit: "Check" });
    if (!file) return;
    const out = await params.apiPost("/passport/verify", { file });
    say(`<p class="${out?.ok === false || out?.valid === false ? "status-bad" : "status-ok"}">${out?.ok === false || out?.valid === false
      ? "This file did not pass the check: it was changed, or AMC cannot confirm who signed it." : "The signature checks out: the file is unchanged since it was signed."}</p>${recordDetails(out)}`);
  });
}
