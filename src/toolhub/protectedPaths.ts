import { isAbsolute, join, relative, resolve } from "node:path";

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
  const resolved = resolve(candidate);
  const amcRoot = resolve(join(workspace, ".amc"));
  if (resolved === amcRoot) return true;
  // `relative`, not a string prefix. `resolved.startsWith(amcRoot)` — which is
  // what this replaced — also matches `.amcx` and `.amc-backup`, refusing
  // directories nobody protected.
  const within = relative(amcRoot, resolved);
  return within !== "" && !within.startsWith("..") && !isAbsolute(within);
}

/** Why a path was refused, for a message an operator can act on. */
export function protectedPathReason(workspace: string, candidate: string): string | null {
  if (!isProtectedPath(workspace, candidate)) return null;
  const entry = PROTECTED_WORKSPACE_PATHS[0];
  return `access to .amc/vault paths is always denied — ${entry?.reason ?? "protected workspace state"}`;
}
