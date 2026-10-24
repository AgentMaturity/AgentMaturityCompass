/** Actual mechanic analysis publication. Diagnostic production remains its own inherited upstream operation. */
import { join, relative } from "node:path";
import YAML from "yaml";
import { runAutoAnswer } from "../diagnostic/autoAnswer/autoAnswerEngine.js";
import { captureOrgPairs, prepareOrgPairsAsync } from "../org/preparedOrgPairs.js";
import { sha256Hex } from "../utils/hash.js";
import { captureMechanicPair, requireMechanicPair } from "./mechanicPairs.js";
import { captureMechanicRun, mechanicProgress, mechanicFailed, appendMechanicEntry } from "./mechanicPublication.js";
import { mechanicRoot, mechanicTargetsPath, prepareInitialMechanicTargets } from "./targetsStore.js";
import { mechanicTargetsSchema, type MechanicScope } from "./targetSchema.js";
import { captureMechanicAnalysisCgx, captureMechanicGap, captureMechanicEta } from "./mechanicAnalysisInputs.js";
import { captureMechanicAnalysisBankAttempt } from "./mechanicAnalysisBank.js";
import { captureMechanicAnalysisCanon } from "./mechanicAnalysisCanon.js";
import { assembleMechanicUpgradePlan } from "./upgradePlanner.js";
import { captureMechanicPlanSelection, prepareMechanicPlan } from "./planStore.js";
import { calculateMechanicSimulation, mechanicSimulationPath, prepareMechanicSimulation } from "./simulator.js";

type ScopeParams = { workspace: string; scopeType?: "WORKSPACE" | "NODE" | "AGENT"; scopeId?: string };
type Run = ReturnType<typeof captureMechanicRun>;
type Progress = ReturnType<typeof mechanicProgress>;
function scope(input: ScopeParams): MechanicScope {
  const raw = String(input.scopeType ?? "WORKSPACE").toUpperCase(), type = raw === "AGENT" || raw === "NODE" ? raw : "WORKSPACE";
  return { type, id: (input.scopeId ?? (type === "WORKSPACE" ? "workspace" : "default")).trim() || (type === "WORKSPACE" ? "workspace" : "default") };
}
function completed(workspace: string, saved: { path: string; sigPath: string }, state: Progress) {
  state.completed.push(relative(workspace, saved.path), relative(workspace, saved.sigPath));
}
function existingTargets(workspace: string) {
  const selected = captureMechanicPair(workspace, mechanicTargetsPath(workspace), "mechanic targets missing");
  if (selected.bytes === null) { if (selected.hasSidecar) throw new Error("mechanic targets sidecar has no body; initialization refuses replacement"); return null; }
  const bytes = Buffer.from(requireMechanicPair(selected)), targets = mechanicTargetsSchema.parse(YAML.parse(bytes.toString("utf8")) as unknown);
  return { targets, bytes, assertCurrent: selected.assertCurrent };
}
async function initializeTargets(workspace: string, run: Run, state: Progress) {
  const selected = captureMechanicPair(workspace, mechanicTargetsPath(workspace), "mechanic targets missing");
  if (selected.bytes !== null || selected.hasSidecar) throw new Error("mechanic targets appeared before initialization; retry");
  state.phase = "initial-targets"; state.entryHash = null; state.pendingRecorded = null; run.assertCurrent();
  // Preserve the actual loadMechanicTargets cold default, even for an agent/node analysis request.
  const prepared = await prepareInitialMechanicTargets({ workspace, scope: { type: "WORKSPACE", id: "workspace" }, mode: "DESIRED" }, {
    beforePublish() { run.beforePublish(); run.fixed(); }, assertInputsCurrent() { selected.assertCurrent(); run.fixed(); }
  }, selected.before);
  const saved = prepared.publish(); completed(workspace, saved, state);
  const bytes = Buffer.from(prepared.bytes), targets = mechanicTargetsSchema.parse(YAML.parse(bytes.toString("utf8")) as unknown);
  return { targets, bytes, assertCurrent: prepared.assertCurrent };
}
async function measure(workspace: string, selectedScope: MechanicScope, run: Run, state: Progress) {
  state.phase = "diagnostic-measurement"; state.entryHash = null; state.pendingRecorded = null; run.assertCurrent();
  const produced = await runAutoAnswer({ workspace, agentId: selectedScope.type === "AGENT" ? selectedScope.id : "default", createPlan: false }, { beforePublish: run.assertCurrent });
  state.completed.push(`diagnostic-run:${produced.runId}`); run.assertCurrent(); return structuredClone(produced);
}
async function gap(params: ScopeParams, selectedScope: MechanicScope, run: Run, state: Progress) {
  const measured = await measure(params.workspace, selectedScope, run, state);
  // The original gap API selects/initializes targets AFTER measurement, unlike the upgrade planner.
  const selected = existingTargets(params.workspace) ?? await initializeTargets(params.workspace, run, state);
  run.assertCurrent();
  const calculated = captureMechanicGap({ workspace: params.workspace, scope: selectedScope, targets: selected.targets, measured });
  const report = calculated.gap, path = join(mechanicRoot(params.workspace), "reports", `gap_${report.generatedTs}.json`);
  const bytes = Buffer.from(`${JSON.stringify(report, null, 2)}\n`, "utf8");
  state.phase = "gap-report"; state.entryHash = null; state.pendingRecorded = null;
  const prepared = await prepareOrgPairsAsync(params.workspace, [{ path, bytes }], {
    beforePublish() { run.beforePublish(); run.fixed(); }, assertInputsCurrent() { selected.assertCurrent(); calculated.assertCurrent(); run.fixed(); }
  });
  const saved = prepared.publish()[0]!; completed(params.workspace, saved, state);
  return { result: { gap: report, measured, ...saved }, assertCurrent() { run.beforePublish(); prepared.assertCurrent(); run.fixed(); } };
}
/** Internal retained publication handle for the real CLI output suffix and the simulation dependency. */
export async function mechanicGapForPublication(input: ScopeParams, beforePublish: () => void) {
  const params = { ...input }, selectedScope = scope(params), run = captureMechanicRun(params.workspace, beforePublish), state = mechanicProgress();
  try {
    const published = await gap(params, selectedScope, run, state);
    return { ...published, failOutput(cause: unknown): never { state.phase = "cli-output"; state.entryHash = null; state.pendingRecorded = null; return mechanicFailed(state, cause); } };
  } catch (cause) { mechanicFailed(state, cause); }
}
export async function mechanicGapForAuthority(input: ScopeParams, beforePublish: () => void) {
  return (await mechanicGapForPublication(input, beforePublish)).result;
}
export async function mechanicCreatePlanForAuthority(input: ScopeParams, beforePublish: () => void) {
  const params = { ...input }, selectedScope = scope(params), run = captureMechanicRun(params.workspace, beforePublish), state = mechanicProgress();
  const bankAttempt = captureMechanicAnalysisBankAttempt(params.workspace), canon = captureMechanicAnalysisCanon(params.workspace);
  try {
    // Preserve the actual planner's targets/bank/canon pre-measurement construction stages.
    const selected = existingTargets(params.workspace) ?? await initializeTargets(params.workspace, run, state);
    state.phase = "initial-bank";
    const bank = await bankAttempt.initialize({ beforePublish: run.assertCurrent, assertInputsCurrent() { selected.assertCurrent(); canon.assertCurrent(); run.fixed(); } });
    state.completed.push(...bank.completedPaths.map(path => relative(params.workspace, path)));
    selected.assertCurrent(); canon.assertCurrent(); run.assertCurrent();
    const measured = await measure(params.workspace, selectedScope, run, state);
    const calculated = captureMechanicGap({ workspace: params.workspace, scope: selectedScope, targets: selected.targets, measured });
    const used: { cgx?: ReturnType<typeof captureMechanicAnalysisCgx>; eta?: ReturnType<typeof captureMechanicEta> } = {};
    const created = assembleMechanicUpgradePlan({ workspace: params.workspace, scopeType: selectedScope.type, scopeId: selectedScope.id }, {
      targets: selected.targets, bank: bank.bank, canon: canon.canon, measured, gap: calculated.gap, targetsSha: sha256Hex(selected.bytes),
      cgxHash() { used.cgx = captureMechanicAnalysisCgx(params.workspace, selectedScope.type === "AGENT" ? selectedScope.id : "default"); return used.cgx.hash; },
      eta() { used.eta = captureMechanicEta(params.workspace); return used.eta.eta; }
    });
    if (used.cgx === undefined || used.eta === undefined) throw new Error("mechanic plan did not select its actual CGX/ETA inputs");
    const selectedCgx = used.cgx, selectedEta = used.eta, questionIds = created.plan.perQuestionPlan.map(row => row.qId);
    state.phase = "plan-pairs"; state.entryHash = null; state.pendingRecorded = null;
    const prepared = await prepareMechanicPlan(params.workspace, created.plan, {
      beforePublish() { run.beforePublish(); run.fixed(); }, assertInputsCurrent() {
        selected.assertCurrent(); bank.assertCurrent(questionIds); canon.assertCurrent(); calculated.assertCurrent(); selectedCgx.assertCurrent(); selectedEta.assertCurrent(); run.fixed();
      }
    });
    const saved = prepared.publish(); state.completed.push(...[saved.latestPath, saved.latestSigPath, saved.snapshotPath, saved.snapshotSigPath].map(path => relative(params.workspace, path)));
    const bytes = Buffer.from(`${JSON.stringify(created.plan, null, 2)}\n`, "utf8");
    const transparencyHash = await appendMechanicEntry(params.workspace, { type: "MECHANIC_PLAN_CREATED", agentId: selectedScope.id,
      artifact: { kind: "policy", sha256: sha256Hex(bytes), id: created.plan.planId } }, run, prepared.assertCurrent, state);
    run.beforePublish(); prepared.assertCurrent(); run.fixed(); return { ...created, ...saved, transparencyHash };
  } catch (cause) { mechanicFailed(state, cause); }
}
export async function mechanicSimulateForAuthority(input: { workspace: string; planId: string }, beforePublish: () => void) {
  const params = { ...input }, run = captureMechanicRun(params.workspace, beforePublish), state = mechanicProgress();
  const selected = captureMechanicPlanSelection(params.workspace, params.planId), before = captureOrgPairs([mechanicSimulationPath(params.workspace)]);
  try {
    const analyzed = await gap({ workspace: params.workspace, scopeType: selected.plan.scope.type, scopeId: selected.plan.scope.id }, selected.plan.scope, run, state);
    selected.assertCurrent(); run.assertCurrent();
    const simulation = calculateMechanicSimulation({ workspace: params.workspace, plan: selected.plan,
      integrityIndex: analyzed.result.gap.global.integrityIndex, correlationRatio: analyzed.result.gap.global.correlationRatio });
    state.phase = "simulation-pair"; state.entryHash = null; state.pendingRecorded = null;
    const prepared = await prepareMechanicSimulation(params.workspace, simulation, {
      beforePublish() { run.beforePublish(); run.fixed(); }, assertInputsCurrent() { selected.assertCurrent(); analyzed.assertCurrent(); run.fixed(); }
    }, before);
    const saved = prepared.publish(); completed(params.workspace, saved, state);
    const transparencyHash = await appendMechanicEntry(params.workspace, { type: "MECHANIC_SIMULATION_CREATED", agentId: selected.plan.scope.id,
      artifact: { kind: "policy", sha256: sha256Hex(prepared.bytes), id: simulation.simulationId } }, run,
      () => { selected.assertCurrent(); analyzed.assertCurrent(); prepared.assertCurrent(); }, state);
    run.beforePublish(); prepared.assertCurrent(); run.fixed(); return { simulation, ...saved, transparencyHash };
  } catch (cause) { mechanicFailed(state, cause); }
}
