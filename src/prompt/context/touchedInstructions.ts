import { dirname, relative, resolve, sep } from "node:path";
import { isWithin } from "../../utils/pathSafety.js";
import type { TouchedInstructionPath } from "./contextTypes.js";

export const MAX_INSTRUCTION_TOUCH_PATHS = 64;
export const MAX_INSTRUCTION_DIRECTORY_DEPTH = 32;
export const MAX_INSTRUCTION_DIRECTORIES = 64;

export interface TouchedInstructionDirectory {
  /** Workspace-relative, with an empty string denoting the workspace root. */
  readonly path: string;
  readonly eventId?: string;
}

/** Build only touched ancestor chains; never walk unrelated directories. */
export function touchedInstructionDirectories(
  workspace: string,
  touches: readonly TouchedInstructionPath[] = []
): {
  readonly directories: readonly TouchedInstructionDirectory[];
  readonly limited: boolean;
  readonly excluded: boolean;
} {
  const root = resolve(workspace);
  const directories = new Map<string, TouchedInstructionDirectory>([["", { path: "" }]]);
  let limited = touches.length > MAX_INSTRUCTION_TOUCH_PATHS;
  let excluded = false;
  for (const touch of touches.slice(0, MAX_INSTRUCTION_TOUCH_PATHS)) {
    // Bound parsing work as well as filesystem work, even for authenticated tool arguments.
    if (touch.path.length > 4096) { limited = true; continue; }
    if (touch.path.includes("\0")) { excluded = true; continue; }
    const absolute = resolve(root, touch.path);
    if (!isWithin(root, absolute)) { excluded = true; continue; }
    const local = relative(root, absolute);
    if (local.split(sep).some(segment => [".git", ".amc"].includes(segment.toLowerCase()))) {
      excluded = true;
      continue;
    }
    const directory = touch.directory === true ? local : dirname(local);
    const segments = directory === "." || directory === "" ? [] : directory.split(sep);
    if (segments.length > MAX_INSTRUCTION_DIRECTORY_DEPTH) { limited = true; continue; }
    directories.set("", { path: "", eventId: touch.eventId });
    let path = "";
    for (const segment of segments) {
      path = path === "" ? segment : `${path}/${segment}`;
      if (!directories.has(path) && directories.size >= MAX_INSTRUCTION_DIRECTORIES) {
        limited = true;
        break;
      }
      directories.set(path, { path, eventId: touch.eventId });
    }
  }
  return {
    directories: [...directories.values()].sort((a, b) => {
      const depth = (a.path === "" ? 0 : a.path.split("/").length) - (b.path === "" ? 0 : b.path.split("/").length);
      return depth || (a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
    }),
    limited,
    excluded
  };
}
