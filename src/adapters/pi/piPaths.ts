/**
 * Where Pi 1.0.2 and 1.0.4 open the `path` of a path-taking built-in tool (P1-22). AMC evaluates the locations Pi
 * opens, not the string the model wrote. Pi turns Unicode spaces into spaces, strips a leading `@`, expands `~` and
 * `~/`, converts `file://` URLs and resolves the rest against its working directory (dist/utils/paths.js,
 * `resolveToCwd`); `read` then falls back to macOS name variants when the named file is missing
 * (dist/core/tools/path-utils.js, `resolveReadPathAsync`). Each location is followed through symlinks, as the OS
 * follows them, and expressed inside the workspace when it lies there, so ToolHub's path lists and its protected floor
 * see the real target. A form AMC cannot resolve as Pi does is null, and control denies it.
 */
import { lstatSync, realpathSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const UNICODE_SPACES = /[  -   　]/g;

/**
 * Pi's `resolveToCwd`. Null for `~` and `~/` (Pi expands them with its own process's HOME, which AMC's process need not
 * share), for a file URL Pi's conversion rejects, and on Windows, where Pi rewrites shell drive paths.
 */
function piResolve(path: string, cwd: string): string | null {
  if (process.platform === "win32") return null;
  let normalized = path.replace(UNICODE_SPACES, " ");
  if (normalized.startsWith("@")) normalized = normalized.slice(1);
  if (normalized === "~" || normalized.startsWith("~/")) return null;
  if (/^file:\/\//.test(normalized)) {
    try {
      normalized = fileURLToPath(normalized);
    } catch {
      return null;
    }
  }
  return isAbsolute(normalized) ? resolve(normalized) : resolve(cwd, normalized);
}

/** The names `read` tries in turn when the named file is missing: the macOS screenshot AM/PM, NFD and curly-quote variants. */
function readVariants(path: string): string[] {
  const nfd = path.normalize("NFD");
  return [path, path.replace(/ (AM|PM)\./gi, " $1."), nfd, path.replace(/'/g, "’"), nfd.replace(/'/g, "’")];
}

/**
 * The location the OS opens for an absolute `path`: every existing component followed through symlinks, with the case
 * the file system stores, and missing trailing components kept as named. Null for a dangling link or a loop.
 */
function realLocation(path: string): string | null {
  const missing: string[] = [];
  for (let head = path; ; head = dirname(head)) {
    try {
      return join(realpathSync.native(head), ...missing);
    } catch {
      try {
        lstatSync(head);
        return null;
      } catch {
        // Absent: try the parent.
      }
    }
    if (dirname(head) === head) return null;
    missing.unshift(basename(head));
  }
}

const within = (root: string, location: string): string | null => {
  const rel = relative(root, location);
  return rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel) ? null : rel;
};

/** `location` inside the workspace as the workspace names it (its `.amc` first, wherever that really lives), else as is. */
function inWorkspace(location: string, workspace: string): string {
  const realAmc = realLocation(join(resolve(workspace), ".amc"));
  const amcRel = realAmc === null ? null : within(realAmc, location);
  if (amcRel !== null) return join(resolve(workspace), ".amc", amcRel);
  const realWorkspace = realLocation(resolve(workspace));
  const rel = realWorkspace === null ? null : within(realWorkspace, location);
  return rel === null ? location : join(resolve(workspace), rel);
}

/**
 * Every location Pi may open for `path` given to built-in `toolName`, working in `cwd`, as the workspace names it: one
 * for most tools, one per name variant for `read`. Null when AMC cannot resolve one of them as Pi does.
 */
export function piPathLocations(toolName: string, path: string, cwd: string, workspace: string): string[] | null {
  const resolved = piResolve(path, cwd);
  if (resolved === null) return null;
  const locations: string[] = [];
  for (const candidate of toolName === "read" ? readVariants(resolved) : [resolved]) {
    const real = realLocation(candidate);
    if (real === null) return null;
    const named = inWorkspace(real, workspace);
    if (!locations.includes(named)) locations.push(named);
  }
  return locations;
}

/** Pi resolves relative paths, and runs bash, in its working directory; AMC evaluates only a Pi working in the workspace. */
export function piCwdRefusal(cwd: string, workspace: string): string | null {
  const real = isAbsolute(cwd) ? realLocation(cwd) : null;
  return real !== null && real === realLocation(resolve(workspace)) ? null
    : "Pi's working directory is not this AMC workspace, so AMC cannot resolve its paths as Pi does; control denies the call.";
}
