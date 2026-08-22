import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Reads a feature's release notes, wherever they currently live.
 *
 * Four feature tests asserted directly on `.changeset/<name>.md`. Versioning a
 * release consumes changesets by design — that is what `changeset version`
 * does — so those assertions made the repository unreleasable: cutting 1.2.0
 * deleted the files and failed the tests, with no way to satisfy both at once.
 *
 * The assertion's intent is "this feature is described in the release notes".
 * Before a release that text is the changeset; afterwards it is the CHANGELOG
 * entry the changeset became. This returns whichever exists, so the intent
 * holds on both sides of a release.
 */
export function releaseNotesFor(changesetName: string): string {
  const changesetPath = join(process.cwd(), ".changeset", changesetName);
  if (existsSync(changesetPath)) {
    return readFileSync(changesetPath, "utf8");
  }
  const changelog = join(process.cwd(), "CHANGELOG.md");
  if (!existsSync(changelog)) {
    throw new Error(
      `release notes for ${changesetName} not found: no .changeset entry and no CHANGELOG.md`
    );
  }
  return readFileSync(changelog, "utf8");
}
