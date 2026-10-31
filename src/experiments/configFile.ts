import { realpathSync, statSync } from "node:fs";
import { join, resolve, sep } from "node:path";

/**
 * A configuration file an experiment may read and hand to a trial (and so to its model provider): a regular file inside
 * the workspace and outside its `.amc` authority tree (keys, vault, signed policy), resolved through symlinks.
 * Returns the real path, or null when the file is missing or not admissible.
 */
export function admissibleConfigFile(workspace: string, path: string): string | null {
  try {
    // `.native` returns the on-disk name: JS realpathSync keeps a typed `.AMC`, which a case-insensitive volume opens as `.amc`.
    const root = realpathSync.native(workspace), real = realpathSync.native(resolve(workspace, path));
    const within = (dir: string) => real.startsWith(`${dir}${sep}`);
    return within(root) && !within(join(root, ".amc")) && statSync(real).isFile() ? real : null;
  } catch {
    return null;
  }
}
