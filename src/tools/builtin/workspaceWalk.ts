import { closeSync, constants, fstatSync, lstatSync, openSync, readSync, readdirSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

/**
 * A bounded workspace walker (P4.3).
 *
 * Pure Node on purpose. dsh shells out to a vendored ripgrep binary
 * (`@vscode/ripgrep`); AMC publishes a CLI with eight runtime dependencies and
 * one native one, and adding a second native dependency to make a capped
 * search faster is a bad trade.
 *
 * Symlinks are never followed. Dirents filter ordinary links; canonical path
 * and descriptor checks also reject links or special files substituted between
 * the directory walk and an open. Nonblocking opens prevent a raced FIFO from
 * blocking before its descriptor can be classified.
 */

/** Directories never worth walking, and expensive to walk by accident. */
const SKIP_DIRECTORIES = new Set([".git", "node_modules", ".amc", "dist", "coverage", ".next"]);

export interface WalkLimits {
  /** Stop after this many files have been yielded. */
  readonly maxFiles: number;
  /** Files larger than this are skipped rather than read. */
  readonly maxFileBytes: number;
  /** Explicit searches may include repository-ignored files. */
  readonly includeIgnored?: boolean;
  /** Start in this workspace-relative directory; returned paths still use the workspace root. */
  readonly path?: string;
}

export interface WalkResult {
  readonly files: string[];
  /** True when the walk stopped at `maxFiles` with more left. */
  readonly truncated: boolean;
}

export interface WorkspaceFile {
  readonly bytes: Buffer;
  readonly size: number;
  /** False when the input cap or a concurrent size change prevented a full read. */
  readonly complete: boolean;
}

/** Read only a regular, non-symlink file, with the byte bound applied before reading. */
export function readWorkspaceFile(workspace: string, path: string, maxBytes: number, maxFileBytes = maxBytes): WorkspaceFile | null {
  let descriptor: number | undefined;
  try {
    const root = realpathSync(workspace);
    const full = resolve(root, path);
    const rel = relative(root, full);
    if (rel === ".." || rel.startsWith(`..${sep}`)) return null;
    if (!lstatSync(full).isFile() || realpathSync(full) !== full) return null;
    descriptor = openSync(full, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    const metadata = fstatSync(descriptor);
    if (!metadata.isFile() || realpathSync(full) !== full) return null;
    const current = statSync(full);
    if (current.dev !== metadata.dev || current.ino !== metadata.ino) return null;
    if (metadata.size > maxFileBytes) return { bytes: Buffer.alloc(0), size: metadata.size, complete: false };
    const bytes = Buffer.alloc(Math.min(metadata.size, maxBytes));
    let offset = 0;
    while (offset < bytes.length) {
      const count = readSync(descriptor, bytes, offset, bytes.length - offset, offset);
      if (count === 0) break;
      offset += count;
    }
    return {
      bytes: bytes.subarray(0, offset),
      size: metadata.size,
      complete: offset === metadata.size && fstatSync(descriptor).size === metadata.size
    };
  } catch {
    return null;
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

interface IgnoreRule {
  readonly base: string;
  readonly matcher: RegExp;
  readonly directoryOnly: boolean;
  readonly negate: boolean;
}

/** Git-style wildcards for ignore rules; ordinary glob patterns keep literal brackets. */
function ignoreToRegExp(pattern: string): RegExp | null {
  const literal = (char: string): string => char.replace(/[.+^${}()|[\]\\*?]/g, "\\$&");
  let source = "";
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index] ?? "";
    if (char === "\\") {
      const escaped = pattern[++index];
      if (escaped === undefined) return null;
      source += literal(escaped);
    } else if (char === "[") {
      let end = index + 1;
      if (pattern[end] === "!" || pattern[end] === "^") end += 1;
      if (pattern[end] === "]") end += 1;
      while (end < pattern.length && pattern[end] !== "]") {
        if (pattern[end] === "\\") end += 1;
        end += 1;
      }
      if (end === pattern.length) { source += "\\["; continue; }
      let body = pattern.slice(index + 1, end);
      if (/(^|[^\\])(?:\\\\)*\[:[a-z]+:$/i.test(body)) throw new Error("unsupported POSIX named character classes in ignore rules");
      const negated = body.startsWith("!") || body.startsWith("^");
      if (negated) body = body.slice(1);
      if (body.startsWith("]")) body = `\\]${body.slice(1)}`;
      source += `(?!/)[${negated ? "^" : ""}${body}]`;
      index = end;
    } else if (char === "*") {
      const start = index;
      while (pattern[index + 1] === "*") index += 1;
      const globstar = index > start && (start === 0 || pattern[start - 1] === "/") && (index + 1 === pattern.length || pattern[index + 1] === "/");
      if (globstar && pattern[index + 1] === "/") { source += "(?:.*/)?"; index += 1; }
      else source += globstar ? ".*" : "[^/]*";
    } else source += char === "?" ? "[^/]" : literal(char);
  }
  try { return new RegExp(`^${source}$`); } catch { return null; }
}

function ignoreRules(root: string, directory: string): IgnoreRule[] {
  const base = forMatching(relative(root, directory));
  const rules: IgnoreRule[] = [];
  // .ignore overrides .gitignore. POSIX named classes are refused explicitly.
  for (const name of [".gitignore", ".ignore"]) {
    const result = readWorkspaceFile(root, relative(root, join(directory, name)), 64_000);
    if (result === null) continue;
    if (!result.complete) throw new Error(`ignore file ${forMatching(relative(root, join(directory, name)))} exceeded 64000 bytes or changed during reading`);
    for (let pattern of result.bytes.toString("utf8").split(/\r?\n/)) {
      pattern = pattern.replace(/\\.| +$/g, token => token.startsWith("\\") ? token : "");
      if (!pattern || pattern.startsWith("#")) continue;
      const negate = pattern.startsWith("!");
      if (negate) pattern = pattern.slice(1);
      const directoryOnly = pattern.endsWith("/");
      if (directoryOnly) pattern = pattern.slice(0, -1);
      const anchored = pattern.startsWith("/");
      if (anchored) pattern = pattern.slice(1);
      if (!pattern) continue;
      const matcher = ignoreToRegExp(!anchored && !pattern.includes("/") ? `**/${pattern}` : pattern);
      if (matcher !== null) rules.push({ base, directoryOnly, negate, matcher });
    }
  }
  return rules;
}

function ignored(path: string, isDirectory: boolean, rules: readonly IgnoreRule[]): boolean {
  let result = false;
  for (const rule of rules) {
    if (rule.directoryOnly && !isDirectory) continue;
    const local = rule.base ? path.startsWith(`${rule.base}/`) ? path.slice(rule.base.length + 1) : null : path;
    if (local !== null && rule.matcher.test(local)) result = !rule.negate;
  }
  return result;
}

/** Walk workspace-relative paths, pruning ignored directories before they consume the file cap. */
export function walkWorkspace(workspace: string, limits: WalkLimits): WalkResult {
  const root = realpathSync(workspace);
  const files: string[] = [];
  const start = resolve(root, limits.path ?? ".");
  const startPath = relative(root, start);
  if (startPath === ".." || startPath.startsWith(`..${sep}`) || isAbsolute(startPath)) {
    throw new Error(`search path escapes the workspace: ${limits.path}`);
  }
  if (realpathSync(start) !== start || !statSync(start).isDirectory()) {
    throw new Error(`search path must be a workspace directory: ${limits.path}`);
  }
  // A scoped walk inherits ignore rules from each ancestor without visiting unrelated files.
  const inherited: IgnoreRule[] = [];
  let ancestor = root;
  for (const segment of startPath === "" ? [] : startPath.split(sep)) {
    if (!limits.includeIgnored) inherited.push(...ignoreRules(root, ancestor));
    ancestor = join(ancestor, segment);
    if (SKIP_DIRECTORIES.has(segment) || ignored(forMatching(relative(root, ancestor)), true, inherited)) {
      return { files, truncated: false };
    }
  }
  const queue: { dir: string; rules: readonly IgnoreRule[] }[] = [{ dir: start, rules: inherited }];

  while (queue.length > 0) {
    const next = queue.shift();
    if (next === undefined) break;
    const { dir } = next;
    let entries;
    try {
      if (realpathSync(dir) !== dir) continue;
      entries = readdirSync(dir, { withFileTypes: true });
      if (realpathSync(dir) !== dir) continue;
    } catch {
      continue;
    }
    const rules = limits.includeIgnored ? [] : [...next.rules, ...ignoreRules(root, dir)];
    for (const entry of entries) {
      const full = join(dir, entry.name);
      const path = relative(root, full);
      if (ignored(forMatching(path), entry.isDirectory(), rules)) continue;
      if (entry.isDirectory()) {
        if (!SKIP_DIRECTORIES.has(entry.name)) queue.push({ dir: full, rules });
        continue;
      }
      if (!entry.isFile()) continue;
      if (files.length >= limits.maxFiles) return { files, truncated: true };
      try {
        if (realpathSync(full) !== full || !lstatSync(full).isFile() || statSync(full).size > limits.maxFileBytes) continue;
      } catch {
        continue;
      }
      files.push(path);
    }
  }
  return { files, truncated: false };
}

/**
 * Match a path against a glob.
 *
 * Supports `*` within a segment, `**` across segments, and `?`. The pattern is
 * escaped first and the wildcards reintroduced afterwards, so a pattern
 * containing regex metacharacters matches them literally instead of being
 * silently reinterpreted as a regular expression.
 */
export function globToRegExp(pattern: string): RegExp {
  const DIRSTAR = "\u0000DIRSTAR\u0000";
  const GLOBSTAR = "\u0000GLOBSTAR\u0000";
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .split("**/").join(DIRSTAR)
    .split("**").join(GLOBSTAR)
    .split("*").join("[^/]*")
    .split("?").join("[^/]")
    .split(DIRSTAR).join("(?:.*/)?")
    .split(GLOBSTAR).join(".*");
  return new RegExp(`^${escaped}$`);
}

/** Normalise a walked path for matching on any platform. */
export function forMatching(path: string): string {
  return sep === "/" ? path : path.split(sep).join("/");
}
