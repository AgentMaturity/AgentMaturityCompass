/**
 * A bounded, line-based unified diff for the file tools (P1-36).
 *
 * In-house because the runtime keeps its dependencies few, and because the
 * bounds are the point: a diff goes into a tool result, so it must never cost
 * more than the edit it describes. Output stops at `maxOutputLines` lines and
 * MAX_OUTPUT_CHARS characters, and nothing is computed when either side has
 * more than MAX_INPUT_LINES lines.
 *
 * A line keeps its "\n", so "a" and "a\n" differ and the missing final newline
 * is reported the way `patch` expects. A "\r" stays part of its line.
 */

export interface UnifiedDiff {
  readonly text: string;
  readonly hunks: number;
  readonly truncated: boolean;
}

const MAX_INPUT_LINES = 50_000;
const MAX_OUTPUT_CHARS = 100_000;
// ponytail: past this many changed lines the middle becomes one delete-then-insert hunk: still a correct diff, just not
// minimal, and the 400-line output cap hides the difference. Linear-space Myers if minimal large diffs ever matter.
const MAX_EDIT_DISTANCE = 1_000;

interface Op {
  readonly kind: " " | "-" | "+";
  readonly line: string;
}

interface Hunk {
  /** Lines before the hunk on each side, which is also the 0-based index of its first line. */
  readonly oldStart: number;
  readonly newStart: number;
  readonly ops: readonly Op[];
}

export function unifiedDiff(
  path: string,
  before: string,
  after: string,
  opts: { readonly context?: number; readonly maxOutputLines?: number } = {}
): UnifiedDiff {
  const a = linesOf(before);
  const b = linesOf(after);
  if (a.length > MAX_INPUT_LINES || b.length > MAX_INPUT_LINES) {
    return {
      text: `[amc: diff not computed for ${path}: ${a.length} lines before, ${b.length} after; the limit is ${MAX_INPUT_LINES} per side]`,
      hunks: 0,
      truncated: true
    };
  }
  const hunks = hunksOf(editScript(a, b), opts.context ?? 3);
  if (hunks.length === 0) return { text: "", hunks: 0, truncated: false };
  const rows = [`--- a/${path}`, `+++ b/${path}`, ...hunks.flatMap(render)];
  return capped(rows, opts.maxOutputLines ?? 400, hunks.length);
}

function linesOf(text: string): string[] {
  const lines = text.split(/(?<=\n)/);
  return lines.length === 1 && lines[0] === "" ? [] : lines;
}

const op = (kind: Op["kind"]) => (line: string): Op => ({ kind, line });

/** Common head and tail are kept as context without searching them; Myers runs on the middle. */
function editScript(a: readonly string[], b: readonly string[]): Op[] {
  let head = 0;
  while (head < a.length && head < b.length && a[head] === b[head]) head++;
  let endA = a.length;
  let endB = b.length;
  while (endA > head && endB > head && a[endA - 1] === b[endB - 1]) { endA--; endB--; }
  const midA = a.slice(head, endA);
  const midB = b.slice(head, endB);
  const middle = myers(midA, midB) ?? [...midA.map(op("-")), ...midB.map(op("+"))];
  return [...a.slice(0, head).map(op(" ")), ...middle, ...a.slice(endA).map(op(" "))];
}

/** Myers' O((N+M)D) shortest edit script, or null when it needs more than MAX_EDIT_DISTANCE edits. */
function myers(a: readonly string[], b: readonly string[]): Op[] | null {
  const max = Math.min(a.length + b.length, MAX_EDIT_DISTANCE);
  const offset = max + 1;
  const v = new Int32Array(2 * max + 3);
  const trace: Int32Array[] = [];
  for (let d = 0; d <= max; d++) {
    trace.push(v.slice());
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && v[offset + k - 1]! < v[offset + k + 1]!) ? v[offset + k + 1]! : v[offset + k - 1]! + 1;
      let y = x - k;
      while (x < a.length && y < b.length && a[x] === b[y]) { x++; y++; }
      v[offset + k] = x;
      if (x >= a.length && y >= b.length) return backtrack(a, b, trace, offset);
    }
  }
  return null;
}

function backtrack(a: readonly string[], b: readonly string[], trace: readonly Int32Array[], offset: number): Op[] {
  const ops: Op[] = [];
  let x = a.length;
  let y = b.length;
  for (let d = trace.length - 1; d >= 0; d--) {
    const v = trace[d]!;
    const k = x - y;
    const prevK = k === -d || (k !== d && v[offset + k - 1]! < v[offset + k + 1]!) ? k + 1 : k - 1;
    const prevX = v[offset + prevK]!;
    const prevY = prevX - prevK;
    while (x > prevX && y > prevY) {
      x--;
      y--;
      ops.push(op(" ")(a[x]!));
    }
    if (d === 0) break;
    if (x === prevX) ops.push(op("+")(b[--y]!));
    else ops.push(op("-")(a[--x]!));
  }
  return ops.reverse();
}

/** Changes closer than two contexts apart share a hunk, as in GNU diff. */
function hunksOf(ops: readonly Op[], context: number): Hunk[] {
  const oldAt: number[] = [];
  const newAt: number[] = [];
  let seenOld = 0;
  let seenNew = 0;
  for (const { kind } of ops) {
    oldAt.push(seenOld);
    newAt.push(seenNew);
    if (kind !== "+") seenOld++;
    if (kind !== "-") seenNew++;
  }
  const changed = ops.flatMap(({ kind }, index) => (kind === " " ? [] : [index]));
  const hunks: Hunk[] = [];
  for (let first = 0; first < changed.length;) {
    let last = first;
    while (last + 1 < changed.length && changed[last + 1]! - changed[last]! - 1 <= 2 * context) last++;
    const from = Math.max(0, changed[first]! - context);
    const to = Math.min(ops.length, changed[last]! + context + 1);
    hunks.push({ oldStart: oldAt[from]!, newStart: newAt[from]!, ops: ops.slice(from, to) });
    first = last + 1;
  }
  return hunks;
}

/** GNU ranges: a one-line range has no count, and an empty one names the line before it. */
function range(start: number, count: number): string {
  if (count === 1) return `${start + 1}`;
  return `${count === 0 ? start : start + 1},${count}`;
}

function render(hunk: Hunk): string[] {
  const oldCount = hunk.ops.filter(({ kind }) => kind !== "+").length;
  const newCount = hunk.ops.filter(({ kind }) => kind !== "-").length;
  const rows = [`@@ -${range(hunk.oldStart, oldCount)} +${range(hunk.newStart, newCount)} @@`];
  for (const { kind, line } of hunk.ops) {
    if (line.endsWith("\n")) rows.push(kind + line.slice(0, -1));
    else rows.push(kind + line, "\\ No newline at end of file");
  }
  return rows;
}

function capped(rows: readonly string[], maxLines: number, hunks: number): UnifiedDiff {
  let kept = 0;
  let chars = 0;
  while (kept < rows.length && kept < maxLines && chars + rows[kept]!.length + 1 <= MAX_OUTPUT_CHARS) {
    chars += rows[kept]!.length + 1;
    kept++;
  }
  if (kept === rows.length) return { text: rows.join("\n"), hunks, truncated: false };
  return {
    text: [...rows.slice(0, kept), `[amc: diff truncated at ${kept} of ${rows.length} lines]`].join("\n"),
    hunks,
    truncated: true
  };
}
