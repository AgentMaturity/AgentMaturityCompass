import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { findBannedWords } from "../scripts/check-release-notes.mjs";
import { applyBlocks, bumpVersion, generateReleaseNotes, plannedVersion, readChangesets, renderBlocks, summaryOf }
  from "../scripts/release-notes.mjs";

const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });

function fixture(changesets: Record<string, [string, string]>, notes: string): string {
  const root = mkdtempSync(join(tmpdir(), "amc-release-notes-"));
  dirs.push(root);
  for (const dir of [".changeset", "website", "docs/releases"]) mkdirSync(join(root, dir), { recursive: true });
  writeFileSync(join(root, ".changeset", "README.md"), "# Changesets\n");
  for (const [slug, [level, body]] of Object.entries(changesets)) {
    writeFileSync(join(root, ".changeset", `${slug}.md`), `---\n"agent-maturity-compass": ${level}\n---\n\n${body}\n`);
  }
  writeFileSync(join(root, "website", "publication-status.json"), JSON.stringify({ channels: { npm: { version: "1.1.1" } } }));
  writeFileSync(join(root, "docs", "releases", "2.0.0.md"), notes);
  return root;
}

const NOTES = (migration: string) => `# AMC 2.0.0\n\n## Breaking changes\n\n<!-- release-notes:breaking -->\nold\n<!-- /release-notes:breaking -->\n\n`
  + `## Migration from 1.1.1\n\n${migration}\n\n## Other changes\n\n<!-- release-notes:changes -->\n<!-- /release-notes:changes -->\n`;

describe("release notes generator (P0-34)", () => {
  test("plans the version from the last published release, not from the unpublished package.json version", () => {
    expect(bumpVersion("1.1.1", "major")).toBe("2.0.0");
    expect(bumpVersion("1.1.1", "minor")).toBe("1.2.0");
    expect(bumpVersion("1.1.1", "patch")).toBe("1.1.2");
    const root = fixture({ a: ["patch", "Fix a."], b: ["major", "Breaking: drop b."] }, NOTES(""));
    expect(plannedVersion(root)).toEqual({ published: "1.1.1", level: "major", version: "2.0.0" });
    expect(readChangesets(root).map(c => c.slug)).toEqual(["a", "b"]);
  });

  test("renders breaking and other changes into the marked blocks and keeps the hand-written text", () => {
    const root = fixture({ fix: ["patch", "Fix the thing.\n\nMore detail."], feat: ["minor", "Add a thing."],
      drop: ["major", "Breaking: `amc x` no longer takes `--y`. Use `--z`."] }, NOTES("- Use `--z`. (`drop`)"));
    const { after, problems } = generateReleaseNotes(root, "2.0.0");
    expect(problems).toEqual([]);
    expect(after).toContain("- Use `--z`. (`drop`)");
    expect(after).toContain("<!-- release-notes:breaking -->\nThis release consumes 3 changesets: 1 breaking (major), 1 minor and 1 patch.\n\n"
      + "- `amc x` no longer takes `--y`. Use `--z`. (`drop`)\n<!-- /release-notes:breaking -->");
    expect(after).toContain("### New and changed behaviour\n\n- Add a thing. (`feat`)\n\n### Fixes\n\n- Fix the thing. (`fix`)\n");
    expect(after).not.toContain("\nold\n");
    expect(applyBlocks(after, renderBlocks(readChangesets(root)))).toBe(after);
  });

  test("refuses notes whose migration section misses a breaking changeset or that use a banned claim word", () => {
    const root = fixture({ drop: ["major", "Breaking: drop."], keep: ["major", "Breaking: keep."] },
      NOTES("- Handle the drop. (`drop`)\n\nAMC 2.0.0 is certified."));
    expect(generateReleaseNotes(root, "2.0.0").problems).toEqual([
      "breaking changeset `keep` is not cited in the Migration section",
      expect.stringMatching(/banned claim word "certified"/)
    ]);
  });

  test("refuses a changeset whose changelog-page line names an unknown command or a forbidden name (P0-34)", () => {
    const root = fixture({ ghost: ["patch", "`amc ghost run` is fixed.\n\nMore."], net: ["patch", "Refuses multicast addresses."],
      named: ["patch", "Mentions Multica by name."], real: ["patch", "`amc real` works."] }, NOTES(""));
    writeFileSync(join(root, "docs", "CLI_COMMAND_INVENTORY.md"), "| Command | Description | Options | Aliases |\n| `amc real` | Real | - | - |\n");
    expect(generateReleaseNotes(root, "2.0.0").problems).toEqual([
      "changeset `ghost`: the changelog page would name `amc ghost`, which docs/CLI_COMMAND_INVENTORY.md does not list",
      "changeset `named`: the changelog page would match the forbidden name /multica(?!st)/i"
    ]);
  });

  test("refuses notes without markers, and a breaking release without hand-written notes", () => {
    expect(() => applyBlocks("# no markers\n", { breaking: "", changes: "" })).toThrow(/release-notes:breaking/);
    const root = fixture({ a: ["minor", "Add a."], b: ["major", "Breaking: drop b."] }, NOTES(""));
    expect(() => generateReleaseNotes(root, "3.0.0")).toThrow(/docs\/releases\/3\.0\.0\.md is missing: a breaking release needs hand-written/);
  });

  test("P1-41: a weekly minor or patch release without notes gets train notes that pass every claim check", () => {
    const root = fixture({ a: ["minor", "Add a."], b: ["patch", "Fix b."] }, NOTES(""));
    const notes = generateReleaseNotes(root, "1.2.0");
    expect(notes.before).toBe("");
    expect(notes.problems).toEqual([]);
    expect(notes.after).toMatch(/^# AMC 1\.2\.0\n/);
    expect(notes.after).toContain("1.2.0 is a minor release from the weekly release train");
    expect(notes.after).toContain("### New and changed behaviour\n\n- Add a. (`a`)\n\n### Fixes\n\n- Fix b. (`b`)\n");
    expect(notes.after).toContain("amc release verify amc-1.2.0.amcrelease --pubkey amc-release-signing.pub");
    expect(findBannedWords(notes.after)).toEqual([]);
    expect(applyBlocks(notes.after, renderBlocks(readChangesets(root)))).toBe(notes.after);
  });

  test("summaries stop at a sentence boundary and never cut an abbreviation", () => {
    expect(summaryOf("One. Two.", 5)).toBe("One.");
    expect(summaryOf("Uses Art. 6 and e.g. this. Next", 10)).toBe("Uses Art. 6 and e.g. this.");
    expect(summaryOf("Breaking: short.", 100)).toBe("Short.");
    expect(summaryOf("Breaking: `amc x` changed.", 100)).toBe("`amc x` changed.");
  });
});
