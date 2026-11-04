import { statSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";

/**
 * The paths no tool policy may reach, declared.
 *
 * This used to be an unnamed branch at the top of `pathAllowedByPatterns`:
 * correct, unconditional, and completely invisible. An operator reading their
 * signed `tools.yaml` could not tell it existed, which meant they could not
 * audit it, could not explain it to a regulator, and would reasonably assume
 * the deny globs in front of them were the whole policy.
 *
 * It is now a named policy with a reason attached to each entry, exported so
 * it can be printed, tested and cited.
 *
 * WHAT DECLARED DOES NOT MEAN HERE. It does not mean editable. These paths
 * hold the vault, the signing keys and the signed policies themselves — the
 * material every other guarantee in AMC rests on. A tool that could reach them
 * could rewrite the allowlist that governs it and re-sign it with the key it
 * just read, so a removable protection would be a protection that removes
 * itself under exactly the attack it exists to stop.
 *
 * So this is a FLOOR. The shipped `tools.yaml` names these globs too, which is
 * what makes them visible to someone reading their configuration; deleting
 * them from a signed config changes nothing, and a test asserts precisely
 * that. The config entry is documentation of the floor, never the floor.
 */

export interface ProtectedPath {
  /** Workspace-relative glob, as it appears in the shipped config. */
  readonly glob: string;
  /** Why this is protected, in words an operator can act on. */
  readonly reason: string;
}

export const PROTECTED_WORKSPACE_PATHS: readonly ProtectedPath[] = Object.freeze([
  Object.freeze({
    glob: "**/.amc/**",
    reason:
      "holds the vault, the signing keys, and every signed policy — a tool that could read it " +
      "could re-sign the allowlist governing it"
  }),
  Object.freeze({
    glob: ".amc/**",
    reason: "the same directory named from the workspace root, which a relative glob reaches differently"
  })
]);

/** The globs alone, for embedding in a config file's deny list. */
export function protectedPathGlobs(): string[] {
  return PROTECTED_WORKSPACE_PATHS.map((entry) => entry.glob);
}

/**
 * Is this path inside the protected set?
 *
 * Decided on resolved paths rather than by matching the globs, deliberately.
 * The globs exist so a person can read the policy; the enforcement compares
 * real locations, because that is the only comparison a symlink or a `..`
 * cannot talk its way around — and the two must not be able to disagree.
 *
 * There is no separate clause for the vault FILE. An earlier version had one,
 * and it could never fire: `vaultPaths()` always places the vault at
 * `<workspace>/.amc/vault.amcvault`, so containment had already caught it. A
 * check that cannot fire is the same dead-config-reading-as-policy this whole
 * line of work exists to remove — it merely wears code instead of YAML.
 */
export function isProtectedPath(workspace: string, candidate: string): boolean {
  return protectedPathStatus(workspace, candidate) === "protected";
}

/**
 * `protected`, `clear`, or `outside`: a candidate the folded name check places
 * outside the workspace is not judged here, and is never "clear" — the caller's
 * containment check refuses it (pathAllowedByPatterns).
 */
function protectedPathStatus(workspace: string, candidate: string): "protected" | "clear" | "outside" {
  const resolved = resolve(candidate);
  // Names alias on some volumes (`.AMC`, `AMC~1`, `.amc.`), so the location is
  // decided by file identity: the protected directory itself, or any existing
  // ancestor of the candidate that is it.
  const amc = fileIdentity(resolve(join(workspace, ".amc")));
  if (amc !== null) {
    for (let current = resolved; ; current = dirname(current)) {
      if (fileIdentity(current) === amc) return "protected";
      if (dirname(current) === current) break;
    }
  }
  // The name check stays as the second lock: it holds where the directory does
  // not exist yet, and against aliases of a missing one. The path is split as
  // the filesystem splits it and folded one segment at a time, case-folded
  // (NFC) to compare the workspace prefix, since a re-cased prefix is the same
  // place on a case-insensitive volume; folding a whole path could make new
  // separators or dot segments.
  const rootSegments = resolve(workspace).split(sep), segments = resolved.split(sep);
  if (segments.length < rootSegments.length || !rootSegments.every((segment, index) => sameSegment(segment, segments[index]!))) return "outside";
  if (segments.length === rootSegments.length) return "clear";
  // The first segment inside, not a string prefix: `startsWith(amcRoot)`, which
  // this replaced, also matched `.amcx` and `.amc-backup`. This floor owns
  // `.amc` alone; `.git` is the tool layer's (fsTools).
  const first = segments[rootSegments.length]!;
  return foldName(first) !== ".git" && aliasedSegmentReason(first) !== null ? "protected" : "clear";
}

const PROTECTED_DIRECTORY_NAMES = new Set([".amc", ".git"]);

/** Case- and compatibility-folded (NFKC, so fullwidth `ａ` is `a`), for the alias test only: a case-insensitive volume opens `.amc` for `.AMC`. */
export function foldName(name: string): string {
  return name.normalize("NFKC").toLowerCase().normalize("NFKC");
}

/** Whether two path segments name the same entry on a case-insensitive volume: NFC and case only, never compatibility forms. */
function sameSegment(left: string, right: string): boolean {
  return left.normalize("NFC").toLowerCase() === right.normalize("NFC").toLowerCase();
}

/**
 * Why one path segment may name `.amc` or `.git`, or null. A second lock behind
 * the identity check, because names alias: a folded name, and the shapes
 * Windows resolves to another name, which are refused whatever they spell —
 * trailing dots or spaces (dropped), `name:stream` (the file `name`) and 8.3
 * short names (`AMC~1`).
 */
export function aliasedSegmentReason(segment: string): string | null {
  if (segment === "" || segment === "." || segment === "..") return null;
  const folded = foldName(segment);
  if (PROTECTED_DIRECTORY_NAMES.has(folded)) return `path is inside a protected directory (${segment})`;
  // A fold that makes a separator or a dot entry changes how the path splits.
  if (/[\\/]/.test(folded) || folded === "." || folded === "..") return `path segment folds to a separator or dot entry (${segment})`;
  if (/[. ]$/.test(segment) || segment.includes(":") || /~\d/.test(segment)) {
    return `path segment may alias a protected directory on some volumes (${segment})`;
  }
  return null;
}

/** `dev:ino` of an existing path, or null when nothing is there. Any other stat failure throws: unknown is not "absent". */
export function fileIdentity(path: string): string | null {
  try {
    const stat = statSync(path, { bigint: true });
    return `${stat.dev}:${stat.ino}`;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR") return null;
    throw error;
  }
}

/** Identities of the workspace's `.amc` and `.git`, those that exist. */
export function protectedDirectoryIdentities(root: string): ReadonlySet<string> {
  return new Set([...PROTECTED_DIRECTORY_NAMES].map((name) => fileIdentity(join(root, name))).filter((id): id is string => id !== null));
}

/** Why a path was refused, for a message an operator can act on. */
export function protectedPathReason(workspace: string, candidate: string): string | null {
  const status = protectedPathStatus(workspace, candidate);
  if (status === "outside") return `path is outside the workspace: ${candidate}`;
  if (status === "clear") return null;
  const entry = PROTECTED_WORKSPACE_PATHS[0];
  return `access to .amc/vault paths is always denied — ${entry?.reason ?? "protected workspace state"}`;
}
