import { lstatSync, realpathSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { z } from "zod";

/**
 * An id that names a directory on this machine but comes from a signed artifact (a federation manifest, a benchmark): one
 * safe path segment. Signed means authentic, not harmless, so the shape is checked before the id reaches a path (P0-52).
 */
export const safeIdSchema = z.string().regex(
  /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/,
  "must be one safe path segment of letters, digits, dot, underscore or hyphen (at most 128 characters, no leading dot)"
);

/**
 * `parts` resolved under `root`, refusing a result that is `root` itself or outside it. The second gate at the point of
 * use, behind the schemas: an id or path that reaches here unchecked still cannot leave its root.
 */
export function containedPath(root: string, label: string, ...parts: string[]): string {
  const base = resolve(root);
  const full = resolve(base, ...parts);
  const rel = relative(base, full);
  if (rel === "" || rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    throw new Error(`path escapes ${label}: ${JSON.stringify(parts.join("/"))}`);
  }
  return full;
}

/**
 * Whether `path` is `root` or lies under it, by whole path segments: a child named `..cache` is inside, `../x` is
 * not. Both are compared as given, so pass physical (realpath) forms when symlinks matter.
 */
export function isWithin(root: string, path: string): boolean {
  const rel = relative(root, path);
  return rel === "" || (!isAbsolute(rel) && rel !== ".." && !rel.startsWith(`..${sep}`));
}

/**
 * Resolve existing prefixes only; append missing names without hiding errors or dangling links.
 * This is a point-in-time view, not atomic protection against concurrent filesystem changes.
 */
export function physicalPathWithMissingSuffix(target: string): string {
  let prefix = resolve(target);
  const suffix: string[] = [];
  for (;;) {
    try {
      lstatSync(prefix);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      const parent = dirname(prefix);
      if (parent === prefix) throw error;
      suffix.unshift(basename(prefix));
      prefix = parent;
      continue;
    }
    // lstat succeeds for a dangling link; realpath then throws instead of walking past it.
    return join(realpathSync(prefix), ...suffix);
  }
}
