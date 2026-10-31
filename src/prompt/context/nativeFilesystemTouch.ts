import { realpathSync } from "node:fs";
import { posix, relative, resolve, sep } from "node:path";
import type { RecordedToolCall, ToolOutcome } from "../../tools/toolTypes.js";
import { isWithin, physicalPathWithMissingSuffix } from "../../utils/pathSafety.js";

export interface NativeFilesystemTouch {
  readonly version: 1;
  readonly path: string;
  readonly directory: true;
  readonly toolToken: string;
  readonly parentToken: string | null;
}

const FILESYSTEM_TOOLS: ReadonlySet<string> = new Set(["fs.read", "fs.write", "fs.edit", "glob", "grep"]);
const MAX_PATH_BYTES = 4_096;

/**
 * A bounded directory observation from a successful filesystem call, without its filename or arbitrary argument content.
 * Canonical confinement is checked at observation time, including missing write
 * suffixes. This is neither inode-at-effect proof nor a new execution grant.
 * Existing execution policy remains responsible for admitting the actual call.
 */
export function nativeFilesystemTouch(execution: RecordedToolCall, outcome: ToolOutcome): NativeFilesystemTouch | undefined {
  if (!outcome.ok || outcome.denied !== null || execution.effectiveMode !== "EXECUTE" || !FILESYSTEM_TOOLS.has(execution.name)) return undefined;
  const directory = execution.name === "glob" || execution.name === "grep";
  const raw = execution.arguments.path === undefined && directory ? "." : execution.arguments.path;
  if (typeof raw !== "string" || raw.length === 0 || raw.includes("\0")) return undefined;
  const path = normalizeInstructionTouchPath(execution.workspace, raw);
  return path === undefined ? undefined : { version: 1, path: directory ? path : posix.dirname(path), directory: true,
    toolToken: execution.token, parentToken: execution.parentToken };
}

/** Both audit observations and fallback call arguments use the same bounded physical workspace namespace. */
export function normalizeInstructionTouchPath(workspace: string, raw: string): string | undefined {
  try {
    const root = realpathSync(workspace);
    const target = physicalPathWithMissingSuffix(resolve(root, raw));
    if (!isWithin(root, target)) return undefined;
    const path = relative(root, target).split(sep).join("/") || ".";
    if (Buffer.byteLength(path, "utf8") > MAX_PATH_BYTES
      || path.split(/[\\/]/).some(segment => [".git", ".amc"].includes(segment.toLowerCase()))) return undefined;
    return path;
  } catch {
    // Status evidence must not expose host paths or filesystem diagnostics.
    return undefined;
  }
}
