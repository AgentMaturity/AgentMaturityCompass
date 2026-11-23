import { apiGet, apiPost, applyRoleGates, showSignIn, whoami } from "./api.js";
import { recordDetails } from "./pageKit.js";
import { plainErrorText } from "./plainError.js";
import { renderPlanTimeline } from "./components/planTimeline.js";
import { renderHandholdingSteps } from "./components/handholdingSteps.js";

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

async function latestPlan() {
  const latest = await apiGet("/mechanic/plan/latest").catch(() => null);
  return latest?.plan?.planId ? latest.plan : null;
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

  // Opening the page only reads the latest plan (C-01); making one writes a signed record, so it is a button.
  const plan = await latestPlan();
  if (!plan) {
    root.innerHTML = card("Upgrade plan", `<p>No upgrade plan yet. A plan compares your latest score with your target levels and lists the steps between them.</p>
      <div class="row wrap"><button id="makePlanBtn" data-roles="OWNER,OPERATOR">Make an upgrade plan</button></div>`);
    applyRoleGates(root);
    document.getElementById("makePlanBtn")?.addEventListener("click", async () => {
      await apiPost("/mechanic/plan/create", { scopeType: "WORKSPACE", scopeId: "workspace" });
      await main();
    });
    return;
  }
  root.innerHTML = `
    ${card(
      "Upgrade plan",
      `
      <p class="muted">
        The plan lists the steps from your latest score to your target levels. Its steps change signed settings only after
        the approvals they need.
      </p>
      <div class="grid">
        <div><div class="muted">Plan made</div><div class="tile-value">${plan.generatedTs ? esc(new Date(plan.generatedTs).toLocaleString()) : "-"}</div></div>
        <div><div class="muted">Readiness</div><div class="tile-value">${esc(plan.summary?.readiness || "UNKNOWN")}</div></div>
        <div><div class="muted">Gap Points</div><div class="tile-value">${Number(plan.summary?.gapPointsTotal || 0).toFixed(2)}</div></div>
        <div><div class="muted">Unknown Questions</div><div class="tile-value">${Number(plan.summary?.unknownQuestionsCount || 0)}</div></div>
      </div>
      <div class="row wrap">
        <label><span class="muted">Why these changes (for the approvers)</span><input id="approvalReason" /></label>
        <button id="requestApprovalBtn" data-roles="OWNER,OPERATOR">Request approvals</button>
        <button id="executePlanBtn" data-roles="OWNER,OPERATOR">Carry out the plan</button>
      </div>
      <div id="wizardOut" aria-live="polite"></div>
      ${recordDetails(plan)}
    `
    )}
    ${card("Plan Timeline", `<div id="planTimeline"></div>`)}
    ${card("Guided Steps", `<div id="wizardSteps"></div>`)}
  `;

  applyRoleGates(root);
  renderPlanTimeline(document.getElementById("planTimeline"), plan);
  renderHandholdingSteps(document.getElementById("wizardSteps"), [
    { title: "Instrumentation", body: "Verify bridge/tool receipts and evidence coverage before changing autonomy posture." },
    { title: "Governance", body: "Request dual-control approvals for SECURITY/GOVERNANCE actions." },
    { title: "Capabilities", body: "Apply deterministic interventions and collect expected evidence checkpoints." },
    { title: "Checkpoint", body: "Run forecast and bench checkpoints to assess measured impact." }
  ]);

  const out = document.getElementById("wizardOut");
  document.getElementById("requestApprovalBtn")?.addEventListener("click", async () => {
    const reason = document.getElementById("approvalReason")?.value?.trim() || "";
    if (!reason) {
      out.innerHTML = `<p class="status-bad" role="alert">Say why, so the approvers know what they are approving.</p>`;
      return;
    }
    try {
      const requested = await apiPost("/mechanic/plan/request-approval", {
        planId: plan.planId,
        reason
      });
      out.innerHTML = `<p class="status-ok">Approvals requested. They are listed on the <a href="./approvals">Approvals</a> page.</p>${recordDetails(requested)}`;
    } catch (error) {
      out.innerHTML = `<p class="status-bad" role="alert">${esc(plainErrorText(error))}</p>`;
    }
  });

  document.getElementById("executePlanBtn")?.addEventListener("click", async () => {
    try {
      const executed = await apiPost("/mechanic/plan/execute", {
        planId: plan.planId
      });
      out.innerHTML = `<p class="status-ok">Finished. Each step and its result are in the record below.</p>${recordDetails(executed)}`;
    } catch (error) {
      out.innerHTML = `<p class="status-bad" role="alert">${esc(plainErrorText(error))}</p>`;
    }
  });
}

void main();

