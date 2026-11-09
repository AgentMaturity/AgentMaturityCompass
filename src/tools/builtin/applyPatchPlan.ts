import type { PatchHunk } from "./applyPatchParse.js";

/**
 * Apply parsed hunks to one file's text (SH-TOOLS-01), purely.
 *
 * A hunk is located by its old lines (context and `-` lines, in order) after the previous hunk's end, so hunks apply in
 * order and never rescan inserted text. Exact match first; failing that, one fallback: trailing whitespace ignored on
 * both sides, reported in the result. Either way the match must be unique in the remaining text, as `fs.edit`
 * requires, because applying an edit at the first of several candidates is a guess. No leading-whitespace fallback:
 * in Python and YAML indentation is meaning.
 *
 * The file's form is preserved: its line ending (`\r\n` when every line ends so), a UTF-8 BOM, and whether it ends
 * with a newline. Matching and replacement run on normalised lines; the form is re-applied on join.
 */

export interface TextForm {
  readonly eol: "\n" | "\r\n";
  readonly bom: boolean;
  readonly finalNewline: boolean;
}

class HunkError extends Error {
  override readonly name = "HunkError";
}

export function splitText(text: string): { readonly lines: string[]; readonly form: TextForm } {
  const bom = text.startsWith("﻿");
  const body = bom ? text.slice(1) : text;
  const crlf = body.includes("\r\n") && !/(^|[^\r])\n/.test(body);
  const normalised = crlf ? body.replace(/\r\n/g, "\n") : body;
  const finalNewline = normalised.endsWith("\n");
  const lines = normalised.split("\n");
  if (finalNewline) lines.pop();
  if (normalised.length === 0) lines.length = 0;
  return { lines, form: { eol: crlf ? "\r\n" : "\n", bom, finalNewline: normalised.length === 0 ? true : finalNewline } };
}

export function joinText(lines: readonly string[], form: TextForm): string {
  if (lines.length === 0) return form.bom ? "﻿" : "";
  return `${form.bom ? "﻿" : ""}${lines.join(form.eol)}${form.finalNewline ? form.eol : ""}`;
}

/**
 * Work one patch may spend locating its hunks, across every section, every hunk and both passes, in units of one line
 * comparison (two lines of equal length cost one more unit per 64 characters, since only they are compared character by
 * character). A hunk's match must be proved unique, so locating it scans the rest of its file: about one unit per line
 * for real code. This runs synchronously on a model-supplied patch; the budget keeps a call to a fraction of a second
 * instead of letting many hunks over a large file, or a near-matching long hunk, block the process for minutes.
 * ponytail: a budget, not a faster search; a first-line index if honest patches ever reach it.
 */
export const MAX_LOCATE_WORK = 50_000_000;

/** The locate budget one `apply_patch` call shares across all of its sections. */
export interface LocateBudget { left: number }
export const locateBudget = (): LocateBudget => ({ left: MAX_LOCATE_WORK });

/** A file's lines, and the same lines without trailing whitespace, computed once and only when a fallback needs them. */
interface FileLines { readonly lines: readonly string[]; stripped: readonly string[] | null }
const strippedOf = (file: FileLines): readonly string[] => (file.stripped ??= file.lines.map((line) => line.trimEnd()));

/** One line comparison, charged to the budget before it runs. */
function same(a: string, b: string, budget: LocateBudget, spent: () => HunkError): boolean {
  budget.left -= a.length === b.length ? 1 + (a.length >>> 6) : 1;
  if (budget.left < 0) throw spent();
  return a === b;
}

/** Positions where `old` occurs in `lines` at or after `from`. */
function positions(lines: readonly string[], old: readonly string[], from: number, budget: LocateBudget, spent: () => HunkError): number[] {
  const found: number[] = [];
  for (let at = from; at + old.length <= lines.length; at++) {
    let index = 0;
    while (index < old.length && same(lines[at + index]!, old[index]!, budget, spent)) index++;
    if (index === old.length) found.push(at);
  }
  return found;
}

function locate(file: FileLines, hunk: PatchHunk, from: number, index: number, path: string, budget: LocateBudget): { at: number; note: string | null } {
  const { lines } = file;
  const old = hunk.lines.filter((line) => line.op !== "+").map((line) => line.text);
  const label = `hunk ${index + 1}`;
  if (old.length === 0) {
    if (hunk.eof || lines.length === from) return { at: lines.length, note: null };
    throw new HunkError(`${label} of ${path} has no context or removed lines; add context, or mark it "*** End of File"`);
  }
  const spent = (): HunkError => new HunkError(`locating ${label} of ${path} would pass this patch's budget of ${MAX_LOCATE_WORK} line comparisons; give the hunks more distinctive context or an @@ line, or split the patch`);
  let start = from;
  if (hunk.contextHint !== null) {
    const hint = hunk.contextHint.trimEnd();
    const stripped = strippedOf(file);
    const hints: number[] = [];
    for (let at = from; at < lines.length; at++) if (same(stripped[at]!, hint, budget, spent)) hints.push(at);
    if (hints.length === 0) throw new HunkError(`${label} of ${path}: its @@ context "${hunk.contextHint}" was not found after line ${from}`);
    if (hints.length > 1) throw new HunkError(`${label} of ${path}: its @@ context "${hunk.contextHint}" appears ${hints.length} times; add more context`);
    start = hints[0]!;
  }
  const accept = (candidates: number[], note: string | null): { at: number; note: string | null } | null => {
    const eligible = hunk.eof ? candidates.filter((at) => at + old.length === lines.length) : candidates;
    if (eligible.length === 1) return { at: eligible[0]!, note };
    if (eligible.length > 1) throw new HunkError(`${label} of ${path} matches ${eligible.length} places; include more context`);
    return null;
  };
  return accept(positions(lines, old, start, budget, spent), null)
    ?? accept(positions(strippedOf(file), old.map((line) => line.trimEnd()), start, budget, spent), `${label} matched ignoring trailing whitespace`)
    ?? (() => { throw new HunkError(`${label} of ${path} does not match the file${hunk.eof ? " at its end" : ""}; read the file again and re-copy the context`); })();
}

export interface HunkPlan {
  readonly after: string;
  readonly notes: readonly string[];
  readonly removed: number;
  readonly added: number;
}

/**
 * Hunks are located in the original lines, each after the previous hunk's old lines: the same places as locating each in
 * the text edited so far, because the text after the last hunk is still the original. The result is built once, never
 * copied per hunk. `budget` is shared by every section of one call.
 */
export function applyHunks(before: string, hunks: readonly PatchHunk[], path: string, budget: LocateBudget = locateBudget()): HunkPlan {
  const { lines, form } = splitText(before);
  const file: FileLines = { lines, stripped: null };
  const after: string[] = [];
  let cursor = 0;
  const notes: string[] = [];
  let removed = 0;
  let added = 0;
  hunks.forEach((hunk, index) => {
    const { at, note } = locate(file, hunk, cursor, index, path, budget);
    if (note !== null) notes.push(note);
    for (let line = cursor; line < at; line++) after.push(lines[line]!);
    // Context lines keep the file's own text (a fallback match may differ in trailing whitespace); only `+` lines are new.
    let offset = 0;
    for (const line of hunk.lines) {
      if (line.op === "+") { after.push(line.text); added++; continue; }
      if (line.op === " ") after.push(lines[at + offset]!);
      else removed++;
      offset++;
    }
    cursor = at + offset;
  });
  for (let line = cursor; line < lines.length; line++) after.push(lines[line]!);
  return { after: joinText(after, form), notes, removed, added };
}
