import { closeSync, constants, fstatSync, mkdtempSync, openSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import { z } from "zod";
import { casebookContentSha256 } from "../casebooks/casebookStore.js";
import { resolveAgentId } from "../fleet/paths.js";
import type { FixerEvidenceClass } from "../mechanic/fixerRca.js";
import type { SessionService } from "../session/sessionService.js";
import { ensureDir, writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import { experimentHoldout, runExecutedExperimentAsync, type ExecutedTrialOptions } from "./executedExperiment.js";
import { evaluateExperimentGate } from "./experimentGatePolicy.js";
import { createExperiment, loadExperiment, setExperimentBaseline, setExperimentLoopCandidate, workspaceConfigFile } from "./experimentRunner.js";
import type { ExperimentGatePolicy } from "./experimentSchema.js";
import { improvementJournal, type ImprovementJournal } from "./improvementJournal.js";

/**
 * Bounded recursive improvement (GAP-WP08): per round, each proposal is edited in a fresh attempt workspace from the
 * round's parent, the harvested candidate is executed against the pinned baseline over the experiment's held-out cases
 * (WP04/WP09) in an experiment the loop creates for itself, so the operator's definition is never rewritten. Candidates
 * are model output: they are never auditor-signed, and only this loop, holding the digest from its signed journal, can
 * admit one to a trial; ordinary admission and `amc experiment gate` refuse them. The bound report is gated (WP07), and
 * the round selects a strictly better passing candidate or keeps its
 * parent. The next round refines the selection. The loop stops at its width, depth and execution budget, or on
 * cancellation; it never promotes anything, it names the measured selection. Stages are journalled in the owning signed
 * session (improvementJournal) and a resumed loop reuses verified completed stages and never replays an unknown one.
 *
 * Branches (H2-05, H2-06, H2-08): proposals carry a domain; a round admits up to `width` branches, domains in a seeded,
 * journalled hash order and interleaved so every domain gets a branch before any gets a second, and runs up to
 * `concurrency` of them at once, each holding its execution reservation from admission. Composition (H2-10, opt-in)
 * hands the editor the round's two best passing candidates that both beat the parent by measured uplift; the composite
 * is a new candidate, executed and judged like any other. Repair (H2-21): an invalid edit gets at most `repairs`
 * re-edits from the same parent, then the branch keeps its parent.
 *
 * Not built in yet: a model-backed editor. The native agent's tools are rooted at its session's workspace, and the attempt
 * directory is deliberately outside it; such an editor needs a tool root confined to the attempt directory through the
 * confined shell backend, refused when no backend is available. Until then the editor is the caller's callback.
 */

/** Editor channel (H2X-10): provider and model together, with step, effort, wall and finite token and spend limits. */
export const editorRouteSchema = z.object({
  provider: z.string().min(1).max(256),
  model: z.string().min(1).max(256),
  effort: z.enum(["low", "medium", "high"]),
  maxSteps: z.number().int().min(1).max(1000),
  wallMs: z.number().int().min(1).max(3_600_000),
  maxTokens: z.number().int().positive().max(100_000_000),
  maxCostUsd: z.number().positive().max(1000)
}).strict();
export type EditorRoute = z.infer<typeof editorRouteSchema>;

/** A proposal for the editor; `evidence` must be proposer-visible (search split) evidence only. `domain` defaults to "general". */
export interface ImprovementProposal { readonly proposalId: string; readonly mission: string; readonly evidenceClass: FixerEvidenceClass; readonly evidence: unknown; readonly domain?: string }
/** What an editor is handed: a fresh directory holding candidate.txt (a copy of the parent), mission.md and evidence.json. */
export interface EditorAttempt { readonly dir: string; readonly mission: string; readonly route: EditorRoute; readonly signal: AbortSignal }
export type ImprovementEditor = (attempt: EditorAttempt) => Promise<void>;
/** `concurrency` (default 1) bounds branches in flight; `repairs` (default 0) bounds re-edits of an invalid edit. */
export interface ImprovementLimits { readonly width: number; readonly depth: number; readonly maxExecutions: number; readonly concurrency?: number; readonly repairs?: number }

const MAX_CANDIDATE_BYTES = 1_048_576;
const CLASS_ORDER: readonly FixerEvidenceClass[] = ["contrast", "repeated-failure", "single-failure"];
const DOMAIN = /^[a-z0-9][a-z0-9_.-]{0,63}$/;
const COMPOSE_MISSION = "Compose one candidate from two measured improvements. contrast-a.txt and contrast-b.txt each beat candidate.txt, "
  + "their parent, on held-out cases; evidence.json holds the measured contrasts. Write the combination of both changes to candidate.txt.";

interface EditOutput { outcome: "changed" | "unchanged" | "invalid"; reason: string | null; candidateDigest: string | null; candidateFile: string | null; auditDigest: string }
interface ProbeOutput { candidateDigest: string; executions: number; gate: "pass" | "fail" | "inconclusive" | "error"; reasons: string[]; upliftValuePoints: number | null }
interface Incumbent { digest: string; bytes: Buffer; file: string | null; upliftValuePoints: number }
type Probed = ProbeOutput & { candidateFile: string };

/** Content address of one editor attempt's audit record (H2X-11); the attempt's own directory is part of it. */
export function attemptAuditDigest(record: { mission: string; contextPath: string; parentDigest: string; route: EditorRoute; proposalId: string; harvestedDigest: string | null }): string {
  return sha256Hex(canonicalize(record));
}

function parseLimits(limits: ImprovementLimits): Required<ImprovementLimits> {
  const int = (value: number, min: number, max: number) => Number.isSafeInteger(value) && value >= min && value <= max;
  const out = { ...limits, concurrency: limits.concurrency ?? 1, repairs: limits.repairs ?? 0 };
  if (!int(out.width, 1, 8) || !int(out.depth, 1, 8) || !int(out.maxExecutions, 1, 10_000) || !int(out.concurrency, 1, 8) || !int(out.repairs, 0, 3)) {
    throw new Error("Improvement limits must be integers: width 1..8, depth 1..8, maxExecutions 1..10000, concurrency 1..8, repairs 0..3.");
  }
  return out;
}

/** A round's branches: domains in seeded hash order, contrast-grounded proposals first within each, interleaved up to width. */
function branchPlan(proposals: readonly ImprovementProposal[], seed: string, width: number): { domainOrder: string[]; branches: ImprovementProposal[] } {
  const domainOf = (row: ImprovementProposal) => row.domain ?? "general";
  const rank = (domain: string) => sha256Hex(`improvement-domain-order/1\0${seed}\0${domain}`);
  const domainOrder = [...new Set(proposals.map(domainOf))].sort((a, b) => rank(a).localeCompare(rank(b)));
  const queues = domainOrder.map((domain) => proposals.filter((row) => domainOf(row) === domain)
    .sort((a, b) => CLASS_ORDER.indexOf(a.evidenceClass) - CLASS_ORDER.indexOf(b.evidenceClass)));
  const branches: ImprovementProposal[] = [];
  for (let level = 0; branches.length < width && queues.some((queue) => level < queue.length); level += 1) {
    for (const queue of queues) if (level < queue.length && branches.length < width) branches.push(queue[level]!);
  }
  return { domainOrder, branches };
}

const repairMission = (mission: string, attempt: number, max: number, reason: string | null) =>
  `${mission}\n\nRepair ${attempt} of ${max}: the previous edit was invalid (${reason ?? "no reason recorded"}). Leave a valid candidate.txt.`;

/** A measured candidate's bytes, refused if the file changed after its probe. */
function measuredBytes(row: { candidateFile: string; candidateDigest: string }): Buffer {
  const bytes = readFileSync(row.candidateFile);
  if (sha256Hex(bytes) !== row.candidateDigest) throw new Error("a measured candidate changed after it was measured");
  return bytes;
}

/** The editor, bounded by its wall limit and the loop's cancellation; null when it returned, else why it did not. */
async function boundedEdit(edit: ImprovementEditor, attempt: Omit<EditorAttempt, "signal">, outer: AbortSignal | undefined): Promise<string | null> {
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  outer?.addEventListener("abort", onAbort);
  let timer: NodeJS.Timeout | undefined;
  try {
    const run = Promise.resolve().then(() => edit({ ...attempt, signal: controller.signal }))
      .then(() => null, (error: unknown) => `editor failed: ${error instanceof Error ? error.message : String(error)}`);
    const timeout = new Promise<string>((resolve) => { timer = setTimeout(() => resolve(`editor exceeded its wall limit of ${attempt.route.wallMs} ms`), attempt.route.wallMs); });
    const result = await Promise.race([run, timeout]);
    if (result !== null) controller.abort();
    return result;
  } finally {
    clearTimeout(timer);
    outer?.removeEventListener("abort", onAbort);
  }
}

/** The edited candidate, read without following links: a symlink or hard link could name an operator file. */
function harvest(file: string): { bytes: Buffer } | { reason: string } {
  let fd: number;
  try { fd = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW); } catch { return { reason: "candidate.txt is missing or is a symbolic link" }; }
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.nlink !== 1) return { reason: "candidate.txt is not a regular, unlinked file" };
    if (stat.size > MAX_CANDIDATE_BYTES) return { reason: `candidate.txt exceeds ${MAX_CANDIDATE_BYTES} bytes` };
    return { bytes: readFileSync(fd) };
  } finally {
    closeSync(fd);
  }
}

export async function runImprovementLoop(params: {
  workspace: string;
  agentId?: string;
  /** An experiment whose baseline is pinned by file digest; its held-out cases judge every candidate. */
  experimentId: string;
  loopId: string;
  /** The owning signed session writer; stages are journalled there and a rerun with the same loop id resumes. */
  session: Pick<SessionService, "workspace" | "sessionId" | "readEvents" | "assertDispatchFence" | "recordProjectedEvidence">;
  proposals: readonly ImprovementProposal[];
  editor: { route: EditorRoute; edit: ImprovementEditor };
  limits: ImprovementLimits;
  /** Seed of the recorded domain order (H2-05); defaults to the loop id. */
  seed?: string;
  /** Opt-in (H2-10): compose the round's two best measured improvements and judge the composite as a new candidate. */
  compose?: boolean;
  policy: ExperimentGatePolicy;
  mode: "supervise" | "sandbox";
  trials: ExecutedTrialOptions;
  signal?: AbortSignal;
}) {
  const workspace = realpathSync(params.workspace);
  const agentId = resolveAgentId(workspace, params.agentId);
  const route = editorRouteSchema.parse(params.editor.route);
  const limits = parseLimits(params.limits);
  if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(params.loopId)) throw new Error("loop id must be 1-64 lowercase letters, digits, '-' or '_'");
  if (params.proposals.length === 0 || new Set(params.proposals.map((row) => row.proposalId)).size !== params.proposals.length) {
    throw new Error("an improvement loop needs at least one proposal, each with a distinct id");
  }
  if (params.proposals.some((row) => row.domain !== undefined && !DOMAIN.test(row.domain))) throw new Error("a proposal domain must be 1-64 lowercase letters, digits, '.', '-' or '_'");
  const seed = params.seed ?? params.loopId;
  if (seed.length === 0 || seed.length > 128) throw new Error("the domain-order seed must be 1-128 characters");
  const compose = params.compose === true;
  const experiment = loadExperiment(workspace, agentId, params.experimentId);
  const baseline = experiment.experiment.baselineConfig;
  if (baseline.kind !== "file" || !baseline.path || !baseline.digestSha256) throw new Error("the experiment's baseline must be a configuration file pinned by its full digest");
  const baselineBytes = readFileSync(workspaceConfigFile(workspace, baseline.path));
  if (sha256Hex(baselineBytes) !== baseline.digestSha256) throw new Error("baseline configuration changed after it was set");
  // Contrast-grounded proposals first within a domain (H2X-13); width admits the strongest of every domain in turn.
  const { domainOrder, branches: proposals } = branchPlan(params.proposals, seed, limits.width);
  const journal = improvementJournal({ workspace, session: params.session, loopId: params.loopId, identity: {
    experimentId: params.experimentId, agentId, casebookDigest: casebookContentSha256(workspace, experiment.experiment.casebookId, agentId),
    baselineDigest: baseline.digestSha256, route, selector: { kind: "experiment-gate", policy: params.policy }, mode: params.mode,
    executorIdentity: params.trials.executorIdentity, proposalsDigest: sha256Hex(canonicalize(params.proposals)),
    branching: { seed, repairs: limits.repairs, compose } } });

  // The loop's own experiment: same casebook and pinned baseline, its own frozen holdout. Created once, then journalled.
  const setupKey = journal.stageKey("setup", { experimentId: params.experimentId });
  let setup = journal.completed(setupKey) as { loopExperimentId: string } | undefined;
  if (setup === undefined) {
    const { experimentId: loopExperimentId } = createExperiment({ workspace, agentId, name: `improvement-loop:${params.loopId}`, casebookId: experiment.experiment.casebookId });
    setExperimentBaseline({ workspace, agentId, experimentId: loopExperimentId, config: { path: baseline.path } });
    setup = { loopExperimentId };
    journal.complete("setup", setupKey, setup);
  }
  const loopExperimentId = setup.loopExperimentId;
  const loopExperiment = loadExperiment(workspace, agentId, loopExperimentId);
  if (loopExperiment.experiment.baselineConfig.digestSha256 !== baseline.digestSha256) throw new Error("the loop's experiment no longer pins the baseline");
  const perProbe = experimentHoldout(workspace, agentId, loopExperiment).heldOut.length * 2;
  if (perProbe === 0) throw new Error("the casebook needs at least two cases to hold one out");
  // The seeded domain order and the admitted branches, recorded before any branch runs.
  const planKey = journal.stageKey("plan", { seed, width: limits.width });
  if (journal.completed(planKey) === undefined) journal.complete("plan", planKey, { seed, domainOrder, branches: proposals.map((row) => row.proposalId) });

  let incumbent: Incumbent = { digest: baseline.digestSha256, bytes: baselineBytes, file: null, upliftValuePoints: 0 };
  let used = 0, reserved = 0, rounds = 0, edits = 0, repairs = 0, probes = 0, composites = 0;
  let stopReason: "depth" | "budget" | "cancelled" = "depth";
  const unknownStages: string[] = [];
  const counted = new Set<string>();
  const runStage = async <T>(stage: "edit" | "probe", input: unknown, work: () => Promise<T>): Promise<T | null> => {
    const key = journal.stageKey(stage, input);
    const done = journal.completed(key);
    if (done !== undefined) return done as T;
    if (journal.unknown(key) !== undefined) { unknownStages.push(key); return null; }
    journal.start(stage, key, input);
    const output = await work();
    journal.complete(stage, key, output);
    return output;
  };
  // An invalid edit is re-edited from the same parent at most `repairs` times; then the branch keeps its parent (H2-21).
  const editStage = async (round: number, branch: number | "compose", parent: Incumbent, proposal: ImprovementProposal,
    files: Readonly<Record<string, Buffer>> = {}, extra: Readonly<Record<string, unknown>> = {}): Promise<EditOutput | null> => {
    let edit: EditOutput | null = null;
    for (let attempt = 0; attempt <= limits.repairs && (attempt === 0 || !params.signal?.aborted); attempt += 1) {
      const mission: string = attempt === 0 ? proposal.mission : repairMission(proposal.mission, attempt, limits.repairs, edit!.reason);
      edit = await runStage<EditOutput>("edit", { round, branch, parentDigest: parent.digest, proposalId: proposal.proposalId, mission, ...extra },
        () => editAttempt({ workspace, loopId: params.loopId, parent, proposal: { ...proposal, mission }, route, edit: params.editor.edit, signal: params.signal, files }));
      edits += 1;
      if (attempt > 0) repairs += 1;
      if (edit?.outcome !== "invalid") break;
    }
    return edit;
  };
  // ponytail: probes run one at a time. The loop's experiment holds one candidate, and every candidate is judged on its
  // one frozen holdout; per-probe trial concurrency is WP04's own bound. Branch edits overlap up to `concurrency`.
  let probeQueue: Promise<unknown> = Promise.resolve();
  const probeStage = (candidateFile: string, candidateDigest: string): Promise<Probed | null> => {
    const run = probeQueue.then(async () => {
      if (params.signal?.aborted) { stopReason = "cancelled"; return null; }
      const probeInput = { candidateDigest, perProbe };
      const probe = await runStage<ProbeOutput>("probe", probeInput,
        () => probeCandidate({ ...params, workspace, agentId, experimentId: loopExperimentId, candidateFile, candidateDigest, perProbe }));
      // An identical candidate reuses its measured probe: its executions are counted once. An unknown probe keeps its whole reservation.
      const probeKey = journal.stageKey("probe", probeInput);
      if (!counted.has(probeKey)) { counted.add(probeKey); probes += 1; used += probe?.executions ?? perProbe; }
      return probe ? { ...probe, candidateFile } : null;
    });
    probeQueue = run.catch(() => undefined);
    return run;
  };
  const explore = async (round: number, branch: number, proposal: ImprovementProposal, parent: Incumbent): Promise<Probed | null> => {
    const edit = await editStage(round, branch, parent, proposal);
    if (edit?.outcome !== "changed" || !edit.candidateFile || !edit.candidateDigest) return null;
    return await probeStage(edit.candidateFile, edit.candidateDigest);
  };
  // The round's two best passing candidates that both beat the parent by measured uplift, composed and judged as a new candidate.
  const composeRound = async (round: number, parent: Incumbent, probed: readonly Probed[]): Promise<Probed | null> => {
    const improving = [...new Map(probed.filter((row) => row.gate === "pass" && row.upliftValuePoints !== null && row.upliftValuePoints > parent.upliftValuePoints)
      .map((row) => [row.candidateDigest, row] as const)).values()]
      .sort((a, b) => b.upliftValuePoints! - a.upliftValuePoints! || a.candidateDigest.localeCompare(b.candidateDigest)).slice(0, 2);
    if (improving.length < 2) return null;
    if (params.signal?.aborted) { stopReason = "cancelled"; return null; }
    if (used + perProbe > limits.maxExecutions) { stopReason = "budget"; return null; }
    const contrasts = improving.map((row) => ({ candidateDigest: row.candidateDigest, gate: row.gate, upliftValuePoints: row.upliftValuePoints }));
    const edit = await editStage(round, "compose", parent, { proposalId: "compose", mission: COMPOSE_MISSION, evidenceClass: "contrast", evidence: { contrasts } },
      { "contrast-a.txt": measuredBytes(improving[0]!), "contrast-b.txt": measuredBytes(improving[1]!) }, { contrasts: contrasts.map((row) => row.candidateDigest) });
    if (edit?.outcome !== "changed" || !edit.candidateFile || !edit.candidateDigest || improving.some((row) => row.candidateDigest === edit.candidateDigest)) return null;
    composites += 1;
    return await probeStage(edit.candidateFile, edit.candidateDigest);
  };

  for (let round = 1; round <= limits.depth && stopReason === "depth"; round += 1) {
    const editsBefore = edits;
    const parent = incumbent;
    const slots: Array<Probed | null> = [];
    const running = new Set<Promise<void>>();
    let failure: { error: unknown } | null = null;
    for (const [branch, proposal] of proposals.entries()) {
      // A branch holds its whole reservation from admission, so branches in flight never overrun the budget together.
      while (failure === null && running.size > 0 && (running.size >= limits.concurrency || used + reserved + perProbe > limits.maxExecutions)) await Promise.race(running);
      if (failure !== null) break;
      if (params.signal?.aborted) { stopReason = "cancelled"; break; }
      if (used + reserved + perProbe > limits.maxExecutions) { stopReason = "budget"; break; }
      reserved += perProbe;
      const task: Promise<void> = explore(round, branch, proposal, parent)
        .then((probe) => { slots[branch] = probe; }, (error: unknown) => { failure ??= { error }; })
        .finally(() => { reserved -= perProbe; running.delete(task); });
      running.add(task);
    }
    await Promise.all(running);
    if (failure !== null) throw (failure as { error: unknown }).error;
    const probed = slots.filter((row): row is Probed => row !== null && row !== undefined);
    const composite = compose && stopReason === "depth" ? await composeRound(round, parent, probed) : null;
    if (composite !== null) probed.push(composite);
    if (edits > editsBefore) rounds += 1;
    // Cancellation admits no new stage, selection included; the parent stays.
    if (stopReason !== "cancelled") incumbent = selectRound(journal, round, incumbent, probed);
  }
  return { selection: incumbent.file === null ? "baseline" as const : "candidate" as const,
    selected: incumbent.file === null ? null : { candidateDigest: incumbent.digest, candidateFile: incumbent.file, upliftValuePoints: incumbent.upliftValuePoints },
    stopReason, rounds, edits, repairs, probes, composites, executionsUsed: used, unknownStages, domainOrder };
}

async function editAttempt(input: { workspace: string; loopId: string; parent: Incumbent; proposal: ImprovementProposal; route: EditorRoute;
  edit: ImprovementEditor; signal: AbortSignal | undefined; files: Readonly<Record<string, Buffer>> }): Promise<EditOutput> {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "amc-edit-attempt-")));
  let result: { bytes: Buffer } | { reason: string };
  try {
    if (`${dir}${sep}`.startsWith(`${input.workspace}${sep}`)) throw new Error("editor attempt directories must lie outside the operator workspace");
    writeFileSync(join(dir, "candidate.txt"), input.parent.bytes, { mode: 0o600 });
    writeFileSync(join(dir, "mission.md"), input.proposal.mission, { mode: 0o600 });
    writeFileSync(join(dir, "evidence.json"), canonicalize(input.proposal.evidence ?? null), { mode: 0o600 });
    for (const [name, bytes] of Object.entries(input.files)) writeFileSync(join(dir, name), bytes, { mode: 0o600 });
    const failed = await boundedEdit(input.edit, { dir, mission: input.proposal.mission, route: input.route }, input.signal);
    result = failed !== null ? { reason: failed } : harvest(join(dir, "candidate.txt"));
  } finally {
    rmSync(dir, { recursive: true, force: true }); // harvested above, before cleanup
  }
  const harvestedDigest = "bytes" in result ? sha256Hex(result.bytes) : null;
  const auditDigest = attemptAuditDigest({ mission: input.proposal.mission, contextPath: dir, parentDigest: input.parent.digest, route: input.route,
    proposalId: input.proposal.proposalId, harvestedDigest });
  if (!("bytes" in result)) return { outcome: "invalid", reason: result.reason, candidateDigest: null, candidateFile: null, auditDigest };
  if (harvestedDigest === input.parent.digest) return { outcome: "unchanged", reason: "the editor left the parent unchanged", candidateDigest: null, candidateFile: null, auditDigest };
  // Written by the loop, never the editor, content-addressed. Never auditor-signed: its trust is the signed edit stage.
  const file = join(input.workspace, "improvement-candidates", input.loopId, `${harvestedDigest}.txt`);
  ensureDir(join(input.workspace, "improvement-candidates", input.loopId));
  writeFileAtomic(file, result.bytes, 0o644);
  return { outcome: "changed", reason: null, candidateDigest: harvestedDigest, candidateFile: file, auditDigest };
}

async function probeCandidate(input: { workspace: string; agentId: string; experimentId: string; loopId: string; candidateFile: string; candidateDigest: string; perProbe: number;
  policy: ExperimentGatePolicy; mode: "supervise" | "sandbox"; trials: ExecutedTrialOptions }): Promise<ProbeOutput> {
  try {
    const loopCandidate = { loopId: input.loopId, digestSha256: input.candidateDigest };
    setExperimentLoopCandidate({ workspace: input.workspace, agentId: input.agentId, experimentId: input.experimentId, candidateFile: input.candidateFile, loop: loopCandidate });
    const { report } = await runExecutedExperimentAsync({ workspace: input.workspace, agentId: input.agentId, experimentId: input.experimentId, mode: input.mode, loopCandidate,
      trials: { ...input.trials, limits: { ...input.trials.limits, maxExecutions: input.perProbe } } });
    const gate = evaluateExperimentGate(report, { ...input.policy, candidateConfigDigest: input.candidateDigest });
    return { candidateDigest: input.candidateDigest, executions: report.execution?.executions.length ?? input.perProbe, gate: gate.status, reasons: gate.reasons,
      upliftValuePoints: Number.isFinite(report.upliftValuePoints) ? report.upliftValuePoints : null };
  } catch (error) {
    // Executions may have run before the failure: the whole reservation is spent, and nothing is selectable.
    return { candidateDigest: input.candidateDigest, executions: input.perProbe, gate: "error", reasons: [error instanceof Error ? error.message : String(error)], upliftValuePoints: null };
  }
}

/** A passing candidate replaces the parent only with a strictly higher measured uplift and a unique top; else the parent stays. */
function selectRound(journal: ImprovementJournal, round: number, incumbent: Incumbent, probed: readonly Probed[]): Incumbent {
  const input = { round, incumbentDigest: incumbent.digest, incumbentUplift: incumbent.upliftValuePoints,
    probes: probed.map((row) => ({ candidateDigest: row.candidateDigest, gate: row.gate, upliftValuePoints: row.upliftValuePoints })) };
  const key = journal.stageKey("select", input);
  const passing = probed.filter((row) => row.gate === "pass" && row.upliftValuePoints !== null);
  const top = Math.max(...passing.map((row) => row.upliftValuePoints!));
  const best = passing.filter((row) => row.upliftValuePoints === top);
  const winner = new Set(best.map((row) => row.candidateDigest)).size === 1 && top > incumbent.upliftValuePoints ? best[0]! : null;
  if (journal.completed(key) === undefined) {
    journal.complete("select", key, { selected: winner ? "candidate" : "parent", candidateDigest: winner?.candidateDigest ?? incumbent.digest,
      reason: winner ? "passing candidate with the highest measured uplift over the baseline" : "parent retained: no passing candidate is uniquely and strictly better" });
  }
  if (!winner) return incumbent;
  const bytes = measuredBytes(winner);
  return { digest: winner.candidateDigest, bytes, file: winner.candidateFile, upliftValuePoints: top };
}
