/**
 * Which arguments carry which kind of thing.
 *
 * `validateToolRequest` used to decide what to check by matching the tool's
 * NAME — `"fs.read"`, `"http.fetch"`, `"process.spawn"`, `startsWith("git.")`.
 * That made the allowlist a policy about identifiers rather than about
 * capabilities, and it produced three separate holes before anyone noticed the
 * shape:
 *
 * - a network tool under any other name got no host check at all;
 * - a filesystem tool under any other name got no path check;
 * - a `bash` entry declaring `argvRegexDenylist` was dead config that read as
 *   policy, because argv patterns only ever reached `"process.spawn"`.
 *
 * The roles below replace that. A check runs because the tool DECLARED the
 * policy, and it runs against whichever arguments carry that kind of value —
 * so a new tool is governed by existing, or it declares nothing and is
 * governed by the allowlist's presence rule alone.
 *
 * These lists are deliberately CLOSED and short. A guessed role is worse than
 * no role: it would silently check the wrong field and report a policy as
 * satisfied. An argument carrying a path under a name not listed here is a
 * reason to add it deliberately, with the same review any policy change gets.
 */

/** Arguments naming a filesystem target the tool acts on. */
export const PATH_ARGUMENTS = ["path", "file_path", "filePath", "notebook_path"] as const;

/** Arguments naming a network destination. */
export const URL_ARGUMENTS = ["url", "uri"] as const;

/** Arguments naming an executable. */
export const BINARY_ARGUMENTS = ["binary", "executable"] as const;

/**
 * Arguments carrying command text to match deny patterns against.
 *
 * `argv` arrays and `command` strings both land here, because a deny pattern
 * cares about what the process is being asked to do, not how the caller chose
 * to spell it.
 */
export const COMMAND_ARGUMENTS = ["command", "argv", "args", "binary"] as const;

/**
 * Every non-empty string a role names, flattened. Arrays contribute each item.
 *
 * Empty strings are dropped rather than passed through. An empty path is not a
 * path: resolved against the workspace it becomes the workspace root, so a
 * caller sending `path: ""` would be answered with a glob verdict about `./`
 * instead of being told the argument is missing.
 */
export function argumentStrings(args: Record<string, unknown>, names: readonly string[]): string[] {
  const out: string[] = [];
  for (const name of names) {
    const value = args[name];
    if (typeof value === "string") {
      if (value.length > 0) out.push(value);
      continue;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === "string" && item.length > 0) out.push(item);
      }
    }
  }
  return out;
}
