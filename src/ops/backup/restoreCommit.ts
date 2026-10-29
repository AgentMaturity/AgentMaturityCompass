import { lstatSync, mkdtempSync, readdirSync, renameSync } from "node:fs";
import { join } from "node:path";

/**
 * Moves the staged workspace into place. A new target is one rename. Over an existing one (--force, the same workspace),
 * each staged top-level entry replaces its namesake, which is kept in `<target>/.amc-pre-restore-*` (returned), never
 * deleted; a failed rename puts back everything already moved.
 */
export function commitRestore(stage: string, target: string, existed: boolean): string | null {
  if (!existed) {
    renameSync(stage, target);
    return null;
  }
  let aside: string | null = null;
  const moved: Array<[from: string, to: string]> = [];
  try {
    for (const name of readdirSync(stage)) {
      const live = join(target, name);
      if (lstatSync(live, { throwIfNoEntry: false }) !== undefined) {
        aside ??= mkdtempSync(join(target, ".amc-pre-restore-"));
        renameSync(live, join(aside, name));
        moved.push([join(aside, name), live]);
      }
      renameSync(join(stage, name), live);
      moved.push([live, join(stage, name)]);
    }
  } catch (error) {
    try {
      for (const [from, to] of moved.reverse()) renameSync(from, to);
    } catch (rollback) {
      throw new Error(`restore commit failed (${String(error)}) and could not be rolled back (${String(rollback)}); the previous state is in ${aside ?? "place"}`);
    }
    throw error;
  }
  return aside;
}
