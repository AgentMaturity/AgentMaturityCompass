import { apiGet, apiPost, showSignIn, whoami } from "./api.js";
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

async function ensurePlan() {
  const latest = await apiGet("/mechanic/plan/latest").catch(() => null);
  if (latest?.plan?.planId) {
    return latest.plan;
  }
  const created = await apiPost("/mechanic/plan/create", {
    scopeType: "WORKSPACE",
    scopeId: "workspace"
  });
  return created.plan;
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

  const plan = await ensurePlan();
  root.innerHTML = `
    ${card(
      "Upgrade Wizard",
      `
      <p class="muted">
        Compass-over-maps workflow: the plan is deterministic and evidence-bound. Actions update real signed configs only
        after governance approvals.
      </p>
      <div class="grid">
        <div><div class="muted">Plan</div><div class="tile-value">${esc(plan.planId)}</div></div>
        <div><div class="muted">Readiness</div><div class="tile-value">${esc(plan.summary?.readiness || "UNKNOWN")}</div></div>
        <div><div class="muted">Gap Points</div><div class="tile-value">${Number(plan.summary?.gapPointsTotal || 0).toFixed(2)}</div></div>
        <div><div class="muted">Unknown Questions</div><div class="tile-value">${Number(plan.summary?.unknownQuestionsCount || 0)}</div></div>
      </div>
      <div class="row wrap">
        <input id="approvalReason" placeholder="Approval request reason" />
        <button id="requestApprovalBtn">Request Approvals</button>
        <button id="executePlanBtn">Execute Plan</button>
      </div>
      <pre id="wizardOut" class="scroll muted"></pre>
    `
    )}
    ${card("Plan Timeline", `<div id="planTimeline"></div>`)}
    ${card("Guided Steps", `<div id="wizardSteps"></div>`)}
  `;

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
      out.textContent = "Reason is required.";
      return;
    }
    try {
      const requested = await apiPost("/mechanic/plan/request-approval", {
        planId: plan.planId,
        reason
      });
      out.textContent = JSON.stringify(requested, null, 2);
    } catch (error) {
      out.textContent = String(error);
    }
  });

  document.getElementById("executePlanBtn")?.addEventListener("click", async () => {
    try {
      const executed = await apiPost("/mechanic/plan/execute", {
        planId: plan.planId
      });
      out.textContent = JSON.stringify(executed, null, 2);
    } catch (error) {
      out.textContent = String(error);
    }
  });
}

void main();

