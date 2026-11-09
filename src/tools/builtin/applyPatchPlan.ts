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

export class HunkError extends Error {
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

const rstrip = (line: string): string => line.replace(/\s+$/, "");

/**
 * Line comparisons one hunk may spend being located, across both passes. Locating is a naive scan, (N - M) x M in
 * the worst case, run synchronously in the tool body on a model-supplied patch; the budget keeps that bounded
 * instead of letting a 1 MB file and a near-matching 1,000-line hunk block the process for seconds.
 * ponytail: a budget, not a faster search; a first-line index or rolling hash if real patches ever hit it.
 */
export const MAX_HUNK_COMPARISONS = 5_000_000;

/** Positions where `old` occurs in `lines` at or after `from`, comparing with `same`, within the shared budget. */
function positions(lines: readonly string[], old: readonly string[], from: number, same: (a: string, b: string) => boolean,
  budget: { left: number }, overBudget: () => HunkError): number[] {
  const found: number[] = [];
  for (let at = from; at + old.length <= lines.length; at++) {
    let matches = true;
    for (let index = 0; index < old.length; index++) {
      if (--budget.left < 0) throw overBudget();
      if (!same(lines[at + index]!, old[index]!)) { matches = false; break; }
    }
    if (matches) found.push(at);
  }
  return found;
}

function locate(lines: readonly string[], hunk: PatchHunk, from: number, index: number, path: string): { at: number; note: string | null } {
  const old = hunk.lines.filter((line) => line.op !== "+").map((line) => line.text);
  const label = `hunk ${index + 1}`;
  if (old.length === 0) {
    if (hunk.eof || lines.length === from) return { at: lines.length, note: null };
    throw new HunkError(`${label} of ${path} has no context or removed lines; add context, or mark it "*** End of File"`);
  }
  let start = from;
  if (hunk.contextHint !== null) {
    const hint = hunk.contextHint;
    const hints = lines.map((line, at) => (at >= from && rstrip(line) === rstrip(hint) ? at : -1)).filter((at) => at !== -1);
    if (hints.length === 0) throw new HunkError(`${label} of ${path}: its @@ context "${hint}" was not found after line ${from}`);
    if (hints.length > 1) throw new HunkError(`${label} of ${path}: its @@ context "${hint}" appears ${hints.length} times; add more context`);
    start = hints[0]!;
  }
  const accept = (candidates: number[], note: string | null): { at: number; note: string | null } | null => {
    const eligible = hunk.eof ? candidates.filter((at) => at + old.length === lines.length) : candidates;
    if (eligible.length === 1) return { at: eligible[0]!, note };
    if (eligible.length > 1) throw new HunkError(`${label} of ${path} matches ${eligible.length} places; include more context`);
    return null;
  };
  const budget = { left: MAX_HUNK_COMPARISONS };
  const overBudget = (): HunkError => new HunkError(`${label} of ${path} is too costly to locate (over ${MAX_HUNK_COMPARISONS} line comparisons); give it less context, or anchor it with an @@ context line`);
  return accept(positions(lines, old, start, (a, b) => a === b, budget, overBudget), null)
    ?? accept(positions(lines, old, start, (a, b) => rstrip(a) === rstrip(b), budget, overBudget), `${label} matched ignoring trailing whitespace`)
    ?? (() => { throw new HunkError(`${label} of ${path} does not match the file${hunk.eof ? " at its end" : ""}; read the file again and re-copy the context`); })();
}

export interface HunkPlan {
  readonly after: string;
  readonly notes: readonly string[];
  readonly removed: number;
  readonly added: number;
}

export function applyHunks(before: string, hunks: readonly PatchHunk[], path: string): HunkPlan {
  const { lines, form } = splitText(before);
  let text = [...lines];
  let cursor = 0;
  const notes: string[] = [];
  let removed = 0;
  let added = 0;
  hunks.forEach((hunk, index) => {
    const { at, note } = locate(text, hunk, cursor, index, path);
    if (note !== null) notes.push(note);
    const old = hunk.lines.filter((line) => line.op !== "+");
    // Context lines keep the file's own text (a fallback match may differ in trailing whitespace); only `+` lines are new.
    const replacement: string[] = [];
    let offset = 0;
    for (const line of hunk.lines) {
      if (line.op === "+") replacement.push(line.text);
      else if (line.op === " ") replacement.push(text[at + offset++]!);
      else offset++;
    }
    removed += hunk.lines.filter((line) => line.op === "-").length;
    added += hunk.lines.filter((line) => line.op === "+").length;
    text = [...text.slice(0, at), ...replacement, ...text.slice(at + old.length)];
    cursor = at + replacement.length;
  });
  return { after: joinText(text, form), notes, removed, added };
}
