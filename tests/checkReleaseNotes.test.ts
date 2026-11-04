import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { BANNED_RELEASE_WORDS, checkReleaseNotesFiles, findBannedWords } from "../scripts/check-release-notes.mjs";

const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });

const words = (text: string, banned?: RegExp[]) => findBannedWords(text, banned).map(hit => hit.word);

describe("release notes claim-word check (P1-41)", () => {
  test("fails on every banned word, whole-word and case-insensitive, negated or not", () => {
    expect(words("AMC is now certified.")).toEqual(["certified"]);
    expect(words("Compliant with everything.")).toEqual(["Compliant"]);
    expect(words("AMC is not compliant with anything; the truth rules ban the word itself.")).toEqual(["compliant"]);
    expect(words("10x faster verification")).toEqual(["10x"]);
    expect(words("10× better")).toEqual(["10×"]);
    expect(words("Delivery is guaranteed. Exactly once, too. Certification ready.")).toEqual(["guaranteed", "Exactly once", "Certification ready"]);
  });

  test("passes quoted removed strings inside inline code, and clean notes", () => {
    expect(words("The REPL no longer prints `Certified: Yes`.")).toEqual([]);
    expect(words("Uncertified and noncompliant are other words; 100x and v10x differ; certification alone is fine.")).toEqual([]);
    expect(words("# AMC 2.0.1\n\n## Summary\n\nFixes the gateway proxy. Evidence of conformity, not proof.\n")).toEqual([]);
  });

  test("reports file and line, and a missing file is an error, not a pass", () => {
    const root = mkdtempSync(join(tmpdir(), "amc-notes-check-"));
    dirs.push(root);
    writeFileSync(join(root, "clean.md"), "# AMC 2.0.1\n\nClean.\n");
    writeFileSync(join(root, "bad.md"), "# AMC 2.0.2\n\nLine two.\nNow guaranteed.\n");
    expect(checkReleaseNotesFiles([join(root, "clean.md")])).toEqual([]);
    expect(checkReleaseNotesFiles([join(root, "clean.md"), join(root, "bad.md"), join(root, "gone.md")])).toEqual([
      `${join(root, "bad.md")}:4: banned claim word "guaranteed": Now guaranteed.`,
      `${join(root, "gone.md")}: cannot read the release notes`
    ]);
    expect(checkReleaseNotesFiles([])).toEqual(["no release notes file given"]);
  });

  test("mutation: dropping \"compliant\" from the list lets its case through", () => {
    const withoutCompliant = BANNED_RELEASE_WORDS.filter(pattern => !pattern.source.includes("compliant"));
    expect(withoutCompliant.length).toBe(BANNED_RELEASE_WORDS.length - 1);
    expect(words("AMC is not compliant.", withoutCompliant)).toEqual([]);
    expect(words("AMC is not compliant.")).toEqual(["compliant"]);
  });
});
