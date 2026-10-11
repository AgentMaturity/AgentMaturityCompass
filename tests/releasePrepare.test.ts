import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { dropUnlistedPageEntries, foldChangelog, prepareRelease, syncVersionText } from "../scripts/release-prepare.mjs";

const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });

const CHANGELOG = "# Changelog\n\n## 1.2.0\n\n### Minor Changes\n\n- old minor\n\n### Patch Changes\n\n- old patch\n\n## 1.1.1\n\n### Patch Changes\n\n- shipped\n";
const TGZ = "tmp/npm-release/agent-maturity-compass-2.0.0.tgz";
const NOTES = "# AMC 2.0.0\n\n<!-- release-notes:breaking -->\n<!-- /release-notes:breaking -->\n\n## Migration from 1.1.1\n\n- Do x. (`drop`)\n\n"
  + "## Other\n\n<!-- release-notes:changes -->\n<!-- /release-notes:changes -->\n";
const PAGE = (...versions: string[]) => `<main>\n  <div class="changelog-shell">\n${versions.map(v =>
  `    <article class="release-entry" aria-labelledby="release-${v.replaceAll(".", "-")}">\n      <h2>${v}</h2>\n    </article>\n\n`).join("")}  </div>\n</main>\n`;

function fixture(): string {
  const root = mkdtempSync(join(tmpdir(), "amc-release-prepare-"));
  dirs.push(root);
  for (const dir of [".changeset", "website", "docs/releases", "deploy/helm/amc", "docs"]) mkdirSync(join(root, dir), { recursive: true });
  writeFileSync(join(root, ".changeset", "README.md"), "# Changesets\n");
  writeFileSync(join(root, ".changeset", "config.json"), "{}\n");
  writeFileSync(join(root, ".changeset", "drop.md"), '---\n"agent-maturity-compass": major\n---\n\nBreaking: drop x.\n');
  writeFileSync(join(root, ".changeset", "fix.md"), '---\n"agent-maturity-compass": patch\n---\n\nFix y.\n');
  writeFileSync(join(root, "package.json"), '{\n  "name": "agent-maturity-compass",\n  "version": "1.2.0"\n}\n');
  writeFileSync(join(root, "CHANGELOG.md"), CHANGELOG);
  writeFileSync(join(root, "website", "publication-status.json"), JSON.stringify({ channels: { npm: { version: "1.1.1" } } }));
  writeFileSync(join(root, "website", "install-channel.json"),
    '{\n  "packageVersion": "1.2.0",\n  "reason": "Current 1.2.0 source features; published 1.1.1 assets."\n}\n');
  writeFileSync(join(root, "website", "changelog.html"), PAGE("1.2.0", "1.1.1"));
  writeFileSync(join(root, "deploy", "helm", "amc", "Chart.yaml"), 'version: 0.2.0\nappVersion: "1.2.0"\n');
  writeFileSync(join(root, "docs", "INSTALL.md"), "The repository is **1.2.0 source**; npm has 1.1.1.\n");
  writeFileSync(join(root, "docs", "releases", "2.0.0.md"), NOTES);
  return root;
}

/** Stands in for the external tools: `changeset version` as changesets does it, every other command recorded. */
function fakeRunner(root: string) {
  const calls: string[] = [];
  const envs: Record<string, Record<string, string> | undefined> = {};
  const run = (command: string, args: string[], env?: Record<string, string>) => {
    const call = [command.split("/").pop(), ...args].join(" ");
    calls.push(call);
    envs[call] = env;
    if (command === "npm" && args[0] === "pack") {
      mkdirSync(join(root, args[3]), { recursive: true });
      writeFileSync(join(root, args[3], "agent-maturity-compass-2.0.0.tgz"), "packed once");
    }
    if (command.endsWith("changeset") && args[0] === "version") {
      const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
      if (pkg.version !== "1.1.1") throw new Error(`changeset version ran on ${pkg.version}`);
      writeFileSync(join(root, "package.json"), readFileSync(join(root, "package.json"), "utf8").replace('"1.1.1"', '"2.0.0"'));
      const changelog = readFileSync(join(root, "CHANGELOG.md"), "utf8");
      writeFileSync(join(root, "CHANGELOG.md"), changelog.replace("# Changelog\n\n",
        "# Changelog\n\n## 2.0.0\n\n### Major Changes\n\n- abc1234: Breaking: drop x.\n\n### Patch Changes\n\n- def5678: Fix y.\n\n"));
      for (const file of readdirSync(join(root, ".changeset"))) if (file.endsWith(".md") && file !== "README.md") unlinkSync(join(root, ".changeset", file));
    }
  };
  return { calls, envs, run };
}

describe("release:prepare (P0-34)", () => {
  test("folds the unpublished 1.2.0 section into the release heading and is idempotent", () => {
    const once = foldChangelog(`# Changelog\n\n## 2.0.0\n\n### Major Changes\n\n- new major\n\n### Patch Changes\n\n- new patch\n\n${CHANGELOG.slice(13)}`, "2.0.0", "1.1.1");
    expect(once.versions).toEqual(["1.2.0"]);
    expect(once.text).toBe("# Changelog\n\n## 2.0.0\n\n### Major Changes\n\n- new major\n\n### Minor Changes\n\n- old minor\n\n"
      + "### Patch Changes\n\n- new patch\n- old patch\n\n## 1.1.1\n\n### Patch Changes\n\n- shipped\n");
    expect(foldChangelog(once.text, "2.0.0", "1.1.1")).toEqual({ text: once.text, versions: [] });
    expect(() => foldChangelog("# Changelog\n\n## 2.0.0\n\nprose\n\n## 1.1.1\n", "2.0.0", "1.1.1")).not.toThrow();
    expect(() => foldChangelog("# Changelog\n\n## 2.0.0\n\n- x\n\n## 1.2.0\n\nprose to lose\n\n## 1.1.1\n", "2.0.0", "1.1.1"))
      .toThrow(/text outside a ### group/);
  });

  test("version-coupled text follows the release; unrelated versions stay", () => {
    expect(syncVersionText("The repository is **1.2.0 source**; npm has 1.1.1 assets.", "2.0.0"))
      .toBe("The repository is **2.0.0 source**; npm has 1.1.1 assets.");
    expect(dropUnlistedPageEntries(PAGE("1.2.0", "1.1.1"), ["2.0.0", "1.1.1"])).toBe(PAGE("1.1.1"));
  });

  test("versions from the published release, regenerates notes, syncs files, then runs the checks and dry runs", () => {
    const root = fixture();
    const fake = fakeRunner(root);
    prepareRelease({ root, version: "2.0.0", run: fake.run, log: () => {} });
    expect(JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version).toBe("2.0.0");
    const changelog = readFileSync(join(root, "CHANGELOG.md"), "utf8");
    expect(changelog.match(/^## /gm)).toHaveLength(2);
    expect(changelog).toContain("- def5678: Fix y.\n- old patch\n");
    expect(readFileSync(join(root, "docs", "releases", "2.0.0.md"), "utf8")).toContain("- Drop x. (`drop`)");
    expect(readFileSync(join(root, "website", "install-channel.json"), "utf8"))
      .toBe('{\n  "packageVersion": "2.0.0",\n  "reason": "Current 2.0.0 source features; published 1.1.1 assets."\n}\n');
    expect(readFileSync(join(root, "deploy", "helm", "amc", "Chart.yaml"), "utf8")).toBe('version: 0.2.0\nappVersion: "2.0.0"\n');
    expect(readFileSync(join(root, "docs", "INSTALL.md"), "utf8")).toContain("**2.0.0 source**");
    expect(readFileSync(join(root, "website", "changelog.html"), "utf8")).not.toContain("release-1-2-0");
    const gated = ["npm pack --ignore-scripts --pack-destination tmp/npm-release", "npm run release:gate -- --json --out tmp/release-gate/prepare.json",
      `node scripts/check-pack-contents.mjs --tarball ${TGZ}`, `node scripts/packed-install-check.mjs --tarball ${TGZ}`, `npm publish ${TGZ} --dry-run`];
    expect(fake.calls).toEqual(["changeset version", "npm run build", "node dist/cli.js release sbom --out sbom.json",
      "node scripts/gen-changelog-page.mjs", "node scripts/check-release-candidate.mjs", ...gated]);
    expect(fake.envs["npm run release:gate -- --json --out tmp/release-gate/prepare.json"]).toEqual({ AMC_PACKED_INSTALL_TARBALL: TGZ });

    const again = fakeRunner(root);
    const before = readFileSync(join(root, "CHANGELOG.md"), "utf8");
    writeFileSync(join(root, "sbom.json"), JSON.stringify({ metadata: { component: { version: "2.0.0" } } }));
    prepareRelease({ root, version: "2.0.0", run: again.run, log: () => {} });
    expect(readFileSync(join(root, "CHANGELOG.md"), "utf8")).toBe(before);
    expect(again.calls).toEqual(["npm run build", "node scripts/gen-changelog-page.mjs", "node scripts/check-release-candidate.mjs", ...gated]);
  });

  test("refuses a target the pending changesets do not give, before writing anything", () => {
    const root = fixture();
    const fake = fakeRunner(root);
    expect(() => prepareRelease({ root, version: "1.3.0", run: fake.run, log: () => {} }))
      .toThrow("the pending changesets give 2.0.0 (major from the published 1.1.1), not 1.3.0");
    expect(fake.calls).toEqual([]);
    expect(JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version).toBe("1.2.0");
    expect(readFileSync(join(root, "docs", "releases", "2.0.0.md"), "utf8")).toBe(NOTES);
  });

  test("--version-only stops after the version files; notes problems stop the run before any write", () => {
    const root = fixture();
    const fake = fakeRunner(root);
    prepareRelease({ root, versionOnly: true, run: fake.run, log: () => {} });
    expect(fake.calls.at(-1)).toBe("node scripts/check-release-candidate.mjs");
    const broken = fixture();
    writeFileSync(join(broken, "docs", "releases", "2.0.0.md"), NOTES.replace("(`drop`)", ""));
    expect(() => prepareRelease({ root: broken, version: "2.0.0", run: fakeRunner(broken).run, log: () => {} }))
      .toThrow("breaking changeset `drop` is not cited in the Migration section");
    expect(existsSync(join(broken, ".changeset", "drop.md"))).toBe(true);
  });
});
