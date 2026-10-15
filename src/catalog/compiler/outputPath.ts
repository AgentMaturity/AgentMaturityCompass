/** Compiler output proposals must stay outside signed configs through lexical and physical aliases. */
import { lstatSync, realpathSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { assertOutsideSignedConfigTree } from "../../domains/operatingProfiles/operatingProfileEmit.js";
import { isWithin } from "../../utils/pathSafety.js";

/** Resolve existing prefixes only; append missing names without hiding errors or dangling links. */
function physicalPathWithMissingSuffix(target: string): string {
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

/** A point-in-time guard before signing/output writes, not atomic protection against concurrent filesystem changes. */
export function assertCompilerOutputOutsideSignedConfigTree(workspace: string, target: string): void {
  // Keep the original lexical boundary even when .amc is a symlink to an outside directory.
  assertOutsideSignedConfigTree(workspace, target);
  const signedRoot = physicalPathWithMissingSuffix(join(resolve(workspace), ".amc"));
  const output = physicalPathWithMissingSuffix(target);
  if (isWithin(signedRoot, output)) {
    throw new Error("Refusing compiler output in .amc/**: reserved for signed configs.");
  }
}
