// Home's own pieces (studio-ui lane): the greeting with its three ways in, "Waiting for you", and the first-steps route.
// app.js renders them; a4.js adds its approval tile to "Waiting for you". Words are short on purpose: everything longer
// stays one click away under "more info".
import { emptyState, esc, pictureCard, routeTrack } from "./pageKit.js";
import { icon } from "./iconSet.js";
import { primaryActionHref, primaryActionLabel } from "./shell.js";

/** The greeting and the three ways in: build an agent, run a task, check my agent. */
export function homeStartHtml({ agentId = "default", demoMode = false } = {}) {
  return `<h2 id="homeGreeting">What would you like to do?</h2>
    <p>Build an agent, give it a task, or see how it is doing.</p>
    <div class="picture-grid">
      ${pictureCard({ id: "homeBuildTile", href: "./a4", pictureName: "build", title: "Build an agent", line: "Step by step, with approvals." })}
      ${pictureCard({ id: "homeRunTile", href: primaryActionHref(agentId), pictureName: "run", title: demoMode ? primaryActionLabel(true) : "Run a task", line: "Ask your agent to do something." })}
      ${pictureCard({ id: "homeCheckTile", href: `./agent?agent=${encodeURIComponent(agentId)}`, pictureName: "check", title: "Check my agent", line: "Its score and what to fix." })}
    </div>`;
}

/**
 * The approvals inbox's tile under "Waiting for you": how many requests wait, with the way to them. `count` is null when
 * this person cannot decide approvals or AMC could not tell, and then there is no tile.
 */
export function approvalsTileHtml(count) {
  if (count === null || count === undefined) return "";
  if (count === 0) return emptyState({ line: "No approval requests are open." });
  return `<div class="wait-tile">${icon("approvals", { size: 24 })}<div class="wait-tile-words"><strong>${count === 1 ? "1 approval request is open" : `${esc(count)} approval requests are open`}</strong>`
    + `<span>Someone must approve or decline before the work goes on.</span></div><a class="button secondary" href="./approvals">Open approvals</a></div>`;
}

/** Shows "Waiting for you" once it holds something, and drops its empty state when a tile arrived. */
export function syncWaiting(doc = document) {
  const section = doc.getElementById("homeWaiting");
  if (!section) return;
  const tiles = section.querySelectorAll(".wait-tile").length;
  if (tiles > 0) for (const empty of section.querySelectorAll(".empty-state")) empty.remove();
  section.hidden = tiles === 0 && section.querySelectorAll(".empty-state").length === 0;
}

const MILESTONE_LABELS = { connected_agent: "Connect", observed_action: "First action", control_decision: "Control on", signed_proof: "Signed record" };

/** The four first steps (connect, a first action, control, a signed record) as a route, from the activation status. */
export function activationRouteHtml(activation) {
  const rows = Array.isArray(activation?.milestones) && activation.milestones.length > 0 ? activation.milestones
    : Object.keys(MILESTONE_LABELS).map((id) => ({ id, status: "WAITING" }));
  const next = rows.findIndex((row) => row?.status !== "COMPLETE");
  return routeTrack(rows.map((row, at) => ({
    label: MILESTONE_LABELS[row.id] ?? row.label ?? "Step",
    hint: row.label || "",
    state: row.status === "COMPLETE" ? "done" : row.status === "BLOCKED" ? "stop" : at === next ? "now" : "todo"
  })), { label: "First steps" });
}
