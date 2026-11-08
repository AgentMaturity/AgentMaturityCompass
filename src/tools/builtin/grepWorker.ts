import { parentPort, workerData } from "node:worker_threads";
import { MAX_FILES_WALKED, scanGrep, type GrepArgs, type ScanResult } from "./grepScan.js";
import { forMatching, globToRegExp, modifiedAt, walkWorkspace } from "./workspaceWalk.js";

interface GrepWorkerInput {
  readonly kind: "grep";
  readonly workspace: string;
  readonly args: GrepArgs;
}

interface GlobWorkerInput {
  readonly kind: "glob";
  readonly workspace: string;
  readonly args: {
    readonly pattern: string;
    readonly path?: string;
    readonly includeIgnored: boolean;
    readonly sortBy: "name" | "mtime";
    readonly timeoutMs: number;
    readonly maxResults: number;
  };
}

export type SearchWorkerInput = GrepWorkerInput | GlobWorkerInput;

export type SearchResult = ScanResult;

function scanGlob({ workspace, args }: GlobWorkerInput): SearchResult {
  const matcher = globToRegExp(args.pattern);
  const walked = walkWorkspace(workspace, {
    maxFiles: MAX_FILES_WALKED,
    maxFileBytes: Number.MAX_SAFE_INTEGER,
    includeIgnored: args.includeIgnored,
    path: args.path
  });
  const matches = walked.files.filter(path => matcher.test(forMatching(path)));
  if (args.sortBy === "mtime") {
    // Newest first, as Claude Code and Gemini CLI list; ties keep the deterministic walk order.
    const times = modifiedAt(workspace, matches);
    matches.sort((a, b) => (times.get(b) ?? -1) - (times.get(a) ?? -1));
  }
  const shown = matches.slice(0, args.maxResults);
  const lines = [...shown];
  if (matches.length > shown.length) lines.push(`[amc: ${matches.length - shown.length} more matches not shown; narrow the pattern]`);
  if (walked.truncated) lines.push(`[amc: the walk stopped at ${MAX_FILES_WALKED} files; results are incomplete]`);
  if (shown.length === 0 && !walked.truncated) lines.push(`[amc: no files match ${args.pattern}]`);
  return { ok: true, output: lines.join("\n") };
}

if (parentPort !== null) {
  const input = workerData as SearchWorkerInput;
  parentPort.postMessage(input.kind === "glob" ? scanGlob(input) : scanGrep(input.workspace, input.args));
}
