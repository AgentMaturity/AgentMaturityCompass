import { forMatching, globToRegExp, readWorkspaceFile, walkWorkspace } from "./workspaceWalk.js";

/**
 * The grep scan (SH-TOOLS-04), run inside the search worker: ripgrep's everyday options over the JavaScript engine,
 * with every cap named in the output. Only the parent owns the deadline: it can terminate even a blocked RegExp.test.
 *
 * Paging: `offset` matches are skipped without being rendered, then up to `maxResults` are returned; the notice names
 * the next offset. A page past the end says so and how many matches there were. The scan caps (`maxScannedBytes`,
 * the walk's file cap, the deadline) bound the skipped matches too, so a page cannot be claimed complete when the
 * scan was not.
 */

export const MAX_FILES_WALKED = 20_000;
export const MAX_FILE_BYTES = 2_000_000;
const MAX_LINE_CHARS = 400;

export interface GrepArgs {
  readonly pattern: string;
  readonly path?: string;
  readonly include?: string;
  readonly includeIgnored: boolean;
  readonly caseInsensitive: boolean;
  readonly fixedStrings: boolean;
  readonly multiline: boolean;
  readonly context: number;
  readonly mode: "content" | "files" | "count";
  readonly offset: number;
  readonly timeoutMs: number;
  readonly maxScannedBytes: number;
  readonly maxResults: number;
  readonly maxBytes: number;
}

export interface ScanResult {
  readonly ok: boolean;
  readonly timedOut?: boolean;
  readonly output: string;
}

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function compile(args: GrepArgs): RegExp | string {
  const flags = `${args.caseInsensitive ? "i" : ""}${args.multiline ? "gs" : ""}`;
  try {
    return new RegExp(args.fixedStrings ? escapeRegExp(args.pattern) : args.pattern, flags);
  } catch (error: unknown) {
    return `invalid search pattern: ${error instanceof Error ? error.message : String(error)}`;
  }
}

/** 0-based indexes of the lines where the pattern matches, in order. */
function matchingLines(pattern: RegExp, lines: readonly string[], text: string, multiline: boolean): number[] {
  if (!multiline) return lines.flatMap((line, index) => (pattern.test(line) ? [index] : []));
  const found: number[] = [];
  let line = 0;
  let consumed = 0;
  pattern.lastIndex = 0;
  for (let match = pattern.exec(text); match !== null; match = pattern.exec(text)) {
    for (; consumed < match.index; consumed++) if (text.charCodeAt(consumed) === 10) line++;
    found.push(line);
    if (match[0].length === 0) pattern.lastIndex++;
  }
  return found;
}

const clip = (line: string): string => (line.length > MAX_LINE_CHARS ? `${line.slice(0, MAX_LINE_CHARS)}[amc: line clipped]` : line);

/** A file's rendered page lines: matches as `path:line:text`, context as `path-line-text`, `--` between groups. */
function renderFile(path: string, lines: readonly string[], hits: readonly number[], context: number, previousGroup: boolean): { rows: string[]; grouped: boolean } {
  const rows: string[] = [];
  let lastShown = -1;
  let grouped = previousGroup;
  for (const hit of hits) {
    const from = Math.max(0, hit - context, lastShown + 1);
    const to = Math.min(lines.length - 1, hit + context);
    if (context > 0 && grouped && from > lastShown + 1) rows.push("--");
    for (let index = from; index <= to; index++) {
      if (index <= lastShown) continue;
      rows.push(index === hit ? `${path}:${index + 1}:${clip(lines[index] ?? "")}` : `${path}-${index + 1}-${clip(lines[index] ?? "")}`);
      lastShown = index;
    }
    grouped = true;
  }
  return { rows, grouped };
}

export function scanGrep(workspace: string, args: GrepArgs): ScanResult {
  const pattern = compile(args);
  if (typeof pattern === "string") return { ok: false, output: pattern };
  const include = args.include === undefined ? null : globToRegExp(args.include);
  const walked = walkWorkspace(workspace, { maxFiles: MAX_FILES_WALKED, maxFileBytes: MAX_FILE_BYTES, includeIgnored: args.includeIgnored, path: args.path });
  const out: string[] = [];
  let emittedBytes = 0;
  let scannedBytes = 0;
  let skipped = 0;
  let shown = 0;
  let total = 0;
  let hitResultCap = false;
  let hitByteCap = false;
  let hitScanCap = false;
  let grouped = false;
  const emit = (rows: readonly string[]): boolean => {
    for (const row of rows) {
      const size = Buffer.byteLength(row, "utf8") + 1;
      if (emittedBytes + size > args.maxBytes) { hitByteCap = true; return false; }
      emittedBytes += size;
      out.push(row);
    }
    return true;
  };
  for (const relativePath of walked.files) {
    if (hitResultCap || hitByteCap) break;
    if (include && !include.test(forMatching(relativePath))) continue;
    const remaining = args.maxScannedBytes - scannedBytes;
    if (remaining === 0) { hitScanCap = true; break; }
    const file = readWorkspaceFile(workspace, relativePath, remaining, MAX_FILE_BYTES);
    if (file === null) continue;
    scannedBytes += file.bytes.length;
    if (file.size > MAX_FILE_BYTES) continue;
    if (file.size > remaining) { hitScanCap = true; break; } // Partial lines could manufacture a false end-of-line regex match.
    if (!file.complete || file.bytes.subarray(0, 8_000).includes(0)) continue;
    const text = file.bytes.toString("utf8");
    const lines = text.split("\n");
    const hits = matchingLines(pattern, lines, text, args.multiline);
    if (hits.length === 0) continue;
    total += args.mode === "files" ? 1 : hits.length;
    if (args.mode === "count") {
      if (shown >= args.maxResults) { hitResultCap = true; break; }
      shown++;
      if (!emit([`${relativePath}:${hits.length}`])) break;
      continue;
    }
    // Paging in units of the mode: files in `files` mode, matches otherwise.
    const units = args.mode === "files" ? [hits[0]!] : hits;
    const page: number[] = [];
    for (const unit of units) {
      if (skipped < args.offset) { skipped++; continue; }
      if (shown >= args.maxResults) { hitResultCap = true; break; }
      shown++;
      page.push(unit);
    }
    if (page.length === 0) continue;
    if (args.mode === "files") { if (!emit([relativePath])) break; continue; }
    const rendered = renderFile(relativePath, lines, page, args.context, grouped);
    grouped = rendered.grouped;
    if (!emit(rendered.rows)) break;
  }
  const next = args.offset + shown;
  if (hitResultCap) out.push(`[amc: stopped at ${args.maxResults} ${args.mode === "count" ? "files" : args.mode === "files" ? "files" : "matches"}${args.offset > 0 ? ` after offset ${args.offset}` : ""}; more exist — pass offset ${next} for the next page, or narrow the pattern]`);
  if (hitByteCap) out.push(`[amc: stopped at ${args.maxBytes} bytes of output; more matches exist]`);
  if (hitScanCap) out.push(`[amc: stopped at ${args.maxScannedBytes} bytes scanned; results incomplete]`);
  if (walked.truncated) out.push(`[amc: the walk stopped at ${MAX_FILES_WALKED} files; results are incomplete]`);
  if (args.mode === "count" && out.length > 0) out.push(`[amc: ${total} matches in ${shown} files${hitScanCap || walked.truncated ? " (scan incomplete)" : ""}]`);
  if (shown === 0 && args.offset > 0 && !hitScanCap && !walked.truncated && !hitByteCap) {
    out.push(`[amc: no entries at offset ${args.offset}; ${total} ${args.mode === "files" ? "files" : "matches"} in total]`);
  }
  if (out.length === 0) out.push(`[amc: no matches for ${args.pattern}]`);
  return { ok: true, output: out.join("\n") };
}
