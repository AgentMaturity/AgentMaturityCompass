/**
 * The A4 lifecycle bridge (P1-62 slice B; design §7 item 9, §14.1). `advance` wraps `advanceLifecycleStage` one stage
 * forward only — development → testing and testing → staging after the release (the P1-60 request), staging →
 * production after the deployment approval — with `controlsSatisfied` computed from the LIFECYCLE_BRIDGE rows alone,
 * never typed by a person, and a note naming each control's evidence ref and claim kind, because
 * `lifecycle/state.json` keeps no provenance. A control without a ref refuses the advance with the list; the lifecycle
 * is never moved backwards (`production → deprecated` is its only exit, and a rollback never calls it). In v1
 * `amc_check_status: passed` is unreachable, so `rollback_plan_validated` and `operator_handoff_acknowledged` stay
 * not_evaluated and the agent stays at staging (P2-40).
 */
import { readFileSync } from "node:fs";
import { advanceLifecycleStage, lifecyclePath, lifecycleStages } from "../lifecycle/lifecycle.js";
import type { ClaimKind } from "../claims/eligibility/types.js";
import { latestGate, type A4ReadinessState } from "./a4Readiness.js";
import { stagingBridge } from "./spec/adapt.js";
import { cycleLinks, IDENTITY_NOT_EVALUATED } from "./spec/activate.js";
import { misuseSchema } from "./spec/aspire.js";

export type BridgeTarget = "testing" | "staging" | "production";
/** One control as the release record keeps it (design §14.1 `lifecycle.controls[]`). */
export interface BridgeControl {
  readonly controlId: string;
  readonly status: "satisfied" | "not_evaluated";
  readonly evidenceRef: string | null;
  readonly claimKind: ClaimKind | null;
  readonly satisfiedBy: "a4_bridge" | null;
  readonly reason: string;
}
const CLAIM_KINDS = new Set(["self_reported", "observed", "independently_reviewed", "synthetic_example"]);
const PREVIOUS: Record<BridgeTarget, string> = { testing: "development", staging: "testing", production: "staging" };
const row = (controlId: string, evidenceRef: string | null, claimKind: ClaimKind | null, reason: string): BridgeControl =>
  ({ controlId, status: evidenceRef === null ? "not_evaluated" : "satisfied", evidenceRef, claimKind, satisfiedBy: evidenceRef === null ? null : "a4_bridge", reason });

/** The lifecycle as `lifecycle/state.json` records it, read without writing a default (lifecycleStatus writes one when absent). */
export function lifecycleNow(workspace: string, agentId: string): { stage: string; trail: Array<{ transitionId?: unknown; toStage?: unknown; note?: unknown }> } {
  let text: string;
  try {
    text = readFileSync(lifecyclePath(workspace, agentId), "utf8");
  } catch (error) {
    return { stage: (error as NodeJS.ErrnoException).code === "ENOENT" ? "development" : "unknown", trail: [] };
  }
  try {
    const parsed = JSON.parse(text) as { currentStage?: unknown; transitionTrail?: unknown };
    const stage = typeof parsed.currentStage === "string" && (lifecycleStages as readonly string[]).includes(parsed.currentStage) ? parsed.currentStage : "unknown";
    return { stage, trail: Array.isArray(parsed.transitionTrail) ? parsed.transitionTrail as Array<Record<string, unknown>> : [] };
  } catch {
    return { stage: "unknown", trail: [] };
  }
}

/** The staging rows (src/a4/spec/adapt.ts stagingBridge) in the record's shape; a claim kind outside the four is none. */
const stagingRows = (state: A4ReadinessState): BridgeControl[] => stagingBridge(state).map((entry) => ({ controlId: entry.controlId, status: entry.status,
  evidenceRef: entry.evidenceRef, claimKind: entry.claimKind !== null && CLAIM_KINDS.has(entry.claimKind) ? entry.claimKind as ClaimKind : null,
  satisfiedBy: entry.status === "satisfied" ? "a4_bridge" : null, reason: entry.reason }));

/**
 * The testing rows (design §7 item 9): the consumed Aspire completion gate, the executed non-stub validation Assemble's
 * Review recorded (the evidence staging's integration row reads), and the brief's misuse and failure-modes section.
 */
function testingRows(state: A4ReadinessState): BridgeControl[] {
  const charter = latestGate(state, "aspire", "completion");
  const chartered = charter !== null && state.chain.some((link) => link.kind === "GATE_CONSUMED" && link.body.gateId === charter.gate_id);
  const tests = stagingRows(state).find((entry) => entry.controlId === "integration_tests_passing")!;
  const brief = state.revisions.filter((revision) => revision.stage === "aspire").at(-1);
  const misuse = brief !== undefined && misuseSchema.safeParse((JSON.parse(brief.spec_json) as { misuse?: unknown }).misuse).success;
  return [
    row("owner_charter_defined", chartered ? `gate:${charter!.gate_id}` : null, chartered ? "self_reported" : null,
      chartered ? "Aspire completion gate consumed" : "the Aspire completion gate is not consumed"),
    row("unit_tests_passing", tests.evidenceRef, tests.claimKind, tests.evidenceRef === null ? tests.reason : "every pinned check executed and passed on a non-stub provider"),
    row("risk_assessment_documented", misuse ? `revision:${brief!.revision_no}:${brief!.spec_digest}` : null, misuse ? "self_reported" : null,
      misuse ? "the brief carries a misuse and failure-modes section with mitigations" : "the brief carries no populated misuse and failure-modes section")
  ];
}

/**
 * The production rows; none has a source in v1. `monitoring_slo_enabled` reads monitoring.source's rule: the SLO report
 * is process-wide (it labels no agent and is not limited to the time since the deploy receipt), so a monitor ref's SLO
 * measurements are context and never evidence this agent's SLO monitoring.
 */
function productionRows(state: A4ReadinessState, releaseId: string): BridgeControl[] {
  const deployments = cycleLinks(state.chain, "DEPLOYMENT").filter((link) => link.body.releaseId === releaseId);
  const stagingRollback = deployments.some((link) => link.body.deploymentKind === "rollback" && link.body.environment === "staging");
  return [
    row("assurance_pack_passing", null, null, "no assurance run artifact with a non-inconclusive VALID result is linked to this release (P0-19; the echo scenarios are P2-27)"),
    row("rollback_plan_validated", null, null, stagingRollback ? `rollback recorded by the operator, not checked by AMC: ${IDENTITY_NOT_EVALUATED}`
      : "no staging rollback row is recorded, and AMC's check cannot pass before P2-40"),
    row("monitoring_slo_enabled", null, null, "the SLO report is process-wide: it labels no agent, so no measurement is attributed to this agent's deployment"),
    row("operator_handoff_acknowledged", null, null, deployments.some((link) => link.body.deploymentKind === "deploy")
      ? `the deploy row's AMC check cannot pass before P2-40: ${IDENTITY_NOT_EVALUATED}` : "no deploy row is recorded for this release")
  ];
}

/** The bridge rows for `target`, as the release record keeps them; `controlsSatisfied` is never anything else. */
export function bridgeControls(state: A4ReadinessState, target: BridgeTarget, releaseId: string): BridgeControl[] {
  return target === "testing" ? testingRows(state) : target === "staging" ? stagingRows(state) : productionRows(state, releaseId);
}

export interface BridgeOutcome {
  readonly target: BridgeTarget;
  readonly from: string;
  readonly to: string;
  readonly advanced: boolean;
  readonly transitionId: string | null;
  readonly controls: readonly BridgeControl[];
  readonly missing: readonly string[];
  readonly reason: string | null;
}

/** What `advance` would do from `from` (the lifecycle now unless given), without writing: what a release signs before the bridge runs. */
function bridgePlan(workspace: string, state: A4ReadinessState, target: BridgeTarget, releaseId: string,
  from = lifecycleNow(workspace, state.project.agent_id).stage): BridgeOutcome {
  const controls = bridgeControls(state, target, releaseId);
  const missing = controls.filter((control) => control.status !== "satisfied").map((control) => control.controlId);
  const reason = missing.length > 0 ? `not evaluated, so the lifecycle stays at ${from}: ${missing.join(", ")}`
    : from === PREVIOUS[target] ? null
      : (lifecycleStages as readonly string[]).indexOf(from) >= lifecycleStages.indexOf(target) ? `the lifecycle is at ${from}; the bridge never moves it backwards`
        : `the lifecycle is at ${from}; ${target} follows ${PREVIOUS[target]}`;
  return { target, from, to: reason === null ? target : from, advanced: false, transitionId: null, controls, missing, reason };
}

/**
 * Advances the lifecycle one stage to `target` when every bridge control has a ref (design §7 item 9), else refuses
 * naming the missing ones. A retry finds its own earlier advance (the trail's last move to `target` carrying this
 * revision's bridge note). Never throws: a refusal of `advanceLifecycleStage` is the outcome's reason.
 */
export function advance(workspace: string, state: A4ReadinessState, target: BridgeTarget, releaseId: string): BridgeOutcome {
  const plan = bridgePlan(workspace, state, target, releaseId);
  const prefix = `controls asserted by A4 bridge r${state.project.revision_no}:`;
  const earlier = lifecycleNow(workspace, state.project.agent_id).trail.filter((entry) => entry.toStage === target).at(-1);
  if (plan.from === target && typeof earlier?.note === "string" && earlier.note.startsWith(prefix) && typeof earlier.transitionId === "string") {
    return { ...plan, from: PREVIOUS[target], to: target, advanced: true, transitionId: earlier.transitionId, reason: null };
  }
  if (plan.reason !== null) return plan;
  const note = `${prefix} ${plan.controls.map((control) => `${control.controlId}←${String(control.evidenceRef)} (${String(control.claimKind)})`).join("; ")}`;
  try {
    const result = advanceLifecycleStage({ workspace, agentId: state.project.agent_id, toStage: target, actor: "a4-bridge", actorRole: "deployer",
      controlsSatisfied: plan.controls.map((control) => control.controlId), note });
    return { ...plan, advanced: true, transitionId: result.transition.transitionId };
  } catch (error) {
    return { ...plan, to: plan.from, reason: `advanceLifecycleStage refused: ${(error instanceof Error ? error.message : String(error)).slice(0, 300)}` };
  }
}

/**
 * The release's bridge: development → testing (P1-60's request) when the agent is still at development, then testing →
 * staging, each only on its own rows. `apply: false` plans it for the record the release signs before the bridge runs.
 * The outcome carries both stages' controls.
 */
export function releaseBridge(workspace: string, state: A4ReadinessState, releaseId: string, apply: boolean): BridgeOutcome {
  const now = lifecycleNow(workspace, state.project.agent_id).stage;
  const staging = (from?: string): BridgeOutcome => apply ? advance(workspace, state, "staging", releaseId) : bridgePlan(workspace, state, "staging", releaseId, from);
  if (now !== "development") return staging();
  const testing = apply ? advance(workspace, state, "testing", releaseId) : bridgePlan(workspace, state, "testing", releaseId, now);
  const next = testing.to === "testing" ? staging("testing") : null;
  return { target: "staging", from: now, to: next?.to ?? testing.to, advanced: testing.advanced || next?.advanced === true,
    transitionId: next?.transitionId ?? testing.transitionId, controls: [...testing.controls, ...(next?.controls ?? bridgeControls(state, "staging", releaseId))],
    missing: [...testing.missing, ...(next?.missing ?? [])], reason: next === null ? testing.reason : next.reason };
}

/** The bridge rows the release record carries, in the record's shape. */
export const recordControls = (outcome: BridgeOutcome) => outcome.controls.map((control) => ({ controlId: control.controlId, status: control.status,
  evidenceRef: control.evidenceRef, claimKind: control.claimKind, satisfiedBy: control.satisfiedBy, reason: control.reason }));
