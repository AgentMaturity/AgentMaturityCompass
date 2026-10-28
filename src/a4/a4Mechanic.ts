/**
 * The Mechanic write link beyond the v1 TUNE seed (P2-37; design §6.6). A TUNE may name a mechanic upgrade plan
 * (`createMechanicUpgradePlan`); execution stays the mechanic's (`executeMechanicPlan`, its own approvals and
 * transparency log), and A4 never runs a mechanic action. Two things are added here:
 *   - the TUNE seed is checked: the plan exists, its signed pair verifies under this workspace's auditor key, and its
 *     scope is this project's agent (MECHANIC_PLAN_*), before the TUNE names it;
 *   - POST …/mechanic/attach { planId } (owner) attaches the executed plan's results as a ref: a signed A4 record
 *     (`a4-stage-output`, under a4-releases/<project>/mechanic/<baseRelease>/) of the plan file's sha256 and each
 *     action's stated status, recorded self_reported in the implementation lane. The mechanic states those results; A4
 *     re-reads the signed plan, it does not observe the actions.
 * The mechanic's phases are its own vocabulary (`phaseId`s of its plan), never A4 stages: each is recorded as
 * `mechanic:<phaseId>` with `a4Stage: null`, whatever the id spells.
 */
import { randomBytes } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { apiSuccess } from "../api/apiHelpers.js";
import { verifyMechanicPair } from "../mechanic/mechanicPairs.js";
import { mechanicRoot } from "../mechanic/targetsStore.js";
import { mechanicPlanSchema, type MechanicUpgradePlan } from "../mechanic/upgradePlanSchema.js";
import { sha256Hex } from "../utils/hash.js";
import { writeReleaseRecord } from "./a4Package.js";
import { a4Fail, mutationResult, precheck, priorReplay, readJson, requirePrincipal, type A4Route } from "./a4Router.js";
import type { A4ReadinessState } from "./a4Readiness.js";
import { relPath } from "./stages/common.js";

const MECHANIC_RESULT_PURPOSE = "mechanic_result";
const RESULT_SCHEMA = "amc.a4-mechanic-result/v1";
const MECHANIC_BOUNDARY = "The mechanic executed this plan under its own approvals; A4 records the results the signed plan states (self-reported). Mechanic phases are not A4 stages.";

/** The mechanic's phases as A4 records them: its own vocabulary, prefixed, never mapped onto an A4 stage. */
export function mechanicPhaseView(plan: Pick<MechanicUpgradePlan, "phases">) {
  return plan.phases.map((phase) => ({ mechanicPhase: `mechanic:${phase.phaseId}`, a4Stage: null, goal: phase.goal,
    actions: phase.actions.map((action) => ({ id: action.id, kind: action.kind, executionStatus: action.executionStatus, executedTs: action.executedTs ?? null })) }));
}

/** Whether the mechanic ran the plan: some action left PENDING (executed, failed or skipped). */
export const mechanicPlanExecuted = (plan: Pick<MechanicUpgradePlan, "phases">): boolean =>
  plan.phases.some((phase) => phase.actions.some((action) => action.executionStatus !== "PENDING"));

/**
 * The signed mechanic plan `planId`, its file and the exact bytes read: latest.json first, then the snapshots. The pair
 * must verify (verifyMechanicPair) and the bytes read again must be the bytes parsed, else MECHANIC_PLAN_UNVERIFIED.
 */
export function readSignedMechanicPlan(workspace: string, planId: string, agentId: string): { path: string; sha256: string; plan: MechanicUpgradePlan } {
  const dir = join(mechanicRoot(workspace), "plans");
  let snapshots: string[] = [];
  try {
    snapshots = readdirSync(join(dir, "snapshots")).filter((name) => name.endsWith(".json")).sort((a, b) => b.localeCompare(a)).map((name) => join(dir, "snapshots", name));
  } catch { /* no snapshots */ }
  for (const path of [join(dir, "latest.json"), ...snapshots]) {
    let bytes: Buffer;
    try {
      bytes = readFileSync(path);
    } catch {
      continue;
    }
    const parsed = mechanicPlanSchema.safeParse((() => { try { return JSON.parse(bytes.toString("utf8")) as unknown; } catch { return null; } })());
    if (!parsed.success || parsed.data.planId !== planId) continue;
    const pair = verifyMechanicPair(workspace, path, "plan missing");
    let again: Buffer | null = null;
    try { again = readFileSync(path); } catch { /* reported below */ }
    if (!pair.valid || again === null || sha256Hex(again) !== sha256Hex(bytes)) {
      throw a4Fail(409, "MECHANIC_PLAN_UNVERIFIED", `The mechanic plan ${planId} is not signed by this workspace's auditor key, or changed while read (${pair.reason ?? "changed"}).`);
    }
    if (parsed.data.scope.type !== "AGENT" || parsed.data.scope.id !== agentId) {
      throw a4Fail(409, "MECHANIC_PLAN_OTHER_SCOPE", `The mechanic plan ${planId} is scoped to ${parsed.data.scope.type} ${parsed.data.scope.id}, not this project's agent.`);
    }
    return { path, sha256: sha256Hex(bytes), plan: parsed.data };
  }
  throw a4Fail(404, "MECHANIC_PLAN_NOT_FOUND", `No mechanic plan ${planId} in this workspace.`);
}

/** The project's latest TUNE, which must have named `planId` as its seed. */
function seedingTune(state: A4ReadinessState, planId: string) {
  const tune = [...state.chain].reverse().find((link) => link.kind === "TUNE");
  if (tune === undefined || tune.body.mechanicPlanId !== planId) {
    throw a4Fail(409, "MECHANIC_PLAN_NOT_SEEDED", "Only the plan the project's latest TUNE was seeded from attaches; tune from it first.");
  }
  return { seq: tune.seq, baseReleaseId: String(tune.body.baseReleaseId) };
}

const attachSchema = z.strictObject({ planId: z.string().min(1).max(200), expectedHeadSeq: z.number().int().min(0),
  clientRequestId: z.string().regex(/^[A-Za-z0-9_-]{8,128}$/) });

/** POST …/mechanic/attach (owner): the executed seed plan's results as a signed, self-reported A4 ref. */
async function attach(route: A4Route, projectId: string): Promise<true> {
  const principal = requirePrincipal(route);
  const { body, request } = await readJson(route, attachSchema);
  const replay = priorReplay(route.store, request, projectId);
  if (replay) return (apiSuccess(route.res, replay), true);
  const state = precheck(route, projectId, "tune", body.expectedHeadSeq);
  const tune = seedingTune(state, body.planId);
  const read = readSignedMechanicPlan(route.workspace, body.planId, state.project.agent_id);
  if (!mechanicPlanExecuted(read.plan)) throw a4Fail(409, "MECHANIC_PLAN_NOT_EXECUTED", "The mechanic has not executed this plan; run it there (amc mechanic execute), then attach.");
  if (state.chain.some((link) => link.kind === "EVIDENCE_REF" && link.body.purpose === MECHANIC_RESULT_PURPOSE && link.body.planSha256 === read.sha256)) {
    throw a4Fail(409, "MECHANIC_RESULT_RECORDED", "These plan results are already attached.");
  }
  const doc = { schema: RESULT_SCHEMA, projectId, tuneSeq: tune.seq, baseReleaseId: tune.baseReleaseId, planId: body.planId,
    planFile: relPath(route.workspace, read.path), planSha256: read.sha256, planSignature: "verified (workspace auditor key)", phases: mechanicPhaseView(read.plan),
    claimKind: "self_reported", claimBoundary: MECHANIC_BOUNDARY };
  const written = writeReleaseRecord(route.workspace, projectId, "mechanic", tune.baseReleaseId, `a4mech_${randomBytes(16).toString("hex")}`, doc, "a4-stage-output");
  const result = route.store.addEvidenceRef(projectId, { actor: principal, refKind: "stage_output", refId: written.path, sha256: written.sha256,
    claimKind: "self_reported", method: null, column: "implementation", expectedHeadSeq: body.expectedHeadSeq, request,
    label: `mechanic results of plan ${body.planId} (executed by the mechanic; self-reported)`,
    note: { purpose: MECHANIC_RESULT_PURPOSE, planId: body.planId, planSha256: read.sha256, tuneSeq: tune.seq } });
  apiSuccess(route.res, mutationResult(result, { mechanic: { record: written.path, phases: doc.phases.length } }), 201);
  return true;
}

/** The mechanic POST routes; false when none matches. */
export async function handleMechanicRoute(route: A4Route, projectId: string, tail: string): Promise<boolean> {
  if (tail !== "/mechanic/attach") return false;
  return attach(route, projectId);
}
