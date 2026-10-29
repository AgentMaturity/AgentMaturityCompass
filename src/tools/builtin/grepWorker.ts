import { parentPort, workerData } from "node:worker_threads";
import { forMatching, globToRegExp, readWorkspaceFile, walkWorkspace } from "./workspaceWalk.js";

const MAX_FILES_WALKED = 20_000;
const MAX_FILE_BYTES = 2_000_000;
const MAX_LINE_CHARS = 400;

interface GrepWorkerInput {
  readonly kind: "grep";
  readonly workspace: string;
  readonly args: {
    readonly pattern: string;
    readonly include?: string;
    readonly includeIgnored: boolean;
    readonly caseInsensitive: boolean;
    readonly timeoutMs: number;
    readonly maxScannedBytes: number;
    readonly maxResults: number;
    readonly maxBytes: number;
  };
}

interface GlobWorkerInput {
  readonly kind: "glob";
  readonly workspace: string;
  readonly args: {
    readonly pattern: string;
    readonly includeIgnored: boolean;
    readonly timeoutMs: number;
    readonly maxResults: number;
  };
}

export type SearchWorkerInput = GrepWorkerInput | GlobWorkerInput;

export interface SearchResult {
  readonly ok: boolean;
  readonly timedOut?: boolean;
  readonly output: string;
}

function scanGlob({ workspace, args }: GlobWorkerInput): SearchResult {
  const matcher = globToRegExp(args.pattern);
  const walked = walkWorkspace(workspace, {
    maxFiles: MAX_FILES_WALKED,
    maxFileBytes: Number.MAX_SAFE_INTEGER,
    includeIgnored: args.includeIgnored
  });
  const matches = walked.files.filter(path => matcher.test(forMatching(path)));
  const shown = matches.slice(0, args.maxResults);
  const lines = [...shown];
  if (matches.length > shown.length) lines.push(`[amc: ${matches.length - shown.length} more matches not shown; narrow the pattern]`);
  if (walked.truncated) lines.push(`[amc: the walk stopped at ${MAX_FILES_WALKED} files; results are incomplete]`);
  if (shown.length === 0 && !walked.truncated) lines.push(`[amc: no files match ${args.pattern}]`);
  return { ok: true, output: lines.join("\n") };
}

/** Only the parent owns the deadline: it can terminate even a blocked RegExp.test. */
function scanWorkspace({ workspace, args }: GrepWorkerInput): SearchResult {
  let pattern: RegExp;
  try {
    pattern = new RegExp(args.pattern, args.caseInsensitive ? "i" : "");
  } catch (error: unknown) {
    return { ok: false, output: `invalid search pattern: ${error instanceof Error ? error.message : String(error)}` };
  }
  const include = args.include === undefined ? null : globToRegExp(args.include);
  const walked = walkWorkspace(workspace, {
    maxFiles: MAX_FILES_WALKED,
    maxFileBytes: MAX_FILE_BYTES,
    includeIgnored: args.includeIgnored
  });
  const lines: string[] = [];
  let emittedBytes = 0;
  let scannedBytes = 0;
  let matchCount = 0;
  let hitResultCap = false;
  let hitByteCap = false;
  let hitScanCap = false;

  for (const relativePath of walked.files) {
    if (hitResultCap || hitByteCap) break;
    if (include && !include.test(forMatching(relativePath))) continue;
    const remaining = args.maxScannedBytes - scannedBytes;
    if (remaining === 0) {
      hitScanCap = true;
      break;
    }
    const file = readWorkspaceFile(workspace, relativePath, remaining, MAX_FILE_BYTES);
    if (file === null) continue;
    scannedBytes += file.bytes.length;
    if (file.size > MAX_FILE_BYTES) continue;
    if (file.size > remaining) {
      hitScanCap = true;
      break; // Partial lines could manufacture a false end-of-line regex match.
    }
    if (!file.complete || file.bytes.subarray(0, 8_000).includes(0)) continue;
    const fileLines = file.bytes.toString("utf8").split("\n");
    for (let index = 0; index < fileLines.length; index += 1) {
      const line = fileLines[index] ?? "";
      if (!pattern.test(line)) continue;
      matchCount += 1;
      if (matchCount > args.maxResults) {
        hitResultCap = true;
        break;
      }
      const clipped = line.length > MAX_LINE_CHARS ? `${line.slice(0, MAX_LINE_CHARS)}[amc: line clipped]` : line;
      const rendered = `${relativePath}:${index + 1}:${clipped}`;
      const size = Buffer.byteLength(rendered, "utf8");
      if (emittedBytes + size > args.maxBytes) {
        hitByteCap = true;
        break;
      }
      emittedBytes += size;
      lines.push(rendered);
    }
  }
  if (hitResultCap) lines.push(`[amc: stopped at ${args.maxResults} matches; more exist — narrow the pattern]`);
  if (hitByteCap) lines.push(`[amc: stopped at ${args.maxBytes} bytes of output; more matches exist]`);
  if (hitScanCap) lines.push(`[amc: stopped at ${args.maxScannedBytes} bytes scanned; results incomplete]`);
  if (walked.truncated) lines.push(`[amc: the walk stopped at ${MAX_FILES_WALKED} files; results are incomplete]`);
  if (lines.length === 0) lines.push(`[amc: no matches for ${args.pattern}]`);
  return { ok: true, output: lines.join("\n") };
}

if (parentPort !== null) {
  const input = workerData as SearchWorkerInput;
  parentPort.postMessage(input.kind === "glob" ? scanGlob(input) : scanWorkspace(input));
}
