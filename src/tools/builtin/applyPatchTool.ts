import { mkdirSync, statSync } from "node:fs";
import { dirname } from "node:path";
import { z } from "zod";
import { sessionPayloadCap } from "../../session/sessionPayloadCap.js";
import { sha256Hex } from "../../utils/hash.js";
import { defineTool } from "../toolRegistry.js";
import type { FileChange, ToolBodyResult, ToolDefinition, ToolExecution } from "../toolTypes.js";
import { MAX_PATCH_BYTES, parsePatch, type PatchSection } from "./applyPatchParse.js";
import { applyHunks, locateBudget, type LocateBudget } from "./applyPatchPlan.js";
import { deleteIfUnchanged, readBeforeWrite, refuseBeforeWrite, refuseRedactionPlaceholder, shownDiff, utf8, writeIfUnchanged } from "./fsWritePrimitives.js";
import type { ReadBeforeEditLedger } from "./readBeforeEdit.js";
import { insideWorkspaceNoLinks } from "./workspacePath.js";

/**
 * `apply_patch` (SH-TOOLS-01): the Codex multi-file patch format through the same read-before-edit ledger, workspace
 * bound and signed path policy as `fs.write`/`fs.edit`.
 *
 * Two phases. Phase 1 reads, checks and plans every section and writes nothing: any refusal there is a definite
 * failure with no effect, including a read that fails for any reason but absence (a directory in the way, no
 * permission). Phase 1 also projects the call's `fileChanges` evidence and refuses a patch whose evidence row would
 * not fit the workspace's signed per-event payload cap: the edit must never land while its evidence is lost. Phase 2
 * publishes each section in order through the shared primitives, each one re-checked at commit against the bytes
 * phase 1 planned on. A phase-2 failure after some files were written is reported, not hidden: the result is
 * `ok: false, effect: "applied"`, its output lists the files written and not written (from what actually landed), and
 * `fileChanges` names every file that changed. There is no rollback; the files written hold exactly the planned bytes.
 *
 * Paths must not traverse a symlink below the workspace root (`insideWorkspaceNoLinks`): a delete or move acts on the
 * entry named, never on a link's target elsewhere in the workspace, which the signed `allow.paths` globs never saw.
 * Two paths that differ only by case or Unicode normalization are one file on the volumes most agents run on, so they
 * are refused as a duplicate on every platform. A move keeps the source file's permission bits.
 */

const argsSchema = z.object({ patch: z.string().min(1).max(MAX_PATCH_BYTES) }).strict();

/** Room left in the audit payload for its other fields beside `fileChanges`. */
const EVIDENCE_HEADROOM_BYTES = 4_096;

interface Target { readonly full: string; readonly rel: string; readonly path: string }

type Operation =
  | { readonly kind: "add"; readonly target: Target; readonly after: Buffer }
  | { readonly kind: "delete"; readonly target: Target; readonly before: Buffer; readonly diff: string }
  | { readonly kind: "update"; readonly target: Target; readonly before: Buffer; readonly after: Buffer; readonly diff: string;
      readonly truncated: boolean; readonly moveTo: Target | null; readonly mode: number | null; readonly notes: readonly string[]; readonly replacements: number };

function resolveTarget(execution: ToolExecution, path: string): Target {
  try {
    return { ...insideWorkspaceNoLinks(execution.workspace, path), path };
  } catch (error) {
    throw refuseBeforeWrite(error instanceof Error ? error.message : String(error));
  }
}

/** Phase 1: every section checked and planned, nothing written. */
function planSection(execution: ToolExecution, ledger: ReadBeforeEditLedger, section: PatchSection, budget: LocateBudget): Operation {
  const target = resolveTarget(execution, section.path);
  const agent = execution.agentId;
  if (section.kind === "add") {
    for (const line of section.lines) refuseRedactionPlaceholder(line, "apply_patch");
    if (readBeforeWrite(target.full, section.path) !== null) throw refuseBeforeWrite(`"${section.path}" already exists; use Update File to change it`);
    const verdict = ledger.mayWrite(agent, target.full);
    if (!verdict.ok) throw refuseBeforeWrite(verdict.reason);
    return { kind: "add", target, after: Buffer.from(section.lines.length === 0 ? "" : `${section.lines.join("\n")}\n`, "utf8") };
  }
  const before = readBeforeWrite(target.full, section.path);
  if (before === null) throw refuseBeforeWrite(`"${section.path}" does not exist`);
  const verdict = ledger.mayEdit(agent, target.full, sha256Hex(before));
  if (!verdict.ok) throw refuseBeforeWrite(verdict.reason);
  if (section.kind === "delete") {
    return { kind: "delete", target, before, diff: shownDiff(target.rel, before, Buffer.alloc(0)).text };
  }
  for (const hunk of section.hunks) {
    for (const line of hunk.lines) {
      if (line.op === "+") refuseRedactionPlaceholder(line.text, "apply_patch");
    }
  }
  const text = utf8(before);
  if (text === null) throw refuseBeforeWrite(`"${section.path}" is not valid UTF-8; apply_patch would change bytes it was not asked to change`);
  let plan;
  try {
    plan = applyHunks(text, section.hunks, section.path, budget);
  } catch (error) {
    throw refuseBeforeWrite(error instanceof Error ? error.message : String(error));
  }
  let moveTo: Target | null = null;
  let mode: number | null = null;
  if (section.moveTo !== null) {
    moveTo = resolveTarget(execution, section.moveTo);
    if (readBeforeWrite(moveTo.full, section.moveTo) !== null) throw refuseBeforeWrite(`Move to "${section.moveTo}" refused: a file exists there`);
    const allowed = ledger.mayWrite(agent, moveTo.full);
    if (!allowed.ok) throw refuseBeforeWrite(allowed.reason);
    try {
      mode = statSync(target.full).mode & 0o7777;
    } catch (error) {
      throw refuseBeforeWrite(`"${section.path}": ${error instanceof Error ? error.message : String(error)}`.split(target.full).join(section.path));
    }
  }
  const after = Buffer.from(plan.after, "utf8");
  const diff = shownDiff(moveTo?.rel ?? target.rel, before, after);
  return { kind: "update", target, before, after, diff: diff.text, truncated: diff.truncated, moveTo, mode, notes: plan.notes, replacements: plan.removed + plan.added };
}

const change = (rel: string, before: Buffer | null, after: Buffer | null, replacements: number | null, diff: string | null, truncated = false): FileChange => ({
  path: rel, beforeSha256: before === null ? null : sha256Hex(before), afterSha256: after === null ? null : sha256Hex(after),
  bytesBefore: before?.length ?? 0, bytesAfter: after?.length ?? 0, replacements, diffSha256: diff === null ? null : sha256Hex(diff), diffTruncated: truncated
});

/** The evidence one operation will carry once it lands, in the order phase 2 lands it. */
function plannedChanges(op: Operation): FileChange[] {
  if (op.kind === "add") return [change(op.target.rel, null, op.after, null, null)];
  if (op.kind === "delete") return [change(op.target.rel, op.before, null, null, op.diff)];
  if (op.moveTo === null) return [change(op.target.rel, op.before, op.after, op.replacements, op.diff, op.truncated)];
  return [change(op.moveTo.rel, null, op.after, op.replacements, op.diff, op.truncated), change(op.target.rel, op.before, null, null, null)];
}

/** Phase 2 for one operation; pushes each change as it lands. Throws after zero or more of them landed. */
function commit(execution: ToolExecution, ledger: ReadBeforeEditLedger, op: Operation, changes: readonly FileChange[], landed: FileChange[]): void {
  const agent = execution.agentId;
  if (op.kind === "add") {
    mkdirSync(dirname(op.target.full), { recursive: true });
    writeIfUnchanged(execution, ledger, op.target.full, op.target.path, null, op.after);
    ledger.recordRead(agent, op.target.full, op.after);
    landed.push(changes[0]!);
    return;
  }
  if (op.kind === "delete") {
    deleteIfUnchanged(execution, ledger, op.target.full, op.target.path, op.before);
    landed.push(changes[0]!);
    return;
  }
  if (op.moveTo === null) {
    writeIfUnchanged(execution, ledger, op.target.full, op.target.path, op.before, op.after);
    ledger.recordRead(agent, op.target.full, op.after);
    landed.push(changes[0]!);
    return;
  }
  mkdirSync(dirname(op.moveTo.full), { recursive: true });
  writeIfUnchanged(execution, ledger, op.moveTo.full, op.moveTo.path, null, op.after, op.mode ?? undefined);
  ledger.recordRead(agent, op.moveTo.full, op.after);
  landed.push(changes[0]!);
  deleteIfUnchanged(execution, ledger, op.target.full, op.target.path, op.before);
  landed.push(changes[1]!);
}

const describe = (op: Operation): string => op.kind === "add" ? `added ${op.target.path} (${op.after.length} bytes)`
  : op.kind === "delete" ? `deleted ${op.target.path}`
    : op.moveTo === null ? `updated ${op.target.path} (${op.replacements} line${op.replacements === 1 ? "" : "s"} changed)`
      : `moved ${op.target.path} to ${op.moveTo.path} (${op.replacements} line${op.replacements === 1 ? "" : "s"} changed)`;

const diffOf = (op: Operation): string => op.kind === "add" ? "" : op.diff;

const targetsOf = (op: Operation): Target[] => [op.target, ...(op.kind === "update" && op.moveTo !== null ? [op.moveTo] : [])];

/** One key per real file on a case-insensitive volume: NFC and case only, never compatibility forms. */
const fileKey = (full: string): string => full.normalize("NFC").toLowerCase();

export function applyPatchTool(deps: { readonly ledger: ReadBeforeEditLedger }): ToolDefinition {
  const { ledger } = deps;
  return defineTool({
    name: "apply_patch",
    actionClass: "WRITE_LOW",
    description:
      "Apply a Codex-format patch to workspace files you have read: \"*** Begin Patch\", then sections \"*** Add File: p\" " +
      "(lines prefixed +), \"*** Delete File: p\", \"*** Update File: p\" (optional \"*** Move to: q\", then hunks starting " +
      "\"@@\" with lines prefixed space, - or +; \"*** End of File\" anchors a hunk at the end), then \"*** End Patch\". " +
      "Every section is checked before any file is written; each hunk must match exactly once. Returns one unified diff per file.",
    parameters: {
      type: "object",
      properties: {
        patch: { type: "string", minLength: 1, maxLength: MAX_PATCH_BYTES, description: "the patch text, from *** Begin Patch to *** End Patch" }
      },
      required: ["patch"],
      additionalProperties: false
    },
    body: (execution): ToolBodyResult => {
      const parsed = argsSchema.safeParse(execution.arguments);
      if (!parsed.success) throw refuseBeforeWrite(parsed.error.message);
      let sections: PatchSection[];
      try {
        sections = parsePatch(parsed.data.patch);
      } catch (error) {
        throw refuseBeforeWrite(error instanceof Error ? error.message : String(error));
      }
      // One locate budget for the whole call: many cheap hunks across sections must not add up to minutes.
      const budget = locateBudget();
      const operations = sections.map((section) => planSection(execution, ledger, section, budget));
      // Lexical duplicates were refused by the parser; two spellings of one real file (a link-free path resolved two
      // ways, or a case or normalization variant) are refused here.
      const touched = new Set<string>();
      for (const op of operations) {
        for (const target of targetsOf(op)) {
          const key = fileKey(target.full);
          if (touched.has(key)) throw refuseBeforeWrite(`the patch names one file twice (paths differing only by case or Unicode form count as one): ${target.path}`);
          touched.add(key);
        }
      }
      // The evidence this call will write, bounded before anything lands: a row the ledger refuses loses the audit of
      // an edit that happened and wedges the session.
      const changes = operations.map(plannedChanges);
      const evidenceBytes = Buffer.byteLength(JSON.stringify({ fileChanges: changes.flat() }), "utf8");
      let cap: number;
      try {
        cap = sessionPayloadCap(execution.workspace);
      } catch (error) {
        throw refuseBeforeWrite(`the workspace's per-event payload cap could not be read (${error instanceof Error ? error.message : String(error)}); nothing was written`);
      }
      if (evidenceBytes + EVIDENCE_HEADROOM_BYTES > cap) {
        throw refuseBeforeWrite(`the patch's ${changes.flat().length} file changes need ${evidenceBytes} bytes of evidence, over this workspace's ${cap}-byte per-event payload cap; split the patch into smaller calls`);
      }
      const notes = operations.flatMap((op) => (op.kind === "update" ? op.notes : []));
      const render = (head: string, ops: readonly Operation[]): string =>
        [head, ...ops.map(describe), ...notes.map((note) => `[amc: ${note}]`), ...ops.map(diffOf).filter((diff) => diff !== "")].join("\n");
      if (execution.effectiveMode === "SIMULATE") {
        return { ok: true, output: render(`SIMULATE apply_patch: ${operations.length} file(s), nothing written`, operations), bytes: 0 };
      }
      const landed: FileChange[] = [];
      for (let index = 0; index < operations.length; index++) {
        try {
          commit(execution, ledger, operations[index]!, changes[index]!, landed);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          if (landed.length === 0) throw refuseBeforeWrite(message);
          // From what landed, not from the section index: a move whose target was written before its source delete
          // failed has written one file and not the other.
          const written = new Set(landed.map((entry) => entry.path));
          const done = operations.slice(0, index);
          const output = [`apply_patch stopped at section ${index + 1} of ${operations.length}: ${message}`,
            `written: ${operations.flatMap(targetsOf).filter((target) => written.has(target.rel)).map((target) => target.path).join(", ")}`,
            `not written: ${operations.flatMap(targetsOf).filter((target) => !written.has(target.rel)).map((target) => target.path).join(", ")}`,
            ...done.map(diffOf).filter((diff) => diff !== "")].join("\n");
          return { ok: false, output, effect: "applied", fileChanges: landed };
        }
      }
      const bytes = landed.reduce((sum, entry) => sum + entry.bytesAfter, 0);
      return { ok: true, output: render(`applied patch: ${operations.length} file(s)`, operations), bytes, effect: "applied", fileChanges: landed };
    }
  });
}
