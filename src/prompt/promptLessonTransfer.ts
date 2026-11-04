import { hashId } from "../bench/benchRedaction.js";
import { join, resolve } from "node:path";
import { statSync } from "node:fs";
import { openLedger } from "../ledger/ledger.js";
import { pathExists } from "../utils/fs.js";
import { initLessonTables } from "../learning/correctionMemory.js";
import { selectLessonTransfer, assertLessonTransferCurrent, commitLessonTransfer, type LessonTransferSelection } from "../learning/lessonTransfer.js";
import { lessonTransferRequestSchema, type LessonTransferRequest } from "../learning/lessonProvenance.js";
import { canonicalize } from "../utils/json.js";

/** Opt-in read only selection from the existing correction-memory ledger. */
export function capturePromptLessons(workspace: string, agentId: string, request?: LessonTransferRequest): LessonTransferSelection | undefined {
  if (request === undefined) return undefined;
  const ledger = pathExists(join(workspace, ".amc", "evidence.sqlite")) ? openLedger(workspace, { readonly: true }) : null;
  try { return selectLessonTransfer(ledger?.db ?? null, workspace, agentId, request); }
  finally { ledger?.close(); }
}

/** Recheck the frozen references at publication and request admission; never silently substitute another lesson. */
export function assertPromptLessonsCurrent(workspace: string, agentId: string, selection?: LessonTransferSelection): void {
  if (!selection || selection.lessons.length === 0) return;
  const ledger = openLedger(workspace, { readonly: true });
  try { assertLessonTransferCurrent(ledger.db, workspace, agentId, selection); }
  finally { ledger.close(); }
}

/** A signed prompt artifact is the commitment boundary, not a preview or a promise of model execution. */
export function commitPromptLessons(workspace: string, agentId: string, packId: string, selection?: LessonTransferSelection): void {
  if (!selection || selection.lessons.length === 0) return;
  const ledger = openLedger(workspace);
  try {
    initLessonTables(ledger.db);
    commitLessonTransfer(ledger.db, workspace, agentId, packId, selection);
  } finally { ledger.close(); }
}

/** A latest pack may outlive its run: admission requires an explicit, exact caller-supplied run boundary. */
export function assertPromptLessonRun(workspace: string, agentId: string, selection: LessonTransferSelection | undefined,
  run?: LessonTransferRequest, binding?: { agentIdHash: string; workspaceIdHash: string }): void {
  if (selection?.status !== "SELECTED") return;
  if (!binding || binding.agentIdHash !== hashId(agentId, 8) || binding.workspaceIdHash !== hashId(workspace, 8)) {
    throw new Error("lesson pack target agent or workspace does not match");
  }
  const parsed = run === undefined ? undefined : lessonTransferRequestSchema.parse(run);
  const normalized = parsed && { ...parsed, sourceAgentIds: [...new Set(parsed.sourceAgentIds ?? [agentId])].sort() };
  if (!normalized || canonicalize(normalized) !== canonicalize(selection.request)) {
    throw new Error("lesson pack requires its exact run context");
  }
  assertPromptLessonsCurrent(workspace, agentId, selection);
}

/** Selected lesson inputs must never be overwritten by a caller-selected artifact destination. */
export function assertPromptLessonOutputs(workspace: string, outputs: readonly string[], enabled: boolean): void {
  if (!enabled) return;
  const identity = (path: string) => {
    try { const stat = statSync(path); return `${stat.dev}:${stat.ino}`; }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
  };
  const database = join(workspace, ".amc", "evidence.sqlite");
  const inputs = [database, `${database}-wal`, `${database}-shm`].map(path => ({ path: resolve(path), identity: identity(path) }));
  for (const output of outputs) {
    const path = resolve(output), id = identity(path);
    if (inputs.some(input => input.path === path || (id !== null && id === input.identity))) {
      throw new Error("prompt output must differ from lesson ledger inputs");
    }
  }
}
