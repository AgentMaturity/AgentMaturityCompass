import { apiGet, apiPost, whoami } from "./api.js";
import { renderEqualizerSliders, collectEqualizerTargets } from "./components/equalizerSliders.js";

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
    status.textContent = "Authentication required.";
    return;
  }
  status.textContent = `Signed in as ${user.username ?? user.userId ?? "user"}`;

  const [targetsEnvelope, gapEnvelope] = await Promise.all([
    apiGet("/mechanic/targets").catch(() => null),
    apiGet("/mechanic/gap?scope=workspace").catch(() => null)
  ]);
  if (!targetsEnvelope?.targets?.mechanicTargets) {
    root.innerHTML = card("Equalizer", "<p class='muted'>Mechanic targets are unavailable.</p>");
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
      "Equalizer Targets (67 Questions)",
      `
      <p class="muted">
        Measured scores are evidence-derived. Target sliders define desired state only.
        Improvement claims require observed/attested evidence after execution checkpoints.
      </p>
      <div class="row wrap">
        <input id="targetsReason" placeholder="Reason for target update" />
        <button id="targetsApplyBtn">Apply Targets</button>
        <button id="targetsExcellenceBtn" class="secondary">Set Excellence (All 5)</button>
      </div>
      <div id="equalizerRows" class="scroll" style="max-height:520px;"></div>
      <pre id="equalizerOut" class="muted"></pre>
    `
    )}
  `;

  const rowsEl = document.getElementById("equalizerRows");
  const out = document.getElementById("equalizerOut");
  renderEqualizerSliders(rowsEl, rows);

  document.getElementById("targetsExcellenceBtn")?.addEventListener("click", () => {
    rowsEl?.querySelectorAll("input[type=range][data-qid]").forEach((input) => {
      input.value = "5";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  });

  document.getElementById("targetsApplyBtn")?.addEventListener("click", async () => {
    const reason = document.getElementById("targetsReason")?.value?.trim() || "";
    if (!reason) {
      out.textContent = "Reason is required by locking policy.";
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
      out.textContent = JSON.stringify(applied, null, 2);
    } catch (error) {
      out.textContent = String(error);
    }
  });
}

void main();
