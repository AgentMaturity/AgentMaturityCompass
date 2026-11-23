import { apiGet, apiPost, applyRoleGates, showSignIn, whoami } from "./api.js";
import { renderEqualizerSliders, collectEqualizerTargets } from "./components/equalizerSliders.js";
import { moreInfo, recordDetails } from "./pageKit.js";
import { plainErrorText } from "./plainError.js";

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function card(title, body) {
  return `<section class="card"><h3>${esc(title)}</h3>${body}</section>`;
}

async function main() {
  const status = document.getElementById("status");
  const root = document.getElementById("app");
  const user = await whoami().catch(() => null);
  if (!user) {
    showSignIn(status);
    return;
  }
  status.textContent = `Signed in as ${user.username ?? user.userId ?? "user"}`;

  const [targetsEnvelope, gapEnvelope] = await Promise.all([
    apiGet("/mechanic/targets").catch(() => null),
    apiGet("/mechanic/gap?scope=workspace").catch((error) => (error?.status === 404 ? null : { refused: plainErrorText(error) }))
  ]);
  if (!targetsEnvelope?.targets?.mechanicTargets) {
    root.innerHTML = card("Target levels", "<p>The target levels could not be read. Refresh the page; if this stays, run amc mechanic targets in the workspace folder to see why.</p>");
    return;
  }
  const targets = targetsEnvelope.targets.mechanicTargets;
  const gapRows = Array.isArray(gapEnvelope?.gap?.perQuestion) ? gapEnvelope.gap.perQuestion : [];
  const rows = gapRows.length > 0
    ? gapRows.map((row) => ({ ...row, desired: targets.targets[row.qId] ?? row.desired }))
    : Object.keys(targets.targets)
        .sort((a, b) => a.localeCompare(b))
        .map((qId) => ({
          qId,
          measured: 0,
          desired: targets.targets[qId],
          gap: targets.targets[qId],
          status: "UNKNOWN",
          reasons: ["no measured score available"],
          evidenceCoverage: 0
        }));

  root.innerHTML = `
    ${card(
      "Target levels",
      `
      <p class="muted">Set the level you want for each question.</p>
      ${moreInfo("What the sliders change", `<p>Measured levels come from your agent's records. The sliders set the level you want; they change nothing about the
        agent. A higher measured level needs new records after the work is done.</p>`)}
      ${gapEnvelope?.refused ? `<p role="alert">${esc(gapEnvelope.refused)} Every measured level shows 0 until then.</p>`
        : gapEnvelope ? "" : "<p>No score yet, so every measured level shows 0. Run a score (amc run in the workspace folder) to fill them in.</p>"}
      <div class="row wrap">
        <label><span class="muted">Why you are changing the targets (required)</span><input id="targetsReason" maxlength="500" /></label>
        <button id="targetsApplyBtn" data-roles="OWNER">Save target levels</button>
        <button id="targetsExcellenceBtn" class="secondary">Set every slider to 5</button>
      </div>
      <div id="equalizerOut" aria-live="polite"></div>
      <div id="equalizerRows" class="scroll" style="max-height:520px;"></div>
    `
    )}
  `;

  const rowsEl = document.getElementById("equalizerRows");
  const out = document.getElementById("equalizerOut");
  renderEqualizerSliders(rowsEl, rows);

  const say = (html) => { out.innerHTML = html; };
  document.getElementById("targetsExcellenceBtn")?.addEventListener("click", () => {
    rowsEl?.querySelectorAll("input[type=range][data-qid]").forEach((input) => {
      input.value = "5";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    say(`<p class="muted" role="status">Every slider is at 5 on this page. Nothing is saved until you give a reason and press Save target levels.</p>`);
  });

  applyRoleGates(root);
  document.getElementById("targetsApplyBtn")?.addEventListener("click", async () => {
    const reason = document.getElementById("targetsReason")?.value?.trim() || "";
    if (reason.length < 4) {
      say(`<p class="status-bad" role="alert">Say why you are changing the targets (a few words). The reason is kept with the signed targets.</p>`);
      document.getElementById("targetsReason")?.focus();
      return;
    }
    const mapping = collectEqualizerTargets(rowsEl);
    try {
      const next = {
        mechanicTargets: {
          ...targets,
          targets: mapping
        }
      };
      const applied = await apiPost("/mechanic/targets/apply", {
        targets: next,
        reason
      });
      say(`<p class="status-ok" role="status">Saved and signed at ${esc(new Date().toLocaleTimeString())}.</p>${recordDetails(applied)}`);
    } catch (error) {
      say(`<p class="status-bad" role="alert">${esc(plainErrorText(error))}</p>`);
    }
  });
}

void main();
