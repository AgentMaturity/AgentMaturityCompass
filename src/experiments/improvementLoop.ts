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

/** A proposal for the editor; `evidence` must be proposer-visible (search split) evidence only. */
export interface ImprovementProposal { readonly proposalId: string; readonly mission: string; readonly evidenceClass: FixerEvidenceClass; readonly evidence: unknown }
/** What an editor is handed: a fresh directory holding candidate.txt (a copy of the parent), mission.md and evidence.json. */
export interface EditorAttempt { readonly dir: string; readonly mission: string; readonly route: EditorRoute; readonly signal: AbortSignal }
export type ImprovementEditor = (attempt: EditorAttempt) => Promise<void>;
export interface ImprovementLimits { readonly width: number; readonly depth: number; readonly maxExecutions: number }

const MAX_CANDIDATE_BYTES = 1_048_576;
const CLASS_ORDER: readonly FixerEvidenceClass[] = ["contrast", "repeated-failure", "single-failure"];

interface EditOutput { outcome: "changed" | "unchanged" | "invalid"; reason: string | null; candidateDigest: string | null; candidateFile: string | null; auditDigest: string }
interface ProbeOutput { candidateDigest: string; executions: number; gate: "pass" | "fail" | "inconclusive" | "error"; reasons: string[]; upliftValuePoints: number | null }
interface Incumbent { digest: string; bytes: Buffer; file: string | null; upliftValuePoints: number }

/** Content address of one editor attempt's audit record (H2X-11); the attempt's own directory is part of it. */
export function attemptAuditDigest(record: { mission: string; contextPath: string; parentDigest: string; route: EditorRoute; proposalId: string; harvestedDigest: string | null }): string {
  return sha256Hex(canonicalize(record));
}

function parseLimits(limits: ImprovementLimits): ImprovementLimits {
  const int = (value: number, max: number) => Number.isSafeInteger(value) && value >= 1 && value <= max;
  if (!int(limits.width, 8) || !int(limits.depth, 8) || !int(limits.maxExecutions, 10_000)) {
    throw new Error("Improvement limits must be integers: width 1..8, depth 1..8, maxExecutions 1..10000.");
  }
  return limits;
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
  const experiment = loadExperiment(workspace, agentId, params.experimentId);
  const baseline = experiment.experiment.baselineConfig;
  if (baseline.kind !== "file" || !baseline.path || !baseline.digestSha256) throw new Error("the experiment's baseline must be a configuration file pinned by its full digest");
  const baselineBytes = readFileSync(workspaceConfigFile(workspace, baseline.path));
  if (sha256Hex(baselineBytes) !== baseline.digestSha256) throw new Error("baseline configuration changed after it was set");
  // Contrast-grounded proposals first (H2X-13); width admits the strongest.
  const proposals = [...params.proposals].sort((a, b) => CLASS_ORDER.indexOf(a.evidenceClass) - CLASS_ORDER.indexOf(b.evidenceClass)).slice(0, limits.width);
  const journal = improvementJournal({ workspace, session: params.session, loopId: params.loopId, identity: {
    experimentId: params.experimentId, agentId, casebookDigest: casebookContentSha256(workspace, experiment.experiment.casebookId, agentId),
    baselineDigest: baseline.digestSha256, route, selector: { kind: "experiment-gate", policy: params.policy }, mode: params.mode,
    executorIdentity: params.trials.executorIdentity, proposalsDigest: sha256Hex(canonicalize(params.proposals)) } });

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

  let incumbent: Incumbent = { digest: baseline.digestSha256, bytes: baselineBytes, file: null, upliftValuePoints: 0 };
  let used = 0, rounds = 0, edits = 0, probes = 0;
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

  for (let round = 1; round <= limits.depth && stopReason === "depth"; round += 1) {
    const editsBefore = edits;
    const probed: Array<ProbeOutput & { candidateFile: string }> = [];
    for (const [branch, proposal] of proposals.entries()) {
      if (params.signal?.aborted) { stopReason = "cancelled"; break; }
      if (used + perProbe > limits.maxExecutions) { stopReason = "budget"; break; }
      const parent = incumbent;
      const edit = await runStage<EditOutput>("edit", { round, branch, parentDigest: parent.digest, proposalId: proposal.proposalId, mission: proposal.mission },
        () => editAttempt({ workspace, loopId: params.loopId, parent, proposal, route, edit: params.editor.edit, signal: params.signal }));
      edits += 1;
      if (edit?.outcome !== "changed" || !edit.candidateFile || !edit.candidateDigest) continue;
      if (params.signal?.aborted) { stopReason = "cancelled"; break; }
      const candidateFile = edit.candidateFile, candidateDigest = edit.candidateDigest;
      const probeInput = { candidateDigest, perProbe };
      const probe = await runStage<ProbeOutput>("probe", probeInput,
        () => probeCandidate({ ...params, workspace, agentId, experimentId: loopExperimentId, candidateFile, candidateDigest, perProbe }));
      // An identical candidate reuses its measured probe: its executions are counted once. An unknown probe keeps its whole reservation.
      const probeKey = journal.stageKey("probe", probeInput);
      if (!counted.has(probeKey)) { counted.add(probeKey); probes += 1; used += probe?.executions ?? perProbe; }
      if (probe) probed.push({ ...probe, candidateFile });
    }
    if (edits > editsBefore) rounds += 1;
    // Cancellation admits no new stage, selection included; the parent stays.
    if (stopReason !== "cancelled") incumbent = selectRound(journal, round, incumbent, probed);
  }
  return { selection: incumbent.file === null ? "baseline" as const : "candidate" as const,
    selected: incumbent.file === null ? null : { candidateDigest: incumbent.digest, candidateFile: incumbent.file, upliftValuePoints: incumbent.upliftValuePoints },
    stopReason, rounds, edits, probes, executionsUsed: used, unknownStages };
}

async function editAttempt(input: { workspace: string; loopId: string; parent: Incumbent; proposal: ImprovementProposal; route: EditorRoute;
  edit: ImprovementEditor; signal: AbortSignal | undefined }): Promise<EditOutput> {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "amc-edit-attempt-")));
  let result: { bytes: Buffer } | { reason: string };
  try {
    if (`${dir}${sep}`.startsWith(`${input.workspace}${sep}`)) throw new Error("editor attempt directories must lie outside the operator workspace");
    writeFileSync(join(dir, "candidate.txt"), input.parent.bytes, { mode: 0o600 });
    writeFileSync(join(dir, "mission.md"), input.proposal.mission, { mode: 0o600 });
    writeFileSync(join(dir, "evidence.json"), canonicalize(input.proposal.evidence ?? null), { mode: 0o600 });
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
function selectRound(journal: ImprovementJournal, round: number, incumbent: Incumbent, probed: ReadonlyArray<ProbeOutput & { candidateFile: string }>): Incumbent {
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
  const bytes = readFileSync(winner.candidateFile);
  if (sha256Hex(bytes) !== winner.candidateDigest) throw new Error("selected candidate changed after it was measured");
  return { digest: winner.candidateDigest, bytes, file: winner.candidateFile, upliftValuePoints: top };
}
