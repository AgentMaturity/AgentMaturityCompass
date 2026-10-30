import { describe, expect, test } from "vitest";
import { checkReleaseCandidate } from "../scripts/check-release-candidate.mjs";

const changelog = (...versions: string[]) => `# Changelog\n\n${versions.map(v => `## ${v}\n\n### Major Changes\n\n- x\n`).join("\n")}`;
const clean = { version: "2.0.0", changelog: changelog("2.0.0", "1.1.1"), changesetFiles: ["README.md", "config.json"], notesExist: true };

describe("check-release-candidate (P0-34)", () => {
  test("a versioned candidate with one heading, notes and no pending changesets passes", () => {
    expect(checkReleaseCandidate(clean)).toEqual([]);
  });

  test("a pending changeset fails", () => {
    expect(checkReleaseCandidate({ ...clean, changesetFiles: [...clean.changesetFiles, "badge-no-override.md"] }))
      .toEqual(["pending changesets in .changeset/: badge-no-override.md"]);
  });

  test("the release heading appearing twice fails", () => {
    expect(checkReleaseCandidate({ ...clean, changelog: changelog("2.0.0", "2.0.0", "1.1.1") }))
      .toEqual(["CHANGELOG.md has 2 \"## 2.0.0\" headings; expected exactly one"]);
  });

  test("a top heading that differs from package.json fails", () => {
    expect(checkReleaseCandidate({ ...clean, changelog: changelog("2.0.1", "2.0.0") }))
      .toEqual(["CHANGELOG.md's first release heading is 2.0.1, package.json is 2.0.0"]);
    expect(checkReleaseCandidate({ ...clean, changelog: "# Changelog\n" }))
      .toContain("CHANGELOG.md's first release heading is (none), package.json is 2.0.0");
  });

  test("missing release notes fail", () => {
    expect(checkReleaseCandidate({ ...clean, notesExist: false })).toEqual(["docs/releases/2.0.0.md is missing"]);
  });
});
