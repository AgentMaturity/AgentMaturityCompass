import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

/**
 * The published tarball must be installable by npm.
 *
 * Phase 1.4 added `"@amc/core": "workspace:*"` to runtime dependencies. npm has
 * no `workspace:` protocol outside a workspace root, so `npm install
 * agent-maturity-compass-1.2.0.tgz` failed with EUNSUPPORTEDPROTOCOL — every
 * persona in the release gate's install QA got "install did not expose amc".
 * The package built, tested, and packed cleanly; it simply could not be
 * installed by anyone.
 *
 * Workspace packages belong in devDependencies, which consumers never resolve.
 */
const manifest = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")) as {
  dependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

describe("published manifest is installable by npm", () => {
  for (const field of ["dependencies", "optionalDependencies", "peerDependencies"] as const) {
    test(`${field} carry no protocol npm cannot resolve`, () => {
      const offenders = Object.entries(manifest[field] ?? {}).filter(([, spec]) =>
        /^(workspace|catalog|link):/.test(spec)
      );
      expect(offenders, `npm install of the tarball fails on: ${JSON.stringify(offenders)}`).toEqual([]);
    });
  }

  test("the composition kernel stays a dev dependency", () => {
    // It is private and re-exports the vendored Cordis tree, so it cannot be
    // published; composition inspection uses the bundled runtime seam instead.
    expect(manifest.dependencies?.["@amc/core"]).toBeUndefined();
    expect(manifest.devDependencies?.["@amc/core"]).toBeDefined();
  });
});
