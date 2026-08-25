/**
 * Reading the instruction files, under an explicit and stated budget.
 *
 * Discovery order is ./instructionPrecedence.ts's job and is decided without
 * touching a disk. This module answers the separate question of what is actually
 * there, and it answers it in four ways rather than two, because "we did not put
 * your instructions in the prompt" has four different causes and an operator
 * needs to know which one applies:
 *
 *   ABSENT      nothing is at the path. Not an error, not a notice, not
 *               mentioned — most workspaces have no user-level AGENTS.md and
 *               saying so every step would be noise.
 *   UNREADABLE  something IS at the path and could not be read as text (a
 *               permission error, or a directory where a file belongs). This is
 *               NAMED in the contribution. Silently treating it as absent is the
 *               failure this repository keeps having to fix: the guardrails the
 *               operator wrote vanish, and the log records a prompt that looks
 *               exactly like one from a workspace that never had them.
 *   OVERSIZE    the file is larger than one file's cap, so none of it is read.
 *               Named, for the same reason.
 *   OVER-BUDGET the file fits its own cap but the set does not fit the total.
 *               Named, and the ones dropped are the WEAKEST first, so what
 *               survives a squeeze is what takes precedence anyway.
 *
 * DIVERGENCE FROM dsh, DELIBERATE: NO TRUNCATION. dsh binary-searches a
 * truncation point so the most specific file fits the budget. AMC drops the file
 * whole and says so, because half an instruction file is a document whose second
 * half has been silently deleted — "always ask before X, except when Y" cut after
 * the comma reverses its own meaning. An omission the model is told about is
 * recoverable; a truncation it is not told about is a rule that now says
 * something else.
 *
 * DIVERGENCE FROM dsh, DELIBERATE: A NON-FILE IS UNREADABLE, NOT ABSENT. dsh
 * classifies a non-regular file as absent. Here a directory named `AGENTS.md`
 * sits exactly where AMC's own writer would put guardrails, so calling it
 * "absent" would hide a collision the operator has to resolve.
 *
 * DEDUPLICATION. `AGENTS.md` and `CLAUDE.md` are very often the same document —
 * a copy, or a symlink — and sending both spends the context window twice for no
 * information. Byte-identical (after trimming) contributions collapse to the
 * STRONGEST occurrence, so the path the model is shown is the one AMC's writer
 * would edit. A collapse is reported to the caller as a diagnostic but is NOT
 * put in the model's context: "these two files you cannot see are identical" is
 * a fact about the harness, not guidance for the work.
 */
import { readFileSync, statSync } from "node:fs";
import { sha256Hex } from "../../utils/hash.js";
import {
  instructionCandidates,
  type InstructionCandidate,
  type InstructionCandidateOptions
} from "./instructionPrecedence.js";

/** One instruction file whose content is in the contribution. */
export interface LoadedInstruction {
  readonly candidate: InstructionCandidate;
  readonly content: string;
  readonly bytes: number;
}

/** Why an instruction file that EXISTS is not in the contribution. */
export type InstructionOmissionReason = "unreadable" | "oversize" | "over-budget";

/** A present file that did not make it in, and the reason, for the model. */
export interface InstructionOmission {
  readonly displayPath: string;
  readonly reason: InstructionOmissionReason;
  /** One clause, safe to show a model: never a host path, never an errno dump. */
  readonly detail: string;
}

/** A file collapsed into a stronger, byte-identical one. Diagnostic only. */
export interface InstructionDuplicate {
  readonly displayPath: string;
  readonly duplicateOf: string;
}

/** What one load found, ready to render. */
export interface InstructionLoad {
  /** Ascending precedence — render order. */
  readonly included: readonly LoadedInstruction[];
  /** Ascending precedence. Model-visible. */
  readonly omitted: readonly InstructionOmission[];
  /** Ascending precedence. NOT model-visible. */
  readonly duplicates: readonly InstructionDuplicate[];
}

/**
 * Default per-file cap.
 *
 * 64 KiB is far more than any hand-written instruction file and far less than
 * anything that would dominate a context window on its own. A file over it is
 * almost certainly not instructions — it is a log, a dump, or a generated
 * artifact that landed under the wrong name.
 */
export const DEFAULT_MAX_INSTRUCTION_FILE_BYTES = 64 * 1024;

/** Default cap on the whole set. Two full-size files, and no more. */
export const DEFAULT_MAX_INSTRUCTION_TOTAL_BYTES = 128 * 1024;

export interface InstructionLoadOptions extends InstructionCandidateOptions {
  /** Per-file UTF-8 byte cap. A larger file is omitted whole. */
  readonly maxFileBytes?: number;
  /** UTF-8 byte cap across the retained set. Weakest files drop first. */
  readonly maxTotalBytes?: number;
  /** Cancellation for the reads. */
  readonly signal?: AbortSignal;
  /**
   * Reads one candidate's UTF-8 text, or throws.
   *
   * Injected so a test can produce a read failure without depending on the
   * host's permission model — `chmod 000` does nothing when the suite runs as
   * root, which is exactly the environment where a swallowed error would go
   * unnoticed. Production leaves it out and gets `readFileSync`.
   */
  readonly readTextFile?: (absolutePath: string) => string;
}

/** What a single probe concluded about one candidate path. */
type Probe =
  | { readonly kind: "absent" }
  | { readonly kind: "present"; readonly bytes: number }
  | { readonly kind: "unreadable"; readonly detail: string };

/** A path that is simply not there, as opposed to one that cannot be read. */
function isMissingPathError(error: unknown): boolean {
  if (!(error instanceof Error) || !("code" in error)) return false;
  const code = (error as { readonly code?: unknown }).code;
  return code === "ENOENT" || code === "ENOTDIR";
}

/** Stat one candidate, keeping "not there" and "cannot look" apart. */
function probe(candidate: InstructionCandidate): Probe {
  try {
    const info = statSync(candidate.absolutePath);
    if (!info.isFile()) {
      return { kind: "unreadable", detail: "the path exists but is not a regular file" };
    }
    return { kind: "present", bytes: info.size };
  } catch (error: unknown) {
    if (isMissingPathError(error)) return { kind: "absent" };
    return { kind: "unreadable", detail: "the file could not be examined" };
  }
}

/** Read one candidate that a probe called present. */
function readCandidate(
  candidate: InstructionCandidate,
  read: (absolutePath: string) => string
): { readonly content: string; readonly bytes: number } | null {
  try {
    const content = read(candidate.absolutePath);
    return { content, bytes: Buffer.byteLength(content, "utf8") };
  } catch {
    // A file can disappear or lose permissions between the probe and the read.
    // The caller turns this into an `unreadable` omission rather than dropping
    // it: something was there a moment ago, and the operator should hear so.
    return null;
  }
}

/**
 * Discover, read, deduplicate and budget the workspace's instruction files.
 *
 * Never throws for a file-level problem: a missing file is absent, and every
 * other trouble becomes an omission the renderer states. It DOES propagate an
 * abort, because a cancelled step should stop rather than build a snapshot from
 * a partial read.
 *
 * @param options - workspace root, AMC home, byte caps, and cancellation.
 * @returns the retained files in ascending precedence, plus what was left out.
 */
export function loadInstructionFiles(options: InstructionLoadOptions): InstructionLoad {
  const read = options.readTextFile ?? ((path: string) => readFileSync(path, "utf8"));
  const maxFileBytes = options.maxFileBytes ?? DEFAULT_MAX_INSTRUCTION_FILE_BYTES;
  const maxTotalBytes = options.maxTotalBytes ?? DEFAULT_MAX_INSTRUCTION_TOTAL_BYTES;

  const loaded: LoadedInstruction[] = [];
  const omitted: InstructionOmission[] = [];

  for (const candidate of instructionCandidates(options)) {
    options.signal?.throwIfAborted();
    const probed = probe(candidate);
    if (probed.kind === "absent") continue;
    if (probed.kind === "unreadable") {
      omitted.push({ displayPath: candidate.displayPath, reason: "unreadable", detail: probed.detail });
      continue;
    }
    if (probed.bytes > maxFileBytes) {
      omitted.push({
        displayPath: candidate.displayPath,
        reason: "oversize",
        detail: `${probed.bytes} bytes exceeds the ${maxFileBytes}-byte per-file limit`
      });
      continue;
    }
    const content = readCandidate(candidate, read);
    if (content === null) {
      omitted.push({
        displayPath: candidate.displayPath,
        reason: "unreadable",
        detail: "the file could not be read as UTF-8 text"
      });
      continue;
    }
    // Re-checked against the bytes actually read, not the bytes the probe saw:
    // a file may have grown between the two, and the cap has to hold over what
    // reaches the prompt rather than over an earlier measurement of it.
    if (content.bytes > maxFileBytes) {
      omitted.push({
        displayPath: candidate.displayPath,
        reason: "oversize",
        detail: `${content.bytes} bytes exceeds the ${maxFileBytes}-byte per-file limit`
      });
      continue;
    }
    loaded.push({ candidate, content: content.content, bytes: content.bytes });
  }

  return retain(loaded, omitted, maxTotalBytes);
}

/**
 * Collapse duplicates and apply the total budget, strongest file first.
 *
 * Both passes walk from the strongest precedence downwards, so what survives is
 * what would have won a conflict anyway. Results are returned to ascending
 * order, which is render order.
 */
function retain(
  loaded: readonly LoadedInstruction[],
  omitted: readonly InstructionOmission[],
  maxTotalBytes: number
): InstructionLoad {
  const strongestFirst = [...loaded].reverse();
  const keptByDigest = new Map<string, string>();
  const duplicates: InstructionDuplicate[] = [];
  const included: LoadedInstruction[] = [];
  const overBudget: InstructionOmission[] = [];
  let total = 0;

  for (const file of strongestFirst) {
    const digest = sha256Hex(file.content.trim());
    const kept = keptByDigest.get(digest);
    if (kept !== undefined) {
      duplicates.push({ displayPath: file.candidate.displayPath, duplicateOf: kept });
      continue;
    }
    if (total + file.bytes > maxTotalBytes) {
      overBudget.push({
        displayPath: file.candidate.displayPath,
        reason: "over-budget",
        detail: `dropped to stay within the ${maxTotalBytes}-byte workspace-instruction budget`
      });
      continue;
    }
    keptByDigest.set(digest, file.candidate.displayPath);
    total += file.bytes;
    included.push(file);
  }

  // Both groups are returned in ascending precedence, unreadable/oversize before
  // over-budget. They are concatenated rather than interleaved by precedence
  // because the two say different things — "AMC could not use this file" and
  // "AMC chose not to, to stay in budget" — and grouping keeps that legible.
  return {
    included: included.reverse(),
    omitted: [...omitted, ...overBudget.reverse()],
    duplicates: duplicates.reverse()
  };
}
