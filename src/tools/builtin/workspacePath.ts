import { realpathSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { aliasedSegmentReason, fileIdentity, protectedDirectoryIdentities } from "../../toolhub/protectedPaths.js";

/**
 * Where a tool may touch the filesystem at all (P4.3), shared by every filesystem tool body.
 *
 * WHY THE WORKSPACE BOUND IS HERE AND NOT ONLY IN A GUARD. The signed `tools.yaml` allowlist governs the tools by path
 * glob, and that remains the policy. This is the second, cruder check that a resolved path stays inside the workspace
 * at all — because the allowlist is a per-tool configuration a deployment can widen, and escaping the workspace
 * entirely is not something any configuration should be able to express by accident.
 *
 * Directories inside the workspace that a tool must not touch: `.amc` holds the vault and the signing keys, and the
 * signed tool policy itself; `.git` holds hooks, which are arbitrary code execution at the next commit. Both are inside
 * the workspace, so containment alone permits them. Decided by file identity (`protectedDirectoryIdentities`), because
 * names alias: `.AMC` on a case-insensitive volume, `AMC~1` or `.amc.` on Windows. The folded name
 * (`aliasedSegmentReason`) is the second lock.
 */

/**
 * Resolve every symlink on the deepest existing prefix of a path.
 *
 * A file that does not exist yet still has an existing ancestor, and that ancestor is where a link would be. Walking
 * up until something resolves and re-appending the rest is what makes the check work for a write to a new file.
 */
function realPathOfNearestExisting(target: string): string {
  const trailing: string[] = [];
  let current = target;
  for (;;) {
    try {
      return trailing.length === 0 ? realpathSync.native(current) : join(realpathSync.native(current), ...trailing);
    } catch {
      const parent = dirname(current);
      if (parent === current) return target; // reached the root; nothing exists
      trailing.unshift(basename(current));
      current = parent;
    }
  }
}

/**
 * Resolve inside the workspace, or refuse.
 *
 * `..` is not filtered — it is resolved and then checked, because filtering strings is a guessing game and resolution
 * is what the filesystem does.
 *
 * And the check is made on the REAL path, not the typed one. A lexical `resolve`/`relative` pair does not follow
 * symlinks while `readFileSync` does, so `ln -s /etc/shadow ws/notes.txt` passes a textual containment test and then
 * reads the target. Containment has to be decided on the path the filesystem will actually open. Both sides are
 * realpath'd, because the workspace root is itself often a link (`/var` to `/private/var` on macOS).
 */
export function insideWorkspace(workspace: string, path: string): { readonly full: string; readonly rel: string } {
  const root = realPathOfNearestExisting(resolve(workspace));
  const requested = isAbsolute(path) ? resolve(path) : resolve(root, path);
  const real = realPathOfNearestExisting(requested);
  const rel = relative(root, real);
  if (rel.startsWith("..") || isAbsolute(rel)) {
    throw new Error(`path escapes the workspace: ${path}`);
  }
  const protectedIds = protectedDirectoryIdentities(root);
  let current = root;
  for (const segment of rel.split(/[/\\]/)) {
    current = join(current, segment);
    const alias = aliasedSegmentReason(segment);
    if (alias !== null) throw new Error(`${alias}: ${path}`);
    const id = protectedIds.size === 0 ? null : fileIdentity(current);
    if (id !== null && protectedIds.has(id)) throw new Error(`path is inside a protected directory (${segment}): ${path}`);
  }
  return { full: real, rel: rel.split(sep).join("/") };
}

/**
 * Like `insideWorkspace`, and additionally refuses a path that traverses a symlink below the workspace root, so the
 * typed path and the path the filesystem opens are the same entry. A delete or move acts on exactly the entry named,
 * never on a link's target somewhere else inside the workspace (SH-TOOLS-01, R24).
 */
export function insideWorkspaceNoLinks(workspace: string, path: string): { readonly full: string; readonly rel: string } {
  const resolved = insideWorkspace(workspace, path);
  const root = realPathOfNearestExisting(resolve(workspace));
  const lexical = isAbsolute(path) ? resolve(path) : resolve(root, path);
  if (realPathOfNearestExisting(lexical) !== resolved.full || resolve(root, resolved.rel) !== lexical) {
    throw new Error(`path traverses a symlink inside the workspace: ${path}`);
  }
  return resolved;
}
